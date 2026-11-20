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

Historical counts: 166 API + 22 supplementary + 61 resilience = 249 counted
assertions, plus the ingestion boundary suite. The 20 November changes add 3 API,
3 supplementary and the integrity suite (30 checks written); these have not been
run yet, so use your actual output. Capture your actual run,
including failures if any; do not label mocked integrations as live results.

## Consent, duplicate delivery and review integrity

```sh
npm run test:integrity
```

Capture the consent, retry, crashed-worker, broadcast and BEFORE/AFTER review
sections. SMTP is a counting fake; the crashed worker is a real child process.

## Live Google OAuth (manual, isolated database)

1. In Google Cloud Console → the OAuth client used by `backend/.env` → Authorized
   redirect URIs, add exactly `http://localhost:4401/api/auth/google/callback`.
2. `backend/.env` needs only `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; the
   harness ignores every other value, including `MONGODB_URI`.
3. Start the harness and keep a log (it never prints tokens, codes or cookies):

```sh
npx tsx scripts/google-login-isolated.mts 2>&1 | tee ../security/reports/google-live-run.txt
```

4. In a second terminal, show only the redirect URI the application sends:

```sh
curl -s -o /dev/null -w '%{redirect_url}\n' "http://localhost:4401/api/auth/google?browserChallenge=$(printf 'A%.0s' $(seq 43))" \
  | python3 -c 'import sys,urllib.parse as u;print(u.parse_qs(u.urlparse(sys.stdin.read().strip()).query)["redirect_uri"][0])'
```

5. Open http://localhost:4400, sign in with Google yourself, and capture the five
   PASS lines (callback + browser-bound exchange, code replay rejected,
   authenticated API, logout, old token rejected). Then Ctrl+C.
6. `grep -c ERR_ERL_DOUBLE_COUNT ../security/reports/google-live-run.txt` must print `0`.
   Review the log before committing; it contains a synthetic user ID and `::1`.

Live SMTP delivery and real-model adversarial evaluation
require separately identified test credentials/accounts; the project currently has none. No command above tests
those live services. Historical ZAP and SAST results remain separate evidence;
this command does not rerun either scanner.
