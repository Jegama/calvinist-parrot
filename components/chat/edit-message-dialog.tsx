"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ChatMessageRecord } from "@/lib/chat-turns";

type EditMessageDialogProps = {
  message: ChatMessageRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (message: ChatMessageRecord, editedText: string) => Promise<void>;
};

export function EditMessageDialog({
  message,
  open,
  onOpenChange,
  onConfirm,
}: EditMessageDialogProps) {
  const isMobile = useIsMobile(640);
  const [value, setValue] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValue(message?.content ?? "");
    setConfirming(false);
    setIsSubmitting(false);
    setError("");
  }, [message, open]);

  const submitBranch = async () => {
    if (!message || !value.trim()) return;
    setIsSubmitting(true);
    setError("");
    try {
      await onConfirm(message, value.trim());
      onOpenChange(false);
    } catch (branchError) {
      console.error("Unable to create conversation branch:", branchError);
      setError("We could not create the new conversation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const body = (
    <>
      {!confirming ? (
        <Textarea
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="min-h-36 max-h-[50vh] resize-y bg-input-bg text-base"
          dir="auto"
          aria-label="Edit message"
        />
      ) : (
        <div className="rounded-lg border border-primary/35 border-s-4 border-s-primary bg-card p-4 text-sm shadow-sm">
          <p>
            Editing this message will create a new conversation from this point.
            Your original conversation will stay unchanged.
          </p>
          <p className="mt-2 text-muted-foreground">
            The new title will be based on your edited message.
          </p>
        </div>
      )}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );

  const actions = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
        disabled={isSubmitting}
      >
        Cancel
      </Button>
      {!confirming ? (
        <Button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!value.trim() || value.trim() === message?.content.trim()}
        >
          Continue
        </Button>
      ) : (
        <Button
          type="button"
          onClick={() => void submitBranch()}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : null}
          Edit and create new
        </Button>
      )}
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto rounded-t-[var(--radius)] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="text-start">
            <SheetTitle>
              {confirming ? "Create a new conversation?" : "Edit message"}
            </SheetTitle>
            <SheetDescription>
              {confirming
                ? "Your current conversation will not be changed."
                : "Revise your question before creating a new branch."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">{body}</div>
          <SheetFooter className="gap-2">{actions}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {confirming ? "Create a new conversation?" : "Edit message"}
          </DialogTitle>
          <DialogDescription>
            {confirming
              ? "Your current conversation will not be changed."
              : "Revise your question before creating a new branch."}
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter className="gap-2">{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
