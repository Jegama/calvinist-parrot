---
applyTo: "app/church-finder/**"
---
# Church Finder Guidance
- Creation triggers evaluation in [utils/churchEvaluation.ts](../../utils/churchEvaluation.ts): Tavily crawl → concurrent Gemini extraction → post-processing.
- Normalize doctrine data via [lib/churchMapper.ts](../../lib/churchMapper.ts); core doctrines in columns, secondary/tertiary in JSON.
- Enforce badge allowlist via [utils/badges.ts](../../utils/badges.ts); sort list with `sortChurchesByPriority` in [app/api/churches/route.ts](../../app/api/churches/route.ts).
- Requires `TAVILY_API_KEY` and `GEMINI_API_KEY` in environment; see [.env.template](../../.env.template).
