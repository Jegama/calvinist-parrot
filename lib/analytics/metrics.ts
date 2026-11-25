import { Prisma } from "@prisma/client";
import type { AccountRegistration } from "./registrations";
import { reportingDay, reportingTimeZone, shiftDay, type ReportingWindow } from "./period";

type ReportDatabase = Pick<Prisma.TransactionClient, "$queryRaw">;
const channels = ["combined", "web", "public_api", "mcp", "unknown"] as const;
type Channel = typeof channels[number];
type Scope = Channel | "web_guest" | "integration";
type CountRow = {
  scope: Scope; selected: boolean; day: string | null;
  newChats: number; userMessages: number; activeChats: number; visibleReplies: number;
};
type AccountActivity = { accountId: string; latest: Date; activated: boolean };
const weekMs = 7 * 24 * 60 * 60 * 1000;
const actionMigration = "20261124020000_analytics_account_actions";

// The application's Prisma DateTime columns store UTC wall time (TIMESTAMP).
function utc(instant: Date) {
  return Prisma.sql`(${instant.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

async function getChatCounts(db: ReportDatabase, window: ReportingWindow) {
  return db.$queryRaw<CountRow[]>`
    WITH events AS (
      SELECT "chatId", kind, channel, "actorKind", "occurredAt" >= ${utc(window.start)} AS selected,
             to_char("occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE ${reportingTimeZone}, 'YYYY-MM-DD') AS day
      FROM "ChatAnalyticsEvent" WHERE "occurredAt" >= ${utc(window.previousStart)} AND "occurredAt" < ${utc(window.end)}
    ), per_chat AS (
      SELECT selected, scope, "chatId", count(*) FILTER (WHERE kind = 'created') AS created,
             count(*) FILTER (WHERE kind = 'submission') AS submissions, count(*) FILTER (WHERE kind = 'reply') AS replies
      FROM events CROSS JOIN LATERAL (VALUES ('combined'), (channel),
        (CASE WHEN channel = 'web' AND "actorKind" = 'guest' THEN 'web_guest' END),
        (CASE WHEN "actorKind" = 'integration' THEN 'integration' END)) AS scopes(scope)
      WHERE scope IS NOT NULL GROUP BY selected, scope, "chatId"
    )
    SELECT scope, selected, NULL::text AS day, sum(created)::int AS "newChats", sum(submissions)::int AS "userMessages",
           count(*) FILTER (WHERE submissions > 0)::int AS "activeChats",
           coalesce(sum(replies) FILTER (WHERE submissions > 0), 0)::int AS "visibleReplies"
    FROM per_chat GROUP BY scope, selected
    UNION ALL
    SELECT 'combined', true, day, count(*) FILTER (WHERE kind = 'created')::int,
           count(*) FILTER (WHERE kind = 'submission')::int, 0, 0
    FROM events WHERE selected GROUP BY day`;
}

function getAccountActivity(db: ReportDatabase, window: ReportingWindow, cohort: AccountRegistration[], source: "chat" | "other") {
  const actions = source === "chat"
    ? Prisma.sql`SELECT "accountId", "occurredAt" FROM "ChatAnalyticsEvent"
                 WHERE kind = 'submission' AND "actorKind" = 'account'`
    : Prisma.sql`SELECT "accountId", "occurredAt" FROM "AnalyticsAccountAction" WHERE TRUE`;
  const signups = cohort.map(({ id, registeredAt }) => ({ id, registered: registeredAt.toISOString() }));
  const since = cohort.reduce((earliest, account) =>
    account.registeredAt < earliest ? account.registeredAt : earliest, window.activeStarts.monthly);
  // Return at most one row per account/source. Only aggregate counts leave
  // this module. Use exact instants for activation even on DST boundaries.
  return db.$queryRaw<AccountActivity[]>`
    WITH cohort AS (
      SELECT id, registered AT TIME ZONE 'UTC' AS since
      FROM jsonb_to_recordset(${JSON.stringify(signups)}::jsonb) AS r(id text, registered timestamptz)
    ), actions AS (
      ${actions} AND "occurredAt" >= ${utc(since)} AND "occurredAt" < ${utc(window.end)}
    )
    SELECT "accountId", max("occurredAt") AT TIME ZONE 'UTC' AS latest,
           coalesce(bool_or("occurredAt" >= since AND "occurredAt" < since + interval '168 hours'), false) AS activated
    FROM actions LEFT JOIN cohort ON id = "accountId" GROUP BY "accountId"`;
}

async function durableCoverage(db: ReportDatabase): Promise<Date | null> {
  const rows = await db.$queryRaw<{ start: Date | null }[]>`
    SELECT min(finished_at) AS start FROM "_prisma_migrations"
    WHERE migration_name = ${actionMigration} AND rolled_back_at IS NULL`;
  return rows[0]?.start ?? null;
}

function configuredCoverage(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function volume(rows: CountRow[] | null, scope: Scope, selected = true) {
  const row = rows?.find(item => item.scope === scope && item.selected === selected && item.day === null);
  return {
    newChats: rows ? row?.newChats ?? 0 : null,
    userMessages: rows ? row?.userMessages ?? 0 : null,
    activeChats: rows ? row?.activeChats ?? 0 : null,
    averageMessages: row?.activeChats ? (row.userMessages + row.visibleReplies) / row.activeChats : null,
  };
}

async function available<T>(read: () => Promise<T>): Promise<T | null> {
  try { return await read(); } catch { return null; }
}

export async function getAnalyticsMetrics(window: ReportingWindow, registrations: AccountRegistration[] | null, database?: ReportDatabase) {
  const db = database ?? (await available(() => import("@/lib/prisma")))?.default;
  const accounts = registrations && [...new Map(registrations.map(account => [account.id, account])).values()];
  const inCurrent = accounts?.filter(a => a.registeredAt >= window.start && a.registeredAt < window.end) ?? null;
  const inPrevious = accounts?.filter(a => a.registeredAt >= window.previousStart && a.registeredAt < window.start) ?? null;
  const [chat, receiptsFrom] = db ? await Promise.all([
    available(() => getChatCounts(db, window)), available(() => durableCoverage(db)),
  ]) : [null, null];
  const chatFrom = configuredCoverage(process.env.ANALYTICS_CHAT_COVERAGE_FROM);
  const coverageFrom = chatFrom && receiptsFrom ? new Date(Math.max(+chatFrom, +receiptsFrom)) : null;
  const mature = inCurrent?.filter(a => +a.registeredAt + weekMs <= +window.end) ?? null;
  const eligible = coverageFrom && mature ? mature.filter(a => a.registeredAt >= coverageFrom) : null;
  const [chatActivity, otherActivity] = db ? await Promise.all([
    available(() => getAccountActivity(db, window, eligible ?? [], "chat")),
    available(() => getAccountActivity(db, window, eligible ?? [], "other")),
  ]) : [null, null];
  const activity = [...(chatActivity ?? []), ...(otherActivity ?? [])];
  function distinctSince(since: Date) {
    if (!chatActivity && !otherActivity) return null;
    return new Set(activity.filter(row => row.latest >= since).map(row => row.accountId)).size;
  }
  const activated = eligible && chatActivity && otherActivity
    ? new Set(activity.filter(row => row.activated).map(row => row.accountId)).size : null;
  const eligibleDays = eligible?.map(a => reportingDay(a.registeredAt)).sort();
  const current = volume(chat, "combined");
  const previous = volume(chat, "combined", false);
  const allTime = window.days === "all";
  const comparison = (key: keyof typeof current) => ({ current: current[key], previous: allTime ? null : previous[key] });
  let newChats = 0, userMessages = 0, newAccounts = 0;
  const accountsByDay = new Map<string, number>();
  for (const account of inCurrent ?? []) {
    const day = reportingDay(account.registeredAt);
    accountsByDay.set(day, (accountsByDay.get(day) ?? 0) + 1);
  }
  const chatByDay = new Map(chat?.filter(row => row.day !== null).map(row => [row.day, row]));
  let firstGrowthDay = window.startDay;
  if (allTime) {
    firstGrowthDay = window.endDay;
    for (const day of accountsByDay.keys()) if (day < firstGrowthDay) firstGrowthDay = day;
    for (const day of chatByDay.keys()) if (day && day < firstGrowthDay) firstGrowthDay = day;
  }
  const growth = [];
  for (let day = firstGrowthDay; day <= window.endDay; day = shiftDay(day, 1)) {
    const row = chatByDay.get(day);
    newChats += row?.newChats ?? 0;
    userMessages += row?.userMessages ?? 0;
    newAccounts += accountsByDay.get(day) ?? 0;
    growth.push({ day, newChats: chat ? newChats : null, userMessages: chat ? userMessages : null, newAccounts: inCurrent ? newAccounts : null });
  }
  const notes: string[] = [];
  if (accounts) {
    notes.push("Registration counts use the registration time of accounts present in Appwrite when this report was generated. Deleted accounts are outside this source’s coverage.");
  } else {
    notes.push("Appwrite registrations are unavailable. Account growth and activation could not be calculated.");
  }
  if (!chat) notes.push("Chat event counts are unavailable.");
  if (!chatFrom || chatFrom > window.previousStart || chatFrom > window.activeStarts.monthly) {
    notes.push("Before reliable chat coverage, combined counts include only events recoverable from retained transcripts. Unknown actors also make website guest and active-account counts partial for those dates.");
  }
  if (!receiptsFrom || receiptsFrom > window.activeStarts.monthly) notes.push("Journal and sermon activity before durable collection includes only retained records with a known account.");
  if (!chatActivity || !otherActivity) notes.push("Some signed-in action data is unavailable. Active counts reflect available sources and activation is unavailable.");
  if (!coverageFrom) notes.push("The start of full action coverage is unconfirmed. Seven-day activation is unavailable.");
  return {
    hero: { newChats: comparison("newChats"), userMessages: comparison("userMessages"),
      newAccounts: { current: inCurrent?.length ?? null, previous: allTime ? null : inPrevious?.length ?? null }, averageMessages: comparison("averageMessages") },
    growth, channels: channels.map(channel => ({ channel, ...volume(chat, channel) })), guest: volume(chat, "web_guest"),
    integrations: volume(chat, "integration"),
    active: { daily: distinctSince(window.activeStarts.daily), weekly: distinctSince(window.activeStarts.weekly), monthly: distinctSince(window.activeStarts.monthly) },
    activation: { eligible: eligible?.length ?? null, activated, pending: mature && inCurrent ? inCurrent.length - mature.length : null,
      uncovered: mature && eligible ? mature.length - eligible.length : null, rate: activated !== null && eligible?.length ? activated / eligible.length : null,
      firstEligibleDay: eligibleDays?.[0] ?? null, lastEligibleDay: eligibleDays?.at(-1) ?? null },
    coverage: {
      chat: chatFrom?.toISOString() ?? null, journal: receiptsFrom?.toISOString() ?? null, sermon: receiptsFrom?.toISOString() ?? null,
      partialChatComparison: !chatFrom || chatFrom > window.previousStart,
      partialChannels: !chat || !chatFrom || chatFrom > window.start || chat.some(row => row.selected && row.scope === "unknown"),
      partialActive: !chatActivity || !otherActivity || !coverageFrom || coverageFrom > window.activeStarts.monthly,
    }, notes,
  };
}
