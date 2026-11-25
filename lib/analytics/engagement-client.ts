"use client";

import type { BrowserFeature, BrowserStep } from "./engagement-browser-events";

const maxViewAge = 30 * 60_000;
const pending = new Map<string, Promise<void>>();

type View = { feature: BrowserFeature; key: string; id: string; started: number };

// A history entry survives reloads. A new navigation starts a new view. Only
// the opaque ID is sent; viewKey distinguishes content replaced in place.
export function getViewFlowId(feature: BrowserFeature, viewKey = ""): string {
  const state = window.history.state;
  const view: View | undefined = state?.engagementView;
  if (view?.feature === feature && view.key === viewKey && Date.now() - view.started < maxViewAge) {
    return view.id;
  }
  const next: View = { feature, key: viewKey, id: crypto.randomUUID(), started: Date.now() };
  window.history.replaceState({ ...state, engagementView: next }, "");
  return next.id;
}

export function trackEngagement<F extends BrowserFeature>(feature: F, step: BrowserStep<F>, flowId: string): Promise<void> {
  // Requests for a quick sequence of actions can otherwise arrive out of order.
  const send = async () => {
    try {
      await fetch("/api/web/engagement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, step, flowId }), keepalive: true,
        signal: AbortSignal.timeout(2000),
      });
    } catch { /* Network loss must not interrupt reading or navigation. */ }
  };
  const prior = pending.get(flowId);
  const done = prior ? prior.then(send) : send();
  pending.set(flowId, done);
  void done.then(() => { if (pending.get(flowId) === done) pending.delete(flowId); });
  return done;
}
