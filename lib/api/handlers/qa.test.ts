import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findHistory: vi.fn(),
  createHistory: vi.fn(),
  deleteHistory: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class {
    constructor() {
      throw new Error("Retired Q&A must not initialize a model provider");
    }
  },
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    questionHistory: {
      findMany: mocks.findHistory,
      create: mocks.createHistory,
      deleteMany: mocks.deleteHistory,
    },
  },
}));
vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: vi.fn(async () => ({ userId: "owner-1" })),
}));

import { POST as postQa } from "@/app/api/v1/qa/route";
import { POST as postLegacyQa } from "@/app/api/parrot-qa/route";
import { POST as postElaborate } from "@/app/api/elaborate/route";
import { GET as getHistory } from "@/app/api/user-questions/route";
import { errorResponseSchema } from "../contracts/common";
import { QA_RETIREMENT_MESSAGE } from "../qa-retirement";

const retiredRoutes: [string, (request: Request) => Response][] = [
  ["/api/v1/qa", postQa],
  ["/api/parrot-qa", postLegacyQa],
  ["/api/elaborate", postElaborate],
];

describe("Counsel of Three retirement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(retiredRoutes)(
    "returns 410 without calling models or modifying history: %s",
    async (path, post) => {
      // Retirement applies even to malformed bodies and requires no API credentials.
      for (const body of [
        "{",
        JSON.stringify({
          question: "private-question",
          userId: "private-user",
        }),
      ]) {
        const request = new Request(`http://localhost${path}`, {
          method: "POST",
          body,
        });
        const response = post(request);
        expect(response.status).toBe(410);
        expect(response.headers.get("Content-Type")).toContain(
          "application/json",
        );
        expect(response.headers.get("Deprecation")).toMatch(/^@\d+$/);
        expect(response.headers.get("Link")).toContain('rel="deprecation"');
        expect(errorResponseSchema.parse(await response.json())).toEqual({
          error: QA_RETIREMENT_MESSAGE,
        });
        expect(request.bodyUsed).toBe(false);
      }
      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.findHistory).not.toHaveBeenCalled();
      expect(mocks.createHistory).not.toHaveBeenCalled();
      expect(mocks.deleteHistory).not.toHaveBeenCalled();
    },
  );

  it("retains privacy-safe legacy logging with the active chat replacement", () => {
    const response = postLegacyQa(
      new Request("http://localhost/api/parrot-qa", {
        method: "POST",
        body: JSON.stringify({
          question: "private-question",
          userId: "private-user",
        }),
      }),
    );
    expect(response.headers.get("Deprecation")).toBe("@1785024000");
    const logged = vi.mocked(console.warn).mock.calls[0]?.[0] as string;
    expect(JSON.parse(logged)).toMatchObject({
      event: "deprecated_api_request",
      route: "/api/parrot-qa",
      replacement: "/api/v1/chats",
    });
    expect(logged).not.toContain("private-question");
    expect(logged).not.toContain("private-user");
  });

  it("keeps existing saved answers readable for their authenticated owner", async () => {
    const saved = [
      { id: "saved-answer", userId: "owner-1", reviewedAnswer: "Saved answer" },
    ];
    mocks.findHistory.mockResolvedValueOnce(saved);
    const response = await getHistory(
      new Request("http://localhost/api/user-questions"),
    );
    expect(await response.json()).toEqual(saved);
    expect(mocks.findHistory).toHaveBeenCalledWith({
      where: { userId: "owner-1" },
      orderBy: { createdAt: "desc" },
    });
    expect(mocks.createHistory).not.toHaveBeenCalled();
    expect(mocks.deleteHistory).not.toHaveBeenCalled();
  });
});
