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

export type PersistedJournalAIOutput = {
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

/** Historical rows used placeholder models and an empty Call 2 before failedStages existed. */
export function failedJournalStages(aiOutput: PersistedJournalAIOutput): Set<JournalGenerationStage> {
    const stages: JournalGenerationStage[] = ["call1a", "call1b", "call1c", "call2"];
    if (!aiOutput) return new Set(stages);

    const info = typeof aiOutput.modelInfo === "object" && aiOutput.modelInfo !== null
        ? aiOutput.modelInfo as Record<string, unknown> : {};
    const failed = new Set(stages.filter(stage =>
        Array.isArray(info.failedStages) && info.failedStages.includes(stage)
    ));
    if (!aiOutput.call1) {
        failed.add("call1a");
        failed.add("call1b");
        failed.add("call1c");
    }
    if (info.call1bModel === "unknown") failed.add("call1b");
    if (info.call1cModel === "unknown") failed.add("call1c");

    const hasStageStatus = Array.isArray(info.failedStages) || info.status === "complete";
    if (!aiOutput.call2 || (!hasStageStatus && isLegacyCall2Fallback(aiOutput.call2))) {
        failed.add("call2");
    }
    return failed;
}

export function getPersistedJournalGenerationStatus(
    aiOutput: PersistedJournalAIOutput
): Exclude<JournalGenerationStatus, "pending"> {
    if (!aiOutput) return "failed";
    const info = aiOutput.modelInfo;
    if (typeof info === "object" && info !== null && "status" in info && info.status === "partial") {
        return "partial";
    }
    return failedJournalStages(aiOutput).size ? "partial" : "complete";
}
