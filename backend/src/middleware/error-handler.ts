import { Request, Response, NextFunction } from "express";

/**
 * Global error handler middleware.
 * Must be registered after all routes.
 */
export function errorHandler(
  err: Error & { status?: number },
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("[Error]", err.message, err.stack);

  const status = err.status ?? 500;
  res.status(status).json({
    error: {
      code: status === 500 ? "INTERNAL_ERROR" : "ERROR",
      message: status === 500 ? "Internal server error" : err.message,
    },
  });
}
