import { z } from "zod";
import { reportingTimeZone } from "./period";

export const featureNames = {
  chat: "Parrot Chat",
  personal_journal: "Personal Journal",
  heritage_journal: "Heritage Journal",
  daily_devotional: "Daily Devotional",
  prayer: "Prayer Tracker",
  church: "Church Finder",
  sermon: "Sermon Evaluator",
  family_worship: "Family Worship",
  evaluations: "Model Evaluations",
  documentation: "Documentation",
  account: "Account",
  about: "About and policies",
} as const;
export type Feature = keyof typeof featureNames;

const routes: Record<string, Feature> = {
  journal: "personal_journal",
  "kids-discipleship": "heritage_journal",
  devotional: "daily_devotional",
  "prayer-tracker": "prayer",
  "church-finder": "church",
  "sermon-evaluation": "sermon",
  "llm-evaluation-dashboard": "evaluations",
  "documentation-parrot-qa": "documentation",
  "documentation-parrot-chat": "documentation",
  login: "account", register: "account", profile: "account", auth: "account",
  "forgot-password": "account", "reset-password": "account",
  about: "about", "privacy-policy": "about", "doctrinal-statement": "about",
};

function featureForPath(pathname: string): Feature | undefined {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  if (path === "" && pathname.startsWith("/")) return "chat";
  if (!path.startsWith("/")) return undefined;
  const [, first, second] = path.split("/");
  if (first === "prayer-tracker" && second === "family-worship") return "family_worship";
  if (Object.hasOwn(routes, first)) return routes[first];
  // First-party chat URLs use UUIDs or Prisma CUIDs. Unrecognized URLs are never echoed.
  if (!second && /^(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|c[a-z0-9]{24})$/i.test(first)) {
    return "chat";
  }
}

const analyticsResponse = z.object({
  data: z.array(z.object({
    requestPath: z.string().nullish(),
    pageviews: z.number().int().nonnegative(),
  })),
  query: z.object({ since: z.string().optional(), until: z.string().optional() }).optional(),
});

export interface FeatureWindow { start: Date; end: Date }

export function chicagoTimestamp(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium", timeStyle: "short", timeZone: reportingTimeZone,
  }).format(date) + " CT";
}

export async function getPageviews({ start, end }: FeatureWindow) {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !projectId || !teamId) throw new Error("Analytics source unavailable");

  const url = new URL("https://api.vercel.com/v1/query/web-analytics/visits/aggregate");
  const until = new Date(end.getTime() - 1); // Vercel includes the upper bound.
  url.search = new URLSearchParams({
    teamId, projectId, since: start.toISOString(), until: until.toISOString(),
    by: "requestPath", filter: "environment eq 'production'", limit: "100",
  }).toString();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Analytics source unavailable");
  const { data, query } = analyticsResponse.parse(await response.json());
  const counts = new Map<Feature, number>();
  let overflow = 0;
  let unmapped = 0;
  for (const { requestPath, pageviews } of data) {
    if (!requestPath || /^(?:__)?others?(?:__)?$/i.test(requestPath)) {
      overflow += pageviews;
      continue;
    }
    const feature = featureForPath(requestPath);
    if (feature) counts.set(feature, (counts.get(feature) ?? 0) + pageviews);
    else unmapped += pageviews;
  }
  const notes = [`Production Web Analytics queried ${chicagoTimestamp(new Date())}.`];
  if (overflow) notes.push(`Partial coverage. Vercel grouped ${overflow.toLocaleString("en-US")} ${overflow === 1 ? "view" : "views"} outside the named paths. Feature counts are lower bounds.`);
  if (unmapped) notes.push(`${unmapped.toLocaleString("en-US")} ${unmapped === 1 ? "view" : "views"} fell outside recognized features.`);
  if ((query?.since && Date.parse(query.since) > +start) || (query?.until && Date.parse(query.until) < +until)) {
    notes.push("Partial coverage. Vercel returned a shorter reporting window.");
  }
  return { counts, coverage: notes.join(" ") };
}
