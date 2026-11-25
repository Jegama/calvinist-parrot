import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const { record } = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("@/lib/analytics/engagement-store", () => ({ recordEngagement: record }));
beforeEach(() => record.mockClear());

const event = { feature: "church", step: "results_viewed", flowId: "126801ea-4e78-471e-853a-f95cfb5e9ca3" };
function request(body: object, origin = "https://parrot.test") {
  return new Request("https://parrot.test/api/web/engagement", {
    method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

it("records only the declared browser observation with server-side attribution", async () => {
  expect((await POST(request(event))).status).toBe(204);
  expect(record).toHaveBeenCalledExactlyOnceWith(event.feature, event.step, event.flowId);
});

it("accepts same-origin browser traffic when Next resolves the request using a proxy hostname", async () => {
  const proxied = request(event, "https://public.parrot.test");
  proxied.headers.set("sec-fetch-site", "same-origin");
  expect((await POST(proxied)).status).toBe(204);
});

it("rejects cross-origin writes, private payloads, external channel claims and server-only outcomes", async () => {
  expect((await POST(request(event, "https://other.test"))).status).toBe(403);
  for (const body of [
    { ...event, text: "private" }, { ...event, channel: "mcp" }, { ...event, flowId: "raw/path" },
    { ...event, step: "record_retrieved" }, { ...event, feature: "sermon", step: "report_ready" },
  ]) expect((await POST(request(body))).status).toBe(400);
  expect(record).not.toHaveBeenCalled();
});
