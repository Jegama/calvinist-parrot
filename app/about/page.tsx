// app/about/page.tsx

import Image from "next/image";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { createMarkdownLoader } from "@/lib/createMarkdownLoader";

const getIntroContent = createMarkdownLoader("pages/about/intro.md");
const getFooterContent = createMarkdownLoader("pages/about/footer.md");

export default async function AboutPage() {
  const [introContent, footerContent] = await Promise.all([getIntroContent(), getFooterContent()]);

  return (
    <Card className="max-w-2xl mx-auto mt-8 mb-8">
      <CardHeader>
        <CardTitle>About</CardTitle>
      </CardHeader>
      <CardContent>
        <MarkdownWithBibleVerses content={introContent} />
        <div className="flex justify-center mt-8">
          <Image src="/LogoWithTextSquare.png" alt="Calvinist Parrot" width={400} height={400} />
        </div>
        <MarkdownWithBibleVerses content={footerContent} />
      </CardContent>
    </Card>
  );
}
