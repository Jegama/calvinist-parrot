"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { PersonalRequest, NewPersonalFormState } from "../types";
import { formatRelative, formatTimeSince } from "../utils";
import { useEffect, useMemo, useState } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";

const joinClassNames = (base: string, extra?: string) => {
  if (!extra) return base;
  return [base, extra].filter(Boolean).join(" ");
};

type PersonalRequestsSectionProps = {
  className?: string;
  personal: PersonalRequest[];
  newPersonal: NewPersonalFormState;
  personalFormError: string | null;
  answeringPersonalId: string | null;
  onNewPersonalChange: (changes: Partial<NewPersonalFormState>) => void;
  onCreatePersonal: () => void;
  onEditPersonal: (item: PersonalRequest) => void;
  onMarkAnswered: (requestId: string) => void;
};

export function PersonalRequestsSection({
  className,
  personal,
  newPersonal,
  personalFormError,
  answeringPersonalId,
  onNewPersonalChange,
  onCreatePersonal,
  onEditPersonal,
  onMarkAnswered,
}: PersonalRequestsSectionProps) {
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const total = personal.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (total === 0) {
      setPage(1);
    }
  }, [total]);

  const pagedPersonal = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return personal.slice(start, start + PAGE_SIZE);
  }, [page, personal]);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <Card className={joinClassNames("", className)}>
      <CardHeader>
        <CardTitle>Our Family Requests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Input
            placeholder="Request"
            value={newPersonal.text}
            onChange={(event) => onNewPersonalChange({ text: event.target.value })}
          />
          <Textarea
            placeholder="Notes (optional)"
            value={newPersonal.notes}
            onChange={(event) => onNewPersonalChange({ notes: event.target.value })}
          />
          {personalFormError && <p className="text-xs text-destructive">{personalFormError}</p>}
          <Button onClick={onCreatePersonal} className="w-full">
            Add Request
          </Button>
        </div>

        <Separator />

        {personal.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active requests yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {Math.min((page - 1) * PAGE_SIZE + 1, total)}-
                {Math.min(page * PAGE_SIZE, total)} of {total}
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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!canPrev}
                  aria-label="Go to previous page"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span className="px-1">Page {page} / {totalPages}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

            <div className="grid gap-4 md:grid-cols-2">
              {pagedPersonal.map((item) => (
                <div key={item.id} className="rounded-lg border bg-card px-4 py-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{item.requestText}</p>
                      {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                      <p className="text-xs text-muted-foreground">
                        Last prayed: {formatTimeSince(item.lastPrayedAt)} - Added {formatRelative(item.dateAdded)}
                      </p>
                      {item.status === "ANSWERED" && item.answeredAt && (
                        <p className="text-xs text-emerald-600">Answered {formatRelative(item.answeredAt)}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button size="sm" variant="outline" onClick={() => onEditPersonal(item)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onMarkAnswered(item.id)}
                        disabled={item.status === "ANSWERED" || answeringPersonalId === item.id}
                      >
                        {item.status === "ANSWERED"
                          ? "Answered"
                          : answeringPersonalId === item.id
                          ? "Saving..."
                          : "Mark Answered"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {Math.min((page - 1) * PAGE_SIZE + 1, total)}-
                {Math.min(page * PAGE_SIZE, total)} of {total}
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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!canPrev}
                  aria-label="Go to previous page"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span className="px-1">Page {page} / {totalPages}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
