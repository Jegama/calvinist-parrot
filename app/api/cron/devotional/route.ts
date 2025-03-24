// app/api/cron/devotional/route.ts

import { NextResponse } from 'next/server';
import {
    getDevotionalId,
    findDevotional,
    generateDevotional,
    createDevotional
} from "@/utils/devotionalUtils";

export const maxDuration = 60;

export async function GET(request: Request) {
    // Check for authorization
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const now = new Date();
        const devotionalId = getDevotionalId(now);

        // Check if we already have a devotional for today
        const existing = await findDevotional(devotionalId);

        // If devotional already exists, just return success
        if (existing) {
            return NextResponse.json({
                success: true,
                message: "Devotional already exists for today",
                id: devotionalId
            });
        }

        // Generate new devotional
        const structured = await generateDevotional(now);

        // Store in DB and get the ID
        await createDevotional(devotionalId, structured);

        return NextResponse.json({
            success: true,
            message: "Devotional generated successfully",
            id: devotionalId
        });

    } catch (error) {
        console.error("Error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
