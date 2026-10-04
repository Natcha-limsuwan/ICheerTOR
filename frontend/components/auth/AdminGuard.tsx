"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import CircularProgress from "@mui/material/CircularProgress";

const STAFF_ROLES = ["admin", "developer"];

/**
 * Client-side admin guard.
 * Redirects non-staff users (admin/developer) to the dashboard.
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const isStaff = STAFF_ROLES.includes(user?.role ?? "");

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
    } else if (!isStaff) {
      router.replace("/dashboard");
    }
  }, [user, loading, isStaff, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CircularProgress />
      </div>
    );
  }

  if (!user || !isStaff) {
    return null;
  }

  return <>{children}</>;
}
