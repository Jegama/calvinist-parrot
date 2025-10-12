"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotationCard } from "./components/RotationCard";
import { FamilySection } from "./components/FamilySection";
import { PersonalRequestsSection } from "./components/PersonalRequestsSection";
import { FamilySheet } from "./components/FamilySheet";
import { PersonalSheet } from "./components/PersonalSheet";
import { useAuth } from "@/hooks/use-auth";
import { ProtectedView } from "@/components/ProtectedView";
import {
	appendUserId,
	defaultCategories,
	determineNextMemberId,
	normalizeChildren,
	readErrorMessage,
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
	}, [authLoading, user]);

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
			const effectiveMembers: Member[] = Array.isArray(data?.members) && data.members.length
				? (data.members as Member[])
				: members;
			const defaults: Record<string, string> = {};
			fetchedFamilies.forEach((family) => {
				const nextMember = determineNextMemberId(family, effectiveMembers);
				defaults[family.id] = nextMember ?? "skip";
			});

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

			<div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
				<FamilySection
					className="order-1 lg:order-none"
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
				<PersonalRequestsSection
					className="order-2 lg:order-none"
					personal={personal}
					newPersonal={newPersonal}
					personalFormError={personalFormError}
					answeringPersonalId={answeringPersonalId}
					onNewPersonalChange={handleNewPersonalChange}
					onCreatePersonal={createPersonal}
					onEditPersonal={openPersonalEditor}
					onMarkAnswered={markPersonalAnswered}
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
