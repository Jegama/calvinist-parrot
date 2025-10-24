"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import type { ChurchDetail, CoreDoctrineKey } from "@/types/church";
import coreDoctrinesJson from "@/lib/core_doctrines.json";
import canNotEndorseJson from "@/lib/can_not_endorse_churches.json";
import { cn } from "@/lib/utils";

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

const DOCTRINE_STYLE: Record<string, string> = {
  true: "text-emerald-600 dark:text-emerald-400",
  false: "text-red-600 dark:text-red-400",
  unknown: "text-muted-foreground",
};

const STATUS_CONFIG = {
  pass: {
    icon: CheckCircle2,
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
    borderColor: "border-emerald-200 dark:border-emerald-800",
    textColor: "text-emerald-800 dark:text-emerald-300",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    title: "✅ We Can Endorse This Church",
    description: "This church affirms all essential doctrines or has adopted a historic Reformed confession.",
  },
  caution: {
    icon: AlertTriangle,
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    borderColor: "border-amber-200 dark:border-amber-800",
    textColor: "text-amber-800 dark:text-amber-300",
    iconColor: "text-amber-600 dark:text-amber-400",
    title: "⚠️ Exercise Caution",
    description: "This church has limited doctrinal information available. We recommend further investigation before joining.",
  },
  red_flag: {
    icon: AlertCircle,
    bgColor: "bg-red-50 dark:bg-red-950/30",
    borderColor: "border-red-200 dark:border-red-800",
    textColor: "text-red-800 dark:text-red-300",
    iconColor: "text-red-600 dark:text-red-400",
    title: "🚫 We Cannot Endorse This Church",
    description: "This church denies one or more essential Christian doctrines.",
  },
} as const;

type ChurchDetailDialogProps = {
  church: ChurchDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ChurchDetailDialog({ church, open, onOpenChange }: ChurchDetailDialogProps) {
  const evaluation = church?.evaluation;
  const status = evaluation?.status ?? null;
  
  // Find false doctrines
  const falseDoctrine = evaluation?.coreDoctrines
    ? (Object.entries(evaluation.coreDoctrines)
        .filter(([, value]) => value === "false")
        .map(([key]) => key as CoreDoctrineKey))
    : [];

  // Check if denomination is in the non-endorsement list
  const denominationLabel = church?.denomination?.label?.trim();
  const denominationNote = denominationLabel && denominationLabel in canNotEndorseJson
    ? canNotEndorseJson[denominationLabel as keyof typeof canNotEndorseJson]
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        {church ? (
          <div className="space-y-6">
            <DialogHeader>
              <DialogTitle className="text-2xl font-semibold text-foreground">{church.name}</DialogTitle>
              <DialogDescription>
                {church.city && church.state ? `${church.city}, ${church.state}` : church.city ?? church.state ?? "Location unknown"}
              </DialogDescription>
            </DialogHeader>

            {/* Endorsement Status Alert */}
            {status && STATUS_CONFIG[status] && (
              <Alert className={cn(STATUS_CONFIG[status].bgColor, STATUS_CONFIG[status].borderColor)}>
                {(() => {
                  const Icon = STATUS_CONFIG[status].icon;
                  return <Icon className={cn("h-4 w-4", STATUS_CONFIG[status].iconColor)} />;
                })()}
                <AlertTitle className={STATUS_CONFIG[status].textColor}>
                  {STATUS_CONFIG[status].title}
                </AlertTitle>
                <AlertDescription className={STATUS_CONFIG[status].textColor}>
                  {STATUS_CONFIG[status].description}
                </AlertDescription>
              </Alert>
            )}

            {/* False Doctrines Warning */}
            {falseDoctrine.length > 0 && (
              <div className="space-y-4 rounded-lg border-2 border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
                <h3 className="text-lg font-semibold text-red-800 dark:text-red-300">
                  ⚠️ Doctrinal Concerns
                </h3>
                <p className="text-sm text-red-700 dark:text-red-400">
                  This church explicitly denies the following essential Christian doctrine(s):
                </p>
                <div className="space-y-4">
                  {falseDoctrine.map((key) => (
                    <div key={key} className="rounded-md border border-red-300 bg-white/50 p-3 dark:border-red-700 dark:bg-black/20">
                      <p className="mb-2 font-semibold text-red-900 dark:text-red-200">
                        ❌ {CORE_LABELS[key]}
                      </p>
                      <div className="space-y-2 text-sm">
                        <p className="text-red-800 dark:text-red-300">
                          <span className="font-medium">What we believe:</span>
                        </p>
                        <p className="italic text-red-700 dark:text-red-400">
                          &ldquo;{coreDoctrinesJson[key]}&rdquo;
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Denomination-Specific Note */}
            {denominationNote && (
              <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertTitle className="text-amber-800 dark:text-amber-300">
                  About {denominationLabel}
                </AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-400">
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

            <section className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4 md:grid-cols-2">
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium text-muted-foreground">Website:</span>{" "}
                  <a
                    href={church.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {church.website}
                  </a>
                </p>
                <p>
                  <span className="font-medium text-muted-foreground">Email:</span>{" "}
                  {church.email ?? "Unavailable"}
                </p>
                <p>
                  <span className="font-medium text-muted-foreground">Phone:</span>{" "}
                  {church.phone ?? "Unavailable"}
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium text-muted-foreground">Denomination:</span>{" "}
                  {church.denomination.label ?? "Unknown"}
                </p>
                <p>
                  <span className="font-medium text-muted-foreground">Confessional:</span>{" "}
                  {church.confessionAdopted ? "Yes" : "No"}
                </p>
                <p>
                  <span className="font-medium text-muted-foreground">Core coverage:</span>{" "}
                  {evaluation ? `${Math.round(evaluation.coverageRatio * 100)}%` : "Unknown"}
                </p>
              </div>
            </section>

            {church.addresses.length > 0 ? (
              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">Addresses</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {church.addresses.map((address) => (
                    <div key={address.id} className="rounded-md border border-border bg-card/60 p-3 text-sm">
                      <p className="font-medium text-foreground">
                        {address.street1}
                        {address.street2 ? `, ${address.street2}` : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {[address.city, address.state, address.postCode].filter(Boolean).join(", ") || "Unknown"}
                      </p>
                      {address.sourceUrl ? (
                        <a
                          href={address.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline-offset-2 hover:underline"
                        >
                          Source
                        </a>
                      ) : null}
                      {address.isPrimary ? (
                        <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          Primary
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {church.serviceTimes.length > 0 ? (
              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">Service times</h3>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  {church.serviceTimes.map((service) => (
                    <span key={service.id} className="rounded-md bg-muted px-3 py-1.5">
                      {service.label}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {evaluation ? (
              <section className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Core doctrines</h3>
                  <p className="text-sm text-muted-foreground">
                    True doctrines appear in green, explicit denials in red, and unknown positions in muted text.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(evaluation.coreDoctrines).map(([key, value]) => (
                    <div key={key} className="rounded-md border border-border bg-card/60 p-3">
                      <p className="text-sm font-semibold text-foreground">{CORE_LABELS[key as CoreDoctrineKey]}</p>
                      <p className={`text-sm ${DOCTRINE_STYLE[value]}`}>{value.toUpperCase()}</p>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <h4 className="text-base font-semibold text-foreground">Secondary doctrines</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {Object.entries(evaluation.secondary ?? {}).map(([key, value]) => (
                        <li key={key}>
                          <span className="font-medium text-foreground">{formatDoctrineKey(key)}:</span> {value ?? "Not specified"}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-base font-semibold text-foreground">Tertiary doctrines</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {Object.entries(evaluation.tertiary ?? {}).map(([key, value]) => (
                        <li key={key}>
                          <span className="font-medium text-foreground">{formatDoctrineKey(key)}:</span> {value ?? "Not specified"}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {evaluation.badges.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="text-base font-semibold text-foreground">Badges</h4>
                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                      {evaluation.badges.map((badge) => (
                        <span key={badge} className="rounded-full bg-muted px-3 py-1">
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {evaluation.raw.church.notes.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="text-base font-semibold text-foreground">Notes & Sources</h4>
                    <ul className="space-y-2 text-sm">
                      {evaluation.raw.church.notes.map((note) => (
                        <li key={`${note.label}-${note.source_url}`} className="rounded-md border border-border bg-card/60 p-3">
                          <p className="font-medium text-foreground">{note.label}</p>
                          <p className="text-muted-foreground">{note.text}</p>
                          {note.source_url ? (
                            <a
                              href={note.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary underline-offset-2 hover:underline"
                            >
                              Source
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">No evaluation available for this church yet.</p>
            )}

            <Separator />

            <section className="space-y-2 text-sm text-muted-foreground">
              <h3 className="text-base font-semibold text-foreground">Best reference pages</h3>
              {renderBestPage("Beliefs", church.bestPages.beliefs)}
              {renderBestPage("Confession", church.bestPages.confession)}
              {renderBestPage("About", church.bestPages.about)}
              {renderBestPage("Leadership", church.bestPages.leadership)}
            </section>
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
      </DialogContent>
    </Dialog>
  );
}

function renderBestPage(label: string, url: string | null) {
  if (!url) return <p>{label}: <span className="text-muted-foreground">Not provided</span></p>;
  return (
    <p>
      <span className="font-medium text-foreground">{label}:</span>{" "}
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
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
