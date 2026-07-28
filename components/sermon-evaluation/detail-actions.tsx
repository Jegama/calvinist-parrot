"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  FileAudio,
  FileUp,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import type { AppwriteUser } from "@/hooks/use-auth";
import { hashFileIncrementally } from "@/lib/sermon-evaluation/hash-file.client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  cancelSermonEvaluation,
  deleteSermonAudio,
  deleteSermonEvaluation,
  finalizeSermonUpload,
  prepareSermonUpload,
  reevaluateSermon,
  retrySermonEvaluation,
} from "./api";
import type {
  SermonCapabilities,
  SermonEvaluationDetail,
  SermonPreset,
  UploadAuthorization,
} from "./types";
import { uploadSermonAudioDirectly } from "./upload";

const MAX_AUDIO_BYTES = 62_914_560;
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

function validateReattachment(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPTED_EXTENSIONS.has(extension) || !ACCEPTED_MIME_TYPES.has(file.type.toLowerCase())) {
    return "Choose the original MP3, M4A, or WAV audio.";
  }
  if (file.size === 0 || file.size > MAX_AUDIO_BYTES) {
    return "Audio must be non-empty and no larger than 60 MiB.";
  }
  return null;
}

function normalizeReattachment(file: File): File {
  if (file.type.toLowerCase() !== "audio/mp3") {
    return file;
  }
  return new File([file], file.name, {
    type: "audio/mpeg",
    lastModified: file.lastModified,
  });
}

function readAuthorization(
  decision:
    | Awaited<ReturnType<typeof prepareSermonUpload>>
    | null,
): UploadAuthorization | null {
  if (!decision) {
    return null;
  }
  if (decision.decision === "upload_required") {
    return decision.upload;
  }
  return decision.decision === "reattach_required" ? decision.upload ?? null : null;
}

export function SermonDetailActions({
  evaluation,
  capabilities,
  user,
  onChanged,
}: {
  evaluation: SermonEvaluationDetail;
  capabilities: SermonCapabilities;
  user: AppwriteUser;
  onChanged: () => Promise<unknown>;
}) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteAudioOpen, setDeleteAudioOpen] = useState(false);
  const [deleteEvaluationOpen, setDeleteEvaluationOpen] = useState(false);

  const run = async (label: string, action: () => Promise<void>, after?: () => void) => {
    setError(null);
    setBusyAction(label);
    try {
      await action();
      after?.();
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action could not be completed.");
    } finally {
      setBusyAction(null);
    }
  };

  const isActive = [
    "QUEUED",
    "PREPARING_AUDIO",
    "EXTRACTING",
    "SCORING",
    "HARMONIZING",
    "CALIBRATING",
    "SUMMARIZING",
  ].includes(evaluation.status);
  const canRetry = evaluation.status === "FAILED" || evaluation.status === "TIMED_OUT";
  const canReevaluate =
    evaluation.status === "COMPLETE" || evaluation.status === "COMPLETE_WITH_WARNINGS";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {isActive && (
          <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <XCircle />
                Cancel evaluation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancel this evaluation?</DialogTitle>
                <DialogDescription>
                  The worker will stop before its next external call. A request already in flight may finish, but its result will not advance a canceled evaluation.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCancelOpen(false)}>
                  Keep running
                </Button>
                <Button
                  variant="destructive"
                  disabled={busyAction !== null}
                  onClick={() =>
                    void run(
                      "cancel",
                      () => cancelSermonEvaluation(evaluation.id),
                      () => setCancelOpen(false),
                    )
                  }
                >
                  {busyAction === "cancel" && <Loader2 className="animate-spin motion-reduce:animate-none" />}
                  Request cancellation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {canRetry && (
          <Button
            onClick={() =>
              void run("retry", () => retrySermonEvaluation(evaluation.id))
            }
            disabled={busyAction !== null}
          >
            {busyAction === "retry" ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            ) : (
              <RotateCcw />
            )}
            Retry attempt
          </Button>
        )}

        {canReevaluate && evaluation.hasRetainedAudio && (
          <ReevaluateDialog
            evaluation={evaluation}
            capabilities={capabilities}
            busy={busyAction !== null}
            onSubmit={async (preset) => {
              setBusyAction("reevaluate");
              try {
                const created = await reevaluateSermon({ id: evaluation.id, preset });
                if (!created.evaluationId) {
                  throw new Error("The new evaluation link was missing.");
                }
                router.push(created.detailUrl);
              } finally {
                setBusyAction(null);
              }
            }}
          />
        )}

        {canReevaluate && !evaluation.hasRetainedAudio && (
          <ReattachDialog
            evaluation={evaluation}
            user={user}
            busy={busyAction !== null}
            onBusyChange={setBusyAction}
          />
        )}

        {evaluation.hasRetainedAudio && (
          <Dialog open={deleteAudioOpen} onOpenChange={setDeleteAudioOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <FileAudio />
                Delete audio
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete the retained sermon audio?</DialogTitle>
                <DialogDescription>
                  The report and evaluation history will remain private and available. Re-evaluation will require reattaching the exact same audio bytes.
                </DialogDescription>
              </DialogHeader>
              <Alert>
                <AlertTitle>Run credits are not restored</AlertTitle>
                <AlertDescription>
                  This sermon&apos;s fingerprint and consumed run-credit count remain so deleting and uploading again cannot reset the nine-credit lifetime limit.
                </AlertDescription>
              </Alert>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteAudioOpen(false)}>
                  Keep audio
                </Button>
                <Button
                  variant="destructive"
                  disabled={busyAction !== null}
                  onClick={() =>
                    void run(
                      "delete-audio",
                      () => deleteSermonAudio(evaluation.id),
                      () => setDeleteAudioOpen(false),
                    )
                  }
                >
                  {busyAction === "delete-audio" && (
                    <Loader2 className="animate-spin motion-reduce:animate-none" />
                  )}
                  Delete audio
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {!isActive && (
          <Dialog open={deleteEvaluationOpen} onOpenChange={setDeleteEvaluationOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 />
                Delete evaluation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this evaluation and report?</DialogTitle>
                <DialogDescription>
                  This removes the evaluation record from your dashboard. Other evaluations for the same audio remain in its private history.
                </DialogDescription>
              </DialogHeader>
              <Alert>
                <AlertTitle>Consumed sermon run credits are permanent</AlertTitle>
                <AlertDescription>
                  Deleting this evaluation does not restore any consumed run credits or remove the fingerprint&apos;s lifetime usage record.
                </AlertDescription>
              </Alert>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteEvaluationOpen(false)}>
                  Keep evaluation
                </Button>
                <Button
                  variant="destructive"
                  disabled={busyAction !== null}
                  onClick={() =>
                    void run(
                      "delete-evaluation",
                      () => deleteSermonEvaluation(evaluation.id),
                      () => router.replace("/sermon-evaluation"),
                    )
                  }
                >
                  {busyAction === "delete-evaluation" && (
                    <Loader2 className="animate-spin motion-reduce:animate-none" />
                  )}
                  Delete permanently
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Action could not be completed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function ReevaluateDialog({
  evaluation,
  capabilities,
  busy,
  onSubmit,
}: {
  evaluation: SermonEvaluationDetail;
  capabilities: SermonCapabilities;
  busy: boolean;
  onSubmit: (preset: SermonPreset) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<SermonPreset>("STANDARD");
  const [error, setError] = useState<string | null>(null);
  const standardAvailable = evaluation.runCredits.remaining >= 1;
  const highAvailable = evaluation.runCredits.remaining >= 3;
  const canSubmit = preset === "STANDARD" ? standardAvailable : highAvailable;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={!standardAvailable}>
          <RefreshCcw />
          Re-evaluate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-evaluate retained audio</DialogTitle>
          <DialogDescription>
            The existing private Appwrite audio is reused. No upload is needed, and a new evaluation is added to this fingerprint&apos;s history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label
            className={`block rounded-xl border p-4 ${
              preset === "STANDARD" ? "border-primary bg-primary/5" : "border-border"
            } ${standardAvailable ? "cursor-pointer" : "opacity-60"}`}
          >
            <input
              type="radio"
              name="reevaluate-preset"
              value="STANDARD"
              checked={preset === "STANDARD"}
              onChange={() => setPreset("STANDARD")}
              disabled={!standardAvailable || busy}
              className="sr-only"
            />
            <span className="flex items-center justify-between gap-3 font-medium">
              Standard
              <span>1 run credit</span>
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              One complete scoring run. {standardAvailable ? "Available." : "Not enough credits."}
            </span>
          </label>
          <label
            className={`block rounded-xl border p-4 ${
              preset === "HIGH_CONFIDENCE" ? "border-primary bg-primary/5" : "border-border"
            } ${highAvailable ? "cursor-pointer" : "opacity-60"}`}
          >
            <input
              type="radio"
              name="reevaluate-preset"
              value="HIGH_CONFIDENCE"
              checked={preset === "HIGH_CONFIDENCE"}
              onChange={() => setPreset("HIGH_CONFIDENCE")}
              disabled={!highAvailable || busy}
              className="sr-only"
            />
            <span className="flex items-center justify-between gap-3 font-medium">
              High confidence
              <span>3 run credits</span>
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Three concurrent runs. {highAvailable ? "Available." : "Not enough credits."}
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            {evaluation.runCredits.remaining} of {evaluation.runCredits.limit} sermon run credits remain.
            {capabilities.dailyQuotaExempt
              ? " Your admin daily exemption does not bypass this lifetime balance."
              : ""}
          </p>
          {error && (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>Re-evaluation could not be started</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || busy}
            onClick={() => {
              setError(null);
              void onSubmit(preset).catch((caught) => {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "The sermon could not be re-evaluated.",
                );
              });
            }}
          >
            {busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}
            Use {preset === "HIGH_CONFIDENCE" ? "3 credits" : "1 credit"} & re-evaluate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReattachDialog({
  evaluation,
  user,
  busy,
  onBusyChange,
}: {
  evaluation: SermonEvaluationDetail;
  user: AppwriteUser;
  busy: boolean;
  onBusyChange: (value: string | null) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<SermonPreset>("STANDARD");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const highAvailable = evaluation.runCredits.remaining >= 3;

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (!next) {
      setFile(null);
      return;
    }
    const validationError = validateReattachment(next);
    if (validationError) {
      setError(validationError);
      setFile(null);
      return;
    }
    setError(null);
    setFile(next);
  };

  const reattach = async () => {
    if (!file) {
      setError("Choose the exact original audio file.");
      return;
    }
    onBusyChange("reattach");
    setError(null);
    try {
      const normalizedFile = normalizeReattachment(file);
      const sha256 = await hashFileIncrementally(file, {
        onProgress: ({ progress: next }) => setProgress(next * 0.35),
      });
      const decision = await prepareSermonUpload({
        sha256,
        filename: normalizedFile.name,
        mimeType: normalizedFile.type,
        byteSize: normalizedFile.size,
        preset,
        reattachEvaluationId: evaluation.id,
      });
      if (decision.decision === "existing_evaluation") {
        const created = await reevaluateSermon({ id: evaluation.id, preset });
        router.push(created.detailUrl);
        return;
      }
      const authorization = readAuthorization(decision);
      if (!authorization) {
        throw new Error(
          "The selected file matched deleted sermon history, but the server did not authorize reattachment.",
        );
      }
      const fileId = await uploadSermonAudioDirectly({
        authorization,
        file: normalizedFile,
        ownerId: user.$id,
        onProgress: (next) => setProgress(35 + next * 0.55),
      });
      setProgress(95);
      await finalizeSermonUpload({ reservationId: authorization.reservationId, fileId, sha256 });
      const created = await reevaluateSermon({ id: evaluation.id, preset });
      setProgress(100);
      router.push(created.detailUrl);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The audio could not be reattached.",
      );
      onBusyChange(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={evaluation.runCredits.remaining < 1}>
          <FileUp />
          Reattach audio to re-evaluate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reattach the exact sermon audio</DialogTitle>
          <DialogDescription>
            The browser fingerprints your selected file first. It must match this sermon&apos;s existing private fingerprint; prior history and consumed credits are preserved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reattach-sermon-audio">Original MP3, M4A, or WAV</Label>
            <Input
              ref={inputRef}
              id="reattach-sermon-audio"
              type="file"
              accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav,audio/x-wav"
              onChange={chooseFile}
              disabled={busy}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant={preset === "STANDARD" ? "default" : "outline"}
              onClick={() => setPreset("STANDARD")}
              disabled={busy}
            >
              Standard · 1 credit
            </Button>
            <Button
              type="button"
              variant={preset === "HIGH_CONFIDENCE" ? "default" : "outline"}
              onClick={() => setPreset("HIGH_CONFIDENCE")}
              disabled={busy || !highAvailable}
            >
              High confidence · 3 credits
            </Button>
          </div>
          {busy && (
            <div aria-live="polite">
              <div className="flex justify-between gap-3 text-sm text-muted-foreground">
                <span>Fingerprinting, reattaching, and queueing…</span>
                <span className="tabular-nums">{Math.round(progress)}%</span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {error && (
            <Alert variant="destructive" aria-live="assertive">
              <AlertTitle>Audio could not be reattached</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void reattach()} disabled={!file || busy}>
            {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <FileUp />}
            Reattach and re-evaluate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
