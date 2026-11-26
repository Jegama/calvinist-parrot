CREATE TABLE "McpQuotaBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ NOT NULL,
    "used" INTEGER NOT NULL CHECK ("used" >= 0),
    PRIMARY KEY ("key", "windowStart")
);

CREATE INDEX "McpQuotaBucket_windowStart_idx" ON "McpQuotaBucket" ("windowStart");
