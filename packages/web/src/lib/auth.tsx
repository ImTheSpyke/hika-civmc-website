import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api/client.js";
import type { Me } from "../api/types.js";

interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const me = await api.get<Me>("/api/me");
      setUser(me);
    } catch {
      setUser(null);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", redirect: "manual" });
    setUser(null);
    window.location.href = "/";
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
