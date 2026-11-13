"use client";

import { useState, type ComponentProps } from "react";

import { ChatComposer } from "@/components/chat/chat-composer";

type ConversationComposerProps = Omit<
  ComponentProps<typeof ChatComposer>,
  "value" | "onChange" | "onSubmit"
> & {
  onSend: (message: string) => void;
};

// Draft changes stay here so typing does not render the conversation transcript.
export function ConversationComposer({
  onSend,
  ...props
}: ConversationComposerProps) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const message = draft.trim();
    if (!message || props.isLoading || props.isStreaming || props.isSubmitting) {
      return;
    }
    onSend(message);
    setDraft("");
  };

  return (
    <ChatComposer {...props} value={draft} onChange={setDraft} onSubmit={submit} />
  );
}
