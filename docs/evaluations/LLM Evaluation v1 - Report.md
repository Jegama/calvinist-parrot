# LLM Evaluation Report

**Date:** February 2026
**Eval Framework:** v1
**Status:** Archived (Replaced by v2)
**Framework:** [v1 Framework Document](evaluation-framework-v1.md)

---

## Executive Summary

We evaluated **8 AI models** from **4 providers** (Google, OpenAI, xAI, Anthropic) against our Reformed Baptist theological framework across 500+ questions. Models were scored on three categories: **Doctrinal Adherence**, **Kindness and Gentleness**, and **Interfaith and Worldview Sensitivity**.

> **Eval Framework Note:** This report uses eval framework **v1**. Adherence and Kindness scores are near-ceiling (4.93-5.00) for all top models, indicating the v1 rubric no longer differentiates well on those dimensions. A v2 framework with more granular criteria is planned.

**Key Takeaways:**

| Rank | Model | Provider | Overall Score |
|------|-------|----------|:---:|
| 1 | Gemini 3 Flash | Google | **4.85** |
| 2 | GPT-5 Mini | OpenAI | **4.79** |
| 3 | Grok 4.1 Fast | xAI | **4.73** |
| 4 | Gemini 2.5 Flash | Google | **4.70** |
| 5 | GPT-4.1 Mini | OpenAI | **4.68** |
| 6 | Grok 3 Mini | xAI | **4.66** |
| 7 | Claude Haiku 4.5 | Anthropic | **4.66** |
| 8 | Gemini 2.0 Flash | Google | **4.60** |

---

## Methodology

### Models Evaluated

| Provider | Model | System Prompt | Judge(s) |
|----------|-------|:---:|-----------|
| Google | Gemini 2.5 Flash | v1.0 + Baseline | GPT-5 Mini, Gemini 2.5 Flash, Claude Haiku 4.5 |
| Google | Gemini 2.0 Flash | v1.0 | GPT-5 Mini |
| Google | Gemini 3 Flash | v1.0 + Baseline | GPT-5 Mini, Gemini 2.5 Flash, Claude Haiku 4.5 |
| OpenAI | GPT-5 Mini | v1.0 + Baseline | GPT-5 Mini, Gemini 2.5 Flash, Claude Haiku 4.5 |
| OpenAI | GPT-4.1 Mini | v1.0 | GPT-5 Mini |
| xAI | Grok 4.1 Fast | v1.0 + Baseline | GPT-5 Mini, Gemini 2.5 Flash, Claude Haiku 4.5 |
| xAI | Grok 3 Mini | v1.0 | GPT-5 Mini |
| Anthropic | Claude Haiku 4.5 | v1.0 + Baseline | GPT-5 Mini, Gemini 2.5 Flash, Claude Haiku 4.5 |

### Evaluation Categories

All scores are on a **1-5 scale** where 5 is perfect alignment.

1. **Adherence** — Doctrinal faithfulness to our Reformed Baptist statement on core doctrines (Trinity, Scripture authority, Gospel, Justification by faith, Resurrection), secondary doctrines (baptism, governance, Lord's Supper), and tertiary handling.
2. **Kindness and Gentleness** — Pastoral warmth, tone, sensitivity, and fair treatment of secondary/tertiary disagreements.
3. **Interfaith and Worldview Sensitivity** — Respect for other beliefs, accurate acknowledgement of objections, evangelistic boldness, and clear Gospel presentation.

### Judge Models

We used three AI models to grade responses:
- **GPT-5 Mini (OpenAI)** — Primary judge. Most discerning; uses the full 1-5 range.
- **Gemini 2.5 Flash (Google)** — Cross-validator. Tends to score generously (near 5.0).
- **Claude Haiku 4.5 (Anthropic)** — Cross-validator. Falls between GPT-5 Mini and Gemini in strictness.

GPT-5 Mini is used as the primary judge in all main dashboard metrics because its scores differentiate models most effectively.

---

## Detailed Findings

### 1. Category Breakdown (Best Model Per Provider, GPT-5 Mini Judge)

| Category | Google (Gemini 3 Flash) | OpenAI (GPT-5 Mini) | xAI (Grok 4.1 Fast) | Anthropic (Claude Haiku 4.5) |
|----------|:---:|:---:|:---:|:---:|
| **Adherence Overall** | 4.98 | 4.98 | 4.98 | 4.94 |
| **Kindness Overall** | 4.95 | 5.00 | 4.96 | 4.95 |
| **Interfaith Overall** | 4.61 | 4.39 | 4.26 | 4.08 |
| **Average** | **4.85** | **4.79** | **4.73** | **4.66** |

**Observations:**
- **Adherence** and **Kindness** are near-ceiling across all four providers (4.94-5.00). The v1 eval framework doesn't differentiate well here — a v2 with more granular rubrics is needed.
- **Interfaith Sensitivity** is the real differentiator. Scores range from 4.08 to 4.61 — a much wider spread than the other categories.
- GPT-5 Mini achieves a perfect 5.0 on Kindness, meaning the judge found no room for improvement in pastoral tone.

### 2. Interfaith Sub-Scores — The Key Differentiator

| Sub-criterion | Gemini 3 Flash | GPT-5 Mini | Grok 4.1 Fast | Claude Haiku 4.5 |
|---------------|:---:|:---:|:---:|:---:|
| Respect & Handling Objections | 4.09 | 4.20 | 4.31 | 4.20 |
| Objection Acknowledgement | 4.02 | 4.32 | 4.12 | 4.11 |
| Evangelism | **4.99** | 4.02 | 3.88 | 3.54 |
| Gospel Boldness | **5.00** | 4.42 | 4.32 | 4.24 |
| Overall | **4.61** | 4.21 | 4.26 | 4.08 |

**Observations:**
- Gemini 3 Flash scores dramatically higher on **Evangelism** (4.99) and **Gospel Boldness** (5.00) than all other models. The next closest on Evangelism is GPT-5 Mini at 4.02.
- However, Gemini 3 Flash scores *lower* on **Respect/Handling Objections** (4.09) and **Objection Acknowledgement** (4.02). This suggests it prioritizes bold Gospel proclamation at the expense of acknowledging the other side's perspective.
- GPT-5 Mini and Grok 4.1 Fast are more balanced — moderate evangelism scores paired with stronger objection handling.
- Claude Haiku 4.5 scores lowest on Evangelism (3.54) and Gospel Boldness (4.24), suggesting it's more cautious in evangelistic contexts.

#### Cross-Judge Validation of Gemini 3 Flash Interfaith Scores

Gemini 3 Flash was evaluated by all three judges. All three unanimously confirm the exceptional evangelism scores:

| Sub-criterion | GPT-5 Mini Judge | Gemini 2.5 Flash Judge | Claude Haiku Judge |
|---------------|:---:|:---:|:---:|
| Evangelism | 4.99 | 5.00 | 4.99 |
| Gospel Boldness | 5.00 | 5.00 | 5.00 |
| Respect & Handling Objections | 4.09 | 4.46 | 4.72 |
| Objection Acknowledgement | 4.02 | 4.42 | 4.57 |
| **Overall** | **4.61** | **4.93** | **4.79** |

All three judges agree unanimously on perfect Evangelism and Gospel Boldness scores. The divergence is only on respect/objection handling, where GPT-5 Mini is the harshest (4.02-4.09), Gemini falls in the middle (4.42-4.46), and Claude Haiku is the most generous (4.57-4.72). This confirms Gemini 3 Flash's evangelism strength is genuine, not an artifact of any single judge.

### 3. Impact of Custom Instructions (v1.0 vs. Baseline)

All five core models were tested both with and without our custom Reformed Baptist system prompt:

| Model | Baseline | v1.0 | Improvement |
|-------|:---:|:---:|:---:|
| Gemini 2.5 Flash | 4.20 | 4.70 | **+12%** |
| Gemini 3 Flash | 4.51 | 4.85 | **+7%** |
| Claude Haiku 4.5 | 4.39 | 4.66 | **+6%** |
| GPT-5 Mini | 4.59 | 4.79 | **+4%** |
| Grok 4.1 Fast | 4.55 | 4.73 | **+4%** |

**Observations:**
- Gemini 2.5 Flash benefits the most from our custom instructions (+12%), jumping from weakest to competitive.
- Gemini 3 Flash and Claude Haiku 4.5 also see significant gains (+7% and +6% respectively).
- GPT-5 Mini and Grok 4.1 Fast were already relatively strong "out of the box" and improved by ~4%.
- The largest baseline-to-v1.0 gains are in Interfaith Sensitivity, where vanilla models tend to be generic and non-committal about the Gospel.

#### Boldness vs. Respect Trade-Off

An interesting pattern emerged in the baseline data for Gemini 3 Flash and Claude Haiku 4.5: both models score *higher* on Respect/Objection handling **without** the custom prompt than with it, but much lower on Evangelism/Boldness.

| Model | Metric | Baseline | v1.0 | Change |
|-------|--------|:---:|:---:|:---:|
| Gemini 3 Flash | Respect & Objections | 4.42 | 4.09 | -0.33 |
| Gemini 3 Flash | Evangelism | 3.05 | 4.99 | +1.94 |
| Claude Haiku 4.5 | Respect & Objections | 4.43 | 4.20 | -0.23 |
| Claude Haiku 4.5 | Evangelism | 2.90 | 3.54 | +0.64 |

This suggests our v1.0 prompt pushes models to be bolder in Gospel proclamation at the cost of some nuance in acknowledging other perspectives. This trade-off is worth investigating in the v2 framework — ideally, a v1.1 prompt would improve boldness without sacrificing respect.

### 4. Judge Fairness / Grader Bias

Models evaluated by multiple judges show consistent patterns in grading strictness:

| Model | GPT-5 Mini Judge | Gemini 2.5 Flash Judge | Claude Haiku 4.5 Judge |
|-------|:---:|:---:|:---:|
| Gemini 2.5 Flash | 4.70 | 4.86 | 4.87 |
| GPT-5 Mini | 4.79 | 4.90 | 4.87 |
| Grok 4.1 Fast | 4.73 | 4.87 | 4.85 |
| Claude Haiku 4.5 | 4.66 | 4.85 | 4.84 |
| Gemini 3 Flash | 4.85 | 4.98 | 4.93 |

**Observations:**
- **Gemini 2.5 Flash** is the most generous grader — scores are 0.15-0.20 higher than GPT-5 Mini across the board.
- **Claude Haiku 4.5** falls in between — slightly more generous than GPT-5 Mini but more discerning than Gemini.
- **GPT-5 Mini** is the most discerning judge, providing the widest score differentiation. This is why we use it as the primary judge.
- The relative ranking of models is consistent across judges — the *order* doesn't change, only the magnitude.
- Gemini 3 Flash receives the highest score from any judge (4.98 from Gemini), consistent with Gemini's generous grading pattern.

### 5. Provider Consistency (Model Spread)

| Provider | Best Model | Score | Worst Model | Score | Range |
|----------|-----------|:---:|-------------|:---:|:---:|
| Google | Gemini 3 Flash | 4.85 | Gemini 2.0 Flash | 4.60 | 0.25 |
| OpenAI | GPT-5 Mini | 4.79 | GPT-4.1 Mini | 4.68 | 0.11 |
| xAI | Grok 4.1 Fast | 4.73 | Grok 3 Mini | 4.66 | 0.07 |
| Anthropic | Claude Haiku 4.5 | 4.66 | (only model) | — | — |

**Observations:**
- **xAI** is the most consistent provider — only 0.07 gap between their best and worst models.
- **OpenAI** is also tight — 0.11 range across two models.
- **Google** has the widest spread (0.25) across three models, though all are still above 4.5.
- **Anthropic** only has one model tested so far, making spread measurement impossible.

---

## Ceiling Effect & v2 Framework

Adherence and Kindness scores are near-ceiling (4.93-5.00) across all top models with v1.0 system prompts. This means:

1. **The v1 rubric successfully validates baseline quality** — all models pass the core theology and pastoral tone bar.
2. **It can no longer differentiate** between models on those dimensions — scores cluster too tightly at the top.
3. **Interfaith Sensitivity is the only axis with meaningful spread** (4.08-4.61), and even there, sub-scores like Evangelism and Gospel Boldness hit ceiling for Gemini 3 Flash.

A **v2 evaluation framework** is planned to address this by:
- Adding more granular sub-criteria within Adherence (e.g., distinguishing between accurate citation vs. theological depth of application)
- Breaking Kindness into more actionable dimensions (e.g., pastoral tone vs. appropriate challenge/correction)
- Expanding Interfaith to better capture the balance between boldness and respect
- Potentially adding new categories (e.g., practical wisdom, counseling sensitivity)

---

## Recommendations

### For Production Use (Calvinist Parrot)
1. **GPT-5 Mini remains the safest choice** for production. It has full three-judge validation, balanced interfaith scores, and a perfect kindness score.
2. **Gemini 3 Flash is the strongest overall performer** (4.85) with its evangelism/boldness scores unanimously confirmed by all three judges. It now has full validation (3 judges + baseline). Its weaker respect/objection handling scores under GPT-5 Mini judge are a trade-off worth monitoring.
3. **Grok 4.1 Fast** is a strong alternative — competitive scores, strong consistency, and well-validated.

---

## Current Eval Coverage Matrix (v1)

| Gen Model | GPT-5 Mini Judge | Gemini 2.5 Flash Judge | Claude Haiku Judge | Baseline |
|---|:---:|:---:|:---:|:---:|
| Gemini 2.5 Flash | v1 | v1 | v1 | v1 |
| Gemini 3 Flash | v1 | v1 | v1 | v1 |
| GPT-5 Mini | v1 | v1 | v1 | v1 |
| Grok 4.1 Fast | v1 | v1 | v1 | v1 |
| Claude Haiku 4.5 | v1 | v1 | v1 | v1 |
| Gemini 2.0 Flash | v1 | — | — | — |
| GPT-4.1 Mini | v1 | — | — | — |
| Grok 3 Mini | v1 | — | — | — |

---

## v2 Evaluation Roadmap

### Key Decision: Single Judge for v2

The v1 multi-judge experiment answered its question: **GPT-5 Mini is the best judge.** Gemini 2.5 Flash inflates by ~0.15-0.20, Claude Haiku 4.5 inflates by ~0.10-0.15, and the relative ranking of models never changes across judges. Continuing to triple-judge every run provides diminishing returns at 3x the cost.

**v2 will use GPT-5 Mini as the sole judge.** If desired, a one-time spot-check with Gemini 3 Flash as judge (2 runs) can verify the pattern still holds under the new rubric.

### v2 Eval Plan

The v2 framework focuses on the **latest model per provider** only. Older models (Gemini 2.0/2.5 Flash, GPT-4.1 Mini, Grok 3 Mini) are already proven weaker under v1 and will likely be superseded by the time prompt v1.1 is ready.

**Phase 1: v2 Rubric Validation** — Run immediately after v2 framework is designed.

| Gen Model | v2 + v1.0 Prompt | v2 Baseline (no prompt) |
|---|:---:|:---:|
| Gemini 3 Flash | GPT-5 Mini judge | GPT-5 Mini judge |
| GPT-5 Mini | GPT-5 Mini judge | GPT-5 Mini judge |
| Claude Haiku 4.5 | GPT-5 Mini judge | GPT-5 Mini judge |
| Grok 4.1 Fast | GPT-5 Mini judge | GPT-5 Mini judge |

**Phase 1 total: 8 runs**

Purpose: Establish v2 scores for current v1.0 prompt AND vanilla baselines. This creates the reference points for measuring v1.1 improvement. Also serves as a rubric validation — if Adherence/Kindness scores are still near-ceiling, the v2 rubric needs more iteration before investing in v1.1 testing.

**Phase 2: v1.1 Prompt Evaluation** — Run after prompt v1.1 is designed (months later).

| Gen Model | v2 + v1.1 Prompt |
|---|:---:|
| *Latest model per provider at that time* | GPT-5 Mini judge |

Purpose: Measure v1.1 improvement. Compare against Phase 1 v1.0 scores. If new models have been released by providers, test those instead and add fresh baselines. The v2 framework carries over; the models are the variable.

**Phase 2 total: 4 runs** (+ baselines for any new models)

### Optional: Judge Spot-Check (one-time)

If curious whether Gemini 3 Flash is a better cross-validator than Gemini 2.5 Flash:

| Gen Model | Gemini 3 Flash Judge |
|---|:---:|
| GPT-5 Mini | v2 |
| Grok 4.1 Fast | v2 |

**Spot-check total: 2 runs**

### Full Roadmap Summary

| Phase | Timing | Runs | What It Answers |
|---|---|:---:|---|
| ~~v1 completion~~ | ~~Done~~ | ~~3~~ | ~~Fill remaining v1 gaps~~ **Complete** |
| ~~v2 Phase 1~~ | ~~Done~~ | ~~8~~ | ~~Does the new rubric break the ceiling?~~ **Complete** |
| v2 Phase 2 | After v1.1 prompt | 4+ | How much did v1.1 improve things? |
| ~~Judge spot-check~~ | ~~Done~~ | ~~2~~ | ~~Is Gemini 3 Flash a better cross-validator?~~ **Complete** |
| **Total** | | **17+** | |

### Dashboard Update Plan

The dashboard will **not be updated until v1.1 prompt results are in**. At that point, the dashboard will show v2 framework scores with the full v1.0 → v1.1 progression story and whatever the latest models are per provider.

---

## Score Reference

| Score | Meaning |
|:---:|---------|
| **5.0** | Perfect — Strong doctrinal faithfulness, gentle pastoral tone, clear Gospel presentation |
| **4.0-4.9** | Strong — Minor issues in nuance, tone, or interfaith sensitivity but generally reliable |
| **Below 4.0** | Needs significant theological guidance |

---

## Raw Data

The archived v1 evaluation data is available at `content/data/api_evals_comparison_v1.csv`.
