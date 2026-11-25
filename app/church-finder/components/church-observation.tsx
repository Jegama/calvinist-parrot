"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { getViewFlowId, trackEngagement } from "@/lib/analytics/engagement-client";

const ChurchFlow = createContext<() => string>(() => getViewFlowId("church"));

export function ChurchView({ children }: { children: ReactNode }) {
  const flow = useRef<string | null>(null);
  const viewId = useCallback(() => {
    // Resolve once per mounted visit, even if a reader leaves the results open for a while.
    flow.current ??= getViewFlowId("church");
    return flow.current;
  }, []);
  return <ChurchFlow value={viewId}>{children}</ChurchFlow>;
}

// Mount only alongside displayed results or an explicitly requested, loaded record.
export function ChurchObservation({ step }: { step: "results_viewed" | "detail_opened" }) {
  const viewId = useContext(ChurchFlow);
  useEffect(() => {
    const observe = () => {
      if (document.visibilityState !== "visible") return;
      void trackEngagement("church", step, viewId());
      document.removeEventListener("visibilitychange", observe);
    };
    document.addEventListener("visibilitychange", observe);
    observe();
    return () => document.removeEventListener("visibilitychange", observe);
  }, [step, viewId]);
  return null;
}
