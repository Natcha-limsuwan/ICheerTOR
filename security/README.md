# Security testing

How to reproduce the security evidence for the project report.
Reports land in [`reports/`](reports/).

See [THREAT-COVERAGE.md](THREAT-COVERAGE.md) for the current implementation,
excluded T05/T06/T12, residual risks and required replica-set migration.
The regression suite now uses a temporary MongoDB replica set for atomic audit
updates and includes ingestion/redirect limits as well as API attack cases.

| What | Command | Output |
|---|---|---|
| Security regression tests (106 API checks plus ingestion checks) | `cd backend && npm run test:security` | console |
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
