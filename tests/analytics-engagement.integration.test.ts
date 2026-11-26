import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getEngagementReport } from "@/lib/analytics/engagement";
import { chicagoTimestamp } from "@/lib/analytics/web-analytics";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const url = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;

let db: PrismaClient;
vi.mock("@/lib/prisma", () => ({ get default() { return db; } }));

describe.skipIf(!url)("engagement reporting from durable receipts", () => {
  const start = new Date("2044-11-01T05:00:00Z");
  const end = new Date("2044-11-08T06:00:00Z");
  const ids = Array.from({ length: 6 }, () => randomUUID());

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    const rows = [
      [0, "saved", 0], [0, "reflection_ready", 1], [0, "prayer_saved", 2], [0, "continued_chat", 3],
      // An incomplete flow, one started outside the period, and two unmatched completions.
      [1, "saved", 1], [2, "saved", -1], [2, "reflection_ready", 1], [2, "prayer_saved", 2],
      [3, "reflection_ready", 1], [4, "continued_chat", 3],
      // Out-of-order observations can't advance a flow.
      [5, "saved", 2], [5, "reflection_ready", 1], [5, "continued_chat", 3],
    ] as const;
    const events = rows.map(([id, step, offset]) => ({
      feature: "personal_journal", step, flowId: ids[id], channel: "web", occurredAt: new Date(+start + offset * 1000),
    }));
    await db.analyticsEngagementEvent.createMany({ data: [...events, ...events], skipDuplicates: true });
  });
  afterAll(async () => {
    await db.analyticsEngagementEvent.deleteMany({ where: { flowId: { in: ids } } });
    await db.$disconnect();
  });

  it("counts ordered steps per eligible entry and uses the ready reflection for each follow-on rate", async () => {
    const report = await getEngagementReport({ start, end }, db);
    expect(report.personal_journal?.steps.map(s => [s.label, s.count, s.denominator])).toEqual([
      ["Entry saved", 3, undefined], ["Reflection ready", 1, 3],
      ["Suggested prayer saved", 1, 1], ["Continued in chat", 1, 1],
    ]);
    expect(report.heritage_journal?.steps.map(s => s.count)).toEqual([0, 0, 0]);
    for (const id of ids) expect(JSON.stringify(report)).not.toContain(id);
  });

  it("keeps the chat collection date across later reporting windows without configured channel coverage", async () => {
    vi.stubEnv("ANALYTICS_CHAT_COVERAGE_FROM", undefined);
    try {
      const [migration] = await db.$queryRaw<{ finished_at: Date }[]>`
        SELECT finished_at FROM "_prisma_migrations"
        WHERE migration_name = '20261125000000_analytics_engagement_events' AND rolled_back_at IS NULL
      `;
      const since = `Website flow collection since ${chicagoTimestamp(migration.finished_at)}.`;
      for (const windowStart of [start, new Date(+start + 86_400_000)]) {
        const report = await getEngagementReport({ start: windowStart, end }, db);
        expect(report.chat?.coverage).toContain(since);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("marks pre-collection counts and rates unavailable", async () => {
    const report = await getEngagementReport({ start: new Date("2000-01-01"), end: new Date("2000-01-08") }, db);
    expect(report.daily_devotional?.steps[1]).toMatchObject({ count: null, denominator: null });
    expect(report.church?.coverage).toContain("Before coverage");
  });
});
