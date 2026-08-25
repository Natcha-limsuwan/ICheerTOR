# Research: I Cheer TOR Platform Baseline

**Date**: 2026-08-24 | **Spec**: [spec.md](file:///c:/work/collaborative/Software-Process/specs/001-icheertor-platform-baseline/spec.md)

## R1: Next.js App Router + Tailwind CSS + MUI Co-existence

**Decision**: Use Tailwind CSS for layout/spacing/responsive utilities and MUI for complex interactive components (DataGrid, Dialog, Autocomplete, Tabs). Resolve style conflicts via MUI's `StyledEngineProvider` with `injectFirst` to ensure Tailwind utilities can override MUI defaults.

**Rationale**: The UI mockups use Tailwind's utility classes for layout but require MUI's component richness for data tables, form controls, and dialogs. Both libraries are mandated by the constitution. Using `injectFirst` prevents CSS specificity battles.

**Alternatives considered**:
- Tailwind-only with custom components — rejected because MUI provides accessible, production-ready complex widgets (DataGrid, Dialog) that would be costly to rebuild.
- MUI-only with `sx` prop — rejected because the mockup HTML stitch files are built with Tailwind utilities; deviating would violate UI Fidelity principle.

**Implementation detail**:
```
// app/layout.tsx — provider ordering
<StyledEngineProvider injectFirst>
  <ThemeProvider theme={muiTheme}>
    <CssBaseline />
    {children}
  </ThemeProvider>
</StyledEngineProvider>
```

---

## R2: NextAuth.js v5 Google OAuth Configuration

**Decision**: Use NextAuth.js v5 (`next-auth@beta`) with the Google provider. Store user sessions in MongoDB via the MongoDB adapter. Map Google profile data to the `User` model on first sign-in.

**Rationale**: NextAuth.js is the de facto authentication library for Next.js App Router. v5 supports Server Components, Route Handlers, and middleware-level auth checks natively. MongoDB adapter provides seamless integration with our existing Mongoose connection.

**Alternatives considered**:
- Custom OAuth implementation — rejected due to security risks and maintenance burden.
- Clerk / Auth0 — rejected because they introduce external SaaS dependencies not in the constitution stack; Google OAuth via NextAuth keeps auth self-hosted.

---

## R3: MongoDB Atlas Schema Design for TOR Records

**Decision**: Use a denormalised document model where each `TORRecord` embeds its `parsedData` (Scope of Work, Qualifications, Median Price, Evaluation Criteria) and `redFlags` as nested sub-documents. Source URLs stored in a separate `TORSource` collection linked via `torRecordId` for de-duplication across portals.

**Rationale**: TOR data is read-heavy (search, display, match) and rarely updated after initial parsing. Embedding parsed data avoids joins on every read. Separate `TORSource` collection enables clean de-duplication when the same TOR appears on multiple portals.

**Alternatives considered**:
- Fully normalised relational-style (separate collections for each parsed section) — rejected because MongoDB's strength is document embedding; normalising would increase query complexity without proportional benefit at our 5,000-record scale.
- Single collection with sources embedded — rejected because de-duplication logic is cleaner with sources in their own collection.

---

## R4: Vertex AI Integration for Thai TOR PDF Parsing

**Decision**: Use `@google-cloud/vertexai` SDK to call Gemini models via the Vertex AI API. Submit PDF documents as base64-encoded multimodal inputs. Use a structured JSON output schema to enforce field extraction. Wrap calls with a circuit-breaker (3-failure threshold, 60s cooldown) and exponential back-off with jitter (base 1s, max 30s, 3 retries).

**Rationale**: Vertex AI Gemini models support multimodal inputs (PDF), Thai language, and structured JSON output mode. The circuit-breaker prevents cascading failures when Vertex AI is degraded. Structured output mode reduces post-processing and improves consistency.

**Alternatives considered**:
- OpenAI GPT-4o — rejected because constitution specifies Vertex AI; also, Vertex AI provides better Thai-language support for government documents.
- OCR → text → LLM pipeline (Tesseract + separate LLM) — rejected because Gemini multimodal handles PDF natively, reducing pipeline complexity and failure points.

**Confidence threshold default**: 0.6 (configurable via environment variable `AI_CONFIDENCE_THRESHOLD`). Fields below threshold receive visual warning badge. All fields remain visible but flagged.

---

## R5: Scraper Architecture — Modular Adapters

**Decision**: Implement a base `ScraperAdapter` abstract class with portal-specific subclasses (`BMAAdapter`, `EGPAdapter`). Each adapter encapsulates: URL construction, HTML parsing (using `cheerio`), PDF download, and structural-change detection. Scheduling via `node-cron` with configurable intervals per source.

**Rationale**: The SRS explicitly requires modular, per-source adapters (NFR-M1) so new portals can be added without core changes. Abstract base class enforces a consistent interface while allowing portal-specific DOM parsing logic.

**Alternatives considered**:
- Puppeteer/Playwright for dynamic scraping — rejected for MVP because BMA/e-GP portals serve static HTML; headless browser adds resource overhead. Can be added as an adapter variant later if needed.
- External scraping service (ScrapingBee, Apify) — rejected to avoid external SaaS dependency and to maintain full control over rate limiting and robots.txt compliance.

**Rate limiting**: 1 request per 2 seconds per portal. Configurable via `SCRAPER_RATE_LIMIT_MS` environment variable. robots.txt parsed on first request per domain and cached for 24 hours.

---

## R6: Qualification Matching Algorithm

**Decision**: Per-criterion rule-based matching. For each TOR qualification criterion, compare against the user's company profile field:
- **Contract value**: Profile's max past contract ≥ TOR minimum requirement → PASS.
- **Company age**: Profile's company age ≥ TOR minimum → PASS. Gap = difference if FAIL.
- **Tech stack**: Intersection of profile tech stacks and TOR required stacks. Partial match = PARTIAL, full = PASS, none = FAIL.
- **Credentials**: Profile's certifications list checked against TOR required certs. Missing = FAIL with specific cert named.
- **Gap analysis**: For numeric criteria, calculate the exact deficit. For set criteria (tech, certs), list missing items. Mark gaps <20% of requirement as "potentially bridgeable."

**Rationale**: Rule-based matching is transparent, deterministic, and auditable — users can see exactly why they pass or fail. LLM-based matching would introduce probabilistic results that conflict with the "clear eligibility/disqualification status" requirement (FR-028).

**Alternatives considered**:
- LLM-based fuzzy matching — rejected because deterministic pass/fail with gap analysis is a core requirement (US-18). Users need to trust the result.
- Weighted scoring only — rejected because users need per-criterion breakdown, not just an aggregate score.

---

## R7: Multi-Channel Notification Architecture

**Decision**: Event-driven notification dispatch. When a triggering event occurs (new TOR match, public-hearing window open, deadline approaching, award published), the system creates a `Notification` document and fans it out to the user's configured channels via the `NotificationDispatcher`. Channels: in-app (MongoDB polling/SSE), email (Nodemailer + SMTP), LINE (LINE Messaging API push message).

**Rationale**: Event-driven architecture decouples event generation from delivery, allowing channel-specific retry and failure handling. In-app notifications stored in MongoDB for persistence; email and LINE are fire-and-forget with retry on failure.

**Alternatives considered**:
- WebSocket for real-time in-app — rejected for MVP because SSE or polling is simpler and sufficient for notification-style updates. WebSocket can be added later.
- Third-party notification service (OneSignal, Firebase Cloud Messaging) — rejected to avoid external SaaS dependency; the three channels can be implemented directly.

---

## R8: PDPA Compliance Implementation

**Decision**: Implement PDPA as a cross-cutting concern:
1. **Consent middleware**: Check consent status on every request that processes personal data. Block processing if consent not granted.
2. **Privacy notice**: Render `ConsentBanner` on first visit / when consent is missing. Record consent with timestamp, scope, and user ID.
3. **Data export**: Aggregate all user data (profile, bookmarks, corrections, consent records) into a single JSON/CSV download.
4. **Account deletion**: Soft-delete (mark as deleted, anonymise PII) followed by hard-delete after retention period. Anonymised audit references retained.
5. **Data access logging**: Log access to personal data in `ConsentRecord` collection for accountability (NFR-PD4).

**Rationale**: PDPA is a constitution-level principle requiring self-service access, export, and deletion. Middleware-based consent enforcement ensures no data processing occurs without consent, regardless of which API route is called.

**Alternatives considered**:
- Per-route consent checks — rejected because it's error-prone (easy to miss a route). Middleware provides blanket coverage.
- Third-party PDPA toolkit — rejected because Thai PDPA has specific requirements best implemented directly; no established third-party library covers all needs.

---

## R9: Red-Flag Detection Rules Engine

**Decision**: Implement a rule-based evaluation engine that checks parsed TOR clauses against a configurable rule set stored in a JSON configuration file. Initial rules:
- **Narrow vendor specification**: Requirement naming a specific brand/product/vendor.
- **Unusually high minimum contract value**: Threshold relative to median for the procurement category.
- **Compressed timeline**: Submission deadline < N days from posting (configurable).
- **Restrictive certification**: Requiring certifications held by very few companies.
- **Budget outlier**: Median price significantly above/below category average.

Each rule produces: clause text, flag reason, severity (info/warning/critical), and recommended action.

**Rationale**: A rule-based engine is transparent, auditable, and doesn't require AI inference at display time (avoiding latency). Rules can be refined via stakeholder workshops (per SRS open issue #3).

**Alternatives considered**:
- Pure LLM-based red-flag detection — rejected because it would introduce latency, cost per evaluation, and non-deterministic results. A hybrid approach (rules first, LLM for ambiguous cases) can be added later.

---

## R10: Thai Language & Buddhist Era Date Handling

**Decision**: 
- **Date conversion**: Utility module `date-converter.ts` handles Buddhist Era (B.E.) ↔ Gregorian conversion (B.E. = Gregorian + 543). Internal storage always in Gregorian ISO 8601. Display format configurable per user locale.
- **Text handling**: All database fields use UTF-8. MongoDB Atlas natively supports Thai text search via Atlas Search with Thai language analyser.
- **Currency**: Thai Baht (฿) formatting via `Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })`.
- **i18n**: Thai primary, English secondary. Use `next-intl` for static string translations. TOR content displayed as-is (Thai from source documents).

**Rationale**: Buddhist Era dates are ubiquitous in Thai government documents. Converting on ingestion and displaying in user's preferred format prevents confusion while keeping internal consistency.
