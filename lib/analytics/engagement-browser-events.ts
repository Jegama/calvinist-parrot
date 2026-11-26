// Only these UI observations can enter through the anonymous website endpoint.
// Successful writes, channel attribution and timestamps are server-controlled.
export const browserSteps = {
  church: ["results_viewed", "detail_opened"],
  daily_devotional: ["reading_opened", "reading_engaged"],
  prayer: ["rotation_shown"],
} as const;

export type BrowserFeature = keyof typeof browserSteps;
export type BrowserStep<F extends BrowserFeature> = typeof browserSteps[F][number];
