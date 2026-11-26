import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { consumeMcpCallerLimit, reserveGuestModelAttempt } from "@/lib/mcp/limits";

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") config();
const databaseUrl = process.env.CI ? process.env.DATABASE_URL :
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? process.env.TEST_DATABASE_URL : undefined;
let db: PrismaClient;


describe.skipIf(!databaseUrl)("MCP shared caller quotas", () => {
  // The spend key is intentionally shared by everyone. Isolate this suite's
  // connection search path so concurrent suites and reruns keep their own day.
  const schema = `mcp_quota_${randomUUID().replaceAll("-", "")}`;
  let setup: PrismaClient;
  beforeAll(async () => {
    setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await setup.$executeRaw`CREATE SCHEMA ${Prisma.raw(schema)}`;
    await setup.$executeRaw`CREATE TABLE ${Prisma.raw(schema)}."McpQuotaBucket" (LIKE public."McpQuotaBucket" INCLUDING ALL)`;
    const connection = new URL(databaseUrl!);
    connection.searchParams.set("options", `-c search_path=${schema}`);
    vi.stubEnv("DATABASE_URL", connection.toString());
    db = (await import("@/lib/prisma")).default;
  });
  afterAll(async () => {
    await db?.$disconnect();
    await setup.$executeRaw`DROP SCHEMA ${Prisma.raw(schema)} CASCADE`;
    await setup.$disconnect();
    vi.unstubAllEnvs();
  });

  it.each([
    { kind: "guest_chat", maximum: 10 },
    { kind: "account_chat", maximum: 20 },
  ] as const)("admits $maximum concurrent $kind requests per caller", async ({ kind, maximum }) => {
    const caller = randomUUID();
    const burst = await Promise.allSettled(Array.from({ length: maximum + 2 }, () => consumeMcpCallerLimit(caller, kind)));
    expect(burst.filter(result => result.status === "fulfilled")).toHaveLength(maximum);
    for (const result of burst) {
      if (result.status === "rejected") expect(result.reason).toMatchObject({ status: 429 });
    }
    await expect(consumeMcpCallerLimit(caller, "directory")).resolves.toBeUndefined();
    await expect(consumeMcpCallerLimit(randomUUID(), kind)).resolves.toBeUndefined();
  });

  it("debits one daily budget across concurrent attempts and retains the unused remainder", async () => {
    vi.stubEnv("MCP_GUEST_DAILY_BUDGET_CENTS", "225");
    try {
      const burst = await Promise.allSettled(Array.from({ length: 8 }, () => reserveGuestModelAttempt()));
      expect(burst.filter(result => result.status === "fulfilled")).toHaveLength(2);
      for (const result of burst) {
        if (result.status === "rejected") expect(result.reason).toMatchObject({ status: 429 });
      }
      const rows = await db.$queryRaw<{ used: number }[]>`SELECT "used" FROM "McpQuotaBucket" WHERE "key" = 'guest:provider-cents'`;
      expect(rows).toEqual([{ used: 210 }]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
