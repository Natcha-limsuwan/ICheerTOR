import { NextResponse } from "next/server";

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

/** Return a JSON success response. */
export function apiSuccess<T>(
  data: T,
  meta?: ApiSuccessResponse["meta"],
  status: number = 200,
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({ data, ...(meta ? { meta } : {}) }, { status });
}

/** Return a JSON error response. */
export function apiError(
  code: string,
  message: string,
  status: number = 400,
  details?: unknown[],
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

/** Common error factories. */
export const Errors = {
  badRequest: (msg: string, details?: unknown[]) =>
    apiError("BAD_REQUEST", msg, 400, details),
  unauthorized: (msg = "Authentication required") =>
    apiError("UNAUTHORIZED", msg, 401),
  forbidden: (msg = "Insufficient permissions") =>
    apiError("FORBIDDEN", msg, 403),
  notFound: (msg = "Resource not found") =>
    apiError("NOT_FOUND", msg, 404),
  conflict: (msg: string) =>
    apiError("CONFLICT", msg, 409),
  rateLimited: (msg = "Too many requests") =>
    apiError("RATE_LIMITED", msg, 429),
  internal: (msg = "Internal server error") =>
    apiError("INTERNAL_ERROR", msg, 500),
} as const;
