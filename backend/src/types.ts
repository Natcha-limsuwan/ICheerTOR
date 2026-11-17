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
    interface Request {
      /** Server-side session id of the authenticated request (set by authenticate()). */
      authSessionId?: string;
      /** When the current session was created by a sign-in (for step-up checks). */
      authenticatedAt?: Date;
    }
  }
}
