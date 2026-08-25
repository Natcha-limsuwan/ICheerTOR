# Quickstart Validation Guide: I Cheer TOR Platform

**Date**: 2026-08-24 | **Spec**: [spec.md](file:///c:/work/collaborative/Software-Process/specs/001-icheertor-platform-baseline/spec.md)

## Prerequisites

| Prerequisite | Details |
|--------------|---------|
| Node.js | v22 LTS |
| MongoDB | Local instance or MongoDB Atlas connection string |
| Google OAuth | Client ID + Client Secret from Google Cloud Console |
| Vertex AI | GCP project with Vertex AI API enabled + service account key |
| LINE (optional) | LINE Messaging API channel access token + channel secret |
| SMTP (optional) | SMTP server credentials for email notifications |

## Environment Setup

Create `.env.local` at project root:

```env
# Database
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/icheertor

# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random-32-char-string>
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>

# Vertex AI
VERTEX_AI_PROJECT_ID=<gcp-project-id>
VERTEX_AI_LOCATION=asia-southeast1
VERTEX_AI_MODEL=gemini-2.0-flash
GOOGLE_APPLICATION_CREDENTIALS=<path-to-service-account-key.json>
AI_CONFIDENCE_THRESHOLD=0.6

# Notifications (optional for MVP validation)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<email>
SMTP_PASS=<app-password>
LINE_CHANNEL_ACCESS_TOKEN=<token>
LINE_CHANNEL_SECRET=<secret>

# Cron Security
CRON_SECRET=<random-string>

# Scraper
SCRAPER_RATE_LIMIT_MS=2000
```

## Setup Commands

```bash
# Install dependencies
npm install

# Generate Prisma/Mongoose types (if applicable)
npm run db:generate

# Run development server
npm run dev
```

Application starts at `http://localhost:3000`.

---

## Validation Scenarios

### VS-1: Google OAuth Sign-In (FR-001, FR-003, FR-004)

1. Open `http://localhost:3000`
2. Verify the landing page renders with the "เข้าสู่ระบบ" (Sign in) button
3. Click "Sign in with Google"
4. Complete Google OAuth flow
5. **Expected**: Redirected to `/dashboard` with user name and avatar displayed in the top bar
6. **Verify DB**: A `User` document exists with `googleId`, `email`, `role: 'user'`, `status: 'active'`

### VS-2: Company Profile CRUD (FR-026, FR-027)

1. Navigate to `/profile`
2. Fill in: company name, company age, at least one past contract, tech stacks, one credential
3. Click Save
4. **Expected**: Success confirmation. Profile data persists on page reload.
5. Update a field (e.g., add a new tech stack) and save
6. **Expected**: Updated data displays correctly
7. **Verify DB**: `VendorProfile` document linked to user's `_id`

### VS-3: TOR Search & Filter (FR-038, FR-039)

1. Navigate to `/procurement`
2. Enter a keyword in the search bar (e.g., "ซอฟต์แวร์")
3. Apply filters: budget range, phase = "bidding"
4. **Expected**: Filtered results display with title, agency, budget, deadline, and match score
5. Click a result to navigate to `/procurement/[id]`
6. **Expected**: Full TOR detail with parsed data, confidence badges, and source attribution link

### VS-4: AI Extraction with Confidence Scores (FR-020, FR-021, FR-022)

1. Trigger a scrape cycle: `curl -X POST http://localhost:3000/api/cron/scrape -H "x-cron-secret: <CRON_SECRET>"`
2. Wait for extraction to complete (check `extractionStatus` in DB)
3. Navigate to a completed TOR listing at `/procurement/[id]`
4. **Expected**: Structured fields displayed with confidence score badges
5. Fields below threshold (0.6) show a warning indicator
6. **Verify DB**: `TORRecord.parsedData` contains all four structured fields with confidence scores

### VS-5: User Correction (FR-023)

1. On a TOR detail page, click "Correct" on a parsed field
2. Enter a corrected value and submit
3. **Expected**: Corrected value replaces the original on the page
4. **Verify DB**: `UserCorrection` document created with `originalValue`, `correctedValue`, `status: 'pending'`

### VS-6: Qualification Matching (FR-028, FR-029, FR-030)

1. Ensure a company profile exists (VS-2)
2. Open a TOR detail page at `/procurement/[id]`
3. **Expected**: Per-criterion pass/fail breakdown displayed
4. Failing criteria show specific gap (e.g., "Company age: 3 years / Required: 5 years — Gap: 2 years")
5. Overall match score badge displayed
6. **Verify API**: `GET /api/tor/[id]/match` returns `criteria` array with `status`, `gap`, `bridgeable`

### VS-7: Bookmark & Deadline Tracking (FR-041, FR-042)

1. On a TOR listing, click the bookmark icon
2. Navigate to `/bookmarks`
3. **Expected**: Bookmarked listing appears with deadline information
4. Click bookmark icon again on the same listing
5. **Expected**: Listing removed from bookmarks page
6. **Verify DB**: `Bookmark` document created/deleted accordingly

### VS-8: Red-Flag Detection (FR-032, FR-033, FR-037)

1. Open a TOR listing in `public_hearing` phase
2. **Expected**: Red-flag section displays flagged clauses with reasons, severity badges, and recommended actions
3. "Submit Feedback" link routes to official portal (external URL)
4. Open a TOR listing in `bidding` phase
5. **Expected**: Red-flag section is suppressed or shows "Not in public-hearing phase"

### VS-9: PDPA Data Export & Deletion (FR-008, FR-009, FR-010)

1. Navigate to data/privacy settings
2. Click "View My Data"
3. **Expected**: All personal data displayed (profile, bookmarks, consent records)
4. Click "Export Data" (JSON format)
5. **Expected**: JSON file downloads containing all personal and company-profile data
6. Click "Delete Account" and confirm with email
7. **Expected**: Confirmation that deletion is scheduled. Account becomes inaccessible.
8. **Verify DB**: `User.deletedAt` is set. Personal data anonymised/removed.

### VS-10: Admin User Management (FR-005, FR-006, FR-007)

1. Log in as an admin user (set `role: 'admin'` in DB for a test account)
2. Navigate to `/admin`
3. **Expected**: User table displays with status and verification columns
4. Select a user and click "Suspend"
5. **Expected**: Confirmation dialog appears
6. Confirm the action
7. **Expected**: User status changes to "suspended" in the table
8. **Verify DB**: `AdminActionLog` document created with action details

### VS-11: Multi-Channel Notifications (FR-045, FR-046, FR-047)

1. Configure notification preferences: enable email and in-app at `/alerts`
2. Trigger a notification event (new TOR match or deadline approaching)
3. **Expected**: In-app notification appears in the notification bell. Email received at user's address.
4. Click on an in-app notification
5. **Expected**: Navigates to the relevant TOR listing. Notification marked as read.

### VS-12: Side-by-Side Comparison (FR-040)

1. On the listing page, select 2+ TOR listings for comparison
2. Click "Compare"
3. Navigate to `/compare`
4. **Expected**: Side-by-side table showing budget, median price, agency, tech stack, eligibility, and deadlines across columns
5. Click a column header to navigate to that TOR's detail page

---

## Smoke Test Checklist

| # | Test | Pass? |
|---|------|-------|
| 1 | Landing page renders at `/` | ☐ |
| 2 | Google OAuth sign-in redirects to `/dashboard` | ☐ |
| 3 | Profile creation/update at `/profile` | ☐ |
| 4 | TOR search and filter at `/procurement` | ☐ |
| 5 | TOR detail with parsed data and confidence scores | ☐ |
| 6 | Qualification matching displays per-criterion results | ☐ |
| 7 | Bookmark toggle works; appears on `/bookmarks` | ☐ |
| 8 | Red flags displayed for `public_hearing` phase TOR | ☐ |
| 9 | PDPA data export downloads JSON/CSV | ☐ |
| 10 | Admin can suspend a user at `/admin` | ☐ |
| 11 | Notification preferences save and persist | ☐ |
| 12 | Side-by-side comparison renders correctly | ☐ |
| 13 | Responsive layout on mobile (<768px) | ☐ |
| 14 | Thai language content displays correctly (UTF-8) | ☐ |
| 15 | Buddhist Era dates display correctly | ☐ |
