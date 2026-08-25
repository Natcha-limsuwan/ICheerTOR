<!--
=== Sync Impact Report ===
Version change: 1.0.0 → 1.1.0
Modified principles:
  - "IV. Discovery & Transparency Only" → "I. Product Scope Boundary" (renamed, reordered, expanded with e-GP/BMA routing)
  - "I. PDPA Compliance First" → "III. Strict PDPA Compliance" (renamed, reordered, added self-service data access)
  - "III. Resilient LLM Handling" → "IV. AI Resilience & Transparency" (renamed, added red-flag analysis scope)
  - "II. Prototype–Production Separation" → merged into "V. UI Fidelity" (refocused on mockup alignment)
Added sections:
  - V. UI Fidelity (new principle — production pages must align with SRS/stitch_icheertor/ mockups)
  - Design System Reference (new section — codifies DESIGN.md tokens as canonical)
  - UI Page Inventory (new section — enumerates all 9 mockup pages as acceptance targets)
Removed sections:
  - "II. Prototype–Production Separation" (superseded by V. UI Fidelity)
Follow-up TODOs: none
-->

# I Cheer TOR Constitution

## Core Principles

### I. Product Scope Boundary

I Cheer TOR is strictly a civic-tech discovery, parsing, and alerting
tool. It MUST NOT facilitate direct bid submissions or financial
transactions on-platform.

- The platform MUST NOT provide forms, APIs, or workflows that submit
  bids, proposals, or offers to any procurement system on behalf of a
  user.
- The platform MUST NOT process, hold, or escrow any payments or
  financial instruments.
- Features MUST be limited to: searching, viewing, tracking, analysing,
  bookmarking, and alerting on publicly available Bangkok procurement
  (TOR) data.
- **Outbound Portal Routing**: Any feature that directs users toward
  official procurement actions (e.g., bid submission, registration)
  MUST route them via outbound links to the official portals — the
  national e-Government Procurement system (e-GP) or the Bangkok
  Metropolitan Administration (BMA) portal. The platform MUST NOT
  proxy, wrap, or embed these portals' submission flows.
- Any integration with external procurement portals MUST be read-only.
- **Rationale**: Operating as a bidding or transaction platform would
  introduce regulatory, liability, and conflict-of-interest risks that
  are outside the project's civic-transparency mission. Routing to
  official portals preserves institutional authority and audit trails.

### II. Tech Stack Consistency

All production code MUST adhere to the canonical technology stack
defined below. Deviations require explicit constitution amendment.

| Layer              | Technology                                        |
|--------------------|---------------------------------------------------|
| Framework          | Next.js (App Router)                              |
| Runtime            | Node.js (LTS)                                     |
| UI Library         | React                                             |
| Styling            | Tailwind CSS                                      |
| Component Library  | Material UI (MUI)                                 |
| Backend            | Next.js Server Actions / API Routes               |
| Database           | MongoDB Atlas                                     |
| AI / Extraction    | Google Cloud Vertex AI                            |

- **App Router**: All new routes MUST use the Next.js App Router
  (`app/` directory). The legacy Pages Router (`pages/`) MUST NOT be
  used for new features.
- **Server Actions / API Routes**: Server-side logic MUST be
  implemented via Next.js Server Actions or API Routes. Standalone
  Express/Fastify servers MUST NOT be introduced without a constitution
  amendment.
- All production dependencies MUST be compatible with the Node.js LTS
  version declared in the project's `.nvmrc` or `engines` field.
- Database schemas MUST be defined via Mongoose (or an equivalent ODM)
  with strict schema validation enabled.
- Environment-specific secrets (API keys, connection strings) MUST be
  managed via environment variables and MUST NOT be committed to
  version control.
- Thai-language support (UTF-8, locale-aware sorting/search) MUST be
  verified for every user-facing text pipeline.
- **Rationale**: A locked stack reduces cognitive overhead, simplifies
  onboarding, and ensures all contributors operate within a shared
  mental model. Vertex AI is chosen specifically for its Thai-language
  capabilities.

### III. Strict PDPA Compliance

Every feature that touches personal data MUST be designed, reviewed,
and tested against Thailand's Personal Data Protection Act (PDPA)
before it is merged.

- **Self-Service Data Access**: Users MUST be able to view all personal
  data the platform holds about them through a dedicated profile or
  privacy settings page, without requiring support intervention.
- **Data Export**: Users MUST be able to export all personal data held
  about them in a machine-readable format (JSON or CSV) via a
  self-service endpoint.
- **Consent Management**: Collection or processing of personal data
  MUST NOT occur without explicit, recorded, revocable consent. Consent
  records MUST include timestamp, scope, and the identity of the data
  subject.
- **Profile Deletion**: Users MUST be able to permanently delete their
  account and all associated personal data through a self-service flow.
  Deletion MUST be completed within the retention period defined by
  policy. Audit logs MAY retain anonymised references for compliance
  traceability.
- **Data Minimisation**: Only the minimum data necessary for a stated
  purpose MUST be collected. Fields not required for core functionality
  MUST NOT be stored.
- **Rationale**: Bangkok procurement data may contain personal
  identifiers (contact persons, signatories). Non-compliance exposes
  the project to legal liability under PDPA and erodes public trust in
  a civic-transparency tool.

### IV. AI Resilience & Transparency

All interactions with Google Cloud Vertex AI for Thai TOR PDF document
parsing and red-flag analysis MUST implement resilience and
transparency mechanisms.

- **Confidence Scores**: Every LLM-extracted field MUST carry a
  normalised confidence score (0.0–1.0). Fields below the
  project-defined confidence threshold MUST be flagged for human
  review.
- **Fallback States**: If the LLM service is unavailable, times out,
  or returns an error, the system MUST degrade gracefully — displaying
  a clear "extraction unavailable" state rather than failing silently
  or showing partial/corrupt data.
- **Manual Correction**: Users MUST be able to override or correct any
  LLM-extracted value. Corrections MUST be persisted and SHOULD feed
  back into quality metrics.
- **Red-Flag Analysis**: The AI engine MUST surface anomalies and
  potential irregularities (e.g., unusually narrow vendor
  specifications, budget outliers, compressed timelines) as structured
  red-flag indicators with supporting evidence citations from the
  source document.
- **Retry & Circuit-Breaker**: API calls to Vertex AI MUST use
  exponential back-off with jitter and a circuit-breaker pattern to
  prevent cascading failures.
- **Rationale**: LLM outputs are probabilistic. Thai-language TOR
  documents have complex formatting. Without explicit confidence
  tracking, red-flag surfacing, and correction workflows, users cannot
  trust the extracted data.

### V. UI Fidelity

Production pages MUST be implemented in alignment with the approved
mockups and HTML stitch assets located in `SRS/stitch_icheertor/`.

- Each production page MUST use the mockup's layout structure,
  component hierarchy, and interaction patterns as the acceptance
  baseline.
- The design system defined in
  `SRS/stitch_icheertor/stitch_icheertor/civic_procurement_interface/DESIGN.md`
  — including colour tokens, typography scale (Inter), spacing rhythm,
  elevation model, and shape language — MUST be the canonical reference
  for production styling.
- Mockup stitch files (raw HTML/CSS under `SRS/stitch_icheertor/`)
  MUST NOT be imported, referenced, or bundled into the production
  application build. They serve as visual specifications only.
- Deviations from the mockups for accessibility, performance, or
  technical constraints are permitted but MUST be documented in the
  pull request with an explicit justification.
- **Rationale**: Maintaining fidelity between approved designs and
  production code prevents design drift, ensures stakeholder
  expectations are met, and keeps the prototype–production boundary
  clean.

## UI Page Inventory

The following mockup pages under `SRS/stitch_icheertor/stitch_icheertor/`
constitute the canonical UI acceptance targets. Production
implementations MUST cover all pages listed here.

| Mockup Directory               | Page Purpose                                |
|--------------------------------|---------------------------------------------|
| `LandingPage/`                 | Public landing page with hero, how-it-works |
| `dashboard/`                   | Authenticated user dashboard                |
| `ProcumentPage/`               | Procurement opportunity detail view         |
| `BookmarkPage/`                | Saved / bookmarked TOR listings             |
| `Alertpage/`                   | Alert management and notification settings  |
| `adminPage/`                   | Admin control panel                         |
| `torradar_6/`                  | TOR radar / alert variant view              |
| `TeamProfilePage/`             | Team / company profile management           |
| `civic_procurement_interface/` | Design system spec (DESIGN.md reference)    |

Each directory contains a `code.html` stitch file and a reference
screenshot (`.png`). The `civic_procurement_interface/` directory
contains the authoritative `DESIGN.md` design specification.

## Design System Reference

The canonical design system is defined in
[`DESIGN.md`](file:///c:/work/collaborative/Software-Process/SRS/stitch_icheertor/stitch_icheertor/civic_procurement_interface/DESIGN.md)
and MUST be applied to all production components:

- **Colour Palette**: Tiered cobalt-blue palette — Primary `#0047AB`,
  Surface `#F9F9FF`, semantic warning/error tones. Full Material 3
  tonal token set as specified.
- **Typography**: Inter font family exclusively. Scale: `display-lg`
  (36px/700) through `label-sm` (11px/500).
- **Layout**: 12-column grid, 24px gutters, 260px persistent sidebar,
  1440px max-width container, 8px spacing rhythm.
- **Elevation**: Three-tier tonal layering (Background → Cards →
  Modals) with ambient shadows.
- **Shapes**: Rounded language — 10px cards, 8px inputs/buttons, pill
  badges at 999px.
- **Components**: Cobalt primary buttons, pill status badges, sticky
  data table headers, focused input glow, sidebar with 4px active
  indicator, procurement cards with red-flag icon slot.

## Development Workflow & Quality Gates

- **Branching**: All work MUST be performed on feature branches and
  merged via pull request with at least one approving review.
- **Testing**: Unit tests MUST accompany new business logic. Integration
  tests MUST cover API routes and database operations. End-to-end tests
  SHOULD cover critical user flows (search, TOR detail view, export).
- **Linting & Formatting**: ESLint and Prettier configurations MUST be
  enforced in CI. No warnings are acceptable in merged code.
- **Design Review**: Production UI changes MUST be visually compared
  against the corresponding mockup in `SRS/stitch_icheertor/` during
  pull request review.
- **Accessibility**: Production UI MUST target WCAG 2.1 AA compliance.
  MUI components MUST retain their built-in ARIA attributes.

## Governance

This constitution is the highest-authority governance document for the
I Cheer TOR project. All design decisions, code reviews, and
architectural choices MUST be evaluated against these principles.

- **Authoritative SRS**: The project requirements defined in
  `SRS/Bangkok_Procurement_Tracker_SRS.docx` serve as the authoritative
  Software Requirements Specification. Constitution principles take
  precedence where they impose stricter constraints; otherwise the SRS
  is the definitive requirements source.
- **Amendment Process**: Any change to this constitution MUST be
  proposed via pull request, reviewed by at least two maintainers, and
  include a migration plan for any affected code or workflows.
- **Versioning**: The constitution follows Semantic Versioning
  (MAJOR.MINOR.PATCH). MAJOR for principle removals or incompatible
  redefinitions; MINOR for new principles or material expansions; PATCH
  for clarifications and wording fixes.
- **Compliance Review**: Every pull request MUST include a brief
  constitution-compliance statement when the change touches a governed
  area (PDPA, LLM handling, scope boundaries, stack changes, or UI
  fidelity).

**Version**: 1.1.0 | **Ratified**: 2026-08-24 | **Last Amended**: 2026-08-24
