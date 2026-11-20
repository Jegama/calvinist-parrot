import { HumanMessage } from "@langchain/core/messages";
import { createAgent, tool } from "langchain";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { createParrotChatModel } from "./chatModel";

function geminiStream(parts: object[]) {
  const events = parts.map((part) => {
    const candidate = { index: 0, content: { role: "model", parts: [part] } };
    return `data: ${JSON.stringify({ candidates: [candidate] })}\n\n`;
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
    streamMode: ["updates", "messages", "custom"],
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
  for (const [url] of fetchMock.mock.calls) {
    expect(new URL(String(url)).pathname).toMatch(/\/models\/gemini-4-hydrogen:streamGenerateContent$/);
  }
  const followUp = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
  expect(followUp.contents).toEqual(expect.arrayContaining([
    expect.objectContaining({ parts: [signedCall] }),
    expect.objectContaining({ parts: [{ functionResponse: { name: "lookupScripture", response: { result: verse } } }] }),
  ]));
});
