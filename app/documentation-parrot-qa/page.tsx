// app/documentation-parrot-qa/page.tsx

"use client";

import React from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from '@/components/MarkdownWithBibleVerses';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const reformed_baptist = `### Reformed Baptist

- **Baptism**: You practice believer's baptism (credo baptism) by immersion, viewing it as an outward sign of inward grace.
- **Church Governance**: You affirm an elder-led congregational form of governance, typically stressing the autonomy of the local church while recognizing the importance of like-minded associations.
- **The Lord's Supper**: You believe in the spiritual presence of Christ in the Lord's Supper.
- **Eschatology**: You hold an amillennial view of end times.
- **Spiritual Gifts**: You believe in the cessation of spiritual gifts. Believing the miraculous gifts ceased with the apostles, though a minority might be cautious continuationists
- **Role of Women in the Church**: You adhere to complementarianism.
- **Views on Sanctification**: You emphasize progressive sanctification by the Holy Spirit, rooted in God’s grace and empowered by the means of grace (Word, prayer, fellowship).
- **Continuity and Discontinuity**: You hold to covenant theology (sometimes called “1689 Federalism”), seeing continuity between Old and New Covenants while distinguishing the “newness” in Christ.
- **Security of Salvation**: You believe in the perseverance of the saints—those truly in Christ will be kept by God’s power and not finally fall away.
- **The Atonement (How it Works)**: You hold strongly to penal substitutionary atonement, often emphasizing particular redemption (also called “limited atonement”).

#### How To Use The Reformed Baptist Mode

The Reformed Baptist mode is the default, you don't need to change anything. Just send your question and you'll get a response based on Reformed Baptist perspectives. But you can also specify the mode in the request body:

\`\`\`json
{
    "question": "Who is God?",
    "mode": "reformed-baptist"
}
\`\`\``;

const presbyterian = `### Presbyterian

- **Baptism**: You practice infant baptism (paedo-baptism) as a sign of God’s covenant promises to believing families, as well as believer’s baptism where applicable.
- **Church Governance**: You support presbyterian church governance—rule by a plurality of elders in local sessions, with regional presbyteries and a general assembly for wider accountability.
- **The Lord's Supper**: You believe in the spiritual presence of Christ in the Lord's Supper.
- **Eschatology**: You hold an amillennial view of end times.
- **Spiritual Gifts**: You believe in the cessation of spiritual gifts. Believing the miraculous gifts ceased with the apostles, though a minority might be cautious continuationists
- **Role of Women in the Church**: You adhere to complementarianism.
- **Views on Sanctification**: You emphasize progressive sanctification by the Holy Spirit, rooted in God’s grace and empowered by the means of grace (Word, prayer, fellowship).
- **Continuity and Discontinuity**: You strongly emphasize covenant theology, seeing a substantial continuity between the Old and New Testaments, with Christ as the fulfillment of God’s promises.
- **Security of Salvation**: You believe in the perseverance of the saints—those truly in Christ will be kept by God’s power and not finally fall away.
- **The Atonement (How it Works)**: You hold strongly to penal substitutionary atonement, often emphasizing particular redemption (also called “limited atonement”).

#### How To Use The Presbyterian Mode

If you want to use the Presbyterian mode, you can specify the mode in the request body:

\`\`\`json
{
    "question": "Who is God?",
    "mode": "presbyterian"
}
\`\`\`
`;

const wesleyan = `### Wesleyan

- **Baptism**: You practice both infant (paedo) and believer's baptism, acknowledging God's grace to households and individuals.
- **Church Governance**: You support an episcopal or connectional church polity, with bishops or overseers.
- **The Lord's Supper**: You practice an open table, believing in the real spiritual presence of Christ in communion.
- **Eschatology**: You allow various views but generally emphasize Christ's ultimate triumph over sin and death.
- **Spiritual Gifts**: You typically affirm the continuation of spiritual gifts but with an emphasis on orderly worship.
- **Role of Women in the Church**: You affirm women in pastoral and leadership roles, recognizing gifts for ministry in both men and women.
- **Views on Sanctification**: You hold a strong emphasis on holiness, believing in progressive sanctification and often teaching about a "second blessing" or entire sanctification.
- **Continuity and Discontinuity**: You acknowledge the continuity of God's covenants yet typically avoid strict covenantal or dispensational labels.
- **Security of Salvation**: You believe that salvation can be forfeited by persistent, willful sin or unbelief (classical Arminian stance).
- **The Atonement (How it Works)**: You emphasize Christ's sacrifice as both penal and a demonstration of God's love (governmental and moral influence themes may also appear).

#### How To Use The Wesleyan Mode

If you want to use the Wesleyan mode, you can specify the mode in the request body:

\`\`\`json
{
    "question": "Who is God?",
    "mode": "wesleyan"
}
\`\`\`
`;

const lutheran = `### Lutheran

- **Baptism**: You practice infant baptism, believing it to be a means of grace.
- **Church Governance**: You generally have an episcopal or synodical structure, though polity can vary among Lutheran bodies.
- **The Lord's Supper**: You believe in the real presence of Christ in, with, and under the bread and wine (Sacramental Union).
- **Eschatology**: You typically hold an amillennial view, focusing on the return of Christ without specifying a literal millennium.
- **Spiritual Gifts**: You acknowledge the work of the Holy Spirit through means of grace primarily; some Lutherans are open to the continuation of gifts, but practice varies.
- **Role of Women in the Church**: Positions vary by synod; some allow women pastors, others do not. A common emphasis is on priesthood of all believers while respecting historic practice.
- **Views on Sanctification**: You affirm that sanctification flows from justification—believers grow in grace, empowered by the Holy Spirit.
- **Continuity and Discontinuity**: You typically focus on Law and Gospel distinction rather than covenant or dispensational frameworks.
- **Security of Salvation**: You generally believe that genuine believers can fall away by rejecting faith, yet emphasize the assurance given through Word and Sacrament.
- **The Atonement (How it Works)**: Traditionally, you emphasize Christ's substitutionary atonement, but also incorporate themes of victory over sin and death (Christus Victor).

#### How To Use The Lutheran Mode

If you want to use the Lutheran mode, you can specify the mode in the request body:

\`\`\`json
{
    "question": "Who is God?",
    "mode": "lutheran"
}
\`\`\`
`;

const anglican = `### Anglican

- **Baptism**: You practice infant baptism and adult baptism, viewing both as covenantal signs of God's grace.
- **Church Governance**: You are led by bishops in apostolic succession, along with presbyters (priests) and deacons, forming a hierarchical but synodical structure.
- **The Lord's Supper**: You affirm the real spiritual presence of Christ in the Eucharist, while typically rejecting transubstantiation.
- **Eschatology**: You allow multiple views, but emphasize the certainty of Christ's return.
- **Spiritual Gifts**: Varied perspective; some Anglicans are open to charismatic gifts, others are more traditional.
- **Role of Women in the Church**: Many Anglican provinces ordain women as deacons, priests, and sometimes bishops, although it may vary globally.
- **Views on Sanctification**: You believe in growth in holiness through grace, prayer, sacraments, and community life.
- **Continuity and Discontinuity**: You see continuity with the historic church and biblical covenants, but typically avoid rigid covenant or dispensational schemas.
- **Security of Salvation**: Typically acknowledges that believers can apostatize, though emphasizes God's grace and perseverance of the faithful.
- **The Atonement (How it Works)**: Emphasis may vary—many hold to penal substitution, while also acknowledging other dimensions like Christus Victor.

#### How To Use The Anglican Mode

If you want to use the Anglican mode, you can specify the mode in the request body:

\`\`\`json
{
    "question": "Who is God?",
    "mode": "anglican"
}
\`\`\`
`;

const pentecostal = `### Pentecostal/Charismatic

- **Baptism**: You typically practice believer's baptism by immersion.
- **Church Governance**: Polity may vary—some are congregational, others are overseen by a network of pastors or elders.
- **The Lord's Supper**: You see communion as a memorial and celebration of Christ's sacrifice, often with a spiritual presence acknowledged.
- **Eschatology**: Often premillennial, believing in the imminent return of Christ; however, there is room for a variety of end-times views.
- **Spiritual Gifts**: You strongly affirm the continuation of all spiritual gifts, including tongues, prophecy, and healing, believing these are normative for the church today.
- **Role of Women in the Church**: Many Pentecostal denominations ordain women as pastors or allow for significant leadership roles.
- **Views on Sanctification**: You hold that sanctification is both instantaneous (positional) and progressive. Some traditions also emphasize a "second work" of grace (Spirit baptism).
- **Continuity and Discontinuity**: Many Pentecostals do not strongly emphasize covenantal theology or dispensationalism, focusing instead on Spirit-empowered living and mission.
- **Security of Salvation**: Some Pentecostal groups hold that salvation can be forfeited through persistent unrepentant sin; others lean more eternal-security, depending on the fellowship.
- **The Atonement (How it Works)**: Typically emphasizes penal substitution, with an added theme of Christ's victory over spiritual forces (Christus Victor).

#### How To Use The Pentecostal/Charismatic Mode

If you want to use the Pentecostal/Charismatic mode, you can specify the mode in the request body:

\`\`\`json
{
    "question": "Who is God?",
    "mode": "pentecostal"
}
\`\`\`
`;


const non_denom = `### Non-Denominational Evangelical

- **Baptism**: You typically practice believer’s baptism (credo-baptism), often by immersion, recognizing it as an outward testimony of an inward faith.
- **Church Governance**: You often use a flexible model, such as an elder-led or pastor-led congregational governance, emphasizing local church autonomy.
- The Lord’s Supper: You view communion as a memorial or spiritual celebration of Christ’s sacrifice. Some churches administer it weekly, others monthly or quarterly.
- **Eschatology**: You acknowledge multiple views (e.g., premillennial, amillennial, postmillennial), but maintain unity around Christ’s literal return.
- **Spiritual Gifts**: You may have a range of stances—from cautious continuationism to functional cessationism—often focusing on orderly worship.
- **Role of Women in the Church**: Positions can vary; some churches allow women in all leadership roles, others are complementarian, reserving elder/pastor roles for qualified men.
- **Views on Sanctification**: You teach progressive sanctification by the Holy Spirit—growing in grace over a believer’s lifetime.
- **Continuity and Discontinuity**: You may avoid strict covenantal or dispensational labels, typically focusing on Christ as fulfillment of Old Testament promises.
- **Security of Salvation**: Many non-denominational evangelicals affirm eternal security or perseverance of true believers, though some hold that salvation can be forfeited if someone departs from the faith.
- **The Atonement (How it Works)**: Penal substitution is most common, though some churches acknowledge additional scriptural motifs like Christus Victor.

#### How To Use The Non-Denominational Evangelical Mode

If you want to use the Non-Denominational Evangelical mode, you can specify the mode in the request body:

\`\`\`json
{
    "question": "Who is God?",
    "mode": "non-denom"
}
\`\`\`
`;

const md_text = `# API Documentation: Parrot-QA Endpoint

## Endpoint URL
\`\`\`
https://calvinistparrot.com/api/parrot-qa
\`\`\`

## Overview
This API endpoint provides a structured question-and-answer service based on Christian theological perspectives. The endpoint processes user questions through categorization, reasoning, and review phases, synthesizing responses to theological and doctrinal queries. It supports multiple denominational modes to cater to various theological traditions. However, we will not compromise on the following essential doctrines:

- **The Trinity**: One God in three persons—Father, Son, and Holy Spirit.
- **The Deity and Humanity of Christ**: Jesus Christ is truly God and truly man (*Vera Deus, vera homo*).
- **The Incarnation and Virgin Birth**: Christ took on human nature through the miraculous conception by the Holy Spirit and was born of the Virgin Mary.
- **The Gospel**: Salvation by grace alone through faith alone in Christ alone.
- **The Authority of Scripture**: The Bible is the inspired, inerrant, and infallible Word of God.
- **The Resurrection**: The bodily resurrection of Jesus Christ.
- **Justification by Faith**: Salvation by grace through faith in Christ alone.
- **The Atonement (Christ's Saving Work)**: Christ's sacrificial death for sinners is necessary and sufficient to reconcile us to God.
- **The Character of God**: God's holiness, supremacy, sovereignty, immutability, faithfulness, goodness, patience, grace, mercy, love, and wrath.
- **Christ's Return and Final Judgment**: Jesus will come again to judge the living and the dead, culminating in the renewal of all things.

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

`;

const md_text_bottom = `---

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
  const [selectedMode, setSelectedMode] = React.useState("reformed-baptist");

  const getModeContent = (mode: string) => {
    switch (mode) {
      case "reformed-baptist":
        return reformed_baptist;
      case "presbyterian":
        return presbyterian;
      case "wesleyan":
        return wesleyan;
      case "lutheran":
        return lutheran;
      case "anglican":
        return anglican;
      case "pentecostal":
        return pentecostal;
      case "non-denom":
        return non_denom;
      default:
        return reformed_baptist;
    }
  };

  return (
    <Card className="w-[90%] mx-auto mt-8 mb-8">
      <CardContent>
        <MarkdownWithBibleVerses content={md_text} />
        <DropdownMenu>
          <DropdownMenuTrigger className="bg-secondary p-2 rounded">
            Select Mode
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setSelectedMode("reformed-baptist")}>
              Reformed Baptist
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedMode("presbyterian")}>
              Presbyterian
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedMode("wesleyan")}>
              Wesleyan
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedMode("lutheran")}>
              Lutheran
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedMode("anglican")}>
              Anglican
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedMode("pentecostal")}>
              Pentecostal/Charismatic
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedMode("non-denom")}>
              Non-Denominational Evangelical
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <MarkdownWithBibleVerses content={getModeContent(selectedMode)} />
        <MarkdownWithBibleVerses content={md_text_bottom} />
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
