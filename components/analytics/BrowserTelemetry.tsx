"use client";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export function excludeAccountLinks<T extends { url: string }>(event: T): T | null {
  const url = new URL(event.url, "https://localhost");
  if (url.searchParams.has("secret") || ["/reset-password", "/verify-email"].includes(url.pathname.replace(/\/$/, ""))) {
    return null;
  }
  return event;
}

export function BrowserTelemetry() {
  return <>
    <SpeedInsights beforeSend={excludeAccountLinks} />
    <Analytics beforeSend={excludeAccountLinks} />
  </>;
}
