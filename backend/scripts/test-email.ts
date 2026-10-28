/**
 * Test Email Script — verify email sending works end-to-end.
 *
 * Usage:
 *   npx tsx scripts/test-email.ts                        # verify SMTP connection only
 *   npx tsx scripts/test-email.ts send <email>           # send a test email
 *   npx tsx scripts/test-email.ts dispatch <userId>      # dispatch a notification (needs MongoDB)
 */

import { config } from "dotenv";
config({ path: ".env" });

import {
  verifyEmailConnection,
  sendNotificationEmail,
} from "../src/services/notification/email-sender.js";

const [, , command, target] = process.argv;

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  iCheerTOR — Email System Test");
  console.log("═══════════════════════════════════════════════\n");

  // ── Step 1: Always verify connection first ──
  console.log("📡 Verifying SMTP connection...");
  const verification = await verifyEmailConnection();

  if (!verification.ok) {
    console.error(`\n❌ SMTP verification failed: ${verification.error}`);
    console.error("\nCheck your .env file:");
    console.error("  SMTP_HOST=smtp.gmail.com");
    console.error("  SMTP_PORT=587");
    console.error("  SMTP_USER=your-email@gmail.com");
    console.error("  SMTP_PASS=your-app-password");
    console.error("\n💡 For Gmail, generate an App Password at:");
    console.error("   https://myaccount.google.com/apppasswords");
    process.exit(1);
  }

  console.log("✅ SMTP connection verified!\n");

  // ── Step 2: If just verifying, stop here ──
  if (!command) {
    console.log("Connection test passed. No email sent.");
    console.log("\nTo send a test email:");
    console.log("  npx tsx scripts/test-email.ts send your-email@gmail.com");
    process.exit(0);
  }

  // ── Step 3: Send test email ──
  if (command === "send") {
    if (!target) {
      console.error("❌ Please provide a recipient email address.");
      console.error("   npx tsx scripts/test-email.ts send your-email@gmail.com");
      process.exit(1);
    }

    console.log(`📧 Sending test notification email to: ${target}`);

    const result = await sendNotificationEmail(target, {
      type: "system",
      title: "ทดสอบระบบแจ้งเตือนทางอีเมล",
      body: "นี่คืออีเมลทดสอบจากระบบ iCheerTOR หากคุณได้รับอีเมลนี้ แสดงว่าระบบแจ้งเตือนทางอีเมลทำงานปกติ",
      linkUrl: "/procurement",
    });

    if (result.success) {
      console.log(`\n✅ Email sent successfully!`);
      console.log(`   Message ID: ${result.messageId}`);
      console.log(`\n📬 Check your inbox at: ${target}`);
    } else {
      console.error(`\n❌ Failed to send email: ${result.error}`);
      process.exit(1);
    }
  }

  // ── Step 4: Full dispatch test (needs MongoDB) ──
  else if (command === "dispatch") {
    if (!target) {
      console.error("❌ Please provide a user ID from MongoDB.");
      console.error("   npx tsx scripts/test-email.ts dispatch <userId>");
      process.exit(1);
    }

    // Dynamic import to avoid loading mongoose when not needed
    const { dispatchNotification } = await import(
      "../src/services/notification/dispatcher.js"
    );

    console.log(`📨 Dispatching test notification for user: ${target}`);

    const result = await dispatchNotification({
      userId: target,
      type: "system",
      title: "ทดสอบระบบแจ้งเตือน",
      body: "นี่คือการทดสอบการส่งแจ้งเตือนผ่านระบบ dispatcher รวมถึง inApp และ email",
      linkUrl: "/procurement",
    });

    console.log("\n📋 Dispatch result:");
    console.log(`   Notification ID : ${result.notificationId}`);
    console.log(`   inApp           : ✅`);
    console.log(
      `   email           : ${
        result.channels.email.sent
          ? "✅ sent"
          : result.channels.email.error
            ? `❌ ${result.channels.email.error}`
            : "⏭️ disabled by user prefs"
      }`,
    );

    // Cleanup mongoose connection
    const mongoose = (await import("mongoose")).default;
    await mongoose.disconnect();
  } else {
    console.error(`❌ Unknown command: ${command}`);
    console.error("   Available: send, dispatch");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
