"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UnifiedRequest, NewPersonalFormState, Family } from "../types";
import { formatRelative, formatTimeSince } from "../utils";
import { useCallback, useMemo, useState } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";

const joinClassNames = (base: string, extra?: string) => {
  if (!extra) return base;
  return [base, extra].filter(Boolean).join(" ");
};

type RequestsSectionProps = {
  className?: string;
  requests: UnifiedRequest[];
  families: Family[];
  newRequest: NewPersonalFormState;
  requestFormError: string | null;
  answeringRequestId: string | null;
  onNewRequestChange: (changes: Partial<NewPersonalFormState>) => void;
  onCreateRequest: () => void;
  onEditRequest: (item: UnifiedRequest) => void;
  onMarkAnswered: (requestId: string, isHouseholdRequest: boolean) => void;
};

export function RequestsSection({
  className,
  requests,
  families,
  newRequest,
  requestFormError,
  answeringRequestId,
  onNewRequestChange,
  onCreateRequest,
  onEditRequest,
  onMarkAnswered,
}: RequestsSectionProps) {
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [requestFilter, setRequestFilter] = useState<string>("active");

  const filteredRequests = useMemo(() => {
    switch (requestFilter) {
      case "active":
        return requests.filter((item) => item.status !== "ANSWERED");
      case "answered":
        return requests.filter((item) => item.status === "ANSWERED");
      case "household":
        return requests.filter((item) => !item.familyId);
      case "family":
        return requests.filter((item) => Boolean(item.familyId));
      default:
        return requests;
    }
  }, [requestFilter, requests]);

  const total = filteredRequests.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = total === 0 ? 1 : Math.min(page, totalPages);

  const handleFilterChange = useCallback((value: string) => {
    setRequestFilter(value);
    setPage(1);
  }, []);

  const pagedRequests = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRequests.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredRequests]);

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  const filterDisplayNames: Record<string, string> = {
    all: "All requests",
    active: "Active only",
    answered: "Answered stories",
    household: "Household",
    family: "Family-linked",
  };
  const filterSuffix = requestFilter === "all" ? "" : ` in ${filterDisplayNames[requestFilter]}`;

  const hasAnyRequests = requests.length > 0;

  // Group families by category for the dropdown
  const familiesByCategory = useMemo(() => {
    const grouped: Record<string, Family[]> = {};
    families.forEach((family) => {
      const category = family.categoryTag || "Uncategorized";
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(family);
    });
    return grouped;
  }, [families]);

  const categoryKeys = useMemo(() => Object.keys(familiesByCategory).sort(), [familiesByCategory]);

  const paginationControls = (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <span>
        {Math.min((currentPage - 1) * PAGE_SIZE + 1, total)}-{Math.min(currentPage * PAGE_SIZE, total)} of {total}
        {filterSuffix ? ` ${filterSuffix}` : ""}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage(1)}
          disabled={!canPrev}
          aria-label="Go to first page"
        >
          <ChevronFirst className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage(Math.max(1, currentPage - 1))}
          disabled={!canPrev}
          aria-label="Go to previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="px-1">
          Page {currentPage} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
          disabled={!canNext}
          aria-label="Go to next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPage(totalPages)}
          disabled={!canNext}
          aria-label="Go to last page"
        >
          <ChevronLast className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );

  return (
    <Card className={joinClassNames("", className)}>
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl font-serif">Requests</CardTitle>
        <CardDescription>
          Track petitions for your household and connected families, then record God’s answers with confidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4 rounded-2xl border border-primary/10 bg-muted/30 p-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">New Request</p>
            <p className="text-sm text-muted-foreground">
              Keep titles short and add optional notes for additional context.
            </p>
          </div>
          <Input
            placeholder="Request"
            value={newRequest.text}
            onChange={(event) => onNewRequestChange({ text: event.target.value })}
          />
          <Textarea
            placeholder="Notes (optional)"
            value={newRequest.notes}
            onChange={(event) => onNewRequestChange({ notes: event.target.value })}
          />
          <Select
            value={newRequest.linkedToFamily}
            onValueChange={(value) => onNewRequestChange({ linkedToFamily: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Link to..." />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Your Household</SelectLabel>
                <SelectItem value="household">Our Family</SelectItem>
              </SelectGroup>
              {categoryKeys.map((category, index) => (
                <div key={category}>
                  {index > 0 && <SelectSeparator />}
                  <SelectGroup>
                    <SelectLabel>{category}</SelectLabel>
                    {familiesByCategory[category].map((family) => (
                      <SelectItem key={family.id} value={family.id}>
                        {family.familyName}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </div>
              ))}
            </SelectContent>
          </Select>
          {requestFormError && <p className="text-xs text-destructive">{requestFormError}</p>}
          <Button onClick={onCreateRequest} className="w-full">
            Add Request
          </Button>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Overview</p>
              <h3 className="text-base font-serif text-foreground">Current requests</h3>
              <p className="text-sm text-muted-foreground">
                Use filters to focus on answered stories or the petitions you still carry.
              </p>
            </div>
            <Select value={requestFilter} onValueChange={handleFilterChange}>
              <SelectTrigger className="w-full md:w-[220px]">
                <SelectValue placeholder="Filter requests" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All requests</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="answered">Answered stories</SelectItem>
                <SelectItem value="household">Household only</SelectItem>
                <SelectItem value="family">Family-linked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {!hasAnyRequests ? (
          <p className="text-sm text-muted-foreground">Start by adding your first prayer request.</p>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">No requests match this filter yet.</p>
        ) : (
          <div className="space-y-4">
            {paginationControls}

            <div className="grid gap-4 md:grid-cols-2">
              {pagedRequests.map((item) => {
                const isHouseholdRequest = !item.familyId;
                const isAnswering = answeringRequestId === item.id;
                const isAnswered = item.status === "ANSWERED";

                return (
                  <div
                    key={item.id}
                    className={joinClassNames(
                      "rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm transition-colors hover:border-primary/40",
                      isAnswered ? "ring-1 ring-primary/40" : ""
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-serif font-semibold">{item.requestText}</p>
                          <span className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[11px] font-medium">
                            {isHouseholdRequest ? "Our Family" : item.familyName}
                          </span>
                          {isAnswered && item.answeredAt && (
                            <span className="inline-flex items-center rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                              Answered {formatRelative(item.answeredAt)}
                            </span>
                          )}
                        </div>
                        {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                        <p className="text-xs text-muted-foreground">
                          Last prayed: {formatTimeSince(item.lastPrayedAt)} - Added {formatRelative(item.dateAdded)}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button size="sm" variant="outline" onClick={() => onEditRequest(item)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onMarkAnswered(item.id, isHouseholdRequest)}
                          disabled={isAnswered || isAnswering}
                        >
                          {isAnswered ? "Answered" : isAnswering ? "Saving..." : "Mark Answered"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {paginationControls}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
