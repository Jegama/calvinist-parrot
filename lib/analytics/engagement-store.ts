import type { Prisma } from "@prisma/client";
import type { ChatChannel } from "@/lib/chat-analytics";
import prisma from "@/lib/prisma";
import type { Feature } from "./web-analytics";

// Transactional callers commit the action and its receipt together. Standalone
// observations must never turn a successful product action into a user error.
export async function recordEngagement(
  feature: Feature, step: string, flowId: string, channel: ChatChannel = "web",
  transaction?: Pick<Prisma.TransactionClient, "$executeRaw">,
) {
  const write = (transaction ?? prisma).$executeRaw`
    INSERT INTO "AnalyticsEngagementEvent" (feature, step, "flowId", channel)
    VALUES (${feature}, ${step}, ${flowId}, ${channel}) ON CONFLICT DO NOTHING
  `;
  if (transaction) await write;
  else await write.catch(() => console.warn("Engagement receipt unavailable", feature, step));
}
