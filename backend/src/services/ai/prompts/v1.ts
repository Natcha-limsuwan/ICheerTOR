import { ExtractionPrompt } from "./index";

/**
 * V1 extraction prompt for Thai TOR PDF parsing.
 */
export const promptV1: ExtractionPrompt = {
  version: "v1",
  systemInstruction: `You are an AI assistant that extracts structured information from Thai government procurement Terms of Reference (TOR) documents.

Given a Thai TOR PDF document, extract the following fields in JSON format:

1. scopeOfWork: The full scope of work description in Thai
2. qualifications: Array of vendor qualification requirements, each with:
   - criterion: The qualification text in Thai
   - minimumValue: Numeric or text minimum value (e.g., 5000000 for capital, 3 for years)
   - type: One of "contract_value", "company_age", "tech_stack", "certification", "other"
3. medianPrice: The median price (ราคากลาง) as a number in THB
4. evaluationCriteria: The evaluation criteria description in Thai

For each field, also provide a confidence score (0.0-1.0) indicating how confident you are in the extraction accuracy.

Important rules:
- Extract text in the original Thai language
- Convert Thai numerals (๑๒๓) to Arabic numerals (123)
- If a year is in Buddhist Era (พ.ศ.), convert it: Gregorian = BE - 543
- If a field cannot be found, set its value to null and confidence to 0
- Do not fabricate or hallucinate information
- Return ONLY valid JSON matching the output schema`,

  outputSchema: {
    type: "object",
    properties: {
      scopeOfWork: {
        type: "object",
        properties: {
          content: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["content", "confidence"],
      },
      qualifications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            criterion: { type: "string" },
            minimumValue: {},
            type: {
              type: "string",
              enum: ["contract_value", "company_age", "tech_stack", "certification", "other"],
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["criterion", "type", "confidence"],
        },
      },
      medianPrice: {
        type: "object",
        properties: {
          value: { type: ["number", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["value", "confidence"],
      },
      evaluationCriteria: {
        type: "object",
        properties: {
          content: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["content", "confidence"],
      },
    },
    required: ["scopeOfWork", "qualifications", "medianPrice", "evaluationCriteria"],
  },
};
