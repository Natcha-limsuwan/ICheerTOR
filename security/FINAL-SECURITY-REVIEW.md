# Final implementation mapping review

18 November 2026. Current working tree, not just the committed base. This report
does not change the Google Sheet, source database, or external Google settings.

## Assignment checklist

- **Password authentication — MISSING.** Current routes provide Google OAuth,
  not a local password flow. The instructor checklist supplied in chat explicitly
  includes password authentication. Excluding T05 from the threat model does not
  remove that assignment requirement; obtain an instructor exception or implement
  and test the feature separately. Do not report Google login as both methods.
- **Social OAuth/OpenID — implementation present, live evidence pending.** Real
  Google login is currently blocked by redirect URI registration for the isolated
  harness. Offline auth tests do not establish provider success.
- **Authorization and object access — implemented in tested scope.** Current
  role/status, route scopes, field allowlists and ownership checks are enforced
  at the backend; synthetic admin and user matrices pass.
- **Input validation / SQL, NoSQL and ORM injection — implemented in tested
  scope.** Zod middleware, typed/allowlisted queries and escaped search regexes
  have attack tests. The app uses MongoDB, not SQL. Retain CodeQL query-flow
  warnings and their mitigation review rather than claiming no findings.
- **Environment/credentials — source controls present.** Configuration checks,
  exclusions and historical secret scans exist. This review does not certify
  credentials, production IAM or secret rotation. Vertex smoke-test output was
  changed to stop displaying even a key prefix/suffix.
- **CORS — fixed-origin policy with browser evidence.** Allowed-origin and
  attacker-origin Firefox checks exist; not a wildcard policy.
- **Error handling and logging — implemented, partial operational coverage.**
  Generic observed errors and structured auth/security events are tested.
  Off-host immutable retention and alerting remain operational gaps.
- **HTTP headers — local implementation/evidence present.** Helmet/backend and
  nonce/frontend controls exist. Keep the actual ZAP warnings about inline CSS
  and cross-origin isolation, and capture DevTools headers for presentation.
- **SAST/DAST reports — final rerun recorded separately below.** API regressions
  are not SAST and are not a substitute for a ZAP report.

## Four selected advanced features

1. **Login attempt rate limit:** a separate MongoDB-backed auth limiter allows
   20 requests per IP in a 15-minute fixed window, shared across Google login
   start, callback and code exchange. API tests verify 429, Retry-After and
   RATE_LIMITED. This limits the application's OAuth endpoints, not Google's
   password entry or a local password-login feature.
2. **Backend API rate limit:** shared MongoDB fixed-window counters; 300 allowed,
   request 301 rejected, Retry-After and recovery tested with synthetic traffic.
3. **Login inactivity timeout:** server-side lastActivityAt and absolute expiry
   are checked; expired synthetic sessions are rejected.
4. **JWT expiration checking/management:** fixed signature algorithm, issuer,
   audience and time claims plus server-side revocation/session checks. Synthetic
   expiry, logout, suspension and role-change cases are covered.

Scope authorization remains part of the base authorization implementation and
is **not counted** among these four advanced features. Detailed report-ready
descriptions, ASVS references and screenshot instructions are in
[ADVANCED-SECURITY-FEATURES.md](ADVANCED-SECURITY-FEATURES.md).

## ASVS 5.0.0 plan review

The connected Assignment 1 Sheet was read only. It contains 345 requirements and
58 selected items (32 L1, 22 L2, 4 L3). Its descriptions are an earlier source
review and contain stale observations, for example missing regex validation that
has since been implemented. No Sheet cell or checkbox was changed here.

[Full requirement snapshot](reports/asvs-plan-snapshot.csv) retains requirements
and the earlier plan text, excluding team-member rows. [Selected-item review](reports/asvs-final-selected-review.csv)
covers **all 58 selected IDs**, with code, evidence and explicit limits:

- 28 implemented with scoped tests; 3 implemented with scoped source review.
- 17 partial; 2 source-reviewed without comprehensive runtime proof.
- 4 need operational evidence; 3 are not applicable to current input/storage
  features; 1 gap is the maintained SBOM/component-provenance inventory.

These are review categories, not ASVS certification or 31 fully verified ASVS
requirements. Scope reductions need justification, not automatic green ticks.
The Sheet's Implemented=0 is historical sheet data; this file does not recalculate
or replace that spreadsheet status.

## Threat model

T05, T06 and T12 remain excluded as requested. Do not renumber the remaining
threats. [THREAT-COVERAGE.md](THREAT-COVERAGE.md) describes the retained controls
and residual risks. T17/T18 now have mocked-model and generated-document evidence;
real-model prompt injection remains pending. T28 has synthetic lease/crash/load
and fixture restore evidence, not global quotas or production recovery proof.
The original detailed Google Docs threat text was not re-fetched for this run;
this mapping uses the repository threat IDs and scope. Compare any later Docs
edits before submission.

## OWASP Top 10 mapping

Version: **2025**, based on [OWASP's official list](https://top10.owasp.org/2025/).
Category mapping is traceability, not proof of complete mitigation. If the class
requires 2021 numbering, use an explicit 2021 crosswalk rather than mixing IDs.

- **A01 Broken Access Control:** T07/T08/T13; role/scope/ownership and procurement
  egress controls; API matrix and redirect/allowlist tests.
- **A02 Security Misconfiguration:** T25/T26; CORS, headers and configuration
  checks; local browser/ZAP evidence, deployment settings unverified.
- **A03 Software Supply Chain Failures:** T26/T27; lockfiles, scanner/workflow
  source; SBOM/provenance and current dependency evidence remain incomplete.
- **A04 Cryptographic Failures:** T03; random JWT secrets, HMAC/signature controls;
  source/token tests, not transport/cloud certification.
- **A05 Injection:** T09/T10/T11; schemas, query allowlists, escaping and safe
  rendering; API attacks and Firefox evidence.
- **A06 Insecure Design:** T16/T17/T18/T28; limits, review boundaries and recovery
  design; synthetic resilience tests, residual AI/global-quota risks.
- **A07 Authentication Failures:** T01/T02/T03/T04; OAuth state/PKCE, browser
  binding, JWT/session revocation and timeouts; live Google flow pending.
- **A08 Software or Data Integrity Failures:** T14/T15/T19/T20; archive checks,
  transaction rollback and fenced updates; not a signed artifact supply chain.
- **A09 Security Logging and Alerting Failures:** T21/T22; structured security
  logs and restricted audit APIs; immutable retention/alerting not established.
- **A10 Mishandling of Exceptional Conditions:** T28; fail-closed rate/session
  stores, provider timeout/circuit handling, worker recovery; synthetic faults.

## Final scan evidence

CodeQL 2.27.4 ran 105 security-extended queries over 134 source/script files.
The initial expanded scan had 19 results; removing the Vertex diagnostic's key
prefix/suffix output reduced that to **18 retained findings**. Seventeen match
earlier local reviews; the additional file-to-HTTP flow passes the explicit
procurement destination/redirect allowlist. Review decisions are documented,
not suppressions or proof of zero risk. Scripts are now included, so this count
must not be compared as identical scope to the older 17-result run.

ZAP completed at **2026-11-18T12:42:11Z**. All five active scans finished at 100%
with zero queued passive records: frontend 3,089 requests; user 4,174; admin
4,216; developer 4,216; anonymous 4,080. Total **19,775 active scan requests**.
No high-risk alert was reported in these configured scopes. Frontend warnings
remain: medium CSP inline styles and HTTP-only local site; low missing COEP;
four informational alert types. API scopes reported only informational client
error/no-store observations. Local HTTP explains the HTTPS warning but does not
establish that any future deployment has valid HTTPS.

Administrative mutations/logout/deletion are excluded from ZAP and covered by
synthetic API tests. Authenticated frontend behavior is checked separately by
Firefox. A completed configured scan is not an exhaustive attack guarantee.

The fresh isolated Firefox run passed **57 checks, zero failures**, and its
runtime exited 0. See `reports/browser-security-comprehensive.json` and
`reports/final-zap-run.txt`. The harness stopped its owned scan/browser processes
and temporary databases after the run.

See `reports/codeql-final.sarif` for the initial expanded source/script scan and
`reports/codeql-final-fixed.sarif` for the rerun after removing partial key output.
Final result counts and scope are recorded in `reports/codeql-final-triage.json`.
ZAP completion and scope are recorded in `reports/zap-comprehensive-manifest.json`.
Do not infer success from the existence of an old manifest; use its finishedAtUtc
and the scan-run output for this round.

The latest API/security run passed 249 counted assertions plus ingestion tests.
Live Google OAuth, actual SMTP delivery and actual-model adversarial evaluation
are separate pending tasks. No real database or external provider was attacked.
