import type { UserRole } from "../types.js";

/**
 * Permission model: roles grant scopes, routes require scopes
 * (threat T06; ASVS V8.1.1, V8.2.1, V8.3.1).
 *
 * Scopes are derived on the server from the user's *current* role in the
 * database on every request (see middleware/auth.ts). They are never read
 * from the token or the client, so a user cannot add scopes to themselves
 * and a role change takes effect on the next request.
 *
 * Policy (matches README "Role System"):
 *   user       browse TORs, suggest corrections, manage own profile,
 *              bookmarks, notifications and personal data
 *   admin      + review TOR extractions, view pipeline health,
 *              view users and audit logs, suspend/ban/reinstate *users*
 *              (not other admins or developers); cannot change roles
 *   developer  + change roles; manage admins
 */
export const SCOPES = [
  "tor:read",
  "tor:correct",
  "profile:own",
  "bookmarks:own",
  "notifications:own",
  "pdpa:own",
  "tor:review",
  "pipeline:read",
  "users:read",
  "users:manage",
  "audit:read",
  "roles:manage",
] as const;

export type Scope = (typeof SCOPES)[number];

const USER_SCOPES: readonly Scope[] = [
  "tor:read",
  "tor:correct",
  "profile:own",
  "bookmarks:own",
  "notifications:own",
  "pdpa:own",
];

const ADMIN_SCOPES: readonly Scope[] = [
  ...USER_SCOPES,
  "tor:review",
  "pipeline:read",
  "users:read",
  "users:manage",
  "audit:read",
];

const DEVELOPER_SCOPES: readonly Scope[] = [...ADMIN_SCOPES, "roles:manage"];

export const ROLE_SCOPES: Readonly<Record<UserRole, readonly Scope[]>> = Object.freeze({
  user: USER_SCOPES,
  admin: ADMIN_SCOPES,
  developer: DEVELOPER_SCOPES,
});

export function scopesForRole(role: UserRole): readonly Scope[] {
  return ROLE_SCOPES[role] ?? [];
}

export function hasScope(role: UserRole, scope: Scope): boolean {
  return scopesForRole(role).includes(scope);
}

/** Role rank for "may act on" checks: you can only manage accounts ranked below you. */
const ROLE_RANK: Readonly<Record<UserRole, number>> = { user: 0, admin: 1, developer: 2 };

/**
 * May `actor` change the status of `target`? Admins manage users only;
 * developers manage users and admins; nobody manages a developer through the
 * API, and nobody acts on their own account.
 */
export function canManageAccount(actor: { id: string; role: UserRole }, target: { id: string; role: UserRole }): boolean {
  if (actor.id === target.id) return false;
  if (target.role === "developer") return false;
  return ROLE_RANK[actor.role] > ROLE_RANK[target.role];
}
