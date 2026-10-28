"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setToken } from "@/lib/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import CircularProgress from "@mui/material/CircularProgress";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    const error = searchParams.get("error");

    if (error) {
      router.replace(`/login?error=${error}`);
      return;
    }

    if (token) {
      setToken(token);
      refreshUser().then(() => {
        router.replace("/procurement");
      });
    } else {
      router.replace("/login");
    }
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
