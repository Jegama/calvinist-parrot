"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export const DEFAULT_SUGGESTED_QUESTIONS = [
  "What does it mean to be justified by faith?",
  "How should I pray when God feels distant?",
  "How do God's sovereignty and human responsibility fit together?",
  "What should I look for in a faithful local church?",
];

type SuggestedQuestionsProps = {
  onSelect: (question: string) => void;
  questions?: string[];
};

function QuestionList({
  questions,
  onSelect,
}: {
  questions: string[];
  onSelect: (question: string) => void;
}) {
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {questions.map((question) => (
        <Button
          key={question}
          type="button"
          variant="ghost"
          className="h-auto min-h-11 justify-start whitespace-normal border border-border/70 bg-card/45 px-3 py-2 text-start font-normal text-foreground hover:bg-card"
          onClick={() => onSelect(question)}
          dir="auto"
        >
          {question}
        </Button>
      ))}
    </div>
  );
}

export function SuggestedQuestions({
  onSelect,
  questions = DEFAULT_SUGGESTED_QUESTIONS,
}: SuggestedQuestionsProps) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <>
      <div className="hidden lg:block">
        <p className="mb-2 text-sm font-medium text-muted-foreground">
          Suggested questions
        </p>
        <QuestionList questions={questions} onSelect={onSelect} />
      </div>
      <Collapsible open={open} onOpenChange={setOpen} className="lg:hidden">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full justify-between whitespace-normal bg-card/60 text-start"
            aria-expanded={open}
            aria-controls={contentId}
          >
            Suggested questions
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent id={contentId} className="pt-2">
          <QuestionList questions={questions} onSelect={onSelect} />
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
