// app/kids-discipleship/framework/page.tsx
// Plan of Discipleship Framework explanation page
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Target, Wrench, Gift, Scale, BookOpen, Calendar, Headphones, Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Metadata } from "next";

import { BibleVerse } from "@/components/BibleVerse";

export const metadata: Metadata = {
  title: "Plan of Discipleship Framework | Heritage Journal",
  description:
    "Learn about Dr. Gifford's Plan of Discipleship framework and the four elements of discipleship: Character, Competencies, Blessings, and Consequences.",
};

export default function FrameworkPage() {
  return (
    <div className="container mx-auto px-4 sm:px-6 py-8 min-h-[calc(100vh-var(--app-header-height))]">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-col gap-4 mb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground mb-2">
              Plan of Discipleship Framework
            </h1>
            <p className="text-muted-foreground">
              The four elements of biblical child discipleship
            </p>
          </div>
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/kids-discipleship">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Heritage Journal
            </Link>
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Introduction */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-accent" />
              Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Dr. Gifford&apos;s &quot;Plan of Discipleship&quot; has four distinct categories that must be customized based on
              the child&apos;s <strong>Age Bracket</strong> (0-3, 3-6, 7-12, 13-17). The goal remains constant: to raise
              children who glorify God and possess the character and skills to live responsibly in His world.
            </p>
          </CardContent>
        </Card>

        {/* Age Brackets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-accent" />
              Understanding Age Brackets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Dr. Gifford emphasized that <em>how</em> you apply these four elements changes drastically by age. Each
              developmental stage has unique opportunities and challenges:
            </p>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold">Age Bracket</TableHead>
                    <TableHead className="font-semibold">Stage</TableHead>
                    <TableHead className="font-semibold">Primary Focus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">0–3</TableCell>
                    <TableCell>Input Years</TableCell>
                    <TableCell>Authority, Atmosphere, Basic Habits</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">3–6</TableCell>
                    <TableCell>Training Years</TableCell>
                    <TableCell>First-time obedience, &quot;No&quot; means &quot;No,&quot; basic social skills</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">7–12</TableCell>
                    <TableCell>Discipleship Prime</TableCell>
                    <TableCell>Invest heavily: heart conversations, character formation, professional/personal skills</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">13–17</TableCell>
                    <TableCell>Coaching/Transition</TableCell>
                    <TableCell>Independent decision making, partnership, guiding rather than directing</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Element 1: Character */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-accent" />
              1. Character (Christ-likeness)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold text-foreground mb-2">Definition</h3>
              <p className="text-muted-foreground">
                Moral and spiritual attributes that reflect Jesus (e.g., kindness, self-control, truthfulness).
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2">Strategy</h3>
              <p className="text-muted-foreground mb-3">
                Pick 2–3 specific traits per year. Don&apos;t try to fix everything at once. Focus on what is arguably
                lacking or developmentally necessary.
              </p>
              <p className="text-muted-foreground">
                <strong className="text-foreground">Important:</strong> Identify specific &quot;Christ-like&quot; traits (e.g.,
                compassion, diligence, patience) rather than just behavioral fixes (e.g., &quot;stop yelling&quot;). This
                emphasizes the positive pursuit of Christ rather than mere behavior modification.
              </p>
            </div>
            <Alert className="bg-accent/5 border-accent/20">
              <AlertDescription>
                <strong>Biblical Basis:</strong> <BibleVerse reference="2 Peter 1:5-7" /> (Supplement your faith with virtue...).
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Element 2: Competencies */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-accent" />
              2. Competencies (Life Skills)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold text-foreground mb-2">Definition</h3>
              <p className="text-muted-foreground">
                Practical skills required for responsible living (professional/personal).
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2">Strategy</h3>
              <p className="text-muted-foreground mb-3">These must be age-appropriate:</p>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Professional:</strong> School grades, work ethic, handling money.
                </li>
                <li>
                  <strong className="text-foreground">Personal:</strong> Hygiene, social skills (eye contact,
                  handshakes), devotional habits.
                </li>
              </ul>
              <p className="text-muted-foreground mt-3">
                <strong className="text-foreground">Example:</strong> A 4-year-old&apos;s &quot;professional&quot; skill might be
                picking up toys; a 16-year-old&apos;s might be holding a part-time job or managing a budget.
              </p>
            </div>
            <Alert className="bg-accent/5 border-accent/20">
              <AlertDescription>
                <strong>Biblical Basis:</strong> <BibleVerse reference="2 Thessalonians 3:10-12" /> (The value of work and quiet living); <BibleVerse reference="1 Thessalonians 4:11" />.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Element 3: Blessings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-accent" />
              3. Blessings (The Harvest of Obedience)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold text-foreground mb-2">Definition</h3>
              <p className="text-muted-foreground">Positive outcomes for honoring God and parents.</p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2">Types</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Practical:</strong> Screen time, ice cream, special outings,
                  monetary rewards (for older kids).
                </li>
                <li>
                  <strong className="text-foreground">Spiritual:</strong> Affirmation of pleasing the Lord, peace in
                  the home, joy.
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2">Blessings vs. Bribery</h3>
              <p className="text-muted-foreground">
                Blessings are the <em>natural fruit of obedience</em>—rewarding good character after the fact. Bribery,
                in contrast, is negotiating for behavior beforehand (&quot;I&apos;ll give you candy if you stop crying&quot;).
                Blessings reinforce the harvest principle; bribery undermines parental authority.
              </p>
            </div>
            <Alert className="bg-accent/5 border-accent/20">
              <AlertDescription>
                <strong>Biblical Basis:</strong> <BibleVerse reference="Ephesians 6:2-3" /> (&quot;...that it may go well with you&quot;).
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Element 4: Consequences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-accent" />
              4. Consequences (The Harvest of Disobedience)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold text-foreground mb-2">Definition</h3>
              <p className="text-muted-foreground">Negative outcomes for dishonoring God and parents.</p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2">Strategy</h3>
              <p className="text-muted-foreground">
                Must be age-appropriate (e.g., no spanking for a 17-year-old; no taking away car keys from a 4-year-old).
              </p>
            </div>
            <Alert className="bg-accent/5 border-accent/20">
              <AlertDescription>
                <strong>Biblical Basis:</strong> <BibleVerse reference="Galatians 6:7" /> (Reaping what you sow); <BibleVerse reference="Proverbs 22:15" />.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Annual Review Rhythm */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-accent" />
              The Annual Reset
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Dr. Gifford emphasized the importance of consistency and intentional review. Set aside time each year
              (e.g., New Year&apos;s, before school starts, or on your child&apos;s birthday) to review and update these goals
              as your child moves into new developmental stages.
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <strong className="text-foreground">Reflect:</strong> What character traits grew this year? Which
                competencies were gained?
              </li>
              <li>
                <strong className="text-foreground">Adjust:</strong> Update your plan based on their current age
                bracket and emerging needs.
              </li>
              <li>
                <strong className="text-foreground">Celebrate:</strong> Acknowledge progress and thank God for His
                faithfulness in your family.
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Podcast Resources */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Headphones className="h-5 w-5 text-accent" />
              Learn More from Dr. Gifford
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              This framework is based on Dr. Greg Gifford&apos;s teaching. Listen to the original podcast episodes for
              deeper insight:
            </p>
            <ul className="space-y-3">
              <li>
                <a
                  href="https://fortisplus.org/tabs/listen/podcasts/34123/episodes/157"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:no-underline"
                >
                  Part 1: Four Discipleship Habits For Godly Christian Parenting In The New Year
                </a>
              </li>
              <li>
                <a
                  href="https://fortisplus.org/tabs/listen/podcasts/34123/episodes/158"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:no-underline"
                >
                  Part 2: Parenting For Every Age: How To Point Your Children Toward Jesus
                </a>
              </li>
            </ul>
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground">
                Subscribe to{" "}
                <a
                  href="https://fortisplus.org/tabs/listen/podcasts/34123"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:no-underline"
                >
                  Transformed with Dr. Greg Gifford
                </a>{" "}
                for more biblical counseling content, or visit{" "}
                <a
                  href="https://fortisinstitute.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:no-underline"
                >
                  Fortis Institute
                </a>{" "}
                to explore their resources.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Call to Action */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-6 text-center">
            <h2 className="text-xl font-semibold text-foreground mb-3">Ready to Apply This Framework?</h2>
            <p className="text-muted-foreground mb-4">
              Heritage Journal helps you implement these four elements with your children through age-appropriate
              planning and reflection.
            </p>
            <Button asChild>
              <Link href="/kids-discipleship">Start Using Heritage Journal</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
