import { NextRequest } from "next/server";
import { apiSuccess, Errors } from "@/lib/utils/api-response";
import crypto from "crypto";

/** POST /api/cron/scrape — Trigger a scraping cycle. Secured via cron secret. */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return Errors.unauthorized("Invalid cron secret");
  }

  const jobId = crypto.randomUUID();

  // In production this would trigger the actual scraper scheduler
  // For now we return a job ID
  console.log(`[CRON] Scrape job started: ${jobId}`);

  return apiSuccess({ jobId, status: "started" });
}
