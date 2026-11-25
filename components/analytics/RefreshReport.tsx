"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshAnalytics } from "@/app/admin/analytics/actions";
import { nextReportingMidnight } from "@/lib/analytics/period";

function SubmitRefresh() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-ring disabled:opacity-60">
      <RefreshCw size={15} aria-hidden="true" />{pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}

export default function RefreshReport({ generatedAt }: { generatedAt: string }) {
  const router = useRouter();
  useEffect(() => {
    const expires = nextReportingMidnight(new Date(generatedAt)).getTime();
    let requested = false;
    function refreshExpired() {
      if (!requested && !document.hidden && Date.now() >= expires) {
        requested = true;
        router.refresh();
      }
    }
    const timer = window.setTimeout(refreshExpired, Math.max(0, expires - Date.now()));
    document.addEventListener("visibilitychange", refreshExpired);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshExpired);
    };
  }, [generatedAt, router]);

  return <form action={refreshAnalytics}><SubmitRefresh /></form>;
}
