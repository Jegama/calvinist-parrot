// app/about/page.tsx

"use client";

import React from "react";
import Image from "next/image";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from '@/components/MarkdownWithBibleVerses';

const md_text = `Welcome! I'm here to guide you through the Bible from a Reformed perspective. Feel free to ask me anything about Scripture. I'll provide insights based on my knowledge and understanding as a Reformed Christian.

I can help you with:
- **Real-Time Chat:** Engage in interactive sessions with streamed responses.
- **Prayer Tracker:** Organize your prayer life with rotating prayer assignments, personal and family prayer requests, and prayer journals—designed to help you pray consistently for your household and broader faith community.
- **Church Finder:** Discover biblically sound churches with AI-powered doctrinal evaluations. Each church is analyzed for adherence to essential Christian doctrines, historic Reformed confessions, and theological soundness to help you find a faithful congregation.

#### Acknowledgements

Huge thanks to [AO Lab](https://helloaolab.my.canva.site/) for graciously providing the [API](https://bible.helloao.org/docs/) with the Berean Standard Bible ([BSB](https://berean.bible/)) translation and the Bible Commentaries.

If you want to learn the legal restrictions to sharing God's word, click [here](https://copy.church/initiatives/bibles/).

## Calvinist Parrot APIs

I'm opening an API! It is fully guarded so you don't have to worry about prompting or anything.

### Parrot Chat API

Want to add a chat function with Bible knowledge to your website? Check out the [Parrot Chat API documentation](/documentation-parrot-chat)!

### Calvinist Parrot Ministries

This work is part of the [Calvinist Parrot Ministries](https://www.calvinistparrotministries.org/), we exist to glorify God by creating and freely distributing AI tools that proclaim the Gospel, strengthen the Church, and equip believers across the globe.`;

const md_footer = `## Let's Connect

I'm still learning, so if you have any feedback [please let me know](mailto:contact@calvinistparrotministries.org)!

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
            src="/LogoWithTextSquare.png"
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
