import { createHash } from "node:crypto";

const callerLimits = {
  directory: { seconds: 60, maximum: 60 },
  guest_chat: { seconds: 3600, maximum: 10 },
  account_chat: { seconds: 60, maximum: 20 },
};

const accountChatAccess = `Connect a Parrot account for up to ${callerLimits.account_chat.maximum} chat requests per minute per account.`;
export const mcpChatAccess = `Guests can send up to ${callerLimits.guest_chat.maximum} chat requests per hour per network. ${accountChatAccess}`;

export class McpLimitError extends Error {
  constructor(message: string, readonly status: 429 | 503) {
    super(message);
  }
}

// Charge a fixed window using the database clock. Concurrent instances contend
// on one row. A rejected increment changes nothing, even for the last unit.
async function countRequest(key: string, seconds: number, maximum: number) {
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
              statement_timestamp(), TIMESTAMPTZ '2000-01-01 00:00:00+00'), 1)
      ON CONFLICT ("key", "windowStart") DO UPDATE
      SET "used" = "McpQuotaBucket"."used" + 1
      WHERE "McpQuotaBucket"."used" < ${maximum}`;
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
  if (!await countRequest(`caller:${kind}:${digest}`, seconds, maximum)) {
    if (kind === "guest_chat") {
      throw new McpLimitError(`This network reached its hourly guest chat limit. Try again next hour. ${accountChatAccess}`, 429);
    }
    throw new McpLimitError("Caller rate limit reached. Try again later.", 429);
  }
}
