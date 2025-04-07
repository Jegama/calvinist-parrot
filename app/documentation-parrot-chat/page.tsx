// app/documentation-parrot-chat/page.tsx

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
import * as denominations from "@/lib/denominations";

const md_text = `# API Documentation: Parrot Chat Endpoint

## Endpoint URL
\`\`\`
https://calvinistparrot.com/api/parrot-chat
\`\`\`

## Overview
The Parrot Chat endpoint provides real-time conversational interactions by streaming responses. It handles creating chat sessions, processing user messages, maintaining context, and integrating multiple theological agents including a final review stage ("Calvin's Review").

As with the [Parrot QA API](/documentation-parrot-qa), the Parrot Chat endpoint supports multiple denominational modes to cater to various theological traditions. However, we will not compromise on the following essential doctrines:

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

### QA Endpoint

For simplicity, I created this other endpoint that focuses on quick QA. Please check the [Parrot QA API documentation](/documentation-parrot-qa) for more information.

---

## How It Works

1. **Chat Session Initialization**  
  There are two ways to start a new chat:
  - **From Parrot QA**: Initialize with both question and answer
  - **From Chat Interface**: Initialize with just a question

2. **Chat Continuation**  
  - Uses stored chat history to maintain context
  - Processes messages through multiple agents and tools
  - Streams real-time responses with progress updates

3. **Denomination Handling**  
  - Each denomination maps to a specific system prompt
  - Affects how the AI interprets and responds to questions
  - Maintains core doctrinal consistency while respecting denominational distinctives

## API Reference

### Request Structure

Send a JSON payload with these possible fields:

- *userId* (string): Unique identifier for the user.
- *chatId* (string, optional): Identifier for an existing chat session.
- *message* (string): The user's chat message.
- *initialQuestion* (string, optional): For starting a new chat session.
- *initialAnswer* (string, optional): Initial answer for a new chat session.
- *denomination* (string, optional): The theological perspective. Possible values:
  - *reformed-baptist* (Reformed Baptist perspective - default)
  - *presbyterian* (Presbyterian perspective)
  - *wesleyan* (Wesleyan perspective)
  - *lutheran* (Lutheran perspective)
  - *anglican* (Anglican perspective)
  - *pentecostal* (Pentecostal/Charismatic perspective)
  - *non-denom* (Non-Denominational Evangelical perspective)
- *isAutoTrigger* (boolean, optional): Indicates if the message is auto-triggered (for conversation continuity).


### Response Stream Format

The API streams different event types as JSON objects:

1. **Progress Updates** - Status messages during processing
  \`\`\`json
  {"type": "progress", "title": "Looking for articles", "content": "Searching for: predestination"}
  \`\`\`

2. **Parrot Messages** - Main response content (streamed in chunks)
  \`\`\`json
  {"type": "parrot", "content": "The doctrine of predestination..."}
  \`\`\`

3. **Calvin's Review** - Theological review feedback
  \`\`\`json
  {"type": "calvin", "content": "This explanation aligns with Reformed theology..."}
  \`\`\`

4. **Reference Materials** - Related articles and resources
  \`\`\`json
  {"type": "gotQuestions", "content": "* [What is predestination?](https://www.gotquestions.org/predestination.html)"}
  \`\`\`

5. **Stream Completion**
  \`\`\`json
  {"type": "done"}
  \`\`\`

### Usage Patterns

#### 1. Initialize from Parrot QA
\`\`\`json
POST /api/parrot-chat
{
  "userId": "user123",
  "initialQuestion": "What is predestination?",
  "initialAnswer": "Predestination refers to...",
  "denomination": "reformed-baptist"
}
\`\`\`

#### 2. Initialize from Chat Interface
\`\`\`json
POST /api/parrot-chat
{
  "userId": "user123",
  "initialQuestion": "What is predestination?"
}
\`\`\`

Response:
\`\`\`json
{
  "chatId": "chat123"
}
\`\`\`

> **Note**: This endpoint only returns the chatId. The client should navigate to a new URL with this chatId (e.g., \`/chat123\`). When the chat page loads, it will automatically trigger the streaming process using the \`isAutoTrigger\` flag to process the initial question.

#### Complete Flow Example

1. **Start a new chat and get the chatId**:
  \`\`\`typescript
  // In /page.tsx
  const handleStartNewChat = async () => {
    const response = await fetch('/api/parrot-chat', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ 
      userId: "user123", 
      initialQuestion: "What is predestination?" 
     }),
    });
    const { chatId } = await response.json();
    router.push(\`/\${chatId}\`);  // Navigate to chat page
  };
  \`\`\`

2. **Chat page loads and auto-triggers the initial question**:
  \`\`\`typescript
  // In /[chatId]/page.tsx
  useEffect(() => {
    // When we detect only a user message with no response yet
    if (messages.length === 1 && messages[0].sender === "user" && !autoSentRef.current) {
     autoSentRef.current = true;
     // Auto-trigger the API call with the isAutoTrigger flag
     handleSendMessage({ 
      message: messages[0].content, 
      isAutoTrigger: true 
     });
    }
  }, [messages, handleSendMessage]);

  // Actual API call with isAutoTrigger flag
  const handleSendMessage = async ({ message, isAutoTrigger }) => {
    const response = await fetch("/api/parrot-chat", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({
      chatId: "chat123",  // From URL params
      message: "What is predestination?",  // Initial question
      isAutoTrigger: true  // This tells the API not to store the message again
     }),
    });
    
    // Handle streaming response...
  };
  \`\`\`

3. **API processes the request differently with isAutoTrigger**:
  - When \`isAutoTrigger: true\`, the API doesn't save the message again (it's already stored)
  - The API processes the message and streams the response
  - The client receives and displays the streaming response

#### 3. Continue Conversation
\`\`\`json
POST /api/parrot-chat
{
  "userId": "user123",
  "chatId": "chat123",
  "message": "How does it relate to free will?"
}
\`\`\`

#### 4. Fetch Chat History
\`\`\`
GET /api/parrot-chat?chatId=chat123
\`\`\`

Response:
\`\`\`json
{
  "chat": {
   "id": "cm7p6rik1001emqp0slgxgu1j",
   "userId": "6754db6b00119ba9e0da",
   "conversationName": "Understanding Predestination",
   "denomination": "reformed-baptist",
   "createdAt": "2025-02-28T19:48:22.321Z",
   "modifiedAt": "2025-02-28T19:48:45.855Z"
  },
  "messages": [
   {
    "id": "cm7p6rimi001gmqp0liuisq27",
    "chatId": "cm7p6rik1001emqp0slgxgu1j",
    "sender": "user",
    "content": "What is predestination?",
    "timestamp": "2025-02-28T19:48:22.410Z"
   },
   {
    "id": "cm7p6rqc0001imqp0h9gywt2x",
    "chatId": "cm7p6rik1001emqp0slgxgu1j",
    "sender": "gotQuestions",
    "content": "* [Providence and Predestination - Monergism](https://www.monergism.com/reformation-theology/blog/providence-and-predestination)\\n* [What is predestination? - GotQuestions.org](https://www.gotquestions.org/predestination.html)\\n* [Predestination and the Work of Jesus Considered | Monergism](https://www.monergism.com/predestination-and-work-jesus-considered)\\n* [What is Predestination? - Monergism](https://www.monergism.com/what-predestination)\\n* [What does the Bible say about predestination vs. free will?](https://www.gotquestions.org/predestination-vs-free-will.html)",
    "timestamp": "2025-02-28T19:48:32.401Z"
   },
   {
    "id": "cm7p6rxq0001kmqp0kdxt3qvt",
    "chatId": "cm7p6rik1001emqp0slgxgu1j",
    "sender": "calvin",
    "content": "Your summary of predestination captures...",
    "timestamp": "2025-02-28T19:48:41.938Z"
   },
   {
    "id": "cm7p6rzqs001mmqp0jrawhfi1",
    "chatId": "cm7p6rik1001emqp0slgxgu1j",
    "sender": "parrot",
    "content": "Predestination is...",
    "timestamp": "2025-02-28T19:48:44.596Z"
   }
  ]
}
\`\`\`

## Implementation Guide

### Front-end Integration Example
\`\`\`typescript
const handleStream = async (chatId: string, message: string) => {
  const response = await fetch('/api/parrot-chat', {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ chatId, message })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
   const { value, done } = await reader.read();
   if (done) break;
   
   const lines = decoder.decode(value).split('\\n');
   for (const line of lines) {
    if (!line.trim()) continue;
    
    const event = JSON.parse(line);
    switch (event.type) {
      case 'progress':
       updateProgress(event.title, event.content);
       break;
      case 'parrot':
       appendParrotMessage(event.content);
       break;
      case 'calvin':
       showCalvinReview(event.content);
       break;
      case 'gotQuestions':
       showReferences(event.content);
       break;
      case 'done':
       finishStream();
       break;
    }
   }
  }
};
\`\`\`

For complete implementation examples, see:
- [Main Chat Page](https://github.com/Jegama/calvinist-parrot/blob/master/app/page.tsx)
- [Chat Session Page](https://github.com/Jegama/calvinist-parrot/blob/master/app/[chatId]/page.tsx)

---

## Denominations

The endpoint supports the following denomination:

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

## Contact
For further questions or support, [please reach out](mailto:jesus@jgmancilla.com)!

This is open source, so if you're interested in helping me development this, check out the [GitHub repo](https://github.com/Jegama/calvinist-parrot).

# Freely you have received; freely give.

- Matthew 10:8

# Soli Deo Gloria

- Romans 11:36`;

export default function DocumentationParrotChatPage() {
  const [selectedMode, setSelectedMode] = React.useState("reformed-baptist");
  
    const getModeContent = (mode: string) => {
      switch (mode) {
        case "reformed-baptist":
          return denominations.reformed_baptist;
        case "presbyterian":
          return denominations.presbyterian;
        case "wesleyan":
          return denominations.wesleyan;
        case "lutheran":
          return denominations.lutheran;
        case "anglican":
          return denominations.anglican;
        case "pentecostal":
          return denominations.pentecostal;
        case "non-denom":
          return denominations.non_denom;
        default:
          return denominations.reformed_baptist;
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
