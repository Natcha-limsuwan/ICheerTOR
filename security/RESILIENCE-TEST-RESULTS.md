# Synthetic service and recovery tests

Date: 18 November 2026. Tests include the current working-tree changes.

## Scope and isolation

All records, accounts, PDF/ZIP documents and provider responses are generated
fixtures. The tests create their own disposable MongoDB replica set and assert
the effective URI before connection. They reject persistent development ports
27017 and 27018. Test mode skips dotenv. A socket guard permits only the owned
MongoDB port; unmocked fetch requests fail. SMTP and AI transports are injected
fakes. No real records were queried or copied, and no live services were called.
The harness removes its temporary databases and backup file in cleanup.

## Results

**61 resilience assertions passed, zero failures.**

The combined `npm run test:security` run also passed: 166 existing API checks,
22 supplementary checks and these 61 checks (**249 counted assertions**), plus
the ingestion boundary suite. Backend TypeScript and a separate compile-only
check of `scripts/extract-tors.ts` passed; the worker CLI was not executed.

- AI boundary: malformed, empty, oversized, invalid enum, out-of-range confidence,
  prototype and extra account/command fields are rejected. Low-confidence output
  is flagged for review. Generated PDF/ZIP evidence goes through real document
  preparation and extraction with a mocked model. Injected output fields cause
  extraction failure without returning a database update.
- Provider failures: bounded retries for temporary errors and quota failures,
  immediate stop for non-retryable errors, abort-signal timeouts and recovery.
  Circuit-breaker tests allow only one recovery probe and reopen on failure.
- Document downloads: mocked outage, maintenance, missing archive, HTML pretending
  to be a ZIP, and subsequent successful download response.
- Email: missing configuration, failed/successful fake SMTP delivery, escaped
  HTML, unsafe links, preferences and consent. An email failure preserves the
  in-app notification.
- Load: 64 executor tasks, including one failure, respect the configured limit.
  A burst of 32 model calls permits two active and sixteen queued calls; fourteen
  receive a capacity error. No model service is contacted.
- Workers: 24 competing claims produce one owner. Expired owners cannot overwrite
  the replacement owner's result. A real child process exits abruptly; its
  synthetic job is recoverable after lease expiry, but cannot be stolen earlier.
- Recovery: a synthetic EJSON snapshot restores document counts, ObjectId/Date
  types and unique indexes into a fresh disposable database. A corrupted checksum
  is rejected before writes.

## Code changes verified

Strict local AI response validation, explicit untrusted-document prompt boundary,
confidence review flags, bounded model concurrency/queue, single circuit recovery
probe, finite SMTP timeouts, and owner-fenced extraction updates.

Reproduce with `cd backend && npm run test:resilience`. The suite is also included
in `npm run test:security`. [Raw output](reports/resilience-tests.txt).

## Limits

This verifies application behavior with simulated providers. It does not establish
that a real AI model always resists prompt injection, that a real SMTP server
delivers mail, or that live Google OAuth works. None of those services was called.
The snapshot test is a fixture EJSON round trip, not a production mongodump or
disaster-recovery exercise. Concurrency capacity is per process; deployment-wide
quotas need shared coordination. Worker fencing protects primary extraction
writes; it does not establish transactional, exactly-once audit/email delivery.
No production, cloud, real data, or new ZAP scan is included in this run.
