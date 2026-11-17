import { Request, Response, NextFunction } from "express";

/**
 * Generic, client-safe messages per status (threat T22; ASVS V16.5.1).
 * The original error message never reaches the client: body-parser and
 * library messages can reveal parser internals, queries or file paths.
 */
const SAFE_ERRORS: Record<number, { code: string; message: string }> = {
  400: { code: "BAD_REQUEST", message: "Malformed request" },
  401: { code: "UNAUTHORIZED", message: "Authentication required" },
  403: { code: "FORBIDDEN", message: "Insufficient permissions" },
  404: { code: "NOT_FOUND", message: "Resource not found" },
  405: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
  413: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" },
  415: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Unsupported content type" },
  429: { code: "RATE_LIMITED", message: "Too many requests, please try again later." },
};

const INTERNAL = { code: "INTERNAL_ERROR", message: "Internal server error" };

/** JSON 404 for unknown API routes (instead of Express's HTML page). */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: SAFE_ERRORS[404] });
}

/**
 * Global ("last resort") error handler. Must be registered after all routes.
 * Details go to the server log only; the client gets a generic message.
 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  const e = (err ?? {}) as { status?: unknown; statusCode?: unknown; message?: unknown; stack?: unknown; type?: unknown };
  const rawStatus = Number(e.status ?? e.statusCode);
  const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;

  const logLine = JSON.stringify({
    ts: new Date().toISOString(),
    level: status >= 500 ? "error" : "warn",
    type: "http_error",
    status,
    errorType: typeof e.type === "string" ? e.type : undefined,
    method: req.method,
    path: req.originalUrl.split("?")[0],
    message: typeof e.message === "string" ? e.message : String(err),
    stack: status >= 500 && typeof e.stack === "string" ? e.stack : undefined,
  });
  if (status >= 500) console.error(logLine);
  else console.warn(logLine);

  if (res.headersSent) {
    next(err);
    return;
  }

  const body = status >= 500 ? INTERNAL : (SAFE_ERRORS[status] ?? SAFE_ERRORS[400]);
  res.status(status).json({ error: body });
}
