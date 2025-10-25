// ============================================================================
// Common extraction rules for all calls
// ============================================================================
const COMMON_RULES = `### General Extraction Rules

* Work only from the provided pages. Never invent facts.
* Be precise and conservative: if in doubt, return \`unknown\`/\`null\`.
* For any field, if not stated, use \`"null"\` (or \`"unknown"\` for doctrine booleans).`;

// ============================================================================
// Call 1: Basic Fields Prompt
// ============================================================================
export const BASIC_FIELDS_PROMPT = `${COMMON_RULES}

### Task: Extract Basic Church Information

Extract the following fields from the website content:

**name**: Church's official name (from any page header/footer or title).

**website**: Use the \`base_url\` provided.

**addresses**: Extract all postal addresses you find:
  - \`street_1\`: Street address (e.g., "1303 Sherwood Forest St")
  - \`street_2\`: Optional suite/building/unit
  - \`city\`: City name
  - \`state\`: State/province (use 2-letter code if US)
  - \`post_code\`: ZIP or postal code
  - \`source_url\`: The URL where you found this address

**contacts**: 
  - \`phone\`: Phone number (prefer explicit contact info)
  - \`email\`: Email address

**service_times**: Array of visible service time strings (e.g., ["Sundays 9:00 & 11:00 AM", "Wednesday 7:00 PM"])

**best_pages_for**: Pick the **best single URL** for each category:
  - \`beliefs\`: What we believe / doctrine / statement of faith page
  - \`confession\`: Page that names/links a historic confession (Westminster, 1689 LBCF, etc.) or bylaws
  - \`about\`: About / mission / values / who we are page
  - \`leadership\`: Elders / staff / team / leadership page

If you cannot find a suitable page for any category, set it to \`null\`.`;

// ============================================================================
// Call 2: Core Doctrines Prompt
// ============================================================================
export const CORE_DOCTRINES_PROMPT = `${COMMON_RULES}

### Task: Extract Core Doctrines

For each of the 10 core doctrines below, determine if the church **explicitly affirms**, **denies**, or if it's **unknown** based on the website content.

Set each to \`"true"\`, \`"false"\`, or \`"unknown"\`:

1. **trinity**: God exists as three persons (Father, Son, Holy Spirit) in one essence
2. **gospel**: Salvation by grace through faith in Jesus Christ alone
3. **justification_by_faith**: Declared righteous by faith, not works
4. **christ_deity_humanity**: Jesus is fully God and fully man
5. **scripture_authority**: The Bible is the inspired, inerrant Word of God
6. **incarnation_virgin_birth**: Jesus was born of the virgin Mary
7. **atonement_necessary_sufficient**: Christ's death is necessary and sufficient for salvation
8. **resurrection_of_jesus**: Jesus physically rose from the dead
9. **return_and_judgment**: Jesus will return to judge the living and the dead
10. **character_of_god**: God is holy, just, loving, merciful, sovereign

**Marking Guidelines:**
- \`"true"\`: Church explicitly affirms this doctrine (look for "we believe", "we affirm", "we teach")
- \`"false"\`: Church explicitly denies or contradicts this doctrine (look for "we do not believe", "we reject")
- \`"unknown"\`: Not clearly stated or ambiguous

**Notes Array:**
For each doctrine you mark as \`"true"\` or \`"false"\`, capture a note with:
- \`label\`: Name of the doctrine (e.g., "Trinity", "Gospel")
- \`text\`: Short quote (≤30 words) from the website showing the belief
- \`source_url\`: URL where you found this statement

If a doctrine is \`unknown\`, do not create a note for it.`;

// ============================================================================
// Call 3: Secondary Doctrines Prompt
// ============================================================================
export const SECONDARY_DOCTRINES_PROMPT = `${COMMON_RULES}

### Task: Extract Secondary Doctrines & Detect Theological Badges

Extract the church's positions on these secondary doctrines. Provide **neutral** short phrases based only on what you see on the website:

**baptism**: 
  - Examples: "infant (paedo)", "believer's by immersion", "both infant & believer's", etc.

**governance**: 
  - Examples: "elder-led congregational", "presbyterian", "episcopal", "ambiguous"

**lords_supper**: 
  - Examples: "memorial", "spiritual presence", "real presence / sacramental union"

**gifts**: 
  - Examples: "cessationist", "cautious continuationist", "charismatic"

**women_in_church**: 
  - Examples: "complementarian", "egalitarian", "varies/unclear"

**sanctification**: 
  - Examples: "progressive", "entire sanctification", "positional & progressive"

**continuity**: 
  - Examples: "covenant theology", "dispensationalism", "mixed/unclear"

**security**: 
  - Examples: "perseverance of the saints", "conditional security", "mixed/unclear"

**atonement_model**: 
  - Examples: "penal substitution", "Christus Victor", "moral influence", etc.

### Badges to Detect (add to badges array if applicable):

- **🕊️ Cautious Continuationist**: If gifts are stated as continued but with restraint/caution (not normative for all)
- **🔥 Charismatic**: If tongues/prophecy/healing are normative and emphasized
- **📜 Reformed**: If the church clearly identifies with Reformed soteriology (five points of Calvinism, TULIP, Doctrines of Grace)
- **🍷 Paedocommunion**: If infants/children partake in communion (rare but important)

Only add badges you have clear evidence for. Return empty array if none apply.`;

// ============================================================================
// Call 4: Tertiary Doctrines Prompt
// ============================================================================
export const TERTIARY_DOCTRINES_PROMPT = `${COMMON_RULES}

### Task: Extract Tertiary Doctrines & Detect Worship/Practice Badges

Extract the church's positions on these tertiary doctrines. Provide **neutral** short phrases based only on what you see:

**eschatology**: 
  - Examples: "amillennial", "premillennial", "postmillennial", "mixed/unclear"

**worship_style**: 
  - Examples: "traditional", "contemporary", "blended/mixed", "liturgical"

**counseling**: 
  - Examples: "nouthetic (biblical)", "integrationist", "professional referral"

**creation**: 
  - Examples: "young-earth", "old-earth", "theistic evolution", "not stated"

**christian_liberty**: 
  - Examples: "dietary freedom emphasized", "special days observed", "liberty in non-essentials"

**discipline**: 
  - Examples: "formal church discipline", "informal restoration", "Matthew 18 process"

**parachurch**: 
  - Examples: "supports parachurch ministries", "church-only focus", "selective partnership"

### Badges to Detect (add to badges array if applicable):

- **📖 Expository Preaching**: If the church emphasizes verse-by-verse preaching through books of the Bible
- **🎵 Regulative Principle of Worship**: If they explicitly follow only elements prescribed in Scripture for worship
- **📿 High Church/Liturgical**: If Anglican, Lutheran, or uses formal liturgy (Book of Common Prayer, LSB, etc.)

Only add badges you have clear evidence for. Return empty array if none apply.`;

// ============================================================================
// Call 5: Denomination & Confession Prompt
// ============================================================================
export const DENOMINATION_CONFESSION_PROMPT = `${COMMON_RULES}

### Task: Identify Denomination, Confession, and Structural Characteristics

**Denomination:**
- \`label\`: Best guess of denomination (e.g., "Reformed Baptist", "Presbyterian (PCA)", "Lutheran (LCMS)", "Anglican", "Non-denominational", etc.)
- \`confidence\`: 0.0 to 1.0 (how confident are you?)
- \`signals\`: Array of short reasons (e.g., ["credo-baptism", "elder-led", "WCF referenced"])

**Confession:**
Determine if the church **adopts** a historic confession as their doctrinal standard.

- \`adopted\`: \`true\` if they say things like:
  - "Our confession of faith is..."
  - "We adopt the [confession name]"
  - "For a fuller summation of our doctrinal basis, see/read/refer to the [confession name]"
  - "We hold to the [confession name] as our doctrinal standard"
  - "We subscribe to the [confession name]"
  - "[Confession] contains an excellent expression of our faith"
  - "To understand our beliefs more deeply, see the [confession name]"
  - "We encourage you to read the [confession name]" (when paired with "doctrinal basis")
  
**KEY INDICATOR**: If the confession is presented as the **fuller/complete statement** of their beliefs (not just a helpful resource), mark \`adopted = true\`.
  
- \`adopted\`: \`false\` if they only **casually reference** or say "generally in agreement with" but don't present it as their doctrinal standard

- \`name\`: Name of the confession (e.g., "Westminster Confession of Faith (1646/47)", "Second London Baptist Confession (1689)")
- \`source_url\`: URL where confession is mentioned

**Valid Historic Confessions:**
- Westminster Confession of Faith (1646/47)
- Second London Baptist Confession (1689)
- First London Baptist Confession (1644)
- Belgic Confession (1561) + Heidelberg Catechism (1563) + Canons of Dort (1619)
- Second Helvetic Confession (1566)
- Irish Articles (1615)
- Savoy Declaration (1658)

**Notes:**
If \`adopted = true\`, add a note:
- \`label\`: "Adopted Confession"
- \`text\`: "Church adopts [confession name] as their doctrinal standard"
- \`source_url\`: URL where you found this

### Badges to Detect (add to badges array if applicable):

- **🤝 Denomination-Affiliated**: If clearly tied to a denomination (PCA, SBC, LCMS, Acts 29, Fellowship of Reformed Evangelicals, etc.)
- **🆓 Independent**: If explicitly independent / non-denominational with no denominational oversight
- **🏠 House Church**: If church meets in homes (no dedicated building)
- **🏢 Multi-Site**: If one church with multiple campuses/locations
- **👥 Small Church**: If stated membership is under 100
- **🏟️ Megachurch**: If stated membership/attendance is over 2000

Only add badges you have clear evidence for. Return empty array if none apply.`;

// ============================================================================
// Call 6: Red Flags & Final Analysis Prompt
// ============================================================================
export const RED_FLAGS_PROMPT = `${COMMON_RULES}

### Task: Detect Red Flags & Concerning Theological Indicators

Review all website content for the following red flag indicators. Add badges ONLY if you have clear evidence:

### Red Flag Badges:

**⚠️ Prosperity Gospel**: 
- Word of Faith theology
- Health and wealth emphasis
- "Seed faith" / "name it and claim it"
- Guaranteed physical/financial blessing for faith/giving
- Teachers: Osteen, Copeland, Dollar, Hinn, Meyer (if heavily referenced)

**⚠️ Hyper-Charismatic**: 
- Excessive focus on manifestations
- "Drunk in the Spirit", "holy laughter", "grave soaking"
- Gold dust, angel feathers, or other physical signs emphasized
- Prophecy/tongues elevated above Scripture
- Apostolic/prophetic movements (NAR - New Apostolic Reformation)

**⚠️ Entertainment-Driven**: 
- Church marketed primarily as entertainment venue
- Diluted or absent gospel presentation
- Sermons focus on self-help rather than Scripture
- Heavy emphasis on production/performance over worship
- "Seeker-driven" model where biblical content is minimized to attract crowds

**🏳️‍🌈 LGBTQ Affirming**: 
Look for explicit affirmation in these contexts:
- **Membership**: "We welcome LGBTQ individuals into full membership"
- **Ordination**: LGBTQ individuals can serve as pastors/elders
- **Marriage**: Church performs/blesses same-sex marriages
- **Denominational policy**: Affiliated with denomination that permits these (and church doesn't disclaim it)

**Important**: Generic welcoming language like "all are welcome" is NOT sufficient. You need explicit inclusion in membership, leadership, or marriage contexts.

**Also check for**: Women serving as "pastors" or "elders" (not just staff or deacons).

### Notes:
For each red flag badge you add, create a note with:
- \`label\`: Name of the badge (e.g., "Prosperity Gospel", "LGBTQ Affirming")
- \`text\`: Brief explanation of what you found (≤50 words)
- \`source_url\`: URL where you found this evidence

If NO red flags are found, return empty arrays for both badges and notes.`;
