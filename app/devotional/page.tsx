// app/devotional/page.tsx

"use client";

import React, { useEffect, useState, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MarkdownWithBibleVerses } from '@/components/MarkdownWithBibleVerses';
import { BibleVerseText } from '@/components/BibleVerseText';

export default function DevotionalPage() {
    const [data, setData] = useState<{
        bible_verse: string;
        title: string;
        devotional: string;
    } | null>(null);

    const [error, setError] = useState<string | null>(null);
    const isLoadingRef = useRef(false);

    useEffect(() => {
        let mounted = true;

        async function getDevotional() {
            if (isLoadingRef.current) return; // Prevent multiple requests
            isLoadingRef.current = true;
            
            try {
                const res = await fetch("/api/devotional-generation", {
                    method: "POST",
                });
                
                if (!mounted) return;

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
                if (mounted) {
                    setError(err instanceof Error ? err.message : 'An error occurred');
                }
            } finally {
                if (mounted) {
                    isLoadingRef.current = false;
                }
            }
        }

        getDevotional();
        return () => { mounted = false; }
    }, []);

    if (error) {
        return <p>Error: {error}</p>;
    }

    if (!data) {
        return <p>Loading...</p>;
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
