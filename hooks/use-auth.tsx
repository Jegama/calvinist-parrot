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
type ProfileSnapshot = { displayName: string; firstName?: string | null; firstNameNudgeShown?: boolean };
type AccountCredentials = Pick<AppwriteUser, "email" | "emailVerification" | "passwordUpdate">;

type SessionIdentity = {
  user: AppwriteUser | null;
  profile: ProfileSnapshot | null;
};

type AuthContextValue = SessionIdentity & {
  displayName: string;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (nextUser: AppwriteUser | null, profile?: ProfileSnapshot | null) => void;
  updateProfile: (userId: string, profile: ProfileSnapshot) => void;
  updateCredentials: (userId: string, account: AccountCredentials) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export type AuthResponse = {
  authenticated?: boolean;
  user?: AppwriteUser | null;
  profile?: ProfileSnapshot | null;
  error?: string;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<SessionIdentity>({ user: null, profile: null });
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const setUser = useCallback((user: AppwriteUser | null, profile?: ProfileSnapshot | null) => {
    setIdentity({ user, profile: profile ?? null });
    setLoading(false);
  }, []);

  const updateProfile = useCallback((userId: string, profile: ProfileSnapshot) => {
    setIdentity((current) => current.user?.$id === userId ? { ...current, profile } : current);
  }, []);

  const updateCredentials = useCallback((userId: string, { email, emailVerification, passwordUpdate }: AccountCredentials) => {
    setIdentity((current) => current.user?.$id === userId
      ? { ...current, user: { ...current.user, email, emailVerification, passwordUpdate } }
      : current);
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
      setUser(payload.authenticated ? payload.user ?? null : null, payload.profile);
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
    () => ({
      ...identity, displayName: identity.profile?.displayName || identity.user?.name || "",
      loading, refresh, setUser, updateProfile, updateCredentials, logout,
    }),
    [identity, loading, refresh, setUser, updateProfile, updateCredentials, logout],
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
