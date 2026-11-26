import { useEffect, useRef } from "react";

type UseSpaceSyncOptions = {
  enabled: boolean;
  onRemoteChange: (change: "household" | "names") => void | Promise<void>;
  intervalMs?: number;
};

type SyncResponse = {
  spaceId: string | null;
  version: string | null;
  nameVersion: string | null;
};

const DEFAULT_INTERVAL_MS = 20_000;

export function useSpaceSync({
  enabled,
  onRemoteChange,
  intervalMs = DEFAULT_INTERVAL_MS,
}: UseSpaceSyncOptions) {
  const onRemoteChangeRef = useRef(onRemoteChange);

  useEffect(() => {
    onRemoteChangeRef.current = onRemoteChange;
  }, [onRemoteChange]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    // Per-cycle state — reset every time the hook is (re)enabled so a stale
    // version from a previous session doesn't suppress the first refresh.
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let inFlight = false;
    let previous: SyncResponse | null = null;

    const poll = async () => {
      if (cancelled || inFlight) return;
      if (document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const response = await fetch("/api/prayer-tracker/sync", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as SyncResponse;
        if (cancelled) return;

        // Refresh the first poll to cover changes since the page's initial load.
        // A simultaneous membership or prayer change takes priority over a rename.
        const householdChanged = !previous || data.spaceId !== previous.spaceId || data.version !== previous.version;
        if (householdChanged || data.nameVersion !== previous?.nameVersion) {
          await onRemoteChangeRef.current(householdChanged ? "household" : "names");
          if (cancelled) return;
        }
        previous = data;
      } catch {
        // Keep the previous version so a failed poll or refresh retries on the next tick.
      } finally {
        inFlight = false;
      }
    };

    const startInterval = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(poll, intervalMs);
    };

    const stopInterval = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void poll();
        startInterval();
      } else {
        stopInterval();
      }
    };

    const handleFocus = () => {
      void poll();
    };

    void poll();
    if (document.visibilityState === "visible") {
      startInterval();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [enabled, intervalMs]);
}
