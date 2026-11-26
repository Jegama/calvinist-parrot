import { expect, it, vi } from "vitest";
import { userMemoryRecallTool } from "./userMemoryRecallTool";

const store = vi.hoisted(() => ({ get: vi.fn().mockResolvedValue(null), search: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/langGraphStore", () => ({
  getMemoryStore: () => store,
  MemoryNamespaces: { userProfile: (id: string) => ["memories", id, "profile"] },
  MemoryKeys: { USER_PROFILE: "profile" },
}));

it("scopes profile and search to the conversation identity supplied by the runtime", async () => {
  await userMemoryRecallTool.invoke({ query: "patience" }, { configurable: { userId: "account-owner" } });
  expect(store.get).toHaveBeenCalledWith(["memories", "account-owner", "profile"], "profile");
  expect(store.search).toHaveBeenCalledWith(["memories", "account-owner"], { query: "patience", limit: 5 });
  vi.clearAllMocks();
  expect(await userMemoryRecallTool.invoke({ query: "patience" })).toContain("No conversation identity");
  expect(store.get).not.toHaveBeenCalled();
  expect(store.search).not.toHaveBeenCalled();
});
