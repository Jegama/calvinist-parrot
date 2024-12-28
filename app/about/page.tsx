// app/about/page.tsx

"use client";

import React from "react";
import Image from "next/image";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from '@/components/MarkdownWithBibleVerses';

const md_text = `Welcome! I'm here to guide you through the Bible from a Reformed perspective. Feel free to ask me anything about Scripture. I'll provide insights based on my knowledge and understanding as a Reformed Christian.

#### Acknowledgements

Huge thanks to [AO Lab](https://helloaolab.my.canva.site/) for graciously providing the [API](https://bible.helloao.org/docs/) with the Berean Standard Bible ([BSB](https://berean.bible/)) translation and the Bible Commentaries.

Learn more about the BSB [here](https://copy.church/initiatives/bibles/) and join us in discovering the richness of its text.

### Parrot QA API

After years of development, I'm now able to answer questions about the Bible and am fully guarded so you don't have to worry about prompting or anything. If you want to add a QA function to your website, please see the [Parrot QA API documentation](/documentation-parrot-qa) so you can use it!`;

const md_footer = `## Let's Connect

I'm a work in progress, I'm rebuilding what I did before in [python](https://github.com/Jegama/calvinist-parrot-legacy), but now in Next.js. I'm still learning, so if you have any feedback [please let me know](mailto:jesus@jgmancilla.com)!

This is open source, so if you're interested in helping me development this, check out the [GitHub repo](https://github.com/Jegama/calvinist-parrot).

# Soli Deo Gloria

- Romans 11:36`;

export default function AboutPage() {
  return (
    <Card className="max-w-2xl mx-auto mt-8 mb-8">
      <CardHeader>
        <CardTitle>About</CardTitle>
      </CardHeader>
      <CardContent>
        <MarkdownWithBibleVerses content={md_text} />
        <div className="flex justify-center mt-8">
          <Image
            src="/dall_e_s_parrot.png"
            alt="Calvinist Parrot"
            width={400}
            height={400}
          />
        </div>
        <MarkdownWithBibleVerses content={md_footer} />
      </CardContent>
    </Card>
  );
}
