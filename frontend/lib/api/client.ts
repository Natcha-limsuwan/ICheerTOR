/**
 * API client for making authenticated requests to the backend.
 *
 * The backend URL is configured via NEXT_PUBLIC_API_URL.
 * Authentication is handled via JWT tokens stored in localStorage.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/* ─── Token management ─────────────────────────────────────────────── */

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("icheertor_token");
}

export function setToken(token: string): void {
  localStorage.setItem("icheertor_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("icheertor_token");
}

/* ─── Base fetch wrapper ───────────────────────────────────────────── */

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<{ data: T; meta?: { total?: number; page?: number; limit?: number } }> {
  const { params, headers: customHeaders, ...fetchOptions } = options;

  // Build URL with query params
  let url = `${API_BASE_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        searchParams.set(key, String(value));
      }
    });
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  // Add auth header
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(customHeaders as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message =
      (errorBody as { error?: { message?: string } }).error?.message ??
      `API error: ${response.status}`;
    throw new Error(message);
  }

  return response.json();
}

/* ─── Public API methods ───────────────────────────────────────────── */

export const api = {
  get: <T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>) =>
    apiFetch<T>(endpoint, { method: "GET", params }),

  post: <T>(endpoint: string, body?: unknown) =>
    apiFetch<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(endpoint: string, body?: unknown) =>
    apiFetch<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(endpoint: string, body?: unknown) =>
    apiFetch<T>(endpoint, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string) =>
    apiFetch<T>(endpoint, { method: "DELETE" }),
};

/* ─── Auth helpers ─────────────────────────────────────────────────── */

/** Start Google OAuth by redirecting to the backend. */
export function loginWithGoogle(): void {
  window.location.href = `${API_BASE_URL}/auth/google`;
}

/**
 * Exchange the one-time login code from the OAuth callback for a session
 * token. The code arrives in the URL fragment and is single use.
 */
export async function exchangeLoginCode(code: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error("login_code_rejected");
  const body = (await res.json()) as { data?: { token?: string } };
  if (!body.data?.token) throw new Error("login_code_rejected");
  setToken(body.data.token);
}

/** End the session on the server, then clear local state. */
export async function logout(redirectTo = "/"): Promise<void> {
  const token = getToken();
  if (token) {
    // Best effort: even if the server is unreachable, the local token is removed.
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
  clearToken();
  window.location.href = redirectTo;
}

/**
 * Watch every fetch to the backend: when a request that carried a session
 * token gets 401, the session has ended on the server (logout elsewhere,
 * idle timeout, absolute lifetime, suspension). Clear the stale token and
 * send the user to sign in again.
 *
 * Pages call fetch() directly in many places, so this wraps window.fetch
 * once instead of relying on every call site to handle 401.
 */
let authGuardInstalled = false;
export function installSessionExpiryGuard(): void {
  if (typeof window === "undefined" || authGuardInstalled) return;
  authGuardInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    if (response.status === 401) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const sentToken = headers.get("Authorization")?.startsWith("Bearer ");
      if (url.startsWith(API_BASE_URL) && sentToken && getToken()) {
        clearToken();
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login?reason=session_expired";
        }
      }
    }
    return response;
  };
}

/** Get current user info (role and status come from the server's database). */
export async function getCurrentUser() {
  try {
    const result = await api.get<{
      id: string;
      email: string;
      name: string;
      role: string;
      status: string;
    }>("/auth/me");
    return result.data;
  } catch {
    return null;
  }
}
