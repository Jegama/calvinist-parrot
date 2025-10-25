"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner"
import type { ChurchDetail, ChurchSearchResult } from "@/types/church";
import { createChurch, searchChurches } from "@/app/church-finder/api";

type ChurchDiscoveryPanelProps = {
  onChurchCreated: (church: ChurchDetail) => void;
};

export function ChurchDiscoveryPanel({ onChurchCreated }: ChurchDiscoveryPanelProps) {
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [searchResults, setSearchResults] = useState<ChurchSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [creationError, setCreationError] = useState<string | null>(null);
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);

  const searchMutation = useMutation({
    mutationFn: async () => {
      const trimmedCity = city.trim();
      if (!trimmedCity) {
        throw new Error("City is required for search");
      }
      const results = await searchChurches({ city: trimmedCity, state: state.trim() || undefined });
      return results;
    },
    onSuccess: (results) => {
      setSearchError(null);
      setSearchResults(results);
    },
    onError: (error: Error) => {
      setSearchError(error.message || "Unable to search right now");
      setSearchResults([]);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (websiteUrl: string) => {
      if (!websiteUrl.trim()) {
        throw new Error("Website is required");
      }
      const church = await createChurch({ website: websiteUrl.trim() });
      return church;
    },
    onSuccess: (church) => {
      setCreationError(null);
      setWebsite("");
      setEvaluatingId(null);
      onChurchCreated(church);
    },
    onError: (error: Error) => {
      setCreationError(error.message || "Unable to add church right now");
      setEvaluatingId(null);
    },
  });

  const handleEvaluateFromSearch = (result: ChurchSearchResult) => {
    if (!result.website) return;
    setEvaluatingId(result.id);
    setCreationError(null);
    createMutation.mutate(result.website);
  };

  return (
    <Card className="border border-border bg-card/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold text-foreground">Discover & add churches</CardTitle>
        <CardDescription>
          Search for churches by city using OpenStreetMap data, then evaluate and add a church by entering its website.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground">Evaluate a church by website</h3>
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://examplechurch.org"
              aria-label="Church website"
            />
            <Button
              type="button"
              onClick={() => createMutation.mutate(website)}
              disabled={createMutation.status === "pending" || !website.trim()}
              className="md:w-48"
            >
              {createMutation.status === "pending" ? <Spinner /> + " Evaluating…" : "Evaluate & add"}
            </Button>
          </div>
          {creationError ? <p className="text-sm text-red-500">{creationError}</p> : null}
          <p className="text-xs text-muted-foreground">
            We will crawl the church website with Tavily, evaluate its doctrines with our LLM pipeline, and store the results in
            the directory.
          </p>
        </section>

        <Separator />

        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground">Search by city</h3>
          <div className="grid gap-3 md:grid-cols-[2fr,1fr,auto]">
            <Input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="City (e.g., Houston)"
              aria-label="City name"
            />
            <Input
              value={state}
              onChange={(event) => setState(event.target.value)}
              placeholder="State (optional)"
              aria-label="State name"
            />
            <Button type="button" onClick={() => searchMutation.mutate()} disabled={searchMutation.status === "pending"}>
              {searchMutation.status === "pending" ? <Spinner /> + " Searching…" : "Search"}
            </Button>
          </div>
          {searchError ? <p className="text-sm text-red-500">{searchError}</p> : null}
          {searchResults.length > 0 ? (
            <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
              <p className="mb-3 font-semibold text-foreground">
                Found {searchResults.length} {searchResults.length === 1 ? "result" : "results"}
              </p>
              <ul className="space-y-3">
                {searchResults.map((result) => (
                  <li key={result.id} className="rounded-md border border-border bg-card p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{result.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {result.address.city || "Unknown city"}, {result.address.state || "Unknown state"}
                        </p>
                        {result.displayName && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{result.displayName}</p>
                        )}
                        {result.website ? (
                          <a
                            href={result.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline mt-1 inline-block"
                          >
                            {result.website}
                          </a>
                        ) : (
                          <p className="text-xs text-muted-foreground/60 italic mt-1">No website available</p>
                        )}
                      </div>
                      {result.website && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleEvaluateFromSearch(result)}
                          disabled={evaluatingId === result.id}
                          className="shrink-0"
                        >
                          {evaluatingId === result.id ? <Spinner /> + " Evaluating…" : "Evaluate"}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <Separator />

      </CardContent>
    </Card>
  );
}
