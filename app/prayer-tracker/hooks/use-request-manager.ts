import { useCallback, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import * as api from "../api";
import { dateInputToIso, isoToDateInput, resetPersonalForm, validatePersonalForm } from "../utils";
import type { AppwriteUser, NewPersonalFormState, PersonalSheetState, UnifiedRequest } from "../types";

const EMPTY_REQUEST_SHEET: PersonalSheetState = {
  id: "",
  requestText: "",
  notes: "",
  status: "ACTIVE",
  linkedToFamily: "household",
  lastPrayedAt: "",
};

type UseRequestManagerOptions = {
  user: AppwriteUser | null;
  refreshLists: (userId: string) => Promise<void>;
  queryClient: QueryClient;
};

export function useRequestManager({ user, refreshLists, queryClient }: UseRequestManagerOptions) {
  const [newRequest, setNewRequest] = useState<NewPersonalFormState>({
    text: "",
    notes: "",
    linkedToFamily: "household",
  });
  const [requestFormError, setRequestFormError] = useState<string | null>(null);

  const [isRequestSheetOpen, setIsRequestSheetOpen] = useState(false);
  const [requestSheet, setRequestSheet] = useState<PersonalSheetState>(EMPTY_REQUEST_SHEET);
  const [requestSheetLoading, setRequestSheetLoading] = useState(false);
  const [requestSheetError, setRequestSheetError] = useState<string | null>(null);
  const [answeringRequestId, setAnsweringRequestId] = useState<string | null>(null);

  const handleNewRequestChange = useCallback((changes: Partial<NewPersonalFormState>) => {
    setNewRequest((prev) => ({ ...prev, ...changes }));
    setRequestFormError(null);
  }, []);

  const resetRequestSheet = useCallback(() => {
    setRequestSheet(EMPTY_REQUEST_SHEET);
    setRequestSheetLoading(false);
    setRequestSheetError(null);
  }, []);

  const closeRequestSheet = useCallback(() => {
    setIsRequestSheetOpen(false);
    resetRequestSheet();
  }, [resetRequestSheet]);

  const createRequest = useCallback(async () => {
    if (!user) return;

    const validationError = validatePersonalForm(newRequest);
    if (validationError) {
      setRequestFormError(validationError);
      return;
    }

    setRequestFormError(null);

    const payload = {
      requestText: newRequest.text.trim(),
      notes: newRequest.notes.trim() || undefined,
      linkedToFamily: newRequest.linkedToFamily,
    };

    const result = await api.createUnifiedRequest(user.$id, payload);

    if (!result.success) {
      setRequestFormError(result.error);
      return;
    }

    setNewRequest(resetPersonalForm());
    await refreshLists(user.$id);
  }, [newRequest, refreshLists, user]);

  const openRequestSheet = useCallback((item: UnifiedRequest) => {
    const linkedTo = item.familyId || "household";
    const lastPrayedDate = isoToDateInput(item.lastPrayedAt);
    setRequestSheet({
      id: item.id,
      requestText: item.requestText,
      notes: item.notes ?? "",
      status: item.status ?? "ACTIVE",
      linkedToFamily: linkedTo,
      originalLinkedToFamily: linkedTo,
      lastPrayedAt: lastPrayedDate,
    });
    setRequestSheetError(null);
    setIsRequestSheetOpen(true);
  }, []);

  const handleRequestSheetChange = useCallback((changes: Partial<PersonalSheetState>) => {
    setRequestSheet((prev) => ({ ...prev, ...changes }));
    setRequestSheetError(null);
  }, []);

  const saveRequestSheet = useCallback(async () => {
    if (!user || !requestSheet.id) return;

    const trimmed = requestSheet.requestText.trim();
    if (!trimmed) {
      setRequestSheetError("Request text is required.");
      return;
    }

    const lastPrayedAtIso = dateInputToIso(requestSheet.lastPrayedAt);
    if (requestSheet.lastPrayedAt.trim() && !lastPrayedAtIso) {
      setRequestSheetError("Please choose a valid last prayed date.");
      return;
    }

    setRequestSheetLoading(true);
    setRequestSheetError(null);

    const isHouseholdRequest = (requestSheet.originalLinkedToFamily || requestSheet.linkedToFamily) === "household";

    const result = await api.updateUnifiedRequest(user.$id, requestSheet.id, {
      requestText: trimmed,
      notes: requestSheet.notes.trim() || null,
      lastPrayedAt: lastPrayedAtIso,
      isHouseholdRequest,
      linkedToFamily: requestSheet.linkedToFamily,
      originalLinkedToFamily: requestSheet.originalLinkedToFamily,
      status: requestSheet.status,
    });

    if (!result.success) {
      setRequestSheetError(result.error);
      setRequestSheetLoading(false);
      return;
    }

    closeRequestSheet();
    await refreshLists(user.$id);
    setRequestSheetLoading(false);
  }, [closeRequestSheet, refreshLists, requestSheet, user]);

  const deleteRequest = useCallback(
    async (requestId: string, isHouseholdRequest: boolean) => {
      if (!user) return;
      setRequestSheetError(null);

      const result = await api.deleteUnifiedRequest(user.$id, requestId, isHouseholdRequest);

      if (!result.success) {
        setRequestSheetError(result.error);
        return;
      }

      if (requestSheet.id === requestId) {
        closeRequestSheet();
      }

      await refreshLists(user.$id);
    },
    [closeRequestSheet, refreshLists, requestSheet.id, user]
  );

  const reopenRequest = useCallback(
    async (requestId: string, isHouseholdRequest: boolean) => {
      if (!user) return;
      setRequestSheetLoading(true);
      setRequestSheetError(null);

      const result = await api.updateUnifiedRequest(user.$id, requestId, {
        status: "ACTIVE",
        isHouseholdRequest,
      });

      if (!result.success) {
        setRequestSheetError(result.error);
        setRequestSheetLoading(false);
        return;
      }

      if (requestSheet.id === requestId) {
        setRequestSheet((prev) => ({
          ...prev,
          status: "ACTIVE",
        }));
      }

      await refreshLists(user.$id);
      setRequestSheetLoading(false);
    },
    [refreshLists, requestSheet.id, user]
  );

  const markRequestAnswered = useCallback(
    async (requestId: string, isHouseholdRequest: boolean) => {
      if (!user) return;
      setAnsweringRequestId(requestId);
      setRequestSheetError(null);

      const result = await api.updateUnifiedRequest(user.$id, requestId, {
        markAnswered: true,
        isHouseholdRequest,
      });

      if (!result.success) {
        setRequestSheetError(result.error);
        setAnsweringRequestId(null);
        return;
      }

      if (requestSheet.id === requestId) {
        setRequestSheet((prev) => ({
          ...prev,
          status: "ANSWERED",
        }));
      }

      await refreshLists(user.$id);
      setAnsweringRequestId(null);

      queryClient.setQueryData(["profile-overview", user.$id], (oldData: unknown) => {
        if (!oldData || typeof oldData !== "object" || !("profile" in oldData)) return oldData;
        const data = oldData as { profile?: { answeredPersonalCount?: number; answeredFamilyCount?: number } };
        if (!data.profile) return oldData;
        const profile = data.profile;
        return {
          ...data,
          profile: {
            ...profile,
            answeredPersonalCount: isHouseholdRequest
              ? (profile.answeredPersonalCount || 0) + 1
              : profile.answeredPersonalCount,
            answeredFamilyCount: !isHouseholdRequest
              ? (profile.answeredFamilyCount || 0) + 1
              : profile.answeredFamilyCount,
          },
        };
      });
    },
    [queryClient, refreshLists, requestSheet.id, user]
  );

  return {
    newRequest,
    requestFormError,
    handleNewRequestChange,
    createRequest,
    isRequestSheetOpen,
    requestSheet,
    requestSheetLoading,
    requestSheetError,
    openRequestSheet,
    closeRequestSheet,
    handleRequestSheetChange,
    saveRequestSheet,
    deleteRequest,
    reopenRequest,
    markRequestAnswered,
    answeringRequestId,
  } as const;
}
