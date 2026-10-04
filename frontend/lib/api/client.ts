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

/** Sign out by clearing the token. */
export function logout(): void {
  clearToken();
  window.location.href = "/";
}

/** Get current user info from the JWT. */
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
