// app/profile/page.tsx

"use client";

import { useEffect, useState } from "react";
import { account } from "@/utils/appwrite";
import { Models } from "appwrite";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export default function ProfilePage() {
  const [user, setUser] = useState<AppwriteUser | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const router = useRouter();

  useEffect(() => {
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
