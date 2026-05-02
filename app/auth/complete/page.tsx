"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";

export default function AuthCompletePage() {
  const router = useRouter();
  const { refresh } = useAuth();

  useEffect(() => {
    let cancelled = false;

    const completeSignIn = async () => {
      await refresh();
      if (!cancelled) {
        router.replace("/");
      }
    };

    void completeSignIn();

    return () => {
      cancelled = true;
    };
  }, [refresh, router]);

  return (
    <main className="flex min-h-[calc(100vh-var(--app-header-height))] items-center justify-center px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p>Finishing sign-in...</p>
      </div>
    </main>
  );
}