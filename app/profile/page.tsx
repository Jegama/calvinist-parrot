// app/profile/page.tsx

"use client";

import { useEffect, useRef, useState } from "react";
import { account } from "@/utils/appwrite";
import { Models } from "appwrite";
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

type AppwriteUser = Models.User<Models.Preferences>;

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
  const [user, setUser] = useState<AppwriteUser | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [pendingCode, setPendingCode] = useState<string>("");
  const [spaceNameInput, setSpaceNameInput] = useState<string>("");
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const router = useRouter();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    const fetchUserAndQuestions = async () => {
      try {
        // Get the current logged-in user from Appwrite
        const currentUser = await account.get();
        setUser(currentUser);

        // Fetch questions from our new API route
        const res = await fetch(`/api/user-questions?userId=${currentUser.$id}`);
        if (!res.ok) {
          throw new Error("Failed to fetch questions");
        }
        const fetchedQuestions = await res.json();
        setQuestions(fetchedQuestions);

        // Load profile stats
        const profileRes = await fetch(`/api/user-profile?userId=${currentUser.$id}`);
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData) setProfileStats(profileData);
        }

        // Load family space share code if any
        const spaceRes = await fetch(`/api/prayer-tracker/spaces?userId=${currentUser.$id}`);
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
  }, []);

  const handleLogout = async () => {
    try {
      await account.deleteSession("current");
      setUser(null);
      router.push("/login");
    } catch (error: unknown) {
      console.error("Logout failed:", error);
    }
  };

  if (!user) {
    return (
      <Card className="max-w-2xl mx-auto mt-8 mb-8">
        <CardHeader>
          <CardTitle>Please log in</CardTitle>
        </CardHeader>
        <CardContent>
          <p>You must be logged in to view your profile.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
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
              <div className="flex gap-2 items-center">
                <span className="font-mono text-lg">{shareCode}</span>
                <Button
                  variant="outline"
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
    </>
  );
}
