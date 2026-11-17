"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  getCurrentUser,
  getToken,
  clearToken,
  installSessionExpiryGuard,
  logout,
} from "@/lib/api/client";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: () => {},
  refreshUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Detect sessions ended by the server (idle timeout, logout elsewhere, suspension).
    installSessionExpiryGuard();
    refreshUser();
  }, [refreshUser]);

  // Session tokens are never accepted from the URL; see app/(auth)/callback.

  const signOut = useCallback(() => {
    setUser(null);
    void logout("/");
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
