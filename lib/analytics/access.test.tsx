import { Client } from "node-appwrite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ secret: "", labels: [] as string[] }));
const report = vi.hoisted(() => vi.fn(async (days: number) => ({ period: { days } })));
vi.mock("@/lib/analytics/report", () => ({
  loadAnalyticsReport: report,
  analyticsReportTag: "admin-analytics-snapshots",
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => new Map(session.secret ? [["a_session_test-admin", { value: session.secret }]] : []),
}));
vi.mock("@/components/analytics/AnalyticsDashboard", () => ({ default: () => null }));

const cache = vi.hoisted(() => ({ updateTag: vi.fn(), refresh: vi.fn() }));
vi.mock("next/cache", () => cache);

const request = new Request("http://local.test/api/admin/analytics?days=730");
const props = { searchParams: Promise.resolve({ days: "730" }) };

beforeEach(() => {
  session.secret = "";
  session.labels = [];
  report.mockClear();
  vi.stubEnv("APPWRITE_PROJECT_ID", "test-admin");
  vi.stubEnv("APPWRITE_ENDPOINT", "http://local.test/v1");
  vi.spyOn(Client.prototype, "call").mockImplementation(async function (this: Client, method, url) {
    expect(method).toBe("get");
    expect(url.href).toBe("http://local.test/v1/account");
    expect(this.config.session).toBe("session");
    expect(this.config.key).toBe("");
    return { $id: "private-account-id", labels: session.labels };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("checks the current session and label on every page and API request, including after revocation", async () => {
  const { default: Page } = await import("@/app/admin/analytics/page");
  const { GET } = await import("@/app/api/admin/analytics/route");
  async function expectApi(status: number) {
    const res = await GET(request);
    expect(res.status).toBe(status);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    return res.json();
  }

  await expect(Page(props)).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  await expectApi(401);
  session.secret = "session";
  session.labels = ["sermonevaluatoradmin"];
  await expect(Page(props)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  await expectApi(403);
  expect(report).not.toHaveBeenCalled();

  session.labels = ["analyticsadmin"];
  expect((await Page(props)).props.report).toEqual({ period: { days: 730 } });
  expect(await expectApi(200)).toEqual({ period: { days: 730 } });

  session.labels = [];
  await expect(Page(props)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  await expectApi(403);
  expect(report).toHaveBeenCalledTimes(2);
  expect(Client.prototype.call).toHaveBeenCalledTimes(6);
});

it("allows only a current analytics admin to invalidate and refresh snapshots", async () => {
  const { refreshAnalytics } = await import("@/app/admin/analytics/actions");
  await expect(refreshAnalytics()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  session.secret = "session";
  await expect(refreshAnalytics()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  expect(cache.updateTag).not.toHaveBeenCalled();

  session.labels = ["analyticsadmin"];
  await refreshAnalytics();
  expect(cache.updateTag).toHaveBeenCalledExactlyOnceWith("admin-analytics-snapshots");
  expect(cache.refresh).toHaveBeenCalledOnce();

  session.labels = [];
  await expect(refreshAnalytics()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  expect(cache.updateTag).toHaveBeenCalledOnce();
});
