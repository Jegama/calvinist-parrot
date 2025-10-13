// app/profile/page.tsx

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { ProtectedView } from "@/components/ProtectedView";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type Question = {
  id: string;
  question: string;
  reviewed_answer: string;
};

type ProfileStats = {
  answeredFamilyCount: number;
  answeredPersonalCount: number;
  lastPrayerAt?: string | null;
};

type SpaceMember = {
  id: string;
  displayName: string;
  appwriteUserId: string;
  role: "OWNER" | "MEMBER";
  joinedAt: string;
};

type MembershipInfo = SpaceMember & {
  spaceId: string;
};

type PrayerSpace = {
  id: string;
  spaceName: string;
  shareCode: string;
  members: SpaceMember[];
};

type RawSpaceMember = Partial<{
  id: string | number;
  displayName: string;
  appwriteUserId: string;
  role: string;
  joinedAt: string | Date;
}> | null | undefined;

type RawPrayerSpace = Partial<{
  id: string | number;
  spaceName: string;
  shareCode: string;
  members: RawSpaceMember[];
}> | null | undefined;

type RawMembershipInfo = RawSpaceMember & { spaceId?: string | number };

const toSpaceMember = (raw: RawSpaceMember): SpaceMember => ({
  id: String(raw?.id ?? ""),
  displayName: String(raw?.displayName ?? "Member"),
  appwriteUserId: String(raw?.appwriteUserId ?? ""),
  role: raw?.role === "OWNER" ? "OWNER" : "MEMBER",
  joinedAt: String(raw?.joinedAt ?? new Date().toISOString()),
});

const toPrayerSpace = (raw: RawPrayerSpace): PrayerSpace => ({
  id: String(raw?.id ?? ""),
  spaceName: String(raw?.spaceName ?? "Prayer Space"),
  shareCode: String(raw?.shareCode ?? ""),
  members: Array.isArray(raw?.members) ? raw.members.map(toSpaceMember) : [],
});

const toMembershipInfo = (raw: RawMembershipInfo): MembershipInfo => ({
  ...toSpaceMember(raw),
  spaceId: String(raw?.spaceId ?? ""),
});

export default function ProfilePage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [space, setSpace] = useState<PrayerSpace | null>(null);
  const [membership, setMembership] = useState<MembershipInfo | null>(null);
  const [pendingCode, setPendingCode] = useState<string>("");
  const [spaceNameInput, setSpaceNameInput] = useState<string>("");
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [pendingRename, setPendingRename] = useState("");
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<SpaceMember | null>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [isLeavingSpace, setIsLeavingSpace] = useState(false);
  const [transferOwnerId, setTransferOwnerId] = useState<string>("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [joinError, setJoinError] = useState<string>("");
  const router = useRouter();
  const hasFetchedForUser = useRef<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const { user, loading, logout } = useAuth();

  const fetchProfileData = useCallback(async (userId: string) => {
    try {
      const [questionsRes, profileRes, spaceRes] = await Promise.all([
        fetch(`/api/user-questions?userId=${userId}`),
        fetch(`/api/user-profile?userId=${userId}`),
        fetch(`/api/prayer-tracker/spaces?userId=${userId}`),
      ]);

      if (questionsRes.ok) {
        const fetchedQuestions = await questionsRes.json();
        setQuestions(fetchedQuestions);
      } else {
        setQuestions([]);
      }

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setProfileStats(profileData ?? null);
      } else {
        setProfileStats(null);
      }

      if (spaceRes.ok) {
        const data = await spaceRes.json();
        if (data?.space) {
          const mappedSpace = toPrayerSpace(data.space);
          setSpace(mappedSpace);
          setSpaceNameInput(mappedSpace.spaceName ?? "");
        } else {
          setSpace(null);
          setSpaceNameInput("");
        }
        if (data?.membership) {
          setMembership(toMembershipInfo(data.membership));
        } else {
          setMembership(null);
        }
      } else if (spaceRes.status === 404) {
        setSpace(null);
        setMembership(null);
        setSpaceNameInput("");
      }
    } catch (error) {
      console.error("Error fetching profile info:", error);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      hasFetchedForUser.current = null;
      setQuestions([]);
      setProfileStats(null);
      setSpace(null);
      setMembership(null);
      setSpaceNameInput("");
      setPendingCode("");
      setJoinError("");
      setRenameDialogOpen(false);
      setPendingRename("");
      setRemoveDialogOpen(false);
      setMemberToRemove(null);
      setLeaveDialogOpen(false);
      setTransferOwnerId("");
      setCopySuccess(false);
      return;
    }
    if (hasFetchedForUser.current === user.$id) return;
    hasFetchedForUser.current = user.$id;
    fetchProfileData(user.$id);
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, [loading, user, fetchProfileData]);

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/login");
    } catch (error: unknown) {
      console.error("Logout failed:", error);
    }
  };

  const fallback = (
    <Card className="max-w-2xl mx-auto mt-8 mb-8">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Checking your session… you&apos;ll be redirected to login if needed.</p>
      </CardContent>
    </Card>
  );

  if (!user) {
    return <ProtectedView fallback={fallback} />;
  }

  return (
    <ProtectedView fallback={fallback}>
      <Card className="mx-auto max-w-sm mt-10">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Name: {user.name || ""}</p>
          <p>Email: {user.email || ""}</p>
          <Button onClick={handleLogout} variant="outline" className="mt-4">
            Logout
          </Button>
        </CardContent>
      </Card>
      {profileStats && (
        <Card className="mx-auto max-w-2xl mt-6">
          <CardHeader>
            <CardTitle>Prayer Journey</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              <span className="font-semibold">Answered for our family:</span> {profileStats.answeredFamilyCount ?? 0}
            </p>
            <p>
              <span className="font-semibold">Answered for others:</span> {profileStats.answeredPersonalCount ?? 0}
            </p>
            {profileStats.lastPrayerAt && (
              <p>
                <span className="font-semibold">Last prayed together:</span> {new Date(profileStats.lastPrayerAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      <Card className="mx-auto max-w-2xl mt-8">
        <CardHeader>
          <CardTitle>Family Space</CardTitle>
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
                      variant="outline"
                      className={cn(
                        "w-full sm:w-auto transition-colors",
                        copySuccess && "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                      )}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(space.shareCode);
                          setCopySuccess(true);
                          if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
                          copyTimeoutRef.current = setTimeout(() => setCopySuccess(false), 2000);
                        } catch (error) {
                          console.error("Failed to copy share code", error);
                        }
                      }}
                    >
                      {copySuccess ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={async () => {
                        const res = await fetch(`/api/prayer-tracker/invite`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ userId: user.$id, regenerate: true }),
                        });
                        if (res.ok) {
                          const d = await res.json();
                          setSpace((prev) => (prev ? { ...prev, shareCode: d.shareCode } : prev));
                        }
                      }}
                      disabled={membership?.role !== "OWNER"}
                    >
                      Regenerate
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
                        <p className="text-xs text-muted-foreground">{member.role === "OWNER" ? "Owner" : "Member"}</p>
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
                    onClick={async () => {
                      if (!user) return;
                      const trimmedName = spaceNameInput.trim();
                      const res = await fetch(`/api/prayer-tracker/spaces`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          userId: user.$id,
                          displayName: user.name || "You",
                          spaceName: trimmedName || undefined,
                        }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        if (data?.space) {
                          const mapped = toPrayerSpace(data.space);
                          setSpace(mapped);
                          setSpaceNameInput(mapped.spaceName ?? "");
                        }
                        if (data?.membership) {
                          setMembership(toMembershipInfo(data.membership));
                        }
                      }
                    }}
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
                    {joinError && <p className="text-sm text-destructive">{joinError}</p>}
                  </div>
                  <Button
                    onClick={async () => {
                      if (!pendingCode.trim() || !user) return;
                      try {
                        const res = await fetch(`/api/prayer-tracker/accept-invite`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ userId: user.$id, shareCode: pendingCode.trim(), displayName: user.name || "Member" }),
                        });
                        if (res.ok) {
                          const d = await res.json();
                          if (d?.space) {
                            const mappedSpace = toPrayerSpace(d.space);
                            setSpace(mappedSpace);
                            setSpaceNameInput(mappedSpace.spaceName ?? "");
                          }
                          if (d?.membership) {
                            setMembership(toMembershipInfo(d.membership));
                          }
                          setPendingCode("");
                          setJoinError("");
                        } else {
                          let message = "Unable to join space";
                          try {
                            const error = await res.json();
                            if (typeof error?.error === "string" && error.error.trim()) message = error.error;
                          } catch (parseError) {
                            console.error("Failed to parse join error", parseError);
                          }
                          setJoinError(message);
                        }
                      } catch (error) {
                        console.error("Join request failed", error);
                        setJoinError("Unable to reach the server");
                      }
                    }}
                  >
                    Join Space
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {questions.length > 0 && (
        <Card className="max-w-2xl mx-auto mt-8 mb-8">
          <CardHeader>
            <CardTitle>Your Previous Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              {questions.map((question) => (
                <AccordionItem key={question.id} value={`question-${question.id}`}>
                  <AccordionTrigger>{question.question}</AccordionTrigger>
                  <AccordionContent>
                    <div className="prose dark:prose-invert max-w-none">
                      <MarkdownWithBibleVerses content={question.reviewed_answer} />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

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
            <Button
              onClick={async () => {
                if (!user || !space || !pendingRename.trim()) return;
                setRenameSubmitting(true);
                const res = await fetch(`/api/prayer-tracker/spaces`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId: user.$id, spaceId: space.id, spaceName: pendingRename.trim() }),
                });
                setRenameSubmitting(false);
                if (res.ok) {
                  const d = await res.json();
                  if (d?.space) {
                    const mapped = toPrayerSpace(d.space);
                    setSpace(mapped);
                    setSpaceNameInput(mapped.spaceName ?? "");
                  }
                  setRenameDialogOpen(false);
                }
              }}
              disabled={renameSubmitting || !pendingRename.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <Button
              variant="destructive"
              onClick={async () => {
                if (!user || !space || !memberToRemove) return;
                setIsRemovingMember(true);
                const res = await fetch(`/api/prayer-tracker/spaces`, {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId: user.$id, spaceId: space.id, removeMemberId: memberToRemove.id }),
                });
                setIsRemovingMember(false);
                if (res.ok) {
                  await fetchProfileData(user.$id);
                  setRemoveDialogOpen(false);
                  setMemberToRemove(null);
                }
              }}
              disabled={isRemovingMember}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <p className="text-sm">
                Select a new owner to take over this family space.
              </p>
              <Select value={transferOwnerId} onValueChange={setTransferOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose new owner" />
                </SelectTrigger>
                <SelectContent>
                  {space?.members
                    .filter((m) => m.id !== membership.id)
                    .map((m) => (
                      <SelectItem value={m.id} key={m.id}>
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
              onClick={async () => {
                if (!user || !space) return;
                setIsLeavingSpace(true);
                const payload: Record<string, string> = {
                  userId: user.$id,
                  spaceId: space.id,
                };
                if (membership?.role === "OWNER") {
                  if (!transferOwnerId) {
                    setIsLeavingSpace(false);
                    return;
                  }
                  payload.transferToMemberId = transferOwnerId;
                }
                const res = await fetch(`/api/prayer-tracker/spaces`, {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                setIsLeavingSpace(false);
                if (res.ok) {
                  setLeaveDialogOpen(false);
                  setTransferOwnerId("");
                  await fetchProfileData(user.$id);
                }
              }}
              disabled={isLeavingSpace || (membership?.role === "OWNER" && !transferOwnerId)}
            >
              Leave Space
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedView>
  );
}
