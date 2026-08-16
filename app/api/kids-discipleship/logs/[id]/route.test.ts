import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthenticatedUser: vi.fn(),
  assertHouseholdAccess: vi.fn(),
  findLog: vi.fn(),
  findChild: vi.fn(),
  deleteLog: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));

vi.mock("@/lib/householdService", () => ({
  assertHouseholdAccess: mocks.assertHouseholdAccess,
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    journalEntry: {
      findUnique: mocks.findLog,
      delete: mocks.deleteLog,
    },
    prayerMember: {
      findUnique: mocks.findChild,
    },
  },
}));

import { DELETE } from "./route";

function requestContext() {
  return { params: Promise.resolve({ id: "log-1" }) };
}

describe("DELETE /api/kids-discipleship/logs/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      errorResponse: null,
    });
    mocks.assertHouseholdAccess.mockResolvedValue(undefined);
    mocks.findLog.mockResolvedValue({
      id: "log-1",
      entryType: "DISCIPLESHIP",
      subjectMemberId: "child-1",
    });
    mocks.findChild.mockResolvedValue({ spaceId: "space-1" });
  });

  it("deletes an authenticated household log", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/kids-discipleship/logs/log-1", {
        method: "DELETE",
      }),
      requestContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.assertHouseholdAccess).toHaveBeenCalledWith(
      "user-1",
      "space-1"
    );
    expect(mocks.deleteLog).toHaveBeenCalledWith({ where: { id: "log-1" } });
  });

  it("does not delete a log outside the authenticated household", async () => {
    mocks.assertHouseholdAccess.mockRejectedValue(new Error("forbidden"));

    const response = await DELETE(
      new Request("http://localhost/api/kids-discipleship/logs/log-1", {
        method: "DELETE",
      }),
      requestContext()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.deleteLog).not.toHaveBeenCalled();
  });
});
