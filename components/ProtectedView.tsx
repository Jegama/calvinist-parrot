"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";

type ProtectedViewProps = {
  children?: ReactNode;
  fallback?: ReactNode;
};

export function ProtectedView({ children, fallback }: ProtectedViewProps) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return <>{fallback}</>;
  }

  if (!user) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
