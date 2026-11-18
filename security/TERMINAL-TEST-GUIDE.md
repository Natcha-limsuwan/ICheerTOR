# Reproduce security tests for report screenshots

Run each command from the repository's `backend` directory. These scripts create
their own disposable MongoDB databases. Do not start the normal backend, seed
the development database, or change MONGODB_URI for these tests.

```sh
cd /Users/patthiaon/Desktop/ICheerTOR/backend
```

## API security

```sh
npx tsx tests/security.test.mts
```

Capture relevant section headings, PASS results, and the final count. This
includes authentication, session/token controls, authorization and access checks.
Google's interactive sign-in is simulated, not a live Google OAuth result.

## Input, document and download boundaries

```sh
npx tsx tests/ingestion-security.test.mts
```

Capture the final ZIP, decompression, streaming-limit and egress result.

## Supplementary API attacks

```sh
npx tsx tests/security-gaps.test.mts
```

Capture HTTP methods, log injection, API rate limiting and database-outage checks.
Only this test's own database is stopped for the outage case.

## AI, email, worker crash, load and recovery

```sh
npm run test:resilience
```

Capture the provider/AI, worker/concurrency and backup/restore sections, then the
final result. AI and SMTP are mocked. Documents and accounts are synthetic.
The backup test is a disposable fixture snapshot round trip.

## All of the above

```sh
npm run test:security
```

Expected current counts: 166 API + 22 supplementary + 61 resilience = 249
counted assertions, plus the ingestion boundary suite. Capture your actual run,
including failures if any; do not label mocked integrations as live results.

Live Google OAuth, real SMTP delivery and real-model adversarial evaluation
require separately identified test credentials/accounts. No command above tests
those live services. Historical ZAP and SAST results remain separate evidence;
this command does not rerun either scanner.
