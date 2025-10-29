"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChurchListItem, EvaluationStatus } from "@/types/church";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import badgesJson from "@/lib/references/badges.json";

const STATUS_STYLES: Record<EvaluationStatus | "confessional", string> = {
  recommended: "status--recommended",
  biblically_sound_with_differences: "status--info",
  limited_information: "status--warning",
  not_endorsed: "status--danger",
  confessional: "status--confessional",
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

// Coverage percent is displayed via a progress bar; keep helper minimal if needed later

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

        <div className="grid gap-3 md:grid-cols-2">
          {items.length === 0 && !loading ? (
            <Card>
              <CardHeader>
                <CardTitle>No churches found</CardTitle>
                <CardDescription>Try adjusting your filters or search criteria.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            items.map((church) => {
              const status = church.status ?? "limited_information";
              const displayKey: keyof typeof STATUS_STYLES = church.confessionAdopted
                ? "confessional"
                : status;
              const displayLabel = church.confessionAdopted
                ? "Confessional Reformed"
                : status === "not_endorsed"
                  ? "Not Endorsed"
                  : status === "limited_information"
                    ? "Limited Info"
                    : status === "biblically_sound_with_differences"
                      ? "Biblically Sound"
                      : "Recommended";
              const badges = church.badges ?? [];
              // Prioritize badges by category and cap the number shown
              const CATEGORY_PRIORITY: Record<string, number> = {
                red_flag: 0,
                theological: 1,
                practice: 2,
                structure: 3,
                info: 4,
              };
              const getPriority = (badge: string) => {
                const category = (badgesJson as Record<string, { category?: string }>)[badge]?.category;
                if (category && CATEGORY_PRIORITY[category] !== undefined) return CATEGORY_PRIORITY[category];
                return 999; // unknown badge keys go last
              };
              const sortedBadges = [...badges].sort((a, b) => {
                const pa = getPriority(a);
                const pb = getPriority(b);
                if (pa !== pb) return pa - pb;
                return a.localeCompare(b);
              });
              // Default cap to 3; allow more if there are many services to better balance columns
              const servicesCount = church.serviceTimes.length;
              const maxBadges = servicesCount > 2 ? 5 : 3;
              return (
                <Card
                  key={church.id}
                  className="cursor-pointer transition bg-card shadow-sm hover:border-primary hover:shadow-md"
                  onClick={() => onSelect(church)}
                >
                  <CardHeader className="space-y-1.5">
                    <CardTitle className="text-xl font-semibold text-foreground">{church.name}</CardTitle>
                    <CardDescription>{formatLocation(church)}</CardDescription>
                    {(church.status || church.confessionAdopted) ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={`inline-flex items-center justify-center whitespace-nowrap text-center leading-none rounded-full px-3 py-1 text-sm font-medium ${STATUS_STYLES[displayKey]}`}
                            aria-label={`${displayLabel} status`}
                          >
                            {displayLabel}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="max-w-xs text-sm">
                            {church.confessionAdopted
                              ? "Publicly subscribes to a historic Reformed confession."
                              : status === "not_endorsed"
                                ? "We cannot endorse this church based on what is published."
                                : status === "limited_information"
                                  ? "Website does not clearly state several essentials."
                                  : status === "biblically_sound_with_differences"
                                    ? "Affirms essentials but holds to non-Reformed secondary positions."
                                    : "We can commend this church based on essentials affirmed on its site."}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </CardHeader>
                  <CardContent className="grid gap-4 lg:grid-cols-2">
                    {/* Left column: Denomination + Services */}
                    <div className="order-2 lg:order-1 space-y-4">
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Denomination</p>
                        <p className="text-sm text-foreground">
                          {church.denomination.label ?? "Unknown"}
                          {typeof church.denomination.confidence === "number"
                            ? ` (${Math.round(church.denomination.confidence * 100)}% confidence)`
                            : ""}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Services</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {church.serviceTimes.length > 0 ? (
                            church.serviceTimes.slice(0, 3).map((service) => (
                              <span key={service.id} className="badge--neutral px-2 py-0.5 text-xs">
                                {service.label}
                              </span>
                            ))
                          ) : (
                            <span className="badge--neutral px-2 py-0.5 text-xs">Not listed</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right column: At a Glance badges */}
                    <div className="order-1 lg:order-2 space-y-1">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">At a Glance</p>
                      <div className="flex flex-wrap gap-1">
                        {sortedBadges.slice(0, maxBadges).map((badge) => {
                          const badgeInfo = (badgesJson as Record<string, { description?: string; category?: string }>)[badge];
                          const isRedFlag = badgeInfo?.category === "red_flag";
                          const badgeClasses = isRedFlag
                            ? "badge--red-flag px-2 py-0.5 text-xs"
                            : "badge--neutral px-2 py-0.5 text-xs";

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
                        {sortedBadges.length > maxBadges ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="badge--neutral px-2 py-0.5 text-xs"
                                onClick={(e) => { e.stopPropagation(); onSelect(church); }}
                                aria-label={`View ${sortedBadges.length - maxBadges} more badges`}
                              >
                                +{sortedBadges.length - maxBadges} more
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              View details to see all badges
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                        {badges.length === 0 ? (
                          <span className="badge--neutral px-2 py-0.5 text-xs">Limited information</span>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
