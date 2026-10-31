import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";

import { createParrotChatModel } from "./chatModel";

afterEach(() => vi.unstubAllGlobals());

function responsesStream(
  id: string,
  output: Record<string, unknown>[],
  deltas: Record<string, unknown>[],
) {
  const response = {
    id,
    object: "response",
    created_at: 1,
    model: "gpt-6-luna",
    error: null,
    incomplete_details: null,
  };
  const events = [
    { type: "response.created", response: { ...response, status: "in_progress", output: [] } },
    ...deltas,
    {
      type: "response.completed",
      response: {
        ...response,
        status: "completed",
        output,
        usage: {
          input_tokens: 20,
          output_tokens: 20,
          total_tokens: 40,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 10 },
        },
      },
    },
  ];
  return new Response(
    events.map((event, sequence_number) =>
      `event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number })}\n\n`,
    ).join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

it("streams Responses answer deltas and completes a tool round trip through the real adapter", async () => {
  const model = createParrotChatModel({
    PARROT_AGENT_PROVIDER: "openai",
    OPENAI_API_KEY: "test-openai-key",
  });
  if (!(model instanceof ChatOpenAI)) throw new Error("Expected OpenAI");

  const reasoning = {
    id: "rs_1",
    type: "reasoning",
    summary: [{ type: "summary_text", text: "Consulting the requested passage." }],
  };
  const call = {
    id: "fc_1",
    type: "function_call",
    call_id: "call_1",
    name: "lookupScripture",
    arguments: '{"reference":"Ephesians 2:8"}',
    status: "completed",
  };
  const answerParts = ["Salvation is by grace through faith", " (Ephesians 2:8)."];
  const answerContent = { type: "output_text", text: answerParts.join(""), annotations: [], logprobs: [] };
  const answer = {
    id: "msg_1",
    type: "message",
    role: "assistant",
    status: "completed",
    content: [answerContent],
  };
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(responsesStream("resp_tool", [reasoning, call], [
      { type: "response.output_item.added", output_index: 0, item: { ...reasoning, summary: [] } },
      { type: "response.reasoning_summary_part.added", item_id: reasoning.id, output_index: 0, summary_index: 0, part: { type: "summary_text", text: "" } },
      { type: "response.reasoning_summary_text.delta", item_id: reasoning.id, output_index: 0, summary_index: 0, delta: reasoning.summary[0].text },
      { type: "response.reasoning_summary_text.done", item_id: reasoning.id, output_index: 0, summary_index: 0, text: reasoning.summary[0].text },
      { type: "response.reasoning_summary_part.done", item_id: reasoning.id, output_index: 0, summary_index: 0, part: reasoning.summary[0] },
      { type: "response.output_item.done", output_index: 0, item: reasoning },
      { type: "response.output_item.added", output_index: 1, item: { ...call, status: "in_progress", arguments: "" } },
      ...['{"reference":', '"Ephesians 2:8"}'].map((delta) => ({
        type: "response.function_call_arguments.delta", item_id: call.id, output_index: 1, delta,
      })),
      { type: "response.function_call_arguments.done", item_id: call.id, output_index: 1, arguments: call.arguments },
      { type: "response.output_item.done", output_index: 1, item: call },
    ]))
    .mockResolvedValueOnce(responsesStream("resp_answer", [answer], [
      { type: "response.output_item.added", output_index: 0, item: { ...answer, status: "in_progress", content: [] } },
      { type: "response.content_part.added", item_id: answer.id, output_index: 0, content_index: 0, part: { ...answerContent, text: "" } },
      ...answerParts.map((delta) => ({
        type: "response.output_text.delta", item_id: answer.id, output_index: 0, content_index: 0, delta, logprobs: [],
      })),
      { type: "response.output_text.done", item_id: answer.id, output_index: 0, content_index: 0, text: answerContent.text, logprobs: [] },
      { type: "response.content_part.done", item_id: answer.id, output_index: 0, content_index: 0, part: answerContent },
      { type: "response.output_item.done", output_index: 0, item: answer },
    ]));
  // Mock only transport: keep the OpenAI SDK, LangChain adapter, and agent real.
  vi.stubGlobal("fetch", fetchMock);

  const scripture = "For by grace you have been saved through faith.";
  const lookup = vi.fn<(input: { reference: string }) => Promise<string>>(
    async () => scripture,
  );
  const agent = createAgent({
    model,
    tools: [tool(lookup, {
      name: "lookupScripture",
      description: "Look up the requested Bible passage.",
      schema: z.object({ reference: z.string() }),
    })],
  });
  const stream = await agent.stream({
    messages: [
      new SystemMessage("Answer from Scripture using the available tools."),
      new HumanMessage("What is grace?"),
      new AIMessage("Grace is God's undeserved favor."),
      new HumanMessage("Show me Ephesians 2:8."),
    ],
  }, { streamMode: ["updates", "messages", "custom"] });

  const visibleChunks: string[] = [];
  for await (const [mode, chunk] of stream) {
    if (mode !== "messages") continue;
    const [token, metadata] = chunk;
    // Match the chat handler: skip tool nodes and select text content blocks.
    if (metadata.langgraph_node === "tools") continue;
    for (const block of token.contentBlocks) {
      if ("text" in block && typeof block.text === "string" && block.text)
        visibleChunks.push(block.text);
    }
  }

  expect(visibleChunks).toEqual(answerParts);
  expect(lookup).toHaveBeenCalledOnce();
  expect(lookup.mock.calls[0]?.[0]).toEqual({ reference: "Ephesians 2:8" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const requests = fetchMock.mock.calls.map(([url, init]) => {
    expect(String(url)).toBe("https://api.openai.com/v1/responses");
    const request = JSON.parse(String(init?.body));
    expect(request).toMatchObject({ model: "gpt-6-luna", stream: true });
    return request;
  });
  expect(requests[0].input).toEqual(expect.arrayContaining([
    expect.objectContaining({ role: "system", content: "Answer from Scripture using the available tools." }),
    expect.objectContaining({ role: "assistant", content: "Grace is God's undeserved favor." }),
  ]));
  expect(requests[1].tools).toEqual(requests[0].tools);
  expect(requests[1].input.slice(0, requests[0].input.length)).toEqual(requests[0].input);
  expect(requests[1].input).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "reasoning", id: reasoning.id, summary: reasoning.summary }),
    expect.objectContaining({ type: "function_call", call_id: call.call_id, name: call.name, arguments: call.arguments }),
    expect.objectContaining({ type: "function_call_output", call_id: call.call_id, output: scripture }),
  ]));
});
