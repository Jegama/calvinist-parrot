"use client";

import dynamic from "next/dynamic";

import type { ChurchListItem } from "@/types/church";

const MapComponent = dynamic(() => import("./church-map-inner").then((mod) => mod.ChurchMapInner), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-lg border border-border bg-card/80 text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

type ChurchMapProps = {
  churches: ChurchListItem[];
  onSelect: (church: ChurchListItem) => void;
  height?: number | null;
};

export function ChurchMap(props: ChurchMapProps) {
  return <MapComponent {...props} />;
}
