/** One optional non-personal text request. Never fetches TORs, DB or sends email. */
import { writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { env } from "../../src/config/env.js";
import { activePrompt } from "../../src/services/ai/prompts/index.js";
import { assertVertexConfigured, getAuthMode, getVertexClient, getModelId } from "../../src/services/ai/vertex-client.js";

async function main() {
  const live = process.argv.includes("--live");
  const gold = readdirSync("eval/gold").filter(name => name.endsWith(".json") && !name.startsWith("_")).map(name => {
    const data = JSON.parse(readFileSync(path.join("eval/gold", name), "utf8"));
    return { projectNumber: data.projectNumber, qualifications: data.qualifications.length,
      hasCache: existsSync(path.join("eval/runs", activePrompt.version, `${data.projectNumber}.json`)) };
  });
  let configured = true;
  try { assertVertexConfigured(); } catch { configured = false; }
  const result = {
    at: new Date().toISOString(), activePrompt: activePrompt.version, authMode: getAuthMode(), configured,
    oauthConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), gold,
    liveRequested: live, liveStatus: "NOT_RUN", statusCode: null as number | null,
    responseChars: null as number | null, finishReason: null as string | null,
    note: "Configuration and a text response do not establish PDF extraction accuracy or confidence calibration.",
  };
  if (live && configured) {
    try {
      const response = await getVertexClient().models.generateContent({
        model: getModelId(), contents: "Reply with exactly QA_OK.",
        config: { temperature: 0, maxOutputTokens: 2048, httpOptions: { timeout: 30000 } },
      });
      result.responseChars = response.text?.trim().length ?? 0;
      result.finishReason = response.candidates?.[0]?.finishReason ?? null;
      result.liveStatus = response.text?.trim() === "QA_OK" ? "PASS" : "UNEXPECTED_RESPONSE";
    } catch (error) {
      // Do not serialize provider errors: they may contain credentials or URLs.
      const status = (error as { status?: unknown }).status;
      result.statusCode = typeof status === "number" ? status : null;
      result.liveStatus = "FAILED";
    }
  } else if (live) result.liveStatus = "BLOCKED_MISSING_CONFIG";
  writeFileSync("../docs/qa/evidence/ai-readiness.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  if (live && result.liveStatus !== "PASS") process.exitCode = 1;
}
main().catch(() => { console.error("AI readiness failed; no provider details logged"); process.exitCode = 1; });
