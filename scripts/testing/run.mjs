/** Reproducible Testing #131 runner. Owns only its child processes/scratch files. */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, readdir, cp, rm, stat, access } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, "docs/testing/evidence");
const flags = process.argv.slice(2), valid = ["--all", "--unit", "--integration", "--e2e", "--load"];
if (flags.some(flag => !valid.includes(flag))) throw new Error(`Supported flags: ${valid.join(" ")}`);
const phases = flags.includes("--all") ? ["unit", "integration", "load", "e2e"]
  : flags.length ? flags.map(flag => flag.slice(2)) : ["unit"];
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), "icheertor-testing-"));
const children = [], results = [];
let cancelled = false, failure, mongoStarted = false;
const baseEnv = { ...process.env, TZ: "Asia/Bangkok", NO_COLOR: "1", DOTENV_CONFIG_QUIET: "true", NEXT_TELEMETRY_DISABLED: "1" };
const metadataFile = path.join(output, "run-results.json");
const previous = await readFile(metadataFile, "utf8").then(JSON.parse).catch(() => ({}));
const phaseRecords = Object.fromEntries(phases.map(phase => [phase, { status: "NOT_RUN" }]));
const startedAt = new Date().toISOString();
const nextEnv = path.join(root, "frontend/next-env.d.ts");
const originalNextEnv = await readFile(nextEnv).catch(() => null);
function launch(command, args, directory, name, env = {}) {
  const log = createWriteStream(path.join(output, `${name}.txt`));
  const child = spawn(command, args, { cwd: path.join(root, directory), env: { ...baseEnv, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  child.on("error", error => { log.write(`${error.message}\n`); });
  const completion = new Promise(resolve => {
    child.once("close", (code, signal) => { log.end(); resolve({ code, signal }); });
  });
  const owned = { child, completion, name, stopped: false };
  children.push(owned); return owned;
}
async function stop(owned) {
  if (owned.stopped) return;
  owned.stopped = true;
  if (owned.child.exitCode === null && owned.child.signalCode === null) owned.child.kill("SIGTERM");
  const force = setTimeout(() => owned.child.kill("SIGKILL"), 15000); force.unref();
  await owned.completion; clearTimeout(force);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  cancelled = true; for (const owned of children) if (owned.child.exitCode === null) owned.child.kill("SIGTERM");
});
async function run(name, directory, args, env = {}, timeout = 120000) {
  if (cancelled) throw new Error("Test run interrupted");
  console.log(`RUN ${name}`);
  const started = Date.now(), owned = launch(process.execPath, args, directory, name, env);
  const timer = setTimeout(() => owned.child.kill("SIGTERM"), timeout); timer.unref();
  const result = await owned.completion; clearTimeout(timer); owned.stopped = true;
  const record = { name, command: ["node", ...args].join(" "), directory, exitCode: result.code, signal: result.signal, durationMs: Date.now() - started };
  results.push(record); console.log(`${result.code === 0 ? "PASS" : "FAIL"} ${name}`);
  if (result.code !== 0) throw new Error(`${name} failed; see docs/testing/evidence/${name}.txt`);
}
const portOpen = port => new Promise(resolve => {
  const socket = net.connect({ host: "127.0.0.1", port });
  socket.setTimeout(500); socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => { socket.destroy(); resolve(false); }); socket.once("timeout", () => { socket.destroy(); resolve(false); });
});
async function waitFor(check, name, owned, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (cancelled || owned?.child.exitCode !== null && owned?.child.exitCode !== undefined) break;
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`${name} was not ready; see its log`);
}
async function mongo() {
  if (mongoStarted) return;
  if (await portOpen(27019)) {
    if (process.env.TEST_EXTERNAL_MONGO !== "1") throw new Error("Port 27019 is already occupied; use TEST_EXTERNAL_MONGO=1 only for a known QA MongoDB. No existing process was stopped.");
    mongoStarted = true; return;
  }
  if (process.env.TEST_EXTERNAL_MONGO === "1") throw new Error("External QA MongoDB is not listening on 27019");
  let binary = process.env.MONGOD_BINARY ?? "mongod";
  if (!process.env.MONGOD_BINARY && spawnSync("which", [binary]).status !== 0) {
    const candidate = "/tmp/icheertor-qa-mongodb/bin/mongod";
    if (await access(candidate).then(() => true).catch(() => false)) binary = candidate;
  }
  const data = path.join(temporary, "mongo"); await mkdir(data);
  const owned = launch(binary, ["--dbpath", data, "--bind_ip", "127.0.0.1", "--port", "27019"], "", "mongo");
  await waitFor(() => portOpen(27019), "MongoDB", owned); mongoStarted = true;
}
async function sources(directory, result = []) {
  for (const file of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const name = path.join(directory, file.name);
    if (file.isDirectory()) await sources(name, result);
    else if (/\.(ts|tsx|mjs|css)$/.test(file.name)) result.push({ path: name, sha256: createHash("sha256").update(await readFile(path.join(root, name))).digest("hex") });
  }
  return result;
}
try {
  for (const phase of phases) {
    phaseRecords[phase] = { startedAt: new Date().toISOString(), status: "RUNNING" };
    if (phase === "unit") {
      await run("unit", "backend", ["--import", "tsx", "--test", "--test-reporter=spec", ...((await readdir(path.join(root, "backend/tests/unit"))).filter(name => name.endsWith(".test.ts")).map(name => `tests/unit/${name}`))]);
      await run("test-types", "backend", ["node_modules/typescript/bin/tsc", "--noEmit", "--esModuleInterop", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--skipLibCheck",
        "tests/unit/scraper.test.ts", "tests/unit/parser.test.ts", "tests/unit/search.test.ts", "tests/integration/search.test.ts", "scripts/testing/load.ts", "scripts/qa/serve-ui.ts"]);
      await run("frontend-typegen", "frontend", ["node_modules/next/dist/bin/next", "typegen"]);
      await run("regressions", "", ["scripts/qa/run-checks.mjs"], { QA_EVIDENCE_DIR: path.join(output, "regressions") });
    } else if (phase === "integration") {
      await mongo();
      await run("integration", "backend", ["--import", "tsx", "--test", "--test-reporter=spec", "scripts/qa/integration.test.ts", "tests/integration/search.test.ts", "scripts/qa/oauth-boundary.test.ts"]);
    } else if (phase === "load") {
      await mongo();
      await run("load", "backend", ["--import", "tsx", "scripts/testing/load.ts"], { TEST_EVIDENCE_DIR: output }, 180000);
    } else if (phase === "e2e") {
      await mongo();
      for (const port of [3100, 3101]) if (await portOpen(port)) throw new Error(`Port ${port} is occupied; existing server was left untouched`);
      const session = path.join(temporary, "sessions.json");
      const api = launch(process.execPath, ["--import", "tsx", "scripts/qa/serve-ui.ts"], "backend", "e2e-api", { QA_SESSION_FILE: session });
      await waitFor(() => access(session).then(() => true).catch(() => false), "E2E API", api);
      await run("e2e-build", "frontend", ["node_modules/next/dist/bin/next", "build", "--webpack"], { NEXT_PUBLIC_API_URL: "http://127.0.0.1:3101/api" }, 240000);
      const standaloneRoot = path.join(root, "frontend/.next/standalone");
      const nested = path.join(standaloneRoot, "frontend");
      const standalone = await access(path.join(nested, "server.js")).then(() => nested).catch(() => standaloneRoot);
      await cp(path.join(root, "frontend/.next/static"), path.join(standalone, ".next/static"), { recursive: true });
      if (await stat(path.join(root, "frontend/public")).catch(() => null)) await cp(path.join(root, "frontend/public"), path.join(standalone, "public"), { recursive: true });
      const web = launch(process.execPath, [path.join(standalone, "server.js")], "frontend", "e2e-frontend", { PORT: "3100", HOSTNAME: "127.0.0.1" });
      await waitFor(() => fetch("http://127.0.0.1:3100/privacy").then(response => response.ok).catch(() => false), "E2E frontend", web);
      try { await run("e2e", "", ["scripts/qa/cross-browser-check.mjs"], { QA_SESSION_FILE: session, QA_EVIDENCE_DIR: path.join(output, "e2e") }, 240000); }
      finally { await stop(web); await stop(api); }
    }
    phaseRecords[phase].status = "PASS";
  }
} catch (error) { failure = error.message; console.error(failure); process.exitCode = 1; }
finally {
  for (const owned of children.reverse()) await stop(owned);
  if (originalNextEnv) await writeFile(nextEnv, originalNextEnv);
  const manifest = [];
  for (const directory of ["backend/src", "backend/tests", "backend/scripts/qa", "backend/scripts/testing", "scripts/testing", "scripts/qa", "frontend/app", "frontend/components", "frontend/lib"]) await sources(directory, manifest);
  for (const file of ["package.json", "package-lock.json", "backend/package.json", ".github/workflows/ci.yml"]) {
    manifest.push({ path: file, sha256: createHash("sha256").update(await readFile(path.join(root, file))).digest("hex") });
  }
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  await writeFile(path.join(output, "source-manifest.json"), JSON.stringify(manifest.sort((a, b) => a.path.localeCompare(b.path)), null, 2) + "\n");
  const phaseHistory = { ...previous.phases };
  for (const phase of phases) phaseHistory[phase] = { ...phaseRecords[phase], status: phaseRecords[phase].status === "RUNNING" ? "FAIL" : phaseRecords[phase].status, commit: head };
  await writeFile(metadataFile, JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), node: process.version, commit: head,
    sourceState: "working tree; see source-manifest.json", requestedPhases: phases, phases: phaseHistory, commands: results,
    status: failure ? "FAIL" : "PASS", failure, cleanup: "Owned child processes stopped and temporary data directory removed; scratch DB cleanup is performed by each suite.",
    pilot: "PREPARED_NOT_RUN; no participants yet", externalServices: "Google/Vertex/SMTP/government sources not exercised", }, null, 2) + "\n");
  await rm(temporary, { recursive: true, force: true });
}
