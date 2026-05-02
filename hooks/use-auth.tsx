"use client";

import type { Models } from "appwrite";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

export type AppwriteUser = Models.User<Models.Preferences>;

type AuthContextValue = {
  user: AppwriteUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (nextUser: AppwriteUser | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthMeResponse = {
  authenticated: boolean;
  user: AppwriteUser | null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AppwriteUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const setUser = useCallback((nextUser: AppwriteUser | null) => {
    setUserState(nextUser);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load auth state.");
      }

      const payload = (await response.json()) as AuthMeResponse;
      setUserState(payload.authenticated ? payload.user : null);
    } catch {
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to log out.");
      }
    } catch (error) {
      console.warn("Failed to delete session", error);
    } finally {
      queryClient.clear();
      window.location.href = "/";
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, loading, refresh, setUser, logout }),
    [user, loading, refresh, setUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
