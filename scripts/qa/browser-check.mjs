/** Chrome-only QA with synthetic API responses. Not a real-backend E2E test.
 * Start Next on localhost:3100 and an isolated Chrome with CDP on localhost:9223.
 * Usage: node scripts/qa/browser-check.mjs [output directory]
 * No dependency install, production calls, or personal browser profile required.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const site = "http://127.0.0.1:3100";
const output = path.resolve(process.argv[2] ?? "docs/qa/evidence");
await mkdir(output, { recursive: true });
const results = [], requests = [], pending = new Map();
let consentGranted = false;
const user = { id: "000000000000000000000001", email: "qa@example.invalid", name: "ผู้ใช้ทดสอบ QA", role: "user", status: "active" };
const records = [500000, 1000000, 2000000].map((price, index) => ({
  _id: `00000000000000000000000${index + 1}`, title: `โครงการพัฒนาเว็บไซต์ทดสอบ ${index + 1}`,
  agencyName: "หน่วยงานจำลอง QA", phase: "bidding", medianPrice: price, budget: price,
  postingDate: `2026-11-0${index + 1}T00:00:00+07:00`, submissionDeadline: "2027-01-15T12:00:00+07:00",
  sourceUrl: "https://example.invalid/source", officialPortalUrl: "https://example.invalid/bid", tags: ["website", "open"],
  extractionStatus: "completed", summary: { overview: "พัฒนาเว็บไซต์สำหรับประชาชน", keyPoints: [], deliverables: [], confidence: 0.91 },
  parsedData: {
    scopeOfWork: { content: "พัฒนาเว็บไซต์สำหรับประชาชน", confidence: 0.91 },
    medianPrice: { value: price, confidence: 0.85 },
    qualifications: [{ criterion: "มีทีมพัฒนา", type: "personnel", confidence: 0.55, isMandatory: true }],
    evaluationCriteria: { content: "ราคาและคุณภาพ", confidence: 0.75 },
  },
}));

const tab = await fetch("http://127.0.0.1:9223/json/new?about:blank", { method: "PUT" }).then(r => r.json());
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const messageId = ++id;
  const timer = setTimeout(() => { pending.delete(messageId); reject(new Error(`CDP timeout: ${method}`)); }, 45000);
  pending.set(messageId, { resolve, reject, timer });
  ws.send(JSON.stringify({ id: messageId, method, params }));
});
const browserErrors = [];
ws.onmessage = async event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.text);
  if (message.method !== "Fetch.requestPaused") return;
  const { requestId, request } = message.params;
  const url = new URL(request.url);
  try {
    if (url.pathname.startsWith("/api/")) {
      requests.push({ method: request.method, path: url.pathname, query: url.search });
      let body = { data: [] }, status = 200;
      if (url.pathname === "/api/auth/me") body = { data: user };
      else if (url.pathname === "/api/pdpa/consent") {
        if (request.method === "POST") consentGranted = JSON.parse(request.postData).granted;
        body = { data: request.method === "POST" ? { granted: consentGranted } : [{ _id: "data_processing", granted: consentGranted, noticeVersion: "2026-11-07" }] };
      }
      else if (url.pathname === "/api/notifications/prefs") body = { data: { inApp: true, email: false } };
      else if (url.pathname === "/api/notifications/unread-count") body = { data: { unreadCount: 0 } };
      else if (url.pathname === "/api/profile") { status = 404; body = { error: { message: "No vendor profile found" } }; }
      else if (url.pathname.startsWith("/api/bookmarks/tor/")) body = { data: { bookmarked: false, bookmarkId: null } };
      else if (url.pathname.endsWith("/match")) { status = 404; body = { error: { message: "No profile" } }; }
      else if (url.pathname === "/api/tor") {
        const q = url.searchParams.get("q") ?? "";
        let data = records.filter(record => (!q || record.title.includes(q) || q === "website")
          && (!url.searchParams.has("budgetMin") || record.medianPrice >= Number(url.searchParams.get("budgetMin")))
          && (!url.searchParams.has("budgetMax") || record.medianPrice <= Number(url.searchParams.get("budgetMax"))));
        body = { data, meta: { total: data.length, page: 1, limit: 20 } };
      } else if (url.pathname.startsWith("/api/tor/")) body = { data: records[0] };
      await send("Fetch.fulfillRequest", { requestId, responseCode: request.method === "OPTIONS" ? 204 : status,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Access-Control-Allow-Origin", value: site },
          { name: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" }, { name: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, PATCH, OPTIONS" }],
        body: request.method === "OPTIONS" ? "" : Buffer.from(JSON.stringify(body)).toString("base64") });
    } else if (url.origin === site) await send("Fetch.continueRequest", { requestId });
    else await send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
  } catch (error) { browserErrors.push(error.message); }
};

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + " " + (result.exceptionDetails.exception?.description ?? ""));
  return result.result.value;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(expression) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await pause(150);
  }
  throw new Error(`DOM timeout: ${expression}`);
}
function check(name, passed, evidence = "") {
  results.push({ name, status: passed ? "PASS" : "FAIL", evidence });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${evidence ? `: ${evidence}` : ""}`);
}
async function screenshot(name) {
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path.join(output, name + ".png"), Buffer.from(shot.data, "base64"));
}
async function clickText(text) {
  const done = await evaluate(`(() => { const element = [...document.querySelectorAll('button')].find(el => el.innerText.trim() === ${JSON.stringify(text)}); element?.click(); return Boolean(element); })()`);
  assert(done, `Missing button: ${text}`);
}
async function setInput(label, value) {
  await evaluate(`(() => {
    const input = [...document.querySelectorAll('input')].find(el => document.querySelector('label[for="' + el.id + '"]')?.innerText.includes(${JSON.stringify(label)}));
    if (!input) throw new Error('Missing input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

try {
  await send("Page.enable"); await send("Runtime.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "try { localStorage.setItem('icheertor_token', 'synthetic-qa-token'); } catch {}" });
  const version = await fetch("http://127.0.0.1:9223/json/version").then(r => r.json());
  for (const [width, height, name] of [[1440, 1000, "desktop"], [768, 1024, "tablet"], [390, 844, "mobile"]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: name === "mobile" });
    await send("Page.navigate", { url: site + "/procurement" });
    await waitFor("document.body.innerText.includes('พบ 3 รายการ') && document.body.innerText.includes('ผู้ใช้ทดสอบ QA')");
    await pause(300);
    const layout = await evaluate("({ width: innerWidth, content: document.documentElement.scrollWidth })");
    check(`UI-${name}: procurement has no horizontal overflow`, layout.content <= layout.width, JSON.stringify(layout));
    const mobileMenu = await evaluate("Boolean(document.querySelector('button[aria-label=\"เปิดเมนูหลัก\"]')?.checkVisibility())");
    if (mobileMenu) { await evaluate("document.querySelector('button[aria-label=\"เปิดเมนูหลัก\"]').click()"); await pause(300); }
    const nav = await evaluate("['/procurement','/alerts','/profile','/bookmarks'].filter(href => [...document.querySelectorAll('a')].some(a => a.getAttribute('href') === href && a.checkVisibility({checkVisibilityCSS: true})))");
    check(`UI-${name}: main navigation is reachable`, nav.length === 4, JSON.stringify(nav));
    if (mobileMenu) { await evaluate("document.querySelector('button[aria-label=\"ปิดเมนูหลัก\"]').click()"); await pause(300); }
    await screenshot("procurement-" + name);
    await clickText("สอนการใช้งาน");
    await waitFor("Boolean(document.querySelector('[role=dialog]'))");
    let inViewport = true;
    for (let index = 0; index < 6; index++) {
      await pause(200);
      inViewport &&= await evaluate("(() => { const r = document.querySelector('[role=dialog] .MuiPaper-root').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })()");
      if (index === 0) {
        check(`TOUR-${name}: profile is first`, await evaluate("document.querySelector('#tor-tour-title').innerText.includes('โปรไฟล์')"));
        await screenshot("tour-" + name);
      }
      if (index < 5) await clickText("ดูส่วนถัดไป");
    }
    check(`TOUR-${name}: six panels stay in viewport`, inViewport);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitFor("!document.querySelector('[role=dialog]')");
    for (const page of ["profile", "bookmarks", "alerts"]) {
      await send("Page.navigate", { url: site + "/" + page });
      await waitFor("Boolean(document.querySelector('main h1'))");
      await pause(250);
      const size = await evaluate("({ width: innerWidth, content: document.documentElement.scrollWidth })");
      check(`UI-${name}: ${page} has no horizontal overflow`, size.content <= size.width, JSON.stringify(size));
      await screenshot(page + "-" + name);
    }
    await send("Page.navigate", { url: site + "/procurement" });
    await waitFor("document.body.innerText.includes('พบ 3 รายการ')");
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await setInput("ราคาต่ำสุด", "1000000");
  await waitFor("document.body.innerText.includes('พบ 2 รายการ')");
  check("FR-A-UI-01: price minimum is sent to API", requests.some(r => r.query.includes("budgetMin=1000000")));
  await setInput("ราคาสูงสุด", "500000");
  await waitFor("document.body.innerText.includes('ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด')");
  check("FR-A-UI-02: inverted range gives inline validation", true);
  await clickText("ล้างช่วงราคา");
  await waitFor("document.body.innerText.includes('พบ 3 รายการ')");
  await setInput("Smart Search TOR", "ไม่มีโครงการนี้");
  await waitFor("document.body.innerText.includes('พบ 0 รายการ')");
  check("FR-A-UI-03: no-result state renders", true);
  await send("Page.navigate", { url: site + "/procurement/" + records[0]._id });
  await waitFor("document.body.innerText.includes('ราคาและคุณภาพ')");
  check("FR-B-UI-01: extracted content renders", true);
  check("FR-B-UI-02 / BUG-11: all extracted fields show confidence and low-confidence warning", await evaluate("(() => { const text = document.body.innerText; return ['91%', '85%', '75%', '55%', 'ความเชื่อมั่นต่ำ'].every(value => text.includes(value)); })()"));
  for (const [width, height, name] of [[1440, 1000, "desktop"], [768, 1024, "tablet"], [390, 844, "mobile"]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: name === "mobile" });
    await pause(200);
    const size = await evaluate("({ width: innerWidth, content: document.documentElement.scrollWidth })");
    check(`UI-${name}: TOR detail has no horizontal overflow`, size.content <= size.width, JSON.stringify(size));
    await screenshot("tor-detail-" + name);
  }
  await send("Page.navigate", { url: site + "/login" });
  await waitFor("document.body.innerText.includes('นโยบายความเป็นส่วนตัว')");
  const noticeLink = await evaluate("[...document.querySelectorAll('a')].find(a => a.innerText.includes('นโยบายความเป็นส่วนตัว'))?.getAttribute('href')");
  check("PD-UI-01 / BUG-12: privacy notice link is usable", Boolean(noticeLink && noticeLink !== "#"), noticeLink);
  await screenshot("login-privacy");
  await send("Page.navigate", { url: site + noticeLink });
  await waitFor("document.body.innerText.includes('นโยบายความเป็นส่วนตัว') && document.body.innerText.includes('การเก็บรักษา')");
  check("PD-UI-02: notice describes demo context and data handling", await evaluate("document.body.innerText.includes('โครงงานสาธิต')"));
  await screenshot("privacy-notice");
  await send("Page.navigate", { url: site + "/profile" });
  await waitFor("document.body.innerText.includes('ยังไม่อนุญาตให้ใช้โปรไฟล์')");
  check("PD-UI-03: saving profile requires an explicit unchecked opt-in", await evaluate("[...document.querySelectorAll('button')].find(el => el.innerText.trim() === 'บันทึกโปรไฟล์').disabled && !document.querySelector('section[aria-label=\"ความเป็นส่วนตัวและข้อมูลของคุณ\"] input[type=checkbox]').checked"));
  await evaluate("document.querySelector('section[aria-label=\"ความเป็นส่วนตัวและข้อมูลของคุณ\"] input[type=checkbox]').click()");
  await clickText("ให้ความยินยอม");
  await waitFor("document.body.innerText.includes('อนุญาตให้ใช้โปรไฟล์เพื่อประเมิน TOR แล้ว')");
  check("PD-UI-04: explicit grant enables profile save", await evaluate("![...document.querySelectorAll('button')].find(el => el.innerText.trim() === 'บันทึกโปรไฟล์').disabled"));
  await clickText("ถอนความยินยอม");
  await waitFor("document.body.innerText.includes('ยังไม่อนุญาตให้ใช้โปรไฟล์')");
  check("PD-UI-05: revoke immediately disables save", await evaluate("[...document.querySelectorAll('button')].find(el => el.innerText.trim() === 'บันทึกโปรไฟล์').disabled"));
  await screenshot("profile-consent");
  check("UI-runtime: no uncaught browser exceptions", browserErrors.length === 0, JSON.stringify(browserErrors));
  await writeFile(path.join(output, "browser-results.json"), JSON.stringify({
    browser: version.Browser, protocol: version["Protocol-Version"], site, data: "synthetic fixtures; all non-local requests intercepted",
    results, requests, browserErrors,
  }, null, 2) + "\n");
  console.log(`Browser QA: ${results.filter(r => r.status === "PASS").length} passed, ${results.filter(r => r.status === "FAIL").length} failed`);
  process.exitCode = results.some(r => r.status === "FAIL") ? 1 : 0;
} catch (error) {
  console.error(error.message);
  await screenshot("browser-run-error").catch(() => {});
  await writeFile(path.join(output, "browser-run-error.json"), JSON.stringify({
    error: error.message, results, requests, browserErrors,
    page: await evaluate("document.body.innerText").catch(() => "unavailable"),
  }, null, 2));
  process.exitCode = 1;
} finally {
  // Close only the tab created by this script, never the user's browser.
  await send("Page.close").catch(() => {});
  ws.close();
}
