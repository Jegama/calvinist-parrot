import { useCallback, useMemo, useState } from "react";
import * as api from "../api";
import { ARCHIVED_CATEGORY } from "../constants";
import {
  buildFamilyPayload,
  dateInputToIso,
  defaultCategories,
  isoToDateInput,
  normalizeChildren,
  resetFamilyForm,
  resolveCategoryTag,
  validateFamilyForm,
} from "../utils";
import type { AppwriteUser, Family, FamilySheetState, NewFamilyFormState } from "../types";

type UseFamilyManagerOptions = {
  user: AppwriteUser | null;
  families: Family[];
  refreshLists: (userId: string) => Promise<void>;
};

type CategoryFilter = string;

const EMPTY_FAMILY_SHEET: FamilySheetState = {
  id: "",
  familyName: "",
  parents: "",
  children: "",
  categorySelect: "none",
  customCategory: "",
  lastPrayedAt: "",
  archivedAt: null,
};

export function useFamilyManager({ user, families, refreshLists }: UseFamilyManagerOptions) {
  const [newFamily, setNewFamily] = useState<NewFamilyFormState>({
    familyName: "",
    parents: "",
    children: "",
    categorySelect: "none",
    customCategory: "",
  });
  const [familyFormError, setFamilyFormError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  const [isFamilySheetOpen, setIsFamilySheetOpen] = useState(false);
  const [familySheet, setFamilySheet] = useState<FamilySheetState>(EMPTY_FAMILY_SHEET);
  const [familySheetLoading, setFamilySheetLoading] = useState(false);
  const [familySheetError, setFamilySheetError] = useState<string | null>(null);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    defaultCategories.forEach((category) => unique.add(category));
    families.forEach((family) => {
      if (family.categoryTag && family.categoryTag !== ARCHIVED_CATEGORY) {
        unique.add(family.categoryTag);
      }
    });
    if (newFamily.categorySelect === "__custom" && newFamily.customCategory.trim().length) {
      unique.add(newFamily.customCategory.trim());
    }
    unique.add(ARCHIVED_CATEGORY);
    return Array.from(unique);
  }, [families, newFamily.categorySelect, newFamily.customCategory]);

  const filteredFamilies = useMemo(() => {
    const sortByName = (list: Family[]) =>
      [...list].sort((a, b) => a.familyName.localeCompare(b.familyName, undefined, { sensitivity: "base" }));

    if (categoryFilter === "all") {
      return sortByName(families.filter((family) => !family.archivedAt));
    }
    if (categoryFilter === ARCHIVED_CATEGORY) {
      return sortByName(families.filter((family) => Boolean(family.archivedAt)));
    }
    return sortByName(families.filter((family) => family.categoryTag === categoryFilter && !family.archivedAt));
  }, [families, categoryFilter]);

  const handleNewFamilyChange = useCallback((changes: Partial<NewFamilyFormState>) => {
    setNewFamily((prev) => ({ ...prev, ...changes }));
    setFamilyFormError(null);
  }, []);

  const handleFamilySheetChange = useCallback((changes: Partial<FamilySheetState>) => {
    setFamilySheet((prev) => ({ ...prev, ...changes }));
    setFamilySheetError(null);
  }, []);

  const resetFamilySheet = useCallback(() => {
    setFamilySheet(EMPTY_FAMILY_SHEET);
    setFamilySheetLoading(false);
    setFamilySheetError(null);
  }, []);

  const closeFamilySheet = useCallback(() => {
    setIsFamilySheetOpen(false);
    resetFamilySheet();
  }, [resetFamilySheet]);

  const createFamily = useCallback(async () => {
    if (!user) return;

    const validationError = validateFamilyForm(newFamily);
    if (validationError) {
      setFamilyFormError(validationError);
      return;
    }

    setFamilyFormError(null);

    const payload = buildFamilyPayload(user.$id, newFamily);
    const result = await api.createFamily(user.$id, payload);

    if (!result.success) {
      setFamilyFormError(result.error);
      return;
    }

    const resolvedCategory = resolveCategoryTag(newFamily.categorySelect, newFamily.customCategory);
    setNewFamily(resetFamilyForm(resolvedCategory || undefined));

    await refreshLists(user.$id);
  }, [newFamily, refreshLists, user]);

  const openFamilySheet = useCallback((family: Family) => {
    const category = family.categoryTag ?? "none";
    const lastPrayedDate = isoToDateInput(family.lastPrayedAt);
    setFamilySheet({
      id: family.id,
      familyName: family.familyName,
      parents: family.parents,
      children: family.children.join(", "),
      categorySelect: category,
      customCategory: "",
      lastPrayedAt: lastPrayedDate,
      archivedAt: family.archivedAt ?? null,
    });
    setFamilySheetError(null);
    setIsFamilySheetOpen(true);
  }, []);

  const saveFamilySheet = useCallback(async () => {
    if (!user || !familySheet.id) return;

    const trimmedName = familySheet.familyName.trim();
    if (!trimmedName) {
      setFamilySheetError("Family name is required.");
      return;
    }

    const resolvedCategory = resolveCategoryTag(familySheet.categorySelect, familySheet.customCategory);
    if (familySheet.categorySelect === "__custom" && !resolvedCategory) {
      setFamilySheetError("Please provide a category name.");
      return;
    }

    const lastPrayedAtIso = dateInputToIso(familySheet.lastPrayedAt);
    if (familySheet.lastPrayedAt.trim() && !lastPrayedAtIso) {
      setFamilySheetError("Please choose a valid last prayed date.");
      return;
    }

    setFamilySheetLoading(true);
    setFamilySheetError(null);

    const result = await api.updateFamily(user.$id, familySheet.id, {
      familyName: trimmedName,
      parents: familySheet.parents.trim(),
      children: normalizeChildren(familySheet.children),
      categoryTag: resolvedCategory || null,
      lastPrayedAt: lastPrayedAtIso,
    });

    if (!result.success) {
      setFamilySheetError(result.error);
      setFamilySheetLoading(false);
      return;
    }

    closeFamilySheet();
    await refreshLists(user.$id);
    setFamilySheetLoading(false);
  }, [closeFamilySheet, familySheet, refreshLists, user]);

  const archiveFamily = useCallback(async () => {
    if (!user || !familySheet.id) return;
    setFamilySheetLoading(true);
    setFamilySheetError(null);

    const result = await api.updateFamily(user.$id, familySheet.id, {
      archive: true,
      categoryTag: ARCHIVED_CATEGORY,
    });

    if (!result.success) {
      setFamilySheetError(result.error);
      setFamilySheetLoading(false);
      return;
    }

    closeFamilySheet();
    await refreshLists(user.$id);
    setFamilySheetLoading(false);
  }, [closeFamilySheet, familySheet.id, refreshLists, user]);

  const restoreFamily = useCallback(async () => {
    if (!user || !familySheet.id) return;
    setFamilySheetLoading(true);
    setFamilySheetError(null);

    const result = await api.updateFamily(user.$id, familySheet.id, {
      unarchive: true,
      categoryTag: null,
    });

    if (!result.success) {
      setFamilySheetError(result.error);
      setFamilySheetLoading(false);
      return;
    }

    closeFamilySheet();
    await refreshLists(user.$id);
    setFamilySheetLoading(false);
  }, [closeFamilySheet, familySheet.id, refreshLists, user]);

  const deleteFamily = useCallback(async () => {
    if (!user || !familySheet.id) return;
    setFamilySheetLoading(true);
    setFamilySheetError(null);

    const result = await api.deleteFamily(user.$id, familySheet.id);

    if (!result.success) {
      setFamilySheetError(result.error);
      setFamilySheetLoading(false);
      return;
    }

    closeFamilySheet();
    await refreshLists(user.$id);
    setFamilySheetLoading(false);
  }, [closeFamilySheet, familySheet.id, refreshLists, user]);

  return {
    categories,
    categoryFilter,
    setCategoryFilter,
    filteredFamilies,
    newFamily,
    familyFormError,
    handleNewFamilyChange,
    createFamily,
    isFamilySheetOpen,
    familySheet,
    familySheetLoading,
    familySheetError,
    openFamilySheet,
    closeFamilySheet,
    handleFamilySheetChange,
    saveFamilySheet,
    archiveFamily,
    restoreFamily,
    deleteFamily,
  } as const;
}
