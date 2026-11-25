import { reportingPeriods } from "@/lib/analytics/period";
import type { AnalyticsReport } from "@/lib/analytics/report";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import FeatureTable from "./FeatureTable";
import GrowthCharts from "./GrowthCharts";
import { dayLabel, instantLabel, numberLabel, rateLabel } from "./format";

const heroMetrics = [
  ["newChats", "New chats"],
  ["userMessages", "User messages"],
  ["newAccounts", "New accounts"],
  ["averageMessages", "Avg. messages per active chat"],
] as const;

const channelLabels = {
  combined: "All channels",
  web: "Website",
  public_api: "Public API (v1)",
  mcp: "MCP",
  unknown: "Unknown",
};

function PeriodOverview({ report }: { report: AnalyticsReport }) {
  const { period, metrics } = report;
  return (
    <section aria-label="Period overview">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {heroMetrics.map(([key, label]) => {
          const { current, previous } = metrics.hero[key];
          const delta = current !== null && previous !== null ? current - previous : null;
          const change = delta === null ? "Change unavailable" : delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${numberLabel(delta)}`;
          let detail = delta === null ? change : `${change} vs. prior ${period.days} days`;
          if (current === null) {
            if (key === "newAccounts") detail = metrics.registrationIssue ?? "Registration data unavailable";
            else if (metrics.hero.userMessages.current === null) detail = "Chat data unavailable";
            else if (key === "averageMessages") detail = "No active chats this period";
          }
          return (
            <div key={key} className="flex flex-col rounded-lg border bg-card p-5 text-card-foreground">
              <dt className="text-sm font-medium">{label}</dt>
              <dd className="mt-auto pt-2 text-4xl font-semibold tracking-tight tabular-nums">{numberLabel(current)}</dd>
              <dd className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">{detail}</dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">
        Chat totals include all channels. The average counts user submissions and visible Parrot replies in chats with a submission during the period.
        {metrics.hero.newChats.current !== null && metrics.coverage.partialChatComparison && " Historical chat totals in this comparison have partial coverage."}
      </p>
    </section>
  );
}

function AccountActivity({ report }: { report: AnalyticsReport }) {
  const { active, activation, coverage } = report.metrics;
  const { period } = report;
  const windows = [
    ["Daily", "1 day", active.daily], ["Weekly", "7 days", active.weekly], ["Monthly", "30 days", active.monthly],
  ] as const;
  const sources = [
    ["Signed-in chat submissions", coverage.chat],
    ["Personal and Heritage Journal saves", coverage.journal],
    ["Sermon evaluation submissions", coverage.sermon],
  ] as const;

  return (
    <section aria-labelledby="activity-heading" className="space-y-4">
      <div>
        <h2 id="activity-heading" className="text-2xl font-semibold">Account activity</h2>
        <p className="text-sm text-muted-foreground">Each signed-in account counts once across qualifying actions. Website, public API, MCP, and unknown-channel submissions qualify when the account was identified at send time.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-5">
          <h3 className="text-xl font-semibold">Active signed-in users</h3>
          <p className="mt-1 text-sm text-muted-foreground">Trailing calendar windows ending {dayLabel(period.endDay)}.</p>
          <dl className="mt-5 grid grid-cols-3 gap-2">
            {windows.map(([label, duration, total]) => (
              <div key={label}>
                <dt className="text-sm">{label} <span className="block text-xs text-muted-foreground">{duration}</span></dt>
                <dd className="mt-2 text-3xl font-semibold tabular-nums">{numberLabel(total)}</dd>
              </div>
            ))}
          </dl>
          {coverage.partialActive && <p className="mt-2 text-sm text-muted-foreground">
            {active.monthly === null ? "Activity data unavailable." : "Some activity in these windows has partial coverage."}
          </p>}
        </div>
        <div className="rounded-lg border bg-card p-5">
          <h3 className="text-xl font-semibold">Seven-day activation</h3>
          <p className="mt-1 text-sm text-muted-foreground">Signups from {dayLabel(period.startDay)} to {dayLabel(period.endDay)}.</p>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-3">
            <strong className="text-3xl font-semibold tabular-nums">{rateLabel(activation.rate)}</strong>
            <span className="text-sm">{activation.eligible === null ? "Activation data unavailable" : `${numberLabel(activation.activated)} of ${numberLabel(activation.eligible)} eligible accounts activated`}</span>
          </p>
          {activation.eligible !== null && activation.activated === null && (
            <p className="mt-2 text-sm text-muted-foreground">Qualifying action data unavailable.</p>
          )}
          <p className="mt-2 text-sm">
            {activation.firstEligibleDay && activation.lastEligibleDay && `Eligible signups span ${dayLabel(activation.firstEligibleDay)} to ${dayLabel(activation.lastEligibleDay)}. `}
            {numberLabel(activation.pending)} pending a full seven days. {numberLabel(activation.uncovered)} outside reliable coverage.
          </p>
        </div>
      </div>
      <div className="rounded-md border-l-2 border-primary/50 px-4 py-1">
        <h3 className="font-sans text-sm font-semibold">Qualifying actions and coverage starts</h3>
        <dl className="mt-1 text-sm text-muted-foreground">
          {sources.map(([label, start]) => (
            <div key={label} className="flex flex-wrap gap-x-2">
              <dt>{label}</dt><dd>{start ? instantLabel(start, period.timeZone) : "Coverage start unavailable"}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-sm">An eligible account activates when it takes a qualifying action within the first seven days after registration.</p>
      </div>
    </section>
  );
}

function ChatBreakdown({ metrics }: { metrics: AnalyticsReport["metrics"] }) {
  const { channels, guest, integrations } = metrics;
  return (
    <section aria-labelledby="channels-heading" className="space-y-4">
      <div>
        <h2 id="channels-heading" className="text-2xl font-semibold">Chat by channel</h2>
        <p className="text-sm text-muted-foreground">Each creation and submission uses its entry channel. A chat active on multiple channels counts once in the combined total.
          {metrics.coverage.partialChannels && " Website, guest, and public API counts have partial attribution for this period."}
        </p>
      </div>
      <div className="rounded-lg border bg-card p-2 sm:p-4">
        <Table className="min-w-[35rem] tabular-nums">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Channel</TableHead>
              <TableHead scope="col" className="text-right">New chats</TableHead>
              <TableHead scope="col" className="text-right">User messages</TableHead>
              <TableHead scope="col" className="text-right">Active chats</TableHead>
              <TableHead scope="col" className="text-right">Avg. messages per active chat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((row) => (
              <TableRow key={row.channel} className={row.channel === "combined" ? "bg-muted/50 font-semibold" : ""}>
                <th scope="row" className="p-2 text-left font-medium">{channelLabels[row.channel]}</th>
                <TableCell className="text-right">{numberLabel(row.newChats)}</TableCell>
                <TableCell className="text-right">{numberLabel(row.userMessages)}</TableCell>
                <TableCell className="text-right">{numberLabel(row.activeChats)}</TableCell>
                <TableCell className="text-right">{numberLabel(row.averageMessages)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">
        Identified integrations contributed {numberLabel(integrations.newChats)} new chats and {numberLabel(integrations.userMessages)} user messages across the channels above.
      </p>
      <div className="rounded-lg border bg-card p-5">
        <h3 className="text-xl font-semibold">Guest chat on the website</h3>
        <p className="mt-1 text-sm text-muted-foreground">Guest attribution follows the actor at creation or submission, including chats later claimed by an account.</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          {([
            ["Chats started as a guest", guest.newChats],
            ["Messages sent by guests", guest.userMessages],
            ["Avg. messages per active guest chat", guest.averageMessages],
          ] as const).map(([label, total]) => (
            <div key={label}>
              <dt className="text-sm">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{numberLabel(total)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export default function AnalyticsDashboard({ report }: { report: AnalyticsReport }) {
  const { period, metrics } = report;
  return (
    <main className="mx-auto min-h-[calc(100vh-var(--app-header-height))] w-full max-w-7xl space-y-9 px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Admin analytics</h1>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-lg font-medium">{dayLabel(period.startDay)} – {dayLabel(period.endDay)}</p>
            <a href="#data-coverage" className="rounded-sm text-sm text-accent underline underline-offset-4 focus-visible:outline-ring dark:text-foreground">Data coverage</a>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Compared with {dayLabel(period.previousStartDay)} – {dayLabel(period.previousEndDay)} · {period.timeZone}
          </p>
        </div>
        <nav aria-label="Reporting period" className="grid w-full grid-cols-3 gap-1 rounded-md border bg-card p-1 sm:w-auto sm:grid-cols-6">
          {reportingPeriods.map(({ days, label }) => (
            <a key={days} href={`/admin/analytics?days=${days}`} aria-current={days === period.days ? "page" : undefined}
              className={`rounded-sm px-3 py-2 text-center text-sm font-medium focus-visible:outline-ring ${days === period.days ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {label}
            </a>
          ))}
        </nav>
      </header>
      <PeriodOverview report={report} />
      <GrowthCharts report={report} />
      <AccountActivity report={report} />
      <ChatBreakdown metrics={metrics} />
      <FeatureTable features={report.features} />
      <footer className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
        <h2 id="data-coverage" tabIndex={-1} className="scroll-mt-[calc(var(--app-header-height)+1rem)] text-xl font-semibold text-foreground">Coverage for this report</h2>
        <p>Generated {instantLabel(report.generatedAt, period.timeZone)}. A dash indicates unavailable data or an undefined rate.</p>
        {metrics.notes.length > 0 && (
          <ul className="ml-5 list-disc space-y-1">{metrics.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        )}
      </footer>
    </main>
  );
}
