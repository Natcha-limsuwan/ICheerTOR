import nodemailer, { Transporter } from "nodemailer";
import { env } from "../../config/env.js";

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/* ─── Singleton Transport ───────────────────────────────────────────── */

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

/* ─── Public API ────────────────────────────────────────────────────── */

/**
 * Verify the SMTP connection is configured and reachable.
 * Returns { ok, error? }.
 */
export async function verifyEmailConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    return {
      ok: false,
      error: "SMTP_USER or SMTP_PASS not configured in environment",
    };
  }

  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Send a raw email.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  try {
    const info = await getTransporter().sendMail({
      from: `"iCheerTOR" <${env.SMTP_USER}>`,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });

    console.log(`[EMAIL] Sent to ${payload.to} — messageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[EMAIL] Failed to send to ${payload.to}: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/* ─── Notification Email Template ───────────────────────────────────── */

const typeLabels: Record<string, string> = {
  new_match: "🎯 TOR ตรงกับคุณ",
  public_hearing: "📢 ช่วงรับฟังความเห็น",
  deadline: "⏰ ใกล้หมดเขต",
  award: "🏆 ประกาศผลแล้ว",
  system: "ℹ️ แจ้งเตือนระบบ",
};

/**
 * Send a formatted notification email.
 */
export async function sendNotificationEmail(
  to: string,
  notification: {
    type: string;
    title: string;
    body: string;
    linkUrl?: string;
  },
): Promise<EmailResult> {
  const typeLabel = typeLabels[notification.type] ?? "แจ้งเตือน";
  const linkButton = notification.linkUrl
    ? `<a href="${env.FRONTEND_URL}${notification.linkUrl}"
         style="display:inline-block;margin-top:16px;padding:10px 24px;
                background-color:#0047AB;color:#ffffff;text-decoration:none;
                border-radius:8px;font-size:14px;font-weight:500;">
        ดูรายละเอียด →
      </a>`
    : "";

  const html = `
<!DOCTYPE html>
<html lang="th">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Tahoma,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0047AB,#0066FF);padding:24px 32px;color:#ffffff;">
            <h1 style="margin:0;font-size:20px;font-weight:700;">iCheerTOR</h1>
            <p style="margin:4px 0 0;font-size:13px;opacity:0.85;">${typeLabel}</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            <h2 style="margin:0 0 8px;font-size:16px;color:#1a1a1a;">${notification.title}</h2>
            <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">${notification.body}</p>
            ${linkButton}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #eee;font-size:11px;color:#999;">
            คุณได้รับอีเมลนี้เพราะเปิดการแจ้งเตือนทางอีเมลใน iCheerTOR<br/>
            หากไม่ต้องการรับอีเมล สามารถปิดได้ที่หน้าตั้งค่าการแจ้งเตือน
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${typeLabel}\n\n${notification.title}\n${notification.body}${
    notification.linkUrl
      ? `\n\nดูรายละเอียด: ${env.FRONTEND_URL}${notification.linkUrl}`
      : ""
  }`;

  return sendEmail({
    to,
    subject: `[iCheerTOR] ${notification.title}`,
    html,
    text,
  });
}
