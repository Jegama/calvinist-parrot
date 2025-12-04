// app/family-worship/page.tsx

import { Card, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { createMarkdownLoader } from "@/lib/createMarkdownLoader";

const getFamilyWorshipContent = createMarkdownLoader("pages/family-worship/overview.md");

export default async function FamilyWorshipPage() {
  const testimonyContent = await getFamilyWorshipContent();

  return (
    <Card className="max-w-3xl mx-auto mt-8 mb-8">
      <CardContent>
        <MarkdownWithBibleVerses content={testimonyContent} />
      </CardContent>
    </Card>
  );
}
