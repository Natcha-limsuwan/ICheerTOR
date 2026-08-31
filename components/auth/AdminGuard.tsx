"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import CircularProgress from "@mui/material/CircularProgress";

const STAFF_ROLES = ["admin", "developer"];

/**
 * Client-side admin guard.
 * Redirects non-staff users (admin/developer) to the dashboard.
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (session?.user as any)?.role;
  const isStaff = STAFF_ROLES.includes(role);

  useEffect(() => {
    if (status === "loading") return;

    if (!session) {
      router.replace("/login");
    } else if (!isStaff) {
      router.replace("/dashboard");
    }
  }, [session, status, isStaff, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CircularProgress />
      </div>
    );
  }

  if (!session || !isStaff) {
    return null;
  }

  return <>{children}</>;
}
