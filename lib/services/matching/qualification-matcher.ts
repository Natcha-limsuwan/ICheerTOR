import { IVendorProfile } from "@/lib/db/models/vendor-profile";
import { IQualification } from "@/lib/db/models/tor-record";

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface CriterionMatch {
  criterion: string;
  type: string;
  status: "pass" | "fail";
  profileValue: number | string | null;
  requiredValue: number | string | null;
  gap: number | string | null;
  bridgeable: boolean | null;
}

export interface MatchResult {
  overallStatus: "eligible" | "ineligible" | "partial";
  matchScore: number;
  criteria: CriterionMatch[];
}

/* ─── Matcher ───────────────────────────────────────────────────────── */

/**
 * Evaluate a vendor profile against TOR qualifications.
 * Returns per-criterion pass/fail with gap analysis.
 */
export function matchQualifications(
  profile: IVendorProfile,
  qualifications: IQualification[],
): MatchResult {
  if (qualifications.length === 0) {
    return { overallStatus: "eligible", matchScore: 1.0, criteria: [] };
  }

  const criteria: CriterionMatch[] = qualifications.map((q) => {
    switch (q.type) {
      case "contract_value":
        return evaluateContractValue(profile, q);
      case "company_age":
        return evaluateCompanyAge(profile, q);
      case "tech_stack":
        return evaluateTechStack(profile, q);
      case "certification":
        return evaluateCertification(profile, q);
      default:
        return {
          criterion: q.criterion,
          type: q.type,
          status: "pass" as const,
          profileValue: null,
          requiredValue: q.minimumValue ?? null,
          gap: null,
          bridgeable: null,
        };
    }
  });

  const passCount = criteria.filter((c) => c.status === "pass").length;
  const matchScore = passCount / criteria.length;

  let overallStatus: "eligible" | "ineligible" | "partial";
  if (matchScore === 1) overallStatus = "eligible";
  else if (matchScore === 0) overallStatus = "ineligible";
  else overallStatus = "partial";

  return { overallStatus, matchScore, criteria };
}

/* ─── Evaluators ────────────────────────────────────────────────────── */

function evaluateContractValue(
  profile: IVendorProfile,
  q: IQualification,
): CriterionMatch {
  const required = typeof q.minimumValue === "number" ? q.minimumValue : 0;
  const profileValue = profile.maxContractValue ?? 0;
  const pass = profileValue >= required;
  const gap = pass ? null : required - profileValue;

  return {
    criterion: q.criterion,
    type: q.type,
    status: pass ? "pass" : "fail",
    profileValue,
    requiredValue: required,
    gap,
    bridgeable: gap !== null ? gap / required < 0.3 : null, // bridgeable if gap < 30%
  };
}

function evaluateCompanyAge(
  profile: IVendorProfile,
  q: IQualification,
): CriterionMatch {
  const required = typeof q.minimumValue === "number" ? q.minimumValue : 0;
  const profileValue = profile.companyAge ?? 0;
  const pass = profileValue >= required;
  const gap = pass ? null : required - profileValue;

  return {
    criterion: q.criterion,
    type: q.type,
    status: pass ? "pass" : "fail",
    profileValue,
    requiredValue: required,
    gap,
    bridgeable: gap !== null ? gap <= 2 : null, // bridgeable if gap ≤ 2 years
  };
}

function evaluateTechStack(
  profile: IVendorProfile,
  q: IQualification,
): CriterionMatch {
  const required = typeof q.minimumValue === "string"
    ? q.minimumValue.split(",").map((s) => s.trim().toLowerCase())
    : [];
  const profileStacks = (profile.techStacks ?? []).map((s) => s.toLowerCase());
  const matched = required.filter((r) =>
    profileStacks.some((p) => p.includes(r) || r.includes(p)),
  );
  const pass = matched.length >= required.length;

  return {
    criterion: q.criterion,
    type: q.type,
    status: pass ? "pass" : "fail",
    profileValue: profile.techStacks.join(", "),
    requiredValue: q.minimumValue ?? null,
    gap: pass ? null : `ขาด: ${required.filter((r) => !matched.includes(r)).join(", ")}`,
    bridgeable: true, // Tech can always be acquired
  };
}

function evaluateCertification(
  profile: IVendorProfile,
  q: IQualification,
): CriterionMatch {
  const required = typeof q.minimumValue === "string" ? q.minimumValue.toLowerCase() : "";
  const creds = (profile.credentials ?? []).map((c) => c.name.toLowerCase());
  const pass = creds.some((c) => c.includes(required) || required.includes(c));

  return {
    criterion: q.criterion,
    type: q.type,
    status: pass ? "pass" : "fail",
    profileValue: profile.credentials.map((c) => c.name).join(", ") || "ไม่มี",
    requiredValue: q.minimumValue ?? null,
    gap: pass ? null : `ขาด: ${q.minimumValue}`,
    bridgeable: true, // Certifications can be obtained
  };
}
