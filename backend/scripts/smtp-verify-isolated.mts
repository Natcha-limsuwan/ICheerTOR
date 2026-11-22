/** Verify test SMTP credentials only. Never connect to an application database. */
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";

const args = process.argv.slice(2);
const sendTest = args.includes("--send-test");
const recipient = args.find(arg => arg.startsWith("--to="))?.slice(5);
if (sendTest && (!recipient || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient))) {
  throw new Error("Sending requires an authorized test recipient: --send-test --to=you@example.com");
}

const source = parse(await readFile(new URL("../.env", import.meta.url), "utf8"));
for (const key of Object.keys(process.env)) {
  if (/^(SMTP_|GOOGLE_|VERTEX_|MONGODB_|JWT_|NEXTAUTH_)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: "test",
  MONGODB_URI: "",
  JWT_SECRET: randomBytes(48).toString("hex"),
  FRONTEND_URL: "http://localhost:4400",
});
for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"]) {
  if (source[key]) process.env[key] = source[key];
}

console.log("Live SMTP connection check — no database connection");
console.log("SMTP credentials are not displayed.");
const imported = await import("../src/services/notification/email-sender.js");
const api = imported as unknown as {
  verifyEmailConnection?: () => Promise<{ ok: boolean; error?: string }>;
  sendNotificationEmail?: (to: string, notification: { type: string; title: string; body: string; linkUrl: string }) => Promise<{ success: boolean }>;
  default?: {
    verifyEmailConnection?: () => Promise<{ ok: boolean; error?: string }>;
    sendNotificationEmail?: (to: string, notification: { type: string; title: string; body: string; linkUrl: string }) => Promise<{ success: boolean }>;
  };
};
const verify = api.verifyEmailConnection ?? api.default?.verifyEmailConnection;
if (typeof verify !== "function") throw new Error("SMTP verification export unavailable");
const result = await verify();
console.log(result.ok
  ? "PASS SMTP connection and authentication"
  : "FAIL SMTP verification — check configuration or provider access");
if (!result.ok) {
  const error = result.error ?? "";
  const missing = ["SMTP_USER", "SMTP_PASS"].filter(key => !process.env[key]?.trim());
  const reason = missing.length ? `Missing configuration: ${missing.join(", ")}`
    : /535|534|EAUTH|Invalid login|credentials|authentication|application.specific password/i.test(error)
      ? "SMTP authentication rejected: check sender account, App Password and account policy"
      : /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(error) ? "SMTP hostname/DNS lookup failed"
      : /ETIMEDOUT|timeout|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i.test(error)
        ? "SMTP connection failed or timed out: check network, host and port"
        : /certificate|TLS|SSL|ESOCKET/i.test(error) ? "SMTP TLS/socket connection failed"
        : "Other SMTP verification failure; raw provider message withheld";
  console.log(`Diagnostic: ${reason}`);
}
if (result.ok && sendTest) {
  const send = api.sendNotificationEmail ?? api.default?.sendNotificationEmail;
  if (typeof send !== "function") throw new Error("SMTP send export unavailable");
  const runId = new Date().toISOString();
  console.log(`Synthetic email test ID: ${runId}`);
  const sent = await send(recipient!, {
    type: "system",
    title: `ICheerTOR synthetic SMTP test — ${runId}`,
    body: "This is one authorized test message containing synthetic text only. No application database or real procurement records were used. Confirm receipt in the test inbox.",
    linkUrl: "/",
  });
  console.log(sent.success ? "PASS application email sender reports SMTP submission success" : "FAIL application email submission");
  console.log("Inbox receipt must be confirmed separately by the recipient.");
  process.exitCode = sent.success ? 0 : 1;
} else {
  console.log("No email sent.");
  process.exitCode = result.ok ? 0 : 1;
}
