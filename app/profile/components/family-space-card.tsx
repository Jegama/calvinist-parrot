// app/profile/components/family-space-card.tsx

"use client";

import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PrayerSpace, MembershipInfo } from "../types";
import { useProfileUiStore } from "../ui-store";
import {
  createPrayerSpace,
  joinPrayerSpace,
  renamePrayerSpace,
  removeMemberFromSpace,
  leavePrayerSpace,
  regenerateShareCode,
} from "../api";

type FamilySpaceCardProps = {
  space: PrayerSpace | null;
  membership: MembershipInfo | null;
  userId: string;
  userName: string;
  onUpdate: () => void;
};

export function FamilySpaceCard({
  space,
  membership,
  userId,
  userName,
  onUpdate,
}: FamilySpaceCardProps) {
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const regenerateTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const {
    pendingCode,
    spaceNameInput,
    renameDialogOpen,
    pendingRename,
    renameSubmitting,
    removeDialogOpen,
    memberToRemove,
    isRemovingMember,
    leaveDialogOpen,
    isLeavingSpace,
    transferOwnerId,
    copySuccess,
    regenerateSuccess,
    isRegenerating,
    joinError,
    setPendingCode,
    setSpaceNameInput,
    setRenameDialogOpen,
    setPendingRename,
    setRenameSubmitting,
    setRemoveDialogOpen,
    setMemberToRemove,
    setIsRemovingMember,
    setLeaveDialogOpen,
    setIsLeavingSpace,
    setTransferOwnerId,
    setCopySuccess,
    setRegenerateSuccess,
    setIsRegenerating,
    setJoinError,
  } = useProfileUiStore();

  const handleCopyCode = async () => {
    if (!space) return;
    try {
      await navigator.clipboard.writeText(space.shareCode);
      setCopySuccess(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy share code", error);
    }
  };

  const handleRegenerateCode = async () => {
    if (!space || membership?.role !== "OWNER") return;
    setIsRegenerating(true);
    try {
      await regenerateShareCode(userId, space.id);
      await onUpdate();
      setRegenerateSuccess(true);
      if (regenerateTimeoutRef.current)
        clearTimeout(regenerateTimeoutRef.current);
      regenerateTimeoutRef.current = setTimeout(() => {
        setRegenerateSuccess(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to regenerate share code", error);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleCreateSpace = async () => {
    if (!spaceNameInput.trim()) return;
    try {
      await createPrayerSpace(userId, spaceNameInput.trim());
      await onUpdate();
    } catch (error) {
      console.error("Failed to create space", error);
    }
  };

  const handleJoinSpace = async () => {
    if (!pendingCode.trim()) return;
    try {
      await joinPrayerSpace(userId, pendingCode.trim());
      await onUpdate();
      setPendingCode("");
      setJoinError("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to join space";
      setJoinError(message);
    }
  };

  const handleRename = async () => {
    if (!space || !pendingRename.trim()) return;
    setRenameSubmitting(true);
    try {
      await renamePrayerSpace(userId, space.id, pendingRename.trim());
      await onUpdate();
      setRenameDialogOpen(false);
      setPendingRename("");
    } catch (error) {
      console.error("Failed to rename space", error);
    } finally {
      setRenameSubmitting(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!space || !memberToRemove) return;
    setIsRemovingMember(true);
    try {
      await removeMemberFromSpace(userId, space.id, memberToRemove.id);
      await onUpdate();
      setRemoveDialogOpen(false);
      setMemberToRemove(null);
    } catch (error) {
      console.error("Failed to remove member", error);
    } finally {
      setIsRemovingMember(false);
    }
  };

  const handleLeaveSpace = async () => {
    if (!space) return;
    if (membership?.role === "OWNER" && !transferOwnerId) {
      return;
    }
    setIsLeavingSpace(true);
    try {
      await leavePrayerSpace(userId, space.id, transferOwnerId || undefined);
      setLeaveDialogOpen(false);
      setTransferOwnerId("");
      await onUpdate();
    } catch (error) {
      console.error("Failed to leave space", error);
    } finally {
      setIsLeavingSpace(false);
    }
  };

  return (
    <>
      <Card className="mx-auto max-w-2xl mt-8">
        <CardHeader>
          <CardTitle>Family Space</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {space ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Household name
                  </p>
                  <p className="text-lg font-semibold">{space.spaceName}</p>
                </div>
                {membership?.role === "OWNER" && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPendingRename(space.spaceName);
                      setRenameDialogOpen(true);
                    }}
                  >
                    Rename
                  </Button>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Share code</p>
                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:gap-3">
                  <span className="font-mono text-lg break-all sm:break-normal">
                    {space.shareCode}
                  </span>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 w-full sm:w-auto">
                    <Button
                      key={`copy-${copySuccess}`}
                      variant={copySuccess ? "default" : "outline"}
                      className="w-full sm:w-auto"
                      onClick={handleCopyCode}
                    >
                      {copySuccess ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      key={`regenerate-${regenerateSuccess}`}
                      variant={regenerateSuccess ? "default" : "outline"}
                      className="w-full sm:w-auto"
                      onClick={handleRegenerateCode}
                      disabled={membership?.role !== "OWNER" || isRegenerating}
                    >
                      {isRegenerating
                        ? "Regenerating..."
                        : regenerateSuccess
                        ? "Regenerated"
                        : "Regenerate"}
                    </Button>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">Members</p>
                <div className="space-y-2">
                  {space.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{member.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.role === "OWNER" ? "Owner" : "Member"}
                        </p>
                      </div>
                      {membership?.role === "OWNER" &&
                        member.id !== membership.id && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setMemberToRemove(member);
                              setRemoveDialogOpen(true);
                            }}
                          >
                            Remove
                          </Button>
                        )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (membership?.role === "OWNER") {
                      setTransferOwnerId("");
                    }
                    setLeaveDialogOpen(true);
                  }}
                >
                  Leave Space
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <p>No family space yet. Create one to invite your spouse.</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="Household name"
                    className="sm:flex-1"
                    value={spaceNameInput}
                    onChange={(e) => setSpaceNameInput(e.target.value)}
                  />
                  <Button
                    onClick={handleCreateSpace}
                    disabled={!spaceNameInput.trim()}
                  >
                    Create Family Space
                  </Button>
                </div>
              </div>
              <div>
                <p>Have a code from your spouse? Enter it to join:</p>
                <div className="flex gap-2 mt-2">
                  <div className="flex flex-1 flex-col gap-1 sm:flex-1">
                    <Input
                      placeholder="Share code"
                      className="sm:flex-1"
                      value={pendingCode}
                      onChange={(e) => {
                        setPendingCode(e.target.value);
                        if (joinError) setJoinError("");
                      }}
                    />
                    {joinError && (
                      <p className="text-sm text-destructive">{joinError}</p>
                    )}
                  </div>
                  <Button onClick={handleJoinSpace}>Join Space</Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename family space</DialogTitle>
            <DialogDescription>
              Choose a name that your household will recognize.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="Household name"
              value={pendingRename}
              onChange={(e) => setPendingRename(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameDialogOpen(false);
                setPendingRename("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={renameSubmitting || !pendingRename.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              This member will be removed from the family space. They can rejoin
              later with the share code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Remove{" "}
              <span className="font-semibold">
                {memberToRemove?.displayName}
              </span>{" "}
              from the space?
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRemoveDialogOpen(false);
                setMemberToRemove(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveMember}
              disabled={isRemovingMember}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Space Dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave family space</DialogTitle>
            <DialogDescription>
              You can rejoin later with the share code. If you&apos;re the
              owner, transfer ownership before leaving.
            </DialogDescription>
          </DialogHeader>
          {membership?.role === "OWNER" ? (
            <div className="space-y-3">
              <p className="text-sm">
                Select a new owner to take over this family space.
              </p>
              <Select
                value={transferOwnerId}
                onValueChange={setTransferOwnerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose new owner" />
                </SelectTrigger>
                <SelectContent>
                  {space?.members
                    .filter((m) => m.id !== membership.id)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.displayName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm">
              Are you sure you want to leave the family space{" "}
              <span className="font-semibold">{space?.spaceName}</span>?
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setLeaveDialogOpen(false);
                setTransferOwnerId("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleLeaveSpace}
              disabled={
                isLeavingSpace ||
                (membership?.role === "OWNER" && !transferOwnerId)
              }
            >
              Leave Space
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
