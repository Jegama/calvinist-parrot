import { useCallback, useMemo, useState } from "react";
import * as api from "../api";
import { determineNextMemberId } from "../utils";
import type { AppwriteUser, Member, Rotation, Family } from "../types";

type UseRotationWorkflowOptions = {
  user: AppwriteUser | null;
  members: Member[];
  onMembersUpdate: (nextMembers: Member[]) => void;
  refreshAll: (userId: string) => Promise<void>;
};

type FamilyWithAssignment = {
  family: Family;
  index: number;
  assignedTo: string;
};

/**
 * Sorts families for optimal rotation display:
 * 1. Current user's assignments appear first (to show user their responsibilities)
 * 2. Within priority groups, families are grouped by assigned member (visual organization)
 * 3. Within each member's group, original order is preserved (maintains priority/date sorting)
 *
 * This creates a hierarchical sort that balances user focus with organizational clarity.
 */
function sortFamiliesByAssignment(
  families: FamilyWithAssignment[],
  currentMemberId: string | undefined,
  memberOrder: string[]
): Family[] {
  return families
    .sort((a, b) => {
      // Priority 1: Current user's assignments first
      const aPriority = a.assignedTo === currentMemberId ? 0 : 1;
      const bPriority = b.assignedTo === currentMemberId ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;

      // Priority 2: Group by assigned member for visual clarity
      const aIndex = memberOrder.indexOf(a.assignedTo || "");
      const bIndex = memberOrder.indexOf(b.assignedTo || "");
      if (aIndex !== bIndex) return aIndex - bIndex;

      // Priority 3: Preserve original order within same assignment
      return a.index - b.index;
    })
    .map((entry) => entry.family);
}

export function useRotationWorkflow({ user, members, onMembersUpdate, refreshAll }: UseRotationWorkflowOptions) {
  const [rotation, setRotation] = useState<Rotation | null>(null);
  const [familyAssignments, setFamilyAssignments] = useState<Record<string, string>>({});
  const [personalSelections, setPersonalSelections] = useState<Record<string, boolean>>({});
  const [isComputing, setIsComputing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [rotationError, setRotationError] = useState<string | null>(null);

  const handleFamilyAssignmentChange = useCallback((familyId: string, value: string) => {
    setFamilyAssignments((prev) => ({ ...prev, [familyId]: value }));
  }, []);

  const handlePersonalSelectionChange = useCallback((requestId: string, value: boolean) => {
    setPersonalSelections((prev) => ({ ...prev, [requestId]: value }));
  }, []);

  const handleCancelRotation = useCallback(() => {
    setRotation(null);
    setFamilyAssignments({});
    setPersonalSelections({});
    setRotationError(null);
  }, []);

  const hasSelections = useMemo(() => {
    const familySelected = rotation?.families.some((family) => {
      const assigned = familyAssignments[family.id];
      return assigned && assigned !== "skip";
    });

    const personalSelected = rotation?.personal.some((item) => personalSelections[item.id]);
    return Boolean(familySelected || personalSelected);
  }, [familyAssignments, personalSelections, rotation]);

  const computeRotation = useCallback(async () => {
    if (!user) return;
    setIsComputing(true);
    setRotationError(null);

    const result = await api.computeRotation(user.$id);

    if (!result.success) {
      setRotationError(result.error);
      setIsComputing(false);
      return;
    }

    const { families: fetchedFamilies, personal: fetchedPersonal, members: fetchedMembers, assignments } = result.data;

    if (fetchedMembers && fetchedMembers.length) {
      onMembersUpdate(fetchedMembers);
    }

    const effectiveMembers = fetchedMembers && fetchedMembers.length ? fetchedMembers : members;

    const defaults: Record<string, string> = {};
    fetchedFamilies.forEach((family) => {
      const suggested = assignments?.[family.id];
      if (suggested) {
        defaults[family.id] = suggested;
        return;
      }

      const nextMember = determineNextMemberId(family, effectiveMembers);
      defaults[family.id] = nextMember ?? "skip";
    });

    const currentMemberId = effectiveMembers.find((member) => member.appwriteUserId === user.$id)?.id;

    // Sort families by assigned member to group them visually
    const memberOrder = effectiveMembers.map((m) => m.id);
    const familiesWithAssignments = fetchedFamilies.map((family, index) => ({
      family,
      index,
      assignedTo: defaults[family.id],
    }));
    const prioritizedFamilies = sortFamiliesByAssignment(familiesWithAssignments, currentMemberId, memberOrder);

    setRotation({ families: prioritizedFamilies, personal: fetchedPersonal, assignments: defaults });
    setFamilyAssignments(defaults);

    const personalDefaults: Record<string, boolean> = {};
    fetchedPersonal.forEach((item) => {
      personalDefaults[item.id] = true;
    });
    setPersonalSelections(personalDefaults);
    setIsComputing(false);
  }, [members, onMembersUpdate, user]);

  const confirmRotation = useCallback(async () => {
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

    const result = await api.confirmRotation(user.$id, {
      userId: user.$id,
      familyAssignments: familiesPayload,
      personalIds: personalPayload,
    });

    if (!result.success) {
      setRotationError(result.error);
      setIsConfirming(false);
      return;
    }

    handleCancelRotation();
    await refreshAll(user.$id);
    setIsConfirming(false);
  }, [familyAssignments, handleCancelRotation, personalSelections, refreshAll, rotation, user]);

  return {
    rotation,
    familyAssignments,
    personalSelections,
    isComputing,
    isConfirming,
    rotationError,
    hasSelections,
    computeRotation,
    confirmRotation,
    handleFamilyAssignmentChange,
    handlePersonalSelectionChange,
    handleCancelRotation,
  } as const;
}
