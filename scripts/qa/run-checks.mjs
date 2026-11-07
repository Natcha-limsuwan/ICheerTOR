/** Reproducible offline QA baseline; preserves nonzero exits for real findings. */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, "docs/qa/evidence");
mkdirSync(output, { recursive: true });
const checks = [
  ["backend-types", "backend", ["node_modules/typescript/bin/tsc", "--noEmit"]],
  ["qa-script-types", "backend", ["node_modules/typescript/bin/tsc", "--noEmit", "--esModuleInterop", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--skipLibCheck", "scripts/eval-prompt.ts", "scripts/vertex-smoke-test.ts", "scripts/qa/oauth-state.test.ts", "scripts/qa/oauth-boundary.test.ts", "scripts/qa/source-policy.test.ts", "scripts/qa/payload-privacy.test.ts", "scripts/qa/confidence-metrics.test.ts"]],
  ["frontend-types", "frontend", ["node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false"]],
  ["frontend-lint", "frontend", ["node_modules/eslint/bin/eslint.js", "."]],
  ["search-baseline", "backend", ["--import", "tsx", "scripts/test-tor-search.ts"]],
  ["pipeline-offline", "backend", ["--import", "tsx", "scripts/test-pipeline.ts", "--offline"]],
  ["extraction-offline", "backend", ["--import", "tsx", "scripts/test-extraction.ts"]],
  ["qa-regressions", "backend", ["--import", "tsx", "--test", "--test-reporter=spec", "scripts/qa/check.test.ts"]],
  ["eval-safety", "backend", ["--import", "tsx", "--test", "--test-reporter=spec", "scripts/qa/eval-safety.test.ts"]],
  ["oauth-state", "backend", ["--import", "tsx", "--test", "--test-reporter=spec", "scripts/qa/oauth-state.test.ts"]],
  ["source-enforcement", "backend", ["--import", "tsx", "--test", "--test-reporter=spec", "scripts/qa/source-policy.test.ts"]],
  ["payload-privacy", "backend", ["--import", "tsx", "--test", "--test-reporter=spec", "scripts/qa/payload-privacy.test.ts"]],
  ["confidence-metrics", "backend", ["--import", "tsx", "--test", "--test-reporter=spec", "scripts/qa/confidence-metrics.test.ts"]],
];
const results = [];
for (const [name, directory, args] of checks) {
  const result = spawnSync(process.execPath, args, {
    cwd: path.join(root, directory), encoding: "utf8", timeout: 120000,
    env: { ...process.env, TZ: "Asia/Bangkok", NO_COLOR: "1", DOTENV_CONFIG_QUIET: "true" },
  });
  const log = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `\n${result.error.message}\n` : ""}`;
  writeFileSync(path.join(output, name + ".txt"), log);
  results.push({ name, directory, command: ["node", ...args].join(" "), exitCode: result.status, signal: result.signal });
  console.log(`${result.status === 0 ? "PASS" : "FAIL"} ${name} (exit ${result.status})`);
}
const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
const sourceFiles = [];
for (const directory of ["backend/src", "backend/scripts/qa", "frontend/app", "frontend/components", "frontend/lib", "scripts/qa"]) {
  for (const file of readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true })) {
    if (file.isFile() && /\.(ts|tsx|mjs|css)$/.test(file.name)) {
      const full = path.join(file.parentPath ?? file.path, file.name);
      sourceFiles.push({ path: path.relative(root, full), sha256: createHash("sha256").update(readFileSync(full)).digest("hex") });
    }
  }
}
sourceFiles.push({ path: "backend/scripts/eval-prompt.ts", sha256: createHash("sha256").update(readFileSync(path.join(root, "backend/scripts/eval-prompt.ts"))).digest("hex") });
sourceFiles.push({ path: "backend/scripts/vertex-smoke-test.ts", sha256: createHash("sha256").update(readFileSync(path.join(root, "backend/scripts/vertex-smoke-test.ts"))).digest("hex") });
sourceFiles.sort((a, b) => a.path.localeCompare(b.path));
writeFileSync(path.join(output, "source-manifest.json"), JSON.stringify(sourceFiles, null, 2) + "\n");
writeFileSync(path.join(output, "offline-results.json"), JSON.stringify({
  baselineCommit: commit, sourceState: "working tree; see source-manifest.json for tested file hashes", node: process.version, timezone: "Asia/Bangkok", results,
}, null, 2) + "\n");
process.exitCode = results.some(result => result.exitCode !== 0) ? 1 : 0;
