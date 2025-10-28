# Evaluation Plan: Church Doctrinal Extraction
This plan outlines how to extract doctrinal and metadata information about a Christian church from its website using Tavily and subsequent processing.

## 1. Tavily crawl

```javascript
// To install: npm i @tavily/core
const { tavily } = require('@tavily/core');
const client = tavily({ apiKey: "tvly-dev-*****" });
client.crawl("https://www.c3houston.org/", {
    instructions: "I need the following:\n1. doctrinal statement, their beliefs, doctrine, teaching statement, or statement of faith.\n2. The address of the church/main campus.\n3. Their pastors and elders.",
    max_depth=2,
    extract_depth="advanced",
    allow_external=False
})
.then(console.log);
```

## 2. Minimal duplicate cleaner (two-pass, no hard-coding)

### Purpose
Remove near-duplicate pages that differ only by URL anchors (i.e., `#section`) while retaining unique content. This helps ensure that the subsequent LLM extraction step works from a clean set of pages without redundant fragments.

Behavior:
1. Split results into **clean** (no `#`) vs **fragmented** (has `#`).
2. Keep all **clean**.
3. For each **fragmented** item, **drop** it if its normalized text is contained in **any** clean page's text; **keep** it otherwise.
4. Also de-dupe by **URL (after stripping whitespace)** and **content hash** to remove exact repeats.

```python
import re, hashlib
from typing import Dict, Any, List

def _norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()

def _content_hash(text: str) -> str:
    return hashlib.sha256(_norm_text(text).encode("utf-8")).hexdigest()

def drop_anchor_dupes(tavily_json: Dict[str, Any]) -> Dict[str, Any]:
    results = tavily_json.get("results", [])
    if not results:
        return tavily_json

    # Partition
    clean = []
    frag = []
    for r in results:
        url = (r.get("url") or "").strip()
        txt = _norm_text(r.get("raw_content") or "")
        if not url or not txt:
            continue
        ((frag if "#" in url else clean)).append({"url": url, "raw": txt, "favicon": r.get("favicon")})

    # Precompute clean corpus for containment checks
    clean_hashes = set()
    clean_texts = []
    url_seen = set()
    out: List[Dict[str, Any]] = []

    for c in clean:
        if c["url"] in url_seen:
            continue
        h = _content_hash(c["raw"])
        if h in clean_hashes:
            continue
        url_seen.add(c["url"])
        clean_hashes.add(h)
        clean_texts.append(c["raw"])
        out.append({"url": c["url"], "raw_content": c["raw"], "favicon": c["favicon"]})

    # Second pass: keep fragments only if they add content beyond clean pages
    frag_hashes = set()
    for f in frag:
        if f["url"] in url_seen:
            continue
        h = _content_hash(f["raw"])
        if h in frag_hashes or h in clean_hashes:
            continue
        # Containment test: if any clean text fully contains this fragment's text, drop it
        is_subsumed = any(f["raw"] and f["raw"] in ct for ct in clean_texts)
        if is_subsumed:
            continue
        url_seen.add(f["url"])
        frag_hashes.add(h)
        out.append({"url": f["url"], "raw_content": f["raw"], "favicon": f["favicon"]})

    return {
        "base_url": tavily_json.get("base_url"),
        "results": out,
        "response_time": tavily_json.get("response_time"),
        "request_id": tavily_json.get("request_id"),
    }
```

## 3. LLM doctrinal extraction

### Output schema

```json
{
  "church": {
    "name": "string|null",
    "website": "url",
    "addresses": [
      {
        "street_1": "string|null",
        "street_2": "string|null",
        "city": "string|null",
        "state": "string|null",
        "post_code": "string|null",
        "source_url": "url|null"
      }
    ],
    "contacts": { "phone": "string|null", "email": "string|null" },
    "service_times": ["string"],
    "best_pages_for": {
      "beliefs": "url|null",
      "confession": "url|null",
      "about": "url|null",
      "leadership": "url|null"
    },
    "denomination": {
      "label": "string|null",
      "confidence": 0.0,
      "signals": ["string"]
    },
    "confession": {
      "adopted": false,
      "name": "string|null",
      "source_url": "url|null"
    },
    "core_doctrines": {
      "trinity": "true|false|unknown",
      "gospel": "true|false|unknown",
      "justification_by_faith": "true|false|unknown",
      "christ_deity_humanity": "true|false|unknown",
      "scripture_authority": "true|false|unknown",
      "incarnation_virgin_birth": "true|false|unknown",
      "atonement_necessary_sufficient": "true|false|unknown",
      "resurrection_of_jesus": "true|false|unknown",
      "return_and_judgment": "true|false|unknown",
      "character_of_god": "true|false|unknown"
    },
    "secondary": {
      "baptism": "string|null",
      "governance": "string|null",
      "lords_supper": "string|null",
      "gifts": "string|null",
      "women_in_church": "string|null",
      "sanctification": "string|null",
      "continuity": "string|null",
      "security": "string|null",
      "atonement_model": "string|null"
    },
    "tertiary": {
      "eschatology": "string|null",
      "worship_style": "string|null",
      "counseling": "string|null",
      "creation": "string|null",
      "christian_liberty": "string|null",
      "discipline": "string|null",
      "parachurch": "string|null"
    },
    "badges": ["string"],
    "notes": [{ "label": "string", "text": "string", "source_url": "url" }]
  }
}
```

### Extraction rules

**General**

* Work only from the provided pages. Never invent facts.
* Prefer explicit "we believe / we affirm / we teach" statements; capture **short quotes** (≤30 words) in `notes` with their `source_url`.
* If it clearly states "we do not believe X" or "we reject Y", mark that core doctrine as `false`.
* If a core doctrine is neither clearly affirmed nor denied, mark it as `unknown`.
* For any field, if not stated, use `"null"` (or `"unknown"` for doctrine booleans).
* Be precise and conservative: if in doubt, return `unknown`/`null` and avoid the badge.

**Basic fields**

* `name`: Church's official name (from any page header/footer).
* `website`: Use the `base_url`.
* `addresses`: Extract postal addresses from pages; split into `street_1` (e.g., "1303 Sherwood Forest St"), optional `street_2` (suite/building), `city`, `state`, `post_code`. Include the page URL in `source_url`.
* `contacts`: Prefer explicit phone/email text.
* `service_times`: Copy the visible strings (e.g., "Sundays 9:00 & 11:00 AM").
* `best_pages_for`: Pick the **best single URL** you saw for each:
  * `beliefs` (what we believe / doctrine / statement of faith)
  * `confession` (if they name or link a confession/standards/bylaws; else null)
  * `about` (about/mission/values/who we are)
  * `leadership` (elders/staff/team)

**Confession detection & inference**

* If they **adopt** a historic confession (e.g., "Our confession of faith is the Second London Baptist Confession (1689)"), set:
  * `confession.adopted = true`, `confession.name`, `confession.source_url`.
  * **Mark all core doctrines `true` by inference**, unless you find an **explicit denial** on-site.
  * Record a `note` with `label: "inferred_from_confession"` and text:
    "Essentials inferred from adopted confession (1689 LBCF); not listed individually on this page."
  * Only the following confessions count for this inference:
    * Westminster Confession of Faith (1646/47)
    * First London Baptist Confession (1644)
    * Second London Baptist Confession (1689)
    * Belgic Confession (1561) + Heidelberg Catechism (1563) + Canons of Dort (1619)
    * Second Helvetic Confession (1566)
    * First Helvetic Confession (1536)
    * Scots Confession (1560)
    * French (Gallican) Confession (1559)
    * Irish Articles (1615)
    * Savoy Declaration (1658)
    * Consensus Tigurinus (1549)
    * Thirty-Nine Articles (1571) — Anglican but historically Calvinistic in soteriology

**Core doctrines (booleans as strings)**
For each key below, set `"true"`, `"false"`, or `"unknown"`:

* `trinity` (one God in three persons)
* `gospel` (death, burial, bodily resurrection for our sins)
* `justification_by_faith` (by grace through faith in Christ alone; not by works)
* `christ_deity_humanity` (fully God and fully man)
* `scripture_authority` (inerrant/infallible/ultimate authority/sufficient)
* `incarnation_virgin_birth` (miraculous conception by HS, born of virgin)
* `atonement_necessary_sufficient` (penal/substitution/propitiation language counts toward "true")
* `resurrection_of_jesus` (bodily)
* `return_and_judgment` (second coming & final judgment)
* `character_of_god` (attributes: holy, just, loving, merciful, sovereign, wrath against sin, etc.)

**Secondary & Tertiary**

* Provide **neutral** short phrases only from text you saw. Examples:
  * `baptism`: "infant (paedo)", "believer's by immersion", "both infant & believer's", etc.
  * `governance`: "elder-led congregational", "presbyterian", "episcopal", "ambiguous".
  * `lords_supper`: "memorial", "spiritual presence", "real presence / sacramental union".
  * `gifts`: "cessationist", "cautious continuationist", "charismatic".
  * `women_in_church`: "complementarian", "egalitarian", "varies/unclear".
  * `sanctification`: "progressive", "entire sanctification", "positional & progressive".
  * `continuity`: "covenant theology", "dispensationalism", "mixed/unclear".
  * `security`: "perseverance of the saints", "conditional security", "mixed/unclear".
  * `atonement_model`: "penal substitution", "Christus Victor", "moral influence", etc.
  * `eschatology`: "amillennial", "premillennial", "postmillennial", "mixed/unclear".
  * `worship_style`: "traditional", "contemporary", "blended/mixed".
  * `counseling`: "nouthetic (biblical)", "integrationist", etc.
  * `creation`: "young-earth", "old-earth", "theistic evolution".
  * `christian_liberty`: "dietary freedom", "special days observed", etc.
  * `discipline`: "formal church discipline", "informal", etc.
  * `parachurch`: "supports parachurch ministries", "no parachurch involvement", etc.

**Denomination**

* `label`: your best guess (e.g., "Reformed Baptist", "Presbyterian", "Lutheran", "Anglican", "Wesleyan", "Pentecostal", "Non-denominational", "Roman Catholic", "Orthodox", "Eastern Orthodox", "Mormon", "Jehovah's Witness", "Christian Science", etc.).
* `signals`: short reasons (e.g., "credo-baptism", "elder-led congregational", "WCF referenced", "Augsburg/Concord", "episcopal polity", "charismatic").
* `confidence`: 0–1.

**Badges (use exactly these labels/emojis)**

* `✅ Confessional Seal` — if `confession.adopted=true`.
* `⚠️ Low Essentials Coverage` — if `coverage_ratio < 0.5` **and** `confession.adopted=false`.
* `🕊️ Cautious Continuationist` — if gifts are stated as continued but restrained.
* `🔥 Charismatic` — if tongues/prophecy/healing are normative.
* `❓ Unknown` — if the church's position on a doctrine is not stated or is unclear.
* `🚫 We Cannot Endorse` — if the church **denies** any core doctrine (i.e., any core doctrine is `false`).
* `🏳️‍🌈 LGBTQ Affirming` — **if** site language indicates welcoming/affirming **membership**, **ordination**, or **marriage/blessing** of same-sex couples, or have women "elders" or "pastors", or if the church clearly affiliates with a denomination that officially permits these **and the church does not disclaim it**.
  * Treat language like "we welcome all people" as **not sufficient** for LGBTQ-affirming. You need explicit inclusion in **membership**, **ordination**, or **marriage/blessing** contexts—or a clear denominational policy without local disclaimer.

## 4. Post-processing logic

**Core doctrine counts**
* Compute `core_on_site_count` as the number of core doctrines marked `"true"`.
* Set `core_total_count = 10`.
* Compute `coverage_ratio = core_on_site_count / core_total_count`.

**Status (overall)**
* Compute `status` as:
  * `pass` if `confession.adopted=true` **or** `coverage_ratio ≥ 0.7`.
  * `caution` if `0.5 ≤ coverage_ratio < 0.7` **and** no core doctrine is `false`.
  * `red_flag` if `coverage_ratio < 0.5` **or** any core doctrine is `false` **or** if `🏳️‍🌈 LGBTQ Affirming` badge is present **or** `🚫 We Cannot Endorse` badge is present.
* Edge case: If the beliefs page **only** declares 1689 (or another historic confession) and doesn't list essentials:
  * Set all essentials `true` **by inference** (do not count them toward `core_on_site_count`), keep `status=pass`, add the `inferred_from_confession` note.