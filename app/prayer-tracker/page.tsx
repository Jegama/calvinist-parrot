"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotationCard } from "./components/RotationCard";
import { FamilySection } from "./components/FamilySection";
import { PersonalRequestsSection } from "./components/PersonalRequestsSection";
import { FamilySheet } from "./components/FamilySheet";
import { PersonalSheet } from "./components/PersonalSheet";
import { ARCHIVED_CATEGORY } from "./constants";
import { useAuth } from "@/hooks/use-auth";
import { ProtectedView } from "@/components/ProtectedView";
import {
	defaultCategories,
	determineNextMemberId,
	normalizeChildren,
	validateFamilyForm,
	validatePersonalForm,
	resolveCategoryTag,
	dateInputToIso,
	isoToDateInput,
	buildFamilyPayload,
	buildPersonalRequestPayload,
	resetFamilyForm,
	resetPersonalForm,
} from "./utils";
import {
	Family,
	FamilySheetState,
	Member,
	NewFamilyFormState,
	NewPersonalFormState,
	PersonalRequest,
	PersonalSheetState,
	Rotation,
} from "./types";
import * as api from "./api";

export default function PrayerTrackerPage() {
	const { user, loading: authLoading } = useAuth();
	const [spaceName, setSpaceName] = useState<string | null>(null);
	const [spaceLoaded, setSpaceLoaded] = useState(false);
	const [members, setMembers] = useState<Member[]>([]);
	const [families, setFamilies] = useState<Family[]>([]);
	const [personal, setPersonal] = useState<PersonalRequest[]>([]);
	const [categoryFilter, setCategoryFilter] = useState<string>("all");

	const [newFamily, setNewFamily] = useState<NewFamilyFormState>({
		familyName: "",
		parents: "",
		children: "",
		categorySelect: "none",
		customCategory: "",
	});
	const [familyFormError, setFamilyFormError] = useState<string | null>(null);

	const [newPersonal, setNewPersonal] = useState<NewPersonalFormState>({ text: "", notes: "" });
	const [personalFormError, setPersonalFormError] = useState<string | null>(null);

	const [rotation, setRotation] = useState<Rotation | null>(null);
	const [familyAssignments, setFamilyAssignments] = useState<Record<string, string>>({});
	const [personalSelections, setPersonalSelections] = useState<Record<string, boolean>>({});
	const [isComputing, setIsComputing] = useState(false);
	const [isConfirming, setIsConfirming] = useState(false);
	const [rotationError, setRotationError] = useState<string | null>(null);

	const [isFamilySheetOpen, setIsFamilySheetOpen] = useState(false);
	const [familySheetLoading, setFamilySheetLoading] = useState(false);
	const [familySheet, setFamilySheet] = useState<FamilySheetState>(() => ({
		id: "",
		familyName: "",
		parents: "",
		children: "",
		categorySelect: "none",
		customCategory: "",
		lastPrayedAt: "",
		archivedAt: null,
	}));
	const [familySheetError, setFamilySheetError] = useState<string | null>(null);

	const [isPersonalSheetOpen, setIsPersonalSheetOpen] = useState(false);
	const [personalSheetLoading, setPersonalSheetLoading] = useState(false);
	const [personalSheet, setPersonalSheet] = useState<PersonalSheetState>(() => ({
		id: "",
		requestText: "",
		notes: "",
		status: "ACTIVE",
	}));
	const [personalSheetError, setPersonalSheetError] = useState<string | null>(null);
	const [answeringPersonalId, setAnsweringPersonalId] = useState<string | null>(null);
	const initializedForUser = useRef<string | null>(null);

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
		if (categoryFilter === "all") {
			return families.filter((family) => !family.archivedAt);
		}
		if (categoryFilter === ARCHIVED_CATEGORY) {
			return families.filter((family) => Boolean(family.archivedAt));
		}
		return families.filter(
			(family) => family.categoryTag === categoryFilter && !family.archivedAt
		);
	}, [families, categoryFilter]);

	const hasSelections = useMemo(() => {
		const familySelected = rotation?.families.some((family) => {
			const assigned = familyAssignments[family.id];
			return assigned && assigned !== "skip";
		});
		const personalSelected = rotation?.personal.some((item) => personalSelections[item.id]);
		return Boolean(familySelected || personalSelected);
	}, [familyAssignments, personalSelections, rotation]);

	const handleNewFamilyChange = useCallback((changes: Partial<NewFamilyFormState>) => {
		setNewFamily((prev) => ({ ...prev, ...changes }));
		setFamilyFormError(null);
	}, []);

	const handleNewPersonalChange = useCallback((changes: Partial<NewPersonalFormState>) => {
		setNewPersonal((prev) => ({ ...prev, ...changes }));
		setPersonalFormError(null);
	}, []);

	const handleFamilySheetChange = useCallback((changes: Partial<FamilySheetState>) => {
		setFamilySheet((prev) => ({ ...prev, ...changes }));
		setFamilySheetError(null);
	}, []);

	const handlePersonalSheetChange = useCallback((changes: Partial<PersonalSheetState>) => {
		setPersonalSheet((prev) => ({ ...prev, ...changes }));
		setPersonalSheetError(null);
	}, []);

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
	}, []);

	const loadSpace = useCallback(async (userId: string) => {
		const result = await api.fetchSpace(userId);
		
		if (result.success && result.data) {
			setSpaceName(result.data.spaceName);
			setMembers(result.data.members);
			return result.data;
		}
		
		setSpaceName(null);
		setMembers([]);
		return null;
	}, []);

	const refreshLists = useCallback(async (userId: string) => {
		const { families, personal } = await api.fetchFamiliesAndPersonal(userId);
		
		if (families.success) {
			setFamilies(families.data);
		}
		
		if (personal.success) {
			setPersonal(personal.data);
		}
	}, []);

	const refreshAll = useCallback(
		async (userId: string) => {
			setSpaceLoaded(false);
			await Promise.all([loadSpace(userId), refreshLists(userId)]);
			setSpaceLoaded(true);
		},
		[loadSpace, refreshLists]
	);

	useEffect(() => {
		if (authLoading) return;
		if (!user) {
			initializedForUser.current = null;
			setSpaceLoaded(false);
			setSpaceName(null);
			setMembers([]);
			setFamilies([]);
			setPersonal([]);
			setRotation(null);
			setFamilyAssignments({});
			setPersonalSelections({});
			return;
		}
		if (initializedForUser.current === user.$id) return;
		initializedForUser.current = user.$id;
		(async () => {
			try {
				await refreshAll(user.$id);
			} catch (error) {
				console.error("Failed to load prayer tracker data", error);
				setSpaceLoaded(true);
			}
		})();
	}, [authLoading, refreshAll, user]);

	async function createFamily() {
		if (!user) return;

		// Use utility for validation
		const validationError = validateFamilyForm(newFamily);
		if (validationError) {
			setFamilyFormError(validationError);
			return;
		}

		setFamilyFormError(null);

		// Use utility to build payload
		const payload = buildFamilyPayload(user.$id, newFamily);

		// Use API client
		const result = await api.createFamily(user.$id, payload);

		if (!result.success) {
			setFamilyFormError(result.error);
			return;
		}

		// Use utility to reset form, preserving resolved category
		const resolvedCategory = resolveCategoryTag(newFamily.categorySelect, newFamily.customCategory);
		setNewFamily(resetFamilyForm(resolvedCategory || undefined));

		await refreshLists(user.$id);
	}

	async function createPersonal() {
		if (!user) return;

		const validationError = validatePersonalForm(newPersonal);
		if (validationError) {
			setPersonalFormError(validationError);
			return;
		}

		setPersonalFormError(null);

		const payload = buildPersonalRequestPayload(user.$id, newPersonal);

		// Use API client
		const result = await api.createPersonalRequest(user.$id, payload);

		if (!result.success) {
			setPersonalFormError(result.error);
			return;
		}

		setNewPersonal(resetPersonalForm());
		await refreshLists(user.$id);
	}

	async function computeRotation() {
		if (!user) return;
		setIsComputing(true);
		setRotationError(null);

		const result = await api.computeRotation(user.$id);

		if (!result.success) {
			setRotationError(result.error);
			setIsComputing(false);
			return;
		}

		const { families: fetchedFamilies, personal: fetchedPersonal, members: fetchedMembers } = result.data;

		// Update members if provided
		if (fetchedMembers && fetchedMembers.length) {
			setMembers(fetchedMembers);
		}

		const effectiveMembers: Member[] = fetchedMembers && fetchedMembers.length
			? fetchedMembers
			: members;

		// Build default assignments
		const defaults: Record<string, string> = {};
		fetchedFamilies.forEach((family) => {
			const nextMember = determineNextMemberId(family, effectiveMembers);
			defaults[family.id] = nextMember ?? "skip";
		});

		// Prioritize families assigned to current user
		const currentMemberId = effectiveMembers.find((member) => member.appwriteUserId === user.$id)?.id;
		const prioritizedFamilies = currentMemberId
			? fetchedFamilies
					.map((family, index) => ({ family, index }))
					.sort((a, b) => {
						const aPriority = defaults[a.family.id] === currentMemberId ? 0 : 1;
						const bPriority = defaults[b.family.id] === currentMemberId ? 0 : 1;
						if (aPriority !== bPriority) return aPriority - bPriority;
						return a.index - b.index;
					})
					.map((entry) => entry.family)
			: fetchedFamilies;

		setRotation({ families: prioritizedFamilies, personal: fetchedPersonal });
		setFamilyAssignments(defaults);

		// Default all personal requests to selected
		const personalDefaults: Record<string, boolean> = {};
		fetchedPersonal.forEach((item) => {
			personalDefaults[item.id] = true;
		});
		setPersonalSelections(personalDefaults);
		setIsComputing(false);
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

		setRotation(null);
		setFamilyAssignments({});
		setPersonalSelections({});
		await refreshAll(user.$id);
		setIsConfirming(false);
	}

	function openFamilyEditor(family: Family) {
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
	}

	function resetFamilySheet() {
		setFamilySheet({
			id: "",
			familyName: "",
			parents: "",
			children: "",
			categorySelect: "none",
			customCategory: "",
			lastPrayedAt: "",
			archivedAt: null,
		});
		setFamilySheetError(null);
		setFamilySheetLoading(false);
	}

	async function saveFamilySheet() {
		if (!user || !familySheet.id) return;

		// Validate name
		const trimmedName = familySheet.familyName.trim();
		if (!trimmedName) {
			setFamilySheetError("Family name is required.");
			return;
		}

		// Resolve category
		const resolvedCategory = resolveCategoryTag(
			familySheet.categorySelect,
			familySheet.customCategory
		);

		if (familySheet.categorySelect === "__custom" && !resolvedCategory) {
			setFamilySheetError("Please provide a category name.");
			return;
		}

		// Convert date using utility
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

		resetFamilySheet();
		setIsFamilySheetOpen(false);
		await refreshLists(user.$id);
		setFamilySheetLoading(false);
	}

	async function archiveFamily() {
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

		resetFamilySheet();
		setIsFamilySheetOpen(false);
		await refreshLists(user.$id);
		setFamilySheetLoading(false);
	}

	async function restoreFamily() {
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

		resetFamilySheet();
		setIsFamilySheetOpen(false);
		await refreshLists(user.$id);
		setFamilySheetLoading(false);
	}

	async function deleteFamily() {
		if (!user || !familySheet.id) return;
		setFamilySheetLoading(true);
		setFamilySheetError(null);

		const result = await api.deleteFamily(user.$id, familySheet.id);

		if (!result.success) {
			setFamilySheetError(result.error);
			setFamilySheetLoading(false);
			return;
		}

		resetFamilySheet();
		setIsFamilySheetOpen(false);
		await refreshLists(user.$id);
		setFamilySheetLoading(false);
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

		const result = await api.updatePersonalRequest(user.$id, personalSheet.id, {
			requestText: trimmed,
			notes: personalSheet.notes.trim() || null,
		});

		if (!result.success) {
			setPersonalSheetError(result.error);
			setPersonalSheetLoading(false);
			return;
		}

		resetPersonalSheet();
		setIsPersonalSheetOpen(false);
		await refreshLists(user.$id);
		setPersonalSheetLoading(false);
	}

	async function deletePersonal(requestId: string) {
		if (!user) return;
		setPersonalSheetError(null);

		const result = await api.deletePersonalRequest(user.$id, requestId);

		if (!result.success) {
			setPersonalSheetError(result.error);
			return;
		}

		if (personalSheet.id === requestId) {
			resetPersonalSheet();
			setIsPersonalSheetOpen(false);
		}
		await refreshLists(user.$id);
	}

	async function markPersonalAnswered(requestId: string) {
		if (!user) return;
		setAnsweringPersonalId(requestId);
		setPersonalSheetError(null);

		const result = await api.updatePersonalRequest(user.$id, requestId, {
			markAnswered: true,
		});

		if (!result.success) {
			setPersonalSheetError(result.error);
			setAnsweringPersonalId(null);
			return;
		}

		if (personalSheet.id === requestId) {
			resetPersonalSheet();
			setIsPersonalSheetOpen(false);
		}
		await refreshLists(user.$id);
		setAnsweringPersonalId(null);
	}

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

	if (!spaceLoaded) {
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
					<CardContent className="space-y-2">
						<p>You don&apos;t have a shared family space yet.</p>
						<p>Create one from your profile page to begin tracking prayers together.</p>
					</CardContent>
				</Card>
			</ProtectedView>
		);
	}

	const memberNames = members.map((member) => member.displayName).join(" & ") || "Invite your spouse from your profile";

	return (
		<ProtectedView fallback={authFallback}>
			<div className="max-w-6xl mx-auto mt-8 mb-16 space-y-8 px-4 sm:px-6">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-semibold">{spaceName}</h1>
					<p className="text-sm text-muted-foreground">Prayer partners: {memberNames}</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
					<Button asChild variant="outline">
						<Link href="/family-worship">Why Family Worship?</Link>
					</Button>
					<Button onClick={computeRotation} disabled={isComputing}>
						{isComputing ? "Computing..." : "Compute Tonight's Rotation"}
					</Button>
				</div>
			</div>

			{rotationError && (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{rotationError}
				</div>
			)}

			<RotationCard
				rotation={rotation}
				members={members}
				familyAssignments={familyAssignments}
				personalSelections={personalSelections}
				isConfirming={isConfirming}
				hasSelections={hasSelections}
				onFamilyAssignmentChange={handleFamilyAssignmentChange}
				onPersonalSelectionChange={handlePersonalSelectionChange}
				onCancelRotation={handleCancelRotation}
				onConfirmRotation={confirmRotation}
			/>

			{/* Primary actions first: Personal requests on top full width, families below */}
			<div className="space-y-6">
				<PersonalRequestsSection
					className="w-full"
					personal={personal}
					newPersonal={newPersonal}
					personalFormError={personalFormError}
					answeringPersonalId={answeringPersonalId}
					onNewPersonalChange={handleNewPersonalChange}
					onCreatePersonal={createPersonal}
					onEditPersonal={openPersonalEditor}
					onMarkAnswered={markPersonalAnswered}
				/>

				<FamilySection
					className="w-full"
					newFamily={newFamily}
					familyFormError={familyFormError}
					categories={categories}
					categoryFilter={categoryFilter}
					filteredFamilies={filteredFamilies}
					onNewFamilyChange={handleNewFamilyChange}
					onCreateFamily={createFamily}
					onCategoryFilterChange={setCategoryFilter}
					onEditFamily={openFamilyEditor}
				/>
			</div>

			<FamilySheet
				isOpen={isFamilySheetOpen}
				categories={categories}
				sheetState={familySheet}
				isLoading={familySheetLoading}
				error={familySheetError}
				onOpenChange={(open) => {
					setIsFamilySheetOpen(open);
					if (!open) resetFamilySheet();
				}}
				onUpdate={handleFamilySheetChange}
				onSave={saveFamilySheet}
				onArchive={archiveFamily}
				onRestore={restoreFamily}
				onDelete={deleteFamily}
			/>

			<PersonalSheet
				isOpen={isPersonalSheetOpen}
				sheetState={personalSheet}
				isLoading={personalSheetLoading}
				error={personalSheetError}
				answeringPersonalId={answeringPersonalId}
				onOpenChange={(open) => {
					setIsPersonalSheetOpen(open);
					if (!open) resetPersonalSheet();
				}}
				onUpdate={handlePersonalSheetChange}
				onSave={savePersonalSheet}
				onMarkAnswered={() => personalSheet.id && markPersonalAnswered(personalSheet.id)}
				onDelete={() => personalSheet.id && deletePersonal(personalSheet.id)}
			/>
		</div>
		</ProtectedView>
	);
}
