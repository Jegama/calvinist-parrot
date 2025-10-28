"use client";

import { Fragment } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ChurchListItem, EvaluationStatus } from "@/types/church";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import badgesJson from "@/lib/references/badges.json";

const STATUS_STYLES: Record<EvaluationStatus | "confessional", string> = {
  pass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20",
  caution: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20",
  red_flag: "bg-destructive/10 text-destructive border border-destructive/40",
  confessional: "bg-primary/15 text-primary border border-primary/30 dark:bg-primary/10 dark:border-primary/20",
};

type ChurchListProps = {
  items: ChurchListItem[];
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onSelect: (church: ChurchListItem) => void;
};

function formatLocation(church: ChurchListItem): string {
  if (church.city && church.state) return `${church.city}, ${church.state}`;
  if (church.city) return church.city;
  if (church.state) return church.state;
  return "Location unavailable";
}

function formatCoverage(coverage?: number | null): string {
  if (typeof coverage !== "number") return "Unknown";
  return `${Math.round(coverage * 100)}%`;
}

export function ChurchList({ items, page, pageSize, total, loading, onPageChange, onSelect }: ChurchListProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <TooltipProvider delayDuration={0}>
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(1)}
            aria-label="Go to first page"
          >
            <ChevronFirst className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
            aria-label="Go to previous page"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="px-1">
            Page {page} / {totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(page + 1)}
            aria-label="Go to next page"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(totalPages)}
            aria-label="Go to last page"
          >
            <ChevronLast className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {items.length === 0 && !loading ? (
          <Card>
            <CardHeader>
              <CardTitle>No churches found</CardTitle>
              <CardDescription>Try adjusting your filters or search criteria.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          items.map((church) => {
            const status = church.status ?? "caution";
            const displayKey: keyof typeof STATUS_STYLES = church.confessionAdopted
              ? "confessional"
              : status;
            const displayLabel = church.confessionAdopted
              ? "Historic Reformed (Confessional)"
              : status === "red_flag"
                ? "Not Endorsed"
                : status === "caution"
                  ? "Limited Info"
                  : "Recommended";
            return (
              <Card
                key={church.id}
                className="cursor-pointer transition bg-card shadow-sm hover:border-primary hover:shadow-md"
                onClick={() => onSelect(church)}
              >
                <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="text-xl font-semibold text-foreground">{church.name}</CardTitle>
                    <CardDescription>{formatLocation(church)}</CardDescription>
                  </div>
                  {(church.status || church.confessionAdopted) ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_STYLES[displayKey]}`}
                          aria-label={`${displayLabel} status`}
                        >
                          {displayLabel}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="max-w-xs text-sm">
                          {church.confessionAdopted
                            ? "Publicly subscribes to a historic Reformed confession."
                            : status === "red_flag"
                              ? "We cannot endorse this church based on what is published."
                              : status === "caution"
                                ? "Website does not clearly state several essentials."
                                : "We can commend this church based on essentials affirmed on its site."}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-4">
                  <div className="space-y-1 order-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Historic Reformed (Confessional)</p>
                    <p className="text-sm text-foreground">{church.confessionAdopted ? "Yes" : "No"}</p>
                  </div>
                  <div className="space-y-1 order-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Essentials on website</p>
                    <p className="text-sm text-foreground">{formatCoverage(church.coverageRatio)}</p>
                  </div>
                  <div className="space-y-1 order-4 lg:order-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Denomination</p>
                    <p className="text-sm text-foreground">
                      {church.denomination.label ?? "Unknown"}
                      {typeof church.denomination.confidence === "number"
                        ? ` (${Math.round(church.denomination.confidence * 100)}% confidence)`
                        : ""}
                    </p>
                  </div>
                  <div className="space-y-1 order-3 lg:order-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">At a Glance</p>
                    <div className="flex flex-wrap gap-1">
                      {(church.badges ?? []).slice(0, 3).map((badge) => {
                        const badgeInfo = badgesJson[badge as keyof typeof badgesJson];
                        const isRedFlag = badgeInfo?.category === "red_flag";
                        const badgeClasses = isRedFlag
                          ? "rounded-full bg-destructive/10 border border-destructive/40 px-2 py-0.5 text-xs text-destructive"
                          : "rounded-full bg-muted/70 border border-border px-2 py-0.5 text-xs text-foreground/80";
                        
                        return (
                          <Tooltip key={badge}>
                            <TooltipTrigger asChild>
                              <span className={badgeClasses}>
                                {badge}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-sm">
                              <p>{badgeInfo?.description ?? "No description available"}</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                      {(church.badges ?? []).length === 0 ? (
                        <span className="text-sm text-muted-foreground">None listed</span>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
                {church.serviceTimes.length > 0 ? (
                  <Fragment>
                    <Separator />
                    <CardContent className="flex flex-wrap items-center gap-3 pt-4 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Services:</span>
                      {church.serviceTimes.slice(0, 3).map((service) => (
                        <span key={service.id} className="rounded-md bg-muted/70 border border-border px-3 py-1.5 text-foreground/80">
                          {service.label}
                        </span>
                      ))}
                    </CardContent>
                  </Fragment>
                ) : null}
              </Card>
            );
          })
        )}
      </div>
    </div>
    </TooltipProvider>
  );
}
