# Journal Feature Naming Strategy

## Decision Summary
After evaluating "Coram Deo Journal" and other theological names, we chose a paired naming system that prioritizes clarity and accessibility while maintaining theological depth through taglines and content.

## Final Naming

| Feature | Nav Label | Route | Full Name | Tagline |
|---------|-----------|-------|-----------|---------|
| Personal Journal | Journal | `/journal` | Personal Journal | Daily reflections with pastoral insight |
| Heritage Journal | Heritage | `/kids-discipleship` | Heritage Journal | Building faith with your children |

## Rationale

### Why "Personal Journal" over "Coram Deo Journal"?

**Problems with "Coram Deo":**
- **Insider language** — Assumes familiarity with Latin and Reformed vocabulary
- **Intimidation factor** — May feel inaccessible to newer believers
- **Barrier to adoption** — Users don't click on things they can't pronounce or understand
- **Contradicts brand voice** — Our Master Prompt emphasizes gentleness and accessibility
- **Conflicts with "freely available" ethos** — Latin signals "for the educated"

**Benefits of "Personal Journal":**
- **Instant clarity** — New users immediately understand the purpose
- **Mobile-friendly** — Short nav label, clear full name
- **Flexibility** — Taglines and zero-state copy can explain the depth without overloading the name
- **Universal appeal** — Works across traditions and education levels
- **SEO friendly** — People search for "personal journal," not "coram deo"

### Why "Heritage Journal" for Kids Discipleship?

**Theological resonance:**
- Psalm 127:3 — "Children are a heritage from the Lord"
- Signals legacy-building and intentional parenting
- Warm, memorable, distinctly Christian

**Practical benefits:**
- Clear scope — "This is about your kids," not generic "family stuff"
- Pairs well with "Personal" — clean parallel structure
- More specific than "Family Journal"
- Short nav label ("Heritage") for mobile

## Content Strategy

### Personal Journal Landing Page

**Header copy:**
```
Personal Journal
Daily reflections with pastoral insight
```

**Zero-state CTA:**
```
Write about your day, struggles, or growth—get gentle, pastoral reflection 
to help you see your heart and grow in grace.

[Start Your First Entry]
```

**Feature description (marketing/docs):**
> Personal Journal provides AI-powered pastoral reflection on your everyday sanctification. Each entry receives structured guidance grounded in Scripture, identifying heart issues, suggesting "put off/put on" patterns from Ephesians 4, and offering practical next steps. Insights can be promoted to Prayer Tracker or continued in deeper conversation.

### Heritage Journal Landing Page

**Header copy:**
```
Heritage Journal
Building faith with your children
```

**Zero-state CTA:**
```
Track annual plans, monthly vision, and daily parenting moments—get 
shepherding guidance to intentionally disciple your kids.

[Add Your First Child]
```

**Feature description (marketing/docs):**
> Heritage Journal helps Christian parents shepherd their children's hearts through structured discipleship planning. Track annual character and competency goals, set monthly vision, and log nurture and admonition moments with AI-powered reflection to help you point your kids to Jesus.

## Implementation

### Navigation (Header.tsx)
- Primary nav: "Journal" → `/journal`
- Secondary nav (when launched): "Heritage" → `/kids-discipleship`

### Feature Routing (Parrot Chat)
When users ask about journaling or parenting:
- "Daily personal reflections with pastoral insight: [Personal Journal](/journal)"
- "Discipleship planning and parenting logs: [Heritage Journal](/kids-discipleship)"

### Auth Fallback Pages
Use full feature names:
- "Personal Journal — Checking your session..."
- "Heritage Journal — Checking your session..."

## Marketing Language

**Unified pitch:**
> Calvinist Parrot's *Personal Journal* provides AI-powered pastoral reflection on your everyday sanctification, while the *Heritage Journal* helps you track and shepherd your children's spiritual growth—both integrating seamlessly with Prayer Tracker to turn reflection into prayer action.

## Theological Frame (Internal Use)

While we don't lead with Latin, the theological concepts remain central to the *experience*:
- **Coram Deo** (living before the face of God) — Present in system prompts, reflection copy, and pastoral tone
- **Heritage** (Psalm 127:3) — Children as gifts from the Lord, requiring faithful stewardship
- **Put Off/Put On** (Ephesians 4) — Framework for identifying sin patterns and virtues
- **Means of Grace** — Scripture, prayer, fellowship as tools for growth

The name is the door; the content is the room they walk into. We choose simple doors that everyone can find.

## Brand Alignment

This naming strategy fulfills all four brand pillars:

1. **Faithfulness** — Content remains Scripture-rooted and doctrinally sound
2. **Freedom** — No jargon barriers, no paywalls, low friction
3. **Fellowship** — Accessible across traditions and education levels
4. **Futurism** — Modern, clear, structured approach to ancient truths

## Soli Deo Gloria
