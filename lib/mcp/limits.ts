import { createHash } from "node:crypto";

const callerLimits = {
  directory: { seconds: 60, maximum: 60 },
  guest_chat: { seconds: 3600, maximum: 3 },
  account_chat: { seconds: 60, maximum: 12 },
};

export class McpLimitError extends Error {
  constructor(message: string, readonly status: 429 | 503) {
    super(message);
  }
}

// Charge a fixed window using the database clock. Concurrent instances contend
// on one row. A rejected increment changes nothing, even for the last unit.
async function debit(key: string, seconds: number, units: number, maximum: number) {
  if (units > maximum) return false;
  try {
    const { default: db } = await import("@/lib/prisma");
    const changed = await db.$executeRaw`
      WITH expired AS (
        SELECT "key", "windowStart" FROM "McpQuotaBucket"
        WHERE "windowStart" < statement_timestamp() - interval '2 days'
        ORDER BY "windowStart" LIMIT 16 FOR UPDATE SKIP LOCKED
      ), pruned AS (
        DELETE FROM "McpQuotaBucket" USING expired
        WHERE "McpQuotaBucket"."key" = expired."key"
          AND "McpQuotaBucket"."windowStart" = expired."windowStart"
      )
      INSERT INTO "McpQuotaBucket" ("key", "windowStart", "used")
      VALUES (${key}, date_bin(${seconds}::int * interval '1 second',
              statement_timestamp(), TIMESTAMPTZ '2000-01-01 00:00:00+00'), ${units})
      ON CONFLICT ("key", "windowStart") DO UPDATE
      SET "used" = "McpQuotaBucket"."used" + EXCLUDED."used"
      WHERE "McpQuotaBucket"."used" <= ${maximum - units}`;
    return changed === 1;
  } catch {
    throw new McpLimitError("MCP quotas are temporarily unavailable.", 503);
  }
}

export async function consumeMcpCallerLimit(
  callerKey: string,
  kind: keyof typeof callerLimits,
) {
  const { maximum, seconds } = callerLimits[kind];
  // Do not retain account identifiers or network addresses in quota records.
  const digest = createHash("sha256").update(callerKey).digest("hex");
  if (!await debit(`caller:${kind}:${digest}`, seconds, 1, maximum)) {
    throw new McpLimitError("Caller rate limit reached. Try again later.", 429);
  }
}

// Haiku 5.5 has a 1M context. At the long-context standard tier even the
// highest-priced input (1h cache write) costs at most $1/MTok, and output
// including thinking costs $2.50/MTok. 1M input + 16,384 output <= $1.041.
// https://platform.claude.com/docs/en/models/haiku-5-5/overview
export const MCP_GUEST_MODEL = "claude-haiku-5-5";
export const MCP_GUEST_MAX_OUTPUT = 16_384;
const guestAttemptCents = 105;

export async function reserveGuestModelAttempt() {
  const value = process.env.MCP_GUEST_DAILY_BUDGET_CENTS ?? "0";
  const maximum = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(maximum) || maximum > 2_147_483_647) {
    throw new McpLimitError("The guest budget is unavailable.", 503);
  }
  // Never refund an uncertain provider attempt, including timeouts and crashes.
  // This is a conservative allowance distinct from the actual #98 usage receipts.
  if (!await debit("guest:provider-cents", 86_400, guestAttemptCents, maximum)) {
    throw new McpLimitError("Guest model quota exhausted. Try again after the UTC day resets.", 429);
  }
}
