// ============================================================================
// Core Doctrines Definitions
// ============================================================================
// Comprehensive definitions for the 10 essential doctrines that define
// Christian orthodoxy. Churches must affirm these to be considered sound.

export const CORE_DOCTRINES_DEFINITIONS = `## Core Doctrines - Detailed Definitions

These are the foundational truths upon which Christian faith stands. We will not compromise on these essential beliefs.

---

### 1. **The Trinity** (\`trinity\`)

**Definition**: We believe in one God, eternally existing in three persons—Father, Son, and Holy Spirit—each fully God, sharing the same divine essence, power, and eternity.

**What to look for:**
- ✅ **Affirms**: "One God in three persons", "Father, Son, and Holy Spirit", "triune God", "three-in-one", "Trinity"
- ✅ **Affirms**: "The Son and Holy Spirit are God, equal with the Father"
- ✅ **Affirms**: "Three real Persons... each having the whole divine essence"
- ❌ **Denies**: Modalism (God is one person in three modes), Arianism (Jesus is created), Unitarianism (denies Trinity)

**Edge cases:**
- If they say "God the Father, Jesus Christ, and the Holy Spirit" but don't explicitly say "Trinity", still mark \`true\` if they clearly present all three as God
- Churches that simply list "Father, Son, Holy Spirit" in baptismal formula likely affirm Trinity (mark \`true\`)

---

### 2. **The Gospel** (\`gospel\`)

**Definition**: Salvation is secured by Christ's historical death, burial, and resurrection on the third day, demonstrating His victory over sin and death. Salvation is by grace alone through faith alone in Christ alone.

**What to look for:**
- ✅ **Affirms**: "Salvation by grace through faith in Jesus Christ", "saved by faith alone", "grace alone", "Christ died for our sins"
- ✅ **Affirms**: "Jesus rose from the dead", "resurrection on the third day", "Christ's victory over sin and death"
- ✅ **Affirms**: "Not by works", "apart from works of the law"
- ❌ **Denies**: Works-based salvation, faith + works for justification, salvation by sacraments alone

**Edge cases:**
- If they emphasize "faith and obedience" or "faith that works", this is likely affirming gospel + sanctification (still mark \`true\`)
- "Faith working through love" (Galatians 5:6) is compatible with gospel (mark \`true\`)
- Only mark \`false\` if they explicitly require works FOR salvation/justification

---

### 3. **Justification by Faith** (\`justification_by_faith\`)

**Definition**: Individuals are justified (declared righteous before God) solely by grace alone through faith alone in Christ alone, apart from works.

**What to look for:**
- ✅ **Affirms**: "Justified by faith", "declared righteous by faith", "imputed righteousness", "forensic justification"
- ✅ **Affirms**: "Not by works", "apart from works of the law", "faith alone" (sola fide)
- ✅ **Affirms**: "God counts/credits/imputes Christ's righteousness to believers"
- ❌ **Denies**: Justification by faith + works, justification by infused righteousness that makes us actually righteous, salvation by sacraments

**Edge cases:**
- Roman Catholic language about "initial justification" + "increase in justification" would be \`false\`
- If they say "justified by faith that produces works", mark \`true\` (works are fruit, not basis)
- "Faith alone justifies, but the faith that justifies is never alone" (Reformed) = \`true\`

---

### 4. **The Deity and Humanity of Christ** (\`christ_deity_humanity\`)

**Definition**: Jesus Christ is truly God and truly man (Vere Deus, vere homo). He possesses two distinct natures—divine and human—united in one person forever.

**What to look for:**
- ✅ **Affirms**: "Jesus is God", "Jesus is fully God and fully man", "divine and human natures", "God incarnate"
- ✅ **Affirms**: "The Son is truly and eternally God", "same in substance with the Father"
- ✅ **Affirms**: "Took upon Himself human nature", "truly man"
- ❌ **Denies**: Jesus is only a good teacher, Jesus is created, Jesus only seemed human (Docetism)

**Edge cases:**
- If they say "Son of God" without explicitly saying "Jesus is God", look for divine attributes (eternal, creator, worshiped) to confirm (mark \`true\` if present)
- "Divine nature and human nature in one person" = clear \`true\`

---

### 5. **The Authority of Scripture** (\`scripture_authority\`)

**Definition**: The Bible (Old and New Testaments) is the inspired, inerrant, and infallible Word of God, serving as the ultimate authority in all matters of faith and practice.

**What to look for:**
- ✅ **Affirms**: "Inspired Word of God", "inerrant", "infallible", "without error", "God-breathed"
- ✅ **Affirms**: "Only sufficient standard for faith and practice", "final authority", "supreme authority"
- ✅ **Affirms**: "All Scripture is breathed out by God" (2 Timothy 3:16)
- ❌ **Denies**: Bible contains errors, human traditions equal Scripture, ongoing revelation supersedes Scripture

**Edge cases:**
- "Inspired" alone may not be enough—check if they affirm "inerrant" or "infallible" or "without error"
- If they say "authoritative for faith and practice" but don't say "inerrant", mark \`unknown\` unless clear affirmation elsewhere
- "Sole authority" or "final word" = likely \`true\`

---

### 6. **The Incarnation and Virgin Birth** (\`incarnation_virgin_birth\`)

**Definition**: Jesus Christ took on human nature through miraculous conception by the Holy Spirit and was born of the Virgin Mary.

**What to look for:**
- ✅ **Affirms**: "Virgin birth", "born of the Virgin Mary", "conceived by the Holy Spirit", "miraculous conception"
- ✅ **Affirms**: "Incarnation", "God became man", "Word became flesh"
- ❌ **Denies**: Jesus had a human father, virgin birth is symbolic/mythical

**Edge cases:**
- If they mention "born of Mary" but don't say "virgin", mark \`unknown\` unless incarnation is clearly stated
- "Conceived by the Holy Spirit, born of the Virgin Mary" (from creeds) = clear \`true\`

---

### 7. **The Atonement (Christ's Saving Work)** (\`atonement_necessary_sufficient\`)

**Definition**: Christ's sacrificial death on the cross is necessary and sufficient to reconcile sinners to God. His death is the only means of atonement for sin.

**What to look for:**
- ✅ **Affirms**: "Christ died for our sins", "atoning sacrifice", "shed blood for sins", "substitutionary atonement"
- ✅ **Affirms**: "Only through Christ", "no other way to salvation", "sufficient sacrifice"
- ✅ **Affirms**: "Bearing God's punishment for sin", "propitiation", "reconciliation through His blood"
- ❌ **Denies**: Christ's death is only an example, multiple paths to salvation, atonement through other means

**Edge cases:**
- Churches may emphasize different atonement theories (penal substitution, Christus Victor, etc.)—as long as they affirm Christ's death is necessary and sufficient, mark \`true\`
- "Ransom for many", "died in our place" = \`true\`

---

### 8. **The Resurrection of Jesus** (\`resurrection_of_jesus\`)

**Definition**: Jesus Christ physically rose from the dead on the third day, confirming His divinity and victory over sin and death.

**What to look for:**
- ✅ **Affirms**: "Bodily resurrection", "rose from the dead", "resurrected on the third day", "empty tomb"
- ✅ **Affirms**: "Firstfruits of the resurrection", "victory over death"
- ❌ **Denies**: Resurrection is symbolic/spiritual only, Jesus didn't physically rise

**Edge cases:**
- "Physical resurrection" or "bodily resurrection" = clear \`true\`
- If they only say "resurrection" without "physical/bodily", mark \`true\` unless there's reason to doubt orthodoxy

---

### 9. **Christ's Return and Final Judgment** (\`return_and_judgment\`)

**Definition**: Jesus Christ will return personally and bodily to judge the living and the dead, culminating in the renewal of all things.

**What to look for:**
- ✅ **Affirms**: "Second coming", "Christ will return", "coming again", "final judgment"
- ✅ **Affirms**: "Judge the living and the dead", "day of judgment", "eternal judgment"
- ✅ **Affirms**: "New heaven and new earth", "restoration of all things", "renewal of creation"
- ❌ **Denies**: No future judgment, no bodily return, all will be saved (universalism)

**Edge cases:**
- Churches may differ on timing (pre/post/amillennial)—as long as they affirm Christ will return and judge, mark \`true\`
- "We await His return" = \`true\`

---

### 10. **The Character of God** (\`character_of_god\`)

**Definition**: God is holy, supreme, sovereign, immutable, faithful, good, patient, gracious, merciful, loving, and just. His wrath against sin is real and His judgments are righteous.

**What to look for:**
- ✅ **Affirms**: "God is holy", "sovereign", "just", "loving", "merciful", "faithful"
- ✅ **Affirms**: "God's wrath against sin", "God judges sin", "righteous judgments"
- ✅ **Affirms**: "God is immutable" (unchanging), "God is good", "all-sufficient"
- ❌ **Denies**: God changes His mind, God is not sovereign, God has no wrath, open theism (God doesn't know the future)

**Edge cases:**
- Churches don't need to list ALL attributes—just look for clear affirmation of God's holiness, sovereignty, justice, love, and wrath
- If they emphasize God's love but don't mention His wrath, mark \`unknown\` (not \`false\`)
- "Merciful and gracious, slow to anger, abounding in steadfast love" (Exodus 34:6) = affirms character`;
