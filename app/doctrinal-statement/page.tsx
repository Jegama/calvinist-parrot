// app/doctrinal-statement/page.tsx

import { Card, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { createMarkdownLoader } from "@/lib/createMarkdownLoader";

const getDoctrinalStatementContent = createMarkdownLoader("pages/doctrinal-statement.md");

export default async function DoctrinalStatementPage() {
  const doctrinalStatementContent = await getDoctrinalStatementContent();

  return (
    <Card className="max-w-4xl mx-auto mt-8 mb-8">
      <CardContent>
        <MarkdownWithBibleVerses content={doctrinalStatementContent} />
      </CardContent>
    </Card>
  );
}
