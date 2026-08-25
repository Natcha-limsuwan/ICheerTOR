# API Route Contracts: I Cheer TOR Platform

**Date**: 2026-08-24 | **Spec**: [spec.md](file:///c:/work/collaborative/Software-Process/specs/001-icheertor-platform-baseline/spec.md)

All endpoints are Next.js API Routes under `/app/api/`. Authentication is enforced via NextAuth.js middleware. Responses follow a consistent envelope format.

## Response Envelope

```json
// Success
{ "data": <payload>, "meta": { "total": 100, "page": 1, "limit": 20 } }

// Error
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

**HTTP Status Codes**: `200` success, `201` created, `400` validation error, `401` unauthenticated, `403` forbidden, `404` not found, `429` rate limited, `500` internal error.

---

## Authentication

### `GET /api/auth/[...nextauth]`
NextAuth.js handler. Manages OAuth flow, session, CSRF.

### `GET /api/auth/session`
Returns current session. `null` if unauthenticated.

---

## TOR Records

### `GET /api/tor`
Search and list TOR records with filtering.

**Query Parameters**:

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Full-text search query |
| `agency` | string | Filter by agency name |
| `budgetMin` | number | Minimum budget (THB) |
| `budgetMax` | number | Maximum budget (THB) |
| `phase` | string | Filter by phase (`public_hearing`, `bidding`, `awarded`) |
| `techStack` | string | Comma-separated tech stack filter |
| `eligibility` | string | `eligible`, `ineligible`, `partial` |
| `sortBy` | string | `postingDate`, `budget`, `deadline`, `matchScore` |
| `sortOrder` | string | `asc`, `desc` (default: `desc`) |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |

**Response** (200):
```json
{
  "data": [{
    "_id": "...",
    "title": "ระบบจัดการข้อมูลเมืองอัจฉริยะ",
    "agencyName": "สำนักยุทธศาสตร์และประเมินผล",
    "phase": "bidding",
    "medianPrice": 5000000,
    "budget": 5500000,
    "postingDate": "2026-08-01T00:00:00Z",
    "submissionDeadline": "2026-09-15T17:00:00Z",
    "sourceUrl": "https://...",
    "officialPortalUrl": "https://...",
    "extractionStatus": "completed",
    "matchScore": 0.85,
    "tags": ["React", "Node.js", "MongoDB"]
  }],
  "meta": { "total": 342, "page": 1, "limit": 20 }
}
```

**Auth**: Required (User or Admin)

---

### `GET /api/tor/[id]`
Get full TOR detail including parsed data and red flags.

**Response** (200):
```json
{
  "data": {
    "_id": "...",
    "title": "...",
    "agencyName": "...",
    "phase": "public_hearing",
    "medianPrice": 5000000,
    "parsedData": {
      "scopeOfWork": { "content": "...", "confidence": 0.92 },
      "qualifications": [
        { "criterion": "ทุนจดทะเบียน ≥ 5,000,000 บาท", "minimumValue": 5000000, "type": "contract_value", "confidence": 0.88 }
      ],
      "medianPrice": { "value": 5000000, "confidence": 0.95 },
      "evaluationCriteria": { "content": "...", "confidence": 0.85 }
    },
    "redFlags": [
      { "clauseText": "...", "reason": "...", "severity": "warning", "recommendedAction": "..." }
    ],
    "sources": [
      { "portalName": "bma", "sourceUrl": "...", "scrapedAt": "..." }
    ]
  }
}
```

**Auth**: Required

---

### `GET /api/tor/[id]/match`
Get qualification match analysis for current user's profile against this TOR.

**Response** (200):
```json
{
  "data": {
    "torRecordId": "...",
    "overallStatus": "partial",
    "matchScore": 0.75,
    "criteria": [
      {
        "criterion": "ทุนจดทะเบียน ≥ 5,000,000 บาท",
        "type": "contract_value",
        "status": "pass",
        "profileValue": 7500000,
        "requiredValue": 5000000,
        "gap": null,
        "bridgeable": null
      },
      {
        "criterion": "อายุบริษัท ≥ 5 ปี",
        "type": "company_age",
        "status": "fail",
        "profileValue": 3,
        "requiredValue": 5,
        "gap": 2,
        "bridgeable": true
      }
    ]
  }
}
```

**Auth**: Required. Returns `400` if user has no vendor profile.

---

### `POST /api/tor/[id]/corrections`
Submit a correction for a parsed field.

**Request Body**:
```json
{
  "fieldPath": "parsedData.medianPrice.value",
  "correctedValue": 4800000
}
```

**Response** (201):
```json
{
  "data": {
    "_id": "...",
    "fieldPath": "parsedData.medianPrice.value",
    "originalValue": 5000000,
    "correctedValue": 4800000,
    "status": "pending"
  }
}
```

**Auth**: Required

---

## Vendor Profile

### `GET /api/profile`
Get current user's vendor profile.

**Response** (200): Full `VendorProfile` document. `404` if no profile exists.

### `POST /api/profile`
Create vendor profile.

**Request Body**:
```json
{
  "companyName": "บริษัท เทคโนโลยี จำกัด",
  "companyAge": 5,
  "pastContracts": [
    { "description": "ระบบบริหาร...", "value": 3000000, "year": 2025, "agencyName": "สำนัก..." }
  ],
  "techStacks": ["React", "Node.js", "MongoDB", "Python"],
  "credentials": [
    { "name": "ISO 27001", "issuedBy": "BSI", "expiresAt": "2027-12-31" }
  ],
  "teamSize": 15
}
```

**Response** (201): Created `VendorProfile`. `409` if profile already exists.

### `PUT /api/profile`
Update vendor profile. Same body as POST (partial updates supported).

**Response** (200): Updated `VendorProfile`.

**Auth**: Required. Owner-only (enforced by session user ID).

---

## Bookmarks

### `GET /api/bookmarks`
List current user's bookmarks with populated TOR summary.

**Query Parameters**: `page`, `limit`, `sortBy` (`createdAt`, `deadline`)

**Response** (200): Array of bookmarks with embedded TOR summaries.

### `POST /api/bookmarks`
Create a bookmark.

**Request Body**:
```json
{ "torRecordId": "...", "notes": "ดูน่าสนใจ" }
```

**Response** (201): Created bookmark. `409` if already bookmarked.

### `DELETE /api/bookmarks/[id]`
Remove a bookmark.

**Response** (200): `{ "data": { "deleted": true } }`. Owner-only.

---

## Notifications

### `GET /api/notifications`
List current user's notifications.

**Query Parameters**: `unreadOnly` (boolean), `type`, `page`, `limit`

**Response** (200): Array of notifications, most recent first.

### `PATCH /api/notifications/[id]/read`
Mark a notification as read.

**Response** (200): Updated notification with `readAt` timestamp.

### `PUT /api/notifications/preferences`
Update notification channel preferences.

**Request Body**:
```json
{
  "inApp": true,
  "email": true,
  "line": false,
  "lineUserId": null
}
```

**Response** (200): Updated user notification preferences.

---

## PDPA

### `GET /api/pdpa/export`
Export all personal data for current user (PDPA data access).

**Query Parameters**: `format` (`json` or `csv`, default: `json`)

**Response** (200): Downloadable file containing all user data (profile, bookmarks, corrections, consent records, notification preferences).

### `POST /api/pdpa/delete`
Request account deletion (PDPA right to erasure).

**Request Body**:
```json
{ "confirmEmail": "user@example.com" }
```

**Response** (200): `{ "data": { "scheduledAt": "...", "completionBy": "..." } }`

### `GET /api/pdpa/consent`
Get current consent status for all purposes.

**Response** (200): Array of consent records with current status per purpose.

### `POST /api/pdpa/consent`
Grant or revoke consent.

**Request Body**:
```json
{ "purpose": "profile_matching", "granted": true }
```

**Response** (201): Created consent record.

---

## Admin

### `GET /api/admin/users`
List all users with status and verification flags.

**Query Parameters**: `status`, `role`, `q` (search by name/email), `page`, `limit`

**Response** (200): Paginated user list. **Auth**: Admin only.

### `PATCH /api/admin/users/[id]`
Update user status (approve, verify, suspend, ban, reinstate).

**Request Body**:
```json
{ "action": "suspend", "reason": "Policy violation" }
```

**Response** (200): Updated user. Creates `AdminActionLog` entry. **Auth**: Admin only.

### `GET /api/admin/scraper`
Get scraper status and recent run history.

**Response** (200): Scraper health, last run timestamps, error counts per portal. **Auth**: Admin only.

---

## Cron Triggers

### `POST /api/cron/scrape`
Trigger a scraping cycle. Secured via cron secret header.

**Headers**: `x-cron-secret: <CRON_SECRET>`

**Response** (200): `{ "data": { "jobId": "...", "status": "started" } }`

### `POST /api/cron/notify`
Trigger notification dispatch for pending events. Secured via cron secret.

**Response** (200): `{ "data": { "dispatched": 15 } }`
