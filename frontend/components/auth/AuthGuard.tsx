"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import CircularProgress from "@mui/material/CircularProgress";
import { useAuth } from "@/components/providers/AuthProvider";

/** Keep private page components unmounted until the session has been checked. */
export default function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><CircularProgress /></div>;
  }
  return user ? children : null;
}
