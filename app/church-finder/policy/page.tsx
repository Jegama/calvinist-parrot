"use client";

import { Card, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";

const policyContent = `# Church Partnership and Recommendation Policy

Our goal is to serve the body of Christ with faithfulness, charity, and clarity—pointing people toward churches that proclaim the Gospel and uphold the essentials of the faith, while recognizing legitimate secondary differences among orthodox believers (Philippians 1:9–11; Ephesians 4:14–16).

This policy governs (1) which churches we publicly commend or list as encouraged/recommended, and (2) which churches or ministries we will partner with for co‑branded integrations or API usage under Calvinist Parrot Ministries.

## Foundations

We do not compromise the core doctrines outlined in our Doctrinal Statement. Churches may differ on secondary matters (baptism mode/subjects, governance forms, spiritual gifts, worship style, aspects of covenant theology) without forfeiting Gospel fellowship. We pursue unity in essentials, liberty in non‑essentials, and charity in all things (1 Peter 3:15; Romans 14:1–6).

## Endorsement Categories (Church Finder)

- **Confessional Reformed (Encouraged):** Explicit subscription to a historic Reformed confession (Westminster Standards, 1689 London Baptist, Three Forms of Unity). Clear doctrinal articulation and Gospel emphasis.
- **Recommended:** Affirms the essentials and reflects Reformed or closely compatible theology based on published content.
- **Biblically Sound (With Differences):** Affirms the essentials and is orthodox, yet either (a) holds secondary positions differing from Reformed distinctives, or (b) lacks explicit Reformed identifiers. We note differences for user discernment while honoring shared Gospel foundation.
- **Limited Information:** Website does not clearly state a majority of essential doctrines. This is not an accusation of denial; we encourage direct inquiry before decisions.
- **Not Endorsed:** Clear denial of an essential doctrine or presence of one or more critical red flags (see below).

We do not infer doctrine beyond what is explicitly published online. Absence of content is treated as unknown, not denial.

## Partnership Criteria (API / Ministry Collaboration)

We may partner with, list, or integrate churches/ministries that:

1. Affirm all core doctrines (Trinity; deity and humanity of Christ; authority of Scripture; incarnation and virgin birth; atoning work of Christ; historical death, burial, resurrection; justification by grace through faith in Christ alone; return and final judgment; character of God).
2. Do not deny any essential doctrine either explicitly or structurally.
3. Are free of disqualifying critical concerns (below).
4. Demonstrate a published commitment to preaching or teaching the Word of God (2 Timothy 4:1–2).
5. Conduct public worship and ministry practices in ways consistent with basic biblical order and clarity (1 Corinthians 14:26–33).

We may still list a church with **Limited Information** while declining partnership until clarity is established. Partnerships are revocable if later evidence contradicts published claims.

## Disqualifying Critical Concerns (Red Flags)

Presence of any of these with clear, published evidence results in “Not Endorsed” status and disqualifies partnership. Scriptural citations illustrate doctrinal boundaries.

- **Non‑Trinitarian:** Denies one God in three persons (Matthew 28:19; John 1:1–3)
- **Denies Inerrancy of Scripture:** Rejects Scripture’s authority/inspiration (2 Timothy 3:16–17; Psalm 19:7–9)
- **Works‑Based Justification:** Elevates human merit as necessary for justification (Ephesians 2:8–9; Romans 3:28; Romans 4:5)
- **Universalism:** Asserts all will be saved apart from repentance and faith in Christ (John 14:6; Hebrews 9:27; Matthew 25:46)
- **Prosperity Gospel / Word of Faith:** Treats faith or giving as a guaranteed conduit for health/wealth (1 Timothy 6:3–10; 2 Timothy 4:3–4)
- **Hyper‑Charismatic Excesses:** Elevates manifestations or spectacle above Scripture (1 Corinthians 14:26–33)
- **Entertainment‑Driven Worship:** Main services marketed chiefly as performance/self‑help with diluted Gospel proclamation (2 Timothy 4:1–2; Colossians 3:16)
- **Ordained Women in Elder/Pastor Governing Roles:** Women serving in governing/elder/pastoral teaching offices (1 Timothy 2:12; 1 Timothy 3:1–7; Titus 1:5–9)
- **LGBTQ Affirming (Membership/Ordination/Marriage):** Explicit affirmation of same‑sex marriage, leadership, or doctrinal normalization of sexual sin (Genesis 2:24; Romans 1:26–27; 1 Corinthians 6:9–11)
- **Open Theism:** Denial of God’s exhaustive foreknowledge (Isaiah 46:9–10; Psalm 139:1–6, 16)
- **New Apostolic Reformation (NAR) Claims:** Modern governing apostles or mandated dominionism via extra‑biblical authority (Hebrews 1:1–2; Jude 3)
- **Progressive Christianity Doctrinal Revisions:** Rejection of substitutionary atonement or biblical authority; relativized moral truth (Isaiah 53:4–6; Romans 3:25; John 10:35)
- **Religious Pluralism:** Multiple paths to God affirmed as salvific (Acts 4:12; John 14:6)

Evidence must come from official church publications (statement of faith, sermon summaries, leadership pages, doctrinal pages). We do not treat isolated ambiguous phrasing as conclusive without context.

## Information Gaps

When a church lacks a published statement of faith, confession, or doctrinal detail, we categorize rather than speculate. Informational badges (for example, “No Statement of Faith”, “Minimal Doctrinal Detail”) distinguish absence of clarity from doctrinal error. These alone do not disqualify partnership; due diligence continues until clarification is obtained.

## Correction and Appeals

If you believe an assessment is inaccurate, please email contact@calvinistparrotministries.org with:

- URL(s) showing the clarifying doctrinal statement(s)
- A concise summary of the correction
- Any confession adoption documentation

We review updates promptly. If disqualifying content is removed and sound doctrine is affirmed, status/partnership may be reconsidered (Proverbs 12:17; Ephesians 4:15).

## Summary

We champion Gospel faithfulness across orthodox traditions while exercising discernment where doctrine is distorted or unclear. Our aim is not punitive, but protective, pastoral, and principled. Soli Deo Gloria (Romans 11:36).`;

export default function ChurchPartnershipPolicyPage() {
  return (
    <Card className="max-w-4xl mx-auto mt-8 mb-8">
      <CardContent>
        <MarkdownWithBibleVerses content={policyContent} />
      </CardContent>
    </Card>
  );
}
