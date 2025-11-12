// app/profile/components/prayer-journey-card.tsx

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProfileStats } from "../types";

type PrayerJourneyCardProps = {
  stats: ProfileStats;
};

export function PrayerJourneyCard({ stats }: PrayerJourneyCardProps) {
  return (
    <Card className="mx-auto max-w-2xl mt-6">
      <CardHeader>
        <CardTitle>Prayer Journey</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <p>
          <span className="font-semibold">Answered for our family:</span>{" "}
          {stats.answeredPersonalCount ?? 0}
        </p>
        <p>
          <span className="font-semibold">Answered for other families:</span>{" "}
          {stats.answeredFamilyCount ?? 0}
        </p>
        {stats.lastPrayerAt && (
          <p>
            <span className="font-semibold">Last prayed together:</span>{" "}
            {new Date(stats.lastPrayerAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
