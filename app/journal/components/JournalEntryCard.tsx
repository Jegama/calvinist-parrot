// app/journal/components/JournalEntryCard.tsx
// Card component for displaying a journal entry in the list

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import type { Call1Output, Call2Output } from "@/types/journal";

interface JournalEntry {
  id: string;
  entryDate: string;
  entryText: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  aiOutput: {
    call1: Call1Output | null;
    call2: Call2Output | null;
  } | null;
}

interface JournalEntryCardProps {
  entry: JournalEntry;
  isActive: boolean;
  onClick: () => void;
  onReprocess?: () => void;
  isReprocessing?: boolean;
}

export function JournalEntryCard({ entry, isActive, onClick, onReprocess, isReprocessing }: JournalEntryCardProps) {
  const date = new Date(entry.entryDate);
  const title = entry.aiOutput?.call1?.title || "Journal Entry";
  const preview = entry.entryText.length > 100
    ? entry.entryText.substring(0, 100) + "..."
    : entry.entryText;
  
  // Check if AI processing failed (entry exists but no aiOutput)
  const processingFailed = !entry.aiOutput;

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${isActive
          ? "ring-2 ring-primary shadow-md"
          : "hover:ring-1 hover:ring-border"
        }`}
      onClick={onClick}
    >
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">
              {date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
              })}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {entry.aiOutput?.call1 && (
              <Sparkles className="h-3 w-3 text-accent shrink-0" />
            )}
            {processingFailed && onReprocess && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onReprocess();
                }}
                disabled={isReprocessing}
              >
                {isReprocessing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3" />
                    Retry
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        <h3 className="font-medium text-sm mb-1 line-clamp-1">
          {title}
        </h3>

        <p className="text-xs text-muted-foreground line-clamp-2">
          {preview}
        </p>
        
        {processingFailed && (
          <p className="text-xs status-text--warning mt-1 italic">
            AI reflection unavailable
          </p>
        )}

        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {entry.tags.slice(0, 3).map(tag => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[10px] px-1.5 py-0"
              >
                {formatTagLabel(tag)}
              </Badge>
            ))}
            {entry.tags.length > 3 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                +{entry.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatTagLabel(tag: string): string {
  const parts = tag.split(":");
  return parts.length > 1 ? parts[1] : tag;
}
