# Color System Mapping

This document maps the Brand Identity colors to their usage in the application's CSS variables.

## Brand Color to CSS Variable Mapping

### Primary Colors

| Brand Color | Hex | HSL | CSS Variable | Usage in App |
|------------|-----|-----|--------------|--------------|
| **Deep Teal** | `#004D4D` | `180, 100%, 15%` | `--accent`<br>`--chart-2`<br>`.app-header text` | **Header text color**, links, accent elements, chart color |
| **Deep Blue** | `#004D70` | `199, 100%, 22%` | `--primary`<br>`--parrot-message`<br>`--ring`<br>`--sidebar-ring` | Primary buttons, Parrot chat bubbles, focus rings |
| **Warm Gold** | `#FFD166` | `42, 100%, 70%` | `--chart-1` | Charts, potential future highlight color |

### Accent Colors

| Brand Color | Hex | HSL | CSS Variable | Usage in App |
|------------|-----|-----|--------------|--------------|
| **Royal Purple** | `#5D4777` | `268, 25%, 37%` | `--chart-3` | Charts, potential future accent color |
| **Sage Green** | `#A3B18A` | `82, 21%, 62%` | `--user-message`<br>`--chart-4` | User chat bubbles, charts |
| **Mint Green** | `#5ABFB1` | `172, 43%, 55%` | `--sidebar-accent`<br>`--chart-5` | Sidebar active states, charts |

### Neutral Colors

| Brand Color | Hex | HSL | CSS Variable | Usage in App |
|------------|-----|-----|--------------|--------------|
| **Cream** | `#F5EEDC` | `42, 56%, 91%` | `--background`<br>`--popover`<br>`--sidebar-background`<br>`.app-header background` | Warm main background, sidebar, header background (matches main site) |
| **Off-White** | `#FAFAFA` | `0, 0%, 98%` | `--card` | Subtle card elevation |
| **Pure White** | `#FFFFFF` | `0, 0%, 100%` | `--primary-foreground`<br>`--accent-foreground`<br>`--parrot-message-foreground` | Text on colored buttons/elements |
| **Charcoal** | `#333333` | `0, 0%, 20%` | `--foreground`<br>`--card-foreground`<br>`--user-message-foreground`<br>`--sidebar-primary` | Body text, headings |
| **Light Gray** | `#E5E5E5` | `0, 0%, 90%` | `--border`<br>`--sidebar-border` | Borders, dividers |
| **Very Light Gray** | `#F5F5F5` | `0, 0%, 96%` | `--muted`<br>`--input`<br>`--secondary` | Muted backgrounds, input fields, secondary actions |

## Semantic Color Variables

These variables use the brand colors for specific semantic purposes:

| Variable | Purpose | Light Mode | Dark Mode |
|----------|---------|------------|-----------|
| `--success` | Success messages, positive feedback | `142, 50%, 45%` (green) | `142, 60%, 50%` (lighter green) |
| `--destructive` | Errors, destructive actions | `0, 70%, 50%` (red) | `0, 70%, 55%` (brighter red) |
| `--info` | Informational emphasis, neutral highlights | `180, 100%, 15%` (Deep Teal) | `180, 100%, 30%` (lighter Deep Teal) |
| `--warning` | Warnings and limited information | `42, 100%, 70%` (Warm Gold) | `42, 100%, 70%` (unchanged) |

## Dark Mode Adjustments

In dark mode, brand colors are adjusted for better contrast and readability:

- **Backgrounds**: 
  - Main background: Very dark charcoal `0, 0%, 10%`
  - Cards: Dark charcoal `0, 0%, 15%`
  - Sidebar: Darker `0, 0%, 8%`
- **Foregrounds**: Pure white (`0, 0%, 98%`) for optimal text readability on dark backgrounds
  - **Important**: Changed from cream to pure white to prevent eye strain on text-heavy screens
- **Brand Colors**: Adjusted for visibility on dark backgrounds
  - Primary: `199, 100%, 22%` → `199, 100%, 35%` (lighter Deep Blue)
  - Accent: `180, 100%, 15%` → `180, 100%, 30%` (lighter Deep Teal)
  - Sidebar Accent: `172, 43%, 55%` → `172, 45%, 45%` (adjusted Mint Green)
  - Focus ring: `--ring` becomes near-white `0, 0%, 98%` for stronger contrast
- **Message Bubbles**: Both inverted for consistency
  - **User Messages**: Darker Sage Green `82, 25%, 35%` with white text
  - **Parrot Messages**: Lighter Deep Blue `199, 100%, 35%` with white text
  - Creates consistent visual pattern (both have dark backgrounds with light text)
  - Better contrast and more elegant appearance
- **Header**: 
  - Dark card background `0, 0%, 15%` instead of cream
  - White text instead of Deep Teal for better readability
  - Stronger shadow for depth

## Special Component Classes

### PWA / Browser Chrome

- Light chrome (viewport `themeColor`): Deep Blue `#004D70` (brand primary) for strong status bar contrast on mobile browsers.
- Dark chrome (viewport `themeColor`): Dark neutral `#1A1A1A` to match the dark `--background` token.
- Manifest `theme_color`: Deep Blue `#004D70` (single value, applied to install/splash chrome on Android/Chrome).
- Manifest `background_color`: Cream `#F5EEDC` to align splash with the light background token.

### Header Components

| Class | Purpose | Light Mode | Dark Mode |
|-------|---------|------------|-----------|
| `.app-header` | Main header container | Cream background, Deep Teal text, subtle shadow | Dark card background, white text, stronger shadow |
| `.app-logo` | Logo text styling | 1.25rem, bold, tight spacing | Same (consistent) |
| `.header-separator` | Vertical separator in header | Deep Teal with 30% opacity | Standard border color |

### Sidebar Components

| Class | Purpose | Behavior |
|-------|---------|----------|
| `.sidebar-button` | Sidebar navigation items | Transparent with hover state |
| `.sidebar-button[data-active="true"]` | Active sidebar item | Mint Green background with text color |

Sidebar palette reference:

- Light mode: `--sidebar-accent: 172, 43%, 55%`, `--sidebar-primary: 0, 0%, 20%`, `--sidebar-ring: 199, 100%, 22%`
- Dark mode: `--sidebar-accent: 172, 45%, 45%`, `--sidebar-primary: 199, 100%, 35%`, `--sidebar-ring: 199, 100%, 35%`

## Usage Guidelines

### For Developers

When adding new UI elements, use these semantic variables instead of hardcoded colors:

```css
/* ✅ Good - Uses semantic variables */
.button {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}

/* ❌ Bad - Hardcoded colors */
.button {
  background: #004D70;
  color: white;
}
```

### Tailwind Classes

Use Tailwind's semantic color classes:

```tsx
// ✅ Good - Theme-aware
<div className="bg-primary text-primary-foreground">

// ❌ Bad - Hardcoded
<div className="bg-blue-600 text-white">
```

### Color Hierarchy

1. **Primary** (Deep Blue): Main actions, CTAs, Parrot messages
2. **Accent** (Deep Teal): Links, secondary emphasis
3. **Success** (Green): Positive feedback, completed actions
4. **Destructive** (Red): Errors, destructive actions
5. **Secondary/Muted** (Gray): Background elements, less important content

## Future Enhancements

Consider adding these semantic variables if needed:

- `--highlight` (Royal Purple) - For special emphasis

## Testing Checklist

When making color changes or adding new components:

- [ ] Test in both light and dark modes using the theme toggle
- [ ] Verify color contrast meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text)
- [ ] Check readability of text on colored backgrounds
- [ ] Ensure brand identity colors are maintained (Deep Teal, Deep Blue, Sage Green)
- [ ] Test with browser's developer tools color vision deficiency simulator
- [ ] Verify hover and active states are visible in both themes
- [ ] Check that shadows and borders are visible in both modes
- [ ] Ensure sidebar active states use Mint Green (`--sidebar-accent`)
- [ ] Confirm header styling matches main Calvinist Parrot Ministries site aesthetic

## Quick Reference: Common Patterns

### Headers and Navigation
```tsx
// Header with logo
<header className="app-header">
  <span className="app-logo">Calvinist Parrot</span>
</header>

// Navigation links (auto-styled by .app-header)
<nav>
  <Link href="/page">Link Text</Link>
</nav>
```

### Buttons
```tsx
// Primary action button
<Button className="bg-primary text-primary-foreground">Primary Action</Button>

// Secondary/outline button (uses theme-aware styling)
<Button variant="outline">Secondary Action</Button>

// Accent button (e.g., Register)
<Button className="bg-accent text-accent-foreground">Register</Button>
```

### Message Bubbles (Chat Interface)
```tsx
// User message
<div className="bg-user-message text-user-message-foreground">User content</div>

// Parrot/AI message
<div className="bg-parrot-message text-parrot-message-foreground">AI response</div>
```

### Cards and Containers
```tsx
// Standard card (subtle elevation)
<Card>Content here</Card>

// Card with explicit styling
<div className="bg-card text-card-foreground">Custom card</div>
```

### Status Messages
```tsx
// Success message
<p className="text-success">Operation completed successfully</p>

// Error/destructive message
<p className="text-destructive">An error occurred</p>
```

### Separators
```tsx
// Standard separator
<Separator />

// Header separator (visible in both modes)
<Separator className="header-separator" />
```

### Status Utilities

These utility classes provide consistent, theme-aware treatments for status chips and alerts using the semantic variables:

- `.status--confessional`, `.status--recommended`, `.status--info`, `.status--warning`, `.status--danger`
- Text-color helpers: `.status-text--confessional`, `.status-text--recommended`, `.status-text--info`, `.status-text--warning`, `.status-text--danger`

Use them for badges, chips, and alert surfaces where a quick, branded status treatment is needed.

### Liquid Glass Effects

Optional frosted-glass aesthetics aligned with brand tones:

- `.liquid-glass-header`: frosted, translucent header with subtle inner glow; adapts to dark mode.
- `.liquid-glass-pill`: compact frosted bar (e.g., mobile chat header) with rounded pill shape; adapts to dark mode.
