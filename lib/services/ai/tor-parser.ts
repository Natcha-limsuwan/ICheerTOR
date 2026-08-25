import { VertexAI } from "@google-cloud/vertexai";
import { aiCircuitBreaker } from "./circuit-breaker";
import { activePrompt } from "./prompts";
import { IParsedData } from "@/lib/db/models/tor-record";

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface ParseResult {
  success: boolean;
  data?: IParsedData;
  error?: string;
  processingTimeMs: number;
  rawExtraction?: string;
  promptVersion: string;
  modelVersion: string;
}

/* ─── Configuration ─────────────────────────────────────────────────── */

const PROJECT_ID = process.env.VERTEX_AI_PROJECT_ID;
const LOCATION = process.env.VERTEX_AI_LOCATION ?? "asia-southeast1";
const MODEL = process.env.VERTEX_AI_MODEL ?? "gemini-2.0-flash";
const TIMEOUT = parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? "30000", 10);
const MAX_RETRIES = 3;

/* ─── Retry with exponential back-off ───────────────────────────────── */

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const baseDelay = 1000;
        const maxDelay = 30000;
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        const jitter = delay * (0.5 + Math.random() * 0.5);
        await sleep(jitter);
      }
    }
  }

  throw lastError;
}

/* ─── Parser ────────────────────────────────────────────────────────── */

/**
 * Parse a TOR PDF using Vertex AI.
 */
export async function parseTOR(pdfBuffer: Buffer): Promise<ParseResult> {
  const startTime = Date.now();

  // Circuit breaker check
  if (aiCircuitBreaker.isOpen()) {
    return {
      success: false,
      error: "AI service temporarily unavailable (circuit breaker open)",
      processingTimeMs: Date.now() - startTime,
      promptVersion: activePrompt.version,
      modelVersion: MODEL,
    };
  }

  if (!PROJECT_ID) {
    return {
      success: false,
      error: "VERTEX_AI_PROJECT_ID not configured",
      processingTimeMs: Date.now() - startTime,
      promptVersion: activePrompt.version,
      modelVersion: MODEL,
    };
  }

  try {
    const result = await withRetry(async () => {
      const vertexAI = new VertexAI({
        project: PROJECT_ID!,
        location: LOCATION,
      });

      const model = vertexAI.getGenerativeModel({
        model: MODEL,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
        systemInstruction: activePrompt.systemInstruction,
      });

      const pdfBase64 = pdfBuffer.toString("base64");

      const response = await Promise.race([
        model.generateContent({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: "application/pdf",
                    data: pdfBase64,
                  },
                },
                {
                  text: "Extract structured information from this Thai TOR PDF document following the system instruction.",
                },
              ],
            },
          ],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Request timeout")), TIMEOUT),
        ),
      ]);

      const text = response.response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Empty response from Vertex AI");

      return text;
    });

    // Parse the JSON response
    const parsed = JSON.parse(result) as IParsedData;

    aiCircuitBreaker.onSuccess();

    return {
      success: true,
      data: parsed,
      rawExtraction: result,
      processingTimeMs: Date.now() - startTime,
      promptVersion: activePrompt.version,
      modelVersion: MODEL,
    };
  } catch (error) {
    aiCircuitBreaker.onFailure();

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      processingTimeMs: Date.now() - startTime,
      promptVersion: activePrompt.version,
      modelVersion: MODEL,
    };
  }
}
