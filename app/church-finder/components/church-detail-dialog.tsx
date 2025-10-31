"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, CheckCircle2, AlertTriangle, ChevronDown, Info } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import type { ChurchDetail, CoreDoctrineKey } from "@/types/church";
import coreDoctrinesJson from "@/lib/references/core_doctrines.json";
import canNotEndorseJson from "@/lib/references/can_not_endorse_churches.json";
import denominationAliasesJson from "@/lib/references/denomination_aliases.json";
import badgesJson from "@/lib/references/badges.json";
import { cn } from "@/lib/utils";
import { createChurch } from "@/app/church-finder/api";

function normalizeDenomination(label: string): string {
  const trimmed = label.trim();
  return trimmed in denominationAliasesJson
    ? denominationAliasesJson[trimmed as keyof typeof denominationAliasesJson]
    : trimmed;
}

const CORE_LABELS: Record<CoreDoctrineKey, string> = {
  trinity: "Trinity",
  gospel: "The Gospel",
  justification_by_faith: "Justification by Faith",
  christ_deity_humanity: "Deity & Humanity of Christ",
  scripture_authority: "Authority of Scripture",
  incarnation_virgin_birth: "Incarnation & Virgin Birth",
  atonement_necessary_sufficient: "Atonement",
  resurrection_of_jesus: "Resurrection of Jesus",
  return_and_judgment: "Return & Judgment",
  character_of_god: "Character of God",
};

const STATUS_CONFIG = {
  confessional: {
    icon: CheckCircle2,
    bgColor: "status--confessional",
    borderColor: "",
    textColor: "status-text--confessional",
    iconColor: "status-text--confessional",
    title: "Confessional Reformed (Encouraged)",
    description:
      "This church publicly subscribes to a historic Reformed confession (e.g., Westminster Standards, 1689 London Baptist, Three Forms of Unity).",
  },
  recommended: {
    icon: CheckCircle2,
    bgColor: "status--recommended",
    borderColor: "",
    textColor: "status-text--recommended",
    iconColor: "status-text--recommended",
    title: "Recommended",
    description: "This church clearly affirms all essential Christian doctrines and generally holds to Reformed or compatible theology.",
  },
  biblically_sound_with_differences: {
    icon: Info,
    bgColor: "status--info",
    borderColor: "",
    textColor: "status-text--info",
    iconColor: "status-text--info",
    title: "Biblically Sound",
    description:
      "This church affirms all essential Christian doctrines but holds to secondary theological positions that differ from Reformed theology (e.g., charismatic, continuationist). While biblically orthodox, we note these differences for your discernment.",
  },
  limited_information: {
    icon: AlertTriangle,
    bgColor: "status--warning",
    borderColor: "",
    textColor: "status-text--warning",
    iconColor: "status-text--warning",
    title: "Limited Information",
    description:
      "The website does not clearly state several essential doctrines. We encourage you to reach out to the church directly for clarification before making a decision.",
  },
  not_endorsed: {
    icon: AlertCircle,
    bgColor: "status--danger",
    borderColor: "",
    textColor: "status-text--danger",
    iconColor: "status-text--danger",
    title: "Not Endorsed",
    description:
      "Based on what is published, this church denies essential Christian doctrine or holds positions on secondary matters that we cannot endorse based on Scripture.",
  },
} as const;

type ChurchDetailDialogProps = {
  church: ChurchDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChurchUpdated?: (church: ChurchDetail) => void;
};

export function ChurchDetailDialog({ church, open, onOpenChange, onChurchUpdated }: ChurchDetailDialogProps) {
  const { user } = useAuth();
  const evaluation = church?.evaluation;
  const status = evaluation?.status ?? null;
  const displayStatus: keyof typeof STATUS_CONFIG | null = church?.confessionAdopted
    ? "confessional"
    : (status as keyof typeof STATUS_CONFIG | null);
  const [coreDoctrinesOpen, setCoreDoctrinesOpen] = useState(false);
  const [otherDoctrinesOpen, setOtherDoctrinesOpen] = useState(false);

  const isAdmin = user?.$id === process.env.NEXT_PUBLIC_ADMIN_ID;

  const reEvaluateMutation = useMutation({
    mutationFn: async () => {
      if (!church?.website) throw new Error("No website available");
      const updatedChurch = await createChurch({
        website: church.website,
        forceReEvaluate: true,
        userId: user?.$id,
      });
      return updatedChurch;
    },
    onSuccess: (updatedChurch) => {
      if (onChurchUpdated) {
        onChurchUpdated(updatedChurch);
      }
    },
  });

  // Find false doctrines
  const falseDoctrine = evaluation?.coreDoctrines
    ? (Object.entries(evaluation.coreDoctrines)
      .filter(([, value]) => value === "false")
      .map(([key]) => key as CoreDoctrineKey))
    : [];

  // Find red flag badges (excluding false doctrine issues)
  const redFlagBadges = evaluation?.badges.filter(badge => {
    const badgeInfo = badgesJson[badge as keyof typeof badgesJson];
    return badgeInfo?.category === "red_flag";
  }) ?? [];

  // Generate dynamic Not Endorsed description based on evaluation reasons
  const getNotEndorsedDescription = () => {
    if (!evaluation) return STATUS_CONFIG.not_endorsed.description;

    // Match server-side evaluation logic for "critical red flags"
    const CRITICAL_RED_FLAGS = new Set([
      "⚠️ Prosperity Gospel",
      "⚠️ Hyper-Charismatic",
      "⚠️ Entertainment-Driven",
      "🏳️‍🌈 LGBTQ Affirming",
      "👩‍🏫 Ordained Women",
      "⚠️ Denies Inerrancy of Scripture",
      "⚠️ Non-Trinitarian",
      "⚠️ Works-Based Justification",
      "⚠️ Universalism",
      "⚠️ Open Theism",
      "⚠️ New Apostolic Reformation (NAR)",
      "⚠️ Progressive Christianity",
      "⚠️ Religious Pluralism",
    ]);

    const presentCritical = (evaluation.badges || []).filter((b) => CRITICAL_RED_FLAGS.has(b));

    if (falseDoctrine.length > 0 && presentCritical.length > 0) {
      const sample = presentCritical.slice(0, 2).join(", ");
      return `We cannot endorse this church because it denies essential Christian doctrine and also displays serious concerns (e.g., ${sample}). See details below.`;
    }
    if (falseDoctrine.length > 0) {
      return "We cannot endorse this church because it denies one or more essential Christian doctrines. See details below.";
    }
    if (presentCritical.length > 0) {
      const sample = presentCritical.slice(0, 2).join(", ");
      return `We cannot endorse this church due to serious concerns (e.g., ${sample}). See the positions below.`;
    }

    return STATUS_CONFIG.not_endorsed.description;
  };

  // Check if denomination is in the non-endorsement list
  const denominationLabel = church?.denomination?.label?.trim();
  const canonicalName = denominationLabel ? normalizeDenomination(denominationLabel) : null;
  const denominationNote = canonicalName && canonicalName in canNotEndorseJson
    ? canNotEndorseJson[canonicalName as keyof typeof canNotEndorseJson]
    : null;

  // Create a map of core doctrine keys to their notes
  const coreDoctrineNotes = new Map<string, { text: string; sourceUrl: string | null }>();
  if (evaluation?.raw?.church?.notes) {
    evaluation.raw.church.notes.forEach((note) => {
      const normalizedLabel = note.label.toLowerCase().replace(/\s+/g, "_");
      coreDoctrineNotes.set(normalizedLabel, {
        text: note.text,
        sourceUrl: note.source_url,
      });
    });
  }

  // Filter notes to exclude those already shown in core doctrines
  const remainingNotes = evaluation?.raw?.church?.notes?.filter((note) => {
    const normalizedLabel = note.label.toLowerCase().replace(/\s+/g, "_");
    return !Object.keys(evaluation.coreDoctrines).includes(normalizedLabel);
  }) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-x-hidden overflow-y-auto rounded-lg p-4 sm:max-w-2xl sm:p-6 lg:max-w-4xl">
        <TooltipProvider delayDuration={0}>
          {church ? (
            <div className="space-y-6 overflow-x-hidden">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <DialogHeader className="flex-1">
                  <DialogTitle className="text-xl font-semibold text-foreground sm:text-2xl">{church.name}</DialogTitle>
                  <DialogDescription className="text-sm">
                    {church.city && church.state ? `${church.city}, ${church.state}` : church.city ?? church.state ?? "Location unknown"}
                  </DialogDescription>
                </DialogHeader>
                {church.confessionAdopted && (
                  <div className="flex justify-center lg:justify-end">
                    <Image
                      src="/confessional_seal.png"
                      alt="Confessional Church Seal"
                      width={80}
                      height={80}
                      className="object-contain sm:h-[100px] sm:w-[100px]"
                    />
                  </div>
                )}
              </div>

              {/* Endorsement Status Alert */}
              {displayStatus && STATUS_CONFIG[displayStatus] && (
                <Alert className={cn(STATUS_CONFIG[displayStatus].bgColor, STATUS_CONFIG[displayStatus].borderColor, "shadow-sm")}>
                  {(() => {
                    const Icon = STATUS_CONFIG[displayStatus].icon;
                    return <Icon className={cn("h-4 w-4", STATUS_CONFIG[displayStatus].iconColor)} />;
                  })()}
                  <AlertTitle className={STATUS_CONFIG[displayStatus].textColor}>
                    {STATUS_CONFIG[displayStatus].title}
                  </AlertTitle>
                  <AlertDescription className={STATUS_CONFIG[displayStatus].textColor}>
                    {displayStatus === "not_endorsed" ? getNotEndorsedDescription() : STATUS_CONFIG[displayStatus].description}
                  </AlertDescription>
                </Alert>
              )}

              {/* False Doctrines Warning */}
              {falseDoctrine.length > 0 && (
                <div className="space-y-4 rounded-lg p-4 shadow-md status--danger">
                  <h3 className="text-lg font-semibold status-text--danger flex items-center gap-2">
                    ⚠️ Doctrinal Concerns
                  </h3>
                  <p className="text-sm font-medium status-text--danger">
                    This church explicitly denies the following essential Christian doctrine(s):
                  </p>
                  <div className="space-y-4">
                    {falseDoctrine.map((key) => (
                      <div key={key} className="rounded-md border border-destructive/30 bg-background p-3 shadow-sm">
                        <p className="mb-2 font-semibold text-destructive">
                          ❌ {CORE_LABELS[key]}
                        </p>
                        <div className="space-y-2 text-sm">
                          <p className="text-foreground">
                            <span className="font-medium">What we believe:</span>
                          </p>
                          <p className="italic text-foreground/80">
                            &ldquo;{coreDoctrinesJson[key]}&rdquo;
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Red Flag Badges Warning - Positions We Can't Endorse */}
              {redFlagBadges.length > 0 && (
                <div className="space-y-4 rounded-lg p-4 shadow-md status--danger">
                  <h3 className="text-lg font-semibold status-text--danger flex items-center gap-2">
                    ⚠️ Serious Concerns (Positions We Cannot Endorse)
                  </h3>
                  <p className="text-sm font-medium status-text--danger">
                    Based on the church’s published statements, we identified the following position(s) we cannot endorse:
                  </p>
                  <div className="space-y-3">
                    {redFlagBadges.map((badge) => {
                      const badgeInfo = badgesJson[badge as keyof typeof badgesJson];
                      return (
                        <div key={badge} className="rounded-md border border-destructive/30 bg-background p-3 shadow-sm">
                          <p className="mb-2 font-semibold text-destructive">
                            {badge}
                          </p>
                          <p className="text-sm text-foreground/80">
                            {badgeInfo?.description ?? "No description available"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Low Essentials Coverage Warning */}
              {evaluation && evaluation.coverageRatio < 0.5 && falseDoctrine.length === 0 && redFlagBadges.length === 0 && (
                <div className="space-y-4 rounded-lg p-4 shadow-md status--warning">
                  <h3 className="text-lg font-semibold status-text--warning flex items-center gap-2">
                    ⚠️ Limited Doctrinal Information
                  </h3>
                  <p className="text-sm font-medium status-text--warning">
                    The church's website does not clearly state several essential Christian doctrines.
                  </p>
                  <div className="rounded-md border border-destructive/30 bg-background p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold text-foreground">
                        Essentials clearly stated on website:
                      </p>
                      <p className="text-2xl font-bold status-text--warning">
                        {Math.round(evaluation.coverageRatio * 100)}%
                      </p>
                    </div>
                    <p className="text-sm text-foreground/80 mb-3">
                      Only {evaluation.coreOnSiteCount} out of {evaluation.coreTotalCount} essential doctrines are clearly affirmed on their website.
                    </p>
                    <div className="rounded bg-muted/50 p-3">
                      <p className="text-sm text-foreground/90">
                        <span className="font-medium">What this means:</span> This does not mean the church denies these doctrines—it may simply not be stated clearly online. We encourage you to reach out to the church directly for clarification before making a decision.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Denomination-Specific Note */}
              {denominationNote && (
                <Alert className="status--warning">
                  <AlertTriangle className="h-4 w-4 status-text--warning" />
                  <AlertTitle className="status-text--warning">
                    About {denominationLabel}
                  </AlertTitle>
                  <AlertDescription className="status-text--warning">
                    <p className="mb-2">{denominationNote.note}</p>
                    {denominationNote.denies && denominationNote.denies.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="font-medium">This denomination typically denies:</p>
                        <ul className="ml-4 list-disc space-y-1">
                          {denominationNote.denies.map((item, idx) => (
                            <li key={idx}>{item.doctrine}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* At a Glance - Badges */}
              {evaluation && evaluation.badges.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-lg font-semibold text-foreground">At a Glance</h3>
                  <div className="flex flex-wrap gap-2">
                    {evaluation.badges.map((badge) => {
                      const badgeInfo = badgesJson[badge as keyof typeof badgesJson];
                      const isRedFlag = badgeInfo?.category === "red_flag";
                      const badgeClasses = isRedFlag
                        ? "badge--red-flag px-3 py-1.5 text-sm font-medium"
                        : "badge--neutral px-3 py-1.5 text-sm font-medium";

                      return (
                        <Tooltip key={badge}>
                          <TooltipTrigger asChild>
                            <span className={badgeClasses}>
                              {badge}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-sm">
                            <p>{badgeInfo?.description ?? "No description available"}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Church Information - Contact, Addresses, Service Times */}
              <section className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Church Information</h3>

                <div className="grid gap-6 overflow-hidden rounded-lg border border-border bg-card shadow-sm p-4 lg:grid-cols-2">
                  <div className="min-w-0 space-y-3 text-sm">
                    <p className="flex flex-col gap-1 sm:flex-row sm:gap-2">
                      <span className="font-medium text-muted-foreground">Website:</span>{" "}
                      <a
                        href={church.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-words text-primary underline-offset-2 hover:underline"
                      >
                        {church.website}
                      </a>
                    </p>
                    <p className="break-words">
                      <span className="font-medium text-muted-foreground">Email:</span>{" "}
                      <span>{church.email ?? "Unavailable"}</span>
                    </p>
                    <p>
                      <span className="font-medium text-muted-foreground">Phone:</span>{" "}
                      {church.phone ?? "Unavailable"}
                    </p>
                  </div>
                  <div className="min-w-0 space-y-3 text-sm">
                    <p className="break-words">
                      <span className="font-medium text-muted-foreground">Denomination:</span>{" "}
                      {church.denomination.label ?? "Unknown"}
                    </p>
                    <p>
                      <span className="font-medium text-muted-foreground">Historic Reformed (Confessional):</span>{" "}
                      {church.confessionAdopted ? "Yes" : "No"}
                    </p>
                    <p>
                      <span className="font-medium text-muted-foreground">Essentials on website:</span>{" "}
                      {evaluation ? `${Math.round(evaluation.coverageRatio * 100)}%` : "Unknown"}
                    </p>
                  </div>
                </div>

                {/* Addresses */}
                {church.addresses.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-base font-semibold text-foreground">Addresses</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      {church.addresses.map((address) => (
                        <div key={address.id} className="rounded-md border border-border bg-card shadow-sm p-3 text-sm">
                          <p className="font-medium text-foreground">
                            {address.street1}
                            {address.street2 ? `, ${address.street2}` : ""}
                          </p>
                          <p className="text-muted-foreground">
                            {[address.city, address.state, address.postCode].filter(Boolean).join(", ") || "Unknown"}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {address.sourceUrl && (
                              <a
                                href={address.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary underline-offset-2 hover:underline"
                              >
                                Source
                              </a>
                            )}
                            {address.isPrimary && (
                              <span className="inline-block rounded-full bg-primary/20 border border-primary/40 px-2 py-0.5 text-xs text-primary dark:bg-primary/10 dark:border-primary/20">
                                Primary
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Service Times */}
                {church.serviceTimes.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-base font-semibold text-foreground">Service Times</h4>
                    <div className="flex flex-wrap gap-2 text-sm">
                      {church.serviceTimes.map((service) => (
                        <span key={service.id} className="rounded-md bg-muted/70 border border-border px-3 py-1.5 text-foreground/80">
                          {service.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {evaluation ? (
                <section className="space-y-4">
                  {/* Core Doctrines - Collapsible */}
                  <Collapsible open={coreDoctrinesOpen} onOpenChange={setCoreDoctrinesOpen}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 hover:bg-muted/20 shadow-sm">
                      <div className="text-left">
                        <h3 className="text-lg font-semibold text-foreground">Core Doctrines</h3>
                        <p className="text-sm text-muted-foreground">
                          Essential Christian beliefs from church statements
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-5 w-5 text-muted-foreground transition-transform",
                          coreDoctrinesOpen && "rotate-180"
                        )}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-4 space-y-3">
                      {Object.entries(evaluation.coreDoctrines).map(([key, value]) => {
                        const doctrineNote = coreDoctrineNotes.get(key);
                        return (
                          <div
                            key={key}
                            className={cn(
                              "rounded-md border p-4",
                              value === "true"
                                ? "border-emerald-300 bg-emerald-100/70 dark:border-emerald-800 dark:bg-emerald-950/20"
                                : value === "false"
                                  ? "border-red-300 bg-red-100/70 dark:border-red-800 dark:bg-red-950/20"
                                  : "border-border bg-card shadow-sm"
                            )}
                          >
                            <div className="mb-2 flex items-start justify-between">
                              <p className="font-semibold text-foreground">{CORE_LABELS[key as CoreDoctrineKey]}</p>
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                                  value === "true"
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                                    : value === "false"
                                      ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                                      : "bg-muted text-muted-foreground"
                                )}
                              >
                                {value === "true" ? "✓ Affirmed" : value === "false" ? "✗ Denied" : "Unknown"}
                              </span>
                            </div>
                            {doctrineNote ? (
                              <div className="mt-2 space-y-1 text-sm">
                                <p className="text-foreground">{doctrineNote.text}</p>
                                {doctrineNote.sourceUrl && (
                                  <a
                                    href={doctrineNote.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center text-xs text-primary underline-offset-2 hover:underline"
                                  >
                                    View source →
                                  </a>
                                )}
                              </div>
                            ) : (
                              <p className="mt-2 text-sm text-muted-foreground italic">
                                {value === "true"
                                  ? "Affirmed through church's adopted confession or denomination."
                                  : value === "false"
                                    ? "This church explicitly denies this essential Christian doctrine."
                                    : "Position unclear from available church statements."}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Other Doctrines - Collapsible */}
                  {(Object.keys(evaluation.secondary ?? {}).length > 0 ||
                    Object.keys(evaluation.tertiary ?? {}).length > 0) && (
                      <Collapsible open={otherDoctrinesOpen} onOpenChange={setOtherDoctrinesOpen}>
                        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 hover:bg-muted/20 shadow-sm">
                          <div className="text-left">
                            <h3 className="text-lg font-semibold text-foreground">Other Doctrines</h3>
                            <p className="text-sm text-muted-foreground">
                              Additional theological positions and practices
                            </p>
                          </div>
                          <ChevronDown
                            className={cn(
                              "h-5 w-5 text-muted-foreground transition-transform",
                              otherDoctrinesOpen && "rotate-180"
                            )}
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            {Object.keys(evaluation.secondary ?? {}).length > 0 && (
                              <div className="space-y-2 rounded-md border border-border bg-card shadow-sm p-4">
                                <h4 className="text-base font-semibold text-foreground">Doctrines</h4>
                                <ul className="space-y-2 text-sm">
                                  {Object.entries(evaluation.secondary ?? {}).map(([key, value]) => (
                                    <li key={key} className="flex flex-col">
                                      <span className="font-medium text-foreground">{formatDoctrineKey(key)}</span>
                                      <span className="text-muted-foreground">{value ?? "Not specified"}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {Object.keys(evaluation.tertiary ?? {}).length > 0 && (
                              <div className="space-y-2 rounded-md border border-border bg-card shadow-sm p-4">
                                <h4 className="text-base font-semibold text-foreground">Additional Positions</h4>
                                <ul className="space-y-2 text-sm">
                                  {Object.entries(evaluation.tertiary ?? {}).map(([key, value]) => (
                                    <li key={key} className="flex flex-col">
                                      <span className="font-medium text-foreground">{formatDoctrineKey(key)}</span>
                                      <span className="text-muted-foreground">{value ?? "Not specified"}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                  {/* Remaining Notes - Only show notes not already in core doctrines */}
                  {remainingNotes.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-base font-semibold text-foreground">Additional Notes & Sources</h4>
                      <ul className="space-y-2 text-sm">
                        {remainingNotes.map((note, idx) => (
                          <li key={`${note.label}-${note.source_url}-${idx}`} className="rounded-md border border-border bg-card shadow-sm p-3">
                            <p className="font-medium text-foreground">{note.label}</p>
                            <p className="text-muted-foreground">{note.text}</p>
                            {note.source_url && (
                              <a
                                href={note.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex items-center text-xs text-primary underline-offset-2 hover:underline"
                              >
                                View source →
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              ) : (
                <p className="text-sm text-muted-foreground">We have not evaluated this church yet.</p>
              )}

              <Separator />

              <section className="space-y-2 text-sm text-muted-foreground">
                <h3 className="text-base font-semibold text-foreground">Best reference pages</h3>
                {renderBestPage("Beliefs", church.bestPages.beliefs)}
                {renderBestPage("Confession", church.bestPages.confession)}
                {renderBestPage("About", church.bestPages.about)}
                {renderBestPage("Leadership", church.bestPages.leadership)}
              </section>

              {/* Evaluation Notice */}
              <Alert className="bg-card border-border shadow-sm">
                <Info className="h-4 w-4 text-primary" />
                <AlertTitle className="text-foreground font-semibold">About these evaluations</AlertTitle>
                <AlertDescription className="text-foreground/80">
                  Our summaries rely on what a church publishes on its website. If something is not explicitly stated online,
                  we cannot infer their position. If you spot an error, please <a href="mailto:contact@calvinistparrotministries.org" className="text-primary underline underline-offset-2 hover:no-underline">email us</a> with the page link and what needs correction.
                </AlertDescription>
              </Alert>

              {/* Admin Re-evaluation Section */}
              {isAdmin && church.website && (
                <>
                  <Separator />
                  <section className="space-y-3">
                    <h3 className="text-base font-semibold text-foreground">Admin Actions</h3>
                    <Alert className="bg-amber-100 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800">
                      <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                      <AlertTitle className="text-amber-900 dark:text-amber-300">Re-evaluate Church</AlertTitle>
                      <AlertDescription className="space-y-3">
                        <p className="text-amber-800 dark:text-amber-400">
                          This will re-run the evaluation pipeline for this church using the current website content.
                          The existing evaluation will be replaced.
                        </p>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <code className="min-w-0 flex-1 overflow-x-auto rounded bg-muted px-2 py-1 text-xs text-foreground">
                            {church.website}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => reEvaluateMutation.mutate()}
                            disabled={reEvaluateMutation.status === "pending"}
                            className="shrink-0"
                          >
                            {reEvaluateMutation.status === "pending" ? <Spinner /> : "Re-evaluate"}
                          </Button>
                        </div>
                        {reEvaluateMutation.isError && (
                          <p className="text-sm text-red-600 dark:text-red-400">
                            {reEvaluateMutation.error instanceof Error
                              ? reEvaluateMutation.error.message
                              : "Re-evaluation failed"}
                          </p>
                        )}
                        {reEvaluateMutation.isSuccess && (
                          <p className="text-sm text-emerald-600 dark:text-emerald-400">
                            ✓ Re-evaluation complete! The page will refresh with updated data.
                          </p>
                        )}
                      </AlertDescription>
                    </Alert>
                  </section>
                </>
              )}
            </div>
          ) : (
            <div>
              <DialogHeader>
                <DialogTitle className="text-2xl font-semibold text-foreground">Loading...</DialogTitle>
                <DialogDescription>Please wait while we fetch church details.</DialogDescription>
              </DialogHeader>
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Loading church details…
              </div>
            </div>
          )}
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}

function renderBestPage(label: string, url: string | null) {
  if (!url) return <p>{label}: <span className="text-muted-foreground">Not provided</span></p>;
  return (
    <p className="flex flex-col gap-1 sm:flex-row sm:gap-2">
      <span className="font-medium text-foreground">{label}:</span>{" "}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="break-words text-primary underline-offset-2 hover:underline"
      >
        {url}
      </a>
    </p>
  );
}

function formatDoctrineKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
