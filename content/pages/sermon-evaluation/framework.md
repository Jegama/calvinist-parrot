# **Sermon Evaluation Framework**

This framework defines a two–step process for evaluating Christian sermons (expository / Christ‑centered) in a structured, reproducible way. It is shaped by the homiletical theology of Bryan Chappell's *Christ-Centered Preaching* and stresses that faithful proclamation both explains **what the Holy Spirit intended the text to do** for its first hearers and **what Christ now does through that same truth** for His people.

An effective sermon does more than transfer doctrinal data; it uncovers the *purpose* (divine intent) of the biblical passage and weds that purpose to the real, shared condition of the congregation. Thus evaluation gives sustained attention to whether the preacher has:

* Identified the *subject* and *purpose* of the text (what the passage is about and what it is doing).
* Articulated a clear, text‑derived **Proposition** (subject + complement) that governs everything that follows.
* Surfaced a biblically rooted, specific **Fallen Condition Focus (FCF)**—the aspect of human fallenness, limitation, rebellion, insufficiency, disordered desire, or need that the text addresses (not always an overt sin list, but the shared condition that necessitates divine grace).
* Moved listeners from **need (FCF)** to **Christ‑centered provision**, showing how the gospel—person and work of Christ applied by the Spirit—answers the passage's burden.
* Converted exposition into **transformational, grace‑powered application** (the "so what?") that is concrete, pastorally sensitive, and derived organically from the text rather than appended moralism.

### The Centrality of the FCF
Because the FCF mediates between the ancient text and contemporary hearts, a sermon is assessed on how specifically and accurately it names the human condition the passage exposes or heals. A vague "we all struggle" is inadequate; specificity sharpens gospel clarity. Evaluation asks: Is the FCF narrow enough to drive structure, yet pastorally broad enough to connect? Is it kept God‑centered (our need before *Him*) rather than human‑centered self‑improvement? Does the sermon resolve the FCF in Christ's redemptive provision instead of pragmatic advice or behavior modification?

### Purposeful Interpretation to Practical Application
Interpretation is complete only when the Spirit's intended *purpose* for the text is carried into lived obedience, worship, repentance, hope, and mission. Therefore we scrutinize whether the sermon:
1. Traces the text's redemptive logic (not merely lexical facts).
2. Distinguishes divine mandates from pastoral wisdom suggestions (clarity of authority level).
3. Grounds every substantive application in explained textual meaning.
4. Maintains a grace motive (identity in Christ fueling obedience) rather than guilt or bare willpower.

### Evaluation Pillars (Meta‑Criteria Informing Both Steps)
1. Textual Purpose & Fidelity – Does the sermon mirror the passage's own burden and trajectory?
2. FCF Precision – Is the fallen condition concrete, text‑tethered, and determinative for structure?
3. Christ‑Centered Resolution – Does the gospel (person/work of Christ) resolve the need organically?
4. Transformational Application – Are applications specific, heart + life oriented, and grace‑driven?
5. Structural Cohesion – Do proposition, points, transitions, and conclusion all coherently serve the stated purpose?

### Why a Structured Two‑Step Process?
To reduce evaluator subjectivity and enable iterative coaching, we first extract *descriptive structure* (Step 1). We then layer *analytical judgment* (Step 2) translating raw features into rubric scores and constructive coaching. This separation disciplines the evaluator to critique what was actually preached, not what could have been preached.

In short, a sermon "scores well" here when it faithfully exposes the Spirit‑inspired purpose of the text, names and addresses the true fallen condition with gospel sufficiency, and shepherds hearers toward Christ‑formed transformation with clarity, cohesion, and pastoral wisdom.

---

## Overview of the Two-Step Process

1. **Step 1 – Descriptive Extraction (Structural Analysis)**
	 The model analyzes the sermon audio and produces a rich descriptive structure capturing introductions, proposition, main points (with sub‑points, illustrations, applications, comments, feedback), general comments, the Fallen Condition Focus (FCF), and a confidence score.

2. **Step 2 – Analytical Scoring (Synthesis & Coaching)**
	 Using the structured Step 1 output and the audio for verification, the model assigns 1–5 scores across seven rubric sections: Introduction, Proposition, Main Points, Exegetical Support, Application, Illustrations, and Conclusion. Those scores produce six aggregate metrics plus Overall Impact, along with strengths, growth areas, and actionable next steps.

### Advanced Evaluation Methodologies

**Self-Consistency (Multi-Run Harmonization)**
Standard evaluation uses one scoring run. High confidence uses three independent scoring runs, while sermon evaluator administrators may choose from one to nine runs. When more than one run is selected:
1.  **Parallel Scoring:** The Step 2 analysis is run multiple times in parallel with different random seeds.
2.  **Confidence-Weighted Averaging:** Integer scores are averaged across runs, weighted by the model's self-reported `Scoring Confidence` for each run.
3.  **Feedback Harmonization (Self-Refine):** A meta-evaluator LLM synthesizes the qualitative feedback from all runs, highlighting consensus views and noting significant minority insights (biasing toward critical feedback in subjective disagreements).

**Optional Sermon-Length Adjustment**
The sermon-length adjustment is an optional, church-specific coaching heuristic and is off by default. If the user enables it, the system uses a 35–50 minute target:
*   **Short Penalty (< 35m):** 0.1 point penalty per minute under 35m (max 1.0).
*   **Long Penalty (> 50m):** ~0.067 point penalty per minute over 50m (1 point per 15m, max 1.0).
*   The adjustment affects only `Overall_Impact`; all rubric and aggregate category scores remain unchanged.

**Score Calibration (Post-Processing Pipeline)**
After initial LLM scoring, a deterministic post-processing pipeline applies evidence-based heuristics to prevent score inflation and ensure rubric fidelity:

1. **Strict Calibration:** Downgrades scores when Step 1 extraction reveals missing structural elements:
   - No explicit proposition → cap Proposition sub-scores at 2 (or 3 if conditional thresholds are met: specific FCF + (≥3 body points or ≥2 points with subpoints) + ≥67% concrete applications + ≥2 hortatory points + cohesive conclusion with FCF-point overlap)
   - No explicit conclusion → cap Conclusion sub-scores at 2
   - Vague/missing FCF (<20 chars, <6 words, generic singletons, or vague phrases) → cap Introduction.FCF_Introduced at 2
   - More than 50% of body points lack Applications → cap Main_Points.Application_Quality at 2
   - More than 50% of body points lack Illustrations → cap Main_Points.Illustration_Quality at 2, Illustrations.* at 3
   - <2 body points → cap Main_Points.Proportional_and_Coexistent at 2
   - Structure_Comments flag fragmentation (using keywords such as "repeat", "repetition", "repetitive", "orphan", "disconnected", "disjointed", "verse-by-verse", "verse by verse", "multiple mini-sermons", "lacks progression", "without progression", or "different spheres") → cap Proportional_and_Coexistent at 2, Hortatory_Universal_Truths at 2
   - Placeholder bias: a missing proposition or conclusion triggers a one-point section Overall downshift; the missing-proposition bias is suppressed when conditional softening applies

2. **Ceiling Compression:** Caps inflated sub-scores using structural evidence gates (targets sections with empirically high 4s):
   - Conclusion < 50 words → cap Summary and Pointed_End at 3
   - No exhortation language → cap Compelling_Exhortation at 3
   - No climactic language → cap Climax at 3
   - Proposition > 25 words → cap Establishes_Main_Theme at 3
   - Avg point text > 15 words → cap Main_Points.Clarity at 3
   - <67% of points have hortatory cues → cap Hortatory_Universal_Truths at 3
   - Avg illustrations per point < 1.0 → cap Lived_Body_Detail at 3
   - Avg illustrations per point > 3.0 → cap Illustrations.Proportion at 3
   - <67% of points have concrete application → cap Application.Clear_and_Practical at 3
   - No Christ/gospel language in applications → cap Redemptive_Focus at 4
   - <67% of body points have verse references → cap Alignment_with_Text at 3

3. **Aggregation:** Compute weighted composite scores (see Aggregated Summary section below).

4. **Optional Sermon-Length Adjustment:** If enabled by the user, apply the time-based adjustment to Overall Impact (see above).

After each calibration pass, section Overall scores are recomputed as `ceil(avg(sub-scores))` clamped 1–5. This pipeline executes in order: Strict Calibration → Ceiling Compression → Aggregation → optional Sermon-Length Adjustment.

---

## Scoring Scale (Step 2)
| Score | Meaning |
| ----- | ------- |
| 5 | Exemplary: reserved for truly exceptional, publishable‑quality execution—text‑anchored, pastorally effective; no substantive improvement needed. |
| 4 | Strong: solid and text‑anchored; clearly above average; only minor refinement needed (brevity, nuance, balance). |
| 3 | Adequate: this is the expected baseline for a competent sermon—present but generic/uneven; significant sharpening would help. |
| 2 | Weak: present but unclear, forced, thin, or inconsistent; recognizable yet fails to achieve its purpose. |
| 1 | Deficient: absent, inaccurate, misleading, or counter‑productive; a fundamental element is missing or flawed. |

Calibration note: Be a tough but fair grader. The goal is growth, not mere affirmation. Treat 3 as the true midpoint (competent baseline), and do not award 4s or 5s lightly.

> **Operational Rule:** Do not use `null` for missing evidence. If a sub‑criterion is truly not evident, assign **1** (Deficient) to keep aggregates stable.

---

## Step 1 Criteria & Sub‑Criteria (Descriptive Extraction Fields — **Title Case Keys**)

### 1. Scripture Introduction

* Identifies the primary biblical text(s) accurately (reference + translation clarity).
* Provides immediate textual orientation: genre, context, setting, speaker, audience.
* Frames why this text matters today (bridging ancient context to present need).
* Avoids unrelated anecdotes before grounding in Scripture.

### 2. Sermon Introduction

* Engages interest without overshadowing the text.
* Surfaces a tension / need / question that the passage resolves.
* Naturally narrows toward the Proposition and (implicitly or explicitly) the FCF.
* Avoids moralistic clichés detached from the text.

### 3. Proposition

* A single, clear, declarative summary of the sermon's message (subject + complement).
* Text‑derived (not imposed).
* Christ‑centered orientation preferred where text warrants.
* If implied, note deficiency with specificity.
* If the preacher gives multiple potential propositions, identify the dominant one and note the confusion rather than silently rewriting the outline.
* **Canonical placeholder when absent:** "No explicit proposition stated".
* Evaluate precision (vagueness, over‑complexity, multiple competing propositions).

### 4. Body (Main Points Collection)

For each main point:

* **Point** – Stated as an imperative, indicative, or doctrinal truth; clearly anchored to a discrete textual segment (verse(s) indicated).
* **Summary** – Expanded explanation faithful to context (literary + redemptive).
* **Subpoints** – Coherent logical development; if absent, note consciously.
* **Illustrations** – Relevant, accurate, and in service of the point—not entertainment; **Scripture quotations are NOT illustrations**.
* **Application** – Specific, grace‑motivated, heart + life oriented (not generic moralism).
* **Comments** – Evaluate exegesis fidelity, clarity, progression toward climax, over‑proof‑texting risks, handling of original audience. **Identify structural red flags:** Do points repeat a theme in different spheres without progression? Does a final point introduce an orphan theme? Do points merely follow verse sequence without unifying logic?
* **Feedback** – Constructive, actionable coaching (what to refine, add, trim, rephrase, or reorder). **Call out fragmentation:** If the sermon feels like multiple mini-sermons or verse-by-verse commentary, name it explicitly and suggest how to unify around a single climactic move.

### 5. Conclusion

* Capture the conclusion in a single paragraph that mirrors the preacher's actual landing—include the stated recap, exhortation, gospel emphasis, and tone as delivered (do not invent missing elements).
* Highlight whether the conclusion provided a compelling exhortation, climax, and pointed ending within that paragraph; if certain elements were absent, say so plainly inside the paragraph rather than fabricating them.
* **Canonical placeholder when absent:** If the preacher offered no discernible conclusion, set the field to "No explicit conclusion provided".

### 6. General Comments

* **Content Comments** – Doctrinal substance? Faithful synthesis? Christ and Gospel explicit where warranted?
* **Structure Comments** – Logical flow, unity, escalation, transitions, balance of explanation vs. application. **Critical structural analysis (required):**
  - **Examine for thematic repetition:** Do 2+ points repeat the same action verb in different contexts (e.g., "Submit to X", "Submit to Y")? If yes, explicitly state: "Points 1-2 repeat the same imperative in different spheres without theological progression."
  - **Check for orphan points:** Does the final point introduce a major new theme (especially Christology/gospel) that wasn't developed in prior points? If yes, explicitly state: "Point 3 introduces [theme] as an orphan; it feels disconnected from the progression of Points 1-2."
  - **Test unity:** Can the points be reordered without loss of logic? If yes, they lack progressive structure. State this explicitly.
  - **Identify verse-by-verse exposition:** If points simply follow textual sequence without a unifying argument, state: "Structure follows verse order but lacks homiletical argument; feels more like commentary than sermon."
* **Explanation Comments** – Depth of exegesis, context (historical, literary), handling of difficult phrases, theological integration.

### 7. Fallen Condition Focus (FCF)

* **FCF** – The shared human brokenness, limitation, or need (not always explicit sin) addressed by the text. Specific and text‑rooted.
* **Comments** – Distinguish between surface problem and deeper gospel issue; confirm alignment with main points and applications; guard against purely behavioral framing; note if FCF is missing, too broad, or misaligned.

### 8. Extraction Confidence

* A floating value (0–1) reflecting internal model confidence in extraction accuracy.
* Should consider audio clarity and completeness, structural ambiguity, or a missing proposition.

---

## Step 2 Analytical Rubric (Detailed Quantitative Scoring)

Step 2 converts the rich descriptive output (Step 1) into granular rubric‑based scores (1–5) plus qualitative feedback per category. Every score MUST be an integer 1–5 (5 = absolutely yes / exemplary; 1 = absolutely no / absent / severely deficient). After per‑criterion scoring, an aggregated summary may be produced (see Aggregated Summary section).

### A. Introduction

Sub‑Criteria:

1. **FCF Introduced** *(a specific fallen condition is derived from the preached text and previewed)*
2. **Arouses Attention** *(opens with text‑relevant tension/need rather than unrelated anecdotes)*
Feedback: Holistic, actionable coaching (affirm + improve).

### B. Proposition

Sub‑Criteria:

1. **Principle + Application Wed** *(Subject + complement form a single gospel principle with an implied or explicit response.)*
2. **Establishes Main Theme** *(Controls scope & governs all points; no competing propositions.)*
3. **Summarizes Introduction** *(Carries forward the tension/need terms raised earlier.)*
Feedback: Strengths + surgical improvements.

### C. Main Points

Sub‑Criteria:

1. **Clarity** *(Succinct, memorable phrasing—typically ≤12 words.)*
2. **Hortatory Universal Truths** *(States timeless truths that call hearers to trust/obey—**not** mere narrative recap)*
3. **Proportional & Coexistent** *(each point meaningfully ADVANCES the single proposition through distinct theological moves—not repetition in different spheres or orphan points; points build toward climax, not just cover consecutive verses)*
4. **Exposition Quality** *(Explains text meaning in context before application.)*
5. **Illustration Quality** *(Illustrations illuminate the stated point & remain proportionate.)*
6. **Application Quality** *(Specific, grace‑motivated, heart + life oriented.)*
Feedback: Cohesion, pacing, balance suggestions.

**Red Flags for Proportional & Coexistent (Common Structural Failures):**

Watch for these patterns that masquerade as cohesive structure but actually reveal fragmentation:

1. **Thematic Repetition Across Spheres (score ≤2)** – Multiple points repeat the same theme in different contexts without progression. Example: "Submit to government" + "Submit in workplace" + "Submit at home" = repetition, not development. Test: If you can swap point order without loss of logic, they aren't building toward anything.

2. **Orphan Final Point (score ≤3)** – Last point introduces a new major theme disconnected from prior points. Example: Points 1-2 about "submission," then Point 3 suddenly shifts to "Christ's suffering" without bridging the FCF. Test: If the final point feels like a different sermon tacked on, penalize Proportional_and_Coexistent.

3. **Verse-by-Verse Exposition Disguised as Structure (score ≤2)** – Points follow textual sequence but lack unifying proposition. Example: "Paul talks about X in v.1-5, then Y in v.6-10, then Z in v.11-15" = commentary, not sermon. Test: Remove verse numbers from points—do they still form a logical argument?

4. **Multiple Competing Propositions (score ≤2)** – Sermon tries to say two things, resulting in disjointed points. Example: Proposition about "submission" but final point is really about "Christ's atonement." Test: If you need "Part 1" and "Part 2" labels, you have two sermons.

When any of these patterns appear, cap Proportional_and_Coexistent at 3 (or lower). A truly cohesive sermon has points that BUILD toward a single climax, not just cover consecutive verses or repeat a theme in different settings.

#### Hortatory Universal Truths – Boundary Examples

Definition: A main point that expresses a timeless, text‑derived principle/doctrinal assertion or imperative implication rather than a mere chronological or descriptive recap.

Examples:
* PASS: "God's mercy transforms our identity" (Principial, transferable.)
* PASS: "Because Christ reigns, believers resist despair" (Doctrinal + implied exhortation.)
* FAIL: "Paul moves to verse 3 where he talks about wrath" (Narrative recap only.)
* FAIL: "Verses 4–7 are about grace" (Label without hortatory force or principle.)

Scoring Heuristics:
* 5 – All points principial & action‑orienting or doctrinally robust; none are mere captions.
* 3 – Mixed: at least one point drifts into recap/caption.
* 1 – Majority are narrative descriptions with no transferable principle.


### D. Exegetical Support

Sub‑Criteria:

1. **Alignment with Text** *(Structure & emphasis mirror the passage's burden.)*
2. **Handles Difficulties** *(Engages key interpretive/translation/theological tensions honestly.)*
3. **Proof Accuracy & Clarity** *(Supports claims with sound, digestible reasoning.)*
4. **Context & Genre Considered** *(Honors literary, historical, redemptive context.)*
5. **Not Belabored** *(Stops proving once sufficient; avoids pedantic overload.)*
6. **Aids Rather Than Impresses** *(Content serves listener understanding, not scholar display.)*
Feedback: Depth vs brevity, clarity, balance.

### E. Application

Sub‑Criteria:

1. **Clear & Practical** *(Concrete next steps or heart postures identifiable.)*
2. **Redemptive Focus** *(Motivated by Christ's person/work & grace, not bare willpower.)*
3. **Mandate vs Idea Distinction** *(Explicitly marks divine commands vs pastoral wisdom suggestions.)*
4. **Passage Supported** *(Flows organically from explained meaning; no bolt‑ons.)*
Feedback: Sharpen, contextualize, motivate.

### F. Illustrations

Sub‑Criteria:

1. **Lived‑Body Detail** *(Concrete, sensory realism that builds credibility.)*
2. **Strengthens Points** *(Illumines stated truth without hijacking focus.)*
3. **Proportion** *(Length & frequency economical; avoids narrative domination.)*
Feedback: Trim / diversify / anchor to text.

### G. Conclusion

Sub‑Criteria:

1. **Summary** *(Concise recapitulation of proposition & main movements.)*
2. **Compelling Exhortation** *(Specific, gospel‑rooted call to response.)*
3. **Climax** *(Appropriate theological/pastoral crescendo, not emotional manipulation.)*
4. **Pointed End** *(Decisive landing—no meandering fade.)*
Feedback: Intensify, focus, seal.

### H. Scoring Confidence

* **Scoring Confidence** – Float 0–1 reflecting the evaluator's confidence in Step 2 scoring fidelity (quality of Step 1 data, audio clarity, structural ambiguity, etc.).

### Scoring Guidance (Heuristic)
Be a tough but fair grader. The aim is to help the preacher improve, not only to affirm. Use the full 1–5 scale.

| Score | Descriptor | Heuristic Examples |
| ----- | ---------- | ------------------ |
| 5 | Exemplary | Reserved for truly exceptional, publishable‑quality execution; text‑anchored and pastorally effective; no substantive improvement needed. |
| 4 | Strong | Solid and clearly above average; only minor refinement needed (brevity, nuance, balance). |
| 3 | Adequate | The expected baseline for a competent sermon; present but generic/uneven; could be significantly sharpened. |
| 2 | Weak | Present but unclear, forced, thin, or inconsistent; recognizable yet fails to achieve its purpose. |
| 1 | Deficient | Absent, inaccurate, misleading, or counter‑productive; fundamental element missing or flawed. |

Tie‑breakers:
- When in doubt, default to the lower score; challenge the sermon to earn higher marks.
- Use 3 as the true midpoint (adequate), not a soft pass.

## Aggregated Summary

Compute rolled‑up composite categories for dashboards by averaging related raw scores:
* Textual_Fidelity ≈ avg(Exegetical Support.Alignment with Text, Handles Difficulties, Proof Accuracy & Clarity, Context & Genre Considered, Not Belabored, Aids Rather Than Impresses, Main Points.Exposition Quality)
* Proposition_Clarity ≈ avg(Proposition.Principle + Application Wed, Establishes Main Theme, Summarizes Introduction)
* Introduction ≈ avg(Introduction.FCF Introduced, Introduction.Arouses Attention)
* Application_Effectiveness ≈ avg(Application.Clear & Practical, Redemptive Focus, Mandate vs Idea Distinction, Passage Supported, Main Points.Application Quality, Conclusion.Compelling Exhortation, Conclusion.Climax)
* Structure_Cohesion ≈ avg(Proposition.Establishes Main Theme, Main Points.Proportional & Coexistent, Main Points.Clarity, Main Points.Hortatory Universal Truths, Conclusion.Summary, Conclusion.Pointed End)
* Illustrations ≈ avg(Main Points.Illustration Quality, Illustrations.Lived-Body Detail, Illustrations.Strengthens Points, Illustrations.Proportion)
* Overall_Impact_Base ≈ **weighted average** of the above six aggregates using "Pillars First" weights:
  - Textual_Fidelity: **24%**
  - Application_Effectiveness: **24%**
  - Structure_Cohesion: **20%**
  - Proposition_Clarity: **12%**
  - Illustrations: **10%**
  - Introduction: **10%**
* Overall_Impact = Overall_Impact_Base by default. When the optional sermon-length adjustment is enabled, Overall_Impact = Overall_Impact_Base - Duration_Penalty (clamped to 1.0 minimum).

**Weighting Rationale:** The "Pillars First" scheme emphasizes the core evaluation pillars (Textual Purpose & Fidelity, Transformational Application, Structural Cohesion) which together account for 68% of the overall score. Proposition clarity remains significant at 12%, while introduction and illustrations are deliberately weighted lighter (10% each) to prevent rhetorically polished but theologically thin sermons from scoring artificially high. This ensures that faithful text handling, Christ-centered application, and structural integrity drive the Overall Impact score.

**Optional Sermon-Length Adjustment Logic:**
*   If duration < 35m: `Penalty = min((35 - minutes) / 10.0, 1.0)`
*   If duration > 50m: `Penalty = min((minutes - 50) / 15.0, 1.0)`
*   Otherwise: `Penalty = 0`

---

## Common Strength Indicators
* Proposition is concise, text‑anchored, repeatable.
* FCF is narrow enough to drive structure yet broad enough to connect pastorally.
* Clear redemptive arc culminating in Christ's person/work.
* Applications flow organically from exposition (not bolted on).
* Illustrations illuminate, not entertain; minimal redundancy.
* Balanced exposition: neither word‑study overload nor shallow gloss.

## Common Failure Modes
* Missing or nebulous proposition (multiple competing themes).
* Moralistic applications detached from grace/redemption.
* Overuse of disconnected cross‑references (listener fatigue).
* FCF stated as a vague universal ("we all struggle") with no textual tether.
* Illustrations that overshadow the point or introduce doctrinal confusion.
* Christ absent where text trajectory clearly points to Him (e.g., redemptive-historical pivot texts).
* Applications purely behavior‑control without gospel motivation.

---

## Glossary of Key Rubric Terms
* FCF Introduced – Explicit naming of the specific fallen condition the text addresses.
* Principle + Application Wed – Proposition fuses what is true with why/what response is required in Christ.
* Hortatory Universal Truths – Timeless, text‑warranted principles or implications rather than episodic narration.
* Proportional & Coexistent – Points receive balanced development and operate at the same logical altitude.
* Handles Difficulties – Engages indispensable interpretive tensions (linguistic, contextual, theological) briefly & honestly.
* Not Belabored – Stops explanatory/proof detail once sufficient for clarity & persuasion.
* Aids Rather Than Impresses – Exegetical data serves comprehension; avoids performative scholarship.
* Mandate vs Idea Distinction – Clear labeling of divine commands versus pastoral wisdom or illustrative suggestions.
* Lived-Body Detail – Concrete sensory or situational specificity that grounds illustrations in reality.
* Proportion (Illustrations) – Illustrations sized & spaced to support, not dominate, exposition.
* Pointed End – A decisive, purposeful conclusion (no drift into announcements or filler).
* Scoring Confidence – Evaluator's confidence in rubric scoring fidelity given input quality.
* Extraction Confidence – System confidence in structural parsing accuracy (Step 1).

---

This framework ensures consistent, Christ-centered, text-faithful sermon evaluation and constructive coaching feedback.
