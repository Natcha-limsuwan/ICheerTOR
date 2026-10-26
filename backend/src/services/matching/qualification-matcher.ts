import { IVendorProfile } from "../../db/models/vendor-profile";
import { IQualification, ITechRequirement, WorkType } from "../../db/models/tor-record";
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
  /** Criteria sharing a label are alternatives: one pass satisfies the group. */
  alternativeGroup: string | null;
  /** Why the status is what it is, in Thai, for display. */
  reason: string;
}

/**
 * Mandatory criteria are judged per requirement: an alternative group (e.g.
 * net worth OR registered capital OR deposit OR credit line) counts as one,
 * passing when any member passes and failing only when every member fails.
 *
 * - eligible:   every mandatory criterion passed
 * - ineligible: at least one mandatory criterion failed
 * - incomplete: nothing failed, but some mandatory criteria could not be checked
 * - unknown:    the TOR has no extracted qualifications yet
 */
export type OverallStatus = "eligible" | "ineligible" | "incomplete" | "unknown";

export type MatchDimension = "experience" | "technology" | "personnel" | "capacity" | "preference";

export interface MatchContext {
  title?: string | null;
  scopeOfWork?: string | null;
  workType?: WorkType | null;
  budget?: number | null;
  contractDurationDays?: number | null;
  techRequirements?: ITechRequirement[];
}

export interface MatchBreakdownItem {
  label: string;
  /** Relative contribution to the fit score before inapplicable dimensions are removed. */
  weight: number;
  /** 0–1, or null when the vendor profile has no evidence for this dimension. */
  score: number | null;
  /** 0–1: how much of this dimension could be checked from available evidence. */
  coverage: number;
  /** False means this TOR does not ask for anything in this dimension. */
  applicable: boolean;
  reasons: string[];
}

export interface MatchResult {
  overallStatus: OverallStatus;
  /** Explicit alias used by newer clients; overallStatus remains for compatibility. */
  eligibilityStatus: OverallStatus;
  /**
   * Conservative 0–1 fit score. Unknown evidence contributes a neutral 0.5,
   * so one known pass can never masquerade as a 100% match.
   */
  matchScore: number | null;
  /** Alias for matchScore that makes the API meaning unambiguous. */
  fitScore: number | null;
  /** Weighted proportion of the applicable fit evidence that could be checked. */
  dataCoverage: number;
  breakdown: Record<MatchDimension, MatchBreakdownItem>;
  counts: { pass: number; fail: number; unknown: number };
  criteria: CriterionMatch[];
  /**
   * Standard clauses every BMA TOR has (legal capacity, not bankrupt, e-GP
   * registration…). Self-declared by the bidder, so not checked here.
   */
  standardClausesSkipped: number;
}

/* ─── Matcher ───────────────────────────────────────────────────────── */

/**
 * Evaluate a vendor profile against TOR qualifications.
 * Returns per-criterion pass/fail/unknown with gap analysis.
 */
export function matchQualifications(
  profile: IVendorProfile,
  qualifications: IQualification[],
  context: MatchContext = {},
): MatchResult {
  const checkable = qualifications.filter((q) => !q.isBoilerplate);
  const standardClausesSkipped = qualifications.length - checkable.length;

  const criteria: CriterionMatch[] = checkable.map((q) => {
    const base = {
      criterion: q.criterion,
      type: q.type,
      // TOR qualifications are hard requirements unless the PDF says otherwise.
      isMandatory: q.isMandatory ?? true,
      lowConfidence: q.confidence < env.AI_CONFIDENCE_THRESHOLD,
      alternativeGroup: q.alternativeGroup ?? null,
    };
    switch (q.type) {
      case "contract_value":
        return { ...base, ...evaluateContractValue(profile, q, context) };
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

  // A group of alternatives is one requirement, not several chances to add
  // points.  For example, "net worth OR registered capital OR credit line"
  // must count once whether one, two, or all of its alternatives pass.
  // Keep `criteria` uncollapsed for the explanation UI, but calculate the
  // score and its displayed denominator from logical requirements.
  const scoreStatuses = requirementStatuses(criteria);
  const counts = {
    pass: scoreStatuses.filter((status) => status === "pass").length,
    fail: scoreStatuses.filter((status) => status === "fail").length,
    unknown: scoreStatuses.filter((status) => status === "unknown").length,
  };
  const requirements = requirementStatuses(criteria.filter((c) => c.isMandatory));
  let overallStatus: OverallStatus;
  if (checkable.length === 0) overallStatus = "unknown";
  else if (requirements.length === 0) overallStatus = "eligible";
  else if (requirements.includes("fail")) overallStatus = "ineligible";
  else if (requirements.includes("unknown")) overallStatus = "incomplete";
  else overallStatus = "eligible";

  const breakdown = buildFitBreakdown(profile, qualifications, criteria, context);
  const applicable = Object.values(breakdown).filter((item) => item.applicable);
  const applicableWeight = applicable.reduce((sum, item) => sum + item.weight, 0);
  const coveredWeight = applicable.reduce((sum, item) => sum + item.weight * item.coverage, 0);
  const dataCoverage = applicableWeight > 0 ? coveredWeight / applicableWeight : 0;
  const matchScore = dataCoverage > 0
    ? applicable.reduce((sum, item) => {
        const known = item.score ?? 0.5;
        // Missing evidence is neutral, not a pass. Partial evidence blends the
        // known result with that neutral prior and is exposed via dataCoverage.
        const adjusted = known * item.coverage + 0.5 * (1 - item.coverage);
        return sum + item.weight * adjusted;
      }, 0) / applicableWeight
    : null;

  return {
    overallStatus,
    eligibilityStatus: overallStatus,
    matchScore,
    fitScore: matchScore,
    dataCoverage,
    breakdown,
    counts,
    criteria,
    standardClausesSkipped,
  };
}

const DIMENSION_META: Record<MatchDimension, { label: string; weight: number }> = {
  experience: { label: "ผลงานใกล้เคียง", weight: 30 },
  technology: { label: "เทคโนโลยีและมาตรฐาน", weight: 25 },
  personnel: { label: "บุคลากรและใบรับรอง", weight: 20 },
  capacity: { label: "ความสามารถรองรับโครงการ", weight: 15 },
  preference: { label: "ประเภทงานที่สนใจ", weight: 10 },
};

type DimensionEvaluation = Omit<MatchBreakdownItem, "label" | "weight">;

function dimension(name: MatchDimension, evaluation: DimensionEvaluation): MatchBreakdownItem {
  return { ...DIMENSION_META[name], ...evaluation };
}

function buildFitBreakdown(
  profile: IVendorProfile,
  qualifications: IQualification[],
  criteria: CriterionMatch[],
  context: MatchContext,
): Record<MatchDimension, MatchBreakdownItem> {
  return {
    experience: dimension("experience", scoreExperience(profile, qualifications, context)),
    technology: dimension("technology", scoreTechnology(profile, qualifications, context)),
    personnel: dimension("personnel", scorePersonnel(criteria, qualifications)),
    capacity: dimension("capacity", scoreCapacity(profile, qualifications, context)),
    preference: dimension("preference", scorePreference(profile, context)),
  };
}

function scoreExperience(
  profile: IVendorProfile,
  qualifications: IQualification[],
  context: MatchContext,
): DimensionEvaluation {
  const required = qualifications
    .filter((q) => q.type === "contract_value")
    .map(requiredNumber)
    .filter((value): value is number => value != null)
    .reduce<number | null>((largest, value) => largest == null ? value : Math.max(largest, value), null);
  const contracts = profile.pastContracts ?? [];
  if (contracts.length === 0) {
    return { score: null, coverage: 0, applicable: true, reasons: ["ยังไม่ได้กรอกผลงานที่ผ่านมา"] };
  }

  const target = targetText(context);
  const best = contracts.reduce((highest, contract) => {
    const valueScore = required == null ? null : clamp(contract.value / required);
    const similarity = textSimilarity(contract.description, target);
    const age = new Date().getFullYear() - contract.year;
    const recency = age <= 3 ? 1 : age <= 5 ? 0.8 : age <= 10 ? 0.5 : 0.2;
    const parts = [
      { score: similarity, weight: 0.65 },
      ...(valueScore == null ? [] : [{ score: valueScore, weight: 0.25 }]),
      { score: recency, weight: 0.1 },
    ];
    const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
    const score = parts.reduce((sum, part) => sum + part.score * part.weight, 0) / totalWeight;
    return Math.max(highest, score);
  }, 0);

  return {
    score: best,
    coverage: target.trim() ? 1 : 0.35,
    applicable: true,
    reasons: [
      `ประเมินจากผลงาน ${contracts.length.toLocaleString("th-TH")} รายการ`,
      ...(required == null ? [] : [`TOR ต้องการผลงานขั้นต่ำ ${required.toLocaleString("th-TH")} บาท`]),
    ],
  };
}

function scoreTechnology(
  profile: IVendorProfile,
  qualifications: IQualification[],
  context: MatchContext,
): DimensionEvaluation {
  const requirements = new Map<string, boolean>();
  for (const requirement of context.techRequirements ?? []) {
    const name = normalize(requirement.name);
    if (name) requirements.set(name, requirement.isMandatory || (requirements.get(name) ?? false));
  }
  for (const q of qualifications.filter((item) => item.type === "tech_stack")) {
    const names = q.normalizedNames?.length
      ? q.normalizedNames
      : typeof q.minimumValue === "string" ? q.minimumValue.split(",") : [];
    for (const raw of names) {
      const name = normalize(raw);
      if (name) requirements.set(name, (q.isMandatory ?? true) || (requirements.get(name) ?? false));
    }
  }
  if (requirements.size === 0) {
    return { score: null, coverage: 0, applicable: false, reasons: ["TOR ไม่ได้ระบุเทคโนโลยีเฉพาะ"] };
  }
  const stacks = (profile.techStacks ?? []).map(normalize).filter(Boolean);
  if (stacks.length === 0) {
    return { score: null, coverage: 0, applicable: true, reasons: ["ยังไม่ได้กรอกเทคโนโลยีของทีม"] };
  }
  let matchedWeight = 0;
  let totalWeight = 0;
  const missing: string[] = [];
  for (const [requiredTech, mandatory] of requirements) {
    const weight = mandatory ? 2 : 1;
    totalWeight += weight;
    if (stacks.some((stack) => equivalentName(stack, requiredTech))) matchedWeight += weight;
    else missing.push(requiredTech);
  }
  return {
    score: matchedWeight / totalWeight,
    coverage: 1,
    applicable: true,
    reasons: missing.length ? [`ยังไม่พบในโปรไฟล์: ${missing.join(", ")}`] : ["มีเทคโนโลยีที่ TOR ระบุครบ"],
  };
}

function scorePersonnel(criteria: CriterionMatch[], qualifications: IQualification[]): DimensionEvaluation {
  const personnelCriteria = criteria.filter((item) => item.type === "personnel" || item.type === "certification");
  const applicable = qualifications.some((item) =>
    !item.isBoilerplate && (item.type === "personnel" || item.type === "certification"),
  );
  if (!applicable) {
    return { score: null, coverage: 0, applicable: false, reasons: ["TOR ไม่ได้ระบุบุคลากรหรือใบรับรองเฉพาะ"] };
  }
  const statuses = requirementStatuses(personnelCriteria);
  const checked = statuses.filter((status) => status !== "unknown");
  const pass = checked.filter((status) => status === "pass").length;
  return {
    score: checked.length ? pass / checked.length : null,
    coverage: statuses.length ? checked.length / statuses.length : 0,
    applicable: true,
    reasons: [`ผ่าน ${pass.toLocaleString("th-TH")} จาก ${checked.length.toLocaleString("th-TH")} ข้อที่ตรวจได้`],
  };
}

function scoreCapacity(
  profile: IVendorProfile,
  qualifications: IQualification[],
  context: MatchContext,
): DimensionEvaluation {
  const values: Array<{ score: number; reason: string }> = [];
  if (context.budget != null && context.budget > 0 && profile.pastContracts?.length) {
    const largest = Math.max(...profile.pastContracts.map((contract) => contract.value));
    values.push({
      score: clamp(largest / context.budget),
      reason: `ผลงานสูงสุด ${largest.toLocaleString("th-TH")} บาท เทียบงบ ${context.budget.toLocaleString("th-TH")} บาท`,
    });
  }
  const requiredPeople = qualifications
    .filter((q) => q.type === "personnel")
    .map(requiredNumber)
    .filter((value): value is number => value != null)
    .reduce((sum, value) => sum + value, 0);
  if (requiredPeople > 0 && profile.teamSize != null) {
    values.push({
      score: clamp(profile.teamSize / requiredPeople),
      reason: `ทีม ${profile.teamSize.toLocaleString("th-TH")} คน เทียบขั้นต่ำที่อ่านได้ ${requiredPeople.toLocaleString("th-TH")} คน`,
    });
  }
  const applicable = (context.budget != null && context.budget > 0) || requiredPeople > 0;
  if (!applicable) {
    return { score: null, coverage: 0, applicable: false, reasons: ["ไม่มีข้อมูลขนาดโครงการสำหรับเปรียบเทียบ"] };
  }
  const expectedSignals = Number(context.budget != null && context.budget > 0) + Number(requiredPeople > 0);
  return {
    score: values.length ? values.reduce((sum, value) => sum + value.score, 0) / values.length : null,
    coverage: expectedSignals ? values.length / expectedSignals : 0,
    applicable: true,
    reasons: values.length ? values.map((value) => value.reason) : ["โปรไฟล์ยังไม่มีหลักฐานสำหรับเทียบขนาดโครงการ"],
  };
}

function scorePreference(profile: IVendorProfile, context: MatchContext): DimensionEvaluation {
  const interests = profile.interestedCategories ?? [];
  if (interests.length === 0) {
    return { score: null, coverage: 0, applicable: true, reasons: ["ยังไม่ได้เลือกประเภทงานที่สนใจ"] };
  }
  const target = targetText(context);
  const best = interests.reduce((score, interest) => Math.max(score, textSimilarity(interest, target)), 0);
  return {
    score: best,
    coverage: target.trim() ? 1 : 0,
    applicable: true,
    reasons: best >= 0.65 ? ["ประเภทงานตรงกับความสนใจที่เลือกไว้"] : ["ประเภทงานตรงกับความสนใจเพียงบางส่วน"],
  };
}

const WORK_TYPE_TERMS: Record<WorkType, string> = {
  development: "พัฒนาระบบ เว็บแอปพลิเคชัน mobile application software development system integration api",
  license: "ลิขสิทธิ์ซอฟต์แวร์ license subscription",
  hardware: "ฮาร์ดแวร์ อุปกรณ์ ติดตั้ง infrastructure hardware",
  maintenance: "บำรุงรักษา support maintenance",
  service: "บริการ service consulting",
  other: "อื่น",
};

function targetText(context: MatchContext): string {
  return [context.title, context.scopeOfWork, context.workType ? WORK_TYPE_TERMS[context.workType] : null]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

const CONCEPTS = [
  ["เว็บ", "web", "portal", "เว็บไซต์"],
  ["mobile", "มือถือ", "android", "ios", "flutter", "react native"],
  ["ข้อมูล", "data", "dashboard", "analytics", "bi", "mis"],
  ["ai", "ปัญญาประดิษฐ์", "machine learning"],
  ["cloud", "คลาวด์", "infrastructure", "โครงสร้างพื้นฐาน"],
  ["security", "cybersecurity", "ความมั่นคงปลอดภัย"],
  ["integration", "เชื่อมโยง", "api"],
  ["erp", "crm", "บริหารจัดการองค์กร"],
  ["iot", "smart city", "สมาร์ทซิตี้"],
  ["maintenance", "support", "บำรุงรักษา"],
  ["license", "subscription", "ลิขสิทธิ์"],
  ["hardware", "ฮาร์ดแวร์", "อุปกรณ์"],
] as const;

function textSimilarity(left: string, right: string): number {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 1;
  const leftConcepts = CONCEPTS.filter((terms) => terms.some((term) => a.includes(normalize(term))));
  if (leftConcepts.length) {
    const matched = leftConcepts.filter((terms) => terms.some((term) => b.includes(normalize(term)))).length;
    if (matched) return 0.65 + 0.35 * (matched / leftConcepts.length);
  }
  const tokens = a.split(" ").filter((token) => token.length >= 3);
  if (!tokens.length) return 0;
  const matches = tokens.filter((token) => b.includes(token)).length;
  return Math.min(0.6, matches / tokens.length);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9ก-๙+#.]+/g, " ").trim();
}

function equivalentName(left: string, right: string): boolean {
  if (left === right || left.includes(right) || right.includes(left)) return true;
  return CONCEPTS.some((terms) => {
    const normalized = terms.map(normalize);
    return normalized.some((term) => left.includes(term)) && normalized.some((term) => right.includes(term));
  });
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** One status per requirement — an alternative group collapses to one. */
function requirementStatuses(mandatory: CriterionMatch[]): CriterionStatus[] {
  const groups = new Map<string, CriterionStatus[]>();
  const single: CriterionStatus[] = [];
  for (const c of mandatory) {
    if (c.alternativeGroup == null) single.push(c.status);
    else groups.set(c.alternativeGroup, [...(groups.get(c.alternativeGroup) ?? []), c.status]);
  }
  const grouped = [...groups.values()].map((statuses): CriterionStatus =>
    statuses.includes("pass") ? "pass" : statuses.every((s) => s === "fail") ? "fail" : "unknown",
  );
  return [...single, ...grouped];
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

function evaluateContractValue(profile: IVendorProfile, q: IQualification, context: MatchContext): Evaluation {
  const required = requiredNumber(q);
  if (required === null) return unknown(q, "อ่านมูลค่าผลงานขั้นต่ำจาก TOR ไม่ได้");
  if (!profile.pastContracts?.length) {
    return unknown(q, "ยังไม่ได้กรอกผลงานที่ผ่านมาในโปรไฟล์");
  }
  let candidates = profile.pastContracts;
  if (q.requiresGovernment) {
    const government = candidates.filter((contract) => contract.agencyType === "government");
    if (!government.length && candidates.some((contract) => !contract.agencyType || contract.agencyType === "unknown")) {
      return unknown(q, "ยังไม่ได้ระบุว่าผลงานเป็นของหน่วยงานรัฐหรือเอกชน");
    }
    candidates = government;
  }
  if (q.sameTypeRequired) {
    const target = targetText(context);
    if (!target) return unknown(q, "TOR กำหนดผลงานประเภทเดียวกัน แต่ยังไม่มีขอบเขตงานสำหรับเปรียบเทียบ");
    const sameType = candidates.filter((contract) => textSimilarity(contract.description, target) >= 0.65);
    if (!sameType.length) {
      return unknown(q, "ไม่พบผลงานที่ระบบยืนยันได้ว่าเป็นประเภทเดียวกัน — กรุณาตรวจเอกสารเอง");
    }
    candidates = sameType;
  }
  const largest = candidates.length ? Math.max(...candidates.map((contract) => contract.value)) : 0;
  return compareNumber(required, largest, (gap) => gap / required < 0.3, "บาท");
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
    (p) => p.role.trim() !== "" && (
      text.includes(p.role.trim().toLowerCase()) || textSimilarity(p.role, q.criterion) >= 0.65
    ),
  );
  if (matched.length === 0) {
    return unknown(q, "ไม่พบตำแหน่งในโปรไฟล์ที่ตรงกับข้อกำหนดนี้ — กรุณาตรวจสอบเอง");
  }
  const count = matched.reduce((sum, p) => sum + p.count, 0);
  const countResult = compareNumber(required, count, () => true, "คน");
  if (countResult.status === "fail" || !q.requiredCerts?.length) return countResult;

  const held = matched.flatMap((person) => person.certifications).map(normalize);
  const missingCerts = q.requiredCerts.filter((requiredCert) =>
    !held.some((credential) => equivalentName(credential, normalize(requiredCert))),
  );
  if (!missingCerts.length) return countResult;
  return {
    ...countResult,
    status: "fail",
    gap: `ขาดใบรับรอง: ${missingCerts.join(", ")}`,
    bridgeable: true,
    reason: `จำนวนคนครบ แต่ขาดใบรับรอง ${missingCerts.join(", ")}`,
  };
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
  const required = q.requiredCerts?.length
    ? q.requiredCerts
    : typeof q.minimumValue === "string" ? q.minimumValue.split(",").map((value) => value.trim()).filter(Boolean) : [];
  if (!required.length) return unknown(q, "อ่านชื่อใบรับรองจาก TOR ไม่ได้");
  if (!profile.credentials?.length) return unknown(q, "ยังไม่ได้กรอกใบรับรองในโปรไฟล์");

  const now = Date.now();
  const creds = profile.credentials
    .filter((credential) => !credential.expiresAt || credential.expiresAt.getTime() >= now)
    .map((c) => c.name.trim().toLowerCase())
    .filter(Boolean);
  const missing = required.filter((requiredCredential) =>
    !creds.some((credential) => equivalentName(normalize(credential), normalize(requiredCredential))),
  );
  const pass = missing.length === 0;

  return {
    status: pass ? "pass" : "fail",
    profileValue: creds.join(", ") || "ไม่มีใบรับรองที่ยังไม่หมดอายุ",
    requiredValue: required.join(", "),
    gap: pass ? null : `ขาด: ${missing.join(", ")}`,
    bridgeable: pass ? null : true, // Certifications can be obtained
    reason: pass ? "มีใบรับรองตามที่กำหนดและยังไม่หมดอายุ" : `ยังไม่มี ${missing.join(", ")}`,
  };
}
