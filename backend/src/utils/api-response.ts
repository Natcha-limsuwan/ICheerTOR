import { Response } from "express";

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface ApiSuccessResponse<T = unknown> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

/** Send a JSON success response. */
export function apiSuccess<T>(
  res: Response,
  data: T,
  meta?: ApiSuccessResponse["meta"],
  status: number = 200,
): void {
  res.status(status).json({ data, ...(meta ? { meta } : {}) });
}

/** Send a JSON error response. */
export function apiError(
  res: Response,
  code: string,
  message: string,
  status: number = 400,
  details?: unknown[],
): void {
  res.status(status).json({
    error: { code, message, ...(details ? { details } : {}) },
  });
}

/** Common error factories. */
export const Errors = {
  badRequest: (res: Response, msg: string, details?: unknown[]) =>
    apiError(res, "BAD_REQUEST", msg, 400, details),
  unauthorized: (res: Response, msg = "Authentication required") =>
    apiError(res, "UNAUTHORIZED", msg, 401),
  forbidden: (res: Response, msg = "Insufficient permissions") =>
    apiError(res, "FORBIDDEN", msg, 403),
  notFound: (res: Response, msg = "Resource not found") =>
    apiError(res, "NOT_FOUND", msg, 404),
  conflict: (res: Response, msg: string) =>
    apiError(res, "CONFLICT", msg, 409),
  rateLimited: (res: Response, msg = "Too many requests") =>
    apiError(res, "RATE_LIMITED", msg, 429),
  internal: (res: Response, msg = "Internal server error") =>
    apiError(res, "INTERNAL_ERROR", msg, 500),
} as const;
