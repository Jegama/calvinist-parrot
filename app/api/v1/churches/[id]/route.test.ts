import { expect, it, vi } from "vitest";
import { GET as legacyRead } from "@/app/api/churches/[id]/route";
import { retrievePublicChurch } from "@/lib/api/handlers/church";
import { GET, HEAD } from "./route";

const { save, findUnique } = vi.hoisted(() => ({ save: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/analytics/engagement-store", () => ({ recordEngagement: save }));
vi.mock("@/lib/prisma", () => ({ default: { church: { findUnique } } }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));

it("attributes one saved record to each keyed external operation and keeps legacy reads ambiguous", async () => {
  const id = "existing";
  const operationId = "daa0d573-60d4-4eb1-903c-459c19f3467c";
  findUnique.mockResolvedValue({
    id, name: "Example", website: "https://example.org", evaluations: [], addresses: [], serviceTimes: [],
  });
  const params = { params: Promise.resolve({ id }) };
  const request = new Request("https://example.org/api/v1/churches/existing", {
    headers: { "Idempotency-Key": operationId, "X-Channel": "web" },
  });
  const response = await legacyRead(new Request(request.url), params);
  expect(response.status).toBe(200);
  expect(save).not.toHaveBeenCalled();
  for (let replay = 0; replay < 2; replay++) {
    const direct = await GET(request, params);
    const mcp = await retrievePublicChurch(id, "mcp", operationId);
    expect(await direct.json()).toEqual(await mcp.json());
    expect(direct.status).toBe(200);
  }
  expect(save).toHaveBeenCalledTimes(4);
  const [feature, step, flowId] = save.mock.calls[0];
  expect([feature, step]).toEqual(["church", "record_retrieved"]);
  expect(flowId).toMatch(/^[a-f0-9]{64}$/);
  expect(save.mock.calls).toEqual([
    [feature, step, flowId, "public_api"], [feature, step, flowId, "mcp"],
    [feature, step, flowId, "public_api"], [feature, step, flowId, "mcp"],
  ]);
  const head = await HEAD(new Request(request, { method: "HEAD" }), params);
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  const speculative = await GET(new Request(request.url, {
    headers: { "Idempotency-Key": operationId, "Sec-Purpose": "prefetch" },
  }), params);
  expect(speculative.status).toBe(204);
  expect(await speculative.text()).toBe("");
  const unkeyed = await GET(new Request(request.url), params);
  expect(unkeyed.status).toBe(400);
  expect(await unkeyed.json()).toEqual({ error: "Idempotency-Key must be a UUID for this retrieval." });
  expect((await retrievePublicChurch(id, "mcp", null)).status).toBe(400);
  expect((await GET(new Request(request.url, { headers: { "Idempotency-Key": "private text" } }), params)).status).toBe(400);
  findUnique.mockResolvedValueOnce(null);
  expect((await GET(request, params)).status).toBe(404);
  expect(save).toHaveBeenCalledTimes(4);
});
