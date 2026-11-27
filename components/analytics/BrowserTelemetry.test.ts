import { expect, it } from "vitest";
import { excludeAccountLinks } from "./BrowserTelemetry";

it("drops pageviews, events, and speed metrics for emailed links", () => {
  for (const type of ["pageview", "event", "vital"]) {
    for (const url of ["/reset-password?userId=reader&secret=fixture", "https://parrot.example/verify-email/", "/?secret=fixture"]) {
      expect(excludeAccountLinks({ type, url })).toBeNull();
    }
    const ordinary = { type, url: "https://parrot.example/profile" };
    expect(excludeAccountLinks(ordinary)).toBe(ordinary);
  }
});
