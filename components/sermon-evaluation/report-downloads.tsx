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
  const reports: Array<{
    format: "pdf" | "csv";
    label: "PDF" | "CSV";
    version: string;
  }> = [];
  for (const report of evaluation.reports) {
    if (report.format === "markdown") {
      reports.push({ format: "pdf", label: "PDF", version: report.version });
    }
    if (report.format === "csv") {
      reports.push({ format: "csv", label: "CSV", version: report.version });
    }
  }

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
              Fresh report snapshots are being prepared. Downloads will resume
              when the PDF and CSV versions are ready.
            </AlertDescription>
          </Alert>
        ) : reports.length > 0 ? (
          reports.map((report) => (
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
                  {report.label} · version {report.version}
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
