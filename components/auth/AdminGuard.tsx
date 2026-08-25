"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import CircularProgress from "@mui/material/CircularProgress";

/**
 * Client-side admin guard.
 * Redirects non-admin users to the dashboard.
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (session?.user as any)?.role;

  useEffect(() => {
    if (status === "loading") return;

    if (!session) {
      router.replace("/login");
    } else if (role !== "admin") {
      router.replace("/dashboard");
    }
  }, [session, status, role, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CircularProgress />
      </div>
    );
  }

  if (!session || role !== "admin") {
    return null;
  }

  return <>{children}</>;
}
