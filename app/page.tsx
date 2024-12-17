// app/page.tsx

"use client"

import React, { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2 } from "lucide-react";
import { MarkdownWithBibleVerses } from '@/components/MarkdownWithBibleVerses';
import { BibleCommentary } from "@/components/BibleCommentary";
import { extractReferences } from "@/utils/bibleUtils";
import { BackToTop } from '@/components/BackToTop';

import { account } from "@/utils/appwrite";
import { Models } from "appwrite";
type AppwriteUser = Models.User<Models.Preferences>;

interface ChainReasoningResult {
  first_answer: string;
  second_answer: string;
  third_answer: string;
  reviewed_answer: string;
  calvin_review: string;
  categorization?: {
    reformatted_question: string;
    category: string;
    subcategory: string;
    issue_type: string;
  };
  refuse_answer?: string;
  elaborated_answer?: string;
}



export default function Home() {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ChainReasoningResult | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [isSynthesisStarted, setIsSynthesisStarted] = useState(false);
  const [isElaborating, setIsElaborating] = useState(false);
  const [commentaryTexts, setCommentaryTexts] = useState<{ [key: string]: string }>({});
  const [user, setUser] = useState<AppwriteUser | null>(null);

  useEffect(() => {
    const getUser = async () => {
      try {
        const currentUser = await account.get();
        setUser(currentUser);
      } catch {
        setUser(null);
      }
    };
    getUser();
  }, []);

  const userId = user?.$id;

  const handleReset = () => {
    setQuestion("");
    setResult(null);
    setProgressMessage('');
    setIsSynthesisStarted(false);
    setIsElaborating(false);
    setCommentaryTexts({});
  };

  // Memoized callback to prevent re-creation on every render
  const handleCommentaryExtracted = useCallback(
    (reference: string, formattedCommentary: string) => {
      setCommentaryTexts((prev) => {
        if (!prev[reference]) {
          return { ...prev, [reference]: formattedCommentary };
        }
        return prev;
      });
    },
    []
  );

  const handleHomepageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResult(null);
    setProgressMessage('');
    setIsSynthesisStarted(false);
    try {
      const response = await fetch("/api/chain-reasoning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, userId }),
      });
      if (!response.ok) throw new Error('Network response was not ok');
  
      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let buffer = '';
      const newResult = {
        first_answer: '',
        second_answer: '',
        third_answer: '',
        calvin_review: '',
        reviewed_answer: '',
        refuse_answer: '',
        categorization: undefined,
      };
  
      while (!done) {
        const { value, done: readerDone } = await reader!.read();
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.trim() === '') continue;
            try {
              const data = JSON.parse(line);
              if (data.type === 'progress') {
                setProgressMessage(data.message);
                if (data.message === 'Synthesizing final answer...') {
                  setIsSynthesisStarted(true);
                }
              } else if (data.type === 'agent_responses') {
                newResult.first_answer = data.data.first_answer;
                newResult.second_answer = data.data.second_answer;
                newResult.third_answer = data.data.third_answer;
                setResult({ ...newResult });
              } else if (data.type === 'categorization') {
                newResult.categorization = data.data;
                setResult({ ...newResult });
              } else if (data.type === 'calvin_review') {
                newResult.calvin_review = data.content;
                setResult({ ...newResult });
              } else if (data.type === 'reviewed_answer') {
                newResult.reviewed_answer += data.content;
                setResult({ ...newResult });
              } else if (data.type === 'refusal') {
                newResult.refuse_answer = (newResult.refuse_answer || '') + data.content;
                setResult({ ...newResult });
              }
            } catch (error) {
              console.error("Failed to parse JSON:", error, line);
            }
          }
        }
        done = readerDone;
      }
    } catch (error) {
      console.error("Error:", error);
    }
    setIsLoading(false);
    setProgressMessage('');
  };
  
  const handleElaborate = async () => {
    setIsElaborating(true);

    // Prepare the commentary text from commentaryTexts
    const commentary = Object.values(commentaryTexts).join("\n\n");

    try {
      const response = await fetch("/api/elaborate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          categorization: result?.categorization, // We'll need to store categorization in the result
          first_answer: result?.first_answer,
          second_answer: result?.second_answer,
          third_answer: result?.third_answer,
          calvin_review: result?.calvin_review,
          reviewed_answer: result?.reviewed_answer,
          commentary,
        }),
      });

      if (!response.ok) throw new Error("Network response was not ok");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let buffer = "";

      let elaboratedAnswer = "";

      while (!done) {
        const { value, done: readerDone } = await reader!.read();
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.trim() === "") continue;
            try {
              const data = JSON.parse(line);
              if (data.type === "elaborated_answer") {
                elaboratedAnswer += data.content;
                setResult((prevResult) => ({
                  ...prevResult!,
                  elaborated_answer: elaboratedAnswer,
                }));
              }
            } catch (error) {
              console.error("Failed to parse JSON:", error, line);
            }
          }
        }
        done = readerDone;
      }
    } catch (error) {
      console.error("Error:", error);
    }

    setIsElaborating(false);
  };

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4">
      <Card className="w-[90%] max-w-2xl">
        <CardHeader>
          <div className="flex items-center space-x-4">
            <Image
              src="https://cultofthepartyparrot.com/parrots/hd/calvinist_parrot.gif"
              alt="Calvinist Parrot"
              width={100}
              height={100}
            />
            <CardTitle className="text-3xl font-bold">Calvinist Parrot</CardTitle>
          </div>
          <CardDescription>
            Ask a question and receive wisdom from the Calvinist Parrot
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleHomepageSubmit} className="space-y-4">
            <Input
              placeholder="Enter your question here..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            {!isLoading && (
              <Button type="submit" className="w-full">
                Ask the Parrot
              </Button>
            )}
          </form>
        </CardContent>
        {isLoading && (
          <CardFooter>
            <div className="w-full flex items-center">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              {progressMessage && <p>{progressMessage}</p>}
            </div>
          </CardFooter>
        )}
        {result && !result.refuse_answer && (
          <>
            {isSynthesisStarted && (
              <>
                {/* Render the "Counsel of Three" and "Calvin's Review" accordions */}
                <CardFooter className="flex flex-col items-start">
                <Accordion type="single" collapsible className="w-full">
                  {/* ...Counsel of Three... */}
                  <AccordionItem value="counsel">
                    <AccordionTrigger>Counsel of Three</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <strong>Agent A:</strong>{" "}
                          <MarkdownWithBibleVerses content={result.first_answer} />
                        </div>
                        <div>
                          <strong>Agent B:</strong>{" "}
                          <MarkdownWithBibleVerses content={result.second_answer} />
                        </div>
                        <div>
                          <strong>Agent C:</strong>{" "}
                          <MarkdownWithBibleVerses content={result.third_answer} />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <Accordion type="single" collapsible className="w-full mt-4">
                  {/* ...Calvin's Review... */}
                  <AccordionItem value="review">
                    <AccordionTrigger>{"Calvin's Review"}</AccordionTrigger>
                    <AccordionContent>
                      <p>
                        <MarkdownWithBibleVerses content={result.calvin_review} />
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardFooter>

              {/* Render the "Final Answer" section */}
              <CardFooter className="flex flex-col items-start">
                <div className="mt-4">
                  <h3 className="font-semibold">Final Answer:</h3>
                  <p>
                    <MarkdownWithBibleVerses content={result.reviewed_answer} />
                  </p>
                </div>

                {/* Bible Commentary */}
                <Accordion type="single" collapsible className="w-full mt-4">
                  <AccordionItem value="commentary">
                    <AccordionTrigger>Bible Commentary</AccordionTrigger>
                    <AccordionContent>
                      <div className="w-full">
                        {extractReferences(result.reviewed_answer).map((reference, index) => (
                          <BibleCommentary
                            key={index}
                            reference={reference}
                            onCommentaryExtracted={handleCommentaryExtracted}
                          />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* Add the "Please Elaborate" button */}
                {!result?.elaborated_answer && (
                  !isElaborating ? (
                    <Button onClick={handleElaborate} className="mt-4">
                      Please Elaborate
                    </Button>
                  ) : (
                    <div className="w-full flex items-center mt-4">
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      <p>Elaborating...</p>
                    </div>
                  )
                )}
              </CardFooter>

              {/* Display the elaborated answer */}
              {result?.elaborated_answer && (
                <CardFooter className="flex flex-col items-start">
                  <div className="mt-4">
                    <p>
                      <MarkdownWithBibleVerses content={result.elaborated_answer} />
                    </p>
                  </div>
                </CardFooter>
              )}

              {/* Render the "Reset" button */}
              {result && (
                <CardFooter className="flex flex-col items-start">
                  <Button onClick={handleReset} className="mt-4">
                    Ask a New Question
                  </Button>
                </CardFooter>
              )}
              </>
            )}
          </>
        )}
        {result && result.refuse_answer && (
          <CardFooter>
            <div className="w-full">
              <h3 className="font-semibold">Response:</h3>
              <p>{result.refuse_answer}</p>
            </div>
          </CardFooter>
        )}
      </Card>
      <BackToTop />
    </main>
  );
}
