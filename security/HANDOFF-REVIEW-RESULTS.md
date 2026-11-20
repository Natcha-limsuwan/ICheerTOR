# Security hand-off review — 20 November 2026

Branch `security/zap-active-verification`, base `9b7d8c6` (one report-only commit
after `1bfb072`), plus the working-tree changes listed below. No real database,
`.env`, Google/SMTP/AI service or real record was used.

## Evidence status — read this first

| Kind | Status in this round |
|---|---|
| Source review | Done (findings below). |
| Isolated tests (disposable MongoDB) | **Written, not executed.** The review machine has no Node.js, npm or Docker and installing them was declined. No pass counts are claimed. |
| Mocked-provider tests | **Written, not executed** (fake SMTP in `integrity.test.mts`). |
| Live Google OAuth | **Pending** — needs a machine with Node 22, the redirect URI below registered, and the user signing in. |
| Live SMTP | **Not available** — the project has no test SMTP credentials. Not tested; nothing is claimed. |
| Live AI model | **Not available** — the project has no Vertex credentials. Approved budget if credentials appear later: 5 synthetic documents, ≤15 requests (`MAX_ATTEMPTS` = 3). |
| CodeQL | Existing SARIF re-triaged against current source; not re-run. |
| ZAP | Not re-run (no Docker). Recorded limitations (inline CSS, local HTTP, COEP) unchanged. |

## Changes and reasons

1. **`ERR_ERL_DOUBLE_COUNT` (T13)** — `backend/src/middleware/mongo-rate-limit-store.ts`.
   Cause, from express-rate-limit 8.7.4 source (tarball SHA-512 matches the lockfile):
   the double-count check identifies a shared store by `constructor.name` plus
   `store.prefix`. All three `MongoRateLimitStore` instances had no prefix, so the
   `api` and `auth` limiters looked like one store on every `/api/auth/*` request.
   The library only logs this (once per limiter); MongoDB counters were already
   namespaced (`api:` / `auth:`), so limits were counted correctly. Fix: expose
   `prefix = "<namespace>:"`. Validation was not disabled.
   Regression: `security-gaps.test.mts` (+3 checks, first auth-limited request).

2. **Duplicate notification delivery (T25)** — new `services/notification/delivery.ts`;
   `dispatcher.ts`, `ingest-notifier.ts`, `tor-match-alerter.ts`, `models/notification.ts`.
   Before: no deduplication for new-TOR broadcasts (a rerun or concurrent poller
   notified and emailed everyone again); match alerts used check-then-insert
   (race). After:
   - `dedupeKey` + partial unique index `(userId, dedupeKey)`; batch key is a
     SHA-256 of the sorted TOR IDs; match key is `new_match:<torId>`.
   - Email state `pending → sending → sent | failed`, claimed atomically; a
     rerun retries only `failed`, at most 3 attempts.
   - Consent and email preference are re-read after the claim, before SMTP.
   - **Not exactly-once.** A claim left in `sending` (worker died, or SMTP
     accepted the message but the result was not recorded) is never resent
     automatically: a missed email is preferred over a duplicate. Stuck
     `sending` rows need manual review.
   - Deployment: run `scripts/sync-indexes.ts --dry-run`, review, then apply.
     Without the index, deduplication is not guaranteed. Legacy notifications
     (no `dedupeKey`) are unaffected; legacy match alerts keep the old lookup.
   - Behaviour change: `ingest-egp2 --force-notify` on the same three TORs now
     no-ops on the second run.

3. **Review status vs. changed AI content (T16/T17)** — `services/extraction-lease.ts`,
   `scripts/extract-tors.ts`. Before: new AI output was written, then a separate
   update marked a `verified` review `outdated`; an interruption between them left
   new, unreviewed content labelled verified. After: `commitOwnedExtraction` does
   both in one transaction; a lost lease rolls back both. The test reproduces the
   old two-step state (BEFORE) and the transactional result (AFTER).

4. **Stale admin verification** — `tor-review.ts`, `admin.routes.ts`, `schemas.ts`.
   An admin could load a record, a re-extraction could land, and the PUT would mark
   the new content verified. Optional `expectedUpdatedAt` (the `record.updatedAt`
   from GET) now returns 409 on mismatch. It protects only callers that send it;
   no admin UI exists yet. This is **not** version-bound review and there is no
   source-authenticity check.

5. **Account deletion response (T21)** — `pdpa.routes.ts`. The response returned
   `scheduledAt` and `completionBy = now + 30 days`, implying a pending purge, but
   the work completes synchronously and no purge job exists. It now returns
   `status: "pseudonymised"` with `removed`, `revoked` and `retained` lists.

## Source-review conclusions without code changes

- **Google OAuth harness**: `scripts/google-login-isolated.mts` sends exactly
  `redirect_uri=http://localhost:4401/api/auth/google/callback`. It reads only
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` from `backend/.env`, which is absent on
  this machine. `redirect_uri_mismatch` means that URI is not registered on the
  OAuth client in use.
- **Consent (T20)**: enforced at the TOR list's personalised match, `GET /api/tor/:id/match`, dispatcher,
  ingest broadcast, match alerter and now at send time. No frontend consent
  enrolment exists (the API `POST /api/pdpa/consent` only). The legacy default (no
  record → allowed) is **kept**: switching to deny would silently stop matching and
  every notification for all existing accounts, since none can enrol through the
  UI. Proposal: add an enrolment screen and a migration notice first, then switch
  the default with a dated cut-over.
- **Data freshness**: the frontend shows no review/verified/freshness label and does
  not claim verification; the API returns `review`, `extraction.needsReview` and
  `updatedAt`. Showing a status would be a separate UI change.
- **Deletion/retention**: retained after deletion — Google account ID (blocks
  silent re-provisioning), consent records with IP/user agent, TOR corrections,
  admin audit log, ended sessions (IP/user agent) until the 7-day-after-expiry
  TTL. This is partial pseudonymisation, not complete erasure. The profile
  “delete account” button has no handler, so deletion is API-only. A retention
  workflow (periods per record type, scheduled purge or pseudonymisation of
  consent IP/UA and correction authorship) needs a policy decision.
- **Email logging**: `sendEmail` logs the recipient address on success/failure
  (T19). Left unchanged; flagged for the log-classification review.
- **CodeQL (18 retained)**: re-checked against current code; prior classifications
  hold. The 10 `js/sql-injection` hits read raw `req.query`, not
  `res.locals.query`, but only keys the Zod schema has already constrained to a
  string/enum/regex shape (arrays/objects are rejected with 400). Reading
  `res.locals.query` would be cleaner defence in depth. No suppression added.

## Out of scope (proposals only)

Cookie/BFF sessions, antivirus/parser sandbox, distributed AI quota, off-host
immutable logs, production backup/IAM/TLS and signed build provenance were not
changed.

## Reproduce (on a machine with Node 22)

```sh
cd backend
npm ci
npx tsx tests/security-gaps.test.mts     # limiter regression (+3)
npx tsx tests/security.test.mts          # deletion response (+3)
npm run test:integrity                   # consent, dedup, interruption, review (30 checks written)
npm run test:security                    # everything, including the above
```

Each creates and removes its own MongoDB replica set and refuses ports 27017/27018.
Record the actual output, including failures.
