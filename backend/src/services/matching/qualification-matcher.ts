import { IVendorProfile } from "../../db/models/vendor-profile";
import { IQualification } from "../../db/models/tor-record";
import { env } from "../../config/env";

/* ─── Types ─────────────────────────────────────────────────────────── */

/**
 * "unknown" means the criterion could not be checked — the TOR value is
 * missing or unparseable, the type is not machine-checkable, or the profile
 * lacks the data. It is never counted as a pass: telling a team it qualifies
 * when we simply do not know is the failure this matcher must avoid.
 */
export type CriterionStatus = "pass" | "fail" | "unknown";

export interface CriterionMatch {
  criterion: string;
  type: string;
  status: CriterionStatus;
  isMandatory: boolean;
  profileValue: number | string | null;
  requiredValue: number | string | null;
  gap: number | string | null;
  bridgeable: boolean | null;
  /** The AI extracted this criterion with low confidence — check the PDF. */
  lowConfidence: boolean;
  /** Why the status is what it is, in Thai, for display. */
  reason: string;
}

/**
 * - eligible:   every mandatory criterion passed
 * - ineligible: at least one mandatory criterion failed
 * - incomplete: nothing failed, but some mandatory criteria could not be checked
 * - unknown:    the TOR has no extracted qualifications yet
 */
export type OverallStatus = "eligible" | "ineligible" | "incomplete" | "unknown";

export interface MatchResult {
  overallStatus: OverallStatus;
  /** passed / checked, over criteria that could be checked. Null when none could. */
  matchScore: number | null;
  counts: { pass: number; fail: number; unknown: number };
  criteria: CriterionMatch[];
}

/* ─── Matcher ───────────────────────────────────────────────────────── */

/**
 * Evaluate a vendor profile against TOR qualifications.
 * Returns per-criterion pass/fail/unknown with gap analysis.
 */
export function matchQualifications(
  profile: IVendorProfile,
  qualifications: IQualification[],
): MatchResult {
  if (qualifications.length === 0) {
    return {
      overallStatus: "unknown",
      matchScore: null,
      counts: { pass: 0, fail: 0, unknown: 0 },
      criteria: [],
    };
  }

  const criteria: CriterionMatch[] = qualifications.map((q) => {
    const base = {
      criterion: q.criterion,
      type: q.type,
      // TOR qualifications are hard requirements unless the PDF says otherwise.
      isMandatory: q.isMandatory ?? true,
      lowConfidence: q.confidence < env.AI_CONFIDENCE_THRESHOLD,
    };
    switch (q.type) {
      case "contract_value":
        return { ...base, ...evaluateContractValue(profile, q) };
      case "company_age":
        return { ...base, ...evaluateCompanyAge(profile, q) };
      case "registered_capital":
        return { ...base, ...evaluateRegisteredCapital(profile, q) };
      case "personnel":
        return { ...base, ...evaluatePersonnel(profile, q) };
      case "tech_stack":
        return { ...base, ...evaluateTechStack(profile, q) };
      case "certification":
        return { ...base, ...evaluateCertification(profile, q) };
      default:
        return {
          ...base,
          ...unknown(q, "ข้อกำหนดประเภทนี้ตรวจอัตโนมัติไม่ได้ — กรุณาอ่านจากเอกสาร"),
        };
    }
  });

  const counts = {
    pass: criteria.filter((c) => c.status === "pass").length,
    fail: criteria.filter((c) => c.status === "fail").length,
    unknown: criteria.filter((c) => c.status === "unknown").length,
  };
  const checked = counts.pass + counts.fail;
  const matchScore = checked > 0 ? counts.pass / checked : null;

  const mandatory = criteria.filter((c) => c.isMandatory);
  let overallStatus: OverallStatus;
  if (mandatory.some((c) => c.status === "fail")) overallStatus = "ineligible";
  else if (mandatory.some((c) => c.status === "unknown")) overallStatus = "incomplete";
  else overallStatus = "eligible";

  return { overallStatus, matchScore, counts, criteria };
}

/* ─── Evaluators ────────────────────────────────────────────────────── */

type Evaluation = Pick<
  CriterionMatch,
  "status" | "profileValue" | "requiredValue" | "gap" | "bridgeable" | "reason"
>;

function unknown(q: IQualification, reason: string, profileValue: number | string | null = null): Evaluation {
  return {
    status: "unknown",
    profileValue,
    requiredValue: q.minimumValue ?? null,
    gap: null,
    bridgeable: null,
    reason,
  };
}

function requiredNumber(q: IQualification): number | null {
  return typeof q.minimumValue === "number" && Number.isFinite(q.minimumValue) && q.minimumValue > 0
    ? q.minimumValue
    : null;
}

/** Compare a numeric threshold; `bridgeable` decides whether a gap is close enough to close. */
function compareNumber(
  required: number,
  profileValue: number,
  bridgeable: (gap: number) => boolean,
  unitLabel: string,
): Evaluation {
  const pass = profileValue >= required;
  const gap = pass ? null : required - profileValue;
  return {
    status: pass ? "pass" : "fail",
    profileValue,
    requiredValue: required,
    gap,
    bridgeable: gap !== null ? bridgeable(gap) : null,
    reason: pass
      ? `ผ่าน (${profileValue.toLocaleString("th-TH")} ≥ ${required.toLocaleString("th-TH")} ${unitLabel})`
      : `ขาดอีก ${gap!.toLocaleString("th-TH")} ${unitLabel}`,
  };
}

function evaluateContractValue(profile: IVendorProfile, q: IQualification): Evaluation {
  const required = requiredNumber(q);
  if (required === null) return unknown(q, "อ่านมูลค่าผลงานขั้นต่ำจาก TOR ไม่ได้");
  if (!profile.pastContracts?.length) {
    return unknown(q, "ยังไม่ได้กรอกผลงานที่ผ่านมาในโปรไฟล์");
  }
  return compareNumber(required, profile.maxContractValue ?? 0, (gap) => gap / required < 0.3, "บาท");
}

function evaluateCompanyAge(profile: IVendorProfile, q: IQualification): Evaluation {
  const required = requiredNumber(q);
  if (required === null) return unknown(q, "อ่านอายุบริษัทขั้นต่ำจาก TOR ไม่ได้");
  // foundedYear stays correct over time; companyAge is whatever was typed in.
  const age = profile.foundedYear
    ? new Date().getFullYear() - profile.foundedYear
    : profile.companyAge;
  if (age == null) return unknown(q, "ยังไม่ได้กรอกปีที่ก่อตั้งในโปรไฟล์");
  return compareNumber(required, age, (gap) => gap <= 2, "ปี");
}

function evaluateRegisteredCapital(profile: IVendorProfile, q: IQualification): Evaluation {
  const required = requiredNumber(q);
  if (required === null) return unknown(q, "อ่านทุนจดทะเบียนขั้นต่ำจาก TOR ไม่ได้");
  if (profile.registeredCapital == null) {
    return unknown(q, "ยังไม่ได้กรอกทุนจดทะเบียนในโปรไฟล์");
  }
  // Raising registered capital is a paperwork step, so a modest gap is closable.
  return compareNumber(required, profile.registeredCapital, (gap) => gap / required < 0.5, "บาท");
}

/**
 * Personnel criteria read like "ผู้จัดการโครงการ อย่างน้อย 1 คน". The role is
 * only in free text, so a profile role is matched by name inside the
 * criterion; with no role match the result is unknown rather than a guess.
 */
function evaluatePersonnel(profile: IVendorProfile, q: IQualification): Evaluation {
  const required = requiredNumber(q);
  if (required === null) return unknown(q, "อ่านจำนวนบุคลากรขั้นต่ำจาก TOR ไม่ได้");
  if (!profile.personnel?.length) {
    return unknown(q, "ยังไม่ได้กรอกข้อมูลบุคลากรในโปรไฟล์");
  }
  const text = q.criterion.toLowerCase();
  const matched = profile.personnel.filter(
    (p) => p.role.trim() !== "" && text.includes(p.role.trim().toLowerCase()),
  );
  if (matched.length === 0) {
    return unknown(q, "ไม่พบตำแหน่งในโปรไฟล์ที่ตรงกับข้อกำหนดนี้ — กรุณาตรวจสอบเอง");
  }
  const count = matched.reduce((sum, p) => sum + p.count, 0);
  return compareNumber(required, count, () => true, "คน");
}

function evaluateTechStack(profile: IVendorProfile, q: IQualification): Evaluation {
  const required = typeof q.minimumValue === "string"
    ? q.minimumValue.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];
  if (required.length === 0) return unknown(q, "อ่านเทคโนโลยีที่ต้องการจาก TOR ไม่ได้");

  const profileStacks = (profile.techStacks ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (profileStacks.length === 0) {
    return unknown(q, "ยังไม่ได้กรอก tech stack ในโปรไฟล์");
  }

  const missing = required.filter(
    (r) => !profileStacks.some((p) => p.includes(r) || r.includes(p)),
  );
  const pass = missing.length === 0;

  return {
    status: pass ? "pass" : "fail",
    profileValue: profile.techStacks.join(", "),
    requiredValue: q.minimumValue ?? null,
    gap: pass ? null : `ขาด: ${missing.join(", ")}`,
    bridgeable: pass ? null : true, // Tech can always be acquired
    reason: pass ? "มีเทคโนโลยีครบ" : `ขาด ${missing.join(", ")}`,
  };
}

function evaluateCertification(profile: IVendorProfile, q: IQualification): Evaluation {
  const required = typeof q.minimumValue === "string" ? q.minimumValue.trim().toLowerCase() : "";
  if (!required) return unknown(q, "อ่านชื่อใบรับรองจาก TOR ไม่ได้");

  const creds = (profile.credentials ?? [])
    .map((c) => c.name.trim().toLowerCase())
    .filter(Boolean);
  const pass = creds.some((c) => c.includes(required) || required.includes(c));

  return {
    status: pass ? "pass" : "fail",
    profileValue: profile.credentials.map((c) => c.name).join(", ") || "ไม่มี",
    requiredValue: q.minimumValue ?? null,
    gap: pass ? null : `ขาด: ${q.minimumValue}`,
    bridgeable: pass ? null : true, // Certifications can be obtained
    reason: pass ? "มีใบรับรองตามที่กำหนด" : `ยังไม่มี ${q.minimumValue}`,
  };
}
