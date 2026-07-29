"""Markdown renderer for sermon evaluation results.

Produces a concise, human-friendly report combining Step 1 extraction and
Step 2 scoring, including Aggregated Summary roll-ups.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from ..schemas import (
    SermonExtractionStep1,
    SermonScoringStep2,
)


def _fmt_opt(text: Optional[str]) -> str:
    return text or ""


def render_markdown(
    extraction: SermonExtractionStep1,
    scoring: SermonScoringStep2,
    *,
    label: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    num_scoring_runs: int = 1,
    generated_at: Optional[str] = None,
) -> str:
    ts = generated_at or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    title = (
        f"Sermon Evaluation Report — {label}" if label else "Sermon Evaluation Report"
    )

    # Duration Analysis (if available)
    duration_md = ""
    if extraction.audio_duration is not None:
        duration_minutes = round(extraction.audio_duration / 60.0, 2)
        penalty_text = ""
        if (
            scoring.Aggregated_Summary
            and scoring.Aggregated_Summary.duration_adjustment_enabled
            and scoring.Aggregated_Summary.duration_penalty is not None
        ):
            penalty = scoring.Aggregated_Summary.duration_penalty
            penalty_text = f" (penalty applied: {penalty:.2f})"
        duration_md = (
            f"\n**Audio Duration:** {duration_minutes} minutes{penalty_text}\n"
        )

    # Evaluation Methodology (if multi-run)
    methodology_md = ""
    if num_scoring_runs > 1:
        methodology_md = f"""
**Evaluation Methodology:** This sermon was evaluated using {num_scoring_runs} independent scoring runs with confidence-weighted harmonization. Each run used a different random seed to reduce bias. Final scores represent confidence-weighted averages, and feedback was synthesized by a meta-evaluator LLM to capture consensus insights while noting minority perspectives.
"""

    # Aggregated Summary (if present)
    agg_md = ""
    if scoring.Aggregated_Summary is not None:
        a = scoring.Aggregated_Summary
        fb = getattr(scoring, "Aggregated_Summary_Feedback", None)

        def _agg_fb(field: str) -> str:
            if fb is None:
                return "-"
            value = getattr(fb, field, None)
            return (value or "-").replace("\n", " ")

        raw_overall_fb = None if fb is None else getattr(fb, "Overall_Impact", None)
        overall_fb = (raw_overall_fb or "-").strip()
        agg_md = f"""
## Aggregated Summary

**Overall Impact: {a.Overall_Impact}**

{overall_fb}
{duration_md}
| Metric | Score | Feedback |
|---|---:|---|
| Textual Fidelity | {a.Textual_Fidelity} | {_agg_fb("Textual_Fidelity")} |
| Proposition Clarity | {a.Proposition_Clarity} | {_agg_fb("Proposition_Clarity")} |
| Introduction | {a.Introduction} | {_agg_fb("Introduction")} |
| Application Effectiveness | {a.Application_Effectiveness} | {_agg_fb("Application_Effectiveness")} |
| Structure Cohesion | {a.Structure_Cohesion} | {_agg_fb("Structure_Cohesion")} |
| Illustrations | {a.Illustrations} | {_agg_fb("Illustrations")} |
""".strip()

    # Step 1: Structure
    points_md_lines = []
    for idx, p in enumerate(extraction.Body, start=1):
        subpoints = "\n".join([f"  * {s}" for s in (p.Subpoints or [])])
        illus = "\n".join([f"  * {s}" for s in (p.Illustrations or [])])
        apps = "\n".join([f"  * {s}" for s in (p.Application or [])])
        points_md_lines.append(
            f"""
### {idx}. {p.Point}{f" ({p.Verses})" if p.Verses else ""}

Summary: {p.Summary}

* Subpoints:
{subpoints or "  * (none)"}
* Illustrations:
{illus or "  * (none)"}
* Applications:
{apps or "  * (none)"}

Comments: {_fmt_opt(p.Comments)}

Feedback: {_fmt_opt(p.Feedback)}
""".strip()
        )
    points_md = "\n\n".join(points_md_lines)

    # Scoring breakdown (compact per category)
    def cat_table(
        title: str, mapping: dict, overall: int, feedback: Optional[str]
    ) -> str:
        rows = "\n".join(
            [f"| {k.replace('_', ' ')} | {v} |" for k, v in mapping.items()]
        )
        return f"""
### {title}

| Criterion | Score |
|---|---:|
{rows}

Overall: {overall}
Feedback: {_fmt_opt(feedback)}
""".strip()

    intro_map = {
        "FCF Introduced": scoring.Introduction.FCF_Introduced,
        "Arouses Attention": scoring.Introduction.Arouses_Attention,
    }
    prop_map = {
        "Principle + Application Wed": scoring.Proposition.Principle_and_Application_Wed,
        "Establishes Main Theme": scoring.Proposition.Establishes_Main_Theme,
        "Summarizes Introduction": scoring.Proposition.Summarizes_Introduction,
    }
    mp_map = {
        "Clarity": scoring.Main_Points.Clarity,
        "Hortatory Universal Truths": scoring.Main_Points.Hortatory_Universal_Truths,
        "Proportional & Coexistent": scoring.Main_Points.Proportional_and_Coexistent,
        "Exposition Quality": scoring.Main_Points.Exposition_Quality,
        "Illustration Quality": scoring.Main_Points.Illustration_Quality,
        "Application Quality": scoring.Main_Points.Application_Quality,
    }
    exg_map = {
        "Alignment with Text": scoring.Exegetical_Support.Alignment_with_Text,
        "Handles Difficulties": scoring.Exegetical_Support.Handles_Difficulties,
        "Proof Accuracy & Clarity": scoring.Exegetical_Support.Proof_Accuracy_and_Clarity,
        "Context & Genre Considered": scoring.Exegetical_Support.Context_and_Genre_Considered,
        "Not Belabored": scoring.Exegetical_Support.Not_Belabored,
        "Aids Rather Than Impresses": scoring.Exegetical_Support.Aids_Rather_Than_Impresses,
    }
    app_map = {
        "Clear & Practical": scoring.Application.Clear_and_Practical,
        "Redemptive Focus": scoring.Application.Redemptive_Focus,
        "Mandate vs Idea Distinction": scoring.Application.Mandate_vs_Idea_Distinction,
        "Passage Supported": scoring.Application.Passage_Supported,
    }
    ill_map = {
        "Lived-Body Detail": scoring.Illustrations.Lived_Body_Detail,
        "Strengthens Points": scoring.Illustrations.Strengthens_Points,
        "Proportion": scoring.Illustrations.Proportion,
    }
    con_map = {
        "Summary": scoring.Conclusion.Summary,
        "Compelling Exhortation": scoring.Conclusion.Compelling_Exhortation,
        "Climax": scoring.Conclusion.Climax,
        "Pointed End": scoring.Conclusion.Pointed_End,
    }

    scoring_md = "\n\n".join(
        [
            cat_table(
                "Introduction",
                intro_map,
                scoring.Introduction.Overall,
                scoring.Introduction.Feedback,
            ),
            cat_table(
                "Proposition",
                prop_map,
                scoring.Proposition.Overall,
                scoring.Proposition.Feedback,
            ),
            cat_table(
                "Main Points",
                mp_map,
                scoring.Main_Points.Overall,
                scoring.Main_Points.Feedback,
            ),
            cat_table(
                "Exegetical Support",
                exg_map,
                scoring.Exegetical_Support.Overall,
                scoring.Exegetical_Support.Feedback,
            ),
            cat_table(
                "Application",
                app_map,
                scoring.Application.Overall,
                scoring.Application.Feedback,
            ),
            cat_table(
                "Illustrations",
                ill_map,
                scoring.Illustrations.Overall,
                scoring.Illustrations.Feedback,
            ),
            cat_table(
                "Conclusion",
                con_map,
                scoring.Conclusion.Overall,
                scoring.Conclusion.Feedback,
            ),
        ]
    )

    strengths_md = (
        "\n".join([f"* {s}" for s in (scoring.Strengths or [])]) or "* (none)"
    )
    growth_md = (
        "\n".join([f"* {s}" for s in (scoring.Growth_Areas or [])]) or "* (none)"
    )
    next_md = "\n".join([f"* {s}" for s in (scoring.Next_Steps or [])]) or "* (none)"

    md = f"""
# {title}

Generated: {ts} 
Model: {model or "-"} 
Extraction Confidence: {extraction.Extraction_Confidence} 
Scoring Confidence: {scoring.Scoring_Confidence} 
{methodology_md}
{agg_md}

### Strengths
{strengths_md}

### Growth Areas
{growth_md}

### Next Steps
{next_md}

## Step 1 – Structural Extraction

### Scripture Introduction
{extraction.Scripture_Introduction}

### Sermon Introduction
{extraction.Sermon_Introduction}

### Proposition
{extraction.Proposition}

### Fallen Condition Focus (FCF)
{extraction.Fallen_Condition_Focus.FCF}

Comments: {_fmt_opt(extraction.Fallen_Condition_Focus.Comments)}

### Body
{points_md}

### Conclusion
{extraction.Conclusion}

### General Comments
* Content: {_fmt_opt(extraction.General_Comments.Content_Comments)}
* Structure: {_fmt_opt(extraction.General_Comments.Structure_Comments)}
* Explanation: {_fmt_opt(extraction.General_Comments.Explanation_Comments)}

## Step 2 – Analytical Scoring

{scoring_md}
""".strip()

    return md
