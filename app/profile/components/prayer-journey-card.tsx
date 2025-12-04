// app/profile/components/prayer-journey-card.tsx

"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ProfileStats } from "../types";

type PrayerJourneyCardProps = {
  stats: ProfileStats;
};

export function PrayerJourneyCard({ stats }: PrayerJourneyCardProps) {
  const answeredPersonal = stats.answeredPersonalCount ?? 0;
  const answeredFamilies = stats.answeredFamilyCount ?? 0;
  const totalAnswered = answeredPersonal + answeredFamilies;
  const rawLastPrayed = stats.lastPrayerAt ? new Date(stats.lastPrayerAt) : null;
  const hasValidLastPrayed = rawLastPrayed && !Number.isNaN(rawLastPrayed.getTime());
  const formattedLastPrayed = hasValidLastPrayed
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(rawLastPrayed)
    : null;

  return (
    <Card className="mx-auto mt-6 max-w-2xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl font-serif">Prayer Journey</CardTitle>
        <CardDescription>
          Celebrate the Lord&apos;s faithfulness across your household and the families you shepherd.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Total answered", value: totalAnswered },
            { label: "Our family", value: answeredPersonal },
            { label: "Other families", value: answeredFamilies },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border/60 bg-background/70 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{stat.label}</p>
              <p className="text-xl font-semibold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-4 rounded-2xl border border-primary/10 bg-muted/30 p-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Recent rhythm</p>
            <p className="text-sm text-muted-foreground">
              Keep recording answered prayer so this timeline reflects the Spirit&apos;s work in your home.
            </p>
          </div>
          <Separator className="bg-border/60" />
          <div className="text-sm text-muted-foreground">
            {formattedLastPrayed ? (
              <p>
                Last prayed together on <span className="font-medium text-foreground">{formattedLastPrayed}</span>.
              </p>
            ) : (
              <p>Log a rotation night to track when your household last prayed together.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
