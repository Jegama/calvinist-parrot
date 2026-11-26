import { POST as createWebChat } from "@/app/api/web/chats/route";
import { POST as sendWebMessage } from "@/app/api/web/chats/[chatId]/messages/route";
import { POST as createPublicChat } from "@/app/api/v1/chats/route";
import { POST as sendPublicMessage } from "@/app/api/v1/chats/[chatId]/messages/route";
import type { SendChatMessageRequest } from "@/lib/api/contracts/chat";

// Shared scenario for channel attribution, provider usage and engagement tests.
export const httpChatChannels = ["web", "public_api"] as const;
type FixtureChannel = (typeof httpChatChannels)[number];
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
  if (channel === "web") return createWebChat(post("/api/web/chats", body));
  return createPublicChat(post("/api/v1/chats", body));
}

export function sendMessage(channel: FixtureChannel, chatId: string, body: SendChatMessageRequest) {
  const params = Promise.resolve({ chatId });
  if (channel === "web") return sendWebMessage(post(`/api/web/chats/${chatId}/messages`, body), { params });
  return sendPublicMessage(post(`/api/v1/chats/${chatId}/messages`, body), { params });
}

// Feed the actual Anthropic adapter a local event stream. The interrupted call
// has no final usage counters; the retry supplies its citation and counters.
export const citedAnswer = "A patient person listens carefully. [James 1:19](https://example.org/james/1/19)";

export function guestModelResponse(onTimeout?: () => void) {
  const events = [
    { type: "message_start", message: {
      type: "message", role: "assistant", content: [], model: "claude-haiku-5-5",
      usage: { input_tokens: 1000, output_tokens: 0 },
    } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: onTimeout ? "Partial" : citedAnswer } },
    { type: "content_block_stop", index: 0 },
  ];
  const finalUsage = { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 100 } };
  const chunks = events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(encoder.encode(chunks.join(""))); },
    pull(controller) {
      if (onTimeout) {
        onTimeout();
        controller.error(new DOMException("Fixture deadline", "AbortError"));
      } else {
        controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify(finalUsage)}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n`));
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}
