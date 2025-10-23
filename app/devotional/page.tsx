// app/devotional/page.tsx

"use client";

import React, { useEffect, useState, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownWithBibleVerses } from '@/components/MarkdownWithBibleVerses';
import { BibleVerseText } from '@/components/BibleVerseText';

interface DevotionalData {
    bible_verse: string;
    title: string;
    devotional: string;
}

export default function DevotionalPage() {
    const [data, setData] = useState<DevotionalData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const hasFetched = useRef(false);

    useEffect(() => {
        // Prevent double-fetch in dev mode (React Strict Mode)
        if (hasFetched.current) return;
        hasFetched.current = true;

        async function getDevotional() {
            try {
                const res = await fetch("/api/devotional-generation");
                const json = await res.json();
                
                if (json.error) {
                    setError(json.error);
                } else {
                    setData({
                        bible_verse: json.bible_verse,
                        title: json.title,
                        devotional: json.devotional,
                    });
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        }

        getDevotional();
    }, []);

    if (error) {
        return (
            <Card className="max-w-2xl mx-auto mt-8 mb-8">
                <CardContent className="pt-6">
                    <p className="text-destructive">Error: {error}</p>
                </CardContent>
            </Card>
        );
    }

    if (isLoading || !data) {
        return (
            <Card className="max-w-2xl mx-auto mt-8 mb-8">
                <CardHeader>
                    <p className="text-lg text-muted-foreground">Loading today&apos;s devotional...</p>
                    <Skeleton className="h-8 w-3/4" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <div className="pt-4 space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-4/5" />
                    </div>
                    <div className="pt-4 space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    const { bible_verse, title, devotional } = data;

    return (
        <Card className="max-w-2xl mx-auto mt-8 mb-8">
            <CardHeader>
                <CardTitle className="text-2xl font-bold">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <BibleVerseText reference={bible_verse} />
                <p> - {bible_verse} (BSB)</p>
                <br />
                <MarkdownWithBibleVerses content={devotional} />
            </CardContent>
        </Card>
    );
}
