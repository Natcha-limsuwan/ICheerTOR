import type { GenerateContentConfig, Schema } from "@google/genai";
import { promptV1 } from "./v1";
import { promptV2 } from "./v2";
import { promptV3 } from "./v3";
import { promptV4 } from "./v4";

/** What the pipeline already knows about a TOR before the model reads it. */
export interface ExtractionContext {
  title: string;
  agencyName: string;
  /** ราคากลาง from egp2 — official, so the model is told not to override it. */
  medianPriceFromSource?: number | null;
  budget?: number | null;
  /** The PDF sent as an attachment (usually the scanned TOR). */
  fileName: string;
  /** document-picker's guess from the file name, e.g. "tor". */
  documentKind: string;
  /** Sliced text of the e-GP bidding document, when the archive has one (v3+). */
  biddingDocText?: string | null;
  biddingDocFileName?: string | null;
  /** False when only the bidding document is available (v3+). */
  hasPdf?: boolean;
}

export interface ExtractionPrompt {
  version: string;
  systemInstruction: string;
  /** Documentation-only JSON schema (v1). Never sent to the model. */
  outputSchema?: object;
  /** Sent as responseSchema so the reply is forced into this shape (v2+). */
  responseSchema?: Schema;
  /** The text part sent alongside the PDF (v2+). */
  buildUserPrompt?: (ctx: ExtractionContext) => string;
  /** Per-prompt generation settings (v2+). */
  generationConfig?: Pick<GenerateContentConfig, "thinkingConfig" | "maxOutputTokens" | "mediaResolution">;
  examples?: Array<{ input: string; output: unknown }>;
}

/** Every version, so eval can compare them on the same gold set. */
export const prompts: Record<string, ExtractionPrompt> = {
  v1: promptV1,
  v2: promptV2,
  v3: promptV3,
  v4: promptV4,
};

/**
 * Active extraction prompt. tor-parser.ts maps its reply onto TORRecord and
 * expects the v4 shape — a new version must keep it or update the mapping.
 * Score a candidate with scripts/eval-prompt.ts before switching.
 */
export const activePrompt: ExtractionPrompt = promptV4;
