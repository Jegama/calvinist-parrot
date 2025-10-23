// app/api/devotional-generation/route.ts

export const maxDuration = 60;

import {
    getDevotionalId,
    findDevotional,
    generateDevotional,
    createDevotional
} from "@/utils/devotionalUtils";

export async function GET() {
    try {
        const now = new Date();
        const devotionalId = getDevotionalId(now);

        // Check DB first
        const existing = await findDevotional(devotionalId);

        if (existing) {
            // Devotional exists - cache it heavily since it won't change for the day
            return Response.json({
                title: existing.title,
                bible_verse: existing.bible_verse,
                devotional: existing.devotional_text,
            }, {
                headers: {
                    // Cache for 1 hour on CDN, stale for 23 hours (covers the whole day)
                    'Cache-Control': 's-maxage=3600, stale-while-revalidate=82800',
                }
            });
        }

        // Generate new devotional (edge case: before cron runs or cron failed)
        const structured = await generateDevotional(now);

        // Store in DB
        const created = await createDevotional(devotionalId, structured);

        // Return with shorter cache since this is newly generated
        return Response.json({
            bible_verse: created.bible_verse,
            title: created.title,
            devotional: created.devotional_text,
        }, {
            headers: {
                // Cache for 5 minutes initially, then revalidate to get proper long cache
                'Cache-Control': 's-maxage=300, stale-while-revalidate=86100',
            }
        });

    } catch (error) {
        console.error("Error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return Response.json({ error: message }, { status: 500 });
    }
}