// app/journal/components/ReflectionCard.tsx
// Displays the pastoral reflection (Call 1) output with progressive loading support

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Heart, ArrowDownUp, Lightbulb, Loader2 } from "lucide-react";
import type { Call1Output } from "@/types/journal";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";

interface ReflectionCardProps {
  call1: Partial<Call1Output> | null;
  isStreaming?: boolean;
  streamMessage?: string;
}

function isUrgentSafetyFlag(flag: string): boolean {
  return (
    flag === "URGENT_SELF_HARM" ||
    flag === "URGENT_CHILD_SAFETY" ||
    flag === "URGENT_VIOLENCE_OR_ABUSE" ||
    flag === "URGENT_MEDICAL_EMERGENCY" ||
    flag === "URGENT_OTHER_IMMEDIATE_DANGER"
  );
}

function formatUrgentSafetyFlag(flag: string): string {
  switch (flag) {
    case "URGENT_SELF_HARM":
      return "Possible self-harm risk noted. If you are in immediate danger, call emergency services now.";
    case "URGENT_CHILD_SAFETY":
      return "Possible immediate child safety risk noted. If anyone is in immediate danger, call emergency services now.";
    case "URGENT_VIOLENCE_OR_ABUSE":
      return "Possible immediate violence or abuse risk noted. If anyone is in immediate danger, call emergency services now.";
    case "URGENT_MEDICAL_EMERGENCY":
      return "Possible medical emergency noted. If this is urgent, contact local emergency services now.";
    case "URGENT_OTHER_IMMEDIATE_DANGER":
      return "Possible immediate danger noted. If anyone is in immediate danger, call emergency services now.";
    default:
      return flag;
  }
}

// Section skeleton for loading state
function SectionSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" style={{ width: i === lines - 1 ? "75%" : "100%" }} />
      ))}
    </div>
  );
}

export function ReflectionCard({ call1, isStreaming = false, streamMessage }: ReflectionCardProps) {
  const urgentSafetyFlags = (call1?.safetyFlags || []).filter(isUrgentSafetyFlag);
  const legacySafetyFlags = (call1?.safetyFlags || []).filter((f) => !isUrgentSafetyFlag(f));

  // Check which sections have arrived
  const hasTitle = !!call1?.title;
  const hasSummary = !!call1?.oneSentenceSummary;
  const hasSituation = !!call1?.situationSummary;
  const hasHeart = call1?.heartReflection && call1.heartReflection.length > 0;
  const hasPutOffPutOn = call1?.putOffPutOn && call1.putOffPutOn.length > 0;
  const hasScripture = call1?.scripture && call1.scripture.length > 0;
  const hasNextSteps = call1?.practicalNextSteps && call1.practicalNextSteps.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        {hasTitle ? (
          <CardTitle className="font-serif text-xl flex items-center gap-2">
            {isStreaming && <Loader2 className="h-5 w-5 animate-spin text-accent" />}
            <BookOpen className="h-5 w-5 text-accent" />
            {call1!.title}
          </CardTitle>
        ) : (
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <CardTitle className="font-serif text-xl">Preparing Reflection...</CardTitle>
          </div>
        )}
        {hasSummary ? (
          <p className="text-muted-foreground text-sm italic">
            {call1!.oneSentenceSummary}
          </p>
        ) : (
          <Skeleton className="h-4 w-3/4 mt-1" />
        )}
        {isStreaming && streamMessage && (
          <p className="text-xs text-muted-foreground mt-1">{streamMessage}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Situation Summary */}
        <div>
          {hasSituation ? (
            <p className="text-sm leading-relaxed">{call1!.situationSummary}</p>
          ) : (
            <SectionSkeleton lines={3} />
          )}
        </div>

        {/* Heart Reflection - show skeleton if streaming and not yet arrived */}
        {hasHeart ? (
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
              <Heart className="h-4 w-4 text-accent" />
              Heart Reflection
            </h4>
            <ul className="space-y-1">
              {call1!.heartReflection!.map((reflection, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-accent mt-1">•</span>
                  <MarkdownWithBibleVerses content={reflection} />
                </li>
              ))}
            </ul>
          </div>
        ) : isStreaming && hasSituation ? (
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
              <Heart className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Heart Reflection</span>
            </h4>
            <SectionSkeleton lines={3} />
          </div>
        ) : null}

        {/* Put Off / Put On Pairs */}
        {hasPutOffPutOn ? (
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <ArrowDownUp className="h-4 w-4 text-primary" />
              Put Off / Put On
            </h4>
            <div className="space-y-3">
              {call1!.putOffPutOn!.map((pair, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-muted/30 rounded-lg p-3">
                    <span className="text-xs font-medium text-destructive/70 uppercase tracking-wide">Put Off</span>
                    <div className="text-sm mt-1">
                      <MarkdownWithBibleVerses content={pair.putOff} />
                    </div>
                  </div>
                  <div className="bg-accent/5 rounded-lg p-3">
                    <span className="text-xs font-medium text-accent uppercase tracking-wide">Put On</span>
                    <div className="text-sm mt-1">
                      <MarkdownWithBibleVerses content={pair.putOn} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : isStreaming && hasSituation ? (
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Put Off / Put On</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          </div>
        ) : null}

        {/* Scripture References */}
        {hasScripture ? (
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-primary" />
              Scripture
            </h4>
            <div className="space-y-3">
              {call1!.scripture!.map((s, i) => (
                <div key={i} className="border-l-2 border-primary/30 pl-3">
                  <MarkdownWithBibleVerses content={`${s.reference}`} />
                  <p className="text-sm text-muted-foreground mt-1">
                    {s.whyItApplies}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : isStreaming && hasSituation ? (
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Scripture</span>
            </h4>
            <div className="space-y-3">
              <div className="border-l-2 border-muted pl-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-full mt-2" />
              </div>
            </div>
          </div>
        ) : null}

        {/* Practical Next Steps */}
        {hasNextSteps ? (
          <div className="bg-primary/5 rounded-lg p-4">
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              Next Steps
            </h4>
            <ol className="space-y-2">
              {call1!.practicalNextSteps!.map((step, i) => (
                <li key={i} className="text-sm flex items-start gap-3">
                  <Badge variant="outline" className="shrink-0 h-5 w-5 flex items-center justify-center p-0 text-xs">
                    {i + 1}
                  </Badge>
                  <span><MarkdownWithBibleVerses content={step} /></span>
                </li>
              ))}
            </ol>
          </div>
        ) : isStreaming && hasSituation ? (
          <div className="bg-muted/20 rounded-lg p-4">
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Next Steps</span>
            </h4>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        ) : null}

        {/* Safety Flags (urgent-only red notice) */}
        {urgentSafetyFlags.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-destructive mb-2">Important Notice</h4>
            <ul className="space-y-1">
              {urgentSafetyFlags.map((flag, i) => (
                <li key={i} className="text-sm text-destructive/80">
                  {formatUrgentSafetyFlag(flag)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Legacy Safety Flags (non-urgent notes) */}
        {urgentSafetyFlags.length === 0 && legacySafetyFlags.length > 0 && (
          <div className="bg-muted/40 border border-muted rounded-lg p-4">
            <h4 className="text-sm font-semibold text-foreground mb-2">Note</h4>
            <ul className="space-y-1">
              {legacySafetyFlags.map((flag, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  {flag}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
