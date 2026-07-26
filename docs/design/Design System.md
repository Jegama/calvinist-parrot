# Calvinist Parrot – Design System

This design system formalizes the Brand Identity and translates it into practical tokens, components, and usage guidelines for designers and developers.

Links:
- Brand Identity: ./Brand%20Identity.md
- Color System Mapping: ./Color%20System%20Mapping.md

---

## 1 Principles

- Faithfulness: Echo Scripture clearly; avoid novelty for its own sake.
- Freedom: Simple, generous, and open—no dark patterns or paywalls.
- Fellowship: Hospitable UI, respectful tone, multilingual readiness.
- Futurism: Modern, performant, and accessible by default.

---

## 2 Design Foundations

### 2.1 Color System (Core DNA)

Core brand colors and their roles:
- Deep Teal (#004D4D) – Accent for headings/links; trustworthy anchor
- Deep Blue (#004D70) – Primary actions and parrot messages
- Cream (#F5EEDC) – Default light background and large surfaces
- Sage Green (#A3B18A) – User messages, soft success/education
- Warm Gold (#FFD166) – Highlights, warnings, gentle emphasis

Supporting accents (use sparingly):
- Royal Purple (#5D4777) – Special emphasis, charts
- Mint Green (#5ABFB1) – Sidebar active states, subtle accent

Implementation:
- Use semantic CSS variables and Tailwind mappings defined in `app/globals.css` and `tailwind.config.ts`.
- Never hardcode hex values in components. Prefer semantic classes (e.g., `bg-primary`, `text-accent`).

Dark mode guidance:
- Foreground text switches to near-white, backgrounds to deep charcoal.
- Primary/Accent hues are lightened for contrast (see Color System Mapping).
- Maintain hue relationships across modes; avoid different hues between themes.

Accessibility:
- Ensure AA contrast (4.5:1 normal, 3:1 large). Avoid Warm Gold for small text on light backgrounds.

### 2.2 Typography

Recommended pairing:
- Headings: Source Serif 4 (variable)
- Body/UI: Inter (variable)

Current implementation:
- Inter (variable) and Source Serif 4 (variable) are loaded in `app/layout.tsx` and applied via CSS variables (`--font-sans`, `--font-serif`).
- As typographic fallbacks for headings, we load Lora and Spectral at 600 to preserve weight if Source Serif 4 is unavailable.
- Fallback order for headings: Source Serif 4 → Lora → Spectral → generic serif.
- `body` uses Inter; `h1–h6` use the serif stack by default (see `app/globals.css`).

Usage guidelines:
- Heading weights: 600, with slight negative letter-spacing on H1/H2 (-0.5% to -1%).
- Body/UI: Inter 400–500. Line-height 1.6–1.7 for articles; 1.4–1.5 for UI.
- Numerals: Oldstyle for prose; tabular lining for data tables.
- Fallback stacks (implemented):
  - Serif (headings): Source Serif 4 → Lora → Spectral → serif
  - Sans (body/UI): Inter → sans-serif

Type scale (suggested):
- Display-1: clamp(2.25rem, 2vw + 1.5rem, 3rem)
- H1: 2rem; H2: 1.5rem; H3: 1.25rem; Body: 1rem; Small: 0.875rem

### 2.3 Spacing & Layout

- Spacing uses Tailwind’s scale by default (`.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16`).
- Container widths: rely on Tailwind breakpoints; keep ~66–72ch measure for long-form text.
- Grid: prefer 12-column grids for complex layouts; 4/8/12 for responsive design.

### 2.4 Elevation & Radius

- Radius: `--radius` (default 1rem) maps to `rounded-lg`, with md/sm derived in Tailwind config.
- Shadows: subtle elevation for cards; increase opacity in dark mode sparingly.

### 2.5 Motion

- Easing: `ease-out` for entrances, `ease-in` for exits.
- Durations: 150–250ms for micro-interactions, 300–400ms for overlays.
- Reduce motion: honor `prefers-reduced-motion`—disable non-essential animations.

### 2.6 Iconography & Imagery

- Icons: clean, modern line icons (parrot, Bible, globe, church, open lock, code/AI).
- Photography: warm, candid, multicultural; avoid sterile stock looks.

---

## 3 Tokens

Defined in CSS variables (HSL) and exposed via Tailwind semantic colors.

Key tokens (light theme):
- Backgrounds: `--background`, `--card`, `--popover`, `--sidebar-background`
- Foregrounds: `--foreground`, `--card-foreground`, `--popover-foreground`
- Brand: `--primary` (Deep Blue), `--accent` (Deep Teal)
- Messaging: `--user-message` (Sage), `--parrot-message` (Deep Blue)
- System: `--success`, `--destructive`, `--warning`, `--info`, `--ring`, `--border`, `--input`
- Charts: `--chart-1..5` (Gold, Teal, Purple, Sage, Mint)

Dark tokens adjust for contrast (see Color System Mapping for exact values).

Tailwind mappings (examples):
- `bg-primary` -> `--primary`, `text-primary-foreground`
- `bg-accent` -> `--accent`, `text-accent-foreground`
- `bg-user-message` / `bg-parrot-message`
- `text-success`, `text-destructive`, `bg-card`, `text-foreground`
- Sidebar namespace: `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`

Do not invent new tokens ad hoc; extend the semantic set consistently.

---

## 4 Components

Patterns below reference tokens and Tailwind utilities already configured.

### 4.1 Global Header

- Container: `.app-header` with Cream background (light) or dark card (dark).
- Text: Deep Teal in light; foreground in dark.
- Separator: `.header-separator` uses accent tint in light, border in dark.
- Behavior: graceful scroll shrink; liquid-glass variant available.

### 4.2 Page Headers (Feature Pages)

All main feature pages use a standardized header pattern for consistency:

```tsx
<header className="mb-8">
  <div className="flex flex-col gap-4 mb-4 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Page Title</h1>
      <p className="text-muted-foreground">Subtitle or description</p>
    </div>
    <Button className="w-full sm:w-auto">Primary Action</Button>
  </div>
</header>
```

**Structure:**
- Semantic `<header>` element with `mb-8` bottom margin
- Responsive flex container with `gap-4` and `mb-4`
- Title section on left, actions on right (stacks on mobile)
- H1: `text-3xl font-serif font-bold text-foreground mb-2` (3xl = 1.875rem)
- Subtitle: `text-muted-foreground` (default body size)
- Action buttons: `w-full sm:w-auto` for responsive behavior

**Container requirements:**
- Parent should have `py-8` for vertical rhythm
- Horizontal padding: `px-4 sm:px-6` or use container classes

**Examples in codebase:**
- Journal: `/app/journal/page.tsx`
- Prayer Tracker: `/app/prayer-tracker/page.tsx`
- Church Finder: `/app/church-finder/page.tsx`
- LLM Dashboard: `/app/llm-evaluation-dashboard/dashboard-client.tsx`

### 4.3 Buttons

- Primary: `bg-primary text-primary-foreground` with focus `ring`.
- Accent: `bg-accent text-accent-foreground` for secondary CTAs.
- Outline/Secondary: use component variants from shadcn base.
- States: hover = slightly darker fill; disabled = reduced opacity + no shadow.
- Responsive sizing: Use `w-full sm:w-auto` for buttons in headers/toolbars.

### 4.4 Forms & Inputs

- Inputs: `bg-background`/`bg-card`, `border-border`, focus `ring`.
- Labels: `text-foreground/80`; helper text uses `muted-foreground`.
- Long-form textareas should auto-grow until they reach a viewport-aware ceiling, then scroll internally. Use the shared `useAutoGrowingTextarea` behavior instead of fixed heights.
- The New Journal Entry dialog keeps its header and action footer visible, lets the middle region scroll, and caps the textarea at `min(560px, 42dvh)` with a 200px minimum. This prevents long entries from pushing Cancel or Save Entry outside small phone viewports.

### 4.5 Cards

- Default: `bg-card text-card-foreground` with subtle shadow and radius.
- Variants: emphasize sections with border or accent bar if needed.

### 4.6 Status & Alerts

- Use utility classes:
  - Confessional: `.status--confessional`
  - Recommended: `.status--recommended`
  - Info: `.status--info`
  - Warning: `.status--warning` (Warm Gold background; dark readable text)
  - Danger: `.status--danger`

### 4.7 Badges/Chips

- `.badge--neutral` for default labels.
- `.badge--red-flag` for red-flag markers.

### 4.8 Chat Bubbles

- User: `bg-user-message text-user-message-foreground` (Sage)
- Long-form Parrot answers: `bg-card text-card-foreground` with a subtle `border-border` edge. Keep the prose measure near `66–72ch`; this limits line length, never total answer length.
- `bg-parrot-message text-parrot-message-foreground` (Deep Blue) remains available for legacy or compact assistant bubbles, but it is not the preferred surface for long-form answers.
- Composer: `bg-input-bg border-input` with subtle elevation so it remains distinct from the Cream page and legible in dark mode. The landing composer is the entry screen’s visual anchor: it starts at 144px and auto-grows to `min(560px, 60vh)`. The in-conversation composer starts at 72px and auto-grows to `min(200px, 40vh)`.
- Place message actions immediately outside both user and Parrot surfaces. Use icon-only controls with accessible names and tooltips to keep the transcript visually quiet.
- Keep user and assistant content wrapped with `MarkdownWithBibleVerses` so headings, lists, tables, code, links, and Bible popovers retain their semantics.
- The landing disclaimer is exactly: “The Parrot is not a substitute for your own study, prayer, or pastoral counsel.”
- The in-conversation disclaimer is exactly: “The Parrot can make mistakes. Check important claims against Scripture and your elders/pastors.” Render it smaller than normal helper text.
- Copy defaults to Formatted for Word and also offers Markdown and Plain text. All three formats resolve internal links to absolute URLs; selected rich text preserves semantic HTML with a plain-text fallback.
- Editing a user message opens a clearly differentiated confirmation inset before creating a new conversation branch. The original conversation remains unchanged.
- Denominational context controls explain what the context means before offering an explicit profile link; clicking the control must not navigate immediately.

### 4.8.1 Chat Responsive Layout

- The landing hero parrot is visible at widths of 390px and above and hidden below 390px.
- Feature shortcuts stay anchored at the bottom of the landing content and remain tablet/phone-only with `lg:hidden landscape:hidden`.
- Preserve the established shortcut icon set: Material Symbols `candle` and `folded_hands`, plus Lucide `BookOpen`, `Sprout`, and `Church`.
- In light mode, use three related but distinct surfaces: Deep Cream for the sidebar, Off-White for the chat toolbar, and Cream for the main content. Reinforce their separation with the warm neutral sidebar border and subtle token-derived toolbar shadow.

### 4.9 Sidebar Navigation

- Buttons: `.sidebar-button` with hover tint and active Mint background.
- Colors: use `sidebar.*` tokens for background, foreground, accents, borders, ring.
- In light mode, the sidebar uses a slightly deeper Cream and a warm neutral divider. Chat toolbars use the Off-White card surface so navigation, toolbar, and content remain distinct without introducing a new brand color.

### 4.10 Tables & Data

- Use `chart.*` tokens for consistent categorical color usage in data viz.
- Ensure data text contrast meets AA; avoid gold-on-cream combinations.

---

## 5 Accessibility

- Contrast: AA at minimum for text (4.5:1 normal, 3:1 large). Use token pairs designed for contrast.
- Focus: Always visible; use `--ring` with adequate thickness/offset.
- Motion: Respect `prefers-reduced-motion`.
- Internationalization: Choose fonts with broad coverage; avoid text baked into images.

---

## 6 Implementation Notes

- Tokens live in `app/globals.css`; Tailwind exposes them via semantic colors in `tailwind.config.ts`.
- Fonts are loaded in `app/layout.tsx` and applied in `app/globals.css`:
  - Body uses Inter (variable) via `--font-sans`.
  - Headings use Source Serif 4 (variable) with Lora and Spectral fallbacks via `--font-serif`, `--font-serif-lora`, `--font-serif-spectral`.
  - Use Tailwind `font-sans` and `font-serif` utilities for local overrides.
- Avoid hardcoded colors; prefer semantic utilities for theme safety.
- PWA/browser chrome colors: viewport `themeColor` uses Deep Blue `#004D70` in light mode and dark neutral `#1A1A1A` in dark mode; manifest uses `theme_color: #004D70` and `background_color: #F5EEDC`.

---

## 7 Governance & Contribution

- Propose changes via PR with before/after screenshots in light/dark modes.
- Update this document and the Color System Mapping when tokens or component styles change.
- Run lint/typecheck and visually verify components across key screens (home, chat, church finder, prayer tracker).

---

## 8 Quick Reference

- Primary CTA: `className="bg-primary text-primary-foreground"`
- Link/accent: `className="text-accent hover:text-accent/70"`
- Card: `className="bg-card text-card-foreground rounded-lg"`
- Success text: `className="text-success"`
- Warning chip: `className="status--warning"`
- User bubble: `className="bg-user-message text-user-message-foreground"`
- Long-form Parrot answer: `className="max-w-[72ch] bg-card text-card-foreground border border-border"`
- Legacy/compact Parrot bubble: `className="bg-parrot-message text-parrot-message-foreground"`
- Chat composer: `className="bg-input-bg border-input"`
