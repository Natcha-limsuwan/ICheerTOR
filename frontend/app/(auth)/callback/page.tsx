"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { exchangeLoginCode } from "@/lib/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import CircularProgress from "@mui/material/CircularProgress";

const ALLOWED_ERRORS = new Set(["auth_failed", "account_disabled"]);

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const started = useRef(false);

  useEffect(() => {
    // The code is single use: guard against React running the effect twice.
    if (started.current) return;
    started.current = true;

    const error = searchParams.get("error");
    if (error) {
      router.replace(`/login?error=${ALLOWED_ERRORS.has(error) ? error : "auth_failed"}`);
      return;
    }

    // The one-time code arrives in the URL fragment, which browsers never send to servers.
    const code = new URLSearchParams(window.location.hash.slice(1)).get("code");
    // Remove it from the address bar and history straight away.
    window.history.replaceState(null, "", window.location.pathname);

    if (!code) {
      router.replace("/login");
      return;
    }

    exchangeLoginCode(code)
      .then(() => refreshUser())
      .then(() => router.replace("/procurement"))
      .catch(() => router.replace("/login?error=auth_failed"));
  }, [searchParams, router, refreshUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
      <div className="text-center">
        <CircularProgress sx={{ color: "var(--color-primary)" }} />
        <p className="mt-4 text-[var(--color-text-secondary)]">
          กำลังเข้าสู่ระบบ...
        </p>
      </div>
    </div>
  );
}

/**
 * OAuth callback page.
 * Wrapped in Suspense as required by Next.js for useSearchParams().
 */
export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <CircularProgress />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
