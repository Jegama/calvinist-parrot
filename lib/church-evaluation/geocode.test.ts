import { afterEach, expect, it, vi } from "vitest";
import { geocodeAddress } from "./geocode";

const db = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { providerCallAttempt: db } }));

const usage = { feature: "church", stage: "geocode", operationId: "church-evaluation", channel: "web" } as const;

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("counts a successful address search even with no result and withholds ambiguous failed usage", async () => {
  vi.stubEnv("GEOAPIFY_API_KEY", "fixture");
  const transport = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ features: [] }))
    .mockResolvedValueOnce(new Response("", { status: 503 }));
  vi.stubGlobal("fetch", transport);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const address = { street1: "private address" };

  await geocodeAddress({}, undefined, usage);
  await geocodeAddress(address, undefined, usage);
  await geocodeAddress(address, undefined, usage);
  expect(transport).toHaveBeenCalledTimes(2);
  const receipts = db.upsert.mock.calls.map(([{ create }]) => create);
  expect(receipts.map(({ outcome, quantity }) => [outcome, quantity])).toEqual([
    ["started", null], ["success", 1], ["started", null], ["provider_error", null],
  ]);
  expect(new Set(receipts.map(receipt => receipt.attemptId)).size).toBe(2);
  for (const receipt of receipts) expect(receipt).toMatchObject({ ...usage, provider: "geoapify", billingUnit: "credit" });
  expect(JSON.stringify(receipts)).not.toMatch(/private address|fixture/);
});
