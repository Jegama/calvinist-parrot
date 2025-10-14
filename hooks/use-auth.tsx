"use client";

import { account } from "@/utils/appwrite";
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

type AppwriteUser = Models.User<Models.Preferences>;

type AuthContextValue = {
  user: AppwriteUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (nextUser: AppwriteUser | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AppwriteUser | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((nextUser: AppwriteUser | null) => {
    setUserState(nextUser);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const currentUser = await account.get();
      setUserState(currentUser);
      
      // Ensure user profile exists in database
      await fetch("/api/user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.$id,
          name: currentUser.name,
          email: currentUser.email,
        }),
      }).catch((error) => {
        console.warn("Failed to ensure user profile:", error);
      });
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
      await account.deleteSession("current");
    } catch (error) {
      console.warn("Failed to delete session", error);
    } finally {
      setUserState(null);
      setLoading(false);
    }
  }, []);

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
