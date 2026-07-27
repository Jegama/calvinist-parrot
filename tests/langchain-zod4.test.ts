import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { PGVectorStore } from "@langchain/pgvector";
import { tool } from "langchain";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const lookupSchema = z.object({
  query: z.string().trim().min(1),
  limit: z.number().int().positive().max(10).default(3),
});

const lookupTool = tool(
  async ({ query, limit }) => ({ query, limit }),
  {
    name: "lookup",
    description: "Look up a bounded number of records.",
    schema: lookupSchema,
  },
);

describe("LangChain Zod 4 compatibility", () => {
  it("validates and transforms tool input during invocation", async () => {
    await expect(
      lookupTool.invoke({ query: "  justification  " }),
    ).resolves.toEqual({
      query: "justification",
      limit: 3,
    });
  });

  it("binds the Zod-backed tool to OpenAI and Google models", () => {
    const openAIModel = new ChatOpenAI({
      apiKey: "test",
      model: "gpt-4o-mini",
    }).bindTools([lookupTool]);
    const googleModel = new ChatGoogleGenerativeAI({
      apiKey: "test",
      model: "gemini-2.5-flash",
    }).bindTools([lookupTool]);

    expect(openAIModel).toMatchObject({
      defaultOptions: {
        tools: [
          {
            function: {
              name: "lookup",
              parameters: {
                type: "object",
                required: expect.arrayContaining(["query"]),
              },
            },
          },
        ],
      },
    });
    expect(googleModel).toMatchObject({
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: "lookup",
                parameters: {
                  type: "object",
                  required: expect.arrayContaining(["query"]),
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("loads the focused PGVector integration", () => {
    expect(PGVectorStore).toBeTypeOf("function");
  });
});
