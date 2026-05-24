"use client";

import { useEffect } from "react";

// Radix Dialog (used by shadcn Dialog and Sheet) sets `pointer-events: none`
// on <body> while a modal dialog is open and is supposed to clear it on close.
// Under rare race conditions (rapid open/close, unmount mid-animation) the
// inline style is left behind, which silently breaks every click outside any
// portaled overlay — including unrelated UI like the prayer-tracker tabs.
// This guard watches <body> for both style mutations and portal mount/unmount,
// and clears the leak on the next frame when no Radix dialog is open.
export function DialogPointerEventsGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const body = document.body;
    let scheduled = false;

    const clearIfStuck = () => {
      scheduled = false;
      if (body.style.pointerEvents !== "none") return;
      const openDialog = document.querySelector('[data-state="open"][role="dialog"]');
      if (!openDialog) {
        body.style.pointerEvents = "";
      }
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(clearIfStuck);
    };

    // Watch style changes AND childList — Radix portals dialogs into body,
    // so unmounts surface as removedNodes even when no body style mutation fires.
    const observer = new MutationObserver(schedule);
    observer.observe(body, {
      attributes: true,
      attributeFilter: ["style"],
      childList: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
