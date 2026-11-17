# Security completion verification

Tested on 18 November 2026 on the uncommitted working tree of
`security/complete-threat-mitigations`, based on commit `15e3827`.
T05, T06 and T12 are outside this implementation scope.

## Automated verification

- Backend TypeScript check: passed.
- API security regression suite: **106 passed, 0 failed** using synthetic accounts
  and a temporary MongoDB replica set. Includes session revocation, browser-bound
  login exchange, authorization, injection, notification privacy and audit rollback.
- Ingestion checks: passed for ZIP bounds, expansion limits, unsafe entries,
  invalid PDFs, streamed download limits, allowed destinations and redirects.
- Frontend production build: passed with `npm run build -- --webpack`.
  Default Turbopack could not bind its required sandbox port in this environment.
- Frontend lint: no errors; seven warnings remain.
- Project Semgrep rules: **0 findings**, seven rules, 102 TypeScript targets,
  no scan errors. This is a targeted ruleset, not a complete security assessment.
- Git whitespace validation: passed.

## Local dynamic testing

ZAP API active testing used an isolated server on port 4301, synthetic records,
and a synthetic authenticated user. Frontend baseline testing used a local
production build on port 4300. No production deployment was scanned.

The initial API scan found a null-byte search parameter causing a database
error. Input validation and a regression test were added. The repeated API scan
has **no high, medium or low alerts**; informational client-error responses and
non-storable responses remain. Not every role or application flow is covered.

The final frontend scan retains these alerts:

- **Medium: style-src unsafe-inline.** Existing MUI styles and style attributes
  still need inline CSS. Production scripts use fresh nonces and strict-dynamic;
  the script policy does not allow unsafe-inline or unsafe-eval.
- **Low: COEP header missing.** Cross-origin isolation has not been enabled;
  third-party image/resource compatibility needs review before enabling it.
- Informational application/cache notices remain. Static assets may be cached;
  HTML responses were checked for private/no-store and fresh nonces.

Earlier missing CSP on 404 responses and missing CORP alerts were fixed and are
absent from the final frontend report. ZAP's zero exit code uses `-I` and does
not mean that warnings or residual risks do not exist.

## Evidence and limits

Reports with `completion` in their names belong to this review. Historical
`before` and `after` reports refer to the earlier hardening work.

See [THREAT-COVERAGE.md](THREAT-COVERAGE.md) for deployment requirements and
remaining work: Google browser end-to-end testing, production TLS/IAM/secrets,
consent onboarding and retention policy, adversarial AI evaluation, isolated
parser workers, job concurrency and restore testing. These checks do not certify
all OWASP ASVS requirements or every possible threat.
