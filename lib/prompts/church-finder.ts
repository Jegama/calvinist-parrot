export const EXTRACTION_INSTRUCTIONS = `### Extraction rules

**General**

* Work only from the provided pages. Never invent facts.
* Prefer explicit "we believe / we affirm / we teach" statements; capture **short quotes** (≤30 words) in \`notes\` with their \`source_url\`.
* If it clearly states "we do not believe X" or "we reject Y", mark that core doctrine as \`false\`.
* If a core doctrine is neither clearly affirmed nor denied, mark it as \`unknown\`.
* For any field, if not stated, use \`"null"\` (or \`"unknown"\` for doctrine booleans).
* Be precise and conservative: if in doubt, return \`unknown\`/\`null\` and avoid the badge.

**Basic fields**

* \`name\`: Church's official name (from any page header/footer).
* \`website\`: Use the \`base_url\`.
* \`addresses\`: Extract postal addresses from pages; split into \`street_1\` (e.g., "1303 Sherwood Forest St"), optional \`street_2\` (suite/building), \`city\`, \`state\`, \`post_code\`. Include the page URL in \`source_url\`.
* \`contacts\`: Prefer explicit phone/email text.
* \`service_times\`: Copy the visible strings (e.g., "Sundays 9:00 & 11:00 AM").
* \`best_pages_for\`: Pick the **best single URL** you saw for each:
  * \`beliefs\` (what we believe / doctrine / statement of faith)
  * \`confession\` (if they name or link a confession/standards/bylaws; else null)
  * \`about\` (about/mission/values/who we are)
  * \`leadership\` (elders/staff/team)

**Core doctrines (booleans as strings)**
For each key below, set \`"true"\`, \`"false"\`, or \`"unknown"\`:

**Secondary & Tertiary**

* Provide **neutral** short phrases only from text you saw. Examples:
  * \`baptism\`: "infant (paedo)", "believer's by immersion", "both infant & believer's", etc.
  * \`governance\`: "elder-led congregational", "presbyterian", "episcopal", "ambiguous".
  * \`lords_supper\`: "memorial", "spiritual presence", "real presence / sacramental union".
  * \`gifts\`: "cessationist", "cautious continuationist", "charismatic".
  * \`women_in_church\`: "complementarian", "egalitarian", "varies/unclear".
  * \`sanctification\`: "progressive", "entire sanctification", "positional & progressive".
  * \`continuity\`: "covenant theology", "dispensationalism", "mixed/unclear".
  * \`security\`: "perseverance of the saints", "conditional security", "mixed/unclear".
  * \`atonement_model\`: "penal substitution", "Christus Victor", "moral influence", etc.
  * \`eschatology\`: "amillennial", "premillennial", "postmillennial", "mixed/unclear".
  * \`worship_style\`: "traditional", "contemporary", "blended/mixed".
  * \`counseling\`: "nouthetic (biblical)", "integrationist", etc.
  * \`creation\`: "young-earth", "old-earth", "theistic evolution".
  * \`christian_liberty\`: "dietary freedom", "special days observed", etc.
  * \`discipline\`: "formal church discipline", "informal", etc.
  * \`parachurch\`: "supports parachurch ministries", "no parachurch involvement", etc.

**Confession detection & inference**

* If they **adopt** a historic confession (e.g., "Our confession of faith is the Second London Baptist Confession (1689)"), say that for a "fuller summation of our doctrinal basis" or "to understand our beliefs more deeply", set:
  * \`confession.adopted = true\`, \`confession.name\`, \`confession.source_url\`.
  * **Mark all core doctrines \`true\` by inference**, unless you find an **explicit denial** on-site.
  * **Infer Secondary & Tertiary Doctrines:** Based on the adopted confession, infer the secondary and tertiary doctrines using the following mapping:
    * **Westminster Confession of Faith (1646/47):** Assume Presbyterian distinctives (paedobaptism, presbyterian governance).
    * **Second London Baptist Confession (1689):** Assume Reformed Baptist distinctives (credobaptism, elder-led congregationalism).
    * **Belgic Confession, Heidelberg Catechism, Canons of Dort:** Assume continental Reformed distinctives (similar to Presbyterian).
    * **Other Confessions (Second Helvetic, Irish Articles, Savoy, First London Baptist):** Use your best judgment to align with either the Presbyterian or Reformed Baptist profile based on the confession's historical context.
  * Record a \`note\` with \`label: "Adopted Confession"\` and text:
    "Essentials inferred from adopted confession ({confession.name}); see {confession.source_url}."
  * For any core doctrine you can confirm **explicitly on-site**, set it accordingly; else \`unknown\`.
  * Record a \`note\` with \`label: "Inferred from Confession"\` and text: "Essentials inferred from adopted confession (1689 LBCF); not listed individually on this page."
  * Only the following confessions count for this inference:
    * Westminster Confession of Faith (1646/47)
    * Second London Baptist Confession (1689)
    * Belgic Confession (1561) + Heidelberg Catechism (1563) + Canons of Dort (1619)
    * Second Helvetic Confession (1566)
    * Irish Articles (1615)
    * Savoy Declaration (1658)
    * First London Baptist Confession (1644)
* If they **reference** a historic confession (e.g., "We hold to the Westminster Confession of Faith (1646/47) in many areas"), but do not fully adopt it, set:
  * \`confession.adopted = false\`, \`confession.name\`, \`confession.source_url\`.
  * **Do NOT** mark core doctrines \`true\` by inference.

**Denomination**

* \`label\`: your best guess (e.g., "Reformed Baptist", "Presbyterian", "Lutheran", "Anglican", "Wesleyan", "Pentecostal", "Non-denominational", "Roman Catholic", "Orthodox", "Eastern Orthodox", "Mormon", "Jehovah's Witness", "Christian Science", etc.).
* \`signals\`: short reasons (e.g., "credo-baptism", "elder-led congregational", "WCF referenced", "Augsburg/Concord", "episcopal polity", "charismatic").
* \`confidence\`: 0–1.

**Badges (use exactly these labels/emojis)**

* \`✅ Confessional Seal\` — if \`confession.adopted=true\`.
* \`⚠️ Low Essentials Coverage\` — if \`coverage_ratio < 0.5\` **and** \`confession.adopted=false\`.
* \`🕊️ Cautious Continuationist\` — if gifts are stated as continued but restrained.
* \`🔥 Charismatic\` — if tongues/prophecy/healing are normative.
* \`❓ Unknown\` — if the church's position on a doctrine is not stated or is unclear.
* \`🚫 We Cannot Endorse\` — if the church **denies** any core doctrine (i.e., any core doctrine is \`false\`).
* \`🏳️‍🌈 LGBTQ Affirming\` — **if** site language indicates welcoming/affirming **membership**, **ordination**, or **marriage/blessing** of same-sex couples, or have women "elders" or "pastors", or if the church clearly affiliates with a denomination that officially permits these **and the church does not disclaim it**.
  * Treat language like "we welcome all people" as **not sufficient** for LGBTQ-affirming. You need explicit inclusion in **membership**, **ordination**, or **marriage/blessing** contexts—or a clear denominational policy without local disclaimer.`;
