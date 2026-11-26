import { HumanMessage } from "@langchain/core/messages";
import { createAgent, tool } from "langchain";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { createParrotChatModel } from "./chatModel";

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { providerCallAttempt: { upsert } } }));

function geminiStream(parts: object[]) {
  const events = parts.map((part, index) => {
    const candidate = { index: 0, content: { role: "model", parts: [part] }, finishReason: index === parts.length - 1 ? "STOP" : undefined };
    return `data: ${JSON.stringify({ candidates: [candidate], modelVersion: "fixture-hydrogen", usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, thoughtsTokenCount: 3, totalTokenCount: 19 } })}\n\n`;
  });
  return new Response(events.join(""), { headers: { "Content-Type": "text/event-stream" } });
}

afterEach(() => vi.unstubAllGlobals());

it("streams a Hydrogen answer after a signed tool call", async () => {
  const model = createParrotChatModel({ PARROT_AGENT_PROVIDER: "gemini", GEMINI_API_KEY: "test-key" });
  const functionCall = { name: "lookupScripture", args: { reference: "Psalm 23:1" } };
  const signedCall = { functionCall, thoughtSignature: "fixture-signature" };
  const verse = "The Lord is my shepherd.";
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(geminiStream([signedCall]))
    .mockResolvedValueOnce(geminiStream([{ text: "The Lord " }, { text: "is my shepherd." }]));
  vi.stubGlobal("fetch", fetchMock);

  const lookup = vi.fn<(input: { reference: string }) => Promise<string>>(async () => verse);
  const agent = createAgent({
    model,
    tools: [tool(lookup, {
      name: "lookupScripture",
      description: "Look up the requested Bible passage.",
      schema: z.object({ reference: z.string() }),
    })],
  });

  const stream = await agent.stream({ messages: [new HumanMessage("Show me Psalm 23:1.")] }, {
    streamMode: ["updates", "messages", "custom"], configurable: { chatUsage: { operationId: "fixture-turn" } },
  });
  let answer = "";
  for await (const [mode, chunk] of stream) {
    if (mode !== "messages") continue;
    const [message, metadata] = chunk;
    if (metadata.langgraph_node !== "tools") answer += message.text;
  }

  expect(answer).toBe(verse);
  expect(lookup).toHaveBeenCalledOnce();
  expect(lookup.mock.calls[0][0]).toEqual(functionCall.args);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const receipts = upsert.mock.calls.map(([write]) => write.create).filter(receipt => receipt.outcome !== "started");
  expect(receipts).toHaveLength(2);
  for (const receipt of receipts) expect(receipt).toMatchObject({
    operationId: "fixture-turn", inputTokens: 12, outputTokens: 7, thinkingTokens: 3,
    returnedModel: "fixture-hydrogen", outcome: "success",
  });
  for (const [url] of fetchMock.mock.calls) {
    expect(new URL(String(url)).pathname).toMatch(/\/models\/gemini-4-hydrogen:streamGenerateContent$/);
  }
  const followUp = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
  expect(followUp.contents).toEqual(expect.arrayContaining([
    expect.objectContaining({ parts: [signedCall] }),
    expect.objectContaining({ parts: [{ functionResponse: { name: "lookupScripture", response: { result: verse } } }] }),
  ]));
});

it("withholds final output usage when a Gemini stream ends after a nonterminal billing snapshot", async () => {
  upsert.mockClear();
  const model = createParrotChatModel({ PARROT_AGENT_PROVIDER: "gemini", GEMINI_API_KEY: "test-key" });
  const event = {
    candidates: [{ index: 0, content: { role: "model", parts: [{ text: "Part" }] } }],
    modelVersion: "fixture-hydrogen", usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, totalTokenCount: 16 },
  };
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(
    `data: ${JSON.stringify(event)}\n\n`, { headers: { "Content-Type": "text/event-stream" } },
  )));
  await expect(model.invoke("Hello")).rejects.toThrow("The provider stream ended before its final event.");
  expect(upsert.mock.lastCall?.[0].create).toMatchObject({
    inputTokens: 12, outputTokens: null, outcome: "provider_error", returnedModel: "fixture-hydrogen",
  });
});
