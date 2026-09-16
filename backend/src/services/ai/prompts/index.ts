import { promptV1 } from "./v1";

export interface ExtractionPrompt {
  version: string;
  systemInstruction: string;
  outputSchema: object;
  examples?: Array<{ input: string; output: unknown }>;
}

/** Active extraction prompt — change this to switch versions. */
export const activePrompt: ExtractionPrompt = promptV1;
