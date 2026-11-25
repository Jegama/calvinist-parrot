import { randomUUID } from "node:crypto";
import type { ChatChannel } from "@/lib/chat-analytics";
import type { UsageContext } from "@/lib/provider-usage";

export type ChurchEvaluationOperation = {
  operationId: string;
  channel: ChatChannel;
  expectedUsageAttempts: number;
};

export function newChurchEvaluationOperation(channel: ChatChannel): ChurchEvaluationOperation {
  return { operationId: randomUUID(), channel, expectedUsageAttempts: 0 };
}

// Count each initiated call, including optional enrichment. This independent
// completion count makes a missing usage write visible in the dashboard.
export function churchUsageStage(operation: ChurchEvaluationOperation, stage: string): UsageContext {
  operation.expectedUsageAttempts += 1;
  return { feature: "church", operationId: operation.operationId, channel: operation.channel, stage };
}
