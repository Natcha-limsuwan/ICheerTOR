/** Real frontend + API + scratch MongoDB. Login is seeded with a synthetic JWT,
 * not Google OAuth. Needs serve-ui.ts and Next with API URL localhost:3101/api.
 * QA_PLAYWRIGHT_PATH may point to an existing Playwright package outside repo.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium, firefox, webkit } = require(process.env.QA_PLAYWRIGHT_PATH ?? "playwright");
const { sessions, torId } = JSON.parse(await readFile("/tmp/icheertor-qa-ui-session.json", "utf8"));
const output = "docs/qa/evidence";
await mkdir(output, { recursive: true });
const results = [];
const origin = "http://127.0.0.1:3100";
for (const [name, engine, options] of [
  ["chrome", chromium, { executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" }],
  ["firefox", firefox, {}], ["webkit", webkit, {}],
]) {
  let browser;
  const checks = [];
  const pass = (label, details = "") => { checks.push({ label, status: "PASS", details }); console.log(`PASS ${name}: ${label}`); };
  try {
    browser = await engine.launch({ headless: true, ...options });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await context.addInitScript(token => localStorage.setItem("icheertor_token", token), sessions[name].token);
    // Block third-party requests from the page; API is real localhost traffic.
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
      await page.setViewportSize({ width, height });
      for (const route of ["procurement", "profile", "bookmarks", "alerts", `procurement/${torId}`]) {
        await page.goto(`${origin}/${route}`);
        await page.locator("main h1").first().waitFor();
        if (route === "procurement") await page.getByText("พบ 3 รายการ", { exact: true }).waitFor();
        if (route.startsWith("procurement/")) await page.getByText("ราคาและคุณภาพ", { exact: true }).waitFor();
        // Finish page requests before navigation to distinguish teardown
        // failures from application runtime errors.
        await page.waitForLoadState("networkidle");
        const size = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
        assert(size.content <= size.width, `${route} overflow: ${JSON.stringify(size)}`);
        pass(`${route.startsWith('procurement/') ? 'TOR detail' : route} layout ${width}px`);
      }
      await page.goto(`${origin}/procurement`);
      await page.getByText("พบ 3 รายการ", { exact: true }).waitFor();
      await page.waitForLoadState("networkidle");
      if (width === 390) {
        await page.getByRole("button", { name: "เปิดเมนูหลัก" }).click();
        for (const href of ["/procurement", "/profile", "/alerts", "/bookmarks"]) assert(await page.locator(`.MuiDrawer-root a[href='${href}']`).isVisible());
        await page.getByRole("button", { name: "ปิดเมนูหลัก" }).click();
        pass("mobile navigation");
      }
      await page.getByRole("button", { name: "สอนการใช้งาน" }).click();
      for (let i = 0; i < 6; i++) {
        const panel = page.locator("[role=dialog] .MuiPaper-root");
        await panel.waitFor(); await page.waitForTimeout(150);
        const box = await panel.boundingBox();
        assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1);
        if (i < 5) await page.getByRole("button", { name: "ดูส่วนถัดไป" }).click();
      }
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      pass(`tour all six sections ${width}px`);
      await page.screenshot({ path: `${output}/${name}-real-api-${width}.png` });
    }
    await page.getByLabel("ราคาต่ำสุด", { exact: true }).fill("1000000");
    await page.getByText("พบ 2 รายการ", { exact: true }).waitFor();
    await page.getByLabel("ราคาสูงสุด", { exact: true }).fill("1000000");
    await page.getByText("พบ 1 รายการ", { exact: true }).waitFor();
    pass("real database price boundaries through UI");
    await page.goto(`${origin}/profile`);
    await page.getByText("ยังไม่อนุญาตให้ใช้โปรไฟล์", { exact: false }).waitFor();
    const save = page.getByRole("button", { name: "บันทึกโปรไฟล์", exact: true });
    assert(await save.isDisabled());
    await page.getByRole("checkbox", { name: "ฉันยินยอมให้บันทึก", exact: false }).check();
    await page.getByRole("button", { name: "ให้ความยินยอม", exact: true }).click();
    await page.getByText("อนุญาตให้ใช้โปรไฟล์เพื่อประเมิน TOR แล้ว", { exact: true }).waitFor();
    await page.getByLabel("ชื่อบริษัท", { exact: true }).fill(`Synthetic ${name}`);
    await save.click();
    await page.getByText("บันทึกโปรไฟล์สำเร็จ", { exact: true }).waitFor();
    await page.reload();
    await page.getByLabel("ชื่อบริษัท", { exact: true }).waitFor();
    await page.waitForFunction(value => [...document.querySelectorAll("input")].some(input => input.value === value), `Synthetic ${name}`);
    pass("consent grant and profile persistence");
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "ส่งออกข้อมูลของฉัน" }).click();
    const download = await downloaded;
    const data = JSON.parse(await readFile(await download.path(), "utf8"));
    assert.equal(data.vendorProfile.companyName, `Synthetic ${name}`);
    assert.equal(data.user.email, sessions[name].email);
    pass("personal-data export through UI");
    await page.getByRole("button", { name: "ถอนความยินยอม" }).click();
    await page.getByText("ยังไม่อนุญาตให้ใช้โปรไฟล์", { exact: false }).waitFor();
    assert(await save.isDisabled());
    pass("consent revoke through UI");
    await page.getByRole("button", { name: "ลบบัญชีและข้อมูล", exact: true }).click();
    const confirm = page.getByRole("button", { name: "ยืนยันลบบัญชี", exact: true });
    assert(await confirm.isDisabled());
    await page.getByLabel("อีเมลยืนยันการลบบัญชี").fill(sessions[name].email);
    await confirm.click();
    await page.getByText("ลบบัญชีและข้อมูลที่เกี่ยวข้องแล้ว", { exact: true }).waitFor();
    const rejected = await context.request.get("http://127.0.0.1:3101/api/auth/me", { headers: { Authorization: `Bearer ${sessions[name].token}` } });
    assert.equal(rejected.status(), 401);
    pass("account deletion through UI revokes old JWT");
    assert.deepEqual(errors, []); pass("no uncaught browser exceptions");
    results.push({ engine: name, version: browser.version(), status: "PASS", checks });
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    results.push({ engine: name, version: browser?.version(), status: "FAIL", error: error.message, checks });
  } finally { await browser?.close(); }
}
await writeFile(`${output}/cross-browser-results.json`, JSON.stringify({
  frontend: origin, backend: "http://127.0.0.1:3101/api", database: "isolated random scratch DB on local QA mongod",
  auth: "synthetic signed JWT; Google OAuth provider flow not exercised", results,
  limitations: "Playwright Firefox/WebKit are bundled test engines. WebKit is not installed Safari; this does not prove latest two releases or physical devices.",
}, null, 2) + "\n");
process.exitCode = results.some(result => result.status === "FAIL") ? 1 : 0;
