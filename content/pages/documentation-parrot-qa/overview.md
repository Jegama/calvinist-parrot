# API Documentation: Parrot-QA Endpoint

## Endpoint URL
```
https://calvinistparrot.com/api/parrot-qa
```

## Overview
This API endpoint provides a structured question-and-answer service based on Christian theological perspectives. The endpoint processes user questions through categorization, reasoning, and review phases, synthesizing concise responses to theological and doctrinal queries. It supports multiple denominational modes to cater to various theological traditions. However, we will not compromise on the following essential doctrines:

- **The Trinity:** One God, eternally existing in three persons—Father, Son, and Holy Spirit.
- **The Character of God:** God is holy, supreme, sovereign, immutable, faithful, good, patient, gracious, merciful, loving, and just; His wrath against sin is real.
- **The Authority of Scripture:** The Bible is the inspired, inerrant, and infallible Word of God, serving as the ultimate authority in all matters of faith and practice.
- **The Deity and Humanity of Christ:** Jesus Christ is truly God and truly man (Vera Deus, vera homo).
- **The Incarnation and Virgin Birth:** Jesus Christ took on human nature through miraculous conception by the Holy Spirit and was born of the Virgin Mary.
- **The Atonement (Christ's Saving Work):** Christ's sacrificial death on the cross is necessary and sufficient to reconcile sinners to God.
- **The Gospel:** Salvation is secured by Christ's historical death, burial, and resurrection on the third day, demonstrating His victory over sin and death.
- **Justification by Faith:** Individuals are justified solely by grace alone through faith alone in Christ alone, apart from works.
- **The Resurrection:** Christ's bodily resurrection, confirming His divinity and victory over sin and death.
- **Christ's Return and Final Judgment:** Jesus Christ will return personally and bodily to judge the living and the dead, culminating in the renewal of all things.

### Chat Endpoint

If you would like to use the Calvinist Parrot for your chat app, we now recommend using the main chat endpoint described in the [Parrot Chat API documentation](/documentation-parrot-chat). The Parrot QA endpoint keeps the classic counsel of three workflow and legacy guardrails, while the chat endpoint powers the primary site experience with the newer LangGraph agent.

---

## How It Works

### Request Body
The API expects a JSON object with the following fields:
- *question* (string, required): The question you want to ask.
- *userId* (string, optional): The user ID for tracking the question history.
- *mode* (string, optional): Specifies the theological perspective. Possible values:
  - *reformed-baptist* (Reformed Baptist perspective - default)
  - *presbyterian* (Presbyterian perspective)
  - *wesleyan* (Wesleyan perspective)
  - *lutheran* (Lutheran perspective)
  - *anglican* (Anglican perspective)
  - *pentecostal* (Pentecostal/Charismatic perspective)
  - *non-denom* (Non-Denominational Evangelical perspective)

### Response Format
The API returns a streamed response with multiple stages, each represented as JSON objects:

1. **Progress Updates**:
   ```json
   {"type":"progress","message":"[Status message]"}
   ```
2. **Categorization**:
   ```json
   {"type":"categorization","data":{"category":"[Category]","subcategory":"[Subcategory]","issue_type":"[Type]"}}
   ```
3. **Agent Responses**:
   ```json
   {"type":"agent_responses","data":{"first_answer":"[Agent 1's answer]","second_answer":"[Agent 2's answer]","third_answer":"[Agent 3's answer]"}}
   ```
4. **Calvin Review**:
   ```json
   {"type":"calvin_review","content":"[Calvin's synthesized review]"}
   ```
5. **Reviewed Answer** (Streamed):
   ```json
   {"type":"reviewed_answer","content":"[Final synthesized answer]"}
   ```

---

## Reviewer Agent

So far, the API has one reviewer agent named Calvin. (Not for nothing this website is called **Calvinist Parrot**, hehe.)

* **Calvin**: He reviews the answers provided by the three agents and gives feedback based on John Calvin's "Institutes of the Christian Religion." Calvin's review helps as an additional layer of safeguarding the theological accuracy of the responses.
* **Other agents** can be added upon request to provide a broader range of perspectives. Please reach out if you have specific theologian you would like to include.

---

## Example Usage

This example shows how you can call the Parrot QA endpoint directly. The main homepage chat now uses the `/api/parrot-chat` endpoint, while `/api/parrot-qa` is available when you want the classic OG behavior and evaluation traces.

### Request
```json
POST https://calvinistparrot.com/api/parrot-qa
Content-Type: application/json

{
    "question": "Who is God?",
    "mode": "reformed-baptist"
}
```

### Response
```json
{"type":"progress","message":"Understanding question..."}
{"type":"categorization","data":{"reformatted_question":"No reformatting needed","category":"Theology","subcategory":"Doctrine of God (Theology Proper)","issue_type":"Primary"}}
{"type":"progress","message":"Asking the Counsel of Three..."}
{"type":"agent_responses","data":{"first_answer":"God is the creator of everything. He is all-powerful, all-knowing, and always present. He is loving, holy, and just.","second_answer":"God is the Creator of everything, existing as one God in three persons: the Father, the Son (Jesus Christ), and the Holy Spirit. He is holy, loving, and just. God is sovereign, meaning He has control over all things, and He is unchanging in His character. We can know Him through Scripture, which reveals His nature and His relationship with humanity. Through Jesus, we see God's love and grace, as He came to save us from our sins.","third_answer":"God is the Creator of all things, entirely sovereign, and supreme in power and authority. He is holy, loving, just, and merciful. God reveals Himself in the Bible and through creation, inviting us to know Him and live according to His will."}}
{"type":"progress","message":"Calvin is reviewing the answers..."}
{"type":"calvin_review","content":"All three answers provide a good understanding of who God is, but let's clarify a few points.\n\n1. **God as Creator**: All answers correctly state that God is the Creator of everything. This is foundational.\n\n2. **God's Nature**: They all mention God's attributes—His holiness, love, justice, and mercy. This is important because it shows His character.\n\n3. **The Trinity**: Agent B uniquely mentions the Trinity, which is essential in understanding God as one being in three persons: Father, Son, and Holy Spirit. This is a key doctrine in Christianity.\n\n4. **Sovereignty**: Agent C emphasizes God's sovereignty, which means He is in control of all things. This is crucial for understanding His power and authority.\n\n5. **Revelation**: All answers mention that God reveals Himself through the Bible and creation, which is vital for knowing Him.\n\nTo reflect on these answers, consider these questions:\n- How does understanding God as a loving Father change your view of Him?\n- Why is it important to recognize God's sovereignty in our lives?\n- How does the concept of the Trinity help us understand the relationship between God and humanity?\n\nThese reflections can deepen your understanding of God."}
{"type":"progress","message":"Synthesizing final answer..."}
{"type":"reviewed_answer","content":""}
{"type":"reviewed_answer","content":"God"}
{"type":"reviewed_answer","content":" is"}
{"type":"reviewed_answer","content":" the"}
{"type":"reviewed_answer","content":" Creator"}
{"type":"reviewed_answer","content":" of"}
{"type":"reviewed_answer","content":" everything"}
.
.
.
```

### Explanation
As you can see, the API processes the question, categorizes it, generates responses from three agents, reviews the answers, and synthesizes a final response based on the theological perspective. The final answer is streamed in real-time for a dynamic user experience.

You can look [here](https://github.com/Jegama/calvinist-parrot/blob/master/app/page.tsx) to see an example on how I implemented the front-end.

---

## Modes

The endpoint supports the following modes:

1. **Reformed Baptist** (default)
2. **Presbyterian**
3. **Wesleyan**
4. **Lutheran**
5. **Anglican**
6. **Pentecostal/Charismatic**
7. **Non-Denominational Evangelical**

Each mode tailors its responses according to distinct theological perspectives on secondary issues while sharing a common foundation on core doctrines.
