import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JOURNAL_MODEL, parrotAI, type StructuredOutputParams } from "./parrot-ai";
import { journalResponses } from "@/tests/fixtures/journal-responses";
import { KIDS_CALL1_SCHEMA } from "./schemas/kids-discipleship";
import { markUsageOperationComplete } from "./provider-usage";

const db = vi.hoisted(() => ({ upsert: vi.fn(), updateMany: vi.fn() }));
vi.mock("./prisma", () => ({ default: { providerCallAttempt: db } }));

const schema = {
  name: "reflection", schema: { type: "object", properties: { title: { type: "string" } },
    additionalProperties: false, required: ["title"] },
};
const params: StructuredOutputParams = {
  modelSpec: JOURNAL_MODEL, messages: [{ role: "user", content: "private sample content" }],
  thinking: "low", schema,
  usage: { feature: "personal_journal", stage: "call1a", operationId: "opaque-entry" },
};
function message(text: string) {
  return Response.json({
    id: "msg_sample", type: "message", role: "assistant", model: "returned-model",
    content: [{ type: "text", text }], usage: {
      input_tokens: 15, output_tokens: 7, output_tokens_details: { thinking_tokens: 3 },
    },
  });
}
function upserts() { return db.upsert.mock.calls.map(([arg]) => arg); }

describe("structured provider attempts", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.resetAllMocks();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("uses adaptive effort and an Anthropic-compatible schema, validating original nested constraints", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(message(JSON.stringify({
      ...journalResponses.summary,
      recommendedResources: [{ ...journalResponses.summary.recommendedResources[0], author: "Unknown author" }],
    })));
    vi.stubGlobal("fetch", transport);
    await expect(parrotAI.generateStructured({ ...params, schema: KIDS_CALL1_SCHEMA })).rejects.toThrow("Invalid");
    const payload = JSON.parse(String(transport.mock.calls[0][1]?.body));
    expect(payload.thinking).toEqual({ type: "adaptive" });
    expect(payload.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    const { recommendedResources, scripture } = payload.output_config.format.schema.properties;
    expect(scripture).not.toHaveProperty("maxItems");
    expect(scripture).not.toHaveProperty("minItems");
    expect(scripture.description).toContain("at least 2 items");
    expect(recommendedResources.items.properties.author.enum).toContain("Tedd Tripp");
    expect(upserts().map(row => row.create.outcome)).toEqual(["received", "invalid_output"]);
  });

  it("keeps the older Anthropic request contract", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(message('{"title":"done"}'));
    vi.stubGlobal("fetch", transport);
    await parrotAI.generateStructured({
      ...params, modelSpec: { provider: "anthropic", model: "claude-haiku-4-5" },
    });
    const payload = JSON.parse(String(transport.mock.calls[0][1]?.body));
    expect(payload.thinking).toEqual({ type: "enabled", budget_tokens: 4096 });
    expect(payload.output_config).toEqual({ format: { type: "json_schema", schema: schema.schema } });
  });

  it("captures usage before parsing invalid JSON without saving the input or output", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(message("private malformed reply")));
    await expect(parrotAI.generateStructured(params)).rejects.toThrow();
    const [receipt, invalid] = upserts();
    expect(receipt.create).toMatchObject({
      requestedModel: "claude-haiku-5-5", returnedModel: "returned-model", stage: "call1a",
      operationId: "opaque-entry", outcome: "received", inputTokens: 15, outputTokens: 7, thinkingTokens: 3,
    });
    expect(invalid.where).toEqual(receipt.where);
    expect(invalid.create.outcome).toBe("invalid_output");
    expect(JSON.stringify(upserts())).not.toMatch(/private sample content|private malformed reply/);
  });

  it("gives each SDK retry a distinct id and marks completion only for the logical operation", async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: { message: "retry" } }, {
        status: 429, headers: { "retry-after-ms": "1" },
      }))
      .mockResolvedValueOnce(message('{"title":"done"}'));
    vi.stubGlobal("fetch", transport);
    await expect(parrotAI.generateStructured(params)).resolves.toMatchObject({
      data: { title: "done" }, model: "returned-model",
    });
    const [failed, received, success] = upserts();
    expect(failed.create).toMatchObject({ outcome: "provider_error", inputTokens: null, outputTokens: null });
    expect(failed.where).not.toEqual(received.where);
    expect(received.where).toEqual(success.where);
    expect(db.updateMany).not.toHaveBeenCalled();
    await markUsageOperationComplete("personal_journal", "opaque-entry");
    expect(db.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { feature: "personal_journal", operationId: "opaque-entry", completedAt: null, environment: "test" },
    }));
  });

  it("returns the paid result on a logging failure without retrying the provider", async () => {
    db.upsert.mockRejectedValue(new Error("database unavailable"));
    const transport = vi.fn<typeof fetch>().mockResolvedValue(message('{"title":"done"}'));
    vi.stubGlobal("fetch", transport);
    await expect(parrotAI.generateStructured(params)).resolves.toMatchObject({ model: "returned-model" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("preserves counters reported in a Gemini error envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      error: { message: "failed" }, modelVersion: "hydrogen-revision",
      usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 0 },
    }, { status: 400 })));
    await expect(parrotAI.generateStructured({ ...params, modelSpec: undefined })).rejects.toThrow();
    expect(upserts()[0].create).toMatchObject({
      outcome: "provider_error", returnedModel: "hydrogen-revision", inputTokens: 50, outputTokens: 0,
    });
  });

  it("records Gemini's returned model and usage before the caller's validator", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      candidates: [{ content: { role: "model", parts: [{ text: '{"title":"sample"}' }] } }],
      modelVersion: "hydrogen-revision", usageMetadata: {
        promptTokenCount: 36, cachedContentTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 19,
      },
    })));
    await expect(parrotAI.generateStructured({
      ...params, modelSpec: undefined, validate: () => {
        expect(upserts()[0].create).toMatchObject({
          outcome: "received", returnedModel: "hydrogen-revision", inputTokens: 26, outputTokens: 24,
        });
        return false;
      },
    })).rejects.toThrow("Invalid reflection");
    expect(upserts()[1].create.outcome).toBe("invalid_output");
  });
});
