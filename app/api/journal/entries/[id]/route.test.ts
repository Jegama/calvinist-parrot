import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transactionClient = {
    journalEntry: { delete: vi.fn() },
    userProfile: { update: vi.fn() },
  };
  return {
    requireAuthenticatedUser: vi.fn(),
    findProfile: vi.fn(),
    findEntry: vi.fn(),
    transaction: vi.fn(),
    transactionClient,
  };
});

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    userProfile: { findUnique: mocks.findProfile },
    journalEntry: { findUnique: mocks.findEntry },
    $transaction: mocks.transaction,
  },
}));

import { DELETE } from "./route";

function requestContext() {
  return { params: Promise.resolve({ id: "entry-1" }) };
}

describe("DELETE /api/journal/entries/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      errorResponse: null,
    });
    mocks.findProfile.mockResolvedValue({ id: "profile-1" });
    mocks.findEntry.mockResolvedValue({
      id: "entry-1",
      authorProfileId: "profile-1",
      entryType: "PERSONAL",
    });
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof mocks.transactionClient) => unknown) =>
        callback(mocks.transactionClient)
    );
  });

  it("deletes an owned personal entry and decrements its counter", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/journal/entries/entry-1", {
        method: "DELETE",
      }),
      requestContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.transactionClient.journalEntry.delete).toHaveBeenCalledWith({
      where: { id: "entry-1" },
    });
    expect(mocks.transactionClient.userProfile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { journalEntriesCount: { decrement: 1 } },
    });
  });

  it("does not delete a Heritage Journal entry through the personal API", async () => {
    mocks.findEntry.mockResolvedValue({
      id: "entry-1",
      authorProfileId: "profile-1",
      entryType: "DISCIPLESHIP",
    });

    const response = await DELETE(
      new Request("http://localhost/api/journal/entries/entry-1", {
        method: "DELETE",
      }),
      requestContext()
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Entry not found" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
