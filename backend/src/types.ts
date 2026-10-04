export type UserRole = "user" | "admin" | "developer";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: string;
  avatarUrl?: string;
}

/* ─── Extend Express + Passport types ─────────────────────────────── */

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AuthUser {}
  }
}
