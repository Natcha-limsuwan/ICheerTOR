import { z } from "zod";

/**
 * Request schemas: the documented input-validation rules of the API
 * (ASVS V2.1.1). One schema per endpoint that takes input; see
 * middleware/validate.ts for how they are applied.
 *
 * Conventions
 * - Query values are strings (Express 5 "simple" parser; no nested objects).
 *   A repeated key arrives as an array and is rejected.
 * - Small JSON bodies are .strict(): an unknown field is a 400.
 * - The vendor profile body strips unknown fields instead, because the form
 *   sends back the object it loaded (with _id, userId, timestamps); stripping
 *   still guarantees those fields are never written (mass assignment).
 */

/* ─── Building blocks ───────────────────────────────────────────────── */

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "must be a valid id");
const text = (max: number) => z.string().trim().max(max).refine((value) => !value.includes("\0"), "must not contain null bytes");
const requiredText = (max: number) => z.string().trim().min(1).max(max).refine((value) => !value.includes("\0"), "must not contain null bytes");
const page = z.string().regex(/^[1-9]\d{0,5}$/, "must be a positive integer").optional();
/** limit=0 would mean "no limit" to MongoDB, so it must start at 1. */
const limit = z.string().regex(/^[1-9]\d{0,2}$/, "must be 1-999").optional();
const boolFlag = z.enum(["true", "false"]).optional();
const nonNegativeAmount = z
  .string()
  .regex(/^\d{1,13}(\.\d{1,2})?$/, "must be a number ≥ 0")
  .optional()
  .or(z.literal(""));
const money = z.number().finite().min(0).max(1e13);

export const paginationQuery = z.object({ page, limit });

/* ─── Auth ──────────────────────────────────────────────────────────── */

export const googleStartQuery = z.object({
  browserChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();

export const exchangeBody = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  browserVerifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();

/* ─── TOR ───────────────────────────────────────────────────────────── */

export const torListQuery = z.object({
  q: text(200).optional(),
  agency: text(200).optional(),
  budgetMin: nonNegativeAmount,
  budgetMax: nonNegativeAmount,
  phase: z.enum(["public_hearing", "bidding", "awarded", "cancelled"]).optional().or(z.literal("")),
  status: z.enum(["open", "closed"]).optional().or(z.literal("")),
  openOnly: boolFlag,
  needsCheck: boolFlag,
  includeMatch: boolFlag,
  techStack: text(500).optional(),
  scope: z.enum(["parsed", "new", "all"]).optional(),
  sortBy: z.enum(["announcedDate", "postingDate", "medianPrice", "publicHearingEnd", "submissionDeadline"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  page,
  limit,
});

/** Dotted path into a TOR record; prototype keys can never be traversed. */
const fieldPath = z
  .string()
  .max(200)
  .regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+){0,7}$/, "must be a dotted field path")
  .refine((p) => !p.split(".").some((part) => ["__proto__", "prototype", "constructor"].includes(part)), "invalid field path");

export const correctionBody = z
  .object({
    fieldPath,
    correctedValue: z.union([z.string().max(5000), z.number().finite(), z.boolean(), z.null()]),
  })
  .strict();

/* ─── Bookmarks ─────────────────────────────────────────────────────── */

export const bookmarkCreateBody = z
  .object({ torRecordId: objectId, notes: text(500).optional() })
  .strict();

/* ─── Notifications ─────────────────────────────────────────────────── */

export const notificationListQuery = z.object({ unreadOnly: boolFlag, page, limit });

export const notificationPrefsBody = z
  .object({ inApp: z.boolean().optional(), email: z.boolean().optional() })
  .strict()
  .refine((b) => b.inApp !== undefined || b.email !== undefined, "inApp or email is required");

/* ─── PDPA ──────────────────────────────────────────────────────────── */

export const consentBody = z
  .object({
    purpose: z.string().regex(/^[a-z][a-z0-9_]{1,49}$/, "must be a purpose identifier"),
    granted: z.boolean(),
    scope: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/).optional(),
  })
  .strict();

export const deleteAccountBody = z.object({ confirmEmail: z.string().max(320) }).strict();

export const exportQuery = z.object({ format: z.enum(["json"]).optional() });

/* ─── Vendor profile ────────────────────────────────────────────────── */

const pastContract = z.object({
  description: requiredText(1000),
  value: money,
  year: z.number().int().min(1900).max(2200),
  agencyName: text(300).optional().nullable(),
  agencyType: z.enum(["government", "private", "unknown"]).optional(),
});

const credential = z.object({
  name: requiredText(300),
  issuedBy: text(300).optional().nullable(),
  expiresAt: z.union([z.string().max(40), z.null()]).optional(),
});

const personnel = z.object({
  role: requiredText(200),
  count: z.number().int().min(0).max(100000),
  certifications: z.array(text(100)).max(50).default([]),
});

const profileFields = {
  companyName: requiredText(300),
  companyAge: z.number().finite().min(0).max(500),
  foundedYear: z.number().int().min(1900).max(2100).nullish(),
  registeredCapital: money.nullish(),
  pastContracts: z.array(pastContract).max(200),
  techStacks: z.array(text(100)).max(100),
  interestedCategories: z.array(text(100)).max(100),
  credentials: z.array(credential).max(100),
  teamSize: z.number().int().min(0).max(1000000).nullish(),
  personnel: z.array(personnel).max(100),
};

/** Unknown keys (userId, _id, maxContractValue, timestamps…) are stripped, never written. */
export const profileCreateBody = z.object({
  ...profileFields,
  pastContracts: profileFields.pastContracts.default([]),
  techStacks: profileFields.techStacks.default([]),
  interestedCategories: profileFields.interestedCategories.default([]),
  credentials: profileFields.credentials.default([]),
  personnel: profileFields.personnel.default([]),
});

export const profileUpdateBody = z.object(profileFields).partial();

/* ─── Admin ─────────────────────────────────────────────────────────── */

const reason = text(500).optional();

export const adminUsersQuery = z.object({
  status: z.enum(["pending", "active", "suspended", "banned"]).optional().or(z.literal("")),
  role: z.enum(["user", "admin", "developer"]).optional().or(z.literal("")),
  q: text(100).optional(),
  page,
  limit: z.string().regex(/^[1-9]\d{0,3}$/, "must be 1-9999").optional(),
});

export const adminUserActionBody = z
  .object({ action: z.enum(["approve", "verify", "suspend", "ban", "reinstate"]), reason })
  .strict();

export const adminRoleBody = z.object({ role: z.enum(["user", "admin", "developer"]), reason }).strict();

export const adminLogsQuery = z.object({
  action: z.string().regex(/^[a-z_]{1,50}$/).optional().or(z.literal("")),
  page,
  limit,
});

export const torReviewQuery = z.object({
  status: z.enum(["pending", "verified", "outdated", "all"]).optional(),
  page,
  limit,
});

/** `changes` is checked field by field by services/tor-review.ts parseChanges(). */
export const torReviewBody = z
  .object({
    changes: z.record(z.string().max(100), z.unknown()).default({}),
    note: text(1000).optional().nullable(),
    verify: z.boolean().optional(),
    dryRun: z.boolean().optional(),
    /** record.updatedAt from GET /tor-review/:id; a mismatch returns 409 instead of verifying newer content. */
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict();

export const torCheckResolveBody = z.object({ note: text(1000).optional().nullable() }).strict();
