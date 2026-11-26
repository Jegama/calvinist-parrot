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

type SessionIdentity = {
  user: AppwriteUser | null;
  displayName: string;
};

type AuthContextValue = SessionIdentity & {
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (nextUser: AppwriteUser | null, displayName?: string) => void;
  updateDisplayName: (userId: string, displayName: string) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export type AuthResponse = {
  authenticated?: boolean;
  user?: AppwriteUser | null;
  profile?: { displayName: string } | null;
  error?: string;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<SessionIdentity>({ user: null, displayName: "" });
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const setUser = useCallback((user: AppwriteUser | null, displayName?: string) => {
    setIdentity({ user, displayName: displayName || user?.name || "" });
    setLoading(false);
  }, []);

  const updateDisplayName = useCallback((userId: string, displayName: string) => {
    setIdentity((current) => current.user?.$id === userId ? { ...current, displayName } : current);
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

      const payload = (await response.json()) as AuthResponse;
      setUser(payload.authenticated ? payload.user ?? null : null, payload.profile?.displayName);
    } catch {
      setUser(null);
    }
  }, [setUser]);

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
    () => ({ ...identity, loading, refresh, setUser, updateDisplayName, logout }),
    [identity, loading, refresh, setUser, updateDisplayName, logout],
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
