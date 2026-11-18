# Advanced (Self-Studied) Security Features

ICheerTOR selects four features from the assignment's advanced-security list:
login attempt rate limiting, backend API rate limiting, login inactivity timeout,
and JWT expiration checking and management. Role and scope authorization are
documented separately and are not counted again here.

## 1. Rate Limit for Login Attempts

The backend applies a dedicated authentication limiter to Google login start,
the OAuth callback and the one-time login-code exchange. These endpoints share
a limit of 20 requests per client IP in a 15-minute fixed window. Requests above
the limit receive HTTP 429, a Retry-After header and the RATE_LIMITED error code.
Counters are stored in MongoDB so backend instances share the same limits.

This control reduces automated requests to ICheerTOR's authentication endpoints.
It does not control password attempts on Google's website. The current
application has no local password-login endpoint; adding one would require
applying and testing the limiter there too. Fixed windows can allow a burst
across the window boundary, and distributed attackers can use multiple IPs.

Code: `backend/src/middleware/rate-limit.ts`,
`backend/src/middleware/mongo-rate-limit-store.ts`,
`backend/src/routes/auth.routes.ts`.

Verification: `backend/tests/security.test.mts` sends repeated invalid login-code
exchange requests and verifies HTTP 429, Retry-After and RATE_LIMITED. This is
an application-endpoint test using synthetic identities, not live Google login.

ASVS 5.0.0 mapping: V2.4.1 (anti-automation), with V6.3.1 relevant to documented
authentication abuse controls. This is not evidence of password brute-force
protection for an unimplemented password feature.

## 2. Rate Limit for Backend APIs

A separate limiter protects `/api` routes. The default limit is 300 requests
per client IP in a 15-minute fixed window, configured by RATE_LIMIT_API_MAX.
Requests above the limit receive HTTP 429 and Retry-After. Authentication and
sensitive-operation limits remain separate controls. Counters use MongoDB;
the application does not silently switch to an unshared in-memory counter if
the database becomes unavailable.

Code: `backend/src/app.ts`, `backend/src/middleware/rate-limit.ts`,
`backend/src/middleware/mongo-rate-limit-store.ts`.

Verification: `backend/tests/security-gaps.test.mts` verifies that the first
300 requests succeed, request 301 returns 429 with Retry-After, and requests
succeed in the next configured window. The test advances its own process clock
instead of waiting 15 minutes. ZAP fixtures raise the general API limit to reach
handlers; ZAP completion alone is therefore not the rate-limit evidence.

ASVS 5.0.0 mapping: V2.4.1 and availability defenses under V15.2.2.

## 3. Login Inactivity Timeout

Each session has a server-side last-activity timestamp. The backend rejects a
session after the configured inactivity period, which defaults to 30 minutes.
Valid authenticated requests refresh activity. Sessions also have an absolute
lifetime, defaulting to eight hours, that activity cannot extend. The timeout
decision is made by the backend; changing the browser clock cannot extend it.

Activity means requests accepted as authenticated by the middleware. Background
authenticated polling may therefore keep a session active; this implementation
does not claim to measure keyboard or mouse inactivity.

Code: `backend/src/auth/session-service.ts`, `backend/src/middleware/auth.ts`,
`backend/src/config/env.ts`.

Verification: `backend/tests/security.test.mts` ages synthetic session timestamps
and verifies rejection after idle and absolute expiry. It also verifies that
valid activity updates the idle timestamp. Tests do not wait for real users to
become inactive or modify sessions in a real database.

ASVS 5.0.0 mapping: V7.3.1 (inactivity timeout), V7.3.2 (absolute lifetime).

## 4. JWT Expiration Checking and Management

The backend verifies the JWT signature using an explicit algorithm allowlist
and checks its issuer, audience and time claims. A token must also match a valid
server-side session. Expiration is therefore enforced independently of whether
the browser still holds a token. Logout revokes the session, and suspended or
deleted accounts cannot continue using an old token. Current role and account
status are checked on the backend rather than trusted as stale client claims.

Code: `backend/src/auth/session-service.ts`, `backend/src/middleware/auth.ts`,
`backend/src/routes/auth.routes.ts`.

Verification: `backend/tests/security.test.mts` covers expired tokens, future
not-before values, invalid signatures/algorithms/claims, session ownership,
logout, logout-all, suspension and deletion. Expired or revoked credentials must
be rejected. These tests use generated accounts and sessions.

ASVS 5.0.0 mapping: V9.1.1 (signature/MAC verification), V9.2.1 (token validity
period), V9.2.3 (audience), and V7.2.1 (trusted backend session verification).

## Evidence and Terminal Screenshots

Existing execution evidence: `security/reports/security-terminal-run.txt`.
The combined run passed 166 base API, 22 supplementary and 61 resilience
assertions (249 counted checks), plus ingestion boundary tests. These totals
cover the whole suite, not 249 assertions solely about the four features.

From the repository root, run:

```sh
cd backend
npx tsx tests/security.test.mts
```

Capture the sections titled `Login code exchange and JWT validation`, `Logout, idle timeout, absolute
lifetime`, and `Rate limiting and secrets`, along with their PASS lines and the
final summary.

Then run:

```sh
npx tsx tests/security-gaps.test.mts
```

Capture the assertions for the first 300 requests, request 301, Retry-After and
recovery. Each script creates and cleans up its own temporary MongoDB. No normal
backend startup, source database URI or real provider credentials are needed.
Use your actual terminal output in the report; failures must not be omitted.

These four advanced features do not resolve the separate assignment gap of
missing password authentication. Live Google OAuth, SMTP delivery and actual
model adversarial testing remain separate pending integration evidence.
