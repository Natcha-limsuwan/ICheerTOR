# Complete configured ZAP scans and authenticated browser review

Latest rerun: see [FINAL-SECURITY-REVIEW.md](FINAL-SECURITY-REVIEW.md). On
18 November 2026 all five scopes completed 19,775 active requests and the
authenticated Firefox suite passed 57 checks. The current comprehensive reports
and manifest contain this newer run; narrative counts below are historical.

For the later incremental comparison tests (188 API checks, 57 Firefox checks,
Gitleaks, CodeQL and finding triage), see [GAP-TEST-RESULTS.md](GAP-TEST-RESULTS.md).
The ZAP request counts below remain evidence of their original recorded run.

Reviewed on 18 November 2026 on `security/zap-active-verification`, based on
`caf6130`, including the uncommitted application changes. T05, T06 and T12 remain
excluded. All tests used disposable local data and synthetic sessions.

## ZAP completion evidence

The latest run removed the previous five-minute active-scan cutoff. All five
configured scans reached **FINISHED, 100%**, with **zero passive records remaining**.
Together they sent **19,773 active requests**:

- Frontend full scan: 3,087 requests.
- Regular-user API: 4,174 requests.
- Admin API: 4,216 requests.
- Developer API: 4,216 requests.
- Anonymous API: 4,080 requests.

These percentages describe completion of the configured scans. They do not mean
that every possible attack, application state or external system was tested.
The manifest and per-scope coverage files record the actual scanner status,
request counts, image ID and browser diagnostic warnings.

## Findings and fixes

No high alerts were reported. All four API scans have no high, medium or low
alerts; informational rejected-client-input and non-storable-response notices
remain. The frontend retains one medium alert type for inline CSS used by MUI,
one low alert type for missing COEP, and four informational alert types.
The frontend exit code is 2 (warnings), rather than a clean scan result.
Repeated alert instances are not distinct confirmed vulnerabilities.

Authenticated Firefox testing found that an anonymous visitor could open the
empty profile-page shell, although the API already denied access to private data.
A shared `AuthGuard` now keeps dashboard page components unmounted until the
session is checked and redirects unauthenticated visitors to login.

The additional review also validates OAuth browser challenges before Passport,
requires recent authentication for administrative account-status changes, and
uses a consistent tie-breaker when reading simultaneous consent records.

## Regression, browser and static evidence

- **166 API regression checks passed**, zero failures, plus the ZIP/PDF,
  decompression, streaming and redirect boundary checks.
- The endpoint inventory lists **40 method/route combinations**. All **35 bearer-
  protected routes** reject anonymous requests. Every admin route also has a
  regular-user denial test; malformed staff writes leave privileges/audit intact.
- **47 Firefox checks passed**, zero failures. They exercise user/admin/developer screens, admin redirects, stored
  profile and procurement XSS, title rendering in lists/bookmarks/comparisons,
  URL payloads, token-in-URL rejection and browser behaviour after logout. See
  the [browser evidence](reports/browser-security-comprehensive.json) for exact
  passed/failed counts and the WebDriver release/digest.
- Project Semgrep rules: zero findings, seven rules over 114 TypeScript targets,
  including frontend components; zero scan errors.
- Backend TypeScript check and frontend webpack production build passed.
  Frontend lint has zero errors and seven existing warnings.
- The production dependency audits from this review reported zero vulnerabilities.

The ZAP frontend scanner logged browser-extension setup warnings. Its absence
of DOM findings is not treated as sufficient evidence on its own; the separate
Firefox tests directly check that selected payloads are rendered as data, without
creating executable image/SVG elements or setting the attack marker.

## Scope that still requires separate evidence

Real Google provider login is not exercised with synthetic credentials. Production
TLS/IAM/secrets, external email/AI services and the deployed domain are not scanned.
Destructive actions, session termination, throttled sensitive operations and
administrative writes are tested through regression/browser tests rather than
repeated ZAP mutations. No claim of all-ASVS compliance or immunity to unknown
attacks is made. Retention policy, AI adversarial evaluation and other operational
work remain documented in [THREAT-COVERAGE.md](THREAT-COVERAGE.md).

## Reports and reproduction

Run `ZAP_COMPLETE=1 python3 security/zap/run-isolated.py` from the repository root.
See [setup and scope](zap/README.md). The shorter `zap-active-*` artifacts retain
historical evidence of the earlier 25% frontend run; `zap-comprehensive-*` are the
latest completed scans.

- [Manifest](reports/zap-comprehensive-manifest.json)
- [Frontend report](reports/zap-comprehensive-frontend.html)
- [User API](reports/zap-comprehensive-user.html), [admin API](reports/zap-comprehensive-admin.html),
  [developer API](reports/zap-comprehensive-developer.html), [anonymous API](reports/zap-comprehensive-anonymous.html)
- [Endpoint inventory](reports/endpoint-security-inventory.json)
- [Regression output](reports/security-comprehensive-tests.txt)
