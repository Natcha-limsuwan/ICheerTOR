# Security hardening coverage

Scope: Google OAuth only. T05 (application passwords), T06 (application MFA),
and T12 (cookie-authenticated application API) are excluded. The short-lived
OAuth transaction cookie is not an application session cookie.

This checklist distinguishes implemented code from deployment evidence. It is
not a claim that all ASVS requirements or all possible threats are resolved.

## Implemented and covered by regression checks

- T01/T04: JWTs never enter URLs. Single-use login codes require a SHA-256
  challenge whose verifier stays in the initiating tab's sessionStorage.
  OAuth state/Google PKCE are retained; the transaction cookie is HMAC signed
  and its timestamp is checked by the server. The verifier is removed after exchange.
- T02/T03: server-side session revocation, idle and absolute timeouts, fixed
  JWT algorithm/issuer/audience and required claims. The frontend presents its
  existing token during exchange so re-login invalidates the old session.
- T07/T08: object ownership and server-derived scopes; account role/status is
  reloaded on requests. Sensitive role changes and TOR review require recent
  application authentication. Google email must be verified before provisioning.
  Administrative account-status changes also require recent authentication.
- T09/T10: request schemas and writable-field allowlists from the previous
  hardening remain in place; regression tests cover injection and mass assignment.
- T11/T25: email escaping from the previous hardening is retained. Frontend
  scripts use per-request nonces, with no production script `unsafe-inline` or
  `unsafe-eval`. HTML responses are private/no-store. MUI styles still allow
  inline CSS; this is an explicitly outstanding hardening opportunity.
- T13: procurement clients use exact HTTPS host allowlists, reject credentials
  and alternate ports, and validate each redirect (maximum three). Google/SMTP/
  Vertex integrations are SDK/provider integrations and require their own egress
  network configuration in production. DNS/network-level restrictions remain operational work.
- T14/T15: streamed response limits stop oversized downloads before buffering
  the entire body. ZIP parsing caps archive size (80 MiB), per-entry expansion
  (40 MiB), total declared expansion (128 MiB), and entry count (500). It checks
  directory bounds, unsupported/encrypted entries, symlinks, duplicates and unsafe
  paths. Decompression is capped independently of untrusted declared sizes.
  PDF text extraction also bounds bytes/pages/items/text and cleans up parser resources.
- T16: MongoDB-backed fixed-window counters share API/auth/sensitive limits
  across replicas. No silent in-memory fallback exists if the store fails.
- T19/T20: TOR mutation and correction history share a transaction. Account
  status/role updates and audit records share a transaction; compare-and-set
  conditions reject stale target snapshots. Account deletion and session revocation
  are transactional. Tests inject an audit failure and verify rollback.
- T23/T24: in-app listing respects the sent channel; notification producers
  honour in-app preferences. Explicit withdrawal of `data_processing` blocks
  personalised matching and background notifications. Existing accounts without
  a consent record retain existing service behaviour; absence of a record must
  NOT be described as proof of consent. Full consent onboarding remains open.

## Existing controls with remaining work

- T17/T18: strict local schema validation, confidence review flags and an explicit
  untrusted-document prompt boundary now have generated PDF/ZIP and mocked-model
  attack evidence in RESILIENCE-TEST-RESULTS.md. Real-model adversarial evaluation
  remains pending. No claim of complete
  prompt-injection or hallucination prevention is made.
- T21: structured logs and restricted API access exist. Immutable/off-host logs,
  database credentials that prohibit log modification, and retention are deployment tasks.
- T22: API no-store, projections and generic errors exist. Review all logs and
  exported/retained personal data against a documented classification policy.
- T24: related working data is deleted; Google ID, consent/audit records and
  backups still require an approved retention/pseudonymisation policy. Do not
  describe the operation as irreversible erasure of every personal-data copy.
- T26/T27: configuration checks, Docker exclusions and CI scanning exist.
  Verify actual IAM, secrets, final images, dependency/SBOM provenance and live CI.
- T28: bounded network calls, single recovery probes, per-process AI capacity and
  fenced extraction leases have synthetic fault/load/crashed-child tests. A fixture
  EJSON backup/restore round trip passes. Isolated parser workers, global job
  concurrency, durable email deduplication/quotas and operational disaster recovery
  remain open; no external service availability is guaranteed.

## Runtime and migration requirements

1. **MongoDB replica set or Atlas is required.** Audit/account transactions fail
   closed on unsupported standalone databases. The supplied Compose MongoDB now
   starts `rs0` and waits for a primary. Do not delete existing volumes.
2. In Compose, use `mongodb://mongo:27017/icheertor?replicaSet=rs0`. For host-side
   access to that local replica set, use
   `mongodb://localhost:27017/icheertor?directConnection=true&replicaSet=rs0`.
3. Run the existing index synchronisation workflow after reviewing its dry run;
   it now includes TTL indexes for shared rate-limit counters. Do not point test
   scripts at production data.
4. Frontend public API URL is a **build-time** value. Compose defaults to
   `http://localhost:3001/api`; set `NEXT_PUBLIC_API_URL` before building for any
   real deployment. Browsers cannot resolve Compose's internal `backend` hostname.
5. Rebuild frontend and backend together: pre-hardening login codes have no
   browser challenge and are intentionally rejected. Users should start a fresh login.
6. Nonce-based CSP makes HTML routes dynamic. Confirm deployment caching does
   not reuse HTML/nonces and confirm the actual Google callback on the final domain.
7. Bearer tokens remain in localStorage to preserve the application's existing
   API contract. Nonces reduce script injection risk but do not make token theft
   impossible. A BFF/HttpOnly-session migration would need a separate CSRF design.

## Evidence

- `npm run test:security` uses an isolated MongoDB replica set and synthetic accounts.
- The suite also runs ingestion boundary/redirect tests without external documents.
- Frontend production verification checks a fresh nonce on each response, matching
  script attributes, absence of production script `unsafe-inline`, and no-store.
- SAST/DAST reports must identify the tested revision/scope and residual findings.
  Historical `*-after.json` files are evidence for the previous hardening, not
  automatically evidence for the current changes. Never infer Google browser E2E
  success or production TLS/IAM correctness from local API tests alone.
- The [isolated active ZAP runner](zap/README.md) seeds existing object IDs and
  scans anonymous/user/admin API scopes plus the unauthenticated frontend.
  It complements, rather than replaces, ownership and session regression tests.
- [The completed review](ACTIVE-ZAP-REVIEW.md) now records 100% completion of the
  configured frontend and anonymous/user/admin/developer API scans, 166 API checks
  and 47 authenticated Firefox checks. Dashboard pages also have a shared client
  authentication guard; backend authentication remains the data-access boundary.
