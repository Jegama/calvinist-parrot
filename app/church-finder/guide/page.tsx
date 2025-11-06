"use client";

import { Card, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";

const guideContent = `# How We Evaluate Churches

We aim to serve believers with clarity and charity. Our summaries rely on what churches publish on their own websites. If something is not clearly stated online, we will not infer or guess their position.

## The Five Categories

* **Confessional Reformed (Encouraged):** This church publicly subscribes to a historic Reformed confession (e.g., Westminster Standards, 1689 London Baptist, Three Forms of Unity).
* **Recommended:** Based on what is published, the church affirms a majority of essential Christian doctrines and holds to Reformed or compatible theology. We can commend this church.
* **Biblically Sound (With Differences):** This church affirms a majority of essential Christian doctrines and is biblically orthodox. However, it either holds to secondary theological positions that differ from Reformed theology, or it does not clearly identify with Reformed distinctives. While we can affirm their commitment to essential Christianity, we note these differences for your discernment.
* **Limited Information:** The church's website does not clearly state a majority of essential doctrines. This does not mean the church denies these doctrines—it may simply not be stated clearly online. We encourage you to reach out to the church directly for clarification before making a decision.
* **Not Endorsed:** Based on what is published, this church denies essential Christian doctrine or holds positions on secondary matters that we cannot endorse based on Scripture.

## What We Consider “Essentials”

Essentials include core Christian doctrines such as the Trinity, the authority of Scripture, the deity and humanity of Christ, the incarnation and virgin birth, Christ's atoning work, the Gospel (death, burial, and bodily resurrection of Jesus), justification by faith, Christ's return and final judgment, and the character of God. Read our full statement on the [Doctrinal Statement](/doctrinal-statement) page.

## How Evaluations Are Produced

* We gather relevant pages from each church website (beliefs, confession, about, leadership).
* We summarize what is explicitly stated and compute a simple "essentials on website" coverage metric.
* If a church clearly adopts a historic Reformed confession, we surface that as **Confessional Reformed (Encouraged)**.
* Churches that affirm a majority of essential doctrines and hold to Reformed or compatible theology are labeled **Recommended**.
* Churches that affirm a majority of essential doctrines and are biblically orthodox, but either hold to secondary positions that differ from Reformed theology or do not clearly identify with Reformed distinctives, are labeled **Biblically Sound (With Differences)** to help you make an informed decision.
* Some denominations or movements have well-known doctrinal positions that conflict with essential Christian doctrine. When applicable, we display a brief note for awareness.

## Limits and Corrections

We do not infer beliefs that are not stated online. If you see something inaccurate, please [email us](mailto:contact@calvinistparrotministries.org) with the page link and what needs correction.

## Why This Matters

We want to point people toward churches that clearly proclaim the Gospel and uphold the essentials of the faith, while encouraging careful, charitable discernment where information is limited. Our hope is to serve the body of Christ and encourage healthy local church involvement.

# Soli Deo Gloria

* Romans 11:36`;

export default function ChurchFinderGuidePage() {
  return (
    <Card className="max-w-4xl mx-auto mt-8 mb-8">
      <CardContent>
        <MarkdownWithBibleVerses content={guideContent} />
      </CardContent>
    </Card>
  );
}
