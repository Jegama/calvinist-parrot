import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAnalyticsMetrics } from "@/lib/analytics/metrics";
import { getReportingWindow } from "@/lib/analytics/period";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL
  : process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;

afterEach(() => vi.unstubAllEnvs());

describe.skipIf(!databaseUrl)("analytics against PostgreSQL", () => {
  it("reconciles scoped chat averages and counts eligible signed-in actions across features", async () => {
    vi.stubEnv("ANALYTICS_CHAT_COVERAGE_FROM", "2099-03-01T00:00:00Z");
    const window = getReportingWindow(30, "2099-03-29", new Date("2099-04-01T12:00:00Z"));
    const registered = new Date("2099-03-01T12:00:00Z");
    const registrations = ["inside", "outside", "never", "guest-only"].map(id => ({ id, registeredAt: registered }));
    registrations.push({ id: "pending", registeredAt: new Date("2099-03-28T12:00:00Z") },
      { id: "uncovered", registeredAt: new Date("2099-02-28T12:00:00Z") });
    const pool = new Pool({ connectionString: databaseUrl });
    const db = new PrismaClient({ adapter: new PrismaPg(pool) });
    const rollback = new Error("synthetic metrics fixture complete");
    try {
      await expect(db.$transaction(async tx => {
        await tx.$executeRaw`INSERT INTO "ChatAnalyticsEvent" ("chatId", "operationId", kind, channel, "actorKind", "accountId", "occurredAt") VALUES
          ('returning','create','created','web','guest',NULL,'2099-02-27T12:00:00'),
          ('returning','old','submission','web','guest',NULL,'2099-02-27T12:01:00'),
          ('returning','old','reply','web','guest',NULL,'2099-03-01T11:00:00'),
          ('returning','guest-turn','submission','web','guest',NULL,'2099-03-01T11:59:59'),
          ('returning','guest-turn','reply','web','guest',NULL,'2099-03-01T12:00:01'),
          ('returning','after-transfer','submission','public_api','account','outside','2099-03-08T12:00:00'),
          ('new','create','created','web','account','inside','2099-03-08T11:59:59'),
          ('new','turn','submission','web','account','inside','2099-03-08T11:59:59.999'),
          ('reply-only','lagged','reply','web','guest',NULL,'2099-03-08T12:00:00'),
          ('late','after','submission','mcp','integration',NULL,'2099-03-30T05:00:00')`;
        for (const [id, saved, entryType] of [
          ["inside", "2099-03-29T06:01:00Z", "PERSONAL"], ["pending", "2099-03-29T05:00:00Z", "DISCIPLESHIP"],
          ["older", "2099-03-23T04:59:59.999Z", "PERSONAL"],
        ] as const) {
          const author = await tx.userProfile.create({ data: { appwriteUserId: id, displayName: "Synthetic account" } });
          const entry = await tx.journalEntry.create({ data: {
            authorProfileId: author.id, createdAt: new Date(saved), entryDate: new Date("2000-01-01Z"), entryText: "Fixture", entryType,
          } });
          await tx.journalEntry.delete({ where: { id: entry.id } });
        }
        const preacher = await tx.sermonPreacher.create({ data: { ownerId: "inside", displayName: "Fixture", normalizedName: "fixture" } });
        const fingerprint = await tx.sermonAudioFingerprint.create({ data: { ownerId: "inside", sha256: "a".repeat(64) } });
        await tx.sermonEvaluation.create({ data: {
          ownerId: "inside", title: "Fixture", preachedOn: registered, preset: "STANDARD", requestedRuns: 1,
          createdAt: new Date("2099-03-29T04:59:59.999Z"), preacherId: preacher.id, fingerprintId: fingerprint.id,
        } });
        const report = await getAnalyticsMetrics(window, registrations, tx);
        expect(report.hero.newChats).toEqual({ current: 1, previous: 1 });
        expect(report.hero.userMessages).toEqual({ current: 3, previous: 1 });
        expect(report.hero.averageMessages.current).toBe(2.5);
        expect(report.guest).toEqual({ newChats: 0, userMessages: 1, activeChats: 1, averageMessages: 3 });
        expect(report.channels.find(row => row.channel === "public_api")?.averageMessages).toBe(1);
        expect(report.channels.find(row => row.channel === "mcp")?.activeChats).toBe(0);
        expect(report.growth.at(-1)).toEqual({ day: window.endDay, newChats: 1, userMessages: 3, newAccounts: 6 });
        expect(report.active).toEqual({ daily: 2, weekly: 2, monthly: 4 });
        expect(report.activation).toEqual({ eligible: 4, activated: 1, pending: 1, uncovered: 1, rate: 0.25,
          firstEligibleDay: "2099-03-01", lastEligibleDay: "2099-03-01" });
        expect(JSON.stringify(report)).not.toContain("guest-turn");
        throw rollback;
      })).rejects.toBe(rollback);
    } finally {
      await db.$disconnect();
      await pool.end();
    }
  });
});
