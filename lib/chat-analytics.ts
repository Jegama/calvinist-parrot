import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { ChatActor } from "@/lib/guest";

export type ChatChannel = "web" | "public_api" | "mcp" | "unknown";

// Keep a single opaque turn ID across the creation, auto-trigger, retries and
// persisted reply, even when the caller supplied its own request ID.
export function chatOperationId(chatId: string, requestId: string) {
  // PostgreSQL text cannot contain NUL, making the two-part input unambiguous.
  return createHash("sha256").update(chatId).update("\0").update(requestId).digest("hex");
}

export function derivedCreationRequestId(kind: "journal" | "branch", ...parts: string[]) {
  return `${kind}:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}

export async function recordChatEvents(
  tx: Prisma.TransactionClient,
  chatId: string,
  requestId: string,
  channel: ChatChannel,
  actor: ChatActor,
  kinds: Array<"created" | "submission">,
) {
  const operationId = chatOperationId(chatId, requestId);
  const actorKind = { authenticated: "account", guest: "guest", external: "integration" }[actor.kind];
  await tx.chatAnalyticsEvent.createMany({
    data: kinds.map(kind => ({
      chatId, operationId, kind, channel, actorKind,
      accountId: actor.kind === "authenticated" ? actor.userId : null,
    })),
    skipDuplicates: true,
  });
}

export async function recordChatReply(tx: Prisma.TransactionClient, chatId: string, requestId: string) {
  const operationId = chatOperationId(chatId, requestId);
  // A retry can arrive through a different channel or after a guest signs in.
  // Copy the submission's attribution. A copied/seeded row has no submission.
  await tx.$executeRaw`
    INSERT INTO "ChatAnalyticsEvent" ("chatId", "operationId", kind, channel, "actorKind", "accountId")
    SELECT "chatId", "operationId", 'reply', channel, "actorKind", "accountId"
    FROM "ChatAnalyticsEvent"
    WHERE "chatId" = ${chatId} AND "operationId" = ${operationId} AND kind = 'submission'
    ON CONFLICT DO NOTHING
  `;
}
