ALTER TABLE "chatMessage" ADD COLUMN "analyticsExcluded" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE "ChatAnalyticsEvent" (
    "chatId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('created', 'submission', 'reply')),
    channel TEXT NOT NULL CHECK (channel IN ('web', 'public_api', 'mcp', 'unknown')),
    "actorKind" TEXT NOT NULL CHECK ("actorKind" IN ('guest', 'account', 'integration', 'unknown')),
    "accountId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatAnalyticsEvent_pkey" PRIMARY KEY ("chatId", "operationId", kind),
    CHECK (("actorKind" = 'account') = ("accountId" IS NOT NULL))
);

-- The same bounded query reconciles retained transcripts after older servers
-- drain. Conflict handling preserves write-time attribution on every replay.
CREATE FUNCTION backfill_chat_analytics(start_at TIMESTAMP, end_at TIMESTAMP)
RETURNS void LANGUAGE sql AS $$
-- A current owner cannot identify the actor at the time of a historical event.
INSERT INTO "ChatAnalyticsEvent" ("chatId", "operationId", kind, channel, "actorKind", "occurredAt")
SELECT id, encode(sha256(convert_to(id, 'UTF8') || decode('00', 'hex') || convert_to(coalesce("creationRequestId", id), 'UTF8')), 'hex'),
       'created', 'unknown', 'unknown', "createdAt"
FROM "chatHistory" WHERE "createdAt" >= start_at AND "createdAt" < end_at
ON CONFLICT DO NOTHING;

-- Branch copies retain their original event times and request IDs. Drop rows
-- predating their chat, and copies also present in an earlier chat (including
-- possible application/DB clock skew). Only an imported pair or a journal
-- reflection seed is written as both messages in the creation transaction.
WITH candidates AS (
    SELECT m.id, m."chatId", m."requestId", m.timestamp, h."createdAt",
           h.category, h.subcategory, h.issue_type, h."creationRequestId", m.sender,
           CASE WHEN m.sender = 'user' THEN 'submission' ELSE 'reply' END AS kind,
           min(h."createdAt") OVER (
               PARTITION BY m."requestId", m.sender, m.timestamp, md5(m.content)
           ) AS earliest_chat
    FROM "chatMessage" m JOIN "chatHistory" h ON h.id = m."chatId"
    WHERE m.sender IN ('user', 'parrot', 'calvin') AND NOT m."analyticsExcluded"
      AND m.timestamp >= start_at AND m.timestamp < end_at
), original AS (
    SELECT *,
           row_number() OVER (PARTITION BY "chatId", kind ORDER BY timestamp, id) AS ordinal,
           bool_or(sender = 'parrot' AND "requestId" = "creationRequestId" AND timestamp = "createdAt") OVER (PARTITION BY "chatId") AS seeded
    FROM candidates WHERE timestamp >= "createdAt" AND "createdAt" = earliest_chat
), historic AS (
    SELECT "chatId", encode(sha256(convert_to("chatId", 'UTF8') || decode('00', 'hex') || convert_to(coalesce("requestId", id), 'UTF8')), 'hex') AS operation,
           kind, timestamp
    FROM original
    WHERE NOT (coalesce(seeded, false) AND timestamp = "createdAt")
      AND NOT (category = 'journal' AND subcategory = 'reflection' AND issue_type = 'personal'
               AND "requestId" IS NULL AND ordinal = 1 AND "createdAt" >= start_at)
)
INSERT INTO "ChatAnalyticsEvent" ("chatId", "operationId", kind, channel, "actorKind", "accountId", "occurredAt")
SELECT h."chatId", h.operation, h.kind, coalesce(s.channel, 'unknown'), coalesce(s."actorKind", 'unknown'),
       s."accountId", min(h.timestamp)
FROM historic h LEFT JOIN "ChatAnalyticsEvent" s
  ON h.kind = 'reply' AND s.kind = 'submission' AND s."chatId" = h."chatId" AND s."operationId" = h.operation
GROUP BY h."chatId", h.operation, h.kind, s.channel, s."actorKind", s."accountId"
ON CONFLICT DO NOTHING;

$$;

SELECT backfill_chat_analytics('-infinity', 'infinity');

CREATE INDEX "ChatAnalyticsEvent_occurredAt_kind_idx" ON "ChatAnalyticsEvent" ("occurredAt", kind);
