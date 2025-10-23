"use client";

import { account } from "@/utils/appwrite";
import { useCallback, useEffect, useState } from "react";

type IdentifierState = {
  userId: string | null;
  loading: boolean;
  ensureCookieId: () => string;
};

function readCookie(key: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${key}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

function writeCookie(key: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}`;
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function useUserIdentifier(): IdentifierState {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const ensureCookieId = useCallback(() => {
    let existing = readCookie("userId");
    if (!existing) {
      existing = crypto.randomUUID();
      writeCookie("userId", existing, ONE_YEAR_SECONDS);
    }
    setUserId(existing);
    return existing;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolveUser() {
      setLoading(true);
      try {
        const currentUser = await account.get();
        if (!cancelled) {
          setUserId(currentUser.$id);
        }
      } catch {
        if (!cancelled) {
          const cookieId = ensureCookieId();
          setUserId(cookieId);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void resolveUser();

    return () => {
      cancelled = true;
    };
  }, [ensureCookieId]);

  return { userId, loading, ensureCookieId };
}
