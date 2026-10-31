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
    expect(gemini.model).toBe("gemini-3.8-flash");
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
      { streamMode: ["updates", "messages", "custom"] },
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
