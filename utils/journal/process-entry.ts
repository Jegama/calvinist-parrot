import type { PersistedJournalAIOutput } from "@/types/journal";
import {
  readJournalStages,
  runCall1a,
  runCall1b,
  runCall1c,
  runTagsAndSuggestions,
  storeJournalAIOutput,
  type RecentEntryContext,
} from "./llm";

type SendEvent = (event: object) => void;

export async function processJournalEntry(
  entry: { id: string; entryText: string; aiOutput?: PersistedJournalAIOutput },
  recentContext: RecentEntryContext,
  sendEvent: SendEvent,
) {
  let { call1a, ...saved } = readJournalStages(entry.aiOutput ?? null);
  const input = { operationId: entry.id, entryText: entry.entryText };
  if (!call1a) {
    sendEvent({ type: "progress", stage: "call1a", message: "Understanding your entry..." });
    // All dependent prompts must use the same overview, including when two retries overlap.
    const checkpoint = await storeJournalAIOutput(entry.id, { call1a: await runCall1a(input) });
    ({ call1a, ...saved } = checkpoint.stages);
  }
  sendEvent({ type: "call1a_complete", call1a: call1a.output });

  sendEvent({
    type: "progress",
    stage: "parallel",
    message: entry.aiOutput ? "Completing your reflection..." : "Analyzing heart and gathering Scripture...",
  });
  const reflectionInput = { ...input, situationSummary: call1a.output.situationSummary, recentContext };
  async function reportStage<T>(
    stage: "call1b" | "call1c" | "call2",
    generate: () => Promise<{ output: T; model?: string }>,
    errorMessage: string,
  ) {
    try {
      const result = await generate();
      sendEvent({ type: `${stage}_complete`, [stage]: result.output });
      return result;
    } catch {
      sendEvent({ type: `${stage}_error`, message: errorMessage });
      return undefined;
    }
  }

  const [call1b, call1c, call2] = await Promise.all([
    reportStage("call1b", async () => saved.call1b ?? runCall1b(reflectionInput), "Heart analysis unavailable"),
    reportStage("call1c", async () => saved.call1c ?? runCall1c(reflectionInput), "Biblical guidance unavailable"),
    reportStage("call2", async () => saved.call2 ?? runTagsAndSuggestions({
      ...input, call1Summary: call1a.output.oneSentenceSummary,
    }), "Tags and prayer suggestions unavailable"),
  ]);

  const stored = await storeJournalAIOutput(entry.id, { call1a, call1b, call1c, call2 });
  sendEvent({
    type: "done",
    call1: stored.call1,
    call2: stored.call2,
    ...(stored.failedStages.length > 0 && { partial: true, failedStages: stored.failedStages }),
  });
}
