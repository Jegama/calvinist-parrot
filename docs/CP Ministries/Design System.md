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

### 4.1 Header

- Container: `.app-header` with Cream background (light) or dark card (dark).
- Text: Deep Teal in light; foreground in dark.
- Separator: `.header-separator` uses accent tint in light, border in dark.
- Behavior: graceful scroll shrink; liquid-glass variant available.

### 4.2 Buttons

- Primary: `bg-primary text-primary-foreground` with focus `ring`.
- Accent: `bg-accent text-accent-foreground` for secondary CTAs.
- Outline/Secondary: use component variants from shadcn base.
- States: hover = slightly darker fill; disabled = reduced opacity + no shadow.

### 4.3 Forms & Inputs

- Inputs: `bg-background`/`bg-card`, `border-border`, focus `ring`.
- Labels: `text-foreground/80`; helper text uses `muted-foreground`.

### 4.4 Cards

- Default: `bg-card text-card-foreground` with subtle shadow and radius.
- Variants: emphasize sections with border or accent bar if needed.

### 4.5 Status & Alerts

- Use utility classes:
  - Confessional: `.status--confessional`
  - Recommended: `.status--recommended`
  - Info: `.status--info`
  - Warning: `.status--warning` (Warm Gold background; dark readable text)
  - Danger: `.status--danger`

### 4.6 Badges/Chips

- `.badge--neutral` for default labels.
- `.badge--red-flag` for red-flag markers.

### 4.7 Chat Bubbles

- User: `bg-user-message text-user-message-foreground` (Sage)
- Parrot: `bg-parrot-message text-parrot-message-foreground` (Deep Blue)
- Maintain adequate padding and max-width for readability (~60–70ch max for prose).

### 4.8 Sidebar Navigation

- Buttons: `.sidebar-button` with hover tint and active Mint background.
- Colors: use `sidebar.*` tokens for background, foreground, accents, borders, ring.

### 4.9 Tables & Data

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
- Parrot bubble: `className="bg-parrot-message text-parrot-message-foreground"`
