# Implementation Plan: I Cheer TOR Platform Baseline

**Branch**: `001-icheertor-platform-baseline` | **Date**: 2026-08-24 | **Spec**: [spec.md](file:///c:/work/collaborative/Software-Process/specs/001-icheertor-platform-baseline/spec.md)

**Input**: Feature specification from `specs/001-icheertor-platform-baseline/spec.md`

## Summary

Build the I Cheer TOR platform — a civic-tech discovery, parsing, and alerting tool for Bangkok software procurement. The platform automatically scrapes BMA/e-GP TOR announcements, parses unstructured Thai PDF documents via Vertex AI into structured data, matches qualification criteria against vendor profiles, detects red-flag clauses during public-hearing windows, and delivers multi-channel notifications. Built with Next.js App Router, React, Tailwind CSS + MUI, MongoDB Atlas, and Google Cloud Vertex AI. Strictly a discovery tool — no bid submission or financial transactions on-platform.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**: Next.js 15 (App Router), React 19, Tailwind CSS 4, Material UI (MUI) 6, Mongoose 8, NextAuth.js 5 (Google OAuth), Google Cloud Vertex AI SDK (`@google-cloud/vertexai`), LINE Messaging API SDK (`@line/bot-sdk`), Nodemailer, node-cron

**Storage**: MongoDB Atlas (Mongoose ODM with strict schema validation)

**Testing**: Vitest (unit + integration), Playwright (E2E), MongoDB Memory Server (test DB)

**Target Platform**: Web application (responsive: desktop ≥1024px, tablet 768–1023px, mobile <768px). Latest 2 versions of Chrome, Firefox, Safari, Edge.

**Project Type**: Full-stack web application (Next.js monolith)

**Performance Goals**: Search results <3s, qualification matching <2s, 50 concurrent users, 5,000 TOR records, notification delivery <5min

**Constraints**: PDPA compliance mandatory, respect robots.txt + rate limiting for scraping, AI extraction must degrade gracefully with circuit-breaker, Thai-language + Buddhist Era date handling required, bilingual UI (Thai primary + English)

**Scale/Scope**: 1,000 registered users, 5,000 parsed TOR records, 9 UI pages, 48 functional requirements

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Product Scope Boundary | ✅ PASS | No bid submission/transaction features designed. All external links route to e-GP/BMA. FR-035, FR-043 enforce outbound-only. |
| II | Tech Stack Consistency | ✅ PASS | Stack matches constitution exactly: Next.js App Router, React, Tailwind CSS, MUI, Node.js Server Actions/API Routes, MongoDB Atlas, Vertex AI. |
| III | Strict PDPA Compliance | ✅ PASS | FR-008–FR-012 cover self-service data access, export, deletion, and consent management. Privacy notice required before data collection. |
| IV | AI Resilience & Transparency | ✅ PASS | FR-020–FR-025 mandate confidence scores, fallback states, user corrections, circuit-breaker, versioned prompts. Red-flag analysis in FR-032–FR-033. |
| V | UI Fidelity | ✅ PASS | Route structure maps to all 9 mockup directories. Design system from DESIGN.md codified as Tailwind config + MUI theme. |

**Gate result**: ✅ All 5 principles satisfied. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-icheertor-platform-baseline/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contracts)
│   ├── api-routes.md
│   └── ai-service.md
└── checklists/
    └── requirements.md  # Spec quality checklist (complete)
```

### Source Code (repository root)

```text
app/
├── layout.tsx                    # Root layout (nav shell, providers, fonts)
├── page.tsx                      # Landing page (/)
├── globals.css                   # Tailwind base + design tokens
├── (auth)/
│   ├── login/page.tsx            # Login page
│   └── api/auth/[...nextauth]/   # NextAuth.js route handler
├── (dashboard)/
│   ├── layout.tsx                # Dashboard shell (sidebar + topbar)
│   ├── dashboard/page.tsx        # User dashboard (/dashboard)
│   ├── procurement/
│   │   ├── page.tsx              # TOR listing/search (/procurement)
│   │   └── [id]/page.tsx         # TOR detail (/procurement/[id])
│   ├── alerts/page.tsx           # Notification settings (/alerts)
│   ├── profile/page.tsx          # Company profile (/profile)
│   ├── bookmarks/page.tsx        # Saved opportunities (/bookmarks)
│   └── compare/page.tsx          # Side-by-side comparison (/compare)
├── (admin)/
│   └── admin/page.tsx            # Admin dashboard (/admin)
└── api/
    ├── tor/
    │   ├── route.ts              # TOR CRUD + search
    │   └── [id]/
    │       ├── route.ts          # Single TOR operations
    │       ├── match/route.ts    # Qualification matching
    │       └── corrections/route.ts  # User corrections
    ├── bookmarks/route.ts        # Bookmark CRUD
    ├── notifications/route.ts    # Notification preferences + history
    ├── profile/route.ts          # Vendor profile CRUD
    ├── admin/
    │   ├── users/route.ts        # Admin user management
    │   └── scraper/route.ts      # Scraper status/control
    ├── pdpa/
    │   ├── export/route.ts       # PDPA data export
    │   ├── delete/route.ts       # PDPA account deletion
    │   └── consent/route.ts      # Consent management
    └── cron/
        ├── scrape/route.ts       # Scraper trigger endpoint
        └── notify/route.ts       # Notification dispatch trigger

lib/
├── db/
│   ├── connection.ts             # MongoDB Atlas connection (singleton)
│   └── models/
│       ├── user.ts               # User model
│       ├── vendor-profile.ts     # VendorProfile model
│       ├── tor-record.ts         # TORRecord model
│       ├── tor-source.ts         # TORSource model
│       ├── bookmark.ts           # Bookmark model
│       ├── notification.ts       # Notification model
│       ├── user-correction.ts    # UserCorrection model
│       ├── consent-record.ts     # ConsentRecord model
│       └── admin-action-log.ts   # AdminActionLog model
├── services/
│   ├── ai/
│   │   ├── vertex-client.ts      # Vertex AI SDK wrapper
│   │   ├── tor-parser.ts         # TOR PDF → structured JSON
│   │   ├── red-flag-analyzer.ts  # Red-flag detection service
│   │   ├── prompts/              # Versioned extraction prompts
│   │   │   └── v1.ts
│   │   └── circuit-breaker.ts    # Circuit breaker + retry logic
│   ├── scraper/
│   │   ├── scheduler.ts          # Cron-based scrape scheduler
│   │   ├── adapters/
│   │   │   ├── base-adapter.ts   # Abstract scraper adapter
│   │   │   ├── bma-adapter.ts    # BMA portal adapter
│   │   │   └── egp-adapter.ts    # e-GP portal adapter
│   │   ├── deduplicator.ts       # Cross-source de-duplication
│   │   └── robots-checker.ts     # robots.txt compliance
│   ├── matching/
│   │   ├── qualification-matcher.ts  # Profile vs TOR matching
│   │   └── gap-analyzer.ts       # Gap analysis for failing criteria
│   ├── notifications/
│   │   ├── dispatcher.ts         # Multi-channel dispatch orchestrator
│   │   ├── channels/
│   │   │   ├── in-app.ts         # In-app notification channel
│   │   │   ├── email.ts          # Email channel (Nodemailer)
│   │   │   └── line.ts           # LINE Messaging API channel
│   │   └── templates/            # Notification templates
│   └── pdpa/
│       ├── data-exporter.ts      # PDPA data export service
│       ├── data-deleter.ts       # PDPA deletion service
│       └── consent-manager.ts    # Consent tracking service
├── auth/
│   ├── auth-options.ts           # NextAuth configuration
│   └── middleware.ts             # Auth + PDPA consent middleware
├── theme/
│   ├── mui-theme.ts              # MUI theme (from DESIGN.md tokens)
│   └── tailwind-tokens.ts        # Tailwind design tokens
└── utils/
    ├── date-converter.ts         # Buddhist Era ↔ Gregorian conversion
    ├── currency-formatter.ts     # Thai Baht formatting
    └── i18n.ts                   # Thai/English internationalisation

components/
├── layout/
│   ├── Sidebar.tsx               # Persistent 260px sidebar navigation
│   ├── TopBar.tsx                # Top navigation bar
│   └── MobileNav.tsx             # Mobile hamburger navigation
├── tor/
│   ├── TORCard.tsx               # Procurement listing card
│   ├── TORDetail.tsx             # Full TOR detail view
│   ├── TORTable.tsx              # Comparison table view
│   ├── ConfidenceBadge.tsx       # AI confidence score indicator
│   ├── RedFlagList.tsx           # Red-flag clause display
│   └── MatchSummary.tsx          # Eligibility pass/fail summary
├── profile/
│   ├── ProfileForm.tsx           # Company profile form
│   └── QualificationGrid.tsx     # Per-criterion match grid
├── search/
│   ├── SearchBar.tsx             # Full-text search input
│   └── FilterPanel.tsx           # Multi-facet filter sidebar
├── notifications/
│   ├── AlertSettings.tsx         # Channel preference toggles
│   └── NotificationBell.tsx      # In-app notification indicator
├── bookmarks/
│   ├── BookmarkButton.tsx        # Bookmark toggle icon
│   └── BookmarkList.tsx          # Saved opportunities list
├── admin/
│   ├── UserTable.tsx             # Admin user management table
│   └── ActionDialog.tsx          # Confirm destructive action dialog
├── pdpa/
│   ├── ConsentBanner.tsx         # PDPA consent notice banner
│   ├── DataExportButton.tsx      # Data export trigger
│   └── DeleteAccountDialog.tsx   # Account deletion confirmation
└── shared/
    ├── PillBadge.tsx             # Status pill badge
    ├── EmptyState.tsx            # Empty search/list state
    └── LoadingOverlay.tsx        # AI processing loading state

tests/
├── unit/
│   ├── services/
│   ├── utils/
│   └── models/
├── integration/
│   ├── api/
│   └── services/
└── e2e/
    ├── auth.spec.ts
    ├── search.spec.ts
    ├── profile.spec.ts
    └── bookmarks.spec.ts
```

**Structure Decision**: Next.js App Router monolith with route groups — `(auth)` for login, `(dashboard)` for authenticated user pages with sidebar layout, `(admin)` for admin pages. Service layer under `lib/services/` with clear separation by domain (AI, scraper, matching, notifications, PDPA). Component library under `components/` organised by feature area, matching the UI mockup structure. This is the idiomatic Next.js full-stack pattern that avoids a separate backend, aligning with Constitution Principle II (Tech Stack Consistency).

## Complexity Tracking

> No constitution violations found. No complexity justifications needed.
