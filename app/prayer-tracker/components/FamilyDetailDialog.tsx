"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Family, UnifiedRequest } from "../types";
import { formatRelative, formatTimeSince } from "../utils";

type FamilyDetailDialogProps = {
  isOpen: boolean;
  family: Family | null;
  requests: UnifiedRequest[];
  answeringRequestId: string | null;
  onOpenChange: (open: boolean) => void;
  onEditRequest: (request: UnifiedRequest) => void;
  onMarkAnswered: (requestId: string) => void;
};

export function FamilyDetailDialog({
  isOpen,
  family,
  requests,
  answeringRequestId,
  onOpenChange,
  onEditRequest,
  onMarkAnswered,
}: FamilyDetailDialogProps) {
  if (!family) return null;

  const familyRequests = requests.filter((req) => req.familyId === family.id);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{family.familyName}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Family Details */}
          <div className="space-y-2">
            {family.categoryTag && (
              <div>
                <span className="text-sm text-muted-foreground">Category: </span>
                <span className="inline-block rounded-full bg-secondary px-2 py-1 text-xs font-medium">
                  {family.categoryTag}
                </span>
              </div>
            )}
            {family.parents && (
              <p className="text-sm">
                <span className="font-semibold">Parents:</span> {family.parents}
              </p>
            )}
            {Array.isArray(family.children) && family.children.length > 0 && (
              <p className="text-sm">
                <span className="font-semibold">Children:</span> {family.children.join(", ")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Last prayed: {formatRelative(family.lastPrayedAt)} ({formatTimeSince(family.lastPrayedAt)})
              {family.lastPrayedBy?.displayName && ` - by ${family.lastPrayedBy.displayName}`}
            </p>
          </div>

          <Separator />

          {/* Prayer Requests Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Prayer Requests</h3>
              <span className="text-sm text-muted-foreground">
                {familyRequests.length} {familyRequests.length === 1 ? "request" : "requests"}
              </span>
            </div>

            {familyRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No specific prayer requests for this family yet. Add one from the Requests section.
              </p>
            ) : (
              <div className="space-y-3">
                {familyRequests.map((request) => {
                  const isAnswering = answeringRequestId === request.id;
                  const isAnswered = request.status === "ANSWERED";

                  return (
                    <div key={request.id} className="rounded-lg border bg-card p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-semibold">{request.requestText}</p>
                          {request.notes && (
                            <p className="text-xs text-muted-foreground">{request.notes}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Last prayed: {formatTimeSince(request.lastPrayedAt)} - Added{" "}
                            {formatRelative(request.dateAdded)}
                          </p>
                          {isAnswered && request.answeredAt && (
                            <p className="text-xs font-medium text-green-600 dark:text-green-400">
                              ✓ Answered {formatRelative(request.answeredAt)}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onEditRequest(request)}
                          >
                            Edit
                          </Button>
                          {!isAnswered && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => onMarkAnswered(request.id)}
                              disabled={isAnswering}
                            >
                              {isAnswering ? "Saving..." : "Mark Answered"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
