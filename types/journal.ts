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

function isLegacyCall2Fallback(call2: unknown): boolean {
    if (typeof call2 !== "object" || call2 === null) return false;

    const value = call2 as Record<string, unknown>;
    if (typeof value.tags !== "object" || value.tags === null) return false;
    if (
        typeof value.dashboardSignals !== "object" ||
        value.dashboardSignals === null
    ) {
        return false;
    }

    const tags = value.tags as Record<string, unknown>;
    const dashboardSignals = value.dashboardSignals as Record<string, unknown>;
    const fallbackTagGroups = [
        "circumstance",
        "heartIssue",
        "rulingDesire",
        "virtue",
        "theologicalTheme",
        "meansOfGrace",
    ];

    return (
        fallbackTagGroups.every(
            (group) => Array.isArray(tags[group]) && tags[group].length === 0
        ) &&
        Array.isArray(value.suggestedPrayerRequests) &&
        value.suggestedPrayerRequests.length === 0 &&
        dashboardSignals.recurringTheme === null
    );
}

/**
 * Derive the durable generation state without requiring a schema migration.
 * Legacy `unknown` model markers and the empty Call 2 fallback indicate that a
 * stage failed before durable status metadata was added.
 */
export function getPersistedJournalGenerationStatus(
    aiOutput: PersistedJournalAIOutput
): Exclude<JournalGenerationStatus, "pending"> {
    if (!aiOutput) return "failed";
    if (!aiOutput.call1 || !aiOutput.call2) return "partial";

    if (typeof aiOutput.modelInfo !== "object" || aiOutput.modelInfo === null) {
        return isLegacyCall2Fallback(aiOutput.call2) ? "partial" : "complete";
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

    // Before durable status metadata was added, a failed Call 2 was stored as
    // the empty fallback object. Keep those entries retryable, while honoring
    // an explicit complete status for newer successfully generated entries.
    if (
        modelInfo.status !== "complete" &&
        isLegacyCall2Fallback(aiOutput.call2)
    ) {
        return "partial";
    }

    return "complete";
}
