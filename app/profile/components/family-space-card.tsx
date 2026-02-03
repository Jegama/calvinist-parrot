// app/profile/components/family-space-card.tsx

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { PrayerSpace, MembershipInfo, SpaceMember } from "../types";
import { useProfileUiStore } from "../ui-store";
import { DEFAULT_ADULT_CAPACITY, DEFAULT_CHILD_CAPACITY } from "@/app/prayer-tracker/constants";
import { formatAge, getAgeBracket, getBracketLabel, isValidBirthdate } from "@/utils/ageUtils";
import {
  createPrayerSpace,
  joinPrayerSpace,
  renamePrayerSpace,
  removeMemberFromSpace,
  leavePrayerSpace,
  regenerateShareCode,
  addChildMember,
  updateMember,
  deleteHousehold,
} from "../api";

type FamilySpaceCardProps = {
  space: PrayerSpace | null;
  membership: MembershipInfo | null;
  userId: string;
  userName: string;
  onUpdate: () => void;
};

export function FamilySpaceCard({ space, membership, userId, onUpdate }: FamilySpaceCardProps) {
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regenerateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [newChildName, setNewChildName] = useState("");
  const [newChildCapacity, setNewChildCapacity] = useState<number>(1);
  const [newChildBirthdate, setNewChildBirthdate] = useState<Date | undefined>(undefined);
  const [newChildBirthdateOpen, setNewChildBirthdateOpen] = useState(false);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, number>>({});

  // Edit member dialog state
  const [editMemberDialogOpen, setEditMemberDialogOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<SpaceMember | null>(null);
  const [editBirthdate, setEditBirthdate] = useState<Date | undefined>(undefined);
  const [editBirthdateOpen, setEditBirthdateOpen] = useState(false);
  const [isUpdatingBirthdate, setIsUpdatingBirthdate] = useState(false);

  // Delete household dialog state
  const [deleteHouseholdDialogOpen, setDeleteHouseholdDialogOpen] = useState(false);
  const [isDeletingHousehold, setIsDeletingHousehold] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

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

  // Create stable member IDs string for effect dependency
  const memberIds =
    space?.members
      .map((m) => m.id)
      .sort()
      .join(",") ?? "";

  useEffect(() => {
    const drafts: Record<string, number> = {};
    space?.members.forEach((member) => {
      const defaultCapacity = member.isChild ? DEFAULT_CHILD_CAPACITY : DEFAULT_ADULT_CAPACITY;
      drafts[member.id] = member.assignmentCapacity ?? defaultCapacity;
    });
    setCapacityDrafts(drafts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberIds]); // Only re-run when member IDs change, not on every render

  // Calculate total capacity and detect zero capacity warning
  const totalCapacity = useMemo(() => {
    if (!space?.members) return 0;
    return space.members.reduce((sum, member) => {
      // Use the actual saved capacity from the member object, not the draft
      const capacity = member.assignmentCapacity ?? (member.isChild ? DEFAULT_CHILD_CAPACITY : DEFAULT_ADULT_CAPACITY);
      return sum + Math.max(0, capacity);
    }, 0);
  }, [space?.members]);

  const showZeroCapacityWarning = space && space.members.length > 0 && totalCapacity === 0;

  // Check if delete household option should be available
  // Only show when user is owner AND is the only adult with an account
  const canDeleteHousehold = useMemo(() => {
    if (!space || membership?.role !== "OWNER") return false;
    const adultAccountMembers = space.members.filter(
      (m) => m.appwriteUserId && !m.isChild
    );
    return adultAccountMembers.length === 1;
  }, [space, membership?.role]);

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

  const handleAddChild = async () => {
    if (!newChildName.trim()) return;
    setIsAddingChild(true);
    try {
      const birthdateStr = newChildBirthdate ? newChildBirthdate.toISOString() : undefined;
      await addChildMember(userId, newChildName.trim(), newChildCapacity, birthdateStr);
      setNewChildName("");
      setNewChildCapacity(1);
      setNewChildBirthdate(undefined);
      await onUpdate();
    } catch (error) {
      console.error("Failed to add child member", error);
    } finally {
      setIsAddingChild(false);
    }
  };

  const handleUpdateCapacity = async (memberId: string) => {
    const capacity = capacityDrafts[memberId];
    if (capacity === undefined) return;
    setSavingMemberId(memberId);
    try {
      await updateMember(userId, memberId, { assignmentCapacity: capacity });
      await onUpdate();
    } catch (error) {
      console.error("Failed to update member", error);
    } finally {
      setSavingMemberId(null);
    }
  };

  const handleRegenerateCode = async () => {
    if (!space || membership?.role !== "OWNER") return;
    setIsRegenerating(true);
    try {
      await regenerateShareCode(userId);
      await onUpdate();
      setRegenerateSuccess(true);
      if (regenerateTimeoutRef.current) clearTimeout(regenerateTimeoutRef.current);
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
      const message = error instanceof Error ? error.message : "Unable to join space";
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

  const handleDeleteHousehold = async () => {
    if (!space || !canDeleteHousehold) return;
    if (deleteConfirmText !== "DELETE") return;

    setIsDeletingHousehold(true);
    try {
      await deleteHousehold(userId, space.id);
      setDeleteHouseholdDialogOpen(false);
      setDeleteConfirmText("");
      await onUpdate();
    } catch (error) {
      console.error("Failed to delete household", error);
    } finally {
      setIsDeletingHousehold(false);
    }
  };

  return (
    <>
      <Card className="mx-auto max-w-2xl mt-8">
        <CardHeader>
          <CardTitle className="text-2xl font-serif">Family Space</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {space ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Household name</p>
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
                  <span className="font-mono text-lg break-all sm:break-normal">{space.shareCode}</span>
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
                      {isRegenerating ? "Regenerating..." : regenerateSuccess ? "Regenerated" : "Regenerate"}
                    </Button>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">Members</p>
                {showZeroCapacityWarning && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      All members have zero capacity. Prayer rotations will not assign any families until at least one
                      member has capacity greater than zero.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  {space.members.map((member) => {
                    const hasValidBirthdate = member.birthdate && isValidBirthdate(member.birthdate);
                    const ageDisplay = hasValidBirthdate ? formatAge(member.birthdate!) : null;
                    const bracket = hasValidBirthdate ? getAgeBracket(member.birthdate!) : null;

                    return (
                      <div key={member.id} className="flex flex-col gap-3 rounded-md border p-3">
                        <div className="flex flex-col gap-1">
                          {/* Line 1: Name + CHILD badge */}
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{member.displayName}</p>
                            {member.isChild && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Child
                              </span>
                            )}
                          </div>
                          {/* Line 2: Age + Bracket + Edit (for children) */}
                          {member.isChild && (
                            <div className="flex flex-wrap items-center gap-2">
                              {ageDisplay && (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                  {ageDisplay}
                                </span>
                              )}
                              {bracket && (
                                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                                  {getBracketLabel(bracket)}
                                </span>
                              )}
                              {membership?.role === "OWNER" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    setMemberToEdit(member);
                                    setEditBirthdate(hasValidBirthdate ? new Date(member.birthdate!) : undefined);
                                    setEditMemberDialogOpen(true);
                                  }}
                                >
                                  <CalendarIcon className="mr-1 h-3 w-3" />
                                  {hasValidBirthdate ? "Edit" : "Add birthdate"}
                                </Button>
                              )}
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">{member.role === "OWNER" ? "Owner" : "Member"}</p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground">Capacity</label>
                            <Input
                              type="number"
                              className="w-24"
                              min={0}
                              value={capacityDrafts[member.id] ?? member.assignmentCapacity ?? 0}
                              disabled={membership?.role !== "OWNER"}
                              onChange={(e) =>
                                setCapacityDrafts((prev) => ({
                                  ...prev,
                                  [member.id]: Number.parseInt(e.target.value || "0", 10),
                                }))
                              }
                              onBlur={() => {
                                // Auto-save on blur if value changed
                                const currentDraft = capacityDrafts[member.id];
                                const original = member.assignmentCapacity ?? 0;
                                if (
                                  currentDraft !== undefined &&
                                  currentDraft !== original &&
                                  membership?.role === "OWNER"
                                ) {
                                  handleUpdateCapacity(member.id);
                                }
                              }}
                            />
                            {membership?.role === "OWNER" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateCapacity(member.id)}
                                disabled={savingMemberId === member.id}
                              >
                                {savingMemberId === member.id ? "Saving..." : "Save"}
                              </Button>
                            )}
                          </div>
                          {membership?.role === "OWNER" && member.id !== membership.id && (
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
                      </div>
                    );
                  })}
                </div>
                {membership?.role === "OWNER" && (
                  <div className="mt-3 space-y-2 rounded-md border p-3">
                    <p className="text-sm font-semibold">Add a child</p>
                    <p className="text-xs text-muted-foreground">
                      Children under 18 can participate without their own account. When they come of age, invite
                      them to create an account and join your household using the share code.
                    </p>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                          placeholder="Child's name"
                          value={newChildName}
                          onChange={(e) => setNewChildName(e.target.value)}
                          className="sm:flex-1"
                        />
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground">Capacity</label>
                          <Input
                            type="number"
                            className="w-20"
                            min={0}
                            value={newChildCapacity}
                            onChange={(e) =>
                              setNewChildCapacity(() => {
                                const parsed = Number.parseInt(e.target.value || "1", 10);
                                return Number.isNaN(parsed) ? 1 : parsed;
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground">Birthdate</label>
                          <Popover open={newChildBirthdateOpen} onOpenChange={setNewChildBirthdateOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-40 justify-start font-normal">
                                {newChildBirthdate
                                  ? newChildBirthdate.toLocaleDateString()
                                  : "Select date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={newChildBirthdate}
                                defaultMonth={newChildBirthdate}
                                captionLayout="dropdown"
                                startMonth={new Date(new Date().getFullYear() - 18, 0)}
                                endMonth={new Date(new Date().getFullYear(), 11)}
                                onSelect={(date) => {
                                  flushSync(() => {
                                    setNewChildBirthdate(date);
                                    setNewChildBirthdateOpen(false);
                                  });
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                          {newChildBirthdate && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setNewChildBirthdate(undefined)}
                              className="h-8 px-2 text-xs text-muted-foreground"
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Birthdate is required to enable age-appropriate guidance in the Heritage Journal feature
                        </p>
                      </div>
                    </div>
                    <Button onClick={handleAddChild} disabled={isAddingChild || !newChildName.trim() || !newChildBirthdate}>
                      {isAddingChild ? "Adding..." : "Add Child"}
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {canDeleteHousehold && (
                  <Button
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => {
                      setDeleteConfirmText("");
                      setDeleteHouseholdDialogOpen(true);
                    }}
                  >
                    Delete Household
                  </Button>
                )}
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
                  <Button onClick={handleCreateSpace} disabled={!spaceNameInput.trim()}>
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
                    {joinError && <p className="text-sm text-destructive">{joinError}</p>}
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
            <DialogDescription>Choose a name that your household will recognize.</DialogDescription>
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
            <Button onClick={handleRename} disabled={renameSubmitting || !pendingRename.trim()}>
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
              This member will be removed from the family space. They can rejoin later with the share code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Remove <span className="font-semibold">{memberToRemove?.displayName}</span> from the space?
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
            <Button variant="destructive" onClick={handleRemoveMember} disabled={isRemovingMember}>
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
              You can rejoin later with the share code. If you&apos;re the owner, transfer ownership before leaving.
            </DialogDescription>
          </DialogHeader>
          {membership?.role === "OWNER" ? (
            <div className="space-y-3">
              <p className="text-sm">Select a new owner to take over this family space.</p>
              <Select value={transferOwnerId} onValueChange={setTransferOwnerId}>
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
              Are you sure you want to leave the family space <span className="font-semibold">{space?.spaceName}</span>?
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
              disabled={isLeavingSpace || (membership?.role === "OWNER" && !transferOwnerId)}
            >
              Leave Space
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Birthdate Dialog */}
      <Dialog open={editMemberDialogOpen} onOpenChange={setEditMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit birthdate</DialogTitle>
            <DialogDescription>
              Set or update the birthdate for {memberToEdit?.displayName}. This helps track their age and developmental stage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground">Birthdate</label>
              <Popover open={editBirthdateOpen} onOpenChange={setEditBirthdateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-44 justify-start font-normal">
                    {editBirthdate ? editBirthdate.toLocaleDateString() : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editBirthdate}
                    defaultMonth={editBirthdate}
                    captionLayout="dropdown"
                    startMonth={new Date(new Date().getFullYear() - 18, 0)}
                    endMonth={new Date(new Date().getFullYear(), 11)}
                    onSelect={(date) => {
                      flushSync(() => {
                        setEditBirthdate(date);
                        setEditBirthdateOpen(false);
                      });
                    }}
                  />
                </PopoverContent>
              </Popover>
              {editBirthdate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditBirthdate(undefined)}
                  className="h-8 px-2 text-xs text-muted-foreground"
                >
                  Clear
                </Button>
              )}
            </div>
            {editBirthdate && (() => {
              const editBracket = getAgeBracket(editBirthdate);
              return (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Age:</span>
                  <span className="font-medium">{formatAge(editBirthdate)}</span>
                  {editBracket && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                      {getBracketLabel(editBracket)}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditMemberDialogOpen(false);
                setMemberToEdit(null);
                setEditBirthdate(undefined);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!memberToEdit) return;
                setIsUpdatingBirthdate(true);
                try {
                  const birthdateStr = editBirthdate ? editBirthdate.toISOString() : null;
                  await updateMember(userId, memberToEdit.id, { birthdate: birthdateStr });
                  await onUpdate();
                  setEditMemberDialogOpen(false);
                  setMemberToEdit(null);
                  setEditBirthdate(undefined);
                } catch (error) {
                  console.error("Failed to update birthdate", error);
                } finally {
                  setIsUpdatingBirthdate(false);
                }
              }}
              disabled={isUpdatingBirthdate}
            >
              {isUpdatingBirthdate ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Household Dialog */}
      <Dialog open={deleteHouseholdDialogOpen} onOpenChange={setDeleteHouseholdDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Household Permanently</DialogTitle>
            <DialogDescription>
              This action <span className="font-semibold">cannot be undone</span>. This will permanently delete your
              household and all associated data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-semibold mb-2">The following data will be permanently deleted:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>All household members (including children)</li>
                  <li>All families you&apos;re praying for and their prayer requests</li>
                  <li>All personal/household prayer requests</li>
                  <li>All prayer journal entries</li>
                  <li>All personal journal entries and AI reflections</li>
                  <li>All kids discipleship annual plans</li>
                  <li>All kids discipleship monthly visions</li>
                </ul>
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                To confirm, type <span className="font-mono font-semibold text-foreground">DELETE</span> below:
              </p>
              <Input
                placeholder="Type DELETE to confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteHouseholdDialogOpen(false);
                setDeleteConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteHousehold}
              disabled={isDeletingHousehold || deleteConfirmText !== "DELETE"}
            >
              {isDeletingHousehold ? "Deleting..." : "Delete Household"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
