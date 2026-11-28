"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopySnippet({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied.");
    } catch {
      setStatus("Select the text and copy it manually.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted px-4 py-3">
        <code className="min-w-0 select-all break-all text-sm">{text}</code>
        <Button onClick={copy} variant="outline" size="sm" aria-label={label}>
          <Copy aria-hidden="true" /> Copy
        </Button>
      </div>
      <p role="status" className="text-sm text-muted-foreground">{status}</p>
    </div>
  );
}
