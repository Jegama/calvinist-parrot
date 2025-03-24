// app/api/devotional-generation/route.ts

export const maxDuration = 60;

import {
    getDevotionalId,
    findDevotional,
    generateDevotional,
    createDevotional
} from "@/utils/devotionalUtils";

export async function POST() {
    try {
        const now = new Date();
        const devotionalId = getDevotionalId(now);

        // Check DB first
        const existing = await findDevotional(devotionalId);

        if (existing) {
            return Response.json({
                title: existing.title,
                bible_verse: existing.bible_verse,
                devotional: existing.devotional_text,
            });
        }

        // Generate new devotional
        const structured = await generateDevotional(now);

        // Store in DB
        const created = await createDevotional(devotionalId, structured);

        return Response.json({
            bible_verse: created.bible_verse,
            title: created.title,
            devotional: created.devotional_text,
        });

    } catch (error) {
        console.error("Error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return Response.json({ error: message }, { status: 500 });
    }
}