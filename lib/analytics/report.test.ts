import { afterEach, expect, it, vi } from "vitest";

type CacheFactory = (read: unknown, key: string[], options: { tags: string[] }) => () => Promise<void>;
const cache = vi.hoisted(() => vi.fn<CacheFactory>(() => () => Promise.resolve()));
vi.mock("next/cache", () => ({ unstable_cache: cache }));
vi.mock("./features", () => ({ getFeatureReport: vi.fn() }));
vi.mock("./registrations", () => ({ getRegistrations: vi.fn(), RegistrationSourceError: Error }));

import { analyticsReportTag, loadAnalyticsReport } from "./report";

afterEach(() => { vi.useRealTimers(); cache.mockClear(); });

it("reuses a period's cache key until Chicago midnight and tags every period for immediate refresh", async () => {
  vi.useFakeTimers();
  vi.setSystemTime("2026-11-23T09:00:00Z");
  await loadAnalyticsReport(7);
  await loadAnalyticsReport("all");
  vi.setSystemTime("2026-11-24T05:59:59Z");
  await loadAnalyticsReport(7);
  vi.setSystemTime("2026-11-24T06:00:00Z");
  await loadAnalyticsReport(7);
  const keys = cache.mock.calls.map(([, key]) => key);
  expect(keys[0]).toEqual(keys[2]);
  expect(keys[0]).not.toEqual(keys[1]);
  expect(keys[0]).not.toEqual(keys[3]);
  for (const [, , options] of cache.mock.calls) expect(options.tags).toContain(analyticsReportTag);
});
