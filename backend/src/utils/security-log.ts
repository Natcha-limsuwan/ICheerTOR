/* Structured security-event logging.
 *
 * Every entry is a single JSON line, so attacker-controlled values (paths,
 * user agents, reasons) are escaped by JSON.stringify and cannot forge extra
 * log lines (log injection, ASVS V16.4.1). Never pass tokens, login codes or
 * OAuth state values in `fields`. */

export type SecurityEvent =
  | "login_success"
  | "login_failure"
  | "login_code_invalid"
  | "logout"
  | "logout_all"
  | "session_rejected"
  | "account_disabled_access"
  | "authz_denied"
  | "rate_limited"
  | "validation_failed"
  | "sessions_revoked"
  | "admin_account_action"
  | "admin_role_change"
  | "personal_data_export"
  | "account_deletion";

export function logSecurityEvent(
  event: SecurityEvent,
  fields: Record<string, unknown> = {},
  level: "info" | "warn" = "info",
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    type: "security",
    event,
    ...fields,
  });
  if (level === "warn") console.warn(line);
  else console.info(line);
}
