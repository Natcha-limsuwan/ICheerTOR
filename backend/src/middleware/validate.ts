import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";
import { logSecurityEvent } from "../utils/security-log.js";

/**
 * Server-side request validation (threats T09, T10; ASVS V2.2.1, V2.2.2,
 * V15.3.3, V15.3.5).
 *
 * Every schema is an allowlist: only declared fields with the declared types,
 * lengths and ranges pass. That blocks NoSQL operator injection
 * (`{"$ne": null}` is an object, not the expected string), type confusion
 * (`?page=1&page=2` is an array) and mass assignment (unknown body fields are
 * rejected or stripped, depending on the schema).
 *
 * - body:   replaced with the parsed value, so routes only see allowed fields
 * - query:  validated; the parsed value is stored in res.locals.query
 *           (Express 5 makes req.query read-only)
 * - params: validated
 */
export function validate(schemas: { body?: ZodType; query?: ZodType; params?: ZodType }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const part of ["params", "query", "body"] as const) {
      const schema = schemas[part];
      if (!schema) continue;

      const input = part === "body" ? (req.body ?? {}) : req[part];
      const result = schema.safeParse(input);
      if (!result.success) {
        const details = result.error.issues.slice(0, 20).map((issue) => ({
          field: [part, ...issue.path.map(String)].join("."),
          message: issue.message,
        }));
        logSecurityEvent(
          "validation_failed",
          {
            userId: req.user?.id,
            method: req.method,
            path: req.originalUrl.split("?")[0],
            fields: details.map((d) => d.field),
            ip: req.ip,
          },
          "warn",
        );
        res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Invalid request", details },
        });
        return;
      }

      if (part === "body") req.body = result.data;
      else res.locals[part] = result.data;
    }
    next();
  };
}

/** Reject malformed MongoDB ObjectIds in route params before they reach a query (400 instead of a CastError 500). */
export function objectIdParam(req: Request, res: Response, next: NextFunction, value: unknown): void {
  if (typeof value === "string" && /^[a-f0-9]{24}$/i.test(value)) {
    next();
    return;
  }
  logSecurityEvent(
    "validation_failed",
    { userId: req.user?.id, method: req.method, path: req.originalUrl.split("?")[0], fields: ["params.id"], ip: req.ip },
    "warn",
  );
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid id" } });
}
