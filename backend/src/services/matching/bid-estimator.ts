/**
 * Suggests a bid range for price-performance TORs.
 *
 * Only meaningful when the TOR scores proposals rather than simply taking the
 * lowest price. Under "เกณฑ์ราคา" (lowest_price) there is nothing to model:
 * the cheapest compliant bid wins, so technical strength cannot be traded for
 * price and this module declines to answer (`applicable: false`). Producing a
 * number there would invent precision the rule does not contain.
 *
 * ── How the arithmetic works ────────────────────────────────────────────
 *
 * Thai e-bidding price-performance scores price by ratio, not by distance
 * from the reference price:
 *
 *     priceScore = (lowestBid / ourBid) x priceWeight
 *
 * so the lowest bidder takes the full price weight and everyone else is
 * scaled down. The total is priceScore + technicalScore.
 *
 * We never see competitors' bids, so this cannot predict a winner and does not
 * try. Instead it inverts the question into one answerable from what we know:
 *
 *   "Given a rival who bids R and scores T_rival on technique, what is the
 *    most we can bid and still finish ahead?"
 *
 * Solving  (R / ourBid) x Wprice + T_us  >=  (R / R) x Wprice + T_rival
 * for ourBid gives the break-even multiplier used below. A technical lead buys
 * room to bid higher; a technical deficit demands a discount — exactly the
 * trade-off the feature is meant to show.
 *
 * ── What these numbers are NOT ──────────────────────────────────────────
 *
 * `fitScore` from the qualification matcher is a proxy for the technical
 * score, not the real thing: the committee scores a written proposal against
 * its own rubric, while we score a vendor profile against extracted
 * requirements. The two correlate but are not the same quantity, so every
 * output here is a planning aid, never a recommended price. Callers must
 * surface `confidence` and `assumptions` next to any figure they display.
 *
 * Cost is deliberately not modelled: bidding below cost wins the contract and
 * loses the company money, and only the vendor knows their cost. MIN_RATIO is
 * a scoring floor, not a viability floor.
 */

import type { MatchResult } from "./qualification-matcher";
import type { IEvaluationCriteria } from "../../db/models/tor-record";

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface BidEstimateInput {
  evaluationCriteria?: IEvaluationCriteria | null;
  /** วงเงินงบประมาณ — the ceiling a bid may not exceed. */
  budget?: number | null;
  /** ราคากลาง — the agency's reference price, the usual anchor for bidding. */
  medianPrice?: number | null;
  /** Result of matching the vendor profile against this TOR. */
  match: MatchResult | null;
}

export interface BidScenario {
  id: "aggressive" | "balanced" | "conservative";
  label: string;
  /** Assumed technical score of the rival, as a share of the technical weight. */
  rivalTechnicalRatio: number;
  /** Suggested bid in THB. */
  bid: number;
  /** Bid as a share of the anchor price; 0.92 means 8% below it. */
  ratioToAnchor: number;
  /** Discount off the anchor, in percent, rounded for display. */
  discountPercent: number;
  description: string;
}

export interface BidEstimate {
  /** False when the TOR is lowest-price or lacks the data to model. */
  applicable: boolean;
  /** Why it is not applicable, in Thai, for display. */
  reason?: string;
  /** The price the suggestions are measured against, and which figure it is. */
  anchor?: { value: number; kind: "median_price" | "budget" };
  /** Ceiling a bid must not exceed, when known. */
  ceiling?: number | null;
  weights?: { price: number; technical: number };
  /**
   * Every criterion as a share of the full 100, with the figure the TOR
   * printed beside it. Lets the UI show sub-criteria honestly instead of
   * rendering bars that add up to more than the whole.
   */
  weightRows?: NormalisedWeightRow[];
  /** True when quality rows were percentages of the quality block, now rescaled. */
  rescaledSubCriteria?: boolean;
  /** Our estimated technical score as a share of the technical weight (0–1). */
  technicalRatio?: number;
  /** Our estimated technical points out of the technical weight. */
  technicalPoints?: number;
  scenarios?: BidScenario[];
  /**
   * How much to trust this. "low" whenever the match had thin evidence or the
   * weights were assumed rather than read from the TOR.
   */
  confidence?: "low" | "medium";
  /** Plain-Thai statements of every assumption, shown beside the numbers. */
  assumptions?: string[];
  /** Hard limits the user must not be allowed to forget. */
  warnings?: string[];
}

/* ─── Constants ─────────────────────────────────────────────────────── */

/** One criterion after normalisation, for display beside the estimate. */
export interface NormalisedWeightRow {
  criterion: string;
  /** Points this criterion is worth out of the full 100, after any rescaling. */
  weight: number;
  /** The figure printed in the TOR, which may be a share of the quality block. */
  stated: number;
  isPrice: boolean;
  /**
   * Estimated points the vendor would score on this criterion, out of
   * `weight`. Null for the price row, which depends on the bid rather than the
   * profile, and whenever there is no profile to judge from.
   *
   * This is the overall fit score applied to each criterion, NOT a per-
   * criterion judgement: the matcher scores five generic dimensions
   * (experience, technology, personnel, capacity, preference) against the
   * TOR's qualification clauses, and those do not line up one-to-one with a
   * committee's scoring sheet. Showing it per row makes the stakes legible —
   * a 15-point criterion matters more than a 6-point one — but a low number
   * here means "our evidence is thin for this TOR", never "the committee will
   * score you 9 out of 15".
   */
  earned: number | null;
}

export interface NormalisedWeights {
  price: number;
  technical: number;
  fromDocument: boolean;
  /** Rows do not total 100 and we could not explain why — tell the user. */
  weightsSuspect: boolean;
  /** Quality rows were percentages of the quality block and have been rescaled. */
  rescaledSubCriteria: boolean;
  rows: NormalisedWeightRow[];
}

/** Marks a weight row as the price component; TORs word this many ways. */
const PRICE_WEIGHT_PATTERN = /ราคา|price|ค่าเสนอ/i;

/**
 * Fallback split when the TOR says price_performance but no weights were
 * extracted. 30/70 is the most common BMA split, but it remains a guess, so
 * using it forces confidence down to "low".
 */
const DEFAULT_PRICE_WEIGHT = 30;

/**
 * The scenarios differ in how strong the rival is, both technically and on
 * price. `rivalBidRatio` matters as much as the technical score: a rival who
 * bids the full reference price is not a real opponent, because government
 * e-bidding almost always closes below ราคากลาง. Assuming they bid the anchor
 * would make our break-even price look far higher than it is, and the error
 * runs in the dangerous direction — it would tell the user they can win while
 * bidding more than they actually can.
 */
const SCENARIOS: Array<
  Pick<BidScenario, "id" | "label" | "rivalTechnicalRatio" | "description"> & { rivalBidRatio: number }
> = [
  {
    id: "conservative",
    label: "คู่แข่งอ่อนกว่า",
    rivalTechnicalRatio: 0.75,
    rivalBidRatio: 0.97,
    description: "คู่แข่งคะแนนเทคนิคต่ำกว่าและเสนอราคาสูง — ยังพอมีช่องให้เสนอราคาสูงได้",
  },
  {
    id: "balanced",
    label: "คู่แข่งใกล้เคียง",
    rivalTechnicalRatio: 0.85,
    rivalBidRatio: 0.93,
    description: "คู่แข่งคะแนนเทคนิคใกล้เคียงกับเรา — กรณีที่ควรใช้ตั้งต้น",
  },
  {
    id: "aggressive",
    label: "คู่แข่งแข็งกว่า",
    rivalTechnicalRatio: 0.95,
    rivalBidRatio: 0.88,
    description: "คู่แข่งคะแนนเทคนิคสูงกว่าและตัดราคา — ต้องชดเชยด้วยราคา",
  },
];

/**
 * Never suggest bidding below this share of the anchor, whatever the maths
 * says. Past roughly 15% under ราคากลาง a bid in this sector is usually either
 * loss-making or a sign we have misread the scope, and either way the honest
 * output is "this one may not be worth chasing" rather than a smaller number.
 */
const MIN_RATIO = 0.85;

/* ─── Weight parsing ────────────────────────────────────────────────── */

/**
 * Split the TOR's weight rows into a price share and a technical share.
 *
 * Rows are matched on wording because TORs label the price row differently
 * ("ราคาที่ยื่นข้อเสนอ (Price)", "ด้านราคา", …). Anything that does not match
 * the price pattern counts as technical, so a TOR that spreads technique over
 * several rows still totals correctly.
 */
export function readWeights(
  criteria: IEvaluationCriteria | null | undefined,
): NormalisedWeights | null {
  const rows = criteria?.weights ?? [];
  if (rows.length > 0) {
    const priceRows: Array<{ criterion: string; weight: number }> = [];
    const qualityRows: Array<{ criterion: string; weight: number }> = [];
    for (const row of rows) {
      if (!Number.isFinite(row.weight) || row.weight < 0) continue;
      (PRICE_WEIGHT_PATTERN.test(row.criterion) ? priceRows : qualityRows).push(row);
    }
    const price = priceRows.reduce((s, r) => s + r.weight, 0);
    const qualityRaw = qualityRows.reduce((s, r) => s + r.weight, 0);

    // Both halves must exist for the trade-off to mean anything.
    if (price > 0 && qualityRaw > 0) {
      const total = price + qualityRaw;

      // Quality sub-criteria are often written as percentages *of the quality
      // block*, not of the whole 100. One BMA maintenance TOR states "น้ำหนัก
      // ราคา 40% และคุณภาพ 60%" and then lists eight quality rows that
      // themselves sum to 100 — so each "10%" is 10% of 60, i.e. 6 real
      // points. Read flat, those rows total 140 and overstate quality.
      //
      // The signature is precise: the price rows and the quality rows each
      // look like a complete scale on their own (quality ≈ 100, and price +
      // quality > 100). Rescale quality onto the points it actually carries,
      // which is whatever is left after price.
      const subCriteriaScale = Math.abs(qualityRaw - 100) <= 1 && total > 101 && price < 100;
      const technical = subCriteriaScale ? 100 - price : qualityRaw;
      const factor = subCriteriaScale ? technical / qualityRaw : 1;

      return {
        price,
        technical,
        fromDocument: true,
        // A rescaled set is understood, not suspect. Anything else that misses
        // 100 is a genuine extraction problem the user should check.
        weightsSuspect: !subCriteriaScale && Math.abs(total - 100) > 1,
        rescaledSubCriteria: subCriteriaScale,
        rows: [
          ...priceRows.map((r) => ({
            criterion: r.criterion,
            weight: r.weight,
            stated: r.weight,
            isPrice: true,
            // Price points depend on the bid, not the profile.
            earned: null,
          })),
          ...qualityRows.map((r) => ({
            criterion: r.criterion,
            // Rounded for display only; `technical` above stays exact.
            weight: Math.round(r.weight * factor * 10) / 10,
            stated: r.weight,
            isPrice: false,
            earned: null,
          })),
        ],
      };
    }
  }
  if (criteria?.method === "price_performance") {
    return {
      price: DEFAULT_PRICE_WEIGHT,
      technical: 100 - DEFAULT_PRICE_WEIGHT,
      fromDocument: false,
      weightsSuspect: false,
      rescaledSubCriteria: false,
      rows: [],
    };
  }
  return null;
}

/* ─── Estimator ─────────────────────────────────────────────────────── */

export function estimateBid(input: BidEstimateInput): BidEstimate {
  const { evaluationCriteria, budget, medianPrice, match } = input;
  const method = evaluationCriteria?.method ?? null;

  if (method === "lowest_price") {
    return {
      applicable: false,
      reason:
        "TOR นี้ใช้เกณฑ์ราคาต่ำสุด คะแนนเทคนิคไม่มีผลต่อการชนะ " +
        "จึงคำนวณราคาที่ควรเสนอจากคุณสมบัติของบริษัทไม่ได้ — ผู้ที่เสนอราคาต่ำสุดและผ่านคุณสมบัติจะเป็นผู้ชนะ",
    };
  }

  const weights = readWeights(evaluationCriteria);
  if (!weights) {
    return {
      applicable: false,
      reason:
        method == null
          ? "ยังไม่ทราบเกณฑ์การพิจารณาของ TOR ฉบับนี้ — ต้องอ่านจากเอกสารก่อน"
          : "TOR ฉบับนี้ไม่ได้ระบุน้ำหนักคะแนนราคาและคะแนนเทคนิคแยกกัน จึงคำนวณไม่ได้",
    };
  }

  // ราคากลาง is normally the better anchor: it is the agency's own costing,
  // whereas the budget is only a ceiling and is often rounded above it.
  //
  // But the two sometimes come the other way round — one live BMA TOR has a
  // 19.85M reference price against a 16.96M budget. Anchoring on the reference
  // price there would make every scenario clamp to the ceiling and report a
  // "15% discount" that is really just the budget, which reads as advice to
  // cut price when no such analysis happened. Anchor on whichever is lower so
  // the percentages stay honest.
  const hasMedian = medianPrice != null && medianPrice > 0;
  const hasBudget = budget != null && budget > 0;
  const anchorValue = hasMedian && hasBudget
    ? Math.min(medianPrice, budget)
    : hasMedian
      ? medianPrice
      : hasBudget
        ? budget
        : null;
  if (!anchorValue) {
    return {
      applicable: false,
      reason: "ยังไม่มีราคากลางหรือวงเงินงบประมาณของโครงการนี้ จึงไม่มีฐานให้คำนวณ",
    };
  }
  const anchorKind: "median_price" | "budget" =
    hasMedian && anchorValue === medianPrice ? "median_price" : "budget";

  if (match?.eligibilityStatus === "ineligible") {
    return {
      applicable: false,
      reason:
        "คุณสมบัติของบริษัทยังไม่ผ่านข้อกำหนดบังคับของ TOR ฉบับนี้ " +
        "ข้อเสนอจะถูกตัดสิทธิ์ตั้งแต่ขั้นตรวจคุณสมบัติ ราคาที่เสนอจึงยังไม่มีความหมาย",
    };
  }

  // fitScore is a 0–1 proxy for how well the profile meets the TOR. Without a
  // profile we assume a mid-table proposal rather than refusing outright: the
  // user still learns how the price/technical trade-off behaves.
  const fit = match?.fitScore ?? null;
  const technicalRatio = fit ?? 0.7;
  const technicalPoints = technicalRatio * weights.technical;

  const ceiling = budget && budget > 0 ? budget : null;

  let floorBinds = false;

  const scenarios: BidScenario[] = SCENARIOS.map((scenario) => {
    const rivalPoints = scenario.rivalTechnicalRatio * weights.technical;
    const rivalBid = anchorValue * scenario.rivalBidRatio;
    // Break-even against a rival bidding `rivalBid`. Whoever is cheaper takes
    // the full price weight, so the comparison has two branches:
    //
    //   we are dearer  (ourBid >= rivalBid):
    //     (rivalBid / ourBid) * Wp + ourTech  =  Wp + rivalTech
    //       => ourBid = rivalBid * Wp / (Wp + rivalTech - ourTech)
    //
    //   we are cheaper (ourBid < rivalBid): we already hold the full price
    //     weight and the rival is scaled down, so we win outright whenever our
    //     technical score is not more than the price weight behind. That case
    //     needs no discount at all and resolves to the rival's price.
    const denominator = weights.price + rivalPoints - technicalPoints;
    const rawBid = denominator <= 0 ? Number.POSITIVE_INFINITY : (rivalBid * weights.price) / denominator;

    // Cap at the anchor: suggesting a bid above ราคากลาง invites rejection even
    // where the arithmetic allows it. Floor at MIN_RATIO for the reasons given
    // on that constant.
    const ratio = rawBid / anchorValue;
    if (ratio < MIN_RATIO) floorBinds = true;
    const cappedRatio = Math.min(Math.max(ratio, MIN_RATIO), 1);

    let bid = anchorValue * cappedRatio;
    // Bidding above the budget is an automatic disqualification.
    if (ceiling) bid = Math.min(bid, ceiling);
    // Round down to the nearest 1,000 THB: a figure like 4,873,219 implies a
    // costing precision this estimate does not have.
    bid = Math.floor(bid / 1000) * 1000;
    return {
      id: scenario.id,
      label: scenario.label,
      rivalTechnicalRatio: scenario.rivalTechnicalRatio,
      bid,
      ratioToAnchor: bid / anchorValue,
      discountPercent: Math.round((1 - bid / anchorValue) * 1000) / 10,
      description: scenario.description,
    };
  });
  // Cheapest first. When the floor or the anchor cap makes several scenarios
  // land on the same price, fall back to the declared order so the strongest
  // rival still reads as the most aggressive case instead of shuffling.
  const order = new Map(SCENARIOS.map((s, i) => [s.id, i]));
  scenarios.sort((a, b) => a.bid - b.bid || order.get(b.id)! - order.get(a.id)!);

  const coverage = match?.dataCoverage ?? 0;
  const confidence: "low" | "medium" =
    weights.fromDocument && !weights.weightsSuspect && fit !== null && coverage >= 0.6 ? "medium" : "low";

  const assumptions = [
    `อิง${anchorKind === "median_price" ? "ราคากลาง" : "วงเงินงบประมาณ"} ${anchorValue.toLocaleString("th-TH")} บาทเป็นฐาน`,
    `คะแนนราคา ${weights.price} / คะแนนเทคนิค ${weights.technical}` +
      (weights.fromDocument
        ? weights.rescaledSubCriteria
          ? " (อ่านจาก TOR — หัวข้อย่อยด้านคุณภาพคิดเป็น % ของคะแนนคุณภาพ ปรับเป็นสัดส่วนจาก 100 แล้ว)"
          : " (อ่านจาก TOR)"
        : " (ค่าตั้งต้น เพราะ TOR ไม่ได้ระบุน้ำหนัก)"),
    `ประมาณว่าบริษัทได้คะแนนเทคนิคราว ${technicalPoints.toFixed(1)} จาก ${weights.technical} คะแนน` +
      (fit === null ? " (ยังไม่มีโปรไฟล์ จึงใช้ค่ากลาง)" : ""),
    "สมมติว่าคู่แข่งเสนอราคาเท่ากับราคาฐาน และคิดคะแนนราคาแบบสัดส่วน (ราคาต่ำสุด ÷ ราคาที่เสนอ)",
  ];

  const warnings = [
    "ตัวเลขนี้เป็นการประมาณเพื่อวางแผนเท่านั้น ไม่ใช่ราคาที่แนะนำให้เสนอ",
    "ยังไม่ได้คิดต้นทุนจริงของบริษัท — ควรตรวจสอบว่าราคายังคุ้มทุนก่อนตัดสินใจ",
    "คะแนนเทคนิคจริงกรรมการเป็นผู้ให้จากเอกสารข้อเสนอ ซึ่งอาจต่างจากที่ระบบประมาณ",
  ];

  if (match?.eligibilityStatus === "incomplete") {
    warnings.push("ยังตรวจคุณสมบัติบางข้อไม่ได้ — ผลอาจเปลี่ยนเมื่อกรอกโปรไฟล์ครบ");
  }
  if (floorBinds) {
    warnings.push(
      "บางกรณีต้องลดราคาต่ำกว่าที่ระบบจะแนะนำ ระบบจึงหยุดไว้ที่ขั้นต่ำ " +
        "แปลว่าคะแนนเทคนิคของบริษัทยังเสียเปรียบมากสำหรับงานนี้ — การแข่งด้วยราคาอย่างเดียวอาจไม่คุ้ม",
    );
  }
  if (!weights.fromDocument) {
    warnings.push(
      `TOR ไม่ได้ระบุน้ำหนักคะแนน ระบบใช้ ${DEFAULT_PRICE_WEIGHT}/${100 - DEFAULT_PRICE_WEIGHT} เป็นค่าตั้งต้น`,
    );
  }
  if (weights.weightsSuspect) {
    warnings.push(
      `น้ำหนักคะแนนที่อ่านได้รวมกันเป็น ${weights.price + weights.technical} ไม่ใช่ 100 ` +
        "อาจอ่านหัวข้อย่อยซ้ำกับหัวข้อหลัก — ระบบใช้สัดส่วนราคาต่อเทคนิคคำนวณต่อได้ แต่ควรตรวจกับเอกสารจริง",
    );
  }

  return {
    applicable: true,
    anchor: { value: anchorValue, kind: anchorKind },
    ceiling,
    weights: { price: weights.price, technical: weights.technical },
    weightRows: weights.rows.map((row) =>
      row.isPrice || fit === null
        ? row
        // Same ratio on every quality row — see the note on `earned`. Rounded
        // to one decimal so a 15-point criterion reads as 9.3, not 9.299999.
        : { ...row, earned: Math.round(row.weight * technicalRatio * 10) / 10 },
    ),
    rescaledSubCriteria: weights.rescaledSubCriteria,
    technicalRatio,
    technicalPoints,
    scenarios,
    confidence,
    assumptions,
    warnings,
  };
}
