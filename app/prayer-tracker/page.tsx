"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { ProtectedView } from "@/components/ProtectedView";
import { RotationCard } from "./components/RotationCard";
import { FamilySection } from "./components/FamilySection";
import { RequestsSection } from "./components/RequestsSection";
import { FamilySheet } from "./components/FamilySheet";
import { RequestSheet } from "./components/RequestSheet";
import { FamilyDetailDialog } from "./components/FamilyDetailDialog";
import type { Family } from "./types";
import { usePrayerSpace } from "./hooks/use-prayer-space";
import { useFamilyManager } from "./hooks/use-family-manager";
import { useRequestManager } from "./hooks/use-request-manager";
import { useRotationWorkflow } from "./hooks/use-rotation-workflow";

export default function PrayerTrackerPage() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const { spaceName, members, families, requests, refreshAll, refreshLists, updateMembers, isCurrentUserSpaceLoaded } =
    usePrayerSpace({ user, authLoading });

  const familyManager = useFamilyManager({ user, families, refreshLists });
  const requestManager = useRequestManager({ user, refreshLists, queryClient });
  const rotationWorkflow = useRotationWorkflow({
    user,
    members,
    onMembersUpdate: updateMembers,
    refreshAll,
  });

  const [familyDetailDialogOpen, setFamilyDetailDialogOpen] = useState(false);
  const [selectedFamilyForDetail, setSelectedFamilyForDetail] = useState<Family | null>(null);

  const memberNames = useMemo(() => {
    const names = members.map((member) => member.displayName).join(" & ");
    return names || "Invite your spouse from your profile";
  }, [members]);

  const authFallback = (
    <Card className="max-w-2xl mx-auto mt-8 mb-8">
      <CardHeader>
        <CardTitle>Prayer Tracker</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Checking your session… redirecting to login if needed.</p>
      </CardContent>
    </Card>
  );

  if (!user) {
    return <ProtectedView fallback={authFallback} />;
  }

  if (!isCurrentUserSpaceLoaded) {
    return (
      <ProtectedView fallback={authFallback}>
        <Card className="max-w-2xl mx-auto mt-8 mb-8">
          <CardHeader>
            <CardTitle>Prayer Tracker</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Loading your family space...</p>
          </CardContent>
        </Card>
      </ProtectedView>
    );
  }

  if (!spaceName) {
    return (
      <ProtectedView fallback={authFallback}>
        <Card className="max-w-2xl mx-auto mt-8 mb-8">
          <CardHeader>
            <CardTitle>Prayer Tracker</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>You don&apos;t have a shared family space yet.</p>
            <p>Create one from your profile page to begin tracking prayers together.</p>
            <Button asChild>
              <Link href="/profile">Go to Profile</Link>
            </Button>
          </CardContent>
        </Card>
      </ProtectedView>
    );
  }

  return (
    <ProtectedView fallback={authFallback}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-8">
          <div className="flex flex-col gap-4 mb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-serif font-bold text-foreground mb-2">{spaceName}</h1>
              <p className="text-muted-foreground">Prayer partners: {memberNames}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/prayer-tracker/family-worship">Why Family Worship?</Link>
              </Button>
              <Button
                onClick={rotationWorkflow.computeRotation}
                disabled={rotationWorkflow.isComputing}
                className="w-full sm:w-auto"
              >
                {rotationWorkflow.isComputing ? "Computing..." : "Compute Tonight's Rotation"}
              </Button>
            </div>
          </div>
        </header>

        <div className="space-y-6">
          {rotationWorkflow.rotationError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {rotationWorkflow.rotationError}
            </div>
          )}

          <RotationCard
            rotation={rotationWorkflow.rotation}
            members={members}
            familyAssignments={rotationWorkflow.familyAssignments}
            personalSelections={rotationWorkflow.personalSelections}
            isConfirming={rotationWorkflow.isConfirming}
            hasSelections={rotationWorkflow.hasSelections}
            onFamilyAssignmentChange={rotationWorkflow.handleFamilyAssignmentChange}
            onPersonalSelectionChange={rotationWorkflow.handlePersonalSelectionChange}
            onCancelRotation={rotationWorkflow.handleCancelRotation}
            onConfirmRotation={rotationWorkflow.confirmRotation}
          />

          <RequestsSection
            className="w-full"
            requests={requests}
            families={families}
            newRequest={requestManager.newRequest}
            requestFormError={requestManager.requestFormError}
            answeringRequestId={requestManager.answeringRequestId}
            onNewRequestChange={requestManager.handleNewRequestChange}
            onCreateRequest={requestManager.createRequest}
            onEditRequest={requestManager.openRequestSheet}
            onMarkAnswered={requestManager.markRequestAnswered}
          />

          <FamilySection
            className="w-full"
            newFamily={familyManager.newFamily}
            familyFormError={familyManager.familyFormError}
            categories={familyManager.categories}
            categoryFilter={familyManager.categoryFilter}
            filteredFamilies={familyManager.filteredFamilies}
            onNewFamilyChange={familyManager.handleNewFamilyChange}
            onCreateFamily={familyManager.createFamily}
            onCategoryFilterChange={(value) => familyManager.setCategoryFilter(value)}
            onEditFamily={familyManager.openFamilySheet}
            onViewFamilyDetail={(family) => {
              setSelectedFamilyForDetail(family);
              setFamilyDetailDialogOpen(true);
            }}
          />
        </div>

        <FamilySheet
          isOpen={familyManager.isFamilySheetOpen}
          categories={familyManager.categories}
          sheetState={familyManager.familySheet}
          isLoading={familyManager.familySheetLoading}
          error={familyManager.familySheetError}
          onOpenChange={(open) => {
            if (!open) familyManager.closeFamilySheet();
          }}
          onUpdate={familyManager.handleFamilySheetChange}
          onSave={familyManager.saveFamilySheet}
          onArchive={familyManager.archiveFamily}
          onRestore={familyManager.restoreFamily}
          onDelete={familyManager.deleteFamily}
        />

        <RequestSheet
          isOpen={requestManager.isRequestSheetOpen}
          sheetState={requestManager.requestSheet}
          families={families}
          isLoading={requestManager.requestSheetLoading}
          error={requestManager.requestSheetError}
          answeringRequestId={requestManager.answeringRequestId}
          onToggleStatus={async (nextStatus) => {
            if (nextStatus === "ACTIVE" && requestManager.requestSheet.id) {
              const originalLink =
                requestManager.requestSheet.originalLinkedToFamily ?? requestManager.requestSheet.linkedToFamily;
              const isHouseholdRequest = originalLink === "household";
              await requestManager.reopenRequest(requestManager.requestSheet.id, isHouseholdRequest);
            }
          }}
          onOpenChange={(open: boolean) => {
            if (!open) requestManager.closeRequestSheet();
          }}
          onUpdate={requestManager.handleRequestSheetChange}
          onSave={requestManager.saveRequestSheet}
          onMarkAnswered={() => {
            if (requestManager.requestSheet.id) {
              const isHouseholdRequest = requestManager.requestSheet.linkedToFamily === "household";
              requestManager.markRequestAnswered(requestManager.requestSheet.id, isHouseholdRequest);
            }
          }}
          onDelete={() => {
            if (requestManager.requestSheet.id) {
              const isHouseholdRequest = requestManager.requestSheet.linkedToFamily === "household";
              requestManager.deleteRequest(requestManager.requestSheet.id, isHouseholdRequest);
            }
          }}
        />

        <FamilyDetailDialog
          isOpen={familyDetailDialogOpen}
          family={selectedFamilyForDetail}
          requests={requests}
          answeringRequestId={requestManager.answeringRequestId}
          onOpenChange={(open) => {
            setFamilyDetailDialogOpen(open);
            if (!open) {
              setSelectedFamilyForDetail(null);
            }
          }}
          onEditRequest={requestManager.openRequestSheet}
          onMarkAnswered={(requestId) => requestManager.markRequestAnswered(requestId, false)}
        />
      </div>
    </ProtectedView>
  );
}
