import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as readDevotional } from "./route";
import { GET as runCron } from "@/app/api/cron/devotional/route";

const mocks = vi.hoisted(() => ({
    findUnique: vi.fn(),
    upsert: vi.fn(),
    generate: vi.fn(),
    complete: vi.fn(),
    search: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    default: { parrotDevotionals: { findUnique: mocks.findUnique, upsert: mocks.upsert } },
}));
vi.mock("@/lib/parrot-ai", () => ({ parrotAI: { generateStructured: mocks.generate } }));
vi.mock("@/lib/provider-usage", () => ({ markUsageOperationComplete: mocks.complete }));
vi.mock("@tavily/core", () => ({ tavily: () => ({ search: mocks.search }) }));

const generated = { title: "Care", bible_verse: "Psalm 23:1", devotional: "The Lord is my shepherd." };
const stored = { title: generated.title, bible_verse: generated.bible_verse, devotional_text: generated.devotional };
const cron = () => runCron(new Request("http://localhost/api/cron/devotional", {
    headers: { Authorization: "Bearer test" },
}));

describe("daily devotional usage", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-21T12:00:00Z"));
        vi.stubEnv("CRON_SECRET", "test");
        mocks.search.mockResolvedValue({ results: [] });
        mocks.generate.mockResolvedValue({ data: generated, model: "gemini-4-hydrogen" });
        mocks.upsert.mockResolvedValue(stored);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    it.each([["reader", readDevotional], ["cron", cron]] as const)(
        "%s generates once, marks the saved operation complete and serves cache hits",
        async (_, get) => {
            mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(stored);
            expect((await get()).status).toBe(200);
            expect((await get()).status).toBe(200);
            expect(mocks.generate).toHaveBeenCalledTimes(1);
            expect(mocks.search).toHaveBeenCalledTimes(1);
            const { usage, validate } = mocks.generate.mock.calls[0][0];
            expect(usage).toEqual({
                feature: "daily_devotional", stage: "generation", operationId: expect.stringMatching(/^[a-f0-9]{64}$/),
            });
            expect(validate(generated)).toBe(true);
            expect(validate({ title: "incomplete" })).toBe(false);
            expect(mocks.complete).toHaveBeenCalledExactlyOnceWith("daily_devotional", usage.operationId);
            expect(mocks.upsert.mock.invocationCallOrder[0]).toBeLessThan(mocks.complete.mock.invocationCallOrder[0]);
        },
    );

    it("leaves a generated operation incomplete if its devotional could not be stored", async () => {
        mocks.findUnique.mockResolvedValue(null);
        mocks.upsert.mockRejectedValue(new Error("storage unavailable"));
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            expect((await readDevotional()).status).toBe(500);
            expect(mocks.generate).toHaveBeenCalledTimes(1);
            expect(mocks.complete).not.toHaveBeenCalled();
        } finally {
            log.mockRestore();
        }
    });
});
