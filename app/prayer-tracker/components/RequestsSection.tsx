"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useMemo, useState } from "react";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

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
  const total = requests.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = total === 0 ? 1 : Math.min(page, totalPages);

  const pagedRequests = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return requests.slice(start, start + PAGE_SIZE);
  }, [currentPage, requests]);

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

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

  const categoryKeys = useMemo(
    () => Object.keys(familiesByCategory).sort(),
    [familiesByCategory]
  );

  const paginationControls = (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>
        {Math.min((currentPage - 1) * PAGE_SIZE + 1, total)}-
        {Math.min(currentPage * PAGE_SIZE, total)} of {total}
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
      <CardHeader>
        <CardTitle>Requests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Input
            placeholder="Request"
            value={newRequest.text}
            onChange={(event) =>
              onNewRequestChange({ text: event.target.value })
            }
          />
          <Textarea
            placeholder="Notes (optional)"
            value={newRequest.notes}
            onChange={(event) =>
              onNewRequestChange({ notes: event.target.value })
            }
          />
          <Select
            value={newRequest.linkedToFamily}
            onValueChange={(value) =>
              onNewRequestChange({ linkedToFamily: value })
            }
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
          {requestFormError && (
            <p className="text-xs text-destructive">{requestFormError}</p>
          )}
          <Button onClick={onCreateRequest} className="w-full">
            Add Request
          </Button>
        </div>

        <Separator />

        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active requests yet.
          </p>
        ) : (
          <div className="space-y-4">
            {paginationControls}

            <div className="grid gap-4 md:grid-cols-2">
              {pagedRequests.map((item) => {
                const isHouseholdRequest = !item.familyId;
                const isAnswering = answeringRequestId === item.id;

                return (
                  <div
                    key={item.id}
                    className="rounded-lg border bg-card px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">
                            {item.requestText}
                          </p>
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">
                            {isHouseholdRequest
                              ? "Our Family"
                              : item.familyName}
                          </span>
                        </div>
                        {item.notes && (
                          <p className="text-xs text-muted-foreground">
                            {item.notes}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Last prayed: {formatTimeSince(item.lastPrayedAt)} -
                          Added {formatRelative(item.dateAdded)}
                        </p>
                        {item.status === "ANSWERED" && item.answeredAt && (
                          <p className="text-xs text-success">
                            Answered {formatRelative(item.answeredAt)}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onEditRequest(item)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            onMarkAnswered(item.id, isHouseholdRequest)
                          }
                          disabled={item.status === "ANSWERED" || isAnswering}
                        >
                          {item.status === "ANSWERED"
                            ? "Answered"
                            : isAnswering
                            ? "Saving..."
                            : "Mark Answered"}
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
