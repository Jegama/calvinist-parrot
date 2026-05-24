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
  const lastVersionRef = useRef<string | null>(null);
  const lastSpaceIdRef = useRef<string | null>(null);
  const seededRef = useRef(false);
  const onRemoteChangeRef = useRef(onRemoteChange);

  useEffect(() => {
    onRemoteChangeRef.current = onRemoteChange;
  }, [onRemoteChange]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/prayer-tracker/sync", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as SyncResponse;
        if (cancelled) return;

        if (!seededRef.current) {
          lastVersionRef.current = data.version;
          lastSpaceIdRef.current = data.spaceId;
          seededRef.current = true;
          return;
        }

        const spaceChanged = data.spaceId !== lastSpaceIdRef.current;
        const versionChanged = data.version !== lastVersionRef.current;

        if (spaceChanged || versionChanged) {
          lastVersionRef.current = data.version;
          lastSpaceIdRef.current = data.spaceId;
          await onRemoteChangeRef.current();
        }
      } catch {
        // Network blips are fine — try again on the next tick.
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
