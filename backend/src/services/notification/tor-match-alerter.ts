/**
 * TOR Match Alerter (PREPARATION SERVICE)
 *
 * This module is prepared to evaluate newly pulled/extracted TOR records
 * against active users' VendorProfiles and notify them via:
 *   1. In-App Notifications (Notification model)
 *   2. Email Alerts (Nodemailer via sendMatchAlertEmail)
 *
 * NOTE: As per architecture requirements, this service is prepared in advance
 * and is NOT hooked into automatic ingestion/cron triggers yet. It can be
 * executed manually or tested via `backend/scripts/test-match-alert.ts`.
 */

import { Types } from "mongoose";
import { connectDB } from "../../db/connection.js";
import TORRecord, { ITORRecord } from "../../db/models/tor-record.js";
import VendorProfile, { IVendorProfile } from "../../db/models/vendor-profile.js";
import User, { IUser } from "../../db/models/user.js";
import Notification from "../../db/models/notification.js";
import { matchQualifications, MatchResult } from "../matching/qualification-matcher.js";
import { dispatchNotification } from "./dispatcher.js";
import { sendMatchAlertEmail } from "./email-sender.js";

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
  /** If true, evaluate matches but do NOT save notifications or send emails. */
  dryRun?: boolean;
  /** Minimum fit score (0.0 to 1.0) to qualify as a match. Defaults to 0.5. */
  minFitScore?: number;
  /** Limit matching to a single user ID for testing. */
  targetUserId?: string | Types.ObjectId;
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

/**
 * Evaluate a single TOR against users and prepare/dispatch alerts.
 */
export async function evaluateAndAlertForTor(
  torRecordId: string | Types.ObjectId,
  options: TorMatchAlertOptions = {},
): Promise<TorMatchAlertSummary> {
  await connectDB();

  const { dryRun = false, minFitScore = 0.5, targetUserId } = options;

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

    // Prevent duplicate match notifications for the same TOR + User
    const existingNotif = await Notification.findOne({
      userId: user._id,
      torRecordId: tor._id,
      type: "new_match",
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

    // 1. Dispatch in-app notification
    const dispatchResult = await dispatchNotification({
      userId: user._id,
      torRecordId: tor._id,
      type: "new_match",
      title,
      body,
      linkUrl,
    });

    notificationsCreated++;

    // 2. If user has email enabled, send dedicated rich match email
    let emailSentSuccess = dispatchResult.channels.email.sent;
    if (prefs.email && !emailSentSuccess) {
      const emailRes = await sendMatchAlertEmail({
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
      });
      emailSentSuccess = emailRes.success;
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
