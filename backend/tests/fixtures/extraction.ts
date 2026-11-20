import type { TorExtractionV4 } from "../../src/services/ai/prompts/v4.js";
export function extractionFixture(): TorExtractionV4 {
  return {
    documentCheck: { isTor: true, documentType: "tor", hasScannedPages: false }, workType: "development",
    scopeOfWork: { summary: "Develop a website", keyPoints: ["Search public information"], deliverables: ["Website"],
      contractDurationDays: 120, contractDurationText: "กำหนดส่งมอบภายใน 120 วัน", sourcePages: [1], confidence: 0.91 },
    qualifications: [{ clauseNumber: "3.1", criterion: "มีผลงานพัฒนาเว็บไซต์ 600,000 บาท", type: "contract_value", minimumNumber: 600000,
      unit: "THB", normalizedNames: [], isMandatory: true, isBoilerplate: false, alternativeGroup: null,
      requiresGovernment: null, sameTypeRequired: true, requiredCerts: [], sourcePage: 2, confidence: 0.92, source: "tor", amountWords: null }],
    evaluationCriteria: { method: "lowest_price", summary: "Lowest price", weights: [{ criterion: "price", weight: 100 }], sourcePage: 3, confidence: 0.95 },
    keyDates: { warrantyMonths: { value: 12, confidence: 0.9 } },
    medianPrice: { value: 1000000, amountWords: null, sourcePage: 1, confidence: 0.9 },
    budget: { value: 2000000, amountWords: null, sourcePage: 1, confidence: 0.9 },
    documentConflicts: [], riskClauses: [],
  };
}
