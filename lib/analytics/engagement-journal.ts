import type { Prisma } from "@prisma/client";

// Suggestions and chat can be used while a partial result is on screen. Keep
// the first action after readiness, so an earlier click cannot mask a later one.
export function recordJournalFollowOn(
  tx: Prisma.TransactionClient,
  feature: "personal_journal" | "heritage_journal",
  step: "continued_chat" | "prayer_saved",
  entryId: string,
) {
  return tx.$executeRaw`
    INSERT INTO "AnalyticsEngagementEvent" (feature, step, channel, "flowId")
    SELECT feature, ${step}, channel, "flowId" FROM "AnalyticsEngagementEvent"
    WHERE feature = ${feature} AND step = 'reflection_ready' AND channel = 'web' AND "flowId" = ${entryId}
    ON CONFLICT DO NOTHING
  `;
}
