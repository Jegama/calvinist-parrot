---
applyTo: "app/church-finder/**"
---

# Church Finder Guidance

## AI Evaluation Pipeline
- Creation triggers evaluation in `utils/churchEvaluation.ts`: Tavily crawl → concurrent Gemini extraction → post-processing.
- Requires `TAVILY_API_KEY` and `GEMINI_API_KEY` in environment; see `.env.template`.

## Data Normalization
- Normalize doctrine data via `lib/churchMapper.ts`: core doctrines in columns, secondary/tertiary in JSON.
- Enforce badge allowlist via `utils/badges.ts`; sort list with `sortChurchesByPriority` in `app/api/churches/route.ts`.
- Badge metadata in `lib/references/badges.json`; secondary difference badges in `lib/schemas/church-finder.ts`.

## UI Patterns
- Components in `components/` folder: `ChurchList`, `ChurchDetailDialog`, `ChurchForm`, `FilterPanel`.
- Fetch all matching churches server-side (`SERVER_PAGE_SIZE = 50`), paginate client-side (`CLIENT_PAGE_SIZE = 10`).
- Follow standard pagination pattern (see copilot-instructions.md); scroll to list top on page change.
- Status styles use custom CSS classes: `status--recommended`, `status--info`, `status--warning`, `status--danger`, `status--confessional`.
- Badge styles: `badge--neutral`, `badge--red-flag`, `badge--info`.

## API Patterns
- Query keys follow pattern: `["churches", filters]` for cache invalidation.
- Use `api.ts` for typed API helpers.