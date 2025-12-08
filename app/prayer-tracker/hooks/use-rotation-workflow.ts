import { useCallback, useMemo, useState } from "react";
import * as api from "../api";
import { determineNextMemberId } from "../utils";
import type { AppwriteUser, Member, Rotation } from "../types";

type UseRotationWorkflowOptions = {
  user: AppwriteUser | null;
  members: Member[];
  onMembersUpdate: (nextMembers: Member[]) => void;
  refreshAll: (userId: string) => Promise<void>;
};

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
    const prioritizedFamilies = fetchedFamilies
      .map((family, index) => ({ family, index, assignedTo: defaults[family.id] }))
      .sort((a, b) => {
        // First: current user's assignments
        const aPriority = a.assignedTo === currentMemberId ? 0 : 1;
        const bPriority = b.assignedTo === currentMemberId ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;

        // Then: group by assigned member
        const aIndex = memberOrder.indexOf(a.assignedTo || "");
        const bIndex = memberOrder.indexOf(b.assignedTo || "");
        if (aIndex !== bIndex) return aIndex - bIndex;

        // Finally: preserve original order within same member
        return a.index - b.index;
      })
      .map((entry) => entry.family);

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
