# Internationalization (i18n) Plan for Calvinist Parrot

## Context

Calvinist Parrot is a 100% English-only Next.js 16 App Router application with ~22 page routes, ~39 API routes, ~45 components, and extensive AI-generated content (chat, journal reflections, devotionals, church evaluations). The goal is to make the entire app multilingual.

**Guiding principle:** The Gospel should be free (Matthew 10:8). All Bible translations used must be freely shareable. See [copy.church](https://copy.church/explain/importance/) for the philosophy behind this. All translations below are available on helloao.org's free API and hosted on ebible.org with open/public domain licenses.

**Target Languages (10 total):**

All translation IDs verified against `content/data/production-ready-top-10-languages.json` (sourced from `bible.helloao.org/api/available_translations.json`).

| Code | Language | Script | Dir | helloao.org Translation ID | Bible Translation | Rationale | Speakers |
|------|----------|--------|-----|---------------------------|-------------------|-----------|----------|
| `en` | English | Latin | LTR | `BSB` | Berean Standard Bible | copy.church 12/12 rating, public domain, modern, already in use | 1.5B |
| `es` | Spanish | Latin | LTR | `spa_rvg` | Santa Biblia Reina Valera Gómez | User's choice. Textus Receptus based, faithful to Reina-Valera tradition, 31,102 verses | 560M |
| `zh` | Chinese (Simplified) | CJK | LTR | `cmn_cu1` | 新标点和合本 (Chinese Union Version, Simplified) | The CUV is to Chinese Christianity what the KJV is to English: the standard for over a century. Simplified script reaches mainland China (1.1B). 31,021 verses, most complete. Public domain (1919 original) | 1.1B |
| `hi` | Hindi | Devanagari | LTR | `HINIRV` | इंडियन रिवाइज्ड वर्जन (Indian Revised Version) | Complete 66 books, 31,104 verses (most complete Hindi option). Modern revision of traditional Hindi Bible. IRV is an open-license project by Bridge Connectivity Solutions | 600M |
| `ar` | Arabic | Arabic | **RTL** | `arb_vdv` | الكتاب المقدس (Arabic Van Dyck) | The standard Arabic Protestant Bible since 1865. Universally recognized across Arabic-speaking churches. 31,104 verses, complete. Public domain | 420M |
| `fr` | French | Latin | LTR | `fra_lsg` | Louis Segond 1910 | The standard French Protestant Bible for over a century. Public domain. 31,170 verses. Universally recognized in French-speaking Reformed churches | 310M |
| `bn` | Bengali | Bengali | LTR | `ben_irv` | ইন্ডিয়ান রিভাইজড ভার্সন (Indian Revised Version) | Complete 66 books, 31,096 verses. Open-license IRV project. Bengali is 7th most spoken language globally | 270M |
| `pt` | Portuguese | Latin | LTR | `por_blj` | Bíblia Livre | Name literally means "Free Bible." Open/public domain, 31,102 verses, complete. Aligns perfectly with copy.church free Gospel philosophy | 260M |
| `ru` | Russian | Cyrillic | LTR | `rus_syn` | Синодальный перевод (Synodal Translation) | Only production-ready Russian option on helloao.org, and it's the right one: the undisputed standard Russian Bible since 1876. Public domain. 31,169 verses | 260M |
| `ur` | Urdu | Arabic | **RTL** | `urd_gvu` | کتابِ مقدّس (Urdu Geo Bible) | Urdu script RTL version (not romanized). 30,669 verses. Reaches Pakistan's 230M population. | 230M |

**RTL languages (2):** Arabic (`ar`) and Urdu (`ur`) both require full RTL layout support.

**Current state:** Zero i18n infrastructure. Hardcoded `lang="en"` in root layout, all UI strings English, no `proxy.ts`, no i18n library.

**Head starts:** `bookMappings.ts` already has Spanish Bible book names (lines 84-147). LLM prompt already says "Respond in the same language as the user's original question" (line 207 of `core.ts`).

**Approach:** AI-first translation with human theological review. Phased PRs.

---

## URL Strategy: Subdirectory Routing

**`calvinistparrot.com/es/`, `calvinistparrot.com/zh/`, `calvinistparrot.com/ar/`, etc.**

| Strategy | SEO | Verdict |
|----------|-----|---------|
| **Subdirectory `/es/`** | Best (consolidates domain authority, Google recommended) | **Chosen** |
| Query param `?lang=es` | Poor (duplicate content risk) | Rejected |
| Subdomain `es.calvinistparrot.com` | Fragmented authority | Rejected |
| Separate domain | Isolated authority, high cost | Rejected |

English URLs stay clean (`/` not `/en/`) via `localePrefix: 'as-needed'`.

---

## Library: next-intl

- Purpose-built for Next.js App Router, Server Component support
- ~2KB bundle, 931K+ weekly downloads, type-safe
- Edge Proxy (`proxy.ts`) for automatic locale detection from browser headers
- Supports RTL via `dir` attribute based on locale

---

## Special Considerations

### RTL Support (Arabic + Urdu)
- Set `dir="rtl"` on `<html>` element when locale is `ar` or `ur`
- Convert CSS to **logical properties** throughout the codebase:
  - `margin-left` -> `margin-inline-start`
  - `padding-right` -> `padding-inline-end`
  - `text-align: left` -> `text-align: start`
  - `float: left` -> `float: inline-start`
  - Flexbox/grid: Use `gap` and logical alignment
- Tailwind CSS 3.x supports logical properties via `ms-*` (margin-start), `me-*` (margin-end), `ps-*`, `pe-*`, `start-*`, `end-*` classes
- Some icons may need mirroring (arrows, navigation indicators)

### Non-Latin Font Support
- **Chinese:** Load **Noto Sans SC** (Simplified Chinese) from Google Fonts, only for `zh` locale
- **Bengali:** Load **Noto Sans Bengali** for `bn` locale
- **Hindi:** Load **Noto Sans Devanagari** for `hi` locale
- **Arabic + Urdu:** Load **Noto Sans Arabic** for `ar` and `ur` locales (Arabic script covers both)
- **Russian:** Inter already supports Cyrillic (add `subsets: ["latin", "cyrillic"]`)
- **French, Portuguese, Spanish:** Inter already supports Latin Extended (accented chars)
- **Strategy:** Only load non-Latin fonts for their respective locales to avoid unnecessary downloads

### Bible Verse Regex
Current regex (`[A-Z][a-zA-Z]+`) only matches Latin ASCII. Must support:
- Spanish/French/Portuguese accented chars: Génesis, Romanos, Salmos
- Chinese book names: 创世记, 罗马书
- Arabic/Urdu book names: التكوين, رومية
- Bengali: আদিপুস্তক, রোমীয়
- Cyrillic: Бытие, Римлянам
- Hindi (Devanagari): उत्पत्ति, रोमियों

**Strategy:** Per-locale regex patterns or a lookup-based approach instead of regex for non-Latin scripts.

---

## Phase 0: Infrastructure Foundation (PR #1)

**Goal:** Install next-intl, set up locale routing, restructure `app/` directory. English works identically to today. No visible changes.

### New files to create:

**`i18n/config.ts`**
```typescript
export const locales = ['en', 'es', 'zh', 'hi', 'ar', 'fr', 'bn', 'pt', 'ru', 'ur'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';
export const rtlLocales: Locale[] = ['ar', 'ur'];
```

**`i18n/request.ts`** - next-intl server config (loads JSON messages per locale)

**`i18n/routing.ts`** - Defines routing + exports locale-aware `Link`, `useRouter`, `usePathname`, `redirect`

**`proxy.ts`** - next-intl proxy/middleware with `localePrefix: 'as-needed'`, locale detection from `Accept-Language` header

**`messages/en.json`** - English base message file (start with ~100 key strings: nav, common, home, chat basics)

### Files to modify:

**`next.config.mjs`** - Wrap with `createNextIntlPlugin('./i18n/request.ts')`

**`app/layout.tsx`** - Becomes minimal root layout (no `<html>` tag, just `{children}`)

**New `app/[locale]/layout.tsx`** - Main layout:
- `<html lang={locale} dir={rtlLocales.includes(locale) ? 'rtl' : 'ltr'}>` (RTL for `ar` and `ur`)
- `NextIntlClientProvider` wrapping `AppProviders`
- `Header`, fonts, Vercel analytics
- Conditional CJK/Devanagari/Arabic font loading based on locale

### Directory restructure:
Move all 22 page routes under `app/[locale]/`:
```
app/[locale]/page.tsx                    <- app/page.tsx
app/[locale]/[chatId]/page.tsx           <- app/[chatId]/page.tsx
app/[locale]/journal/page.tsx            <- app/journal/page.tsx
app/[locale]/prayer-tracker/...          <- app/prayer-tracker/...
app/[locale]/church-finder/...           <- app/church-finder/...
app/[locale]/kids-discipleship/...       <- app/kids-discipleship/...
app/[locale]/devotional/page.tsx         <- app/devotional/page.tsx
app/[locale]/profile/...                 <- app/profile/...
app/[locale]/login/page.tsx              <- (etc.)
app/[locale]/register/page.tsx
app/[locale]/about/page.tsx
app/[locale]/doctrinal-statement/page.tsx
app/[locale]/forgot-password/page.tsx
app/[locale]/parrot-qa/page.tsx
app/[locale]/documentation-parrot-chat/page.tsx
app/[locale]/documentation-parrot-qa/page.tsx
app/[locale]/llm-evaluation-dashboard/...
```

API routes stay at `app/api/` (outside `[locale]`).

Each page gets `generateStaticParams` returning all locales.

**Font loading strategy in `app/[locale]/layout.tsx`:**
```typescript
// Always loaded (Latin + Cyrillic — covers en, es, fr, pt, ru)
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-sans" });
const sourceSerif = Source_Serif_4({ subsets: ["latin", "cyrillic"], variable: "--font-serif" });

// Conditionally loaded per locale (only imported when needed)
const notoSansSC = Noto_Sans_SC({ weight: ["400","600"], variable: "--font-cjk" });           // zh only
const notoSansBengali = Noto_Sans_Bengali({ weight: ["400","600"], variable: "--font-bengali" }); // bn only
const notoSansDevanagari = Noto_Sans_Devanagari({ weight: ["400","600"], variable: "--font-indic" }); // hi only
const notoSansArabic = Noto_Sans_Arabic({ weight: ["400","600"], variable: "--font-arabic" });     // ar + ur
```

**Verification:** `npm run build` passes. All existing English URLs work identically. No visible changes.

---

## Phase 1: Core UI String Extraction + Language Selector (PR #2)

**Goal:** Extract hardcoded strings from most-used components. Create Spanish message file. Add language selector to header.

### Message file structure (`messages/en.json`):
```json
{
  "common": { "loading", "error", "send", "cancel", "save", "delete", "back", "next", ... },
  "nav": { "chat", "devotional", "journal", "prayerTracker", "heritage", "churchFinder", "about", "labs", "login", "register", "more", "logout", "profile" },
  "home": { "subtitle": "What theological question do you have?", "placeholder": "Enter your question here...", "startChat": "Start Chat" },
  "chat": { "you", "parrot", "typePlaceholder", "loadingChat", "copyMarkdown", "markdownCopied", "toolProgress.*", "toolTitles.*", ... },
  "auth": { "loginTitle", "registerTitle", "email", "password", "forgotPassword", "noAccount", "hasAccount", ... },
  "seo": { "title", "description", "ogTitle", "ogDescription", ... }
}
```

### Priority components to convert:
1. **`components/Header.tsx`** (~260 lines) - Navigation labels, user dropdown menu
2. **`app/[locale]/page.tsx`** - Home page cards and feature links
3. **`app/[locale]/[chatId]/page.tsx`** - Chat UI (largest user-facing page)
4. **`components/LoginForm.tsx`**, **`RegisterForm.tsx`**, **`ForgotPasswordForm.tsx`** - Auth forms
5. **`components/chat-sidebar.tsx`** - Conversation list

### New component: `components/LanguageSelector.tsx`
- Dropdown in Header next to ThemeToggle
- Shows current locale flag/code, lists all 10 languages
- Uses `useRouter` from `i18n/routing.ts` to switch locale
- Persists choice to `userProfile.preferredLocale` if logged in

### Database migration:
```prisma
model userProfile {
  // ... existing fields
  preferredLocale  String?  @default("en")
}
```

### Replace all `next/link` imports with locale-aware `Link` from `i18n/routing.ts`.

### Create `messages/es.json` (AI-drafted, human-reviewed for theological terms)

**Verification:** Navigate to `/es/` - see Spanish UI. Toggle language selector. Auth flow works in Spanish.

---

## Phase 2: Bible Verse System Localization (PR #3)

**Goal:** Bible verse popovers show correct translation per locale.

### Key files to modify:

**New: `lib/i18n/bible-config.ts`**
All IDs verified against `content/data/production-ready-top-10-languages.json`:
```typescript
export const BIBLE_TRANSLATIONS: Record<string, { id: string; name: string; language: string }> = {
  en: { id: 'BSB',      name: 'Berean Standard Bible',                      language: 'eng' },
  es: { id: 'spa_rvg',  name: 'Santa Biblia Reina Valera Gómez',            language: 'spa' },
  zh: { id: 'cmn_cu1',  name: '新标点和合本 (Chinese Union Simplified)',      language: 'cmn' },
  hi: { id: 'HINIRV',   name: 'इंडियन रिवाइज्ड वर्जन (Indian Revised Version)',    language: 'hin' },
  ar: { id: 'arb_vdv',  name: 'الكتاب المقدس (Arabic Van Dyck)',            language: 'arb' },
  fr: { id: 'fra_lsg',  name: 'Louis Segond 1910',                          language: 'fra' },
  bn: { id: 'ben_irv',  name: 'ইন্ডিয়ান রিভাইজড ভার্সন (Bengali IRV)',            language: 'ben' },
  pt: { id: 'por_blj',  name: 'Bíblia Livre',                               language: 'por' },
  ru: { id: 'rus_syn',  name: 'Синодальный перевод (Synodal)',              language: 'rus' },
  ur: { id: 'urd_gvu',  name: 'کتابِ مقدّس (Urdu Geo Bible)',                 language: 'urd' },
};
```

**`components/BibleVerse.tsx`** (line 56): Replace `const translation = 'BSB'` with locale-aware lookup via `useLocale()`.

**`utils/bibleUtils.ts`** (lines 69-72): Bible verse regex strategy:
- For Latin/Cyrillic scripts: Update regex to Unicode property escapes (`\p{Lu}\p{L}+`)
- For CJK/Arabic/Devanagari: Use a **lookup-based approach** - maintain a map of book names per locale in `bookMappings.ts` and match against known names instead of relying on regex character classes
- Create `extractReferencesForLocale(text, locale)` that picks the right strategy

**`utils/bookMappings.ts`**: Already has Spanish (lines 84-147). Add Chinese, Hindi, Arabic, French, Bengali, Portuguese, Russian, Urdu book name mappings.

**Verification:** Click "Romanos 8:28" in Spanish locale -> shows RVG text. Click "罗马书 8:28" in Chinese locale -> shows CUV text. Click "رومية 8:28" in Arabic -> shows Van Dyck text.

---

## Phase 3: Expanded Locale Strategies (PR #4)

**Goal:** AI-generated content responds not just in the correct language, but with **culturally native** rhetoric, safety awareness, and apologetic sensitivity.

### Strategy: The "Locale Strategy" Object

We decouple **Voice** from **Denomination**.
- **Theology** comes from `core.ts` (Universal).
- **Voice & Context** comes from `locale-strategies.ts` (Local).

We remove the "Style Anchor" (Spurgeon/Sproul) from `core.ts` to prevent "Colonial Voice" issues. Instead, we inject a robust **Locale Strategy** that defines the voice, safety, and apologetic approach for each culture.

### New File: `lib/i18n/locale-strategies.ts`

```typescript
export interface LocaleStrategy {
  bibleDirective: string;         // "Respond in Spanish using RVG..."
  styleAnchor: string;            // The "Voice" (Sage, Teacher, Logician)
  culturalDirectives: string[];   // Honor/Shame, Harmony, etc.
  safetyGuardrails: string[];     // Legal warnings, persecution risks
  apologeticConstraints: string[];// Specific things NOT to do (don't attack Mary/Icons)
}

export const LOCALE_STRATEGIES: Record<string, LocaleStrategy> = {
  en: { // English (Default)
    bibleDirective: 'Respond entirely in English. Use Berean Standard Bible (BSB) references.',
    styleAnchor: "Emulate the illustrative warmth of Charles Spurgeon, the doctrinal precision of R.C. Sproul, and the pastoral plainness and steady gentleness of Alistair Begg.",
    culturalDirectives: [], // Standard Western context assumed in core prompt
    safetyGuardrails: [],
    apologeticConstraints: []
  },
  ar: { // Arabic
    bibleDirective: 'Respond entirely in Arabic. Use Arabic Van Dyck Bible references with Arabic book names (e.g., "رومية 8:28"). Note: text direction is right-to-left.',
    styleAnchor: "Emulate the illustrative warmth and storytelling depth of Middle Eastern Christian heritage (like the early Church Fathers). Speak with the dignity of a sage and the care of a shepherd.",
    culturalDirectives: [
      "Use Arab world examples; avoid U.S.-centric idioms.",
      "Respect 'Honor/Shame' culture: avoid direct, blunt correction that causes loss of face.",
      "Evangelism: Succinctly present God's holiness, human sin, Christ's work, and an invitation to repent and trust. Distinguish respect for persons from the exclusivity of Christ."
    ],
    safetyGuardrails: [
      "Acknowledge that conversion may be illegal/dangerous. Encourage private study/trusted mentors.",
      "Do not advise public confrontation with family if safety is at risk."
    ],
    apologeticConstraints: [
      "Do not disparage Islam, Muhammad, or the Quran.",
      "Focus on explaining Christian hope positively, not disproving Islam."
    ]
  },
  zh: { // Chinese
    bibleDirective: 'Respond entirely in Simplified Chinese. Use Chinese Union Version (和合本) Bible references with Chinese book names (e.g., "罗马书 8:28").',
    styleAnchor: "Speak with the wisdom, balance, and harmony of a respected teacher. Value clarity and order.",
    culturalDirectives: [
      "Respect 'Filial Piety' (Xiao): affirm honoring parents while prioritizing God.",
      "Value 'Harmony': avoid aggressive argumentation or conflict-heavy rhetoric."
    ],
    safetyGuardrails: [
      "Do not encourage illegal gatherings or political dissent.",
      "Be aware of restrictions on religious education for minors."
    ],
    apologeticConstraints: [
      "Frame Christianity as a universal truth, not a 'Western' religion.",
      "Respect ancestors as a cultural memory, checking only worship as idolatry."
    ]
  },
  ru: { // Russian
    bibleDirective: 'Respond entirely in Russian. Use Synodal Translation (Синодальный) Bible references with Russian book names (e.g., "Римлянам 8:28").',
    styleAnchor: "Speak with gravity, depth, and 'soul' (dusha). Avoid superficial cheerfulness. Emulate the seriousness of classic Russian literature.",
    culturalDirectives: [
      "Address questions with intellectual weight; avoid pragmatic 'life hacks'.",
      "Respect the deep cultural roots of Orthodoxy even when disagreeing doctrinally."
    ],
    safetyGuardrails: [
      "Avoid language that sounds like a foreign 'sect' or 'cult'.",
      "Focus on personal spirituality and historical truth."
    ],
    apologeticConstraints: [
      "Do not attack Icons or Church Fathers disrespectfully.",
      "Use Church Fathers (e.g., Chrysostom) to validate Protestant positions where possible."
    ]
  },
  hi: { // Hindi
    bibleDirective: 'Respond entirely in Hindi. Use Indian Revised Version (IRV) Bible references with Hindi book names (e.g., "रोमियों 8:28").',
    styleAnchor: "Speak with the warmth and respect of a wise elder or Guru. Be patient, relational, and story-driven.",
    culturalDirectives: [
      "Use honorifics and respectful language (Aap/Ji tone).",
      "Distinguish Christian concepts (Mukti, Prabhu) from Hindu equivalents.",
      "Evangelism: Focus on relationship and story. Avoid aggressive 'sales pitch' formatting.",
      "Respect the communal nature of decision making in Indian culture."
    ],
    safetyGuardrails: [
      "Be aware of anti-conversion laws in various regions.",
      "Do not encourage aggressive public proselytizing that invites mob violence.",
      "Advise caution regarding baptism in public settings if persecution is likely."
    ],
    apologeticConstraints: [
      "Do not attack idols aggressively; focus on Christ's supremacy.",
      "Strictly avoid any beef/cow-related illustrations or insensitivity.",
      "Frame Christianity as an ancient Asian faith, not a Western colonial import."
    ]
  },
  es: { // Spanish
    bibleDirective: 'Respond entirely in Spanish. Use Reina Valera Gómez (RVG) Bible references with Spanish book names (e.g., "Romanos 8:28").',
    styleAnchor: "Speak with pastoral warmth and relational closeness. Avoid sterile academic tones.",
    culturalDirectives: [
      "Respect the importance of family (Familismo).",
      "Address users with personal care.",
      "Evangelism: Emphasize a personal relationship with Christ over religious ritual."
    ],
    safetyGuardrails: [],
    apologeticConstraints: [
      "Do not attack the Virgin Mary. Focus on Christ's sufficiency, not her insufficiency.",
      "Avoid aggressive anti-Catholic rhetoric; focus on relationship vs religion.",
      "Treat Roman Catholic users as potential brothers/sisters who need clarity, not as enemies."
    ]
  }
  // Strategies for fr, pt, bn, ur defined similarly...
};

export function getLocalePromptDirective(locale: string): string {
  const strategy = LOCALE_STRATEGIES[locale] || LOCALE_STRATEGIES['en'];
  
  let directives = `\n# Cultural & Contextual Directives for ${locale}\n`;
  directives += `**Language & Bible Version:**\n${strategy.bibleDirective}\n\n`;
  directives += `**Style Anchor:** \n${strategy.styleAnchor}\n`;

  if (strategy.culturalDirectives.length > 0) {
    directives += `\n**Cultural Directives:**\n${strategy.culturalDirectives.map(d => `- ${d}`).join('\n')}\n`;
  }

  if (strategy.safetyGuardrails.length > 0) {
    directives += `\n**Safety & Legal Guardrails:**\n${strategy.safetyGuardrails.map(d => `- ${d}`).join('\n')}\n`;
  }

  if (strategy.apologeticConstraints.length > 0) {
    directives += `\n**Apologetic Constraints:**\n${strategy.apologeticConstraints.map(d => `- ${d}`).join('\n')}\n`;
  }

  directives += `\n**System Instruction:**\nMaintain identical theological precision to the core prompt. **All in-app feature links (/church-finder, /journal, etc.) must remain unchanged in the output.**\n`;

  return directives;
}
```

### Files to modify:

**`utils/buildParrotSystemPrompt.ts`**: 
- **Remove** any existing "Voice" directives from the core system prompt processing (e.g. Spurgeon references).
- **Append** the result of `getLocalePromptDirective(locale)` to the final system prompt.

**`app/api/parrot-chat/route.ts`**:
- Ensure `locale` is passed correctly to the builder.

**Verification:** 
- **Arabic:** Response avoids polemics, warns about safety, uses "Sage" voice.
- **Chinese:** Response values harmony, avoids political blockers, uses "Teacher" voice.
- **English/Spanish:** Retains classic warmth but adapted to culture.

---

## Phase 4: SEO & Metadata (PR #5)

**Goal:** hreflang tags, locale-specific metadata, multilingual sitemap.

### `lib/seo.ts` refactor:
Convert static `siteMetadata` to async `generateLocalizedMetadata(locale)` using `getTranslations`.

### Per-page hreflang in `alternates`:
```typescript
alternates: {
  languages: {
    'en': 'https://www.calvinistparrot.com/[path]',
    'es': 'https://www.calvinistparrot.com/es/[path]',
    'zh': 'https://www.calvinistparrot.com/zh/[path]',
    'hi': 'https://www.calvinistparrot.com/hi/[path]',
    'ar': 'https://www.calvinistparrot.com/ar/[path]',
    'fr': 'https://www.calvinistparrot.com/fr/[path]',
    'bn': 'https://www.calvinistparrot.com/bn/[path]',
    'pt': 'https://www.calvinistparrot.com/pt/[path]',
    'ru': 'https://www.calvinistparrot.com/ru/[path]',
    'ur': 'https://www.calvinistparrot.com/ur/[path]',
    'x-default': 'https://www.calvinistparrot.com/[path]',
  },
}
```

### Multilingual sitemap generation with `<xhtml:link rel="alternate">` entries.

### SEO message strings in each locale's JSON (title, description, OG tags, keywords).

**Verification:** Google Rich Results Test passes for both `/` and `/es/`. Lighthouse SEO score maintained.

---

## Phase 5: RTL Support & CSS Logical Properties (PR #6)

**Goal:** Arabic and Urdu layouts render correctly with full RTL support.

### Global CSS changes (`app/globals.css`):
- Audit all directional properties, convert to logical equivalents
- `margin-left/right` -> `margin-inline-start/end`
- `padding-left/right` -> `padding-inline-start/end`
- `border-left/right` -> `border-inline-start/end`
- `left/right` positioning -> `inset-inline-start/end`
- `text-align: left` -> `text-align: start`

### Tailwind class conversion across all components:
- `ml-*` -> `ms-*`, `mr-*` -> `me-*`
- `pl-*` -> `ps-*`, `pr-*` -> `pe-*`
- `left-*` -> `start-*`, `right-*` -> `end-*`
- `rounded-l-*` -> `rounded-s-*`, `rounded-r-*` -> `rounded-e-*`

### Icon mirroring:
- Navigation arrows, back buttons: mirror for RTL
- Use `[dir="rtl"] .icon-mirror { transform: scaleX(-1); }` or Tailwind's `rtl:` variant

### Component-specific RTL fixes:
- `components/chat-sidebar.tsx` - Sidebar position
- `components/Header.tsx` - Navigation order, dropdown alignment
- Chat message layout - User messages on correct side

**Verification:** Navigate to `/ar/` and `/ur/` - entire layout mirrors. Sidebar, navigation, chat messages, forms all render correctly RTL.

---

## Phase 6: Church Finder Internationalization (PR #7)

**Goal:** Add country support to church addresses and safely localize the church finder UI without breaking classification logic.

### 6a. Database: Add `country` to `churchAddress`

**File:** `prisma/schema.prisma`

The `churchAddress` model currently has `street1`, `street2`, `city`, `state`, `postCode`, `latitude`, `longitude` — but **no `country` field**. Everything assumes US.

```prisma
model churchAddress {
  id        String   @id @default(cuid())
  churchId  String
  street1   String?
  street2   String?
  city      String?
  state     String?
  postCode  String?
  country   String?  @default("US")  // NEW: ISO 3166-1 alpha-2 code
  latitude  Float?
  longitude Float?
  sourceUrl String?
  isPrimary Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  church    church   @relation(fields: [churchId], references: [id], onDelete: Cascade)
}
```

**Migration:** Add `country` column with default `"US"` so all existing records get backfilled.

**AI extraction prompt update** (`lib/prompts/church-finder.ts`): Add `country` to the address extraction schema (Call 1 - Basic Fields). The AI should infer country from the church website URL, address text, or phone number format.

### 6b. Church Finder Translation Safety Architecture

**CRITICAL PRINCIPLE: Enums and badge keys stay English. Translate at render time only.**

Here's the data flow and where translation happens:

```
AI Extraction (English) → Database (English enums + badge keys) → Frontend (translated labels)
       ↑ NEVER translate                ↑ NEVER translate              ↑ TRANSLATE HERE
```

**What stays English (never translated):**

| Layer | Value | Why |
|-------|-------|-----|
| Prisma enum | `RECOMMENDED`, `BIBLICALLY_SOUND_WITH_DIFFERENCES`, `LIMITED_INFORMATION`, `NOT_ENDORSED` | Database schema types |
| Prisma enum | `TRUE`, `FALSE`, `UNKNOWN` (CoreDoctrineStatus) | Database schema types |
| AI prompt badges | `"📜 Reformed"`, `"⚠️ Prosperity Gospel"`, `"🧭 Arminian"`, etc. | Matched verbatim by `filterAllowlistedBadges()` in `utils/badges.ts` |
| `badges.json` keys | Same badge strings | Used as lookup keys |
| Database `badges[]` column | Same badge strings | Stored after allowlist filtering |
| AI extraction prompts | All 6 Gemini extraction calls | Must return English badge text to pass filter |

**What gets translated (frontend render time only):**

| Component | Current Value | How to Translate |
|-----------|--------------|-----------------|
| Status titles in `STATUS_CONFIG` | `"Recommended"`, `"Not Endorsed"`, etc. | Move to `messages/{locale}.json` under `churchFinder.status.*` |
| Status descriptions | `"This church appears to be doctrinally sound..."` | Move to `messages/{locale}.json` |
| Badge descriptions | `badges.json` `description` field | Create `lib/references/badges-i18n/{locale}.json` with translated descriptions per badge key |
| Badge display names | Currently the key itself (e.g., "📜 Reformed") | Add `displayName` per locale in `badges-i18n/{locale}.json` |
| Core doctrine labels | `"Trinity"`, `"Gospel"`, `"Justification by Faith"` | Move to `messages/{locale}.json` under `churchFinder.doctrines.*` |
| UI labels | Form placeholders, buttons, section headers | Standard `useTranslations()` pattern |

**Example: Badge display with i18n**

```typescript
// lib/references/badges-i18n/es.json
{
  "📜 Reformed": { "displayName": "📜 Reformada", "description": "Esta iglesia se identifica con la teología reformada..." },
  "⚠️ Prosperity Gospel": { "displayName": "⚠️ Evangelio de la Prosperidad", "description": "Teología de la Palabra de Fe..." },
  "🧭 Arminian": { "displayName": "🧭 Arminiana", "description": "Esta iglesia se identifica con la soteriología arminiana..." }
}
```

```typescript
// In component: church-detail-dialog.tsx
import { useLocale } from 'next-intl';
import badgesEn from '@/lib/references/badges.json';
import badgesEs from '@/lib/references/badges-i18n/es.json';

function BadgeDisplay({ badgeKey }: { badgeKey: string }) {
  const locale = useLocale();
  const i18nBadges = locale === 'es' ? badgesEs : null;
  const displayName = i18nBadges?.[badgeKey]?.displayName ?? badgeKey; // Fallback to English key
  const description = i18nBadges?.[badgeKey]?.description ?? badgesEn[badgeKey]?.description;
  return <Badge>{displayName}</Badge>;
}
```

**This is safe because:**
- The English badge key is what gets stored in DB and matched by `filterAllowlistedBadges()`
- Translation happens only at the React component render layer
- If a locale file is missing a badge translation, it falls back to the English key
- The classification logic (`postProcessEvaluation`) never sees translated text

### 6c. Church finder search: country-aware

Update the church search/map components to support filtering by country:
- Add country dropdown to search form (or auto-detect from user locale)
- Map component (`app/church-finder/components/`) should center on user's country, not default to US
- Geoapify API already supports international geocoding

---

## Phase 7: Static Content & Remaining Feature Modules (PR #8-9)

**Goal:** Translate markdown pages and all remaining feature-specific components.

### Markdown content restructure:
```
content/
  en/pages/about/intro.md
  en/pages/about/footer.md
  en/pages/doctrinal-statement.md
  en/pages/church-finder/guide.md
  en/pages/church-finder/policy.md
  es/pages/...  (Spanish versions)
  zh/pages/...  (Chinese versions)
  ... (all 10 locales)
```

### Modify `lib/createMarkdownLoader.ts`:
Accept locale parameter, fallback to English if translation missing.

### Remaining component string extraction by feature module:
- **Journal:** 5 components in `app/journal/components/`
- **Prayer Tracker:** 8 components in `app/prayer-tracker/components/`
- **Kids Discipleship:** 5 components in `app/kids-discipleship/components/`
- **Profile:** 5 components in `app/profile/components/`

### Database changes:
```prisma
model parrotDevotionals {
  locale  String  @default("en")
}
```

Generate devotionals in all supported locales via cron job.

---

## Theological Translation Quality Assurance

**This is the highest-risk area.** Mistranslated theological content = doctrinal error.

### Translation tiers:

| Tier | Content | Process |
|------|---------|---------|
| **Critical** | Doctrinal statement, church evaluation criteria, core doctrine definitions | AI draft + professional theological reviewer per language |
| **Important** | Pastoral care messages, safety guardrails, devotional/journal prompts | AI draft + native-speaking Reformed Christian review |
| **Standard** | UI labels, error messages, navigation, placeholders | AI translation with spot-check |

### Theological glossary (maintained per language):
Key terms like "Justification by Faith", "Penal Substitutionary Atonement", "Perseverance of the Saints", "Total Depravity", "Means of Grace" must have approved translations in each language. AI translation uses this glossary as reference.

### Process:
1. AI draft using Claude (cost-efficient: ~$0.25 per 50K chars, near-top translation quality)
2. Cross-reference theological glossary
3. Human review by native-speaking Reformed pastor/theologian
4. Version-controlled translation files with review audit trail

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Directory restructure breaks URLs | High | `localePrefix: 'as-needed'` keeps English URLs identical |
| Bible verse regex fails for non-Latin scripts | High | Lookup-based approach for CJK/Arabic/Devanagari instead of regex |
| Doctrinal accuracy in translation | Critical | Mandatory human theological review for Critical/Important tiers |
| LLM uses wrong Bible translation | Medium | Explicit locale directive in system prompt + test suite |
| CJK font loading adds latency | Medium | Conditional loading only for CJK locales, font-display: swap |
| RTL layout bugs | Medium | Dedicated RTL testing pass, CSS logical properties throughout |
| helloao.org missing Bible translation | Medium | All 10 translation IDs already verified against production-ready-top-10-languages.json |
| Church finder badges break on translation | Critical | Badge keys stay English in AI prompts + DB + `filterAllowlistedBadges()`. Translate only at render time via `badges-i18n/{locale}.json`. Classification logic never sees translated text |
| API routes break with locale routing | High | API routes stay outside `[locale]` - zero structural change |
| Performance from middleware | Low | next-intl middleware is lightweight; monitor TTFB |

---

## Verification Plan

1. **Phase 0:** `npm run build` passes. All existing English URLs work identically. No visible changes.
2. **Phase 1:** Toggle language selector through all 10 locales. Navigation, home page, chat basics display in correct language. Auth flow works.
3. **Phase 2:** Bible verse popovers per locale:
   - `/es/` click "Romanos 8:28" -> shows `spa_rvg` (Reina Valera Gómez) text
   - `/zh/` click "罗马书 8:28" -> shows `cmn_cu1` (Chinese Union Simplified) text
   - `/ar/` click "رومية 8:28" -> shows `arb_vdv` (Arabic Van Dyck) text
   - Verify all 10 translation IDs resolve correctly on `bible.helloao.org/api/{id}/{bookId}/{chapter}.json`
4. **Phase 3:** Send chat question from `/es/`, `/zh/`, `/ar/` -> response in correct language with correct Bible book names and translation references.
5. **Phase 4:** Google Rich Results Test passes for all locale variants. hreflang tags present and correct for all 10 locales.
6. **Phase 5:** `/ar/` and `/ur/` render full RTL layout. Sidebar, navigation, chat, forms all mirror correctly.
7. **Phase 6 (Church Finder):**
   - Submit a church in `/es/` -> AI extraction still returns English badge keys -> `filterAllowlistedBadges()` passes -> badges stored in DB
   - View same church evaluation in `/es/` -> status shows "Recomendado" (not "RECOMMENDED"), badges show translated display names
   - View same church in `/en/` -> status shows "Recommended", badges show English names
   - Verify `country` field populates on new church submissions
   - Verify existing churches have `country: "US"` backfilled
   - **Critical:** Verify classification logic produces identical results regardless of user's locale (the AI prompts and `postProcessEvaluation` never see translated text)
8. **Phase 7:** All remaining feature modules (journal, prayer tracker, heritage) display correctly in all locales.
9. **Cross-cutting:** Lighthouse scores maintained across locales. `npm run build` passes at every phase. Non-Latin fonts load only for their respective locales.
