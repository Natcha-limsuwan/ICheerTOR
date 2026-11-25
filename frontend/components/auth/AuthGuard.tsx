"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import CircularProgress from "@mui/material/CircularProgress";

/**
 * Client-side login guard for signed-in pages.
 *
 * The session token lives in localStorage, which the Next.js server (and a
 * proxy/middleware) cannot read, so the check has to happen in the browser.
 * AuthProvider validates the token with GET /auth/me and clears it when the
 * backend rejects it; until that finishes nothing is rendered, so a visitor
 * without a valid session never sees the page shell or its API errors.
 *
 * The backend still enforces authentication on every API call — this guard
 * only decides what the browser shows.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <CircularProgress />
      </div>
    );
  }

  return <>{children}</>;
}
