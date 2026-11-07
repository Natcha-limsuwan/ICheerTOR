/** Verify evaluation failures never become accuracy passes or contact real DB. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const backend = fileURLToPath(new URL("../../", import.meta.url));
function run(args: string[], cache?: object) {
  const directory = mkdtempSync(path.join(tmpdir(), "icheertor-eval-qa-"));
  try {
    mkdirSync(path.join(directory, "eval/gold"), { recursive: true });
    writeFileSync(path.join(directory, "eval/gold/123.json"), JSON.stringify({ projectNumber: "123", qualifications: [], riskClauses: [] }));
    if (cache) {
      mkdirSync(path.join(directory, "eval/runs/v4"), { recursive: true });
      writeFileSync(path.join(directory, "eval/runs/v4/123.json"), JSON.stringify(cache));
    }
    const result = spawnSync(process.execPath, ["--import", path.join(backend, "node_modules/tsx/dist/loader.mjs"), path.join(backend, "scripts/eval-prompt.ts"), ...args], {
      cwd: directory, encoding: "utf8", timeout: 5000,
      env: { ...process.env, MONGODB_URI: "mongodb://127.0.0.1:1/unreachable", DOTENV_CONFIG_QUIET: "true" },
    });
    assert.equal(result.error, undefined, "must finish without waiting for MongoDB");
    assert.equal(result.status, 1);
    const report = JSON.parse(readFileSync(path.join(directory, "eval/runs/v4/_report.json"), "utf8"));
    assert.equal(report.evaluated, 0);
    assert.equal(report.failed, 1);
    return result.stdout + result.stderr;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("EVAL-01: cached mode uses active v4, skips DB and fails honestly without outputs", () => {
  assert.match(run(["--cached"]), /ยังไม่มีผลที่บันทึกไว้/);
});
test("EVAL-02: cached output from another prompt is rejected", () => {
  assert.match(run(["--cached"], { promptVersion: "v3" }), /promptVersion/);
});
test("EVAL-03: absent local archive fails without falling back to e-GP or DB", () => {
  assert.match(run(["--archive-dir=local-cleared-zips"]), /ENOENT/);
});
