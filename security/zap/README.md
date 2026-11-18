# Isolated active ZAP testing

Run from the repository root:

```sh
python3 security/zap/run-isolated.py
```

For completion of all configured active scans, all API roles, followed by
authenticated Firefox/DOM tests against fresh disposable data:

```sh
ZAP_COMPLETE=1 python3 security/zap/run-isolated.py
```

This mode removes the five-minute active-scan cutoff (each scanner still has a
one-hour process watchdog), captures active-scan progress/request counts and
passive queue completion through `evidence-hook.py`, and includes developer API
scanning. `100%` means completion of that configured scan, not proof against all
possible attacks. Firefox uses Mozilla's official WebDriver release and verifies
the asset digest when supplied by GitHub. No pip Selenium package is needed.

Complete-mode evidence is saved separately as `zap-comprehensive-*` and
`browser-security-comprehensive.json`; the shorter `zap-active-*` run remains
historical evidence. Browser assertion failures cause the runner to fail.

Requires Docker Desktop, Python 3 with PyYAML, installed backend/frontend npm
dependencies, and free ports 4300 and 4301. Uses the installed Next.js production
build with webpack and the official `ghcr.io/zaproxy/zaproxy:stable` image.
The manifest records the actual image ID because the stable tag changes.

The runner creates its own temporary MongoDB replica set and synthetic users,
profiles, procurement records, bookmarks and notifications. The fixture overrides
inherited database/provider settings before importing the app. No production
database, real Google identity, email or AI provider is used. It does not change
the application's normal rate-limit settings: only the fixture's baseline API
limit is raised to let the scanner reach handlers.

It performs an **active full scan** of the unauthenticated frontend, plus active
OpenAPI scans as anonymous, regular user and admin. Real fixture IDs replace the
old all-zero examples. A preflight checks successful access to protected data
and denial of regular-user admin access. A developer is checked in preflight;
developer-only writes are covered by regression tests, not an extra ZAP scan.

ZAP excludes logout, account deletion, administrative writes, code exchange,
correction submissions and data export from these repeated active scans.
Authentication and sensitive-action throttles stay enabled; the dedicated
`cd backend && npm run test:security` suite tests these flows, including IDOR,
revocation, stale sessions, injection and audit rollback.

The frontend scan is unauthenticated. It cannot certify client-only signed-in
screens, an actual Google login, or every route. The default short mode has a five-minute
ceiling; inspect request counts, reports and alerts rather than assuming every
rule exercised every endpoint. External services and production TLS/IAM are
outside the scope. Complete mode separately checks authenticated screens,
role redirects, stored/URL XSS and revocation in Firefox. Real Google login still
requires a deployment/browser check with the provider.

The runners build an env-free frontend copy in their private temporary directory,
with port 4301 fixed as its test API. They do not reuse or overwrite the normal
frontend build. Backend test mode skips .env loading and asserts its generated
database URI before connecting. Persistent development databases are prohibited.

Reports are saved as `security/reports/zap-active-*`. Synthetic bearer tokens are
redacted before saving report evidence; private fixture credentials are removed
on shutdown. The runner stops only its own processes/containers. It overwrites
the preceding `zap-active-*` evidence on the next run.

ZAP exit 2 means warnings and exit 1 means configured failures. The wrapper can
finish successfully while recording those scan exit codes: read the manifest
and reports. No alerts are suppressed with `-I` or custom ignore rules.

Official scanner documentation:
[API scan](https://www.zaproxy.org/docs/docker/api-scan/) and
[Full scan](https://www.zaproxy.org/docs/docker/full-scan/).

The legacy `run-zap.sh` now forwards to the isolated runner and rejects external
target/token inputs. It no longer scans an already-running application.
