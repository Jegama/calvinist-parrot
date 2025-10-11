"use client";

import { useEffect, useMemo, useState } from "react";
import { account } from "@/utils/appwrite";
import { Models } from "appwrite";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";

type AppwriteUser = Models.User<Models.Preferences>;

type Member = {
  id: string;
  displayName: string;
  role: string;
  appwriteUserId: string;
};

type Family = {
  id: string;
  familyName: string;
  parents: string;
  children: string[];
  categoryTag?: string | null;
  lastPrayedAt?: string | null;
  lastPrayedByMemberId?: string | null;
  lastPrayedBy?: { id: string; displayName: string } | null;
  createdAt?: string;
};

type PersonalRequest = {
  id: string;
  requestText: string;
  notes?: string | null;
  linkedScripture?: string | null;
  lastPrayedAt?: string | null;
  dateAdded?: string;
  status?: "ACTIVE" | "ANSWERED" | "ARCHIVED";
  answeredAt?: string | null;
};

type Rotation = {
  families: Family[];
  personal: PersonalRequest[];
};

const defaultCategories = [
  "Church Friends",
  "Neighbors",
  "Extended Family",
  "Missionaries",
  "Coworkers",
];

function formatRelative(dateString?: string | null) {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTimeSince(dateString?: string | null) {
  if (!dateString) return "Not yet";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Not yet";
  const diff = Date.now() - date.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  const days = Math.floor(diff / dayMs);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function determineNextMemberId(family: Family, members: Member[]): string | undefined {
  if (!members.length) return undefined;
  if (members.length === 1) return members[0].id;
  const lastId = family.lastPrayedByMemberId;
  if (!lastId) return members[0].id;
  const next = members.find((member) => member.id !== lastId);
  return next?.id ?? members[0].id;
}

function normalizeChildren(input: string) {
  return input
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function appendUserId(path: string, userId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}userId=${encodeURIComponent(userId)}`;
}

async function readErrorMessage(response: Response) {
  try {
    const data = await response.json();
    if (data && typeof data.error === "string" && data.error.trim().length) {
      return data.error.trim();
    }
  } catch {
    // Ignore parse issues; we'll fall back to generic messaging.
  }
  if (response.status >= 500) return "Unexpected server error. Please try again.";
  return "Unable to process this request right now.";
}

export default function PrayerTrackerPage() {
  const [user, setUser] = useState<AppwriteUser | null>(null);
  const [spaceName, setSpaceName] = useState<string | null>(null);
  const [spaceLoaded, setSpaceLoaded] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [personal, setPersonal] = useState<PersonalRequest[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [newFamily, setNewFamily] = useState({
    familyName: "",
    parents: "",
    children: "",
    categorySelect: "none",
    customCategory: "",
  });
  const [familyFormError, setFamilyFormError] = useState<string | null>(null);

  const [newPersonal, setNewPersonal] = useState({ text: "", notes: "" });
  const [personalFormError, setPersonalFormError] = useState<string | null>(null);

  const [rotation, setRotation] = useState<Rotation | null>(null);
  const [familyAssignments, setFamilyAssignments] = useState<Record<string, string>>({});
  const [personalSelections, setPersonalSelections] = useState<Record<string, boolean>>({});
  const [isComputing, setIsComputing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [rotationError, setRotationError] = useState<string | null>(null);

  const [isFamilySheetOpen, setIsFamilySheetOpen] = useState(false);
  const [familySheetLoading, setFamilySheetLoading] = useState(false);
  const [familySheet, setFamilySheet] = useState({
    id: "",
    familyName: "",
    parents: "",
    children: "",
    categorySelect: "none",
    customCategory: "",
  });
  const [familySheetError, setFamilySheetError] = useState<string | null>(null);

  const [isPersonalSheetOpen, setIsPersonalSheetOpen] = useState(false);
  const [personalSheetLoading, setPersonalSheetLoading] = useState(false);
  const [personalSheet, setPersonalSheet] = useState({
    id: "",
    requestText: "",
    notes: "",
    status: "ACTIVE" as "ACTIVE" | "ANSWERED" | "ARCHIVED",
  });
  const [personalSheetError, setPersonalSheetError] = useState<string | null>(null);
  const [answeringPersonalId, setAnsweringPersonalId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const currentUser = await account.get();
        setUser(currentUser);
        await refreshAll(currentUser.$id);
      } catch (error) {
        console.error("Not logged in or failed to load user", error);
        setSpaceLoaded(true);
      }
    })();
  }, []);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    defaultCategories.forEach((category) => unique.add(category));
    families.forEach((family) => {
      if (family.categoryTag) unique.add(family.categoryTag);
    });
    if (newFamily.categorySelect === "__custom" && newFamily.customCategory.trim().length) {
      unique.add(newFamily.customCategory.trim());
    }
    return Array.from(unique);
  }, [families, newFamily.categorySelect, newFamily.customCategory]);

  const filteredFamilies = useMemo(() => {
    if (categoryFilter === "all") return families;
    return families.filter((family) => family.categoryTag === categoryFilter);
  }, [families, categoryFilter]);

  const hasSelections = useMemo(() => {
    const familySelected = rotation?.families.some((family) => {
      const assigned = familyAssignments[family.id];
      return assigned && assigned !== "skip";
    });
    const personalSelected = rotation?.personal.some((item) => personalSelections[item.id]);
    return Boolean(familySelected || personalSelected);
  }, [familyAssignments, personalSelections, rotation]);

  async function refreshAll(userId: string) {
    setSpaceLoaded(false);
    await Promise.all([loadSpace(userId), refreshLists(userId)]);
    setSpaceLoaded(true);
  }

  async function loadSpace(userId: string) {
    try {
      const res = await fetch(`/api/prayer-tracker/spaces?userId=${userId}`);
      if (!res.ok) {
        setSpaceName(null);
        setMembers([]);
        return null;
      }
      const data = await res.json();
      setSpaceName(data?.space?.spaceName ?? null);
      setMembers(Array.isArray(data?.space?.members) ? data.space.members : []);
      return data.space ?? null;
    } catch (error) {
      console.error("Failed to load space", error);
      setSpaceName(null);
      setMembers([]);
      return null;
    }
  }

  async function refreshLists(userId: string) {
    try {
      const [familiesRes, personalRes] = await Promise.all([
        fetch(`/api/prayer-tracker/families?userId=${userId}`),
        fetch(`/api/prayer-tracker/personal-requests?userId=${userId}`),
      ]);

      if (familiesRes.ok) {
        const familiesData = await familiesRes.json();
        setFamilies(Array.isArray(familiesData) ? familiesData : []);
      }
      if (personalRes.ok) {
        const personalData = await personalRes.json();
        setPersonal(Array.isArray(personalData) ? personalData : []);
      }
    } catch (error) {
      console.error("Failed to refresh lists", error);
    }
  }

  async function createFamily() {
    if (!user) return;
    const trimmedName = newFamily.familyName.trim();
    if (!trimmedName) {
      setFamilyFormError("Family name is required.");
      return;
    }

    const selected = newFamily.categorySelect;
    const custom = newFamily.customCategory.trim();
    const resolvedCategory =
      selected === "__custom" ? custom : selected === "none" ? "" : selected;

    if (selected === "__custom" && !resolvedCategory) {
      setFamilyFormError("Please provide a category name.");
      return;
    }

    setFamilyFormError(null);

    const payload = {
      userId: user.$id,
      familyName: trimmedName,
      parents: newFamily.parents.trim(),
      children: normalizeChildren(newFamily.children),
      categoryTag: resolvedCategory || undefined,
    };

    try {
      const response = await fetch(`/api/prayer-tracker/families`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await readErrorMessage(response);
        setFamilyFormError(message || "Unable to save family right now.");
        return;
      }
      setNewFamily({
        familyName: "",
        parents: "",
        children: "",
        categorySelect: resolvedCategory ? resolvedCategory : "none",
        customCategory: "",
      });
      await refreshLists(user.$id);
    } catch (error) {
      console.error("Failed to create family", error);
      setFamilyFormError("Unable to save family right now.");
    }
  }
  async function createPersonal() {
    if (!user) return;
    const requestText = newPersonal.text.trim();
    if (!requestText) {
      setPersonalFormError("Please enter a prayer request.");
      return;
    }
    setPersonalFormError(null);
    try {
      const response = await fetch(`/api/prayer-tracker/personal-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.$id,
          requestText,
          notes: newPersonal.notes.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const message = await readErrorMessage(response);
        setPersonalFormError(message || "Unable to save request right now.");
        return;
      }
      setNewPersonal({ text: "", notes: "" });
      await refreshLists(user.$id);
    } catch (error) {
      console.error("Failed to create personal request", error);
      setPersonalFormError("Unable to save request right now.");
    }
  }

  async function computeRotation() {
    if (!user) return;
    setIsComputing(true);
    setRotationError(null);
    try {
      const res = await fetch(`/api/prayer-tracker/rotation?userId=${user.$id}`);
      if (!res.ok) throw new Error("Failed to compute rotation");
      const data = await res.json();
      if (Array.isArray(data?.members) && data.members.length) {
        setMembers(data.members);
      }
      const fetchedFamilies: Family[] = Array.isArray(data?.families) ? data.families : [];
      const fetchedPersonal: PersonalRequest[] = Array.isArray(data?.personal) ? data.personal : [];
      setRotation({ families: fetchedFamilies, personal: fetchedPersonal });

      const effectiveMembers = Array.isArray(data?.members) && data.members.length ? data.members : members;
      const defaults: Record<string, string> = {};
      fetchedFamilies.forEach((family) => {
        const nextMember = determineNextMemberId(family, effectiveMembers);
        defaults[family.id] = nextMember ?? "skip";
      });
      setFamilyAssignments(defaults);

      const personalDefaults: Record<string, boolean> = {};
      fetchedPersonal.forEach((item) => {
        personalDefaults[item.id] = true;
      });
      setPersonalSelections(personalDefaults);
    } catch (error) {
      console.error(error);
      setRotationError("Unable to compute tonight's rotation right now.");
    } finally {
      setIsComputing(false);
    }
  }

  async function confirmRotation() {
    if (!user || !rotation) return;
    const familiesPayload = rotation.families
      .map((family) => {
        const value = familyAssignments[family.id];
        if (!value || value === "skip") return null;
        return { familyId: family.id, prayedByMemberId: value };
      })
      .filter(Boolean) as { familyId: string; prayedByMemberId: string }[];

    const personalPayload = rotation.personal
      .map((item) => (personalSelections[item.id] ? item.id : null))
      .filter(Boolean) as string[];

    if (!familiesPayload.length && !personalPayload.length) {
      setRotationError("Select at least one item before confirming.");
      return;
    }

    setIsConfirming(true);
    setRotationError(null);
    try {
      const res = await fetch(`/api/prayer-tracker/rotation/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.$id,
          familyAssignments: familiesPayload,
          personalIds: personalPayload,
        }),
      });
      if (!res.ok) throw new Error("Failed to confirm rotation");
      setRotation(null);
      setFamilyAssignments({});
      setPersonalSelections({});
      await refreshAll(user.$id);
    } catch (error) {
      console.error(error);
      setRotationError("Unable to save updates right now. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  }

  function openFamilyEditor(family: Family) {
    setFamilySheet({
      id: family.id,
      familyName: family.familyName,
      parents: family.parents,
      children: family.children.join(", "),
      categorySelect: family.categoryTag ?? "none",
      customCategory: "",
    });
    setFamilySheetError(null);
    setIsFamilySheetOpen(true);
  }

  function resetFamilySheet() {
    setFamilySheet({
      id: "",
      familyName: "",
      parents: "",
      children: "",
      categorySelect: "none",
      customCategory: "",
    });
    setFamilySheetError(null);
    setFamilySheetLoading(false);
  }

  async function saveFamilySheet() {
    if (!user || !familySheet.id) return;
    const trimmedName = familySheet.familyName.trim();
    if (!trimmedName) {
      setFamilySheetError("Family name is required.");
      return;
    }

    const selected = familySheet.categorySelect;
    const custom = familySheet.customCategory.trim();
    const resolvedCategory =
      selected === "__custom" ? custom : selected === "none" ? "" : selected;

    if (selected === "__custom" && !resolvedCategory) {
      setFamilySheetError("Please provide a category name.");
      return;
    }

    setFamilySheetLoading(true);
    setFamilySheetError(null);
    try {
      const response = await fetch(
        appendUserId(`/api/prayer-tracker/families/${familySheet.id}`, user.$id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.$id,
            familyName: trimmedName,
            parents: familySheet.parents.trim(),
            children: normalizeChildren(familySheet.children),
            categoryTag: resolvedCategory || null,
          }),
        }
      );
      if (!response.ok) {
        const message = await readErrorMessage(response);
        setFamilySheetError(message || "Unable to update this family right now.");
        return;
      }
      resetFamilySheet();
      setIsFamilySheetOpen(false);
      await refreshLists(user.$id);
    } catch (error) {
      console.error("Failed to update family", error);
      setFamilySheetError("Unable to update this family right now.");
    } finally {
      setFamilySheetLoading(false);
    }
  }
  async function archiveFamily() {
    if (!user || !familySheet.id) return;
    setFamilySheetLoading(true);
    setFamilySheetError(null);
    try {
      const response = await fetch(
        appendUserId(`/api/prayer-tracker/families/${familySheet.id}`, user.$id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.$id, archive: true }),
        }
      );
      if (!response.ok) {
        const message = await readErrorMessage(response);
        setFamilySheetError(message || "Unable to archive this family right now.");
        return;
      }
      resetFamilySheet();
      setIsFamilySheetOpen(false);
      await refreshLists(user.$id);
    } catch (error) {
      console.error("Failed to archive family", error);
      setFamilySheetError("Unable to archive this family right now.");
    } finally {
      setFamilySheetLoading(false);
    }
  }

  async function deleteFamily() {
    if (!user || !familySheet.id) return;
    setFamilySheetLoading(true);
    setFamilySheetError(null);
    try {
      const response = await fetch(
        appendUserId(`/api/prayer-tracker/families/${familySheet.id}`, user.$id),
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.$id }),
        }
      );
      if (!response.ok) {
        const message = await readErrorMessage(response);
        setFamilySheetError(message || "Unable to delete this family right now.");
        return;
      }
      resetFamilySheet();
      setIsFamilySheetOpen(false);
      await refreshLists(user.$id);
    } catch (error) {
      console.error("Failed to delete family", error);
      setFamilySheetError("Unable to delete this family right now.");
    } finally {
      setFamilySheetLoading(false);
    }
  }

  function openPersonalEditor(item: PersonalRequest) {
    setPersonalSheet({
      id: item.id,
      requestText: item.requestText,
      notes: item.notes ?? "",
      status: item.status ?? "ACTIVE",
    });
    setPersonalSheetError(null);
    setIsPersonalSheetOpen(true);
  }

  function resetPersonalSheet() {
    setPersonalSheet({ id: "", requestText: "", notes: "", status: "ACTIVE" });
    setPersonalSheetLoading(false);
    setPersonalSheetError(null);
  }

  async function savePersonalSheet() {
    if (!user || !personalSheet.id) return;
    const trimmed = personalSheet.requestText.trim();
    if (!trimmed) {
      setPersonalSheetError("Request text is required.");
      return;
    }
    setPersonalSheetLoading(true);
    setPersonalSheetError(null);
    try {
      const response = await fetch(
        appendUserId(`/api/prayer-tracker/personal-requests/${personalSheet.id}`, user.$id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.$id,
            requestText: trimmed,
            notes: personalSheet.notes.trim() || null,
          }),
        }
      );
      if (!response.ok) {
        const message = await readErrorMessage(response);
        setPersonalSheetError(message || "Unable to update this request right now.");
        return;
      }
      resetPersonalSheet();
      setIsPersonalSheetOpen(false);
      await refreshLists(user.$id);
    } catch (error) {
      console.error("Failed to update personal request", error);
      setPersonalSheetError("Unable to update this request right now.");
    } finally {
      setPersonalSheetLoading(false);
    }
  }

  async function deletePersonal(requestId: string) {
    if (!user) return;
    setPersonalSheetError(null);
    try {
      const response = await fetch(
        appendUserId(`/api/prayer-tracker/personal-requests/${requestId}`, user.$id),
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.$id }),
        }
      );
      if (!response.ok) {
        const message = await readErrorMessage(response);
        setPersonalSheetError(message || "Unable to delete this request right now.");
        return;
      }
      if (personalSheet.id === requestId) {
        resetPersonalSheet();
        setIsPersonalSheetOpen(false);
      }
      await refreshLists(user.$id);
    } catch (error) {
      console.error("Failed to delete personal request", error);
      setPersonalSheetError("Unable to delete this request right now.");
    }
  }

  async function markPersonalAnswered(requestId: string) {
    if (!user) return;
    setAnsweringPersonalId(requestId);
    setPersonalSheetError(null);
    try {
      const response = await fetch(
        appendUserId(`/api/prayer-tracker/personal-requests/${requestId}`, user.$id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.$id, markAnswered: true }),
        }
      );
      if (!response.ok) {
        const message = await readErrorMessage(response);
        setPersonalSheetError(message || "Unable to update this request right now.");
        return;
      }
      if (personalSheet.id === requestId) {
        resetPersonalSheet();
        setIsPersonalSheetOpen(false);
      }
      await refreshLists(user.$id);
    } catch (error) {
      console.error("Failed to mark answered", error);
    } finally {
      setAnsweringPersonalId(null);
    }
  }

  if (!user) {
    return (
      <Card className="max-w-2xl mx-auto mt-8 mb-8">
        <CardHeader>
          <CardTitle>Prayer Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Please log in to use the prayer tracker.</p>
        </CardContent>
      </Card>
    );
  }

  if (!spaceLoaded) {
    return (
      <Card className="max-w-2xl mx-auto mt-8 mb-8">
        <CardHeader>
          <CardTitle>Prayer Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Loading your family space...</p>
        </CardContent>
      </Card>
    );
  }

  if (!spaceName) {
    return (
      <Card className="max-w-2xl mx-auto mt-8 mb-8">
        <CardHeader>
          <CardTitle>Prayer Tracker</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>You don't have a shared family space yet.</p>
          <p>Create one from your profile page to begin tracking prayers together.</p>
        </CardContent>
      </Card>
    );
  }

  const memberNames = members.map((member) => member.displayName).join(" & ") || "Invite your spouse from your profile";

  return (
    <div className="max-w-6xl mx-auto mt-8 mb-16 space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{spaceName}</h1>
          <p className="text-sm text-muted-foreground">Prayer partners: {memberNames}</p>
        </div>
        <Button onClick={computeRotation} disabled={isComputing}>
          {isComputing ? "Computing..." : "Compute Tonight's Rotation"}
        </Button>
      </div>

      {rotationError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {rotationError}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tonight's Rotation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!rotation ? (
            <p className="text-sm text-muted-foreground">
              Generate a rotation to see suggested families and prayer requests for tonight.
            </p>
          ) : (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Families</h3>
                  <span className="text-sm text-muted-foreground">Select who will lead prayer for each family tonight.</span>
                </div>
                {rotation.families.length === 0 ? (
                  <p className="text-sm text-muted-foreground">You don't have any family cards yet.</p>
                ) : (
                  <div className="space-y-3">
                    {rotation.families.map((family) => (
                      <div key={family.id} className="rounded-lg border bg-card px-4 py-3 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold">{family.familyName}</p>
                              {family.categoryTag && (
                                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                                  {family.categoryTag}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Last prayed: {formatRelative(family.lastPrayedAt)} - by {family.lastPrayedBy?.displayName ?? "Unknown"} - {formatTimeSince(family.lastPrayedAt)}
                            </p>
                          </div>
                          <Select
                            value={familyAssignments[family.id] ?? "skip"}
                            onValueChange={(value) =>
                              setFamilyAssignments((prev) => ({
                                ...prev,
                                [family.id]: value,
                              }))
                            }
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Who is praying?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="skip">Skip tonight</SelectItem>
                              {members.map((member) => (
                                <SelectItem key={member.id} value={member.id}>
                                  {member.displayName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Our Family Requests</h3>
                  <span className="text-sm text-muted-foreground">Deselect any requests you're postponing tonight.</span>
                </div>
                {rotation.personal.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active personal requests yet.</p>
                ) : (
                  <div className="space-y-3">
                    {rotation.personal.map((item) => (
                      <label key={item.id} className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4"
                          checked={personalSelections[item.id] ?? false}
                          onChange={(event) =>
                            setPersonalSelections((prev) => ({
                              ...prev,
                              [item.id]: event.target.checked,
                            }))
                          }
                        />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">{item.requestText}</p>
                          {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                          <p className="text-xs text-muted-foreground">
                            Added {formatRelative(item.dateAdded)} - Last prayed {formatTimeSince(item.lastPrayedAt)}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setRotation(null);
                    setFamilyAssignments({});
                    setPersonalSelections({});
                  }}
                  disabled={isConfirming}
                >
                  Cancel
                </Button>
                <Button onClick={confirmRotation} disabled={isConfirming || !hasSelections}>
                  {isConfirming ? "Saving..." : "Mark as Prayed"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card className="order-1 lg:order-none">
          <CardHeader>
            <CardTitle>Family Cards</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Add a new family</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="Family name"
                  value={newFamily.familyName}
                  onChange={(event) => {
                    setNewFamily((prev) => ({ ...prev, familyName: event.target.value }));
                    setFamilyFormError(null);
                  }}
                />
                <Input
                  placeholder="Parents"
                  value={newFamily.parents}
                  onChange={(event) => setNewFamily((prev) => ({ ...prev, parents: event.target.value }))}
                />
                <Input
                  placeholder="Children (comma-separated)"
                  value={newFamily.children}
                  onChange={(event) => setNewFamily((prev) => ({ ...prev, children: event.target.value }))}
                />
                <div className="space-y-2">
                  <Select
                    value={newFamily.categorySelect}
                    onValueChange={(value) =>
                      setNewFamily((prev) => ({
                        ...prev,
                        categorySelect: value,
                        customCategory: value === "__custom" ? prev.customCategory : "",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom">Add new category...</SelectItem>
                    </SelectContent>
                  </Select>
                  {newFamily.categorySelect === "__custom" && (
                    <Input
                      placeholder="New category name"
                      value={newFamily.customCategory}
                      onChange={(event) => {
                        setNewFamily((prev) => ({ ...prev, customCategory: event.target.value }));
                        setFamilyFormError(null);
                      }}
                    />
                  )}
                </div>
              </div>
              {familyFormError && <p className="text-xs text-destructive">{familyFormError}</p>}
              <Button onClick={createFamily} className="w-full md:w-auto">
                Add Family
              </Button>
            </div>

            <Separator />

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground">Current families</h3>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filteredFamilies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add a family card to get started.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredFamilies.map((family) => (
                  <div key={family.id} className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-base font-semibold">{family.familyName}</h4>
                        {family.categoryTag && (
                          <span className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">
                            {family.categoryTag}
                          </span>
                        )}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => openFamilyEditor(family)}>
                        Edit
                      </Button>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {family.parents && <p>Parents: {family.parents}</p>}
                      {family.children.length > 0 && <p>Children: {family.children.join(", ")}</p>}
                      <p>Last prayed: {formatRelative(family.lastPrayedAt)} - by {family.lastPrayedBy?.displayName ?? "Unknown"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="order-2 lg:order-none">
          <CardHeader>
            <CardTitle>Our Family Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Input
                placeholder="Request"
                value={newPersonal.text}
                onChange={(event) => {
                  setNewPersonal((prev) => ({ ...prev, text: event.target.value }));
                  setPersonalFormError(null);
                }}
              />
              <Textarea
                placeholder="Notes (optional)"
                value={newPersonal.notes}
                onChange={(event) => setNewPersonal((prev) => ({ ...prev, notes: event.target.value }))}
              />
              {personalFormError && <p className="text-xs text-destructive">{personalFormError}</p>}
              <Button onClick={createPersonal} className="w-full">
                Add Request
              </Button>
            </div>

            <Separator />

            {personal.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active requests yet.</p>
            ) : (
              <div className="space-y-3">
                {personal.map((item) => (
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
                        <Button size="sm" variant="outline" onClick={() => openPersonalEditor(item)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => markPersonalAnswered(item.id)}
                          disabled={item.status === "ANSWERED" || answeringPersonalId === item.id}
                        >
                          {item.status === "ANSWERED" ? "Answered" : answeringPersonalId === item.id ? "Saving..." : "Mark Answered"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet
        open={isFamilySheetOpen}
        onOpenChange={(open) => {
          setIsFamilySheetOpen(open);
          if (!open) resetFamilySheet();
        }}
      >
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit family</SheetTitle>
            <SheetDescription>Update details or archive this family card.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <Input
              placeholder="Family name"
              value={familySheet.familyName}
              onChange={(event) => {
                setFamilySheet((prev) => ({ ...prev, familyName: event.target.value }));
                setFamilySheetError(null);
              }}
            />
            <Input
              placeholder="Parents"
              value={familySheet.parents}
              onChange={(event) => setFamilySheet((prev) => ({ ...prev, parents: event.target.value }))}
            />
            <Input
              placeholder="Children (comma-separated)"
              value={familySheet.children}
              onChange={(event) => setFamilySheet((prev) => ({ ...prev, children: event.target.value }))}
            />
            <div className="space-y-2">
              <Select
                value={familySheet.categorySelect}
                onValueChange={(value) =>
                  setFamilySheet((prev) => ({
                    ...prev,
                    categorySelect: value,
                    customCategory: value === "__custom" ? prev.customCategory : "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom">Add new category...</SelectItem>
                </SelectContent>
              </Select>
              {familySheet.categorySelect === "__custom" && (
                <Input
                  placeholder="New category name"
                  value={familySheet.customCategory}
                  onChange={(event) => {
                    setFamilySheet((prev) => ({ ...prev, customCategory: event.target.value }));
                    setFamilySheetError(null);
                  }}
                />
              )}
            </div>
            {familySheetError && <p className="text-xs text-destructive">{familySheetError}</p>}
          </div>
          <SheetFooter className="mt-6 gap-2">
            <div className="flex flex-1 flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={archiveFamily}
                disabled={familySheetLoading}
              >
                Archive
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={deleteFamily}
                disabled={familySheetLoading}
              >
                Delete
              </Button>
            </div>
            <div className="flex gap-2">
              <SheetClose asChild>
                <Button type="button" variant="outline" disabled={familySheetLoading}>
                  Cancel
                </Button>
              </SheetClose>
              <Button onClick={saveFamilySheet} disabled={familySheetLoading}>
                {familySheetLoading ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={isPersonalSheetOpen}
        onOpenChange={(open) => {
          setIsPersonalSheetOpen(open);
          if (!open) resetPersonalSheet();
        }}
      >
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit request</SheetTitle>
            <SheetDescription>Update or celebrate answered prayer for your family.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <Input
              placeholder="Request"
              value={personalSheet.requestText}
              onChange={(event) => {
                setPersonalSheet((prev) => ({ ...prev, requestText: event.target.value }));
                setPersonalSheetError(null);
              }}
            />
            <Textarea
              placeholder="Notes"
              value={personalSheet.notes}
              onChange={(event) => setPersonalSheet((prev) => ({ ...prev, notes: event.target.value }))}
            />
            <p className="text-xs text-muted-foreground">Status: {personalSheet.status === "ANSWERED" ? "Answered" : "Active"}</p>
            {personalSheetError && <p className="text-xs text-destructive">{personalSheetError}</p>}
          </div>
          <SheetFooter className="mt-6 gap-2">
            <div className="flex flex-1 flex-wrap gap-2">
              {personalSheet.status !== "ANSWERED" && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => personalSheet.id && markPersonalAnswered(personalSheet.id)}
                  disabled={personalSheetLoading || answeringPersonalId === personalSheet.id}
                >
                  {answeringPersonalId === personalSheet.id ? "Saving..." : "Mark Answered"}
                </Button>
              )}
              <Button
                type="button"
                variant="destructive"
                onClick={() => personalSheet.id && deletePersonal(personalSheet.id)}
                disabled={personalSheetLoading}
              >
                Delete
              </Button>
            </div>
            <div className="flex gap-2">
              <SheetClose asChild>
                <Button type="button" variant="outline" disabled={personalSheetLoading}>
                  Cancel
                </Button>
              </SheetClose>
              <Button onClick={savePersonalSheet} disabled={personalSheetLoading}>
                {personalSheetLoading ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
