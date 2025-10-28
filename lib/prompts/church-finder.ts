import { CORE_DOCTRINES_DEFINITIONS } from "./core-doctrines-definitions";
import { SECONDARY_DOCTRINES_DEFINITIONS } from "./secondary-doctrines-definitions";
import { TERTIARY_DOCTRINES_DEFINITIONS } from "./tertiary-doctrines-definitions";

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
- \`text\`: Short quote (≤30 words) from the website showing the belief
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
5. **women_in_church**
6. **sanctification**
7. **continuity**
8. **security**
9. **atonement_model**

Use the neutral phrases suggested in the definitions above (e.g., "Believer's baptism by immersion", "Elder-led congregational", etc.).

### Badges to Detect (add to badges array if applicable including the emoji including the emoji):

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
8. **non_essential** (optional catch-all field)

Use the neutral phrases suggested in the definitions above (e.g., "Amillennial", "Contemporary", "Not stated", etc.).

### Badges to Detect (add to badges array if applicable including the emoji):

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

**Mark \`adopted = true\` if you find ANY of these indicators:**

1. **Direct adoption language:**
   - "Our confession of faith is..."
   - "We adopt/subscribe to the [confession name]"
   - "We hold to the [confession name] as our doctrinal standard"
   - "[Confession name] is our confession"

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
- Westminster Confession of Faith (1646/47)
- Second London Baptist Confession (1689)
- First London Baptist Confession (1644)
- Belgic Confession (1561) + Heidelberg Catechism (1563) + Canons of Dort (1619)
- Second Helvetic Confession (1566)
- Irish Articles (1615)
- Savoy Declaration (1658)

**CRITICAL REJECTIONS - Mark \`adopted = false\` for these:**
- ECO Essential Tenets (2012) - Modern progressive confession, NOT historic Reformed
- Book of Confessions (PCUSA/ECO collection) - Contains problematic modern confessions (Confession of 1967, Belhar)
- Any confession not explicitly listed above
- Any modern (post-1700) confessions or statements
- Denominational statements that are not historic Reformed confessions

### Badges to Detect (add to badges array if applicable including the emoji):

- **🤝 Denomination-Affiliated**: If the church is a member of, affiliated with, or part of ANY formal denominational body, network, fellowship, or association. This includes:
  - Traditional denominations: PCA, OPC, SBC, LCMS, CREC, RPCNA, ARP, etc.
  - Reformed networks/fellowships: ARBCA (Association of Reformed Baptist Churches of America), FIRE (Fellowship of Independent Reformed Evangelicals), Acts 29, Sovereign Grace Churches, etc.
  - Any organization that provides: formal membership, mutual accountability, cooperative missions, credentialing, or structured fellowship
  - **CRITICAL**: Even if the network uses "independent" in its name (e.g., FIRE = Fellowship of **Independent** Reformed Evangelicals), it still counts as denominational affiliation because the church is part of a formal network with membership requirements and mutual support structures

- **🆓 Independent**: If the church is **truly autonomous** with NO formal denominational ties, networks, fellowships, or associations. The church must:
  - Have no formal membership in any denomination, network, or fellowship
  - Operate with complete autonomy (no external accountability structure)
  - Not participate in cooperative denominational missions or credentialing
  - Be explicitly described as "independent" or "non-denominational" WITHOUT belonging to any named network
  - **CRITICAL**: If the church mentions being part of ANY network, fellowship, association, or cooperative body → DO NOT use this badge, use 🤝 Denomination-Affiliated instead

- **🏠 House Church**: If church meets in homes (no dedicated building)
- **🏢 Multi-Site**: If one church with multiple campuses/locations
- **👥 Small Church**: If stated membership is under 100
- **🏟️ Megachurch**: If stated membership/attendance is over 2000

**IMPORTANT**: 🤝 Denomination-Affiliated and 🆓 Independent are **mutually exclusive**. Add only ONE of these badges:
- If the church has ANY denominational oversight/affiliation/network/fellowship membership → use 🤝 Denomination-Affiliated
- If the church is explicitly autonomous with NO formal ties to ANY network/denomination → use 🆓 Independent  
- If unclear → omit both

**COMMON CONFUSION**: Churches may describe themselves as "independent" while also being part of a network/fellowship. In these cases, ALWAYS prioritize the network affiliation over the self-description. A church that is "independent Baptist but part of ARBCA" should get 🤝 Denomination-Affiliated, NOT 🆓 Independent.

**Notes:**
If \`adopted = true\`, add a note:
- \`label\`: "Adopted Confession"
- \`text\`: "Church adopts [confession name] as their doctrinal standard"
- \`source_url\`: URL where you found this
If "🤝 Denomination-Affiliated" badge is present, add a note:
- \`label\`: "Denomination Affiliation" OR "Network Affiliation" (use "Network Affiliation" for fellowships/networks like FIRE, Acts 29, ARBCA; use "Denomination Affiliation" for traditional denominations like PCA, SBC)
- \`text\`: "Church is affiliated with [denomination/network name]" (include a brief description if provided, e.g., "Church is a member of FIRE (Fellowship of Independent Reformed Evangelicals), a network for independent Reformed baptistic churches")
- \`source_url\`: URL where you found this

Only add badges you have clear evidence for. Return empty array if none apply.`;

// ============================================================================
// Call 6: Red Flags & Final Analysis Prompt
// ============================================================================
export const RED_FLAGS_PROMPT = `${COMMON_RULES}

### Task: Detect Red Flags & Concerning Theological Indicators

Review all website content for the following red flag indicators. Add badges ONLY if you have clear evidence, including the emoji:

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

### Notes:
For each red flag badge you add, create a note with:
- \`label\`: Name of the badge (e.g., "Prosperity Gospel", "LGBTQ Affirming")
- \`text\`: Brief explanation of what you found (≤50 words)
- \`source_url\`: URL where you found this evidence

If NO red flags are found, return empty arrays for both badges and notes.`;
