# Additional tests from the reference-report comparison

Run on 18 November 2026, branch `security/zap-active-verification`, base `f664929`,
including the working-tree changes. No real application records were copied,
queried or modified. No configured database or live provider credential was used.

## Completed tests

Additional synthetic service, AI document, worker-crash, load and backup/restore
tests are recorded in [RESILIENCE-TEST-RESULTS.md](RESILIENCE-TEST-RESULTS.md).
That suite adds 61 assertions and explicitly distinguishes simulated providers
from live integrations.

1. **Browser CORS:** the allowed frontend origin reads the synthetic account API
   successfully (200). A separate attacker origin in Firefox cannot read the
   same API; the browser rejects the fetch. Both controls pass.
2. **Clickjacking:** an attacker-origin iframe cannot load the profile page.
   Firefox reports `about:neterror?e=cspBlocked`; this is an observed browser
   result, not just a header check.
3. **Open redirect:** absolute, scheme-relative and lookalike-domain `next`
   values cannot send login navigation outside the fixture origin. Additional
   tests confirm that dirty-profile links using data/vbscript/mixed-case
   javascript schemes are cancelled before reaching the router.
4. **HTTP methods:** real TRACE and PROPFIND requests return 405. Added an
   explicit method allowlist to the application; normal methods remain enabled.
5. **Log injection:** embedded newlines stay escaped within one structured JSON
   log event. An HTTP User-Agent with injected-looking content cannot forge a
   security event. A raw malformed newline/header injection is rejected with 400.
6. **Database outage:** only the MongoMemoryReplSet created by that test is
   stopped. Requests then fail closed with generic 500 responses, driver/URI
   details are absent from the client response, and internal error logging occurs.
7. **Global API limit:** 300 accepted requests, request 301 returns 429 with
   Retry-After, then requests are accepted in the next configured 15-minute
   bucket. The window-boundary check advances the test process clock; it does
   not wait 15 wall-clock minutes or change the production window.
8. **Secret history scan:** Gitleaks v8.30.1 scanned 52 commits across all locally
   available Git refs, read-only with scanner networking disabled. One fully
   redacted finding is a documented example Google client secret in
   ENV_SETUP_GUIDE.md. It was classified by its example context, not tested
   against Google. No confirmed live credential was found by this scan; that
   is not a guarantee that every possible secret is detected.
9. **CodeQL:** CLI 2.27.4, javascript-queries 2.5.0, security-extended suite,
   105 queries, run locally on an env-free source snapshot. The first scan found
   18 results. A URL-scheme check in the profile leave-confirmation handler was
   hardened with a normalized same-origin HTTP(S) allowlist and regression tests.
   Re-scanning removed that finding. All 17 remaining results are preserved in
   SARIF with local review decisions in codeql-triage.json; they are not hidden
   or reported as zero findings.

## Results and evidence

- **166 existing API checks + 22 supplementary checks = 188 passed**, plus the
  ingestion boundary suite, zero failures.
- **57 Firefox checks passed**, zero failures, including the prior browser suite.
- Backend TypeScript check and isolated frontend production build passed.
- [API output](reports/security-extra-api-tests.txt)
- [Firefox assertions](reports/browser-security-comprehensive.json)
- [CORS/iframe screenshot](evidence/evidence-cors-and-iframe.png)
- [CodeQL before](reports/codeql-before-gap-fix.sarif),
  [after](reports/codeql-after-gap-fix.sarif), [triage](reports/codeql-triage.json)
- [Redacted secret scan and review](reports/gitleaks-history-redacted.json)

CodeQL's remaining results consist of ten query-flow warnings protected by
request validation, two parameter-type warnings protected by query validation,
one OAuth HMAC incorrectly interpreted as password storage, one fixed-dictionary
regex escaping warning, one plain-text maintenance parser warning, and two
intentional partial filename-anchor warnings. These are reviewed local decisions,
not dismissals in GitHub and not proof that every possible exploit is prevented.

## Data isolation and reproduction

`cd backend && npm run test:security` creates fresh temporary replica sets.
Each harness verifies that its effective URI equals the URI it generated before
connecting. NODE_ENV=test disables dotenv loading. External service credentials
are replaced with synthetic/empty values. Persistent local databases on 27017/
27018 and all shared/production databases are outside the allowed scope.

`python3 security/zap/run-browser-isolated.py` creates fresh synthetic records,
builds an env-free frontend copy in a private temporary directory, and runs
Firefox against only the owned fixture. It does not reuse the user's app build.
Processes and MongoDB instances created by the harness are stopped afterwards.
The always-applicable data restriction is recorded in AGENTS.md.

The earlier ZAP reports describe their recorded revision; the whole ZAP campaign
was not repeated for this incremental round. Real Google login, production/cloud
configuration, external email/AI services and features absent from ICheerTOR are
not claimed as tested here. Both frontend warning types from the earlier ZAP
review (inline CSS and COEP) remain recorded.
