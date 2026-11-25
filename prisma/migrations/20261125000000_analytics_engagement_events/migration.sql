-- One receipt per observed step of a view or first-party operation. The original
-- observation time survives refreshes, retries, and subsequent report windows.
CREATE TABLE "AnalyticsEngagementEvent" (
    feature TEXT NOT NULL,
    step TEXT NOT NULL,
    "flowId" VARCHAR(128) NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('web', 'public_api', 'mcp', 'unknown')),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (feature, step, channel, "flowId")
);
CREATE INDEX "AnalyticsEngagementEvent_occurredAt_idx" ON "AnalyticsEngagementEvent" ("occurredAt");
