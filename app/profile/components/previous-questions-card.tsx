// app/profile/components/previous-questions-card.tsx

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import type { Question } from "../types";

type PreviousQuestionsCardProps = {
  questions: Question[];
};

export function PreviousQuestionsCard({
  questions,
}: PreviousQuestionsCardProps) {
  if (questions.length === 0) {
    return null;
  }

  return (
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
                <MarkdownWithBibleVerses content={question.reviewed_answer} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
