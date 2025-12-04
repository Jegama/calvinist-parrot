// app/profile/page.tsx

"use client";

import { useEffect, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { ProtectedView } from "@/components/ProtectedView";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { toMembershipInfo, toPrayerSpace } from "./types";
import { useProfileUiStore } from "./ui-store";
import { fetchProfileOverview } from "./api";
import { ProfileCard } from "./components/profile-card";
import { PrayerJourneyCard } from "./components/prayer-journey-card";
import { TheologicalPreferencesCard } from "./components/theological-preferences-card";
import { FamilySpaceCard } from "./components/family-space-card";
import { PreviousQuestionsCard } from "./components/previous-questions-card";

export default function ProfilePage() {
  const { resetUi, setSpaceNameInput } = useProfileUiStore();
  const router = useRouter();
  const { user, logout } = useAuth();

  const profileQueryKey = useMemo(() => ["profile-overview", user?.$id ?? "guest"], [user?.$id]);
  const profileOverview = useQuery({
    queryKey: profileQueryKey,
    enabled: Boolean(user?.$id),
    queryFn: () => fetchProfileOverview(user!.$id),
    staleTime: 1000 * 60 * 5,
  });

  const questions = profileOverview.data?.questions ?? [];
  const profileStats = profileOverview.data?.profile ?? null;

  const space = useMemo(() => {
    const rawSpace = profileOverview.data?.space ?? null;
    return rawSpace ? toPrayerSpace(rawSpace) : null;
  }, [profileOverview.data]);

  const membership = useMemo(() => {
    const rawMembership = profileOverview.data?.membership ?? null;
    return rawMembership ? toMembershipInfo(rawMembership) : null;
  }, [profileOverview.data]);

  useEffect(() => {
    if (!user) {
      resetUi();
    }
  }, [resetUi, user]);

  useEffect(() => {
    if (space) {
      setSpaceNameInput(space.spaceName ?? "");
    } else {
      setSpaceNameInput("");
    }
  }, [setSpaceNameInput, space]);

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
      <ProfileCard name={user.name || ""} email={user.email || ""} onLogout={handleLogout} />

      {profileStats && <PrayerJourneyCard stats={profileStats} />}

      {profileStats && (
        <TheologicalPreferencesCard stats={profileStats} userId={user.$id} onUpdate={() => profileOverview.refetch()} />
      )}

      <FamilySpaceCard
        space={space}
        membership={membership}
        userId={user.$id}
        userName={user.name || "Member"}
        onUpdate={() => profileOverview.refetch()}
      />

      <PreviousQuestionsCard questions={questions} />
    </ProtectedView>
  );
}
