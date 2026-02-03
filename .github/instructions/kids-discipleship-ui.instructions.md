---
applyTo: "app/kids-discipleship/**"
---
# Kids Discipleship UI Guidance

- Page structure: tabs per child (from household `prayerMember` with `isChild: true`), each tab shows 5 sections.
- Sections (in order): AnnualPlanSection, MonthlyVisionSection, LogsSection, PrayerFocusSection, MonthlyReviewSection.
- Wrap each section in `SectionErrorBoundary` for graceful error handling.
- Use progression state (`/api/kids-discipleship/progression-state`) to show guided setup flow for new users.
- LogsSection streams AI reflection progressively; display `entry_created` immediately, then update with `call1_complete` and `call2_complete`.
- Filter logs client-side after fetching all (avoids extra network calls when switching Nurture/Admonition/All tabs).
- Use per-filter pagination state to preserve page position when switching filters.
- Age utilities in `utils/ageUtils.ts` provide `formatAge`, `getAgeBracket`, and `AGE_BRACKET_CONFIG` for age-appropriate display.
- Category colors: Nurture uses `text-success`; Admonition uses `text-warning-foreground` (readable in both light/dark modes).
- Follow the standard pagination pattern from copilot-instructions.md with chevron icons and "X-Y of Z" display.
- TanStack Query keys follow pattern: `["kids-discipleship", "<endpoint>", memberId]` for cache invalidation.
