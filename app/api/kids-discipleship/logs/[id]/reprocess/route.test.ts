import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthenticatedUser: vi.fn(),
  assertHouseholdAccess: vi.fn(),
  findLog: vi.fn(),
  findChild: vi.fn(),
  buildPromptContext: vi.fn(),
  flattenKidsTags: vi.fn(),
  getCurrentAnnualPlan: vi.fn(),
  runKidsCall1: vi.fn(),
  runKidsCall2: vi.fn(),
  storeKidsAIOutput: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));

vi.mock("@/lib/householdService", () => ({
  assertHouseholdAccess: mocks.assertHouseholdAccess,
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    journalEntry: {
      findUnique: mocks.findLog,
    },
    prayerMember: {
      findUnique: mocks.findChild,
    },
  },
}));

vi.mock("@/utils/kids-discipleship/llm", () => ({
  buildPromptContext: mocks.buildPromptContext,
  flattenKidsTags: mocks.flattenKidsTags,
  getCurrentAnnualPlan: mocks.getCurrentAnnualPlan,
  runKidsCall1: mocks.runKidsCall1,
  runKidsCall2: mocks.runKidsCall2,
  storeKidsAIOutput: mocks.storeKidsAIOutput,
}));

import { POST } from "./route";

const entryDate = new Date("2026-08-15T12:00:00.000Z");
const birthdate = new Date("2018-04-12T00:00:00.000Z");

const log = {
  id: "log-1",
  entryType: "DISCIPLESHIP",
  entryDate,
  entryText: "A detailed parenting moment that was saved before generation failed.",
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
    mocks.buildPromptContext.mockReturnValue({ prompt: "context" });
    mocks.runKidsCall1.mockResolvedValue({
      output: call1,
      model: "gemini-3.6-flash",
    });
    mocks.runKidsCall2.mockResolvedValue(call2);
    mocks.flattenKidsTags.mockReturnValue(["service", "kindness"]);
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
    expect(mocks.storeKidsAIOutput).toHaveBeenCalledWith(
      log.id,
      call1,
      call2,
      "gemini-3.6-flash"
    );
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
    expect(mocks.runKidsCall1).not.toHaveBeenCalled();
    expect(mocks.storeKidsAIOutput).not.toHaveBeenCalled();
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
    expect(mocks.runKidsCall1).not.toHaveBeenCalled();
    expect(mocks.storeKidsAIOutput).not.toHaveBeenCalled();
  });

  it("streams a retryable error without replacing the saved entry", async () => {
    mocks.runKidsCall1.mockRejectedValue(new Error("provider unavailable"));

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
        message: "Regenerating shepherding reflection...",
      },
      {
        type: "error",
        message: "AI processing failed. Please try again.",
      },
    ]);
    expect(mocks.storeKidsAIOutput).not.toHaveBeenCalled();
  });
});
