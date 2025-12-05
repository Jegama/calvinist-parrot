import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { ModeContentSwitcher } from "@/components/documentation/ModeContentSwitcher";
import { DENOMINATION_CONTENT, DENOMINATION_OPTIONS } from "@/lib/denominationContent";
import { createMarkdownLoader } from "@/lib/createMarkdownLoader";

const getOverviewContent = createMarkdownLoader("pages/documentation-parrot-qa/overview.md");
const getFooterContent = createMarkdownLoader("pages/documentation/shared-footer.md");

export default async function DocumentationParrotQAPage() {
  const [overviewContent, footerContent] = await Promise.all([getOverviewContent(), getFooterContent()]);

  return (
    <Card className="w-[90%] mx-auto mt-8 mb-8">
      <CardContent>
        <MarkdownWithBibleVerses content={overviewContent} />
        <ModeContentSwitcher contentByMode={DENOMINATION_CONTENT} options={DENOMINATION_OPTIONS} />
        <MarkdownWithBibleVerses content={footerContent} />
        <div className="flex justify-center mt-8">
          <Image src="/LogoWithTextSquare.png" alt="Calvinist Parrot" width={400} height={400} />
        </div>
      </CardContent>
    </Card>
  );
}
