## **Implementation Plan: Tool Progress Streaming**

### **Status: ✅ COMPLETED**

All tasks have been successfully implemented. The tool progress feature is now live with ephemeral progress indicators and persistent tool summaries.

1. **Reasoning Models Stream Thinking**:
   ```typescript
   const stream = model.stream("Why do parrots have colorful feathers?");
   for await (const chunk of stream) {
       const reasoningSteps = chunk.contentBlocks.filter(b => b.type === "reasoning");
       console.log(reasoningSteps.length > 0 ? reasoningSteps : chunk.text);
   }
   ```

2. **Custom Tool Progress via `config.writer`**:
   ```typescript
   const myTool = tool(
     async (input, config?: LangGraphRunnableConfig) => {
       config?.writer?.({ toolName: "myTool", message: "Starting..." });
       // work...
       return result;
     }
   );
   ```

3. **Multi-Mode Streaming**:
   ```typescript
   streamMode: ["updates", "messages", "custom"]
   ```

---

### **Architecture (Option A - Your Preference):**

**Three Event Types:**

| Event Type | Purpose | Persistence | Display |
|------------|---------|-------------|---------|
| `tool_progress` | Real-time tool updates | ❌ Ephemeral | Bottom progress indicator |
| `reasoning` | GPT-5.1 thinking tokens | ✅ **DB: `chatMessage.reasoning`** | Collapsible accordion like Calvin feedback |
| `tool_summary` | Tool completion summaries | ✅ **DB: new `chatMessage` row** | Collapsible accordion like gotQuestions |

**Flow:**
1. **Reasoning starts** → Stream `reasoning` events → Accumulate in state → Save to DB when complete → Render as collapsible "🧠 Parrot's Thinking Process"
2. **Tool executes** → Stream `tool_progress` events (ephemeral) → On completion emit `tool_summary` → Save summary to DB → Render as collapsible "🔍 Research Notes"
3. **LLM responds** → Stream `parrot` tokens as normal

---

### **Database Schema Change:**

```prisma
model ChatMessage {
  // ... existing fields ...
  reasoning String? @db.Text // NEW: Store GPT-5.1 thinking tokens
}
```

---

### **Updated Event Types:**

```typescript
type DataEvent =
  | { type: "info" | "done" }
  | { type: "error"; stage: string; message: string }
  | { type: "progress"; title: string; content: string } // Existing generic progress
  | { type: "tool_progress"; toolName: string; message: string } // NEW: Ephemeral tool updates
  | { type: "reasoning"; content: string } // NEW: Thinking tokens to persist
  | { type: "tool_summary"; toolName: string; content: string } // NEW: Tool completion to persist
  | { type: "parrot"; content: string }
  | { type: "calvin"; content: string }
  | { type: "gotQuestions"; content: string };
```

---

### **Client UI Updates:**

**Progress Indicator (Bottom):**
```tsx
{progress?.type === "tool_progress" && (
  <div className="flex items-center gap-3">
    {toolIcons[progress.toolName]} {/* 🔍, 📖, 🧠 */}
    <Loader2 className="animate-spin" />
    <p>{progress.message}</p>
  </div>
)}
```

**Reasoning Display (In Chat):**
```tsx
case "reasoning":
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value={`reasoning-${i}`}>
        <AccordionTrigger>🧠 Parrot's Thinking Process</AccordionTrigger>
        <AccordionContent>
          <MarkdownWithBibleVerses content={msg.content} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
```

**Tool Summary Display (In Chat):**
```tsx
case "tool_summary":
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value={`tool-${i}`}>
        <AccordionTrigger>
          {toolIcons[msg.toolName]} {toolTitles[msg.toolName]}
        </AccordionTrigger>
        <AccordionContent>
          <MarkdownWithBibleVerses content={msg.content} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
```

---

### **Reasoning Handler Example:**

```typescript
if (event === "on_chat_model_stream" && tags?.includes("seq:step:1")) {
  const reasoningBlocks = data.chunk?.contentBlocks?.filter(
    (b: { type: string }) => b.type === "reasoning"
  );
  
  if (reasoningBlocks?.length > 0) {
    for (const block of reasoningBlocks) {
      reasoningAccumulator += block.text || "";
      sendProgress({
        type: "reasoning",
        content: block.text
      }, controller);
    }
  }
}
```

---

### **Tool Progress Example:**

```typescript
export const supplementalArticleSearchTool = tool(
  async (query: { query: string }, config?: LangGraphRunnableConfig) => {
    config?.writer?.({
      toolName: "supplementalArticleSearch",
      message: "Searching monergism.com and gotquestions.org..."
    });
    
    const response = await client.search(query.query, { /*...*/ });
    
    config?.writer?.({
      toolName: "supplementalArticleSearch",
      message: `Found ${response.results.length} articles`,
      summary: formatBibliography(response) // This becomes tool_summary
    });
    
    return JSON.stringify(response);
  },
  { /* schema */ }
);
```