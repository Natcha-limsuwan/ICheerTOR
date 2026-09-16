import { Router, Request, Response } from "express";
import crypto from "crypto";
import { apiSuccess, Errors } from "../utils/api-response.js";
import { env } from "../config/env.js";

const router = Router();

/** POST /api/cron/scrape — Trigger a scraping cycle. Secured via cron secret. */
router.post("/scrape", (req: Request, res: Response) => {
  const secret = req.headers["x-cron-secret"];
  if (secret !== env.CRON_SECRET) {
    Errors.unauthorized(res, "Invalid cron secret");
    return;
  }

  const jobId = crypto.randomUUID();

  // In production this would trigger the actual scraper scheduler
  console.log(`[CRON] Scrape job started: ${jobId}`);

  apiSuccess(res, { jobId, status: "started" });
});

export default router;
