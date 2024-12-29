// app/documentation-parrot-qa/page.tsx

"use client";

import React from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from '@/components/MarkdownWithBibleVerses';

const md_text = `# API Documentation: Parrot-QA Endpoint

## Endpoint URL
\`\`\`
https://calvinistparrot.com/api/parrot-qa
\`\`\`

## Overview
This API endpoint provides a structured question-and-answer service based on Reformed Christian theological perspectives. The endpoint processes user questions through categorization, reasoning, and review phases, synthesizing responses to theological and doctrinal queries. It supports two modes of operation:

1. **Reformed Baptist** (default)
2. **Presbyterian**

Each mode tailors its responses according to distinct theological perspectives on secondary issues while sharing a common foundation on core doctrines.

We can add more modes in the future to accommodate different theological nuances. However, we will not compromise on the following essential doctrines:

- **The Trinity**: One God in three persons—Father, Son, and Holy Spirit.
- **The Deity and Humanity of Christ**: Jesus Christ is fully God and fully man.
- **The Gospel**: Salvation by grace alone through faith alone in Christ alone.
- **The Authority of Scripture**: The Bible is the inspired, inerrant, and infallible Word of God.
- **The Resurrection**: The bodily resurrection of Jesus Christ.
- **Justification by Faith**: Salvation by grace through faith in Christ alone.
- **The Character of God**: Emphasizing God's holiness, love, and sovereignty.

---

## How It Works

### Request Body
The API expects a JSON object with the following fields:
- *question* (string, required): The question you want to ask.
- *userId* (string, optional): The user ID for tracking the question history.
- *mode* (string, optional): Specifies the theological perspective. Possible values:
  - *default* (Reformed Baptist perspective)
  - *presbyterian* (Presbyterian perspective)

### Response Format
The API returns a streamed response with multiple stages, each represented as JSON objects:

1. **Progress Updates**:
   \`\`\`json
   {"type":"progress","message":"[Status message]"}
   \`\`\`
2. **Categorization**:
   \`\`\`json
   {"type":"categorization","data":{"category":"[Category]","subcategory":"[Subcategory]","issue_type":"[Type]"}}
   \`\`\`
3. **Agent Responses**:
   \`\`\`json
   {"type":"agent_responses","data":{"first_answer":"[Agent 1's answer]","second_answer":"[Agent 2's answer]","third_answer":"[Agent 3's answer]"}}
   \`\`\`
4. **Calvin Review**:
   \`\`\`json
   {"type":"calvin_review","content":"[Calvin's synthesized review]"}
   \`\`\`
5. **Reviewed Answer** (Streamed):
   \`\`\`json
   {"type":"reviewed_answer","content":"[Final synthesized answer]"}
   \`\`\`

---

## Modes
The endpoint supports two modes, which affect the system's theological perspective on secondary issues:

### **Reformed Baptist (default)**
- **Core Prompt**:
\`\`\`text
You are a representative of the Reformed Christian tradition with a Baptist perspective...
\`\`\`
- **Key Distinctions**:
  - Believer's baptism (credo baptism).
  - Congregational church governance.

### **Presbyterian**
- **Core Prompt**:
\`\`\`text
You are a representative of the Reformed Christian tradition with a Presbyterian perspective...
\`\`\`
- **Key Distinctions**:
  - Infant baptism (paedo baptism).
  - Presbyterian church governance.


---

## Reviewer Agent

So far, the API has one reviewer agent named Calvin. (Not for nothing this website is called **Calvinist Parrot**, hehe.)

* **Calvin**: He reviews the answers provided by the three agents and gives feedback based on John Calvin's "Institutes of the Christian Religion." Calvin's review helps as an additional layer of safeguarding the theological accuracy of the responses.
* **Other agents** can be added upon request to provide a broader range of perspectives. Please reach out if you have specific theologian you would like to include.

---

## Example Usage

This is the exact same way the API is used in the [homepage](/) of this website.

### Request
\`\`\`json
POST https://calvinistparrot.com/api/parrot-qa
Content-Type: application/json

{
    "question": "Who is God?"
}
\`\`\`

### Response
\`\`\`json
{"type":"progress","message":"Understanding question..."}
{"type":"categorization","data":{"reformatted_question":"No reformatting needed","category":"Theology","subcategory":"Doctrine of God (Theology Proper)","issue_type":"Primary"}}
{"type":"progress","message":"Asking the Counsel of Three..."}
{"type":"agent_responses","data":{"first_answer":"God is a Spirit, infinite, eternal, and unchangeable in his being, wisdom, power, holiness, justice, goodness, and truth. (John 4:24; Job 11:7-9; Psalm 90:2; James 1:17; Exodus 3:14; Psalm 147:5; Revelation 4:8; Exodus 34:6)","second_answer":"God is the Creator of everything, existing as one being in three persons: Father, Son, and Holy Spirit. He is holy, loving, and sovereign over all. Through His Word, the Bible, we learn about His character and His desire for a relationship with us. God is powerful and just, yet full of grace and mercy, wanting all to come to Him through Jesus Christ.","third_answer":"God is the supreme being, the Creator of all things, who is holy, just, and loving. He is sovereign, meaning He has all power and authority over creation. God is also personal, wanting a relationship with us. He reveals Himself through the Bible and in the person of Jesus Christ."}}
{"type":"progress","message":"Calvin is reviewing the answers..."}
{"type":"calvin_review","content":"All three answers provide important truths about God, but let us clarify and deepen our understanding.\n\n1. **God's Nature**: God is indeed a Spirit, infinite, eternal, and unchangeable. He is holy, just, loving, and sovereign. This means He has complete authority over all creation.\n\n2. **The Trinity**: It is essential to understand that God exists as one being in three persons: the Father, the Son (Jesus Christ), and the Holy Spirit. This is a core belief in Christian doctrine.\n\n3. **God's Revelation**: God reveals Himself through the Bible and through Jesus Christ. The Bible is our guide to understanding His character and His will for us.\n\n4. **Relationship with God**: God desires a personal relationship with us, inviting us to come to Him through faith in Jesus Christ.\n\nNow, consider these questions:\n- How does understanding God's sovereignty affect your view of your own life and choices?\n- In what ways do you see God's love and justice working together in the world?\n- How can you deepen your relationship with God through prayer and reading the Bible?\n\nReflecting on these questions can help you grasp the fullness of who God is."}
{"type":"progress","message":"Synthesizing final answer..."}
{"type":"reviewed_answer","content":""}
{"type":"reviewed_answer","content":"God"}
{"type":"reviewed_answer","content":" is"}
{"type":"reviewed_answer","content":" the"}
{"type":"reviewed_answer","content":" Creator"}
{"type":"reviewed_answer","content":" of"}
{"type":"reviewed_answer","content":" everything"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" existing"}
{"type":"reviewed_answer","content":" as"}
{"type":"reviewed_answer","content":" one"}
{"type":"reviewed_answer","content":" being"}
{"type":"reviewed_answer","content":" in"}
{"type":"reviewed_answer","content":" three"}
{"type":"reviewed_answer","content":" persons"}
{"type":"reviewed_answer","content":":"}
{"type":"reviewed_answer","content":" Father"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" Son"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" and"}
{"type":"reviewed_answer","content":" Holy"}
{"type":"reviewed_answer","content":" Spirit"}
{"type":"reviewed_answer","content":"."}
{"type":"reviewed_answer","content":" He"}
{"type":"reviewed_answer","content":" is"}
{"type":"reviewed_answer","content":" holy"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" loving"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" and"}
{"type":"reviewed_answer","content":" sovereign"}
{"type":"reviewed_answer","content":" over"}
{"type":"reviewed_answer","content":" all"}
{"type":"reviewed_answer","content":"."}
{"type":"reviewed_answer","content":" Through"}
{"type":"reviewed_answer","content":" His"}
{"type":"reviewed_answer","content":" Word"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" the"}
{"type":"reviewed_answer","content":" Bible"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" we"}
{"type":"reviewed_answer","content":" learn"}
{"type":"reviewed_answer","content":" about"}
{"type":"reviewed_answer","content":" His"}
{"type":"reviewed_answer","content":" character"}
{"type":"reviewed_answer","content":" and"}
{"type":"reviewed_answer","content":" His"}
{"type":"reviewed_answer","content":" desire"}
{"type":"reviewed_answer","content":" for"}
{"type":"reviewed_answer","content":" a"}
{"type":"reviewed_answer","content":" relationship"}
{"type":"reviewed_answer","content":" with"}
{"type":"reviewed_answer","content":" us"}
{"type":"reviewed_answer","content":"."}
{"type":"reviewed_answer","content":" God"}
{"type":"reviewed_answer","content":" is"}
{"type":"reviewed_answer","content":" powerful"}
{"type":"reviewed_answer","content":" and"}
{"type":"reviewed_answer","content":" just"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" yet"}
{"type":"reviewed_answer","content":" full"}
{"type":"reviewed_answer","content":" of"}
{"type":"reviewed_answer","content":" grace"}
{"type":"reviewed_answer","content":" and"}
{"type":"reviewed_answer","content":" mercy"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" wanting"}
{"type":"reviewed_answer","content":" all"}
{"type":"reviewed_answer","content":" to"}
{"type":"reviewed_answer","content":" come"}
{"type":"reviewed_answer","content":" to"}
{"type":"reviewed_answer","content":" Him"}
{"type":"reviewed_answer","content":" through"}
{"type":"reviewed_answer","content":" Jesus"}
{"type":"reviewed_answer","content":" Christ"}
{"type":"reviewed_answer","content":" ("}
{"type":"reviewed_answer","content":"John"}
{"type":"reviewed_answer","content":" "}
{"type":"reviewed_answer","content":"4"}
{"type":"reviewed_answer","content":":"}
{"type":"reviewed_answer","content":"24"}
{"type":"reviewed_answer","content":";"}
{"type":"reviewed_answer","content":" Genesis"}
{"type":"reviewed_answer","content":" "}
{"type":"reviewed_answer","content":"1"}
{"type":"reviewed_answer","content":":"}
{"type":"reviewed_answer","content":"1"}
{"type":"reviewed_answer","content":";"}
{"type":"reviewed_answer","content":" Matthew"}
{"type":"reviewed_answer","content":" "}
{"type":"reviewed_answer","content":"28"}
{"type":"reviewed_answer","content":":"}
{"type":"reviewed_answer","content":"19"}
{"type":"reviewed_answer","content":";"}
{"type":"reviewed_answer","content":" "}
{"type":"reviewed_answer","content":"1"}
{"type":"reviewed_answer","content":" John"}
{"type":"reviewed_answer","content":" "}
{"type":"reviewed_answer","content":"4"}
{"type":"reviewed_answer","content":":"}
{"type":"reviewed_answer","content":"8"}
{"type":"reviewed_answer","content":";"}
{"type":"reviewed_answer","content":" Romans"}
{"type":"reviewed_answer","content":" "}
{"type":"reviewed_answer","content":"5"}
{"type":"reviewed_answer","content":":"}
{"type":"reviewed_answer","content":"8"}
{"type":"reviewed_answer","content":")."}
{"type":"reviewed_answer","content":""}
\`\`\`

### Explanation
As you can see, the API processes the question, categorizes it, generates responses from three agents, reviews the answers, and synthesizes a final response based on the theological perspective. The final answer is streamed in real-time for a dynamic user experience.

You can look [here](https://github.com/Jegama/calvinist-parrot/blob/master/app/page.tsx) to see an example on how I implemented the front-end.

### Prebyterian Mode

If you want to use the Presbyterian mode, you can specify the mode in the request body:

\`\`\`json
{
    "question": "Who is God?",
    "mode": "presbyterian"
}
\`\`\`

---

## Notes
1. This API uses OpenAI's 4o models to generate responses.
2. All interactions are logged in a database for question history tracking.
3. The endpoint streams responses in real-time for a dynamic user experience.

---

## Error Handling
In case of errors, the API returns appropriate HTTP status codes and error messages to help diagnose issues. Make sure to provide valid JSON input and set your API key correctly in the headers or environment variables.

---

## Contact
For further questions or support, [please reach out](mailto:jesus@jgmancilla.com)!

This is open source, so if you're interested in helping me development this, check out the [GitHub repo](https://github.com/Jegama/calvinist-parrot).

# Freely you have received; freely give.

- Matthew 10:8

# Soli Deo Gloria

- Romans 11:36`;

export default function AboutPage() {
  return (
    <Card className="w-[90%] mx-auto mt-8 mb-8">
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
      </CardContent>
    </Card>
  );
}
