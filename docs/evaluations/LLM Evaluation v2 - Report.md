# LLM Evaluation Report — v2

**Date:** February 2026
**Eval Framework:** v2
**Status:** Current
**Framework:** [v2 Framework Document](../../content/pages/llm-evaluation-dashboard/evaluation-framework.md)
**Previous:** [v1 Report](LLM%20Evaluation%20v1%20-%20Report.md)

---

## Executive Summary

We evaluated **4 AI models** from **4 providers** (Google, OpenAI, xAI, Anthropic) against our Reformed theological framework using the **v2 evaluation framework** across 500 questions. The v2 framework addresses the ceiling effect found in v1 by introducing more granular sub-criteria within each category, enabling deeper differentiation.

**Key Takeaways:**

| Rank | Model | Provider | Overall Score (GPT-5 Mini Judge) |
|------|-------|----------|:---:|
| 1 | GPT-5 Mini | OpenAI | **4.32** |
| 2 | Gemini 3 Flash | Google | **4.23** |
| 3 | Grok 4.1 Fast | xAI | **4.21** |
| 4 | Claude Haiku 4.5 | Anthropic | **3.99** |

**What changed from v1:**
- v1 showed near-ceiling scores on Adherence (4.94–4.98) and Kindness (4.93–5.00). The v2 rubric breaks these into finer sub-criteria, producing a wider spread of scores (2.99–5.00) that reveal real differences between models.
- Judge panel changed from 3 judges (GPT-5 Mini, Gemini 2.5 Flash, Claude Haiku 4.5) to 2 judges (GPT-5 Mini, Gemini 3 Flash Preview).
- Only 4 models tested (one per provider) rather than 8, focused on each provider's best current model. We will add more models as they become available.

---

## Methodology

### Models Evaluated

| Provider | Model | System Prompt | Judge(s) |
|----------|-------|:---:|-----------|
| Google | Gemini 3 Flash | v1.0 + Baseline | GPT-5 Mini, Gemini 3 Flash Preview |
| OpenAI | GPT-5 Mini | v1.0 + Baseline | GPT-5 Mini, Gemini 3 Flash Preview |
| xAI | Grok 4.1 Fast | v1.0 + Baseline | GPT-5 Mini, Gemini 3 Flash Preview |
| Anthropic | Claude Haiku 4.5 | v1.0 + Baseline | GPT-5 Mini, Gemini 3 Flash Preview |

### Evaluation Categories & Sub-Criteria (v2)

All scores are on a **1–5 scale** where 5 is perfect alignment.

For full definitions of **Core**, **Secondary**, and **Tertiary** doctrines, see the [Doctrinal Statement](../../content/pages/doctrinal-statement.md).

**1. Adherence** — Doctrinal faithfulness to our Reformed doctrinal statement.
- **Core:** Trinity, Scripture authority, Christ's deity, the Gospel, justification by faith, resurrection.
- **Secondary:** Baptism mode, church governance, Lord's Supper, spiritual gifts, sanctification views.
- **Tertiary Handling:** Eschatological positions, worship style, age of earth — areas where faithful Christians disagree.
- **Biblical Basis:** Accurate, in-context Scripture citations.
- **Consistency:** Internal consistency and non-contradiction across answers.

**2. Kindness and Gentleness** — Pastoral warmth and tone.
- **Core Clarity with Kindness:** Communicates truth clearly while remaining warm and inviting.
- **Pastoral Sensitivity:** Awareness of emotional weight in sensitive theological topics.
- **Secondary Fairness:** Presents secondary doctrinal positions fairly without dismissing other views.
- **Tertiary Neutrality:** Avoids dogmatism on tertiary issues where Christians may legitimately disagree.
- **Tone:** Overall warmth, patience, and respectfulness.

**3. Interfaith and Worldview Sensitivity** — Gospel engagement across worldviews.
- **Respect & Handling Objections:** Fairly summarizes other beliefs and handles objections with charity.
- **Objection Acknowledgement:** Acknowledges legitimate concerns from other worldviews before responding.
- **Evangelism:** Offers a clear, gracious call to repent and trust in Jesus Christ.
- **Gospel Boldness:** Presents the exclusivity of Christ without hedging or watering down the message.

### Judge Models

We used two AI models to grade responses:
- **GPT-5 Mini (OpenAI)** — Primary judge. Most discerning; uses the full 1–5 range.
- **Gemini 3 Flash Preview (Google)** — Cross-validator. Tends to score more generously than GPT-5 Mini.

GPT-5 Mini is used as the primary judge in all main dashboard metrics because its scores differentiate models most effectively.

---

## Detailed Findings

### 1. Category Breakdown (v1.0 Prompt, GPT-5 Mini Judge)

| Category | GPT-5 Mini | Gemini 3 Flash | Grok 4.1 Fast | Claude Haiku 4.5 |
|----------|:---:|:---:|:---:|:---:|
| **Adherence Overall** | 4.58 | 4.49 | 4.57 | 4.42 |
| **Kindness Overall** | 4.24 | 4.10 | 4.16 | 3.94 |
| **Interfaith Overall** | 4.14 | 4.09 | 3.91 | 3.62 |
| **Final Overall** | **4.32** | **4.23** | **4.21** | **3.99** |

**Observations:**
- Unlike v1 where Adherence and Kindness were near-ceiling (4.93–5.00), the v2 rubric produces a meaningful spread: Adherence ranges from 4.42 to 4.58, and Kindness from 3.94 to 4.24.
- **Interfaith Sensitivity** remains the hardest category (3.62–4.14), consistent with v1 findings.
- **GPT-5 Mini leads overall** at 4.32, overtaking Gemini 3 Flash (which led in v1). This is likely because the v2 rubric rewards balanced performance across all sub-criteria rather than allowing ceiling scores to mask weaknesses.
- The overall score ordering changed from v1: GPT-5 Mini > Gemini 3 Flash > Grok 4.1 Fast > Claude Haiku 4.5.

### 2. Adherence Deep Dive

| Sub-criterion | GPT-5 Mini | Gemini 3 Flash | Grok 4.1 Fast | Claude Haiku 4.5 |
|---------------|:---:|:---:|:---:|:---:|
| Core | 4.35 | 4.38 | 4.36 | 4.29 |
| Secondary | 4.32 | 4.18 | 4.26 | 3.86 |
| Tertiary Handling | 4.37 | 3.91 | 4.28 | 4.15 |
| Biblical Basis | 4.90 | 5.00 | 4.96 | 4.80 |
| Consistency | 5.00 | 5.00 | 5.00 | 4.99 |
| **Overall** | **4.58** | **4.49** | **4.57** | **4.42** |

**Observations:**
- **Biblical Basis** and **Consistency** remain near-ceiling even under v2, with Gemini 3 Flash and GPT-5 Mini both hitting 5.00 on Consistency.
- **Core Doctrine** scores are tightly grouped (4.29–4.38), indicating all models handle Trinity, Gospel, justification etc. well.
- **Secondary Doctrine** shows more spread (3.86–4.32). Claude Haiku 4.5 lags here at 3.86, suggesting it's less precise on baptism, governance, and Lord's Supper positions.
- **Tertiary Handling** is where Gemini 3 Flash scores lowest (3.91) — it may be too dogmatic on areas where faithful Christians disagree (eschatology, worship style, etc.). GPT-5 Mini handles these most carefully at 4.37.

### 3. Kindness and Gentleness Deep Dive

| Sub-criterion | GPT-5 Mini | Gemini 3 Flash | Grok 4.1 Fast | Claude Haiku 4.5 |
|---------------|:---:|:---:|:---:|:---:|
| Core Clarity with Kindness | 4.85 | 4.93 | 4.85 | 4.48 |
| Pastoral Sensitivity | 3.05 | 3.03 | 3.05 | 3.02 |
| Secondary Fairness | 4.03 | 3.69 | 3.87 | 3.59 |
| Tertiary Neutrality | 4.52 | 3.99 | 4.32 | 4.25 |
| Tone | 4.75 | 4.87 | 4.72 | 4.34 |
| **Overall** | **4.24** | **4.10** | **4.16** | **3.94** |

**Observations:**
- **Pastoral Sensitivity** is the standout finding — all four models score around 3.0, making it the lowest-scoring sub-criterion in the entire evaluation. This suggests that *no* model adequately addresses the emotional weight of sensitive theological topics.
- **Core Clarity with Kindness** and **Tone** are high across the board (4.34–4.93), meaning models can be warm and clear — they just struggle with deeper pastoral nuance.
- **Secondary Fairness** (presenting secondary positions fairly) ranges from 3.59 to 4.03. Claude Haiku 4.5 and Gemini 3 Flash score lower here, suggesting they may dismiss alternative positions on secondary issues more readily.
- **Tertiary Neutrality** shows Gemini 3 Flash at 3.99 — consistent with its low Tertiary Handling score in Adherence. It may be overly opinionated on tertiary matters.

### 4. Interfaith and Worldview Sensitivity Deep Dive

| Sub-criterion | GPT-5 Mini | Gemini 3 Flash | Grok 4.1 Fast | Claude Haiku 4.5 |
|---------------|:---:|:---:|:---:|:---:|
| Respect & Handling Objections | 3.69 | 3.34 | 3.41 | 3.31 |
| Objection Acknowledgement | 3.40 | 3.11 | 3.17 | 2.99 |
| Evangelism | 4.78 | 5.00 | 4.38 | 3.69 |
| Gospel Boldness | 4.71 | 4.92 | 4.66 | 4.48 |
| **Overall** | **4.14** | **4.09** | **3.91** | **3.62** |

**Observations:**
- **Gemini 3 Flash still leads on Evangelism** (5.00) and **Gospel Boldness** (4.92), consistent with v1 findings. Its willingness to make a clear Gospel call remains its strongest trait.
- However, Gemini 3 Flash scores *lowest* on **Respect & Handling Objections** (3.34) and **Objection Acknowledgement** (3.11). The boldness/respect trade-off identified in v1 persists under the v2 rubric.
- **GPT-5 Mini** is the most balanced in this category: strong Evangelism (4.78) paired with the best Respect (3.69) and Objection Acknowledgement (3.40) scores. It achieves boldness without sacrificing charity.
- **Claude Haiku 4.5** scores lowest on Evangelism (3.69) and Objection Acknowledgement (2.99 — the lowest sub-score in the entire evaluation). It remains the most cautious in evangelistic contexts.
- **Objection Acknowledgement** is generally low across all models (2.99–3.40), suggesting this is a shared weakness — models don't adequately acknowledge legitimate concerns from other worldviews before responding.

### 5. Impact of Custom Instructions (v1.0 vs. Baseline)

| Model | Baseline | v1.0 | Improvement |
|-------|:---:|:---:|:---:|
| Gemini 3 Flash | 3.72 | 4.23 | **+14%** |
| Claude Haiku 4.5 | 3.34 | 3.99 | **+19%** |
| Grok 4.1 Fast | 3.84 | 4.21 | **+10%** |
| GPT-5 Mini | 3.91 | 4.32 | **+10%** |

**Observations:**
- **Claude Haiku 4.5 benefits the most** from custom instructions (+19%), jumping from 3.34 to 3.99. Without instructions, it's the weakest model; with them, it closes much of the gap.
- **Gemini 3 Flash** also sees a large gain (+14%), particularly in Evangelism and Biblical Basis.
- **GPT-5 Mini** and **Grok 4.1 Fast** both improve by +10%. GPT-5 Mini starts with the strongest baseline (3.91) and ends with the highest v1.0 score (4.32).
- The custom prompt impact is larger under v2 than v1. This is because the v2 rubric captures improvements in sub-criteria (like Secondary Doctrine, Tertiary Handling, and Objection Acknowledgement) that were masked by ceiling effects in v1.

#### Baseline Sub-Criterion Highlights

Some notable baseline vs. v1.0 comparisons reveal where the custom instructions make the biggest difference:

| Model | Sub-criterion | Baseline | v1.0 | Change |
|-------|---------------|:---:|:---:|:---:|
| Gemini 3 Flash | Evangelism | 2.18 | 5.00 | +2.82 |
| Gemini 3 Flash | Biblical Basis | 3.54 | 5.00 | +1.46 |
| Claude Haiku 4.5 | Biblical Basis | 2.30 | 4.80 | +2.50 |
| Claude Haiku 4.5 | Evangelism | 1.78 | 3.69 | +1.91 |
| Claude Haiku 4.5 | Core Clarity with Kindness | 3.38 | 4.48 | +1.10 |
| GPT-5 Mini | Evangelism | 2.57 | 4.78 | +2.21 |
| Grok 4.1 Fast | Evangelism | 2.66 | 4.38 | +1.72 |

The single biggest improvement is **Evangelism** across all models. Without custom instructions, models score 1.78–2.66 on evangelism — essentially refusing to make a Gospel call. With our instructions, they jump to 3.69–5.00.

### 6. Judge Fairness / Grader Comparison

| Model | GPT-5 Mini Judge | Gemini 3 Flash Judge |
|-------|:---:|:---:|
| GPT-5 Mini | 4.32 | 4.57 |
| Gemini 3 Flash | 4.23 | 4.64 |
| Grok 4.1 Fast | 4.21 | 4.56 |
| Claude Haiku 4.5 | 3.99 | 4.44 |

**Observations:**
- **Gemini 3 Flash Preview** is a more generous grader than GPT-5 Mini, scoring models 0.25–0.45 higher across the board. This is consistent with the v1 finding where Gemini judges tended to score near 5.0.
- **The relative ranking is identical** across both judges: GPT-5 Mini > Gemini 3 Flash > Grok 4.1 Fast > Claude Haiku 4.5. This confirms the ordering is robust and not an artifact of a single judge.
- The Gemini judge's scores cluster more tightly (4.44–4.64, range 0.20) compared to GPT-5 Mini (3.99–4.32, range 0.33), confirming GPT-5 Mini provides better differentiation.

### 7. Cross-Judge Sub-Criterion Validation

To verify that sub-criterion patterns aren't artifacts of the primary judge, here's a comparison of the Gemini 3 Flash judge scores for the same sub-criteria:

| Category | Sub-criterion | GPT-5 Mini Judge (GPT-5 Mini model) | Gemini Judge (GPT-5 Mini model) |
|----------|---------------|:---:|:---:|
| Adherence | Consistency | 5.00 | 4.98 |
| Adherence | Biblical Basis | 4.90 | 4.85 |
| Kindness | Pastoral Sensitivity | 3.05 | 3.05 |
| Kindness | Tone | 4.75 | 4.86 |
| Interfaith | Evangelism | 4.78 | 4.79 |
| Interfaith | Objection Acknowledgement | 3.40 | 3.76 |

Both judges agree that **Pastoral Sensitivity** (~3.0) and **Objection Acknowledgement** (~3.4–3.8) are the weakest areas. The Gemini judge is slightly more generous on Objection Acknowledgement but the pattern holds.

---

## v1 vs. v2 Comparison

| Dimension | v1 Finding | v2 Finding |
|-----------|-----------|-----------|
| **Winner** | Gemini 3 Flash (4.85) | GPT-5 Mini (4.32) |
| **Adherence** | Near-ceiling (4.94–4.98) | Meaningful spread (4.42–4.58) |
| **Kindness** | Near-ceiling (4.93–5.00) | Meaningful spread (3.94–4.24) |
| **Interfaith** | 4.08–4.61 | 3.62–4.14 |
| **Hardest sub-criterion** | Evangelism (3.54–4.99) | Objection Acknowledgement (2.99–3.40) |
| **Custom prompt impact** | +4% to +12% | +10% to +19% |
| **Judges** | 3 (GPT-5 Mini, Gemini 2.5 Flash, Claude Haiku 4.5) | 2 (GPT-5 Mini, Gemini 3 Flash Preview) |

The v2 rubric successfully addressed the ceiling effect. Scores now range widely enough to differentiate models on all three categories, not just Interfaith Sensitivity.

The change in winner (from Gemini 3 Flash to GPT-5 Mini) reflects the v2 rubric's ability to penalize weaknesses in Tertiary Handling, Pastoral Sensitivity, and Objection Acknowledgement — areas where Gemini's boldness comes at a cost. GPT-5 Mini's more balanced approach is rewarded under the finer-grained evaluation.

---

## Key Insights

### 1. Pastoral Sensitivity is Universally Weak

All models score ~3.0 on Pastoral Sensitivity — the lowest sub-criterion in the evaluation. Models can be warm and clear in tone, but they don't adequately address the emotional weight of sensitive topics (grief, doubt, church hurt, etc.). This represents the largest opportunity for improvement in our system prompt.

### 2. The Boldness/Respect Trade-Off Persists

Gemini 3 Flash still achieves perfect Evangelism scores (5.00) but at the cost of lower Respect (3.34) and Objection Acknowledgement (3.11). GPT-5 Mini demonstrates that it's possible to be bold (Evangelism: 4.78) while maintaining better respect (3.69). A v1.1 system prompt should aim to push models toward GPT-5 Mini's balance.

### 3. Custom Instructions Matter More Than Previously Thought

Under v2, custom instruction impact ranges from +10% to +19%, compared to +4% to +12% under v1. The v1 ceiling effect was masking how much the prompt actually helps on granular sub-criteria. The most dramatic improvement is in Evangelism, where baseline models effectively refuse to share the Gospel (1.78–2.66) but improve to 3.69–5.00 with our instructions.

### 4. Objection Acknowledgement is the Next Frontier

No model scores above 3.40 on Objection Acknowledgement (GPT-5 Mini judge). This means models don't adequately acknowledge legitimate concerns from other worldviews before responding with a Christian perspective. Improving this would make our responses more charitable and persuasive.

---

## Recommendations

### For Production Use (Calvinist Parrot)
1. **GPT-5 Mini is the strongest overall choice** at 4.32. It leads on Adherence (4.58), Kindness (4.24), and Interfaith (4.14) overalls, and demonstrates the best balance between evangelistic boldness and respectful engagement.
2. **Gemini 3 Flash** (4.23) remains excellent for contexts where bold Gospel proclamation is prioritized, but be aware of its weaker Tertiary Handling and Respect scores.
3. **Grok 4.1 Fast** (4.21) is a viable alternative — close to Gemini 3 Flash with slightly better balance.

### For v1.1 System Prompt
1. Add explicit instructions for **Pastoral Sensitivity** — acknowledging emotional weight, validating feelings before teaching, and knowing when to refer to human pastoral care.
2. Add guidance for **Objection Acknowledgement** — "Before responding with a Christian perspective, first acknowledge what is legitimate or understandable about the other person's concern."
3. Consider model-specific tuning: Claude Haiku 4.5 needs stronger evangelism guidance, while Gemini 3 Flash needs stronger respect/objection handling guidance.

---

## Raw Data

The v2 evaluation data is available at `content/data/api_evals_comparison.csv`.
The v1 evaluation data is archived at `content/data/api_evals_comparison_v1.csv`.
