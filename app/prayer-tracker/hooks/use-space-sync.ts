import { useEffect, useRef } from "react";

type UseSpaceSyncOptions = {
  enabled: boolean;
  onRemoteChange: () => void | Promise<void>;
  intervalMs?: number;
};

type SyncResponse = {
  spaceId: string | null;
  version: string | null;
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
    let seeded = false;
    let lastVersion: string | null = null;
    let lastSpaceId: string | null = null;

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

        const spaceChanged = seeded && data.spaceId !== lastSpaceId;
        const versionChanged = seeded && data.version !== lastVersion;

        // First poll always refreshes once: there's an unavoidable race window
        // between the page's initial data load and this hook mounting, so we
        // can't trust that the seeded version matches what's already on screen.
        const shouldRefresh = !seeded || spaceChanged || versionChanged;

        if (shouldRefresh) {
          try {
            await onRemoteChangeRef.current();
          } catch {
            // Refresh failed — leave refs untouched so the next poll retries.
            return;
          }
          if (cancelled) return;
        }

        lastVersion = data.version;
        lastSpaceId = data.spaceId;
        seeded = true;
      } catch {
        // Network blips are fine — try again on the next tick.
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
