import { afterEach, describe, expect, it, vi } from "vitest";
import { getPageviews } from "./web-analytics";

const window = { start: new Date("2026-11-10T06:00:00Z"), end: new Date("2026-11-17T06:00:00Z") };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("production Web Analytics", () => {
  it("groups sanitized request paths and warns about unassigned overflow", async () => {
    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "synthetic");
    vi.stubEnv("VERCEL_PROJECT_ID", "project");
    vi.stubEnv("VERCEL_TEAM_ID", "team");
    const transport = vi.fn().mockResolvedValue(Response.json({ data: [
      { requestPath: "/", route: "", pageviews: 3 },
      { requestPath: "/28bd830d-62ad-44e0-834e-7bab672deb12?private=value", route: "", pageviews: 1 },
      { requestPath: "/c123456789012345678901234", route: "", pageviews: 2 },
      { requestPath: "/sermon-evaluation/private-id", route: "", pageviews: 4 },
      { requestPath: "/prayer-tracker/family-worship", pageviews: 2 },
      { requestPath: "/private-unknown", pageviews: 1 },
      { requestPath: "Others", pageviews: 19 },
    ] }));
    vi.stubGlobal("fetch", transport);
    const { counts, coverage } = await getPageviews(window);
    expect(Object.fromEntries(counts)).toEqual({ chat: 6, sermon: 4, family_worship: 2 });
    expect(coverage).toMatch(/19 views.+lower bounds/);
    expect(coverage).toContain("1 view fell outside");
    expect(coverage).not.toContain("private");
    const [url, init] = transport.mock.calls[0];
    expect(url.pathname).toEqual("/v1/query/web-analytics/visits/aggregate");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      filter: "environment eq 'production'", by: "requestPath", projectId: "project", teamId: "team",
      since: "2026-11-10T06:00:00.000Z", until: "2026-11-17T05:59:59.999Z",
    });
    expect(init).toMatchObject({ cache: "no-store", headers: { Authorization: "Bearer synthetic" } });
  });

  it("rejects malformed counters instead of presenting zero", async () => {
    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "synthetic");
    vi.stubEnv("VERCEL_PROJECT_ID", "project");
    vi.stubEnv("VERCEL_TEAM_ID", "team");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [{ requestPath: "/" }] })));
    await expect(getPageviews(window)).rejects.toThrow();
  });
});
