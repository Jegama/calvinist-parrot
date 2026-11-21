import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedJournalAIOutput } from "@/types/journal";
import { getPersistedJournalGenerationStatus } from "@/types/journal";
import { journalResponses } from "@/tests/fixtures/journal-responses";
import {
  JOURNAL_CALL1A_SCHEMA, JOURNAL_CALL1B_SCHEMA, JOURNAL_CALL1C_SCHEMA, JOURNAL_CALL2_SCHEMA,
} from "@/lib/schemas/journal";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  complete: vi.fn(),
  find: vi.fn(),
  upsert: vi.fn(),
  create: vi.fn(),
  saved: vi.fn(),
}));

vi.mock("@/lib/parrot-ai", () => ({
  parrotAI: { generateStructured: mocks.generate },
  JOURNAL_MODEL: { provider: "anthropic", model: "claude-haiku-5-5" },
}));
vi.mock("@/lib/provider-usage", () => ({ markUsageOperationComplete: mocks.complete }));
vi.mock("@/lib/auth", () => ({ requireAuthenticatedUser: async () => ({ userId: "user-1" }) }));
vi.mock("@/lib/householdService", () => ({ getMembershipForUser: async () => null }));
vi.mock("@/lib/prisma", () => {
  const database = {
    userProfile: { findUnique: async () => ({ id: "profile-1" }), update: vi.fn() },
    journalEntry: { create: mocks.create, findUnique: mocks.find, findMany: async () => [], update: vi.fn() },
    journalEntryAI: { findUnique: mocks.saved, upsert: mocks.upsert },
    $queryRaw: async () => [{ tags: [] }],
  };
  return { default: { ...database, $transaction: (fn: (tx: typeof database) => unknown) => fn(database) } };
});

import { POST as create } from "../../route";
import { POST as reprocess } from "./route";
const {
  title: call1a, heartReflection: call1b, scripture: call1c, suggestedPrayerRequests: call2,
} = journalResponses;

const legacyCall2Fallback = {
  tags: {
    circumstance: [],
    heartIssue: [],
    rulingDesire: [],
    virtue: [],
    theologicalTheme: [],
    meansOfGrace: [],
  },
  suggestedPrayerRequests: [],
  dashboardSignals: { recurringTheme: null },
};


const now = new Date();
const entry = {
  id: "entry-1",
  authorProfileId: "profile-1",
  entryType: "PERSONAL",
  entryText: "Today during a long delay I spoke impatiently and would like to reflect on what happened.",
  tags: [], entryDate: now, createdAt: now, updatedAt: now,
};
const outputs = { call1a, call1b, call1c, call2 };
const schemas = {
  call1a: JOURNAL_CALL1A_SCHEMA, call1b: JOURNAL_CALL1B_SCHEMA,
  call1c: JOURNAL_CALL1C_SCHEMA, call2: JOURNAL_CALL2_SCHEMA,
};
const haiku = "claude-haiku-5-5-20261101";
const gemini = "gemini-4-hydrogen";
let saved: PersistedJournalAIOutput;
let fail: keyof typeof outputs | undefined;

async function events(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
  return (await response.text()).trim().split("\n").map(line => JSON.parse(line));
}

function retry() {
  return reprocess(new Request("http://localhost/reprocess", { method: "POST" }), {
    params: Promise.resolve({ id: entry.id }),
  });
}

function createEntry() {
  return create(new Request("http://localhost/api/journal/entries", {
    method: "POST", body: JSON.stringify({ entryText: entry.entryText }),
  }));
}

describe("Personal Journal create and recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saved = null;
    fail = undefined;
    mocks.create.mockResolvedValue(entry);
    mocks.find.mockImplementation(async () => ({ ...entry, aiOutput: saved }));
    mocks.saved.mockImplementation(async () => saved);
    mocks.upsert.mockImplementation(async ({ create }) => { saved = create; });
    mocks.generate.mockImplementation(async ({ modelSpec, usage, thinking, schema, validate }) => {
      const stage: keyof typeof outputs = usage.stage;
      expect(usage).toEqual({ stage, feature: "personal_journal", operationId: entry.id });
      expect(modelSpec).toEqual({ provider: "anthropic", model: "claude-haiku-5-5" });
      expect(schema).toEqual(schemas[stage]);
      expect(thinking).toBe("low");
      expect(validate(outputs[stage])).toBe(true);
      expect(validate({})).toBe(false);
      if (stage === fail) throw new Error("Provider failed");
      return { data: outputs[stage], model: haiku, provider: "anthropic" };
    });
  });

  it("creates a complete entry and streams each result", async () => {
    const stream = await events(await createEntry());
    expect(stream.map(event => event.type)).toEqual([
      "entry_created", "progress", "call1a_complete", "progress",
      "call1b_complete", "call1c_complete", "call2_complete", "done",
    ]);
    expect(stream.at(-1)).toEqual({ type: "done", call1: { ...call1a, ...call1b, ...call1c }, call2 });
    expect(saved?.modelInfo).toMatchObject({
      call1aModel: haiku, call1bModel: haiku, call1cModel: haiku, call2Model: haiku,
      status: "complete", failedStages: [],
    });
    expect(mocks.complete).toHaveBeenCalledWith("personal_journal", entry.id);
    expect((await retry()).status).toBe(409);
    expect(mocks.generate).toHaveBeenCalledTimes(4);
  });

  it("recovers after a partial creation by calling only the failed stage", async () => {
    fail = "call1b";
    const initial = await events(await createEntry());
    expect(initial).toContainEqual({ type: "call1b_error", message: "Heart analysis unavailable" });
    expect(initial.at(-1)).toMatchObject({ partial: true, failedStages: ["call1b"] });
    expect(saved?.modelInfo).toMatchObject({ status: "partial", call1bModel: null });
    expect(mocks.complete).not.toHaveBeenCalled();
    fail = undefined;
    mocks.generate.mockClear();
    const retried = await events(await retry());
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.generate.mock.calls[0][0].usage.stage).toBe("call1b");
    expect(retried.at(-1)).toEqual({ type: "done", call1: { ...call1a, ...call1b, ...call1c }, call2 });
    expect(mocks.complete).toHaveBeenCalledOnce();
  });

  it("preserves successful legacy stages and their attribution during a mixed-model retry", async () => {
    const legacyHeart = { ...call1b, heartReflection: ["An existing Gemini reflection."] };
    saved = {
      call1: { ...call1a, ...legacyHeart, ...call1c }, call2: legacyCall2Fallback,
      modelInfo: { call1aModel: gemini, call1cModel: gemini, call2Model: gemini },
    };
    const stream = await events(await retry());
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.generate.mock.calls[0][0].usage.stage).toBe("call2");
    expect(stream.at(-1)).toMatchObject({ type: "done", call1: { ...call1a, ...legacyHeart, ...call1c }, call2 });
    expect(saved.modelInfo).toMatchObject({
      call1aModel: gemini, call1bModel: null, call1cModel: gemini, call2Model: haiku,
      status: "complete", failedStages: [],
    });
    expect(getPersistedJournalGenerationStatus(saved)).toBe("complete");
  });

  it("retains whole-entry model attribution from the earliest saved reflections", async () => {
    saved = {
      call1: { ...call1a, ...call1b, ...call1c }, call2: null, modelInfo: { model: "gpt-5-mini" },
    };
    await events(await retry());
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(saved.modelInfo).toMatchObject({
      call1aModel: "gpt-5-mini", call1bModel: "gpt-5-mini", call1cModel: "gpt-5-mini", call2Model: haiku,
    });
  });

  it("keeps a success saved by a concurrent retry when this request fails", async () => {
    saved = {
      call1: { ...call1a, ...call1b, ...call1c }, call2: legacyCall2Fallback,
      modelInfo: { status: "partial", failedStages: ["call2"] },
    };
    mocks.saved.mockResolvedValue({
      ...saved, call2, modelInfo: { status: "complete", call2Model: haiku },
    });
    fail = "call2";
    const stream = await events(await retry());
    expect(stream.at(-1)).toEqual({ type: "done", call1: { ...call1a, ...call1b, ...call1c }, call2 });
    expect(saved.modelInfo).toMatchObject({ status: "complete", call2Model: haiku });
  });

  it("uses the winning overview in dependent prompts when two retries start without one", async () => {
    const laterOverview = { title: "Another title", situationSummary: "Losing situation", oneSentenceSummary: "Losing summary" };
    const winner = { title: "First saved", situationSummary: "Winning situation", oneSentenceSummary: "Winning summary" };
    const first = Promise.withResolvers<typeof winner>();
    const second = Promise.withResolvers<typeof winner>();
    const firstHeart = Promise.withResolvers<typeof call1b>();
    const overviews = [first, second];
    let heartCalls = 0;
    mocks.generate.mockImplementation(async ({ usage, messages }) => {
      const stage: keyof typeof outputs = usage.stage;
      if (stage === "call1a") {
        const overview = await overviews.shift()!.promise;
        return { data: overview, model: overview === winner ? "first-model" : "second-model" };
      }
      const expectedSummary = stage === "call2" ? winner.oneSentenceSummary : winner.situationSummary;
      expect(messages[1].content).toContain(expectedSummary);
      const data = stage === "call1b" && heartCalls++ === 0 ? await firstHeart.promise : outputs[stage];
      return { data, model: haiku };
    });

    const pendingFirst = events(await retry());
    const pendingSecond = events(await retry());
    first.resolve(winner);
    // Hold one dependent stage open so the first checkpoint is visible during the second request.
    await vi.waitFor(() => expect(heartCalls).toBe(1));
    expect(saved).toMatchObject({ call1: winner, modelInfo: { status: "partial", call1aModel: "first-model" } });
    second.resolve(laterOverview);
    const secondStream = await pendingSecond;
    firstHeart.resolve(call1b);
    const firstStream = await pendingFirst;
    for (const stream of [firstStream, secondStream]) {
      expect(stream).toContainEqual({ type: "call1a_complete", call1a: winner });
      expect(stream.at(-1)).toEqual({ type: "done", call1: { ...winner, ...call1b, ...call1c }, call2 });
    }
    expect(saved).toMatchObject({ call1: winner, modelInfo: { status: "complete", call1aModel: "first-model" } });
  });

  it("regenerates all four stages after an overview failure", async () => {
    fail = "call1a";
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    expect((await events(await createEntry())).at(-1)?.type).toBe("error");
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(saved).toBe(null);
    fail = undefined;
    expect((await events(await retry())).at(-1)?.type).toBe("done");
    expect(mocks.generate).toHaveBeenCalledTimes(5);
    expect(mocks.complete).toHaveBeenCalledOnce();
  });
});
