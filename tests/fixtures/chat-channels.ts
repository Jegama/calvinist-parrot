import { POST as createWebChat } from "@/app/api/web/chats/route";
import { POST as sendWebMessage } from "@/app/api/web/chats/[chatId]/messages/route";
import { POST as createPublicChat } from "@/app/api/v1/chats/route";
import { POST as sendPublicMessage } from "@/app/api/v1/chats/[chatId]/messages/route";
import type { SendChatMessageRequest } from "@/lib/api/contracts/chat";
import { executeChatCommand } from "@/lib/api/handlers/chat";

// Shared scenario for channel attribution, provider usage and engagement tests.
// Replace the simulated MCP call with its real adapter when that client ships.
export const chatChannels = ["web", "public_api", "mcp"] as const;
export type FixtureChannel = (typeof chatChannels)[number];
export const fixtureQuestion = "What does it mean to show patience?";

export function post(path: string, body: unknown) {
  return new Request(new URL(path, "http://localhost"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createQuestion(channel: FixtureChannel, chatId: string, requestId: string) {
  const body = { initialQuestion: fixtureQuestion, clientChatId: chatId, requestId };
  if (channel === "mcp") return executeChatCommand(post("/fixture/mcp", body), body, "mcp");
  if (channel === "web") return createWebChat(post("/api/web/chats", body));
  return createPublicChat(post("/api/v1/chats", body));
}

export function sendMessage(channel: FixtureChannel, chatId: string, body: SendChatMessageRequest) {
  const params = Promise.resolve({ chatId });
  if (channel === "mcp") return executeChatCommand(post("/fixture/mcp", body), { ...body, chatId }, "mcp");
  if (channel === "web") return sendWebMessage(post(`/api/web/chats/${chatId}/messages`, body), { params });
  return sendPublicMessage(post(`/api/v1/chats/${chatId}/messages`, body), { params });
}
