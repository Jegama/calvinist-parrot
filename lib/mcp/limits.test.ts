import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { consumeMcpCallerLimit, reserveGuestModelAttempt } from "./limits";

const { debit } = vi.hoisted(() => ({ debit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { $executeRaw: debit } }));
beforeEach(() => { debit.mockReset(); });
afterEach(() => vi.unstubAllEnvs());

it.each(["", "1.2", "-100", "2147483648", "free"])(
  "refuses guest dispatch for invalid daily budget %s", async budget => {
    vi.stubEnv("MCP_GUEST_DAILY_BUDGET_CENTS", budget);
    await expect(reserveGuestModelAttempt()).rejects.toThrow();
    expect(debit).not.toHaveBeenCalled();
  },
);

it.each(["104", "0"])("explains a daily budget below one guest reservation (%s cents)", async budget => {
  vi.stubEnv("MCP_GUEST_DAILY_BUDGET_CENTS", budget);
  await expect(reserveGuestModelAttempt()).rejects.toThrow(/too small.*Connect a Parrot account/);
  expect(debit).not.toHaveBeenCalled();
});

it("fails closed when the shared quota store is unavailable", async () => {
  vi.stubEnv("MCP_GUEST_DAILY_BUDGET_CENTS", "105");
  debit.mockRejectedValue(new Error("offline"));
  await expect(reserveGuestModelAttempt()).rejects.toMatchObject({ status: 503 });
  await expect(consumeMcpCallerLimit("fixture", "account_chat")).rejects.toMatchObject({ status: 503 });
});
