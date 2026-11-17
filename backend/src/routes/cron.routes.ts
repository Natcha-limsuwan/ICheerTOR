import { Router, Request, Response } from "express";
import crypto from "crypto";
import { apiSuccess, Errors } from "../utils/api-response.js";
import { env } from "../config/env.js";

const router = Router();

/** POST /api/cron/scrape — Trigger a scraping cycle. Secured via cron secret. */
router.post("/scrape", (req: Request, res: Response) => {
  const secret = req.headers["x-cron-secret"];
  // An unset CRON_SECRET disables the endpoint (an empty header must not match an empty secret);
  // the comparison is constant-time.
  const expected = Buffer.from(env.CRON_SECRET);
  const provided = Buffer.from(typeof secret === "string" ? secret : "");
  if (
    expected.length === 0 ||
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    Errors.unauthorized(res, "Invalid cron secret");
    return;
  }

  const jobId = crypto.randomUUID();

  // In production this would trigger the actual scraper scheduler
  console.log(`[CRON] Scrape job started: ${jobId}`);

  apiSuccess(res, { jobId, status: "started" });
});

export default router;
