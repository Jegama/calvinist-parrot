// app/page.tsx

"use client"

import React, { useState } from "react";
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
import { VerseRenderer } from "@/components/VerseRenderer";
import { BibleCommentary } from "@/components/BibleCommentary";
import { extractReferences } from "@/utils/bibleUtils";
import { BackToTop } from '@/components/BackToTop';

interface ChainReasoningResult {
  first_answer: string;
  second_answer: string;
  third_answer: string;
  reviewed_answer: string;
  refuse_answer?: string;
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ChainReasoningResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/chain-reasoning", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Error:", error);
    }
    setIsLoading(false);
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
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="w-full text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin" />
              <p className="mt-2">The Calvinist Parrot is pondering your question...</p>
            </div>
          </CardFooter>
        )}
        {result && !result.refuse_answer && (
          <CardFooter className="flex flex-col items-start">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="counsel">
                <AccordionTrigger>Counsel of Three</AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <strong>Agent A:</strong>{" "}
                      <VerseRenderer text={result.first_answer} />
                    </div>
                    <div>
                      <strong>Agent B:</strong>{" "}
                      <VerseRenderer text={result.second_answer} />
                    </div>
                    <div>
                      <strong>Agent C:</strong>{" "}
                      <VerseRenderer text={result.third_answer} />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            <div className="mt-4">
              <h3 className="font-semibold">Final Answer:</h3>
              <p>
                <VerseRenderer text={result.reviewed_answer} />
              </p>
            </div>
            <div className="w-full mt-4">
              {extractReferences(result.reviewed_answer).map((reference, index) => (
                <BibleCommentary key={index} reference={reference} />
              ))}
            </div>
          </CardFooter>
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
