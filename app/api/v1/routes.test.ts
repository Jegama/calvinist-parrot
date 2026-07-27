import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleStopChatRequest: vi.fn(async () => Response.json({ ok: true })),
}));

vi.mock("@/lib/api/handlers/chat", () => ({
  handleStopChatRequest: mocks.handleStopChatRequest,
}));

import { POST as stopChat } from "./chats/[chatId]/requests/[requestId]/stop/route";

describe("v1 dynamic route adapters", () => {
  it("awaits Next.js 16 params before dispatching a stop request", async () => {
    let resolveParams:
      | ((params: { chatId: string; requestId: string }) => void)
      | undefined;
    const params = new Promise<{ chatId: string; requestId: string }>(
      (resolve) => {
        resolveParams = resolve;
      },
    );
    const request = new Request("http://localhost/api", { method: "POST" });

    const pendingResponse = stopChat(request, { params });
    expect(mocks.handleStopChatRequest).not.toHaveBeenCalled();

    resolveParams?.({ chatId: "chat-1", requestId: "request-1" });
    const response = await pendingResponse;

    expect(response.status).toBe(200);
    expect(mocks.handleStopChatRequest).toHaveBeenCalledWith(
      request,
      "chat-1",
      "request-1",
    );
  });
});
