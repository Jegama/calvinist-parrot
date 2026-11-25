import type { OpenAIEmbeddings } from "@langchain/openai";
import { afterEach, expect, it, vi } from "vitest";
import { ccelRetrievalTool } from "./ccelRetrievalTool";

const upsert = vi.hoisted(() => vi.fn());
let embeddings: OpenAIEmbeddings;
vi.mock("@/lib/prisma", () => ({ default: { providerCallAttempt: { upsert } } }));
vi.mock("@langchain/pgvector", () => ({
  PGVectorStore: {
    initialize: async (configured: OpenAIEmbeddings) => {
      embeddings = configured;
      return { similaritySearch: async (query: string) => {
        await embeddings.embedQuery(query);
        return [];
      } };
    },
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("attributes an actual query to its turn and records one input-only receipt per embedding request", async () => {
  vi.stubEnv("CCEL_URL", "postgres://fixture");
  vi.stubEnv("OPENAI_API_KEY", "fixture-key");
  vi.spyOn(console, "log").mockImplementation(() => {});
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({
    model: "text-embedding-3-small",
    data: [{ index: 0, embedding: Buffer.from(new Float32Array([1]).buffer).toString("base64") }],
    usage: { prompt_tokens: 7, total_tokens: 7 },
  }));
  vi.stubGlobal("fetch", transport);
  await ccelRetrievalTool.invoke({ query: "private query" }, {
    configurable: { chatUsage: { operationId: "originating-turn" } },
  });
  // A document batch is its own provider call. A standalone call has no chat.
  embeddings.batchSize = 1;
  await embeddings.embedDocuments(["first", "second"]);

  expect(transport).toHaveBeenCalledTimes(3);
  const receipts = upsert.mock.calls.map(([write]) => write.create).filter(receipt => receipt.outcome === "success");
  expect(receipts).toHaveLength(3);
  expect(receipts[0].operationId).toBe("originating-turn");
  for (const receipt of receipts) {
    expect(receipt).toMatchObject({
      feature: "chat", stage: "ccel_embedding", returnedModel: "text-embedding-3-small",
      inputTokens: 7, outputTokens: 0, providerTotalTokens: 7, isRetry: false,
    });
  }
  expect(new Set(receipts.map(attempt => attempt.attemptId)).size).toBe(3);
  expect(receipts[1].operationId).not.toBe(receipts[0].operationId);
  expect(JSON.stringify(receipts)).not.toContain("private query");
});
