import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { createAgent, tool } from "langchain";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createParrotChatModel } from "./chatModel";

const { upsert, debit } = vi.hoisted(() => ({ upsert: vi.fn(), debit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { providerCallAttempt: { upsert }, $executeRaw: debit } }));

const credentials = {
  ANTHROPIC_API_KEY: "test-anthropic-key",
  GEMINI_API_KEY: "test-gemini-key",
  OPENAI_API_KEY: "test-openai-key",
};

function streamedResponse(
  blocks: {
    start: Record<string, unknown>;
    deltas: Record<string, unknown>[];
  }[],
  stopReason: "tool_use" | "end_turn",
  modelName = "claude-haiku-5-5",
) {
  const events: Record<string, unknown>[] = [
    {
      type: "message_start",
      message: {
        id: `msg_${stopReason}`,
        type: "message",
        role: "assistant",
        model: modelName,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 20, output_tokens: 0 },
      },
    },
  ];
  blocks.forEach((block, index) => {
    events.push({
      type: "content_block_start",
      index,
      content_block: block.start,
    });
    for (const delta of block.deltas) {
      events.push({ type: "content_block_delta", index, delta });
    }
    events.push({ type: "content_block_stop", index });
  });
  events.push(
    {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 20 },
    },
    { type: "message_stop" },
  );
  return new Response(
    events
      .map(
        (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("Parrot chat model", () => {
  it("defaults to Haiku 5.5 and supports an explicit Anthropic model override", () => {
    const model = createParrotChatModel(credentials);
    expect(model).toBeInstanceOf(ChatAnthropic);
    expect(model.model).toBe("claude-haiku-5-5");
    expect(model.streaming).toBe(true);

    expect(
      createParrotChatModel({
        ...credentials,
        PARROT_AGENT_PROVIDER: " Anthropic ",
        PARROT_ANTHROPIC_MODEL: "claude-sonnet-5",
      }).model,
    ).toBe("claude-sonnet-5");
  });

  it("retains explicit OpenAI and Gemini provider selection", () => {
    const openai = createParrotChatModel({
      ...credentials,
      PARROT_AGENT_PROVIDER: "openai",
    });
    expect(openai).toBeInstanceOf(ChatOpenAI);
    expect(openai.model).toBe("gpt-6-luna");
    if (!(openai instanceof ChatOpenAI)) throw new Error("Expected OpenAI");
    expect(openai.useResponsesApi).toBe(true);

    const gemini = createParrotChatModel({
      ...credentials,
      PARROT_AGENT_PROVIDER: "gemini",
    });
    expect(gemini).toBeInstanceOf(ChatGoogleGenerativeAI);
    expect(gemini.model).toBe("gemini-4-hydrogen");
    expect(gemini.streaming).toBe(true);
    expect(
      createParrotChatModel({
        ...credentials,
        PARROT_AGENT_PROVIDER: "gemini",
        PARROT_GEMINI_MODEL: "custom-gemini",
      }).model,
    ).toBe("custom-gemini");
  });

  it("rejects an unknown provider instead of silently routing elsewhere", () => {
    expect(() =>
      createParrotChatModel({ ...credentials, PARROT_AGENT_PROVIDER: "typo" }),
    ).toThrow("Unsupported PARROT_AGENT_PROVIDER: typo");
  });

  it.each(["claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-sonnet-5"])(
    "uses the provider's thinking default for the %s override",
    async (modelName) => {
      const model = createParrotChatModel({
        ...credentials,
        PARROT_ANTHROPIC_MODEL: modelName,
      });
      if (!(model instanceof ChatAnthropic)) throw new Error("Expected Anthropic");
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
        streamedResponse(
          [{
            start: { type: "text", text: "" },
            deltas: [{ type: "text_delta", text: "Answer" }],
          }],
          "end_turn",
          modelName,
        ),
      );
      model.clientOptions = { fetch: fetchMock };

      expect((await model.invoke("Hello")).text).toBe("Answer");
      expect(fetchMock).toHaveBeenCalledOnce();
      const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(request.model).toBe(modelName);
      expect(request).not.toHaveProperty("thinking");
      expect(request).not.toHaveProperty("temperature");
    },
  );

  it.each(["claude-haiku-5-5", "claude-sonnet-5"])("streams visible text and preserves signed thinking in a %s tool round trip", async (modelName) => {
    const model = createParrotChatModel({
      ...credentials,
      PARROT_ANTHROPIC_MODEL: modelName,
    });
    if (!(model instanceof ChatAnthropic))
      throw new Error("Expected Anthropic");

    upsert.mockClear();
    const fetchMock = vi.fn<typeof fetch>();
    // Exercise the real SDK and LangChain adapters against local SSE fixtures.
    model.clientOptions = { fetch: fetchMock };
    fetchMock
      .mockResolvedValueOnce(
        streamedResponse(
          [
            {
              start: { type: "thinking", thinking: "" },
              deltas: [
                {
                  type: "thinking_delta",
                  thinking: "Consulting the requested passage.",
                },
                { type: "signature_delta", signature: "fixture-signature" },
              ],
            },
            {
              start: {
                type: "tool_use",
                id: "tool_1",
                name: "lookupScripture",
                input: {},
              },
              deltas: [
                {
                  type: "input_json_delta",
                  partial_json: '{"reference":"Ephesians 2:8"}',
                },
              ],
            },
          ],
          "tool_use",
          modelName,
        ),
      )
      .mockResolvedValueOnce(
        streamedResponse(
          [
            {
              start: { type: "text", text: "" },
              deltas: [
                {
                  type: "text_delta",
                  text: "Salvation is by grace through faith (Ephesians 2:8).",
                },
              ],
            },
          ],
          "end_turn",
          modelName,
        ),
      );

    const lookup = vi.fn<(input: { reference: string }) => Promise<string>>(
      async () => "For by grace you have been saved through faith.",
    );
    const agent = createAgent({
      model,
      tools: [
        tool(lookup, {
          name: "lookupScripture",
          description: "Look up the requested Bible passage.",
          schema: z.object({ reference: z.string() }),
        }),
      ],
    });
    const stream = await agent.stream(
      {
        messages: [
          new SystemMessage("Answer from Scripture using the available tools."),
          new HumanMessage("What is grace?"),
          // Text-only persisted history must remain usable after switching providers.
          new AIMessage("Grace is God's undeserved favor."),
          new HumanMessage("Show me Ephesians 2:8."),
        ],
      },
      { streamMode: ["updates", "messages", "custom"], configurable: { chatUsage: { operationId: "fixture-turn" } } },
    );
    let visibleText = "";
    for await (const [mode, chunk] of stream) {
      if (mode !== "messages") continue;
      const [token, metadata] = chunk;
      // The chat handler renders tool updates separately from the answer.
      if (metadata.langgraph_node === "tools") continue;
      for (const block of token.contentBlocks) {
        // Same text selection used by the chat API handler.
        if ("text" in block && typeof block.text === "string")
          visibleText += block.text;
      }
    }

    expect(visibleText).toBe(
      "Salvation is by grace through faith (Ephesians 2:8).",
    );
    expect(lookup).toHaveBeenCalledOnce();
    expect(lookup.mock.calls[0]?.[0]).toEqual({ reference: "Ephesians 2:8" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const receipts = upsert.mock.calls.map(([write]) => write.create).filter(receipt => receipt.outcome !== "started");
    expect(receipts).toHaveLength(2);
    expect(new Set(receipts.map(r => r.attemptId)).size).toBe(2);
    for (const receipt of receipts) expect(receipt).toMatchObject({
      operationId: "fixture-turn", stage: "agent", provider: "anthropic", returnedModel: modelName,
      inputTokens: 20, outputTokens: 20, isRetry: false, outcome: "success",
    });
    const requests = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)),
    );
    for (const request of requests) {
      expect(request).toMatchObject({
        model: modelName,
        stream: true,
        max_tokens: 16_384,
      });
      if (modelName === "claude-haiku-5-5")
        expect(request.thinking).toEqual({ type: "adaptive" });
      else expect(request).not.toHaveProperty("thinking");
      expect(request).not.toHaveProperty("temperature");
      expect(request).not.toHaveProperty("top_p");
      expect(request).not.toHaveProperty("top_k");
    }
    expect(requests[1].system).toEqual(requests[0].system);
    expect(requests[1].tools).toEqual(requests[0].tools);
    expect(requests[1].messages.slice(0, 3)).toEqual(requests[0].messages);
    expect(requests[1].messages[3]).toMatchObject({
      role: "assistant",
      content: [
        {
          type: "thinking",
          thinking: "Consulting the requested passage.",
          signature: "fixture-signature",
        },
        {
          type: "tool_use",
          id: "tool_1",
          name: "lookupScripture",
          input: { reference: "Ephesians 2:8" },
        },
      ],
    });
    expect(requests[1].messages[4]).toMatchObject({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tool_1",
          content: "For by grace you have been saved through faith.",
        },
      ],
    });
  });
});

it("records each HTTP retry inside a single Haiku invocation and keeps the reported failure cost", async () => {
  upsert.mockClear();
  const model = createParrotChatModel(credentials);
  if (!(model instanceof ChatAnthropic)) throw new Error("Expected Anthropic");
  const failed = new Response(JSON.stringify({
    type: "error", error: { type: "overloaded_error", message: "retry" },
    usage: { input_tokens: 19, output_tokens: 2 }, model: "claude-haiku-5-5",
  }), { status: 500, headers: { "Content-Type": "application/json" } });
  const success = streamedResponse([{ start: { type: "text", text: "" }, deltas: [{ type: "text_delta", text: "Answer" }] }], "end_turn");
  model.clientOptions = { fetch: vi.fn<typeof fetch>().mockResolvedValueOnce(failed).mockResolvedValueOnce(success) };
  const agent = createAgent({ model, tools: [] });
  await agent.invoke({ messages: [new HumanMessage("Show me Psalm 23.")] }, {
    configurable: { chatUsage: { operationId: "fixture-retry" } },
  });
  const receipts = upsert.mock.calls.map(([write]) => write.create).filter(receipt => receipt.outcome !== "started");
  expect(receipts).toMatchObject([
    { isRetry: false, inputTokens: 19, outputTokens: 2, outcome: "provider_error" },
    { isRetry: true, inputTokens: 20, outputTokens: 20, outcome: "success" },
  ]);
  expect(new Set(receipts.map(r => r.attemptId)).size).toBe(2);
});

it("keeps received input and unknown final output when Haiku disconnects during generation", async () => {
  upsert.mockClear();
  const model = createParrotChatModel(credentials);
  if (!(model instanceof ChatAnthropic)) throw new Error("Expected Anthropic");
  const start = { type: "message_start", message: {
    type: "message", role: "assistant", content: [], model: "claude-haiku-5-5",
    usage: { input_tokens: 13, output_tokens: 0 },
  } };
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`event: message_start\ndata: ${JSON.stringify(start)}\n\n`));
    },
    pull(controller) { controller.error(new Error("synthetic disconnect")); },
  });
  model.clientOptions = { fetch: vi.fn<typeof fetch>().mockResolvedValue(
    new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
  ) };
  const agent = createAgent({ model, tools: [] });
  await expect(agent.invoke({ messages: [new HumanMessage("Show me Psalm 23.")] }, {
    configurable: { chatUsage: { operationId: "fixture-aborted" } },
  })).rejects.toThrow();
  expect(upsert.mock.lastCall?.[0].create).toMatchObject({
    operationId: "fixture-aborted", inputTokens: 13, outputTokens: null, outcome: "provider_error",
  });
});

it("reserves the guest budget before every paid attempt, including the SDK retry", async () => {
  vi.stubEnv("MCP_GUEST_DAILY_BUDGET_CENTS", "105");
  try {
    upsert.mockClear();
    debit.mockReset().mockResolvedValueOnce(1).mockResolvedValue(0);
    const model = createParrotChatModel(credentials, "mcp_guest");
    if (!(model instanceof ChatAnthropic)) throw new Error("Expected Anthropic");

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(
      JSON.stringify({ type: "error", error: { type: "api_error", message: "unavailable" } }),
      { status: 500, headers: { "content-type": "application/json" } },
    ));
    model.clientOptions.fetch = fetchMock;
    const agent = createAgent({ model, tools: [] });
    await expect(agent.invoke({ messages: [new HumanMessage("Show me Psalm 23.")] }, {
      configurable: { chatUsage: { operationId: "guest-budget-retry" } },
    })).rejects.toThrow(/guest model quota exhausted/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(debit).toHaveBeenCalledTimes(2);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request).toMatchObject({ service_tier: "standard_only", max_tokens: 16384, model: "claude-haiku-5-5" });
    const receipts = upsert.mock.calls.map(([write]) => write.create);
    expect(receipts.filter(r => r.outcome === "provider_error")).toHaveLength(1);
    expect(new Set(receipts.map(r => r.attemptId)).size).toBe(1);
  } finally {
    vi.unstubAllEnvs();
  }
});

it("refuses unpriced guest models", () => {
  for (const override of [{ PARROT_AGENT_PROVIDER: "openai" }, { PARROT_ANTHROPIC_MODEL: "custom" }]) {
    expect(() => createParrotChatModel({ ...credentials, ...override }, "mcp_guest")).toThrow(/unavailable/);
  }
});

it("rejects a truncated Haiku stream before a partial answer can be persisted", async () => {
  upsert.mockClear();
  const model = createParrotChatModel(credentials);
  if (!(model instanceof ChatAnthropic)) throw new Error("Expected Anthropic");
  const response = streamedResponse([{
    start: { type: "text", text: "" },
    deltas: [{ type: "text_delta", text: "Only the beginning" }],
  }], "end_turn");
  const events = (await response.text()).split("event: message_delta")[0];
  model.clientOptions = { fetch: vi.fn<typeof fetch>().mockResolvedValue(
    new Response(events, { headers: { "Content-Type": "text/event-stream" } }),
  ) };
  const agent = createAgent({ model, tools: [] });
  await expect(agent.invoke({ messages: [new HumanMessage("Show me Psalm 23.")] }, {
    configurable: { chatUsage: { operationId: "fixture-truncated" } },
  })).rejects.toThrow("The provider stream ended before its final event.");
  expect(upsert.mock.lastCall?.[0].create).toMatchObject({
    operationId: "fixture-truncated", inputTokens: 20, outputTokens: null, outcome: "provider_error",
  });
});
