// app/privacy-policy/page.tsx

import { Card, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { createMarkdownLoader } from "@/lib/createMarkdownLoader";

const getPrivacyContent = createMarkdownLoader("pages/privacy-policy.md");

export default async function PrivacyPolicyPage() {
  const content = await getPrivacyContent();

  return (
    <Card className="max-w-4xl mx-auto mt-8 mb-8">
      <CardContent>
        <MarkdownWithBibleVerses content={content} />
      </CardContent>
    </Card>
  );
}
