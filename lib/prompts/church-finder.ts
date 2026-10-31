import { CORE_DOCTRINES_DEFINITIONS } from "./core-doctrines-definitions";
import { SECONDARY_DOCTRINES_DEFINITIONS } from "./secondary-doctrines-definitions";
import { TERTIARY_DOCTRINES_DEFINITIONS } from "./tertiary-doctrines-definitions";
import { HISTORIC_REFORMED_CONFESSIONS } from "../church-evaluation/policy";
import { CORE_DOCTRINE_KEYS } from "../schemas/church-finder";

// ============================================================================
// Common extraction rules for all calls
// ============================================================================
const COMMON_RULES = `### General Extraction Rules

STRICT OUTPUT:
- Return JSON only that conforms exactly to the provided schema for this call.
- Do not include Markdown, explanations, comments, or extra keys not in the schema.
- Use absolute URLs from the provided content when populating any URL field.
- Keep all schema keys, doctrine statuses, and allowed badge labels in their required canonical English form even when the source content is not English.

EVIDENCE AND CONSERVATISM:
- Analyze official church content semantically in whatever language it is written. Never require an English keyword, URL word, office title, honorific, pronoun, or phrase to recognize a concept.
- Work only from the provided pages. Never invent or infer beyond explicit statements.
- If a value is not clearly stated, return \`null\` (or \`"unknown"\` for doctrine booleans).
- Every \`notes[].text\` value must be only one short verbatim excerpt from the cited page, not an explanation, translation, or paraphrase.
- Preserve evidence quotations exactly in their original source language. Do not translate them into English.

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

**affiliation_pages**: Up to four distinct official church page URLs to fetch for denominational, association, convention, or network relationships.
- Discover candidates semantically from the supplied page content, navigation, hyperlinks, and surrounding context in any language. A candidate may be linked from a provided page even when its own body has not been fetched yet.
- Follow the meaning of the relationship described, not a list of organization names, English keywords, or URL patterns. Include relevant pages regardless of the language or wording of their titles and paths.
- Use only URLs actually present in the provided content, resolving relative hyperlinks against their page URL. Never invent a path or guess a destination from an organization name.
- A navigation link is a discovery lead, not evidence that the church belongs to an organization. Select the target for inspection; do not infer affiliation from the label.
- Prefer the church's own statements of membership or cooperation. Return [] when no candidate can be identified.

ADDITIONAL GUIDANCE:
- Choose pages by their semantic content in the source language, not by English words in the URL or page title.
- Prefer “Contact/Visit/Plan Your Visit” pages for addresses when available; avoid map widgets without text unless they clearly display a postal address.
- Exclude P.O. Boxes if a physical address is available; if only a P.O. Box is present, include it.
- For leadership, prefer pages listing elders/pastors over general staff directories.

If you cannot find a suitable page for a \`best_pages_for\` category, set that field to \`null\`. For \`affiliation_pages\`, return an empty array rather than \`null\`.`;

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
- Interpret the doctrine definitions semantically in the source language. English terminology in these instructions is descriptive, not a required keyword list.
- Explicit evidence does not require a canonical technical term. A concrete statement counts when its ordinary semantic meaning necessarily affirms the claim through equivalent descriptions, events, attributes, relationships, or consequences.
- Do not treat a Bible citation by itself, denominational reputation, institutional affiliation, a person's education, absence of a denial, or a merely possible implication as an affirmation.
- For a doctrine whose name or definition combines multiple claims, \`"true"\` requires source-grounded evidence whose ordinary semantic meaning establishes EVERY required component. Do not award partial credit by treating one component as the entire doctrine.
- Evidence may be combined across official pages, but every required component must be supported by a source-grounded note. If only part of a composite doctrine is stated, return \`"unknown"\`.
- A single rich statement or passage may support multiple doctrine labels when its specific clauses independently establish each definition. Reuse the shortest exact excerpt under each applicable label; the safeguard is against stretching vague evidence, not against legitimate reuse of explicit evidence.

**Notes Array:**
For each doctrine you mark as \`"true"\` or \`"false"\`, capture one or more notes with:
- \`label\`: Name of the doctrine (e.g., "trinity", "scripture_authority", "resurrection_of_jesus")
- \`text\`: Short, verbatim quote (≤30 words) from the website showing the belief (no paraphrases)
- \`source_url\`: URL where you found this statement

When a composite doctrine needs more than one excerpt, return multiple notes with the same doctrine label so that every component is evidenced.

Published confession text adopted as the church's doctrinal standard is the church's own doctrinal evidence. Read it semantically like any other statement of faith. If only an adoption statement is available, leave doctrines without direct quotations unknown in this call; the separate confession assessment records affirmation through adoption. Do not mistake missing repetition on a summary page for absence of the church's confessed beliefs.

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
- Distinguish theological tradition from organizational affiliation. Do not claim organizational membership in the label or signals unless the explicit relationship evidence below establishes it.

**Affiliation evidence:**
Return \`affiliations\` as an array of assessments of named organizations mentioned in the provided official church content. Return [] if none can be assessed. Each item must include:
- \`organization\`: The organization's name as published, preserving its source language.
- \`relationship\`: One of \`current_affiliation\`, \`past_affiliation\`, \`no_affiliation\`, \`resource_or_mention\`, or \`unclear\`.
- \`text\`: One short verbatim original-language quotation (at most 500 characters) from the cited page. For current affiliation, the quotation must explicitly connect this church to the named organization through present membership, affiliation, or ongoing formal cooperation. Preserve the subject, relationship, negation, and time qualifications. Do not return just the organization's name.
- \`source_url\`: The provided page containing that exact quotation.

Assess the relationship semantically in its source language; never use an English keyword list, acronym allowlist, or organization-specific rule. Only \`current_affiliation\` establishes the affiliation badge. A menu label, logo, bare link, resource recommendation, shared theology, pastor's education, or description of another church does not establish this church's affiliation. Classify those as \`resource_or_mention\` or \`unclear\`, even when the link points to a well-known organization. An explicit withdrawal or former membership is \`past_affiliation\`; an explicit denial of membership is \`no_affiliation\`. If the supplied content conflicts about whether the relationship is current, use \`unclear\` unless an explicit dated update resolves it.

Read fetched candidate pages for the actual relationship statement. Failure to fetch a candidate is not permission to infer affiliation from its navigation label. Autonomous governance does not exclude a published cooperative affiliation; assess the actual relationship. Do not substitute an adopted confession or a generic description of an organization for a statement connecting this church to that organization.

**Confession:**
Determine if the church **adopts** a historic confession as their doctrinal standard.

Interpret adoption language semantically in the source language. The English examples below are illustrations only; equivalent statements in any language count, and no English wording is required.

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

**ONLY These Historic Confessions Are Valid:**
${HISTORIC_REFORMED_CONFESSIONS.map((name) => `- ${name}`).join("\n")}

**ACCEPTABLE VARIATIONS / MATCHING GUIDANCE:**
- Accept small variations in the confession name and date formatting (e.g., "First London Baptist Confession of Faith (2nd Ed. 1646)", "First London Confession (1644-1646)", "First London Baptist Confession (1644/46)").
- Accept common short forms such as "First London Baptist Confession", "First London Confession", or inclusion of edition notes like "2nd Ed. 1646".
- Recognize equivalent names in any source language, but return the exact canonical name from the list above in \`name\`.

**DEALING WITH QUALIFIED SUBSCRIPTIONS:**
- If the site uses qualifying language (e.g., "subscribe for guidance but not absolute adherence", "subscribe for guidance", "affirm as sound teaching"), still mark \`adopted = true\` because the confession is being presented as the church's doctrinal guide. In this case, add a clarifying note that preserves the nuance (see Notes below).

**Core doctrine affirmation through adoption:**
- Return \`affirmed_core_doctrines\` as an array drawn only from these canonical keys: ${CORE_DOCTRINE_KEYS.join(", ")}.
- Explicit adoption of a recognized historic confession is published doctrinal evidence, even when the church links to the confession on another website instead of repeating its articles. This is adoption of stated beliefs, not an assumption from denomination or reputation. For this field only, you may use the established doctrinal content of the recognized confession to interpret the church's source-grounded adoption statement.
- Full subscription to the Second London Baptist Confession (1689) affirms all ten core doctrines. Its chapters 1, 2, 8, 11, 20, 31, and 32 address Scripture, God and the Trinity, Christ and His saving work, justification, the gospel, resurrection, and judgment. Assess other listed confessions against the same core definitions.
- Read every published qualification and exception semantically in the source language. Include only doctrines that the church's actual subscription affirms. Exclude a doctrine if the church disclaims it, permits disagreement about it, or leaves its adherence ambiguous. Unspecified exceptions or mere use as a general guide cannot establish all ten; when their scope is unclear, return an empty array. An exception confined to a secondary matter does not erase affirmation of unrelated core doctrines.
- A less demanding membership requirement does not cancel the church's stated doctrinal standard or its elders' subscription. Likewise, minor wording qualifications do not cancel substantive affirmation.
- For historical discussion, a resource link without adoption, an unrecognized confession, or \`adopted = false\`, return an empty array. Never infer core affirmation from affiliation alone.
- Keep the adoption quotation verbatim under \`Adopted Confession\`; do not fabricate separate doctrinal quotations from a confession that is not in the provided pages.

Core definitions for this assessment:
${CORE_DOCTRINES_DEFINITIONS}

**CRITICAL REJECTIONS - Mark \`adopted = false\` for these:**
- Baptist Faith and Message (2000 Edition / BFM 2000) - Southern Baptist Convention statement, NOT a historic Reformed confession. While biblically sound, it accommodates both Reformed and Arminian soteriology within the SBC. **Special handling:** Set \`name\` to "Baptist Faith and Message (2000 Edition)", note in denomination field as "Baptist (SBC affiliated/BFM 2000)", and mark \`adopted = false\`. This permits known secondary-position mapping without granting the Reformed badge or filling unsupported core doctrines.
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

- **🤝 Denomination/Network Affiliated**: Only when \`affiliations\` contains a \`current_affiliation\` assessment supported by an explicit original-language quotation connecting this church to a named denominational body, network, fellowship, convention, or association. This includes formal membership, mutual accountability, ongoing cooperative missions, credentialing, or structured fellowship. An organization's name alone is not sufficient evidence. Interpret the relationship itself, regardless of how the organization describes its members' autonomy.

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

**COMMON CONFUSION**: Churches may describe themselves as autonomous while also belonging to a network or fellowship. In these cases, prioritize an explicitly evidenced current affiliation over the general self-description.

**Notes:**
If \`adopted = true\`, add a note:
- \`label\`: "Adopted Confession"
- \`text\`: One short verbatim original-language quotation that explicitly shows adoption, including any qualification in the source wording
- \`source_url\`: URL containing that exact quotation
Record affiliation evidence in \`affiliations\`; do not duplicate it in \`notes\`. A validated current relationship will supply the displayed affiliation note and badge.

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

**CRITICAL false-positive guard for ⚠️ Prosperity Gospel**:
- Do NOT add this badge for normal stewardship, generosity, tithing, or fundraising/capital campaign language (e.g., "Sow to Reap", "harvest", "sowing into God's work", "we met our goal", building/kids/community initiatives) unless the church explicitly teaches that giving/faith will reliably produce personal wealth/health or guarantees material blessing.
- The mere presence of agricultural metaphors from Scripture ("sow/reap") is NOT sufficient evidence by itself.
- If the only evidence is a giving campaign description without promises of personal enrichment, omit the badge.

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
- Apply these rules semantically in the source language. The English titles and examples below illustrate qualifying clergy offices but are never required keywords.
- Add this badge ONLY when the same specifically named person is explicitly connected to both (1) a qualifying ordained/clergy office such as pastor, elder, reverend, bishop, or priest and (2) explicit textual female identity.
- This is about the woman's *office/title*, not about general church governance language.
- Textual female identity may be established by a source-language gendered title or honorific, pronoun, grammatical gender signal, or explicit statement that clearly refers to that same named officeholder. Do not infer gender from a first name or photograph.
- The office title must be directly attached to the specific woman's name. A generic "Elders/Pastors" section heading above couples or families is not enough.
- Do NOT infer that a pastor's or elder's wife holds office because a couple is shown together or because elders/pastors "serve together alongside their wives."
- NOT for women serving as deacons/deaconesses, staff, ministry leaders/directors, committee members, board/council roles, or teachers in non-governing roles.
- Do NOT infer this badge from phrases like "elder-led" / "elder-directed" / "elder-governed" unless the page explicitly lists women as elders.
- Do NOT infer this badge from "Chair" / "Vice-Chair" / "Secretary" / "Treasurer" unless the page explicitly identifies that woman as an Elder/Pastor/Rev/Bishop/Priest.
- Source-language forms equivalent to "Pastor [Woman's name]", "[Woman's name] — Pastor of ___", "Elder [Woman's name]", "Rev. [Woman's name]", "Bishop [Woman's name]", or "Priest [Woman's name]" qualify only when the same-person textual female-identity requirement is also met.
- **IMPORTANT**: If you see "[Woman's Name] - Pastor of [any ministry area]" under "Pastoral Staff" → ADD THIS BADGE.
- **CRITICAL false-positive guard**: If women are listed under "Deacons and Deaconesses" / "Deaconesses" / "Deaconess" (or similar) WITHOUT an Elder/Pastor/Rev/Bishop/Priest title, DO NOT add this badge.
- Examples that MUST trigger this badge:
  - "Courtney McLaughlin - Pastor of Missions"
  - "Sarah Johnson - Pastor of Children's Ministry"
  - "Jane Doe - Teaching Pastor"
  - "Elder Sarah Johnson" / "Rev. Jane Doe" / "Bishop Mary Smith"

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
- \`text\`: One short verbatim quotation in the original source language that directly establishes the badge; do not add explanatory framing
- \`source_url\`: URL containing that exact quotation

For the **👩‍🏫 Ordained Women** badge specifically, the one exact original-language quotation must connect the same named person to both the qualifying clergy office and textual female identity. If the site gives only a name/title, photograph, couple listing, generic leadership heading, wife relationship, or non-clergy role, DO NOT add the badge.

If NO red flags are found, return empty arrays for both badges and notes.`;
