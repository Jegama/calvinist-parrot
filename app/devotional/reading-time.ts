import { getViewFlowId, trackEngagement } from "@/lib/analytics/engagement-client";

const engagedReadingMs = 30_000;
const progressKey = "devotional-reading-progress";

// Estimate reading time only while the rendered devotional is in a visible tab.
// A single session record lets a refresh resume the same view without retaining a history.
export function observeDevotionalReading(readingId?: string) {
  const flowId = getViewFlowId("daily_devotional", readingId);
  let elapsed = 0;
  try {
    const progress = JSON.parse(sessionStorage.getItem(progressKey) ?? "null");
    if (progress?.flowId === flowId && Number.isFinite(progress.elapsed)) {
      elapsed = Math.max(0, Math.min(progress.elapsed, engagedReadingMs));
    }
  } catch { /* Storage may be unavailable. Keep timing this mount. */ }

  let startedAt: number | undefined;
  let timer: ReturnType<typeof setTimeout>;
  let opened = false;

  function pause() {
    if (startedAt === undefined) return;
    clearTimeout(timer);
    elapsed = Math.min(engagedReadingMs, elapsed + performance.now() - startedAt);
    startedAt = undefined;
    try {
      sessionStorage.setItem(progressKey, JSON.stringify({ flowId, elapsed }));
    } catch { /* Timing continues in memory. */ }
    if (elapsed === engagedReadingMs) trackEngagement("daily_devotional", "reading_engaged", flowId);
  }

  function resume() {
    if (document.visibilityState !== "visible") return;
    if (!opened) {
      trackEngagement("daily_devotional", "reading_opened", flowId);
      // Elapsed time survives a refresh even if the last receipt was lost.
      // The server deduplicates this replay by view ID and step.
      if (elapsed === engagedReadingMs) trackEngagement("daily_devotional", "reading_engaged", flowId);
      opened = true;
    }
    if (elapsed === engagedReadingMs || startedAt !== undefined) return;
    startedAt = performance.now();
    timer = setTimeout(() => {
      pause();
      resume(); // Account for a timeout firing a fraction of a millisecond early.
    }, engagedReadingMs - elapsed);
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") resume();
    else pause();
  }

  resume();
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", pause);
  window.addEventListener("pageshow", resume);
  return () => {
    pause();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", pause);
    window.removeEventListener("pageshow", resume);
  };
}
