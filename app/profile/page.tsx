// app/profile/page.tsx

"use client";

import { useEffect, useRef, useState } from "react";
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
import { MarkdownWithBibleVerses } from '@/components/MarkdownWithBibleVerses';
import { ProtectedView } from "@/components/ProtectedView";
import { useAuth } from "@/hooks/use-auth";

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

export default function ProfilePage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [pendingCode, setPendingCode] = useState<string>("");
  const [spaceNameInput, setSpaceNameInput] = useState<string>("");
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const router = useRouter();
  const hasFetchedForUser = useRef<string | null>(null);
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      hasFetchedForUser.current = null;
      setQuestions([]);
      setProfileStats(null);
      setShareCode(null);
      setSpaceNameInput("");
      return;
    }
    if (hasFetchedForUser.current === user.$id) return;
    hasFetchedForUser.current = user.$id;
    const fetchUserAndQuestions = async () => {
      try {
        // Fetch questions from our new API route
        const res = await fetch(`/api/user-questions?userId=${user.$id}`);
        if (!res.ok) {
          throw new Error("Failed to fetch questions");
        }
        const fetchedQuestions = await res.json();
        setQuestions(fetchedQuestions);

        // Load profile stats
        const profileRes = await fetch(`/api/user-profile?userId=${user.$id}`);
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData) setProfileStats(profileData);
        }

        // Load family space share code if any
        const spaceRes = await fetch(`/api/prayer-tracker/spaces?userId=${user.$id}`);
        if (spaceRes.ok) {
          const data = await spaceRes.json();
          if (data?.space?.shareCode) {
            setShareCode(data.space.shareCode);
            setSpaceNameInput(data.space.spaceName ?? "");
          }
        }
      } catch (error) {
        console.error("Error fetching profile info:", error);
      }
    };

    fetchUserAndQuestions();
  }, [loading, user]);

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
          <p>Name: {user.name}</p>
          <p>Email: {user.email}</p>
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
          <CardTitle>Invite Spouse</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {shareCode ? (
            <div className="space-y-2">
              <p>Your family space:</p>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{spaceNameInput || "Prayer Space"}</span>
              </div>
              <p className="pt-1">Share code:</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                <span className="font-mono text-lg break-all sm:break-normal">{shareCode}</span>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shareCode);
                      } catch (error) {
                        console.error("Failed to copy share code", error);
                      }
                    }}
                  >
                    Copy
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
                        setShareCode(d.shareCode);
                      }
                    }}
                  >
                    Regenerate
                  </Button>
                </div>
              </div>
            </div>
          ) : (
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
                      setShareCode(data?.space?.shareCode ?? null);
                      setSpaceNameInput(data?.space?.spaceName ?? trimmedName);
                    }
                  }}
                  disabled={!spaceNameInput.trim()}
                >
                  Create Family Space
                </Button>
              </div>
            </div>
          )}
          <div className="pt-2">
            <p>Have a code from your spouse? Enter it to join:</p>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Share code"
                className="sm:flex-1"
                value={pendingCode}
                onChange={(e) => setPendingCode(e.target.value.toUpperCase())}
              />
              <Button
                onClick={async () => {
                  if (!pendingCode.trim()) return;
                  const res = await fetch(`/api/prayer-tracker/accept-invite`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: user.$id, shareCode: pendingCode.trim(), displayName: user.name || "Spouse" }),
                  });
                  if (res.ok) {
                    const d = await res.json();
                    setShareCode(d?.space?.shareCode ?? null);
                    setPendingCode("");
                    if (d?.space?.spaceName) setSpaceNameInput(d.space.spaceName);
                  }
                }}
              >
                Join Space
              </Button>
            </div>
          </div>
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
    </ProtectedView>
  );
}
