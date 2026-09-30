/**
 * Shared Gemini client on Vertex AI.
 *
 * Uses the Google Gen AI SDK (@google/genai). The older @google-cloud/vertexai
 * SDK's VertexAI class was deprecated on 2025-06-24 and removed on 2026-06-24,
 * so new code must not use it.
 *
 * Two ways to authenticate, chosen by what is set in .env:
 *
 *   express  VERTEX_AI_API_KEY — Vertex AI express mode: free for 90 days with
 *            quotas, no billing account. Suits development and testing.
 *   project  VERTEX_AI_PROJECT_ID + VERTEX_AI_LOCATION with Application
 *            Default Credentials (GOOGLE_APPLICATION_CREDENTIALS → service
 *            account key). Needs billing; for production.
 *
 * The API key wins when both are set, matching what the SDK itself does.
 */

import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env";

export class VertexConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VertexConfigError";
  }
}

export type VertexAuthMode = "express" | "project";

let client: GoogleGenAI | null = null;

export function getAuthMode(): VertexAuthMode {
  return env.VERTEX_AI_API_KEY ? "express" : "project";
}

/** Throws VertexConfigError when a required setting is missing. */
export function assertVertexConfigured(): void {
  const required =
    getAuthMode() === "express"
      ? [["VERTEX_AI_MODEL", env.VERTEX_AI_MODEL]]
      : [
          ["VERTEX_AI_PROJECT_ID", env.VERTEX_AI_PROJECT_ID],
          ["VERTEX_AI_LOCATION", env.VERTEX_AI_LOCATION],
          ["VERTEX_AI_MODEL", env.VERTEX_AI_MODEL],
        ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new VertexConfigError(`ยังไม่ได้ตั้งค่า ${missing.join(", ")} ใน .env — ดู docs/VERTEX-SETUP.md`);
  }
}

export function getVertexClient(): GoogleGenAI {
  if (client) return client;
  assertVertexConfigured();
  client =
    getAuthMode() === "express"
      ? new GoogleGenAI({ vertexai: true, apiKey: env.VERTEX_AI_API_KEY })
      : new GoogleGenAI({
          vertexai: true,
          project: env.VERTEX_AI_PROJECT_ID,
          location: env.VERTEX_AI_LOCATION,
        });
  return client;
}

/** Model id from env, e.g. the one shown in Model Garden. */
export function getModelId(): string {
  assertVertexConfigured();
  return env.VERTEX_AI_MODEL;
}
