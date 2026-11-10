/**
 * e-GP's planned downtime page.
 *
 * During maintenance every e-GP host — the RSS feed, process5's archive and
 * download services — answers HTTP 200 with the same HTML notice instead of
 * its normal body, e.g. (22–24 Oct 2026):
 *   "แจ้งปิดระบบ e-GP ชั่วคราว … ปิดระบบชั่วคราว ในวันพฤหัสบดีที่ 22 ตุลาคม 2569
 *    ตั้งแต่ เวลา 18.00 น. - วันเสาร์ที่ 24 ตุลาคม 2569 เวลา 18.00 น. และจะเปิดใช้งาน
 *    อีกครั้งในวันเสาร์ที่ 24 ตุลาคม 2569 เวลา 18.01 น. เป็นต้นไป"
 * That is not a failure of ours or of the project: callers skip the round,
 * keep queued work queued, and say when e-GP comes back.
 */

export class EgpMaintenanceError extends Error {
  constructor(public readonly notice: string) {
    super(`e-GP ปิดปรับปรุงระบบ — ${notice}`);
    this.name = "EgpMaintenanceError";
  }
}

/** Visible text of an HTML page: entities decoded, tags and whitespace collapsed. */
function visibleText(html: string): string {
  return html
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The maintenance notice when `body` is e-GP's downtime page, else null.
 * Cheap enough to run on any non-JSON, non-ZIP response.
 */
export function maintenanceNotice(body: string): string | null {
  if (!/<html/i.test(body)) return null;
  const text = visibleText(body);
  if (!/ปิดระบบ|ปิดปรับปรุง/.test(text)) return null;
  // The sentence about reopening is the useful part; fall back to the start.
  // Not [^.] — the time itself has a dot ("18.01 น.").
  const reopen = text.match(/(จะเปิดใช้งาน.{0,120}?(เป็นต้นไป|น\.))/);
  return (reopen?.[1] ?? text.slice(0, 160)).trim();
}

/** Throw EgpMaintenanceError when `body` is the downtime page. */
export function assertNotMaintenance(body: string): void {
  const notice = maintenanceNotice(body);
  if (notice) throw new EgpMaintenanceError(notice);
}
