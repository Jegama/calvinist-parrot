"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  FileAudio,
  Gauge,
  Loader2,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import type { AppwriteUser } from "@/hooks/use-auth";
import { hashFileIncrementally } from "@/lib/sermon-evaluation/hash-file.client";
import {
  SERMON_AUDIO_MAX_BYTES,
  SERMON_AUDIO_MAX_MIB,
} from "@/lib/sermon-evaluation/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSermonEvaluation, finalizeSermonUpload, prepareSermonUpload } from "./api";
import type {
  SermonCapabilities,
  SermonPreset,
  UploadProgressState,
} from "./types";
import { uploadSermonAudioDirectly } from "./upload";

const ACCEPTED_EXTENSIONS = new Set(["mp3", "m4a", "wav"]);
const ACCEPTED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
]);

const INITIAL_PROGRESS: UploadProgressState = {
  phase: "idle",
  progress: 0,
  message: "Ready for an audio file.",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function validateAudioFile(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPTED_EXTENSIONS.has(extension)) {
    return "Choose an MP3, M4A, or WAV audio file.";
  }
  if (!ACCEPTED_MIME_TYPES.has(file.type.toLowerCase())) {
    return "The browser-reported audio type is not supported. Choose an MP3, M4A, or WAV file.";
  }
  if (file.size === 0) {
    return "The selected audio file is empty.";
  }
  if (file.size > SERMON_AUDIO_MAX_BYTES) {
    return `Audio must be ${SERMON_AUDIO_MAX_MIB} MiB or smaller. This file is ${formatBytes(file.size)}.`;
  }
  return null;
}

function normalizeAudioFile(file: File): File {
  if (file.type.toLowerCase() !== "audio/mp3") {
    return file;
  }
  return new File([file], file.name, {
    type: "audio/mpeg",
    lastModified: file.lastModified,
  });
}

function requestedRunsFor(preset: SermonPreset, customRuns: number): number {
  if (preset === "HIGH_CONFIDENCE") {
    return 3;
  }
  if (preset === "CUSTOM") {
    return customRuns;
  }
  return 1;
}

export function SermonUploadForm({
  capabilities,
  user,
}: {
  capabilities: SermonCapabilities;
  user: AppwriteUser;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [preacher, setPreacher] = useState("");
  const [preachedOn, setPreachedOn] = useState("");
  const [preset, setPreset] = useState<SermonPreset>("STANDARD");
  const [customRuns, setCustomRuns] = useState(1);
  const [durationAdjustmentEnabled, setDurationAdjustmentEnabled] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<UploadProgressState>(INITIAL_PROGRESS);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chooseFile = (file: File | null) => {
    setAudioError(null);
    setError(null);
    setProgress(INITIAL_PROGRESS);
    if (!file) {
      setAudio(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }
    const validationError = validateAudioFile(file);
    if (validationError) {
      setAudio(null);
      setAudioError(validationError);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }
    setAudio(file);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^.]+$/, "").replaceAll(/[_-]+/g, " "));
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    chooseFile(event.target.files?.[0] ?? null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0] ?? null);
  };

  const redirectToExisting = (url: string, notice: "duplicate" | "reattach") => {
    setProgress({
      phase: "redirecting",
      progress: 100,
      message:
        notice === "duplicate"
          ? "You already evaluated this audio. Opening its history…"
          : "This audio belongs to an existing sermon. Opening the reattach flow…",
    });
    const separator = url.includes("?") ? "&" : "?";
    router.replace(`${url}${separator}notice=${notice}`);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAudioError(null);
    setError(null);
    if (!audio) {
      setAudioError("Choose the sermon audio before continuing.");
      inputRef.current?.focus();
      return;
    }
    const validationError = validateAudioFile(audio);
    if (validationError) {
      setAudioError(validationError);
      inputRef.current?.focus();
      return;
    }
    if (!title.trim() || !preacher.trim() || !preachedOn) {
      setError("Sermon title, preacher, and preached date are required.");
      return;
    }

    setBusy(true);
    try {
      const normalizedAudio = normalizeAudioFile(audio);
      setProgress({
        phase: "hashing",
        progress: 0,
        message: "Checking for an existing evaluation…",
      });
      const sha256 = await hashFileIncrementally(audio, {
        onProgress: ({ progress: nextProgress }) => {
          setProgress({
            phase: "hashing",
            progress: nextProgress,
            message: "Checking for an existing evaluation…",
          });
        },
      });

      setProgress({
        phase: "checking",
        progress: 100,
        message: "Comparing this private fingerprint with your sermon history…",
      });
      const requestedRuns = requestedRunsFor(preset, customRuns);
      const decision = await prepareSermonUpload({
        sha256,
        filename: normalizedAudio.name,
        mimeType: normalizedAudio.type,
        byteSize: normalizedAudio.size,
        preset,
        requestedRuns: preset === "CUSTOM" ? requestedRuns : undefined,
      });

      if (decision.decision === "existing_evaluation") {
        redirectToExisting(decision.detailUrl, "duplicate");
        return;
      }
      if (decision.decision === "reattach_required" && !decision.upload) {
        redirectToExisting(decision.detailUrl, "reattach");
        return;
      }

      const authorization =
        decision.decision === "upload_required" ? decision.upload : decision.upload;
      if (!authorization) {
        throw new Error("The server did not provide a valid upload authorization.");
      }

      setProgress({
        phase: "uploading",
        progress: 0,
        message: "Uploading to your private sermon audio storage…",
      });
      const fileId = await uploadSermonAudioDirectly({
        authorization,
        file: normalizedAudio,
        ownerId: user.$id,
        onProgress: (nextProgress) =>
          setProgress({
            phase: "uploading",
            progress: nextProgress,
            message: "Uploading to your private sermon audio storage…",
          }),
      });

      setProgress({
        phase: "finalizing",
        progress: 100,
        message: "Verifying the uploaded audio and reserving run credits…",
      });
      const finalized = await finalizeSermonUpload({
        reservationId: authorization.reservationId,
        fileId,
        sha256,
      });
      if (finalized.decision === "existing_evaluation") {
        redirectToExisting(finalized.detailUrl, "duplicate");
        return;
      }

      setProgress({
        phase: "queueing",
        progress: 100,
        message: "Creating the evaluation and adding it to the private queue…",
      });
      const created = await createSermonEvaluation({
        reservationId: finalized.reservationId,
        title: title.trim(),
        preacher: preacher.trim(),
        preachedOn,
        preset,
        requestedRuns: preset === "CUSTOM" ? requestedRuns : undefined,
        durationAdjustmentEnabled,
      });
      if (!created.evaluationId) {
        throw new Error("The evaluation was queued, but its detail link was missing.");
      }
      router.push(created.detailUrl);
    } catch (caught) {
      setProgress(INITIAL_PROGRESS);
      setError(caught instanceof Error ? caught.message : "The sermon evaluation could not be started.");
    } finally {
      setBusy(false);
    }
  };

  const cost = requestedRunsFor(preset, customRuns);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border bg-card">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary" aria-hidden="true">
            <FileAudio className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="font-serif text-xl">Evaluate a sermon</CardTitle>
            <CardDescription className="mt-1">
              Private coaching feedback from the sermon&apos;s actual audio. Nothing is published or ranked.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="sermon-audio">Sermon audio</Label>
            <Input
              ref={inputRef}
              id="sermon-audio"
              type="file"
              accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav,audio/x-wav"
              className="sr-only"
              onChange={handleFileChange}
              disabled={busy}
              aria-required="true"
              aria-invalid={audioError ? "true" : undefined}
              aria-describedby={audioError ? "sermon-audio-error" : undefined}
            />
            <div
              className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
                audioError
                  ? "border-destructive bg-destructive/5"
                  : dragging
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/30"
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              {audio ? (
                <div className="flex items-center justify-between gap-4 text-left">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-full bg-success/10 p-2 text-success">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{audio.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(audio.size)} · fingerprinted before upload
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove selected audio"
                    onClick={() => chooseFile(null)}
                    disabled={busy}
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <>
                  <UploadCloud className="mx-auto mb-3 h-8 w-8 text-primary" aria-hidden="true" />
                  <p className="font-medium text-foreground">Drop sermon audio here</p>
                  <p className="mt-1 text-sm text-muted-foreground">MP3, M4A, or WAV · up to {SERMON_AUDIO_MAX_MIB} MiB · up to 3 hours</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4"
                    onClick={() => inputRef.current?.click()}
                    disabled={busy}
                  >
                    Choose audio
                  </Button>
                </>
              )}
            </div>
            {audioError && (
              <Alert id="sermon-audio-error" variant="destructive">
                <AlertTitle>Audio wasn&apos;t added</AlertTitle>
                <AlertDescription>{audioError}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="sermon-title">Sermon title</Label>
              <Input
                id="sermon-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="The Good Shepherd"
                maxLength={200}
                disabled={busy}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sermon-preacher">Preacher</Label>
              <Input
                id="sermon-preacher"
                value={preacher}
                onChange={(event) => setPreacher(event.target.value)}
                placeholder="Preacher name"
                maxLength={120}
                disabled={busy}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sermon-date">Date preached</Label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="sermon-date"
                  type="date"
                  value={preachedOn}
                  onChange={(event) => setPreachedOn(event.target.value)}
                  className="pl-9"
                  disabled={busy}
                  required
                />
              </div>
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-foreground">Evaluation method</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  preset === "STANDARD" ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <input
                  type="radio"
                  name="sermon-preset"
                  value="STANDARD"
                  checked={preset === "STANDARD"}
                  onChange={() => setPreset("STANDARD")}
                  disabled={busy}
                  className="sr-only"
                />
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium">Standard</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">1 run credit</span>
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  One complete scoring run for focused coaching feedback.
                </span>
              </label>
              <label
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  preset === "HIGH_CONFIDENCE"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <input
                  type="radio"
                  name="sermon-preset"
                  value="HIGH_CONFIDENCE"
                  checked={preset === "HIGH_CONFIDENCE"}
                  onChange={() => setPreset("HIGH_CONFIDENCE")}
                  disabled={busy}
                  className="sr-only"
                />
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium">Self-consistency</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">3 run credits</span>
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Three independent scoring runs with confidence-weighted aggregation and harmonized feedback.
                </span>
              </label>
            </div>

            {capabilities.canChooseCustomRunCount && (
              <div
                className={`rounded-xl border p-4 ${
                  preset === "CUSTOM" ? "border-primary bg-primary/5" : "border-border bg-card"
                }`}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="sermon-preset"
                    value="CUSTOM"
                    checked={preset === "CUSTOM"}
                    onChange={() => setPreset("CUSTOM")}
                    disabled={busy}
                    className="mt-1 accent-primary"
                  />
                  <span className="flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2 font-medium">
                      Admin custom run
                      <span className="text-xs text-muted-foreground">
                        Daily quota exempt · lifetime limit still applies
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      All requested scoring runs start concurrently.
                    </span>
                  </span>
                </label>
                {preset === "CUSTOM" && (
                  <div className="mt-3 max-w-xs space-y-2 pl-7">
                    <Label htmlFor="custom-runs">Scoring runs</Label>
                    <Select
                      value={String(customRuns)}
                      onValueChange={(value) => setCustomRuns(Number(value))}
                      disabled={busy}
                    >
                      <SelectTrigger id="custom-runs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          {
                            length:
                              capabilities.allowedRunCountMax - capabilities.allowedRunCountMin + 1,
                          },
                          (_, index) => capabilities.allowedRunCountMin + index,
                        ).map((runs) => (
                          <SelectItem key={runs} value={String(runs)}>
                            {runs} concurrent {runs === 1 ? "run" : "runs"} · {runs} run {runs === 1 ? "credit" : "credits"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Each exact audio fingerprint has nine lifetime sermon run credits. Only successful rounds in completed evaluations are consumed; failed evaluations release their reservations. Deleting a completed evaluation does not restore consumed credits.
            </p>
          </fieldset>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-xl border border-border">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="flex h-auto w-full justify-between rounded-xl px-4 py-3"
                disabled={busy}
              >
                <span className="flex items-center gap-2">
                  <Gauge className="h-4 w-4" />
                  Advanced options
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-border px-4 py-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  role="switch"
                  checked={durationAdjustmentEnabled}
                  onChange={(event) => setDurationAdjustmentEnabled(event.target.checked)}
                  disabled={busy}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="font-medium text-foreground">Apply sermon-length adjustment</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Optionally reduces Overall Impact for sermons shorter than 35 minutes or longer than 50 minutes. Rubric and category scores are unaffected.
                  </span>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    This is off by default. You can change it later without rerunning the evaluation.
                  </span>
                </span>
              </label>
            </CollapsibleContent>
          </Collapsible>

          {progress.phase !== "idle" && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4" aria-live="polite">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary motion-reduce:animate-none" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground">{progress.message}</span>
                    <span className="tabular-nums text-muted-foreground">{Math.round(progress.progress)}%</span>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress.progress)}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
                      style={{ width: `${progress.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Could not start the evaluation</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" />
              Private audio uploads directly to owner-scoped storage.
            </p>
            <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
              {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <UploadCloud />}
              {busy ? "Starting evaluation…" : `Use ${cost} run ${cost === 1 ? "credit" : "credits"} & evaluate`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
