import { Card, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { createMarkdownLoader } from "@/lib/createMarkdownLoader";

const getFrameworkContent = createMarkdownLoader("pages/llm-evaluation-dashboard/evaluation-framework.md");

export const metadata = {
  title: "Evaluation Framework | Calvinist Parrot",
  description: "Detailed framework for evaluating LLM theological accuracy and pastoral tone.",
};

export default async function FrameworkPage() {
  const content = await getFrameworkContent();

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6 text-center">Evaluation Framework</h1>
      <Card className="max-w-4xl mx-auto">
        <CardContent className="pt-6">
          <MarkdownWithBibleVerses content={content} />
        </CardContent>
      </Card>
    </div>
  );
}
