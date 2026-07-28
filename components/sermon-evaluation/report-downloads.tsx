import { Download, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { sermonExportUrl } from "./api";
import type { SermonEvaluationDetail } from "./types";

export function ReportDownloads({
  evaluation,
}: {
  evaluation: SermonEvaluationDetail;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg">Versioned reports</CardTitle>
        <CardDescription>
          Download the immutable coaching snapshot in the format you need.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {evaluation.reportRegenerationPending ? (
          <Alert
            className="border-info/30 bg-info/10"
            aria-live="polite"
          >
            <Loader2 className="animate-spin motion-reduce:animate-none" />
            <AlertTitle>Updating versioned reports</AlertTitle>
            <AlertDescription>
              Your sermon-length policy changed. Report downloads are paused
              until fresh Markdown, JSON, and CSV versions are ready.
            </AlertDescription>
          </Alert>
        ) : evaluation.reports.length > 0 ? (
          evaluation.reports.map((report) => (
            <Button
              key={`${report.format}:${report.version}`}
              variant="outline"
              className="w-full justify-between"
              asChild
            >
              <a
                href={sermonExportUrl(
                  evaluation.id,
                  report.format,
                  report.version,
                )}
              >
                <span>
                  {report.format === "markdown"
                    ? "Markdown"
                    : report.format.toUpperCase()}{" "}
                  · version {report.version}
                </span>
                <Download />
              </a>
            </Button>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            Versioned reports will appear after the evaluation publishes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
