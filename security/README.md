# Security testing

How to reproduce the security evidence for the project report.
Reports land in [`reports/`](reports/).

The [additional comparison tests](GAP-TEST-RESULTS.md) cover browser CORS,
clickjacking, open redirects, methods, log injection, outage, global throttling,
secret history scanning and actual local CodeQL results/triage. The current API
command runs 166 existing checks plus 22 supplementary checks and ingestion tests;
the latest Firefox suite contains 57 checks. Historical reports retain old counts.

**Never modify or attack real application data.** Source reads/copies are allowed
only under AGENTS.md's read-only restrictions. Tests use owned disposable
databases with synthetic data or sanitized copies, never a source database URI.
The scans reported here use generated synthetic records, not copied real records.

The regression command now includes 61 resilience assertions: 249 counted checks
plus ingestion tests. See [the final mapping review](FINAL-SECURITY-REVIEW.md).

For repeatable **active** frontend/API testing against disposable data, see
[the isolated ZAP runner](zap/README.md). The older runner below uses a passive
frontend baseline. Current regression tests contain 188 API checks plus ingestion
boundary tests; older reports describe their own historical test counts.
See [the additional review results](ACTIVE-ZAP-REVIEW.md) for the current active
scans, including completion evidence, authenticated browser tests and remaining limits.

See [HANDOFF-REVIEW-RESULTS.md](HANDOFF-REVIEW-RESULTS.md) for the 20 November
source review and code changes (limiter, notification dedup, review integrity,
deletion response); its new tests have not yet been executed.

See [THREAT-COVERAGE.md](THREAT-COVERAGE.md) for the current implementation,
the current T01–T25 register, residual risks and required replica-set migration.
The regression suite now uses a temporary MongoDB replica set for atomic audit
updates and includes ingestion/redirect limits as well as API attack cases.

| What | Command | Output |
|---|---|---|
| Security regression tests | `cd backend && npm run test:security` | console |
| SAST – project rules | `semgrep scan --metrics=off --config security/semgrep/icheertor-rules.yml backend/src` | `reports/semgrep-custom-{before,after}.json` |
| SAST – public rule packs | `semgrep scan --metrics=off --config p/owasp-top-ten --config p/nodejs --config p/typescript --config p/react --config p/jwt --config p/secrets backend/src frontend/app frontend/components frontend/lib` | `reports/semgrep-{before,after}.json` |
| SAST – CodeQL | runs on GitHub (`.github/workflows/security.yml`) | repo → Security → Code scanning |
| Dependency scan | `npm audit --omit=dev` in `backend/` and `frontend/` | `reports/npm-audit-*-{before,after}.json` |
| DAST – OWASP ZAP | `./security/zap/run-zap.sh` (needs Docker; see the script header) | `reports/zap-*.html` |

`before` = commit `36832a1` (main before hardening), `after` = branch `security/hardening`.

## Results so far

- **Project Semgrep rules:** 12 findings before → 0 after (JWT without algorithm
  allowlist ×2, session token in redirect URL, role/status in JWT claims,
  unescaped `$regex` from request ×3, whole request body written to DB ×2,
  client-controlled `X-Forwarded-For` ×2, exception message returned to client).
- **Public Semgrep packs:** 0 findings before and after (they do not model these
  framework-specific issues, which is why the project rules exist).
- **npm audit (production deps):** backend 5 (4 high, 1 moderate: undici,
  nodemailer) → 0; frontend 3 (1 critical: Next.js RCE advisories, 2 high) → 0.
  Fixed by `npm audit fix`, Next.js 16.3.2 → 16.4.6 and nodemailer 8 → 10.
