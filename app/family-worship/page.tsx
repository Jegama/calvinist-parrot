// app/family-worship/page.tsx

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";

const testimonyContent = `### Why Family Worship?

Family worship matters because it helps households honor God together, pass biblical faith to the next generation, and shape hearts and habits toward Christ. It is the practice of gathering your family to read Scripture, pray, and sing praise to God.

#### Biblical Foundations
- **It fulfills the command to teach Scripture at home.** Parents are the primary spiritual shepherds of their children, tasked with weaving God's Word into the fabric of daily life (Deuteronomy 6:4-9; Joshua 24:15).
- **It passes the faith to the next generation.** This practice ensures our children and grandchildren hear of the Lord's mighty deeds and learn to trust Him (Psalm 78:5-7; 2 Timothy 3:14-15).
- **It disciplines and disciples in love.** Family worship is a workshop for heart formation, where we learn to apply God's wisdom in an atmosphere of grace (Ephesians 6:4; Proverbs 22:6).
- **It unites the household in spiritual rhythms.** The home becomes a "little church," echoing the corporate practices of praise, Scripture, prayer, and fellowship (Colossians 3:16-17; Hebrews 10:24-25).
- **It forms spiritual habits for life.** Consistent time in the Word and prayer equips families to endure trials, grow in holiness, and live out the Great Commission (Matthew 28:19-20; Philippians 1:6).

#### Practical Blessings
- Children learn the language of faith: how to read Scripture, pray, confess sin, and worship God.
- Parents get to model repentance, faith, and daily reliance on God's grace.
- The family builds a treasury of shared spiritual memories and a common language for navigating life.
- It keeps the gospel at the center of the home, continually reminding the household of God's faithfulness.

#### Simple Steps to Get Started
- **Keep it short and consistent.** Five to fifteen minutes daily is more fruitful than an hour once a month. Faithfulness matters more than perfection (Luke 16:10).
- **Read, Pray, Sing.** Read a short passage, explain it simply, pray together, and sing a hymn or recite a memory verse.
- **Make it age-appropriate.** Use Bible stories and questions for young children; encourage deeper discussion with teens.
- **Be authentic.** Don't pretend to have it all together. Model repentance, share how the gospel applies to your own life, and celebrate God's answers to prayer.
- **Ask your church for help.** Pastors and elders can often provide resources like a family worship guide, a children's catechism, or a recommended devotional. (Hebrews 13:7)

#### How It Has Steadied Our Home

For our family, this rhythm has been a lifeline. As a newly married couple and the arrival of our first child, we’ve faced job loss, medical stresses, and a pile of unexpected bills. In a season where it would be easy to retreat into ourselves, family worship has been essential for protecting our union. It forces us to stop, open the Word, and pray *for* and *with* each other. Sharing our fears and burdens in prayer has been one of the most powerful means of grace God has used to knit our hearts together. We can testify that establishing this one habit has been the best thing we have done for our marriage.

### A Glimpse into Our Family's Rhythm

To ensure we remain in the Word together, we aim for both morning and evening worship. This isn't a legalistic rule, but a practical grace—when busy evenings with friends or church activities cause us to miss our nighttime gathering, we know we have another opportunity in the morning. This rhythm helps us stay consistent without letting too much time pass between moments of shared worship.

#### Our Evening Family Worship (Sunday-Saturday)
- Opening prayer
- Read one chapter together
- Discuss the passage and how it points us to Christ
- Pray for each other and four families on our rotation, asking the Lord to save their children
- Sing a hymn straight from our hymnals, moving through them in order

#### Our Morning Family Worship (Monday-Saturday)
- Opening prayer using one selection per week from *The Valley of Vision*
- Read one chapter from Psalms, Proverbs, or Ecclesiastes on a rotation
- Sing one hymn each week from our memorization list
- Close in prayer, entrusting the day to the Lord

Evenings often fill with hospitality and church gatherings, so meeting in the morning ensures we share at least one focused time together even when the evening service is missed. We invite dinner guests into these moments and have found it a sweet way to deepen fellowship and encourage believers and seekers alike. If you cannot manage both gatherings, take heart—set the pace that fits your household and let the Word dwell richly in your home (Colossians 3:16-17).

### How the Prayer Tracker Serves Us

We use the [Calvinist Parrot prayer tracker](/prayer-tracker) to steward intercession faithfully. The rotation keeps our requests from slipping through the cracks, and logging answers stirs our faith to keep approaching the throne of grace (Philippians 4:6-7; Hebrews 4:14-16). Whether you are new to family worship or simply looking for structure, we hope this tool helps your household persevere in prayer.

Turn from self-reliance, trust Jesus Christ who died and rose for sinners, and join us in worshiping Him together at home. If you have any questions [please let reach out](mailto:jesusmancilla@calvinistparrotministries.org)!

# Soli Deo Gloria

- Romans 11:36`;

export default function FamilyWorshipPage() {
  return (
    <Card className="max-w-3xl mx-auto mt-8 mb-8">
      <CardContent>
        <MarkdownWithBibleVerses content={testimonyContent} />
      </CardContent>
    </Card>
  );
}
