import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthenticatedUser: vi.fn(),
  assertHouseholdAccess: vi.fn(),
  findLog: vi.fn(),
  findChild: vi.fn(),
  findProfile: vi.fn(),
  createLog: vi.fn(),
  getCurrentAnnualPlan: vi.fn(),
  generate: vi.fn(),
  checkpoint: vi.fn(),
  transaction: vi.fn(),
  saveAI: vi.fn(),
  updateTags: vi.fn(),
  markComplete: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));

vi.mock("@/lib/householdService", () => ({
  assertHouseholdAccess: mocks.assertHouseholdAccess,
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    journalEntry: { findUnique: mocks.findLog, create: mocks.createLog },
    prayerMember: { findUnique: mocks.findChild },
    userProfile: { findUnique: mocks.findProfile },
    discipleshipAnnualPlan: { findUnique: mocks.getCurrentAnnualPlan },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/parrot-ai", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/parrot-ai")>(),
  parrotAI: { generateStructured: mocks.generate },
}));

vi.mock("@/lib/provider-usage", () => ({
  markUsageOperationComplete: mocks.markComplete,
}));

import { POST } from "./route";
import { POST as createLog } from "../../route";

const entryDate = new Date("2026-08-15T12:00:00.000Z");
const birthdate = new Date("2018-04-12T00:00:00.000Z");

const log = {
  id: "log-1",
  entryType: "DISCIPLESHIP",
  entryDate,
  entryText: "Our child offered to help a younger sibling clean up blocks today when we were tired.",
  category: "NURTURE",
  subjectMemberId: "child-1",
  gospelConnection: "We talked about Christ's patient love.",
};

const child = {
  id: "child-1",
  spaceId: "space-1",
  isChild: true,
  displayName: "Sam",
  birthdate,
};

const call1 = {
  summary: "A shepherding summary.",
  whatMightBeGoingOnInTheHeart: ["It could be that Sam wanted to help."],
  gospelConnectionSuggestion: {
    ageAppropriatePhrase: "Jesus helps us love others.",
    scriptureToShare: "Philippians 2:4",
    explanation: "This connects service to Christlike love.",
  },
  parentShepherdingNextSteps: ["Thank Sam for serving."],
  recommendedResources: [
    {
      title:
        "The Disciple-Making Parent: A Comprehensive Guidebook for Raising Your Children to Love and Follow Jesus Christ",
      author: "Chap Bettis",
      whyItFits: "It connects everyday parenting moments to long-term discipleship.",
    },
  ],
  scripture: [
    {
      reference: "Philippians 2:4",
      whyItApplies: "It encourages looking to the interests of others.",
    },
  ],
  encouragementForParent: "Keep noticing evidences of grace.",
  safetyFlags: [],
};

const call2 = {
  tags: {
    circumstance: ["service"],
    heartIssue: [],
    virtue: ["kindness"],
    developmentalArea: [],
  },
  suggestedChildPrayerRequests: [],
  suggestedMonthlyVisionAdjustments: [],
  parentConsistencyNote: null,
};

function requestContext() {
  return { params: Promise.resolve({ id: log.id }) };
}

async function readEvents(response: Response) {
  return (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("POST /api/kids-discipleship/logs/[id]/reprocess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      errorResponse: null,
    });
    mocks.assertHouseholdAccess.mockResolvedValue(undefined);
    mocks.findLog.mockResolvedValue(log);
    mocks.findChild.mockResolvedValue(child);
    mocks.getCurrentAnnualPlan.mockResolvedValue({
      characterGoal: "Kindness",
      competencyGoal: "Serving",
    });
    mocks.createLog.mockResolvedValue(log);
    mocks.findProfile.mockResolvedValue({ id: "profile" });
    let checkpoint = { id: "checkpoint", call2: null, modelInfo: {} };
    mocks.checkpoint.mockImplementation(async ({ create }) => {
      checkpoint = { ...checkpoint, ...create };
      return checkpoint;
    });
    mocks.transaction.mockImplementation(async (run) => run({
      $queryRaw: async () => [log],
      journalEntryAI: {
        findUnique: async () => null,
        upsert: mocks.checkpoint,
        findUniqueOrThrow: async () => (await mocks.findLog()).aiOutput ?? checkpoint,
        update: mocks.saveAI,
      },
      journalEntry: { update: mocks.updateTags },
    }));
    mocks.generate.mockImplementation(async ({ usage }) => ({
      model: `returned-haiku-${usage.stage}`,
      data: usage.stage === "call1" ? call1 : call2,
    }));
  });

  it("reprocesses the existing entry and streams the completed reflection", async () => {
    const response = await POST(
      new Request(`http://localhost/api/kids-discipleship/logs/${log.id}/reprocess`, {
        method: "POST",
      }),
      requestContext()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson");

    const events = await readEvents(response);

    expect(events.map((event) => event.type)).toEqual([
      "progress",
      "call1_complete",
      "progress",
      "call2_complete",
      "done",
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "done",
      entry: {
        id: log.id,
        entryDate: entryDate.toISOString(),
        tags: ["service", "kindness"],
      },
      call1,
      call2,
    });
    expect(mocks.assertHouseholdAccess).toHaveBeenCalledWith(
      "user-1",
      "space-1"
    );
    expect(mocks.saveAI).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        modelInfo: expect.objectContaining({
          call1Model: "returned-haiku-call1",
          call2Model: "returned-haiku-call2",
        }),
      }),
    }));
    expect(mocks.markComplete).toHaveBeenCalledWith("heritage_journal", log.id);
  });

  it("rejects a log outside the authenticated household", async () => {
    mocks.assertHouseholdAccess.mockRejectedValue(new Error("forbidden"));

    const response = await POST(
      new Request(`http://localhost/api/kids-discipleship/logs/${log.id}/reprocess`, {
        method: "POST",
      }),
      requestContext()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.saveAI).not.toHaveBeenCalled();
  });

  it("rejects retry when the saved reflection is already complete", async () => {
    mocks.findLog.mockResolvedValue({
      ...log,
      aiOutput: { call1, call2 },
    });

    const response = await POST(
      new Request(`http://localhost/api/kids-discipleship/logs/${log.id}/reprocess`, {
        method: "POST",
      }),
      requestContext()
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This log already has a complete shepherding reflection.",
    });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.saveAI).not.toHaveBeenCalled();
  });

  it("streams a retryable error without replacing the saved entry", async () => {
    mocks.generate.mockRejectedValue(new Error("provider unavailable"));

    const response = await POST(
      new Request(`http://localhost/api/kids-discipleship/logs/${log.id}/reprocess`, {
        method: "POST",
      }),
      requestContext()
    );
    const events = await readEvents(response);

    expect(events).toEqual([
      {
        type: "progress",
        stage: "call1",
        message: "Generating shepherding reflection...",
      },
      {
        type: "error",
        message: "AI processing failed. Please try again.",
      },
    ]);
    expect(mocks.saveAI).not.toHaveBeenCalled();
  });

  it("checkpoints a new reflection when suggestions fail, then skips the saved call on retry", async () => {
    mocks.generate
      .mockResolvedValueOnce({ data: call1, model: "returned-haiku-call1" })
      .mockRejectedValueOnce(new Error("unavailable"));
    const response = await createLog(new Request("http://localhost/api/kids-discipleship/logs", {
      method: "POST",
      body: JSON.stringify({ ...log, memberId: child.id }),
    }));
    expect((await readEvents(response)).map((event) => event.type)).toEqual([
      "entry_created", "progress", "call1_complete", "progress", "error",
    ]);
    expect(mocks.generate.mock.calls.map(([request]) => request.usage)).toEqual([
      { operationId: log.id, feature: "heritage_journal", stage: "call1" },
      { operationId: log.id, feature: "heritage_journal", stage: "call2" },
    ]);
    for (const [request] of mocks.generate.mock.calls) {
      expect(request.modelSpec).toEqual({ provider: "anthropic", model: "claude-haiku-5-5" });
    }
    expect(mocks.markComplete).not.toHaveBeenCalled();
    const checkpoint = mocks.checkpoint.mock.calls[0][0].create;
    expect(checkpoint).toMatchObject({ entryId: log.id, call1, modelInfo: { call1Model: "returned-haiku-call1" } });
    mocks.findLog.mockResolvedValue({ ...log, aiOutput: { ...checkpoint, id: "checkpoint", call2: null } });
    const retried = await POST(new Request("http://localhost", { method: "POST" }), requestContext());
    expect((await readEvents(retried)).map((event) => event.type)).toEqual([
      "call1_complete", "progress", "call2_complete", "done",
    ]);
    expect(mocks.generate).toHaveBeenCalledTimes(3);
    expect(mocks.generate.mock.calls[2][0].usage).toEqual({
      operationId: log.id, feature: "heritage_journal", stage: "call2",
    });
    expect(mocks.markComplete).toHaveBeenCalledWith("heritage_journal", log.id);
  });

  it.each([
    { modelInfo: { call1Model: "gemini-4-hydrogen" }, expectedModel: "gemini-4-hydrogen" },
    { modelInfo: { model: "gpt-5-mini", version: "1.0" }, expectedModel: "gpt-5-mini" },
  ])("preserves a saved $expectedModel reflection when only suggestions need retrying", async ({ modelInfo, expectedModel }) => {
    const legacyCall1: Partial<typeof call1> = { ...call1 };
    delete legacyCall1.recommendedResources;
    mocks.findLog.mockResolvedValue({
      ...log,
      aiOutput: { id: "legacy-checkpoint", call1: legacyCall1, call2: null, modelInfo },
    });
    const retried = await POST(new Request("http://localhost", { method: "POST" }), requestContext());
    const events = await readEvents(retried);
    expect(events[0]).toEqual({ type: "call1_complete", call1: legacyCall1 });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0][0].usage.stage).toBe("call2");
    expect(mocks.saveAI.mock.calls[0][0].data).toMatchObject({
      call2,
      modelInfo: { call1Model: expectedModel, call2Model: "returned-haiku-call2" },
    });
  });
});
