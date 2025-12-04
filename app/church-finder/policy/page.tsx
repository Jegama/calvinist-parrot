import { Card, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { createMarkdownLoader } from "@/lib/createMarkdownLoader";

const getPolicyContent = createMarkdownLoader("pages/church-finder/policy.md");

export default async function ChurchPartnershipPolicyPage() {
  const policyContent = await getPolicyContent();

  return (
    <Card className="max-w-4xl mx-auto mt-8 mb-8">
      <CardContent>
        <MarkdownWithBibleVerses content={policyContent} />
      </CardContent>
    </Card>
  );
}
