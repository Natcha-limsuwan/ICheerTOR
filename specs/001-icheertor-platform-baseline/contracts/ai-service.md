# AI Service Contract: Vertex AI TOR Extraction

**Date**: 2026-08-24 | **Spec**: [spec.md](file:///c:/work/collaborative/Software-Process/specs/001-icheertor-platform-baseline/spec.md)

## Overview

The AI Service layer wraps Google Cloud Vertex AI (Gemini) to parse unstructured Thai TOR PDF documents into structured JSON. It also provides red-flag analysis for public-hearing phase documents.

## Service Interface

### `TORParser.parse(pdfBuffer: Buffer): Promise<ParseResult>`

Submits a TOR PDF to Vertex AI for structured extraction.

**Input**:
- `pdfBuffer`: Raw PDF file contents as a Buffer

**Output** (`ParseResult`):
```typescript
interface ParseResult {
  success: boolean
  data?: ParsedTORData
  error?: string
  processingTimeMs: number
}

interface ParsedTORData {
  scopeOfWork: {
    content: string
    confidence: number  // 0.0–1.0
  }
  qualifications: Array<{
    criterion: string
    minimumValue?: number | string
    type: 'contract_value' | 'company_age' | 'tech_stack' | 'certification' | 'other'
    confidence: number
  }>
  medianPrice: {
    value: number | null
    confidence: number
  }
  evaluationCriteria: {
    content: string
    confidence: number
  }
  rawExtraction: string  // Full LLM response for debugging
  promptVersion: string  // e.g., "v1.2"
  modelVersion: string   // e.g., "gemini-2.0-flash"
}
```

**Behaviour**:
1. Converts PDF buffer to base64 for multimodal input
2. Sends to Vertex AI with structured JSON output schema
3. Parses response and computes per-field confidence scores
4. Returns `ParseResult` with `success: true` or error details

**Error Handling**:
- Retry with exponential back-off (base 1s, max 30s, 3 attempts)
- Circuit breaker opens after 3 consecutive failures, cooldown 60s
- On total failure: returns `{ success: false, error: "..." }`

---

### `RedFlagAnalyzer.analyze(parsedData: ParsedTORData, phase: string): RedFlagResult[]`

Evaluates parsed TOR data against the red-flag rule set.

**Input**:
- `parsedData`: Structured extraction from `TORParser.parse()`
- `phase`: Current procurement phase (only runs for `public_hearing`)

**Output** (`RedFlagResult[]`):
```typescript
interface RedFlagResult {
  clauseText: string
  reason: string
  severity: 'info' | 'warning' | 'critical'
  recommendedAction: string
  ruleId: string
}
```

**Rules** (initial set, configurable via `lib/services/ai/rules/red-flag-rules.json`):

| Rule ID | Name | Trigger | Severity |
|---------|------|---------|----------|
| `RF-001` | Narrow vendor spec | Qualification names a specific brand/product | critical |
| `RF-002` | High min contract | Min contract value > 2× median for category | warning |
| `RF-003` | Compressed timeline | Submission deadline < 15 days from posting | warning |
| `RF-004` | Rare certification | Required cert held by < 5% of registered vendors | warning |
| `RF-005` | Budget outlier | Median price > 1.5× or < 0.5× category average | info |

**Behaviour**:
- Only runs when `phase === 'public_hearing'`
- Returns empty array for non-hearing-phase documents
- Rules are stateless and deterministic (no LLM call required)

---

## Circuit Breaker Configuration

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number    // Default: 3
  cooldownMs: number          // Default: 60000 (60s)
  timeoutMs: number           // Default: 30000 (30s per request)
}

// States: CLOSED → OPEN (after failureThreshold failures) → HALF_OPEN (after cooldown) → CLOSED (on success)
```

## Versioned Prompts

Extraction prompts are stored under `lib/services/ai/prompts/` and version-tracked:

```
lib/services/ai/prompts/
├── v1.ts     # Initial prompt
└── index.ts  # Exports active prompt version
```

Each prompt file exports:
```typescript
interface ExtractionPrompt {
  version: string
  systemInstruction: string
  outputSchema: object  // JSON Schema for structured output
  examples?: Array<{ input: string, output: ParsedTORData }>
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VERTEX_AI_PROJECT_ID` | GCP project ID | required |
| `VERTEX_AI_LOCATION` | GCP region | `asia-southeast1` |
| `VERTEX_AI_MODEL` | Gemini model name | `gemini-2.0-flash` |
| `AI_CONFIDENCE_THRESHOLD` | Flag threshold | `0.6` |
| `AI_CIRCUIT_BREAKER_THRESHOLD` | Failure count to open | `3` |
| `AI_CIRCUIT_BREAKER_COOLDOWN_MS` | Cooldown in ms | `60000` |
| `AI_REQUEST_TIMEOUT_MS` | Per-request timeout | `30000` |
