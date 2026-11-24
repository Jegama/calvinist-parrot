import { afterEach, expect, it, vi } from "vitest";

const start = new Date("2026-10-01T05:00:00Z");
const end = new Date("2026-12-01T06:00:00Z");
const registration = "2026-11-01T07:00:00.000Z";
const page = Array.from({ length: 100 }, (_, i) => ({ $id: String(i), registration, email: "private" }));

vi.mock("@/lib/appwrite/server", () => ({ APPWRITE_PROJECT_ID: "test-project" }));
import { getRegistrations } from "./registrations";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function configureSource() {
  vi.stubEnv("APPWRITE_ENDPOINT", "https://local.test/v1");
  vi.stubEnv("APPWRITE_ANALYTICS_READ_KEY", "test-read-key");
  const transport = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", transport);
  return transport;
}

it("pages the registration range and retains only distinct account IDs and registration instants", async () => {
  const transport = configureSource();
  transport.mockResolvedValueOnce(Response.json({ users: page }))
    .mockResolvedValueOnce(Response.json({ users: [
      page[99], { $id: "google", registration, name: "private" }, { $id: "excluded", registration: end.toISOString() },
    ] }));
  const users = await getRegistrations(start, end);
  expect(users).toHaveLength(101);
  expect(users.at(-1)).toEqual({ id: "google", registeredAt: new Date(registration) });
  const req = new Request(...transport.mock.calls[1]);
  expect(req.cache).toBe("no-store");
  expect(req.headers.get("x-appwrite-key")).toBe("test-read-key");
  expect(new URL(req.url).searchParams.getAll("queries[]").map(q => JSON.parse(q))).toEqual(expect.arrayContaining([
    expect.objectContaining({ method: "cursorAfter", values: ["99"] }),
    expect.objectContaining({ method: "lessThan", attribute: "registration", values: [end.toISOString()] }),
    expect.objectContaining({ method: "greaterThanEqual", attribute: "registration", values: [start.toISOString()] }),
  ]));
});

it("treats a failed later page as unavailable instead of returning incomplete cohort totals", async () => {
  configureSource().mockResolvedValueOnce(Response.json({ users: page }))
    .mockResolvedValueOnce(new Response(null, { status: 429 }));
  await expect(getRegistrations(start, end)).rejects.toThrow();
});
