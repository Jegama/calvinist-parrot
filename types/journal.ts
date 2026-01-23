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
    searchKeywords: string[];
    dashboardSignals: {
        recurringTheme: string | null;
    };
};
