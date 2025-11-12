// app/profile/components/theological-preferences-card.tsx

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MarkdownWithBibleVerses } from "@/components/MarkdownWithBibleVerses";
import { CheckCircle2, ExternalLink } from "lucide-react";
import Link from "next/link";
import * as denominations from "@/lib/denominations";
import type { ProfileStats } from "../types";
import { updateDenomination } from "../api";

const DENOMINATION_OPTIONS = [
  { value: "reformed-baptist", label: "Reformed Baptist" },
  { value: "presbyterian", label: "Presbyterian" },
  { value: "wesleyan", label: "Wesleyan/Methodist" },
  { value: "lutheran", label: "Lutheran" },
  { value: "anglican", label: "Anglican/Episcopal" },
  { value: "pentecostal", label: "Pentecostal/Charismatic" },
  { value: "non-denom", label: "Non-Denominational" },
] as const;

type TheologicalPreferencesCardProps = {
  stats: ProfileStats;
  userId: string;
  onUpdate: () => void;
};

export function TheologicalPreferencesCard({
  stats,
  userId,
  onUpdate,
}: TheologicalPreferencesCardProps) {
  const [selectedDenomination, setSelectedDenomination] =
    useState<string>("reformed-baptist");
  const [isSavingDenomination, setIsSavingDenomination] = useState(false);
  const [denominationSaved, setDenominationSaved] = useState(false);

  // Sync selected denomination with profile data
  useEffect(() => {
    if (stats?.denomination) {
      setSelectedDenomination(stats.denomination);
    }
  }, [stats?.denomination]);

  const handleSaveDenomination = async () => {
    if (!userId || !selectedDenomination) return;

    setIsSavingDenomination(true);
    setDenominationSaved(false);

    try {
      await updateDenomination(userId, selectedDenomination);
      onUpdate();
      setDenominationSaved(true);
      // Hide success message after 5 seconds
      setTimeout(() => setDenominationSaved(false), 5000);
    } catch (error) {
      console.error("Failed to update denomination:", error);
    } finally {
      setIsSavingDenomination(false);
    }
  };

  return (
    <Card className="mx-auto max-w-2xl mt-6">
      <CardHeader>
        <CardTitle>Theological Preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {denominationSaved && (
          <Alert className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertTitle className="text-green-800 dark:text-green-200">
              Saved successfully
            </AlertTitle>
            <AlertDescription className="text-green-700 dark:text-green-300">
              Your theological preference has been updated. Parrot will now
              respond according to your tradition&apos;s distinctives.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold mb-1">Denomination</p>
            <p className="text-sm text-muted-foreground">
              This helps Parrot tailor responses to your tradition&apos;s
              secondary doctrines (baptism, church governance, spiritual gifts,
              etc.). All responses remain anchored in the essentials we hold in
              common.
            </p>
          </div>

          <Select
            value={selectedDenomination}
            onValueChange={setSelectedDenomination}
          >
            <SelectTrigger className="w-full sm:w-[300px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DENOMINATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedDenomination &&
            (() => {
              // Map hyphenated DB format to underscore export format
              const denominationKey = selectedDenomination.replace(
                /-/g,
                "_"
              ) as keyof typeof denominations;
              return (
                denominations[denominationKey] && (
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem
                      value="denomination-preview"
                      className="border-none"
                    >
                      <AccordionTrigger className="text-sm font-semibold text-muted-foreground hover:no-underline py-2">
                        Doctrinal Distinctives
                      </AccordionTrigger>
                      <AccordionContent className="pt-2">
                        <div className="p-3 bg-muted/50 rounded-md text-sm space-y-2">
                          <div className="text-muted-foreground leading-relaxed">
                            <MarkdownWithBibleVerses
                              content={denominations[denominationKey]}
                            />
                          </div>
                          <Link
                            href="/doctrinal-statement"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                          >
                            See full doctrinal statement{" "}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )
              );
            })()}

          <Button
            onClick={handleSaveDenomination}
            disabled={
              selectedDenomination ===
                (stats?.denomination || "reformed-baptist") ||
              isSavingDenomination
            }
            className="w-full sm:w-auto"
          >
            {isSavingDenomination ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
