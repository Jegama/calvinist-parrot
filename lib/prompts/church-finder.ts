import { CORE_DOCTRINES_DEFINITIONS } from "./core-doctrines-definitions";
import { SECONDARY_DOCTRINES_DEFINITIONS } from "./secondary-doctrines-definitions";
import { TERTIARY_DOCTRINES_DEFINITIONS } from "./tertiary-doctrines-definitions";

// ============================================================================
// Common extraction rules for all calls
// ============================================================================
const COMMON_RULES = `### General Extraction Rules

STRICT OUTPUT:
- Return JSON only that conforms exactly to the provided schema for this call.
- Do not include Markdown, explanations, comments, or extra keys not in the schema.
- Use absolute URLs from the provided content when populating any URL field.

EVIDENCE AND CONSERVATISM:
- Work only from the provided pages. Never invent or infer beyond explicit statements.
- If a value is not clearly stated, return \`null\` (or \`"unknown"\` for doctrine booleans).
- Quotes in notes must be short, verbatim excerpts from the page, not paraphrases.

DEDUPLICATION & HYGIENE:
- Deduplicate arrays (addresses, service_times, badges). Keep the clearest single representation.
- Prefer canonical/complete forms (e.g., “Street” over “St”, full state name over abbreviation) when normalizing duplicates.
- Ignore social media profiles as sources unless they are embedded official pages with doctrinal content.

BADGES POLICY:
- Only use the badges explicitly listed in the current prompt section.
- Output the badge label verbatim (including emoji, spelling, and capitalization).
- Do NOT invent new badges or variants. If none apply, return an empty array [].`;

// ============================================================================
// Call 1: Basic Fields Prompt
// ============================================================================
export const BASIC_FIELDS_PROMPT = `${COMMON_RULES}

### Task: Extract Basic Church Information

Extract the following fields from the website content:

**name**: Church's official name (from any page header/footer or title).

**website**: Use the \`base_url\` provided.

**addresses**: Extract all **unique** postal addresses you find:
  - \`street_1\`: Street address (e.g., "1303 Sherwood Forest St")
  - \`street_2\`: Optional suite/building/unit
  - \`city\`: City name
  - \`state\`: State/province (use 2-letter code if US)
  - \`post_code\`: ZIP or postal code
  - \`source_url\`: The URL where you found this address
  
**CRITICAL - Avoid Duplicate Addresses:**
- If you find the same physical address with minor formatting variations (e.g., "St" vs "Street", "TX" vs "Texas"), include it ONLY ONCE
- Use the most complete/formal version (prefer "Street" over "St", full state name over abbreviation)
- Different campus locations of a multi-site church ARE unique addresses and should all be included
- Only include addresses that are clearly different physical locations

**contacts**: 
  - \`phone\`: Phone number (prefer explicit contact info)
  - \`email\`: Email address

**service_times**: Array of visible service time strings (e.g., ["Sundays 9:00 & 11:00 AM", "Wednesday 7:00 PM"])

**best_pages_for**: Pick the **best single URL** for each category:
  - \`beliefs\`: What we believe / doctrine / statement of faith page
  - \`confession\`: Page that names/links a historic confession (Westminster, 1689 LBCF, etc.) or bylaws
  - \`about\`: About / mission / values / who we are page
  - \`leadership\`: Elders / staff / team / leadership page

ADDITIONAL GUIDANCE:
- Prefer “Contact/Visit/Plan Your Visit” pages for addresses when available; avoid map widgets without text unless they clearly display a postal address.
- Exclude P.O. Boxes if a physical address is available; if only a P.O. Box is present, include it.
- For leadership, prefer pages listing elders/pastors over general staff directories.

If you cannot find a suitable page for any category, set it to \`null\`.`;

// ============================================================================
// Call 2: Core Doctrines Prompt
// ============================================================================
export const CORE_DOCTRINES_PROMPT = `${COMMON_RULES}

### Task: Extract Core Doctrines

${CORE_DOCTRINES_DEFINITIONS}

---

**Your Task:**

For each of the 10 core doctrines, determine if the church **explicitly affirms**, **denies**, or if it's **unknown** based on the website content.

Set each to \`"true"\`, \`"false"\`, or \`"unknown"\`:

1. **trinity**
2. **gospel**
3. **justification_by_faith**
4. **christ_deity_humanity**
5. **scripture_authority**
6. **incarnation_virgin_birth**
7. **atonement_necessary_sufficient**
8. **resurrection_of_jesus**
9. **return_and_judgment**
10. **character_of_god**

**Marking Guidelines:**
- \`"true"\`: Church explicitly affirms this doctrine (see definitions above for what counts as affirmation)
- \`"false"\`: Church explicitly denies or contradicts this doctrine
- \`"unknown"\`: Not clearly stated or ambiguous

**Notes Array:**
For each doctrine you mark as \`"true"\` or \`"false"\`, capture a note with:
- \`label\`: Name of the doctrine (e.g., "trinity", "scripture_authority", "resurrection_of_jesus")
- \`text\`: Short, verbatim quote (≤30 words) from the website showing the belief (no paraphrases)
- \`source_url\`: URL where you found this statement

If a doctrine is \`unknown\`, do not create a note for it.`;

// ============================================================================
// Call 3: Secondary Doctrines Prompt
// ============================================================================
export const SECONDARY_DOCTRINES_PROMPT = `${COMMON_RULES}

### Task: Extract Secondary Doctrines & Detect Theological Badges

${SECONDARY_DOCTRINES_DEFINITIONS}

---

**Your Task:**

Extract the church's positions on these secondary doctrines. Provide **neutral** short phrases based only on what you see on the website:

1. **baptism**
2. **governance**
3. **lords_supper**
4. **gifts**
5. **sanctification**
6. **continuity**
7. **security**
8. **atonement_model**

Use the neutral phrases suggested in the definitions above (e.g., "Believer's baptism by immersion", "Elder-led congregational", etc.). If not stated, return \`null\`.

### Badges to Detect (add to badges array if applicable, including the emoji):

STRICT BADGE OUTPUT RULES:
- Use ONLY the badges listed below.
- Output them VERBATIM, including the emoji and exact wording.
- Do NOT create new badges or variants.
- If none apply, return an empty array []

- **📜 Reformed**: If the church clearly identifies with Reformed theology, emphasizing God's sovereignty in salvation (often called the Doctrines of Grace, five points of Calvinism, or TULIP). Look for explicit self-identification as "Reformed" or direct affirmation of Reformed soteriology.
- **🧭 Arminian**: If the church clearly identifies with Arminian soteriology (conditional election, prevenient grace, resistible grace, and often conditional security). Look for explicit self-identification as "Arminian" or direct affirmation of these doctrines.
- **📃 Covenant Theology**: The church explicitly identifies with Covenant Theology or describes Scripture as one covenant of grace across Old and New Testaments, emphasizing the unity of God’s redemptive plan and continuity between Israel and the Church.
- **🔄 Dispensational**: The church distinguishes Israel and the Church as separate peoples of God and/or structures history in distinct “dispensations,” often emphasizing a literal hermeneutic and rapture/millennial timeline.
- **🍷 Paedocommunion**: If the church allows baptized children (including infants) to partake in the Lord's Supper. This is a practice held by some Presbyterian and Reformed congregations. Rare but theologically significant.
- **🕊️ Cautious Continuationist**: If the church holds that certain spiritual gifts (prophecy, tongues, healing) may continue today but exercises caution and does not see them as normative for all believers. Look for language like "open but cautious" or "gifts may continue but are not expected."
- **🔥 Charismatic**: If the church emphasizes the ongoing work of the Holy Spirit through tongues, prophecy, and healing as normative expressions of the Christian life. Look for regular practice, expectation, or emphasis on these gifts in corporate worship or teaching.
- **🧑‍🎓 Wesleyan-Holiness**: If the church teaches entire sanctification or sinless perfection (Holiness/Wesleyan tradition). Look for language about "second blessing," "entire sanctification," "Christian perfection," or "sinless perfection."
- **🧱 KJV-Only**: KJV-onlyism stated as doctrinal stance or requirement and treats the King James Version as the only valid English Bible translation for doctrine and practice
- **🎯 Seeker-Sensitive**: Explicit seeker model for weekend services (programmatic, attractional), distinct from entertainment-driven excess
- **🥖 Real Presence (Lutheran)**: Lutheran sacramental union/real presence/sacramental union in the Lord's Supper explicitly affirmed

MUTUALLY EXCLUSIVE SOTERIOLOGY IDENTITY BADGES:
- Add only ONE of the following if clearly claimed: **📜 Reformed** OR **🧭 Arminian**.
- If unclear or both are implied without explicit self-identification, omit both.

MUTUALLY EXCLUSIVE HERMENEUTICAL BADGES:
- Add only ONE of the following if clearly claimed: **📃 Covenant Theology** OR **🔄 Dispensational**.
- If unclear or both are implied, omit both.

Only add badges you have clear evidence for. Return empty array if none apply.`;

// ============================================================================
// Call 4: Tertiary Doctrines Prompt
// ============================================================================
export const TERTIARY_DOCTRINES_PROMPT = `${COMMON_RULES}

### Task: Extract Tertiary Doctrines & Detect Worship/Practice Badges

${TERTIARY_DOCTRINES_DEFINITIONS}

---

**Your Task:**

Extract the church's positions on these tertiary doctrines. Provide **neutral** short phrases based only on what you see:

1. **eschatology**
2. **worship_style**
3. **counseling**
4. **creation**
5. **christian_liberty**
6. **discipline**
7. **parachurch**
8. **marriage_roles**
9. **non_essential** (optional catch-all field)

Use the neutral phrases suggested in the definitions above (e.g., "Amillennial", "Contemporary", "Complementarian", "Egalitarian", "Patriarchal", "Not stated", etc.).

### Badges to Detect (add to badges array if applicable, including the emoji):

STRICT BADGE OUTPUT RULES:
- Use ONLY the badges listed below.
- Output them VERBATIM, including the emoji and exact wording.
- Do NOT create new badges or variants.
- If none apply, return an empty array []

- **📖 Expository Preaching**: If the church emphasizes verse-by-verse teaching through books of the Bible, seeking to explain and apply Scripture in its context. Look for phrases like "expositional preaching," "verse-by-verse," "through the Bible," or sermon series covering entire books.
- **🎵 Regulative Principle of Worship**: If the church explicitly follows the Regulative Principle, worshiping according to elements explicitly prescribed in Scripture (such as prayer, preaching, singing psalms and hymns, and sacraments). Look for explicit mention of "Regulative Principle" or statements about only including worship elements commanded in Scripture.
- **🕯️ High Church/Liturgical**: If Anglican, Lutheran, or uses formal liturgy (Book of Common Prayer, LSB, etc.)
- **👥 Plurality of Elders**: If the church explicitly practices a plurality of elders in governance. Look for phrases like "elder-led," "plurality of elders," "multiple elders," or a leadership page listing multiple elders (not just one pastor).
- **🗒️ Biblical Counseling**: If they promote a biblical counseling ministry (e.g., ACBC-certified counselors, counseling center grounded in Scripture)
- **📘 Membership & Discipline**: If the church maintains formal membership and publishes a church discipline process. Look for membership requirements/covenant, discipline policy, or references to Matthew 18 church discipline procedures.
- **📚 Catechism Use**: If the church actively teaches and uses recognized catechisms for discipleship. Look for mentions of Westminster Shorter/Larger Catechism, Heidelberg Catechism, Baptist Catechism, or catechism classes/resources.
- **🎶 Exclusive Psalmody**: If the church practices exclusive psalm singing in corporate worship (no hymns or contemporary songs, only the Psalms). This is a stricter Reformed practice held by some Presbyterian churches (RPCNA, Free Church of Scotland).
- **🎼 Instrument-Free Worship**: If the church practices a cappella (instrument-free) corporate worship. Look for explicit statements about no instruments in worship services or "a cappella" worship.
- **🍼 Family-Integrated**: If the church follows a family-integrated model that keeps families together in worship (no age-segregated Sunday school or children's church) and emphasizes family discipleship. Look for phrases like "family-integrated church," "families worship together," or explicit rejection of age-segregated ministry.
- **🏡 Home Groups**: If they run weekday small groups meeting in homes (community groups, life groups, missional communities, etc.)

Only add badges you have clear evidence for. Return empty array if none apply.`;

// ============================================================================
// Call 5: Denomination & Confession Prompt
// ============================================================================
export const DENOMINATION_CONFESSION_PROMPT = `${COMMON_RULES}

### Task: Identify Denomination, Confession, and Structural Characteristics

**Denomination:**
- \`label\`: Best guess of denomination (e.g., "Reformed Baptist", "Presbyterian (PCA)", "Baptist (SBC affiliated)", "Lutheran (LCMS)", "Anglican", "Non-denominational", etc.)
- \`confidence\`: 0.0 to 1.0 (how confident are you?)
- \`signals\`: Array of short reasons (e.g., ["credo-baptism", "elder-led", "WCF referenced"])

**Confession:**
Determine if the church **adopts** a historic confession as their doctrinal standard.

**Mark \`adopted = true\` if you find ANY of these indicators:**

1. **Direct adoption language:**
   - "Our confession of faith is..."
   - "We adopt/subscribe to the [confession name]"
   - "We hold to the [confession name] as our doctrinal standard"
   - "[Confession name] is our confession"
  - "We would affirm as sound teaching the articles of the [confession name]"
  - "to which we would subscribe for guidance" (or similar qualified subscription language)
  - Any phrasing that clearly expresses the church "subscribes", "affirms", "holds to", or "uses" the confession as their doctrinal guide (accept minor variations in wording)

2. **Fuller/complete statement language:**
   - "For a fuller summation of our doctrinal basis, see/read/refer to the [confession name]"
   - "[Confession] contains an excellent expression of our faith/the Christian faith/the faith/biblical Christianity"
   - "To understand our beliefs more deeply/fully, see the [confession name]"
   - "For a comprehensive statement, read the [confession name]"
   - "Our fuller doctrinal statement is found in the [confession name]"
   - "For a fuller statement/summation of what we believe, see [confession name]"

3. **Encouragement tied to doctrinal basis:**
   - "We encourage you to read the [confession name]" (when paired with phrases like "doctrinal basis", "what we believe", "our faith", "fuller summation", "fuller statement")
   - "We commend the [confession name] as expressing our beliefs/the Christian faith"
   - "We direct you to the [confession name] for our full statement"
   - "[Confession] contains an excellent/accurate expression/summary of our beliefs/the Christian faith/biblical Christianity"

4. **Confession listed in official documents:**
   - Confession mentioned in bylaws, constitution, or articles of faith as their standard
   - Leadership must affirm/sign the confession

**CRITICAL**: The key is whether the confession is presented as **their authoritative doctrinal statement** (even if they have a summary first). If they point to it as the full/complete expression of their beliefs, mark \`adopted = true\`.

**Mark \`adopted = false\` ONLY if:**
- Casual reference like "generally in agreement with" without making it their standard
- Historical reference without claiming it as their current confession
- Listed as a helpful resource alongside many other resources
- Only mentioned in passing without endorsement

- \`name\`: Name of the confession (e.g., "Westminster Confession of Faith (1646/47)", "Second London Baptist Confession (1689)")
- \`source_url\`: URL where confession is mentioned

**ONLY These Historic Confessions Are Valid (Variation of the name are acceptable too):**
- Westminster Confession of Faith (1646/47)
- Second London Baptist Confession (1689)
- First London Baptist Confession (1644/46)
- Belgic Confession (1561) + Heidelberg Catechism (1563) + Canons of Dort (1619)
- Second Helvetic Confession (1566)
- Irish Articles (1615)
- Savoy Declaration (1658)

**ACCEPTABLE VARIATIONS / MATCHING GUIDANCE:**
- Accept small variations in the confession name and date formatting (e.g., "First London Baptist Confession of Faith (2nd Ed. 1646)", "First London Confession (1644-1646)", "First London Baptist Confession (1644/46)").
- Accept common short forms such as "First London Baptist Confession", "First London Confession", or inclusion of edition notes like "2nd Ed. 1646".

**DEALING WITH QUALIFIED SUBSCRIPTIONS:**
- If the site uses qualifying language (e.g., "subscribe for guidance but not absolute adherence", "subscribe for guidance", "affirm as sound teaching"), still mark \`adopted = true\` because the confession is being presented as the church's doctrinal guide. In this case, add a clarifying note that preserves the nuance (see Notes below).

**CRITICAL REJECTIONS - Mark \`adopted = false\` for these:**
- Baptist Faith and Message (2000 Edition / BFM 2000) - Southern Baptist Convention statement, NOT a historic Reformed confession. While biblically sound, it accommodates both Reformed and Arminian soteriology within the SBC. **Special handling:** Set \`name\` to "Baptist Faith and Message (2000 Edition)", note in denomination field as "Baptist (SBC affiliated/BFM 2000)", and mark \`adopted = false\`. This allows doctrine inference while preventing the Reformed badge.
- ECO Essential Tenets (2012) - Modern progressive confession, NOT historic Reformed
- Book of Confessions (PCUSA/ECO collection) - Contains problematic modern confessions (Confession of 1967, Belhar)
- Any confession not explicitly listed above
- Any modern (post-1700) confessions or statements
- Denominational statements that are not historic Reformed confessions

### Badges to Detect (add to badges array if applicable, including the emoji):

STRICT BADGE OUTPUT RULES:
- Use ONLY the badges listed below.
- Output them VERBATIM, including the emoji and exact wording.
- Do NOT create new badges or variants.
- If none apply, return an empty array []

- **🤝 Denomination/Network Affiliated**: If the church is a member of, affiliated with, or part of ANY formal denominational body, network, fellowship, or association. This includes:
  - Traditional denominations: PCA, OPC, SBC, LCMS, CREC, RPCNA, ARP, etc.
  - Reformed networks/fellowships: ARBCA (Association of Reformed Baptist Churches of America), FIRE (Fellowship of Independent Reformed Evangelicals), Acts 29, Sovereign Grace Churches, etc.
  - Any organization that provides: formal membership, mutual accountability, cooperative missions, credentialing, or structured fellowship
  - **CRITICAL**: Even if the network uses "independent" in its name (e.g., FIRE = Fellowship of **Independent** Reformed Evangelicals), it still counts as denominational affiliation because the church is part of a formal network with membership requirements and mutual support structures

- **🆓 Independent**: If the church is **truly autonomous** with NO formal denominational ties, networks, fellowships, or associations. The church must:
  - Have no formal membership in any denomination, network, or fellowship
  - Operate with complete autonomy (no external accountability structure)
  - Not participate in cooperative denominational missions or credentialing
  - Be explicitly described as "independent" or "non-denominational" WITHOUT belonging to any named network
  - **CRITICAL**: If the church mentions being part of ANY network, fellowship, association, or cooperative body → DO NOT use this badge, use 🤝 Denomination/Network Affiliated instead

- **🏠 House Church**: If the church meets in homes rather than a dedicated building, often emphasizing intimate fellowship and simple worship. Look for phrases like "house church," "meeting in homes," or absence of a church building address.
- **🏢 Multi-Site**: If the church operates multiple campuses or locations under one leadership structure. Look for phrases like "multi-site," "campuses," or multiple addresses listed with shared leadership/name.
- **👥 Small Church**: If the church has a stated membership or attendance under 100, often providing close-knit fellowship and personal care. Look for explicit membership/attendance numbers on the website.
- **🏟️ Megachurch**: If the church has a stated membership or attendance over 2,000, typically offering diverse ministries and programs. Look for explicit membership/attendance numbers or indicators of very large scale (multiple services, large facility, extensive staff).
- **🌍 Missions-Focused**: If the church has a strong emphasis on missions (e.g., dedicated missions staff, active missionary support, missions trips, church planting initiatives, explicit Great Commission focus in their vision/values)

**IMPORTANT**: 🤝 Denomination/Network Affiliated and 🆓 Independent are **mutually exclusive**. Add only ONE of these badges:
- If the church has ANY denominational oversight/affiliation/network/fellowship membership → use 🤝 Denomination/Network Affiliated
- If the church is explicitly autonomous with NO formal ties to ANY network/denomination → use 🆓 Independent  
- If unclear → omit both

**COMMON CONFUSION**: Churches may describe themselves as "independent" while also being part of a network/fellowship. In these cases, ALWAYS prioritize the network affiliation over the self-description. A church that is "independent Baptist but part of ARBCA" should get 🤝 Denomination/Network Affiliated, NOT 🆓 Independent.

**Notes:**
If \`adopted = true\`, add a note:
- \`label\`: "Adopted Confession"
- \`text\`: "Church adopts [confession name] as their doctrinal standard"
- \`source_url\`: URL where you found this
 - If the church qualifies the adoption (e.g., "subscribe for guidance but not absolute adherence"), include that nuance in the note text (short summary ≤30 words) in addition to the adoption label, e.g. "Church subscribes to [confession name] for guidance (not absolute adherence)".
If "🤝 Denomination/Network Affiliated" badge is present, add a note:
- \`label\`: "Denomination Affiliation" OR "Network Affiliation" (use "Network Affiliation" for fellowships/networks like FIRE, Acts 29, ARBCA; use "Denomination Affiliation" for traditional denominations like PCA, SBC)
- \`text\`: "Church is affiliated with [denomination/network name]" (include a brief description if provided, e.g., "Church is a member of FIRE (Fellowship of Independent Reformed Evangelicals), a network for independent Reformed baptistic churches")
- \`source_url\`: URL where you found this

Only add badges you have clear evidence for. Return empty array if none apply.`;

// ============================================================================
// Call 6: Red Flags & Final Analysis Prompt
// ============================================================================
export const RED_FLAGS_PROMPT = `${COMMON_RULES}

### Task: Detect Red Flags & Concerning Theological Indicators

Review all website content for the following red flag indicators.

STRICT BADGE OUTPUT RULES:
- Use ONLY the red flag badges listed below.
- Output them VERBATIM, including the emoji and exact wording.
- Do NOT create new badges or variants.
- If none apply, return an empty array []

Add badges ONLY if you have clear evidence, including the emoji. If none of the red flags apply but doctrinal information is sparse or absent, consider adding the informational badges listed at the end of this section.

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
- Church's **primary/adult worship services** marketed as entertainment venue
- Diluted or absent gospel presentation in main services
- Sermons focus on self-help rather than Scripture
- Heavy emphasis on production/performance over worship
- "Seeker-driven" model where biblical content is minimized to attract crowds
- **NOTE**: Youth and children's ministries naturally use engaging methods (games, activities, creative lessons) to reach their age group. Only flag if the church's MAIN worship services show entertainment-driven compromise, not based solely on youth/children's ministry descriptions.

**👩‍🏫 Ordained Women**:
- Women serving as **pastors**, **elders**, **bishops**, **priests**, or **reverends** (senior teaching/governing roles)
- NOT for women serving as deacons, staff, ministry leaders, or teachers in non-governing roles
- Look for titles like: "Pastor [Woman's name]", "Elder [Woman's name]", "Rev. [Woman's name]", "Bishop [Woman's name]", "Priestess", "Female clergy"
- Also check leadership pages for women in elder/pastor positions
- **IMPORTANT**: If you see "[Woman's Name] - Pastor of [any ministry area]" under "Pastoral Staff" → ADD THIS BADGE
- Examples that MUST trigger this badge:
  - "Courtney McLaughlin - Pastor of Missions"
  - "Sarah Johnson - Pastor of Children's Ministry"  
  - "Jane Doe - Teaching Pastor"
  - Any woman with "Pastor", "Elder", "Reverend", or "Bishop" in their official title

**🏳️‍🌈 LGBTQ Affirming**: 
Look for explicit affirmation in these contexts:
- **Membership**: "We welcome LGBTQ individuals into full membership"
- **Ordination**: LGBTQ individuals can serve as pastors/elders/clergy
- **Marriage**: Church performs/blesses same-sex marriages
- **Denominational policy**: Affiliated with denomination that permits these (and church doesn't disclaim it)

**Important**: Generic welcoming language like "all are welcome" is NOT sufficient. You need explicit inclusion in membership, leadership, or marriage contexts.

**CRITICAL false-positive guards for this badge:**
- If the site states or implies non-affirmation (e.g., "we will not affirm sin," "homosexuality/transgenderism is sin," "marriage is one man and one woman," "we do not perform same-sex marriages"), DO NOT add this badge.
- Mentions of "homosexuality" or "transgenderism" only in sin lists or in prohibitive contexts count as NON-affirming.
- If the only evidence is a general welcome (e.g., "everyone is welcome"), omit the badge.
- If denominational affiliation is affirming but the church explicitly rejects those policies, the church-level explicit rejection takes precedence → omit the badge.

Examples that DO count (add the badge):
- "We are an open and affirming church" (or equivalent "open & affirming," "affirming church").
- "We perform same-sex marriages" / "We bless same-sex unions."
- "LGBTQ+ persons are eligible for membership and leadership, including pastors/elders."

Examples that DO NOT count (omit the badge):
- "Marriage is between one man and one woman" (with or without proof texts).
- "We will not affirm sins including homosexuality and transgenderism."
- "We love all people" / "All are welcome" without membership/leadership/marriage specifics.

**⚠️ Open Theism**:
- Explicit denial of God's exhaustive foreknowledge
- Teaching that the future is not fully known by God
- God learning or changing His mind based on human actions
- Statements like "God doesn't know the future" or "God takes risks"

**⚠️ New Apostolic Reformation (NAR)**:
- Claims of modern-day apostles with governing authority over churches
- Prophetic movements with extra-biblical revelation
- Dominionism or Seven Mountains Mandate
- Apostolic networks or apostolic government structures

**⚠️ Progressive Christianity**:
- Explicit identification with Progressive Christianity movement
- Rejection of substitutionary atonement
- Denial of biblical inerrancy or authority
- Affirmation of universalism (all will be saved)
- Doctrine presented as culturally relative rather than binding truth

**⚠️ Religious Pluralism**:
- Teaching that multiple religions lead to God/salvation
- Interfaith worship or equivalence of religions
- "Many paths to God" or "All faiths are valid"
- Rejection of exclusivity of Christ for salvation

### Informational Badges (use only when applicable):
- **ℹ️ Minimal Doctrinal Detail**: Crawl-accessible pages lacked substantive doctrinal detail; site may impede crawling or does not present a published doctrinal statement online.
- **ℹ️ No Statement of Faith**: No statement of faith or doctrinal statement was found during crawl (no beliefs/statement-of-faith/confession pages detected).

### Notes:
For each red flag badge you add, create a note with:
- \`label\`: Name of the badge (e.g., "Prosperity Gospel", "LGBTQ Affirming", "New Apostolic Reformation (NAR)")
- \`text\`: Brief explanation of what you found (≤50 words)
- \`source_url\`: URL where you found this evidence

If NO red flags are found, return empty arrays for both badges and notes.`;
