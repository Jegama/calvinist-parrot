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
- **The Character of God**: God's holiness, supremacy, sovereignty, immutability, faithfulness, goodness, patience, grace, mercy, love, and wrath.

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
{"type":"agent_responses","data":{"first_answer":"God is the creator of everything. He is all-powerful, all-knowing, and always present. He is loving, holy, and just.","second_answer":"God is the Creator of everything, existing as one God in three persons: the Father, the Son (Jesus Christ), and the Holy Spirit. He is holy, loving, and just. God is sovereign, meaning He has control over all things, and He is unchanging in His character. We can know Him through Scripture, which reveals His nature and His relationship with humanity. Through Jesus, we see God's love and grace, as He came to save us from our sins.","third_answer":"God is the Creator of all things, entirely sovereign, and supreme in power and authority. He is holy, loving, just, and merciful. God reveals Himself in the Bible and through creation, inviting us to know Him and live according to His will."}}
{"type":"progress","message":"Calvin is reviewing the answers..."}
{"type":"calvin_review","content":"All three answers provide a good understanding of who God is, but let’s clarify a few points.\n\n1. **God as Creator**: All answers correctly state that God is the Creator of everything. This is foundational.\n\n2. **God's Nature**: They all mention God's attributes—His holiness, love, justice, and mercy. This is important because it shows His character.\n\n3. **The Trinity**: Agent B uniquely mentions the Trinity, which is essential in understanding God as one being in three persons: Father, Son, and Holy Spirit. This is a key doctrine in Christianity.\n\n4. **Sovereignty**: Agent C emphasizes God's sovereignty, which means He is in control of all things. This is crucial for understanding His power and authority.\n\n5. **Revelation**: All answers mention that God reveals Himself through the Bible and creation, which is vital for knowing Him.\n\nTo reflect on these answers, consider these questions:\n- How does understanding God as a loving Father change your view of Him?\n- Why is it important to recognize God’s sovereignty in our lives?\n- How does the concept of the Trinity help us understand the relationship between God and humanity?\n\nThese reflections can deepen your understanding of God."}
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
{"type":"reviewed_answer","content":" God"}
{"type":"reviewed_answer","content":" in"}
{"type":"reviewed_answer","content":" three"}
{"type":"reviewed_answer","content":" persons"}
{"type":"reviewed_answer","content":":"}
{"type":"reviewed_answer","content":" the"}
{"type":"reviewed_answer","content":" Father"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" the"}
{"type":"reviewed_answer","content":" Son"}
{"type":"reviewed_answer","content":" ("}
{"type":"reviewed_answer","content":"Jesus"}
{"type":"reviewed_answer","content":" Christ"}
{"type":"reviewed_answer","content":"),"}
{"type":"reviewed_answer","content":" and"}
{"type":"reviewed_answer","content":" the"}
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
{"type":"reviewed_answer","content":" just"}
{"type":"reviewed_answer","content":"."}
{"type":"reviewed_answer","content":" God"}
{"type":"reviewed_answer","content":" is"}
{"type":"reviewed_answer","content":" sovereign"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" meaning"}
{"type":"reviewed_answer","content":" He"}
{"type":"reviewed_answer","content":" has"}
{"type":"reviewed_answer","content":" control"}
{"type":"reviewed_answer","content":" over"}
{"type":"reviewed_answer","content":" all"}
{"type":"reviewed_answer","content":" things"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" and"}
{"type":"reviewed_answer","content":" He"}
{"type":"reviewed_answer","content":" is"}
{"type":"reviewed_answer","content":" un"}
{"type":"reviewed_answer","content":"changing"}
{"type":"reviewed_answer","content":" in"}
{"type":"reviewed_answer","content":" His"}
{"type":"reviewed_answer","content":" character"}
{"type":"reviewed_answer","content":"."}
{"type":"reviewed_answer","content":" We"}
{"type":"reviewed_answer","content":" can"}
{"type":"reviewed_answer","content":" know"}
{"type":"reviewed_answer","content":" Him"}
{"type":"reviewed_answer","content":" through"}
{"type":"reviewed_answer","content":" Scripture"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" which"}
{"type":"reviewed_answer","content":" reveals"}
{"type":"reviewed_answer","content":" His"}
{"type":"reviewed_answer","content":" nature"}
{"type":"reviewed_answer","content":" and"}
{"type":"reviewed_answer","content":" His"}
{"type":"reviewed_answer","content":" relationship"}
{"type":"reviewed_answer","content":" with"}
{"type":"reviewed_answer","content":" humanity"}
{"type":"reviewed_answer","content":"."}
{"type":"reviewed_answer","content":" Through"}
{"type":"reviewed_answer","content":" Jesus"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" we"}
{"type":"reviewed_answer","content":" see"}
{"type":"reviewed_answer","content":" God's"}
{"type":"reviewed_answer","content":" love"}
{"type":"reviewed_answer","content":" and"}
{"type":"reviewed_answer","content":" grace"}
{"type":"reviewed_answer","content":","}
{"type":"reviewed_answer","content":" as"}
{"type":"reviewed_answer","content":" He"}
{"type":"reviewed_answer","content":" came"}
{"type":"reviewed_answer","content":" to"}
{"type":"reviewed_answer","content":" save"}
{"type":"reviewed_answer","content":" us"}
{"type":"reviewed_answer","content":" from"}
{"type":"reviewed_answer","content":" our"}
{"type":"reviewed_answer","content":" sins"}
{"type":"reviewed_answer","content":" ("}
{"type":"reviewed_answer","content":"Genesis"}
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
{"type":"reviewed_answer","content":" Hebrews"}
{"type":"reviewed_answer","content":" "}
{"type":"reviewed_answer","content":"13"}
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
