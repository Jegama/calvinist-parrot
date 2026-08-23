import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { createMarkdownLoader } from "@/lib/createMarkdownLoader";

const getFrameworkContent = createMarkdownLoader("pages/sermon-evaluation/framework.md");

export const metadata: Metadata = {
  title: "Sermon Evaluation Framework | Calvinist Parrot",
  description: "How Calvinist Parrot analyzes sermon structure, applies its homiletical rubric, and produces private coaching feedback.",
};

export default async function SermonEvaluationFrameworkPage() {
  const content = await getFrameworkContent();

  return (
    <main className="min-h-[calc(100vh-var(--app-header-height))] bg-background px-4 py-8 sm:px-6">
      <Card className="mx-auto max-w-4xl">
        <CardContent className="pt-6">
          <MarkdownWithBibleVerses content={content} />
        </CardContent>
      </Card>
    </main>
  );
}
