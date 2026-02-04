---
applyTo: "app/api/kids-discipleship/**"
---
# Kids Discipleship API Guidance

- Use `lib/auth.ts` (`requireAuthenticatedUser`) and verify household access via `assertHouseholdAccess` from `lib/householdService.ts`.
- Child members are `prayerMember` records with `isChild: true`; always verify the child belongs to the user's household space.
- Stream NDJSON in `/api/kids-discipleship/logs` POST with event types: `entry_created`, `progress`, `call1_complete`, `call2_complete`, `done`, `error`.
- Use `utils/kids-discipleship/llm.ts` for AI calls (`runKidsCall1`, `runKidsCall2`); persist via `storeKidsAIOutput` with tag flattening.
- Call 1 generates shepherding reflection; Call 2 generates tags and prayer focus suggestions.
- Prompts and schemas live in `lib/prompts/kids-discipleship.ts` and `lib/schemas/kids-discipleship.ts`.
- Pagination: limit ≤ 50; use consistent query patterns across logs, monthly-vision, and annual-plan endpoints.
- Monthly vision uses `yearMonth` format (YYYY-MM); annual plan uses year string.
- Prayer focus aggregates stats from recent logs (last 30 days by default) for dashboard display.
