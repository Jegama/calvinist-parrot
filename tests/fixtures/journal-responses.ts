// Synthetic provider responses used to exercise the production JSON schemas.
const verses = [
  { reference: "James 1:19", whyItApplies: "Listen patiently before answering." },
  { reference: "Ephesians 4:32", whyItApplies: "Christ's kindness shapes how we treat others." },
];
const prayer = { title: "Listen with patience", notes: "Pray for patience in conversation.", linkedScripture: "James 1:19" };

export const journalResponses = {
  title: {
    title: "Listening with patience",
    oneSentenceSummary: "I want to listen patiently.",
    situationSummary: "An interruption made listening difficult today.",
  },
  heartReflection: {
    heartReflection: ["Was I in a hurry?", "Did I want my own way?"],
    putOffPutOn: [{ putOff: "Interrupting", putOn: "Listening" }],
  },
  scripture: { scripture: verses, practicalNextSteps: ["Listen before answering."], safetyFlags: [] },
  summary: {
    summary: "A parent practiced listening with a child.",
    whatMightBeGoingOnInTheHeart: ["Perhaps the child felt unheard.", "Maybe waiting was hard."],
    gospelConnectionSuggestion: {
      ageAppropriatePhrase: "Jesus is kind to us.",
      scriptureToShare: "Ephesians 4:32",
      explanation: "His kindness helps us be kind.",
    },
    parentShepherdingNextSteps: ["Listen first.", "Practice taking turns."],
    recommendedResources: [{ title: "Shepherding a Child's Heart", author: "Tedd Tripp", whyItFits: "It addresses patient shepherding." }],
    scripture: verses,
    encouragementForParent: "Keep listening patiently.",
    safetyFlags: [],
  },
  suggestedPrayerRequests: {
    tags: { circumstance: ["Friendship"], heartIssue: [], rulingDesire: [], virtue: ["Patience"], theologicalTheme: [], meansOfGrace: [] },
    suggestedPrayerRequests: [prayer],
    dashboardSignals: { recurringTheme: null },
  },
  suggestedChildPrayerRequests: {
    tags: { circumstance: ["Parenting"], heartIssue: [], virtue: ["Patience"], developmentalArea: ["Social skills"] },
    suggestedChildPrayerRequests: [prayer, { ...prayer, title: "Practice gentle speech" }],
    suggestedMonthlyVisionAdjustments: [],
    parentConsistencyNote: null,
  },
};
