"""Human-readable Markdown report renderer."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from ..rubric import AGGREGATES, RUBRIC_SECTIONS
from ..schemas import SermonExtractionStep1, SermonScoringStep2


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
    del provider
    timestamp = generated_at or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    title = (
        f"Sermon Evaluation Report — {label}"
        if label
        else "Sermon Evaluation Report"
    )

    aggregate_markdown = ""
    if scoring.Aggregated_Summary is not None:
        summary = scoring.Aggregated_Summary
        feedback = scoring.Aggregated_Summary_Feedback

        def aggregate_feedback(field: str) -> str:
            value = None if feedback is None else getattr(feedback, field, None)
            return (value or "-").replace("\n", " ")

        rows = []
        coaching_sections = []
        for aggregate in AGGREGATES:
            value = getattr(summary, aggregate.key, None)
            if value is not None:
                rows.append(f"| {aggregate.label} | {value} |")
                coaching_sections.append(
                    f"### {aggregate.label}\n\n"
                    f"{aggregate_feedback(aggregate.key)}"
                )
        if scoring.Doctrinal_Fidelity is not None:
            doctrine_feedback = aggregate_feedback("Doctrinal_Fidelity")
            rows.append(
                "| Doctrinal Fidelity (gate) | "
                f"{scoring.Doctrinal_Fidelity.Overall} |"
            )
            coaching_sections.append(
                "### Doctrinal Fidelity (gate)\n\n"
                f"{doctrine_feedback}"
            )

        overall_feedback = (
            None if feedback is None else feedback.Overall_Impact
        ) or "-"
        gate_notice = ""
        if summary.doctrinal_gate_applied:
            gate_reason = (
                scoring.Doctrinal_Fidelity.Gate_Reason
                if scoring.Doctrinal_Fidelity is not None
                else None
            )
            gate_notice = (
                f"\n\n**Core-doctrine gate applied:** Overall Impact was capped at "
                f"{summary.doctrinal_gate_cap:.1f}. {_fmt_opt(gate_reason)}"
            )
        aggregate_markdown = f"""
## Aggregated Summary

**Overall Impact: {summary.Overall_Impact}**

| Metric | Score |
|---|---:|
{chr(10).join(rows)}

### Overall Coaching

{overall_feedback.strip()}{gate_notice}

## Aggregate Coaching

{chr(10).join(coaching_sections)}
""".strip()

    points_markdown: list[str] = []
    for index, point in enumerate(extraction.Body, start=1):
        subpoints = "\n".join(f"  * {item}" for item in point.Subpoints)
        illustrations = "\n".join(
            f"  * {item}" for item in point.Illustrations
        )
        applications = "\n".join(f"  * {item}" for item in point.Application)
        points_markdown.append(
            f"""
### {index}. {point.Point}{f" ({point.Verses})" if point.Verses else ""}

Summary: {point.Summary}

* Subpoints:
{subpoints or "  * (none)"}
* Illustrations:
{illustrations or "  * (none)"}
* Applications:
{applications or "  * (none)"}

Comments: {_fmt_opt(point.Comments)}

Feedback: {_fmt_opt(point.Feedback)}
""".strip()
        )

    scoring_sections: list[str] = []
    for section_definition in RUBRIC_SECTIONS:
        section = getattr(scoring, section_definition.key, None)
        if section is None:
            continue
        rows = "\n".join(
            f"| {criterion.label} | {value} |"
            for criterion in section_definition.criteria
            if (value := getattr(section, criterion.key, None)) is not None
        )
        gate = ""
        if section_definition.key == "Doctrinal_Fidelity":
            gate = (
                f"\nCore Doctrine Gate: {section.Core_Doctrine_Gate}"
                f"\nGate Reason: {_fmt_opt(section.Gate_Reason)}"
            )
        scoring_sections.append(
            f"""
### {section_definition.label}

| Criterion | Score |
|---|---:|
{rows}

Overall: {section.Overall}{gate}

Feedback: {_fmt_opt(section.Feedback)}
""".strip()
        )

    strengths = "\n".join(f"* {item}" for item in scoring.Strengths) or "* (none)"
    growth_areas = (
        "\n".join(f"* {item}" for item in scoring.Growth_Areas) or "* (none)"
    )
    next_steps = "\n".join(f"* {item}" for item in scoring.Next_Steps) or "* (none)"

    evidence_sections = ""
    if extraction.Pastoral_Posture_Evidence is not None:
        evidence = extraction.Pastoral_Posture_Evidence
        evidence_sections += f"""

### Pastoral Posture Evidence
* Shared subjection: {"; ".join(evidence.Shared_Subjection_Evidence) or "(none identified)"}
* Servant authority: {"; ".join(evidence.Servant_Authority_Evidence) or "(none identified)"}
* Courageous and gentle care: {"; ".join(evidence.Courageous_Gentle_Care_Evidence) or "(none identified)"}
* Differentiated application: {"; ".join(evidence.Differentiated_Application_Evidence) or "(none identified)"}
* Pastoral use of power: {"; ".join(evidence.Pastoral_Power_Evidence) or "(none identified)"}
* Contrary evidence: {"; ".join(evidence.Contrary_Evidence) or "(none identified)"}
"""
    if extraction.Doctrinal_Fidelity_Evidence is not None:
        evidence = extraction.Doctrinal_Fidelity_Evidence
        evidence_sections += f"""

### Doctrinal Fidelity Evidence
* Core doctrines implicated: {", ".join(evidence.Core_Doctrines_Implicated) or "(none identified)"}
* Affirming evidence: {"; ".join(evidence.Affirming_Evidence) or "(none identified)"}
* Contradicting evidence: {"; ".join(evidence.Contradicting_Evidence) or "(none identified)"}
* Secondary/tertiary handling: {_fmt_opt(evidence.Secondary_Tertiary_Handling) or "(not implicated)"}
"""

    methodology = (
        f"Self-consistency: {num_scoring_runs} independent scoring runs were "
        "combined using confidence-weighted score aggregation and feedback synthesis."
        if num_scoring_runs > 1
        else "Standard: one scoring run."
    )
    duration_metadata = ""
    if extraction.audio_duration is not None:
        duration_metadata = (
            f"\nAudio Duration: {extraction.audio_duration / 60.0:.2f} minutes"
        )
    if (
        scoring.Aggregated_Summary is not None
        and scoring.Aggregated_Summary.duration_adjustment_enabled
    ):
        duration_metadata += (
            "\nDuration Adjustment: Enabled"
            f"\nDuration Penalty: {scoring.Aggregated_Summary.duration_penalty:.2f}"
        )
    else:
        duration_metadata += "\nDuration Adjustment: Disabled"

    return f"""
# {title}

{aggregate_markdown}

### Strengths
{strengths}

### Growth Areas
{growth_areas}

### Next Steps
{next_steps}

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
{chr(10).join(points_markdown)}

### Conclusion
{extraction.Conclusion}

### General Comments
* Content: {_fmt_opt(extraction.General_Comments.Content_Comments)}
* Structure: {_fmt_opt(extraction.General_Comments.Structure_Comments)}
* Explanation: {_fmt_opt(extraction.General_Comments.Explanation_Comments)}
* Illustration ethics: {_fmt_opt(extraction.General_Comments.Illustration_Ethics_Comments)}
{evidence_sections}

## Step 2 – Analytical Scoring

{chr(10).join(scoring_sections)}

## Evaluation Metadata

Generated: {timestamp}
Model: {model or "-"}
Extraction Confidence: {extraction.Extraction_Confidence}
Scoring Confidence: {scoring.Scoring_Confidence}
Evaluation Methodology: {methodology}{duration_metadata}
""".strip()
