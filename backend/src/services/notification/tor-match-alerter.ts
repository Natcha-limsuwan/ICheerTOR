/* Match new TORs against active company profiles and prepare in-app/email alerts.
 * This service is not connected to automatic ingestion or cron triggers.
 * Run it manually or through backend/scripts/test-match-alert.ts. */

import { Types } from "mongoose";
import { processingAllowed } from "../pdpa/processing-permission.js";
import { connectDB } from "../../db/connection.js";
import TORRecord, { ITORRecord } from "../../db/models/tor-record.js";
import VendorProfile, { IVendorProfile } from "../../db/models/vendor-profile.js";
import User, { IUser } from "../../db/models/user.js";
import Notification from "../../db/models/notification.js";
import { matchQualifications, MatchResult } from "../matching/qualification-matcher.js";
import { dispatchNotification } from "./dispatcher.js";
import { sendMatchAlertEmail } from "./email-sender.js";
import { deliverEmailOnce } from "./delivery.js";

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface MatchAlertEvaluation {
  userId: string;
  userEmail: string;
  userName: string;
  matched: boolean;
  fitScore: number | null;
  matchScore: number | null;
  eligibilityStatus: "eligible" | "ineligible" | "incomplete" | "unknown";
  notificationDispatched: boolean;
  emailSent: boolean;
  reason: string;
}

export interface TorMatchAlertOptions {
  /* If true, evaluate matches but do NOT save notifications or send emails. */
  dryRun?: boolean;
  /* Minimum fit score (0.0 to 1.0) to qualify as a match. Defaults to 0.5. */
  minFitScore?: number;
  /* Limit matching to a single user ID for testing. */
  targetUserId?: string | Types.ObjectId;
  /* Test seam for a mocked SMTP provider. */
  sendEmail?: typeof sendMatchAlertEmail;
}

export interface TorMatchAlertSummary {
  torRecordId: string;
  projectTitle: string;
  totalUsersEvaluated: number;
  matchedUsersCount: number;
  notificationsCreated: number;
  emailsSent: number;
  evaluations: MatchAlertEvaluation[];
}

/* ─── Core Matching & Alert Function ────────────────────────────────── */

/* Evaluate a single TOR against users and prepare/dispatch alerts. */
export async function evaluateAndAlertForTor(
  torRecordId: string | Types.ObjectId,
  options: TorMatchAlertOptions = {},
): Promise<TorMatchAlertSummary> {
  await connectDB();

  const { dryRun = false, minFitScore = 0.5, targetUserId, sendEmail = sendMatchAlertEmail } = options;

  const tor = await TORRecord.findById(torRecordId);
  if (!tor) {
    throw new Error(`TORRecord not found: ${torRecordId}`);
  }

  const qualifications = tor.parsedData?.qualifications ?? [];
  const matchContext = {
    title: tor.title,
    scopeOfWork: tor.summary?.overview ?? tor.parsedData?.scopeOfWork?.content,
    workType: tor.parsedData?.workType,
    budget: tor.budget ?? tor.medianPrice ?? tor.parsedData?.medianPrice?.value,
    contractDurationDays: tor.parsedData?.keyDates?.contractDurationDays?.value,
    techRequirements: tor.parsedData?.techRequirements,
  };

  // Find active users with vendor profiles
  const userFilter: Record<string, unknown> = {
    status: "active",
    deletedAt: { $exists: false },
  };
  if (targetUserId) {
    userFilter._id = targetUserId;
  }

  const users = await User.find(userFilter).lean();
  const evaluations: MatchAlertEvaluation[] = [];

  let matchedUsersCount = 0;
  let notificationsCreated = 0;
  let emailsSent = 0;

  for (const user of users) {
    if (!(await processingAllowed(user._id.toString()))) continue;
    const profile = await VendorProfile.findOne({ userId: user._id }).lean();
    if (!profile) {
      continue;
    }

    const matchResult: MatchResult = matchQualifications(
      profile as IVendorProfile,
      qualifications,
      matchContext,
    );

    const fitScore = matchResult.fitScore ?? matchResult.matchScore;
    const isEligible = matchResult.eligibilityStatus === "eligible";
    const isGoodFit = fitScore != null && fitScore >= minFitScore;

    // A user matches if they are explicitly eligible or meet the fit score threshold
    const isMatch = isEligible || isGoodFit;

    if (!isMatch) {
      evaluations.push({
        userId: user._id.toString(),
        userEmail: user.email,
        userName: user.name,
        matched: false,
        fitScore,
        matchScore: matchResult.matchScore,
        eligibilityStatus: matchResult.eligibilityStatus,
        notificationDispatched: false,
        emailSent: false,
        reason: `Score (${Math.round((fitScore ?? 0) * 100)}%) below threshold and not eligible`,
      });
      continue;
    }

    matchedUsersCount++;
    const prefs = user.notificationPrefs ?? { inApp: true, email: false };

    // Match alerts created before dedupeKey existed. Newer ones are deduplicated
    // atomically by dispatchNotification's unique (userId, dedupeKey) index.
    const existingNotif = await Notification.findOne({
      userId: user._id,
      torRecordId: tor._id,
      type: "new_match",
      dedupeKey: { $exists: false },
    });

    if (existingNotif && !dryRun) {
      evaluations.push({
        userId: user._id.toString(),
        userEmail: user.email,
        userName: user.name,
        matched: true,
        fitScore,
        matchScore: matchResult.matchScore,
        eligibilityStatus: matchResult.eligibilityStatus,
        notificationDispatched: false,
        emailSent: false,
        reason: "Notification already sent previously",
      });
      continue;
    }

    if (dryRun) {
      evaluations.push({
        userId: user._id.toString(),
        userEmail: user.email,
        userName: user.name,
        matched: true,
        fitScore,
        matchScore: matchResult.matchScore,
        eligibilityStatus: matchResult.eligibilityStatus,
        notificationDispatched: false,
        emailSent: false,
        reason: "DRY-RUN: Match confirmed, no alert dispatched",
      });
      continue;
    }

    // Prepare notification text
    const budgetText = matchContext.budget != null
      ? `฿${matchContext.budget.toLocaleString("th-TH")}`
      : "ไม่ระบุงบ";
    const scoreText = fitScore != null ? `${Math.round(fitScore * 100)}%` : "รอการประเมิน";

    const title = `🎯 พบ TOR ใหม่ที่ตรงกับคุณ: ${tor.title}`;
    const body = `หน่วยงาน: ${tor.agencyName}\nงบประมาณ: ${budgetText}\nคะแนนความเหมาะสม: ${scoreText}`;
    const linkUrl = `/procurement/${tor._id.toString()}`;

    // 1. Dispatch in-app notification once per TOR + user (skip generic email so we can send the rich match alert email below)
    const dispatchResult = await dispatchNotification({
      userId: user._id,
      torRecordId: tor._id,
      type: "new_match",
      title,
      body,
      linkUrl,
      skipEmail: true,
      dedupeKey: `new_match:${tor._id.toString()}`,
    });

    if (!dispatchResult.duplicate) notificationsCreated++;

    // 2. Rich match email, claimed atomically: a rerun retries only a failed delivery.
    let emailSentSuccess = false;
    let emailAttempted = false;
    if (prefs.email) {
      const delivery = await deliverEmailOnce(dispatchResult.notificationId, user._id, () =>
        sendEmail({
          to: user.email,
          recipientName: user.name,
          projectTitle: tor.title,
          agencyName: tor.agencyName,
          budget: matchContext.budget,
          matchScore: matchResult.matchScore,
          fitScore,
          eligibilityStatus: matchResult.eligibilityStatus,
          submissionDeadline: tor.submissionDeadline ? tor.submissionDeadline.toISOString() : null,
          torRecordId: tor._id.toString(),
        }),
      );
      emailAttempted = delivery.status !== "skipped";
      emailSentSuccess = delivery.status === "sent";
    }

    if (dispatchResult.duplicate && !emailAttempted) {
      evaluations.push({
        userId: user._id.toString(),
        userEmail: user.email,
        userName: user.name,
        matched: true,
        fitScore,
        matchScore: matchResult.matchScore,
        eligibilityStatus: matchResult.eligibilityStatus,
        notificationDispatched: false,
        emailSent: false,
        reason: "Notification already sent previously",
      });
      continue;
    }

    if (emailSentSuccess) {
      emailsSent++;
    }

    evaluations.push({
      userId: user._id.toString(),
      userEmail: user.email,
      userName: user.name,
      matched: true,
      fitScore,
      matchScore: matchResult.matchScore,
      eligibilityStatus: matchResult.eligibilityStatus,
      notificationDispatched: true,
      emailSent: emailSentSuccess,
      reason: `Alert dispatched successfully (inApp: ${prefs.inApp}, email: ${prefs.email})`,
    });
  }

  return {
    torRecordId: tor._id.toString(),
    projectTitle: tor.title,
    totalUsersEvaluated: users.length,
    matchedUsersCount,
    notificationsCreated,
    emailsSent,
    evaluations,
  };
}
