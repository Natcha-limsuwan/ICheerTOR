# PR #1 CodeQL follow-up

Reviewed on 22 November 2026 against the local changes following `4ce7f038`.
This is a source-review record, not a fresh CodeQL analysis or an alert dismissal.
The earlier final SARIF and its 18-finding triage retain their historical scope.

## Changes awaiting a fresh scan

- Alerts #6 and #7 (`js/sql-injection`, bookmark creation): the route already
  applies `bookmarkCreateBody`, which requires a 24-character hexadecimal string
  ObjectId and rejects operator objects. Both lookup filters now explicitly use
  `$eq`; ownership still comes from the authenticated session. The atomic upsert
  and `$setOnInsert` remain unchanged. Regression checks cover normal creation,
  duplicate creation, operator rejection and ownership.
- Alert #19 (`js/type-confusion-through-parameter-tampering`, TOR search): the
  HTTP route already validates search input, but the helper now independently
  accepts `unknown` and rejects non-string values before calling string methods.
  Added direct null/undefined/number/array/object checks and an HTTP repeated-`q`
  regression check.

These changes are not evidence that the corresponding scanner alerts have closed.

## Retained alerts requiring contextual review

- Alert #20 (`js/insufficient-password-hash`, OAuth transaction verification):
  the reported cookie value is a signed transaction payload, not a password.
  HMAC-SHA256 authenticates it using a server-side secret, followed by timing-safe
  MAC comparison, expiry and state checks. A password KDF is not a substitute for
  this MAC. The password-hashing classification is a false positive in this
  reviewed context; this does not claim that every aspect of the cookie design
  has been verified.
- Alert #21 (`js/file-access-to-http`, procurement fetch): current production
  callers perform procurement lookups/downloads with project/feed parameters,
  fixed headers and timeout signals. HTTPS destinations are restricted to three
  explicit procurement hosts, credentials in URLs are rejected and redirects
  are validated again. The reviewed calls do not upload arbitrary local files.
  Classification: constrained intended outbound flow within the reviewed caller
  scope. Destination validation alone does not prove that arbitrary future
  request bodies or sensitive query values are safe to send.
- Alert #22 (`js/file-access-to-http`, security test helper): requests target the
  loopback server created by the synthetic test harness, backed by its disposable
  MongoDB replica set. Classification: test-fixture flow, not a production file
  upload or arbitrary external destination.

No alerts were dismissed and no scanner rules or severity gates were disabled.
After committing and pushing the fixes, review the new CodeQL run and retain or
dismiss remaining alerts only with the corresponding documented rationale.

## Local verification on 22 November 2026

- Backend `npm run build`: passed.
- `npm run test:security`: completed with exit code 0.
- Main security suite: 171 passed, 0 failed.
- Ingestion security suite: passed.
- Supplementary suite: 25 passed, 0 failed.
- Resilience suite: 61 passed, 0 failed.
- Integrity suite: 30 passed, 0 failed.

The suites use disposable synthetic databases and mocked external providers.
No live SMTP/AI/Google verification is claimed by this run. CodeQL was not rerun
locally; the CLI is not installed. The remote gate still needs a new analysis.
