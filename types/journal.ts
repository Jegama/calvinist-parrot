export type Call1aOutput = {
    title: string;
    oneSentenceSummary: string;
    situationSummary: string;
};

export type Call1bOutput = {
    heartReflection: string[];
    putOffPutOn: { putOff: string; putOn: string }[];
};

export type Call1cOutput = {
    scripture: { reference: string; whyItApplies: string }[];
    practicalNextSteps: string[];
    safetyFlags: string[];
};

// ===========================================
// Combined Call 1 Output Type (for storage and display)
// ===========================================

export type Call1Output = Call1aOutput & Call1bOutput & Call1cOutput;

// Partial type for progressive loading
export type PartialCall1Output = {
    title?: string;
    oneSentenceSummary?: string;
    situationSummary?: string;
    heartReflection?: string[];
    putOffPutOn?: { putOff: string; putOn: string }[];
    scripture?: { reference: string; whyItApplies: string }[];
    practicalNextSteps?: string[];
    safetyFlags?: string[];
};

// TypeScript type for Call 2 output
export type Call2Output = {
    tags: {
        circumstance: string[];
        heartIssue: string[];
        rulingDesire: string[];
        virtue: string[];
        theologicalTheme: string[];
        meansOfGrace: string[];
    };
    suggestedPrayerRequests: {
        title: string;
        notes: string;
        linkedScripture: string | null;
    }[];
    dashboardSignals: {
        recurringTheme: string | null;
    };
};

export type JournalGenerationStage = "call1a" | "call1b" | "call1c" | "call2";

export type JournalGenerationStatus =
    | "pending"
    | "complete"
    | "partial"
    | "failed";

type PersistedJournalAIOutput = {
    call1: unknown;
    call2: unknown;
    modelInfo: unknown;
} | null;

/**
 * Derive the durable generation state without requiring a schema migration.
 * The legacy `unknown` model marker indicates a stored fallback after a stage failed.
 */
export function getPersistedJournalGenerationStatus(
    aiOutput: PersistedJournalAIOutput
): Exclude<JournalGenerationStatus, "pending"> {
    if (!aiOutput) return "failed";
    if (!aiOutput.call1 || !aiOutput.call2) return "partial";

    if (typeof aiOutput.modelInfo !== "object" || aiOutput.modelInfo === null) {
        return "complete";
    }

    const modelInfo = aiOutput.modelInfo as Record<string, unknown>;
    if (
        modelInfo.status === "partial" ||
        (Array.isArray(modelInfo.failedStages) && modelInfo.failedStages.length > 0) ||
        modelInfo.call1bModel === "unknown" ||
        modelInfo.call1cModel === "unknown"
    ) {
        return "partial";
    }

    return "complete";
}
