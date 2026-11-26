import { expect, it, vi } from "vitest";
import { consumeMcpCallerLimit } from "./limits";

const { countRequest } = vi.hoisted(() => ({ countRequest: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { $executeRaw: countRequest } }));

it("reports when the caller rate limit store is unavailable", async () => {
  countRequest.mockRejectedValue(new Error("offline"));
  await expect(consumeMcpCallerLimit("fixture", "guest_chat")).rejects.toMatchObject({ status: 503 });
});
