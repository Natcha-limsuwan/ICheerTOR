# Feature Specification: I Cheer TOR Platform Baseline

**Feature Branch**: `001-icheertor-platform-baseline`

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "Complete baseline feature specifications for the I Cheer TOR (Bangkok Software Procurement Tracker) platform covering Authentication & Access Control, Automated Aggregation & Ingestion, Vertex AI TOR Extraction Engine, Vendor Profiles & Qualification Matching, Unfair Terms & Red-Flag Detection, Search/Comparison/Bookmarks, and Multi-Channel Notifications."

**SRS Reference**: `SRS/Bangkok_Procurement_Tracker_SRS.docx` (Version 1.0, 22 August 2026, by Dek1MillionBath)

**UI Reference**: `SRS/stitch_icheertor/stitch_icheertor/` (9 mockup pages)

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Google Sign-In & Session Management (Priority: P1)

A new user visits the I Cheer TOR landing page and clicks "Sign in with Google" (เข้าสู่ระบบ). The system redirects to Google OAuth, the user selects their Google account and grants permission, and the system creates a user profile (or retrieves an existing one), starts an authenticated session, and redirects to the dashboard.

**Why this priority**: Authentication is the gateway to all personalised features — without it, no profile, no matching, no bookmarks, no alerts.

**Independent Test**: Can be fully tested by completing a Google OAuth round-trip and verifying a dashboard redirect with active session; delivers secure access to the platform.

**Acceptance Scenarios**:

1. **Given** an unauthenticated user on the landing page, **When** they click "Sign in with Google" and complete OAuth, **Then** the system creates/retrieves their user profile, starts a session, and redirects them to the authenticated dashboard.
2. **Given** a user with an active session, **When** they revisit the platform, **Then** they are taken directly to the dashboard without re-authentication.
3. **Given** a user mid-OAuth, **When** they cancel the Google consent screen, **Then** the system returns them to the landing page with a non-blocking informational message.
4. **Given** a Google OAuth error (network failure, invalid token), **When** the callback is received, **Then** the system displays an error message and allows retry.

---

### User Story 2 — Browse & Search TOR Opportunities (Priority: P1)

An authenticated software team navigates to the procurement listing page, enters keywords or applies filters (agency name, budget range, median price, posting date, tech-stack keywords, eligibility status), and views matching TOR listings with match scores and key deadlines. They select a listing to view the full parsed TOR detail.

**Why this priority**: Discovering relevant procurement opportunities is the core value proposition; without search/browse, the platform has no utility.

**Independent Test**: Can be fully tested by applying various filter combinations and verifying that matching results appear with correct metadata; delivers opportunity discovery.

**Acceptance Scenarios**:

1. **Given** an authenticated user on the listing page, **When** they enter a keyword and apply filters, **Then** the system displays matching TOR listings ranked by relevance with match scores, budget, agency, and deadline visible.
2. **Given** search results are displayed, **When** the user selects a listing, **Then** the system shows the full parsed TOR detail page including Scope of Work, Qualifications, Median Price, and Evaluation Criteria.
3. **Given** a search with no matching results, **When** the results page loads, **Then** the system displays an empty-state message with suggestions to broaden filters.
4. **Given** a listing on the results page, **When** the user views it, **Then** the listing displays a link to the original source announcement and an outbound link to the official portal (e-GP/BMA) for bid submission.

---

### User Story 3 — Manage Company Profile (Priority: P1)

A software team navigates to "My Profile" (TeamProfilePage), enters company details — past contract values, technology stacks, team credentials/certifications, and company age — and saves the profile. The system validates the data and immediately reflects the updated profile in any subsequent qualification matching.

**Why this priority**: Profile data drives qualification matching and opportunity alerting — both high-value features depend on an accurate profile.

**Independent Test**: Can be fully tested by creating a profile, updating fields, and verifying that saved data persists and is retrievable; delivers profile management.

**Acceptance Scenarios**:

1. **Given** an authenticated user with no profile, **When** they navigate to "My Profile" and submit valid company data, **Then** the system creates the profile and confirms success.
2. **Given** an existing profile, **When** the user updates any field and saves, **Then** the system persists the changes and re-runs matching for any tracked opportunities.
3. **Given** a profile form submission with validation errors (e.g., negative contract value, missing required fields), **When** the user submits, **Then** the system displays field-level error messages without losing entered data.

---

### User Story 4 — View Qualification Match (Priority: P2)

A software team opens a TOR listing and sees a per-criterion pass/fail breakdown of their eligibility. For each failing criterion, the system indicates whether the gap is potentially bridgeable (e.g., "company age 4 years vs. required 5 years — gap: 1 year") and displays an overall eligibility summary.

**Why this priority**: Eligibility screening prevents teams from wasting time on projects they are unqualified for — a key differentiator for the platform.

**Independent Test**: Can be fully tested by opening a parsed TOR listing with a completed profile and verifying per-criterion pass/fail display; delivers eligibility analysis.

**Acceptance Scenarios**:

1. **Given** an authenticated user with a complete profile viewing a parsed TOR, **When** the detail page loads, **Then** the system displays pass/fail status for each qualification criterion and an overall eligibility summary.
2. **Given** a failing criterion, **When** the user views the detail, **Then** the system indicates the specific gap and whether it is potentially bridgeable.
3. **Given** a user with an incomplete profile viewing a TOR, **When** the detail page loads, **Then** the system prompts the user to complete their profile before showing matching results.

---

### User Story 5 — Automated TOR Aggregation & Ingestion (Priority: P2)

The system runs scheduled scraping jobs against BMA and e-GP procurement portals, ingests software-related TOR announcements (both draft/public-hearing and official bidding phases), downloads associated PDF documents, de-duplicates records across sources, and stores raw data for downstream parsing. If a source's structure changes or a scrape fails, the system retries, alerts administrators, and preserves any partially ingested data.

**Why this priority**: Automated ingestion is the data backbone — without fresh TOR data, no features work. Ranked P2 because manual import can serve as a stopgap during MVP.

**Independent Test**: Can be fully tested by triggering a scrape cycle and verifying that new TOR records appear in the database with de-duplication applied; delivers automated data aggregation.

**Acceptance Scenarios**:

1. **Given** a scheduled scrape time arrives, **When** the scraper runs, **Then** the system ingests new software-related TOR announcements from configured portals and stores them with source attribution.
2. **Given** a TOR announcement that exists on multiple portals, **When** the scraper ingests both, **Then** the system de-duplicates and stores a single record with references to all sources.
3. **Given** a structural change in a portal's HTML, **When** the scraper detects extraction failure, **Then** the system retries with back-off, alerts administrators, and preserves all previously ingested data.
4. **Given** a portal's robots.txt restricts certain paths, **When** the scraper initialises, **Then** it respects the restrictions and applies rate limiting.

---

### User Story 6 — AI-Powered TOR Parsing with Confidence Scores (Priority: P2)

After a TOR PDF is ingested, the system submits it to the AI extraction engine, which parses the unstructured Thai-language document into structured fields: Scope of Work, Qualifications, Median Price (ราคากลาง), and Evaluation Criteria. Each extracted field displays a confidence score (0.0–1.0). Fields below the confidence threshold are flagged for human review. Users can correct any mis-parsed field; corrections are persisted and tracked.

**Why this priority**: Parsed structured data powers search, matching, and red-flag analysis — all downstream features depend on extraction quality.

**Independent Test**: Can be fully tested by submitting a sample TOR PDF and verifying that structured fields appear with confidence scores and are user-correctable; delivers AI extraction.

**Acceptance Scenarios**:

1. **Given** a newly ingested TOR PDF, **When** the extraction engine processes it, **Then** the system stores structured fields (Scope of Work, Qualifications, Median Price, Evaluation Criteria) with per-field confidence scores.
2. **Given** a parsed field with a confidence score below the defined threshold, **When** the user views the TOR detail, **Then** the field is visually flagged as needing review.
3. **Given** a mis-parsed field, **When** the user submits a correction, **Then** the corrected value replaces the extracted value and the correction is logged for quality tracking.
4. **Given** the AI service is unavailable or times out, **When** the system attempts extraction, **Then** it displays a clear "extraction unavailable" state, retries with exponential back-off, and does not show partial/corrupt data.

---

### User Story 7 — Bookmark Opportunities & Deadline Tracking (Priority: P2)

A software team clicks a bookmark icon on a TOR listing to save it. The saved listing appears on their personal dashboard (BookmarkPage) with deadline reminders. They can unbookmark to remove it.

**Why this priority**: Bookmarking and deadline tracking help teams manage multiple opportunities — a high-engagement retention feature.

**Independent Test**: Can be fully tested by bookmarking a listing, verifying it appears on the saved page with deadlines, and un-bookmarking to remove it; delivers opportunity tracking.

**Acceptance Scenarios**:

1. **Given** an authenticated user viewing a TOR listing, **When** they click the bookmark icon, **Then** the listing is saved to their bookmarks and appears on the saved-opportunities page.
2. **Given** a bookmarked listing, **When** the user clicks the bookmark icon again, **Then** the listing is removed from their bookmarks.
3. **Given** a bookmarked listing with an upcoming submission or public-hearing deadline, **When** the deadline approaches, **Then** the system schedules and delivers a deadline reminder notification.

---

### User Story 8 — Red-Flag Detection & Public-Hearing Feedback (Priority: P3)

During the public-hearing phase of a draft TOR, the system evaluates parsed qualification criteria against red-flag rules and displays a list of potentially restrictive or biased clauses. Each flag includes the reason it was flagged and a recommended action. The user can click to be routed to the official public-hearing feedback channel, optionally with a pre-filled objection template based on the flagged clauses.

**Why this priority**: Red-flag detection is a unique differentiator but depends on well-tuned rules and parsed data — better suited for later sprints.

**Independent Test**: Can be fully tested by opening a draft TOR in the public-hearing phase and verifying that flagged clauses appear with reasons and that the external feedback link is functional; delivers transparency advocacy.

**Acceptance Scenarios**:

1. **Given** a draft TOR in the public-hearing phase, **When** the user opens the listing, **Then** the system displays a list of flagged clauses with reasons and recommended actions.
2. **Given** a flagged clause, **When** the user clicks "Submit Feedback", **Then** the system routes them to the official public-hearing feedback channel via an outbound link.
3. **Given** the "Submit Feedback" action, **When** the system generates the link, **Then** it optionally pre-fills a feedback template based on the flagged clauses.
4. **Given** a TOR that is not in the public-hearing phase, **When** the user views the listing, **Then** the red-flag section is suppressed or displays "Not in public-hearing phase."
5. **Given** a draft TOR with no red flags detected, **When** the user views the listing, **Then** the system displays "No flags detected."

---

### User Story 9 — Multi-Channel Notifications (Priority: P3)

A software team configures their notification preferences (in-app, email, and/or LINE) on the alerts page (Alertpage). When a new TOR matching their profile is posted, when a TOR enters its public-hearing window, or when a bookmarked opportunity's deadline approaches, the system dispatches notifications through the user's configured channels. Users can also receive award/result notifications when published.

**Why this priority**: Notifications drive engagement but can be added incrementally after core discovery and matching features are stable.

**Independent Test**: Can be fully tested by configuring notification preferences, triggering a matching event, and verifying notification delivery; delivers proactive alerting.

**Acceptance Scenarios**:

1. **Given** a user has configured email notifications and a new matching TOR is posted, **When** the match event fires, **Then** the system sends an email notification with the TOR summary and a link to the listing.
2. **Given** a user has configured LINE notifications, **When** a bookmarked TOR enters its public-hearing window, **Then** the system sends a LINE message with the hearing dates and a link.
3. **Given** a user has configured in-app notifications, **When** a deadline approaches for a bookmarked opportunity, **Then** the system displays an in-app notification on the dashboard.
4. **Given** a tracked opportunity's award/result is published, **When** the system detects the result, **Then** it notifies the user through their configured channels.

---

### User Story 10 — Side-by-Side Comparison (Priority: P3)

A software team shortlists multiple TOR opportunities and views them in a side-by-side tabular comparison format on a single page. The comparison shows key fields (budget, median price, agency, tech stack, eligibility status, deadlines) aligned across columns.

**Why this priority**: Comparison is a convenience feature that enhances decision-making but is not critical for core discovery.

**Independent Test**: Can be fully tested by selecting multiple listings and verifying that a tabular comparison renders correctly; delivers comparative analysis.

**Acceptance Scenarios**:

1. **Given** a user has selected two or more TOR listings for comparison, **When** they activate the comparison view, **Then** the system displays a side-by-side table with aligned fields across columns.
2. **Given** a comparison view, **When** the user reviews the table, **Then** each column shows budget, median price, agency, tech stack requirements, eligibility status, and key deadlines.
3. **Given** a comparison view, **When** the user clicks on a column header listing, **Then** they are navigated to the full detail page for that TOR.

---

### User Story 11 — Administrator Account Management (Priority: P3)

A system administrator navigates to the admin dashboard (adminPage), views a list of user accounts with status and verification flags, and performs actions: approve new registrations, verify identities, suspend accounts, ban users, or review reported content. All administrative actions are logged.

**Why this priority**: Admin tools are essential for governance but not for core user-facing workflows — can be added in later sprints.

**Independent Test**: Can be fully tested by logging in as admin, performing account actions, and verifying status changes and audit logs; delivers platform governance.

**Acceptance Scenarios**:

1. **Given** an administrator on the admin dashboard, **When** they view the user list, **Then** the system displays users with their status (active, pending, suspended, banned) and verification flags.
2. **Given** an administrator selects a user, **When** they choose "Suspend", **Then** a confirmation dialog appears before the action is executed.
3. **Given** a confirmed suspension, **When** the action completes, **Then** the user's status is updated, the action is logged, and the suspended user can no longer access protected features.

---

### User Story 12 — PDPA Self-Service Data Management (Priority: P2)

A user navigates to their privacy/data settings, views all personal data the platform holds about them, exports their data in a machine-readable format (JSON or CSV), manages their consent preferences, or permanently deletes their account and all associated data.

**Why this priority**: PDPA compliance is a legal obligation and a constitution-level principle — must be present before public launch.

**Independent Test**: Can be fully tested by accessing data settings, exporting data, and verifying the export contains all personal data; delivers PDPA compliance.

**Acceptance Scenarios**:

1. **Given** an authenticated user on the data settings page, **When** they request to view their personal data, **Then** the system displays all stored personal and company-profile data.
2. **Given** a user on the data settings page, **When** they request a data export, **Then** the system generates a downloadable file (JSON or CSV) containing all their personal data.
3. **Given** a user requests account deletion, **When** they confirm the deletion, **Then** the system permanently removes all personal data and deactivates the account within the defined retention period. Anonymised audit references may be retained.
4. **Given** the consent management page, **When** the user revokes consent for a specific processing purpose, **Then** the system stops processing their data for that purpose and records the revocation with a timestamp.

---

### Edge Cases

- What happens when a user's Google account is suspended or deleted after they have an active I Cheer TOR account?
- How does the system handle a TOR PDF that is image-only (scanned) with no extractable text?
- What happens when the same TOR is updated (re-published) on the same portal — does the system create a new record or update the existing one?
- How does the system behave when a user has no company profile and tries to view qualification matching?
- What happens when the AI extraction engine returns confidence scores of 0.0 for all fields?
- How does the system handle Thai Buddhist Era dates (e.g., 2569) vs. Gregorian dates in TOR documents?
- What happens when a user bookmarks a TOR and the TOR is subsequently removed from the source portal?
- How does the system handle LINE notification delivery failures (e.g., user has blocked the LINE bot)?

## Requirements *(mandatory)*

### Functional Requirements

**Authentication & Access Control (F1 / UC-01, UC-08)**

- **FR-001**: The system MUST authenticate users exclusively via Google OAuth single sign-on.
- **FR-002**: The system MUST implement role-based access control with two roles: User and Administrator.
- **FR-003**: The system MUST create a new user profile on first successful authentication or retrieve the existing profile on subsequent logins.
- **FR-004**: The system MUST start an authenticated session and redirect to the dashboard upon successful authentication.
- **FR-005**: The system MUST allow administrators to approve, verify, suspend, and ban user accounts from the admin dashboard.
- **FR-006**: The system MUST display a confirmation dialog before executing destructive administrative actions (suspend, ban, delete).
- **FR-007**: The system MUST log all administrative account management actions with timestamp, administrator identity, and action taken.
- **FR-008**: The system MUST provide self-service data access: users can view all personal data the platform holds about them.
- **FR-009**: The system MUST provide self-service data export in JSON or CSV format containing all personal and company-profile data.
- **FR-010**: The system MUST provide self-service account deletion that permanently removes all personal data within the defined retention period.
- **FR-011**: The system MUST provide consent management: users can grant, view, and revoke consent for specific data processing purposes. Consent records MUST include timestamp and scope.
- **FR-012**: The system MUST present a privacy notice and obtain explicit consent before collecting or processing personal data.

**Automated Aggregation & Ingestion (F2 / UC-14)**

- **FR-013**: The system MUST automatically scrape software-related TOR announcements from BMA and e-GP procurement portals on a configurable schedule.
- **FR-014**: The system MUST cover both the draft/public-hearing phase and the official bidding phase of procurement notices.
- **FR-015**: The system MUST de-duplicate TOR records across multiple source portals, storing a single canonical record with references to all sources.
- **FR-016**: The system MUST detect scraping failures or structural changes in source portals, retry with configurable back-off, and alert administrators.
- **FR-017**: The system MUST respect each source portal's robots.txt and terms of use and apply rate limiting.
- **FR-018**: The system MUST use modular, per-source scraper adapters so that a new portal can be added without changing core scraping logic.
- **FR-019**: The system MUST download and store TOR PDF documents associated with each announcement for downstream parsing.

**Vertex AI TOR Extraction Engine (F3 / UC-13)**

- **FR-020**: The system MUST parse unstructured Thai-language TOR PDFs into standardised structured fields: Scope of Work, Qualifications, Median Price (ราคากลาง), and Evaluation Criteria.
- **FR-021**: The system MUST display a normalised confidence score (0.0–1.0) for each extracted field.
- **FR-022**: The system MUST visually flag extracted fields whose confidence score falls below a project-defined threshold for human review.
- **FR-023**: The system MUST allow users to correct any mis-parsed field. Corrected values MUST replace the extracted values, and corrections MUST be logged with user identity and timestamp.
- **FR-024**: The system MUST degrade gracefully when the AI service is unavailable: display a clear "extraction unavailable" state, retry with exponential back-off and jitter, and never show partial or corrupt data.
- **FR-025**: The system MUST use versioned extraction prompts and document-processing configurations.

**Vendor Profiles & Qualification Matching (F4, F5 / UC-03, UC-06)**

- **FR-026**: The system MUST allow software teams to create and maintain a company profile with the following fields: past contract values, technology stacks, team credentials/certifications, and company age.
- **FR-027**: The system MUST re-run qualification matching for all tracked/bookmarked opportunities whenever a user updates their company profile.
- **FR-028**: The system MUST cross-reference parsed TOR qualification criteria against the user's company profile and display per-criterion pass/fail status.
- **FR-029**: The system MUST provide gap analysis for each failing criterion, indicating the specific shortfall and whether the gap is potentially bridgeable.
- **FR-030**: The system MUST display an overall eligibility summary (match score) on each TOR listing.
- **FR-031**: The system MUST prompt users to complete their company profile before displaying qualification matching results if the profile is incomplete.

**Unfair Terms & Red-Flag Detection (F6, F11 / UC-04, UC-07)**

- **FR-032**: During the public-hearing phase, the system MUST evaluate parsed TOR qualification criteria against red-flag rules and display a list of potentially restrictive or biased clauses.
- **FR-033**: For each flagged clause, the system MUST display the reason it was flagged and a recommended action.
- **FR-034**: The system MUST surface public-hearing open/close dates prominently on draft TOR listings.
- **FR-035**: The system MUST route users to the official public-hearing feedback channel via an outbound link when they choose to submit feedback.
- **FR-036**: The system MUST optionally pre-fill a feedback template based on red-flag analysis when routing users to the official feedback channel.
- **FR-037**: The system MUST suppress the red-flag section for TOR listings that are not in the public-hearing phase.

**Search, Comparison & Bookmarks (F8, F9, F10 / UC-02, UC-05)**

- **FR-038**: The system MUST support full-text search across parsed TOR content.
- **FR-039**: The system MUST support filtering by: agency name, budget range, median price, posting date, technology-stack keywords, and eligibility status.
- **FR-040**: The system MUST support side-by-side tabular comparison of two or more shortlisted TOR opportunities.
- **FR-041**: The system MUST allow users to bookmark/save any TOR listing and view all saved listings on a dedicated page.
- **FR-042**: The system MUST schedule and deliver deadline reminders for bookmarked opportunities (submission and public-hearing deadlines).
- **FR-043**: For each listing, the system MUST display a link to the original source announcement and an outbound link to the official government portal for bid submission (e-GP/BMA).
- **FR-044**: The system MUST display the data source attribution on each listing.

**Multi-Channel Notifications (F7 / UC-15)**

- **FR-045**: The system MUST deliver notifications through three channels: in-app, email, and LINE messaging.
- **FR-046**: The system MUST allow users to configure their notification channel preferences (opt-in/opt-out per channel).
- **FR-047**: The system MUST trigger notifications when: a new TOR matching a user's profile is posted, a TOR enters its public-hearing window, a bookmarked opportunity's deadline approaches, and an award/result is published for a tracked opportunity.
- **FR-048**: Each notification MUST include a summary of the triggering event and a direct link to the relevant listing.

### Key Entities

- **User**: A registered platform user authenticated via Google OAuth. Has a role (User or Administrator), consent records, and notification preferences. Owns zero or one Company Profile.
- **Company Profile**: A software team's profile containing past contract values, technology stacks, team credentials, and company age. Belongs to one User. Used for qualification matching.
- **TOR Listing**: A parsed procurement opportunity containing structured fields (Scope of Work, Qualifications, Median Price, Evaluation Criteria), source URLs, procurement phase (draft/public-hearing or official bidding), deadlines, and per-field confidence scores. May have associated red flags.
- **TOR Source**: A raw scraped procurement announcement from a specific portal (BMA, e-GP). Multiple sources may map to a single canonical TOR Listing via de-duplication.
- **Qualification Match**: A per-criterion pass/fail analysis linking a Company Profile to a TOR Listing. Includes gap analysis and overall match score.
- **Red Flag**: A flagged clause within a TOR Listing during the public-hearing phase. Contains the clause text, the reason for flagging, and the recommended action.
- **Bookmark**: A user's saved reference to a TOR Listing with associated deadline reminders.
- **Notification**: A message dispatched to a user through one or more channels (in-app, email, LINE) triggered by a platform event.
- **User Correction**: A user-submitted correction to an AI-extracted field, including the original value, corrected value, user identity, and timestamp.
- **Consent Record**: A log of a user's consent decision for a specific data-processing purpose, including timestamp, scope, and revocation status.
- **Admin Action Log**: An audit record of administrative actions (approve, verify, suspend, ban) with timestamp and administrator identity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete Google OAuth sign-in and reach the dashboard in under 10 seconds from clicking "Sign in with Google."
- **SC-002**: A first-time user can create a complete company profile without external documentation in under 5 minutes.
- **SC-003**: The system ingests new TOR announcements from configured portals within 1 hour of their publication during scheduled scrape windows.
- **SC-004**: 90% of TOR PDF extractions produce structured fields with an average confidence score ≥ 0.7.
- **SC-005**: Users can search and filter the TOR listing database and see results in under 3 seconds.
- **SC-006**: Per-criterion qualification matching results display within 2 seconds of opening a TOR detail page.
- **SC-007**: Users can export their personal data (PDPA) in under 30 seconds.
- **SC-008**: Account deletion requests are fully processed (all personal data removed) within 72 hours.
- **SC-009**: Notifications are delivered to configured channels within 5 minutes of the triggering event.
- **SC-010**: The system supports at least 50 concurrent authenticated users without performance degradation.
- **SC-011**: The system stores and retrieves at least 5,000 parsed TOR records while maintaining search response times under 3 seconds.
- **SC-012**: Scraper resilience: the system detects source-structure changes and alerts administrators within 1 scrape cycle.
- **SC-013**: 80% of users who view qualification matching results can identify which criteria they fail and why on first viewing.
- **SC-014**: The side-by-side comparison view correctly aligns fields across all selected TOR listings with no data misalignment.
- **SC-015**: The platform functions correctly on the latest two versions of Chrome, Firefox, Safari, and Edge.
- **SC-016**: All user interfaces render responsively across desktop (≥1024px), tablet (768–1023px), and mobile (<768px) screen sizes.

## Assumptions

- **Google OAuth sufficiency**: Google OAuth is sufficient as the sole authentication provider for the MVP. If >10% of target users report Google account issues, additional providers will be evaluated for Phase 2.
- **Portal accessibility**: BMA and e-GP procurement portals remain publicly accessible for scraping, and their HTML/PDF structure remains stable enough for automated ingestion.
- **AI Thai-language capability**: The selected AI engine (Vertex AI) can adequately parse Thai-language TOR PDFs to extract structured fields with acceptable accuracy. User correction feedback will improve quality over time.
- **Software-category only**: The system scrapes only software-category procurement announcements. Non-software categories are out of scope.
- **Web-only MVP**: Mobile native applications (iOS/Android) are out of scope for the initial release. The platform is web-only with responsive design.
- **No bid submission on-platform**: The platform is strictly a discovery and transparency tool. All bid submission and financial transactions occur on official external portals (e-GP/BMA).
- **LINE Bot approval**: LINE notification delivery assumes the LINE Messaging API bot has been registered and approved by LINE before the notification feature goes live.
- **5,000-record initial capacity**: The system is designed for up to 5,000 parsed TOR records initially. Storage scaling will be planned before this limit is approached.
- **Red-flag rule set**: The initial red-flag rules will be defined through stakeholder workshops with procurement domain experts before F6 development begins. The rule set is expected to evolve.
- **Buddhist Era date handling**: The system will handle Thai Buddhist Era (B.E.) dates by converting them to Gregorian equivalents for internal storage while displaying them in the user's preferred format.
- **Bilingual UI**: The user interface will be provided in Thai (primary) and English, per NFR-LO1.
- **Confidence threshold TBD**: The default extraction confidence threshold for flagging uncertain fields will be defined during implementation, starting with a sensible default (e.g., 0.6) and adjustable by administrators.
