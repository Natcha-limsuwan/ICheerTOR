/** Bounded, redacted diagnostics; never print whole SDK error/request objects. */
export function providerDiagnostic(error: unknown, privateValues: string[]): string[] {
  const clean = (value: string): string => {
    let text = value;
    for (const secret of privateValues.filter(v => v.length >= 6).sort((a, b) => b.length - a.length)) {
      text = text.split(secret).join("[REDACTED]");
      text = text.split(encodeURIComponent(secret)).join("[REDACTED]");
    }
    return text.replace(/https?:\/\/[^\s"<>]+/gi, "[URL omitted]")
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .replace(/(?:AIza|GOCSPX-|AQ\.)[A-Za-z0-9_.-]+/g, "[REDACTED]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email omitted]")
      .replace(/\b(projects|consumers)\/[A-Za-z0-9_.:-]+/g, "$1/[REDACTED]")
      .replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1800);
  };
  const raw = error instanceof Error ? error.message : "Provider error without a message";
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { /* SDK sometimes uses plain text. */ }
  const body = parsed?.error ?? parsed;
  const lines = [`Provider message (redacted): ${clean(typeof body?.message === "string" ? body.message : raw)}`];
  if (typeof body?.status === "string") lines.push(`Provider status: ${clean(body.status)}`);
  for (const detail of (Array.isArray(body?.details) ? body.details.slice(0, 8) : [])) {
    if (typeof detail.reason === "string") lines.push(`Provider reason: ${clean(detail.reason)}`);
    if (typeof detail.retryDelay === "string") lines.push(`Provider retry delay: ${clean(detail.retryDelay)}`);
    for (const key of ["quota_metric", "quota_limit", "quota_limit_value", "service"]) {
      if (typeof detail.metadata?.[key] === "string") lines.push(`${key}: ${clean(detail.metadata[key])}`);
    }
    for (const violation of (Array.isArray(detail.violations) ? detail.violations.slice(0, 4) : [])) {
      for (const key of ["quotaMetric", "quotaId", "quotaValue", "description"]) {
        if (["string", "number"].includes(typeof violation[key])) lines.push(`${key}: ${clean(String(violation[key]))}`);
      }
    }
  }
  return lines;
}
