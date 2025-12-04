import { Card, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { createMarkdownLoader } from "@/lib/createMarkdownLoader";

const getGuideContent = createMarkdownLoader("pages/church-finder/guide.md");

export default async function ChurchFinderGuidePage() {
  const guideContent = await getGuideContent();

  return (
    <Card className="max-w-4xl mx-auto mt-8 mb-8">
      <CardContent>
        <MarkdownWithBibleVerses content={guideContent} />
      </CardContent>
    </Card>
  );
}
