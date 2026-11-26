"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/use-auth";

export function FirstNameNudge() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["first-name-nudge", user?.$id];
  const { data: show } = useQuery({
    queryKey,
    enabled: Boolean(user && !profile?.firstName && !profile?.firstNameNudgeShown),
    staleTime: Infinity,
    queryFn: async (): Promise<boolean> => {
      const response = await fetch("/api/user-profile/first-name-nudge", { method: "POST" });
      if (!response.ok) throw new Error("Could not check the first-name prompt.");
      return (await response.json()).show;
    },
  });

  if (!user || profile?.firstName || !show) return null;
  const dismiss = () => queryClient.setQueryData(queryKey, false);

  return (
    <aside aria-label="Profile reminder" className="border-b border-border bg-muted px-4 py-2 text-sm">
      <div className="container mx-auto flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>Add your first name so your household can recognize you in Prayer Tracker.</span>
        <Link href="/profile" onClick={dismiss} className="font-medium text-primary underline">Update profile</Link>
        <button type="button" onClick={dismiss} className="underline">Dismiss</button>
      </div>
    </aside>
  );
}
