import { auth } from "@/lib/auth/auth-options";
import { Errors } from "@/lib/utils/api-response";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import ConsentRecord from "@/lib/db/models/consent-record";

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  status: string;
}

/* ─── Auth helper ───────────────────────────────────────────────────── */

/**
 * Get the authenticated user from the session.
 * Returns null if not authenticated.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await auth();
  if (!session?.user) return null;

  const user = session.user as Record<string, unknown>;
  return {
    id: user.id as string,
    email: user.email as string,
    name: user.name as string,
    role: (user.role as "user" | "admin") ?? "user",
    status: (user.status as string) ?? "active",
  };
}

/**
 * Require authentication. Returns the user or a 401 NextResponse.
 */
export async function requireAuth(): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser();
  if (!user) return Errors.unauthorized();
  if (user.status === "suspended" || user.status === "banned") {
    return Errors.forbidden("Account is suspended or banned");
  }
  return user;
}

/**
 * Require admin role. Returns the user or a 403 NextResponse.
 */
export async function requireAdmin(): Promise<AuthUser | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  if (result.role !== "admin") return Errors.forbidden("Admin access required");
  return result;
}

/**
 * Check if result is a NextResponse (error) vs a valid user.
 */
export function isErrorResponse(result: AuthUser | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}

/* ─── PDPA consent check ────────────────────────────────────────────── */

/**
 * Verify that the user has active consent for data processing.
 * Returns null if consent is granted, or a 403 NextResponse if not.
 */
export async function requireConsent(
  userId: string,
  purpose: string = "data_processing",
): Promise<NextResponse | null> {
  await connectDB();

  const latestConsent = await ConsentRecord.findOne({
    userId,
    purpose,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!latestConsent || !latestConsent.granted) {
    return Errors.forbidden(
      "Consent required for data processing. Please accept the privacy notice.",
    );
  }

  return null;
}
