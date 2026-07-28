"""Deterministic source-parity goldens frozen from CP-Evals-Lab.

The expected values in this module were frozen from source commit
4fc02cb2da2c7c8c51ac84558bf9f592cf2d0485. The tests intentionally use only
the copied package and never import or read the sibling repository at runtime.
"""

from __future__ import annotations

import csv
import json
from contextlib import nullcontext

from sermon_evaluator.aggregation import SermonAggregator
from sermon_evaluator.calibration import SermonScoreCalibrator
from sermon_evaluator.harmonization import SermonHarmonizer
from sermon_evaluator.reports import render_csv, render_json, render_markdown
from sermon_evaluator.schemas import (
    AggregatedSummaryFeedback,
    ApplicationScores,
    ConclusionScores,
    ExegeticalSupportScores,
    IllustrationsScores,
    IntroductionScores,
    MainPointsScores,
    PropositionScores,
    SermonExtractionStep1,
    SermonFCF,
    SermonGeneralComments,
    SermonPoint,
    SermonScoringStep2,
    SermonScoringStep2Raw,
)

SOURCE_COMMIT = "4fc02cb2da2c7c8c51ac84558bf9f592cf2d0485"

SOURCE_PARITY_EXPECTED = {
    "aggregates": {
        "Textual_Fidelity": 5.0,
        "Proposition_Clarity": 4.0,
        "Introduction": 2.0,
        "Application_Effectiveness": 3.0,
        "Structure_Cohesion": 1.5,
        "Illustrations": 2.0,
        "Overall_Impact_Base": 3.1,
        "Overall_Impact_Adjusted": 3.1,
        "Overall_Impact": 3.1,
        "duration_penalty": 0.0,
        "duration_adjustment_enabled": False,
    },
    "strict_calibration": {
        "Introduction": {
            "FCF_Introduced": 2,
            "Arouses_Attention": 5,
            "Overall": 3,
        },
        "Proposition": {
            "Principle_and_Application_Wed": 2,
            "Establishes_Main_Theme": 2,
            "Summarizes_Introduction": 2,
            "Overall": 1,
        },
        "Main_Points": {
            "Clarity": 5,
            "Hortatory_Universal_Truths": 5,
            "Proportional_and_Coexistent": 2,
            "Exposition_Quality": 5,
            "Illustration_Quality": 2,
            "Application_Quality": 2,
            "Overall": 3,
        },
        "Exegetical_Support": {
            "Alignment_with_Text": 5,
            "Handles_Difficulties": 5,
            "Proof_Accuracy_and_Clarity": 5,
            "Context_and_Genre_Considered": 5,
            "Not_Belabored": 5,
            "Aids_Rather_Than_Impresses": 5,
            "Overall": 4,
        },
        "Application": {
            "Clear_and_Practical": 5,
            "Redemptive_Focus": 5,
            "Mandate_vs_Idea_Distinction": 5,
            "Passage_Supported": 5,
            "Overall": 4,
        },
        "Illustrations": {
            "Lived_Body_Detail": 3,
            "Strengthens_Points": 3,
            "Proportion": 3,
            "Overall": 2,
        },
        "Conclusion": {
            "Summary": 2,
            "Compelling_Exhortation": 2,
            "Climax": 2,
            "Pointed_End": 2,
            "Overall": 1,
        },
    },
    "ceiling_compression": {
        "Proposition": {
            "Principle_and_Application_Wed": 2,
            "Establishes_Main_Theme": 2,
            "Summarizes_Introduction": 2,
            "Overall": 2,
        },
        "Main_Points": {
            "Clarity": 3,
            "Hortatory_Universal_Truths": 3,
            "Proportional_and_Coexistent": 2,
            "Exposition_Quality": 5,
            "Illustration_Quality": 2,
            "Application_Quality": 2,
            "Overall": 3,
        },
        "Exegetical_Support": {
            "Alignment_with_Text": 3,
            "Handles_Difficulties": 5,
            "Proof_Accuracy_and_Clarity": 5,
            "Context_and_Genre_Considered": 5,
            "Not_Belabored": 5,
            "Aids_Rather_Than_Impresses": 5,
            "Overall": 5,
        },
        "Application": {
            "Clear_and_Practical": 3,
            "Redemptive_Focus": 4,
            "Mandate_vs_Idea_Distinction": 5,
            "Passage_Supported": 5,
            "Overall": 5,
        },
        "Illustrations": {
            "Lived_Body_Detail": 3,
            "Strengthens_Points": 3,
            "Proportion": 3,
            "Overall": 3,
        },
        "Conclusion": {
            "Summary": 2,
            "Compelling_Exhortation": 2,
            "Climax": 2,
            "Pointed_End": 2,
            "Overall": 2,
        },
    },
}


def _extraction(
    *,
    body: list[SermonPoint],
    proposition: str,
    conclusion: str,
    fcf: str,
    audio_duration: float | None = None,
) -> SermonExtractionStep1:
    return SermonExtractionStep1(
        Scripture_Introduction="Romans 8:1-4",
        Sermon_Introduction="Grace for guilty people",
        Proposition=proposition,
        Body=body,
        Conclusion=conclusion,
        General_Comments=SermonGeneralComments(),
        Fallen_Condition_Focus=SermonFCF(FCF=fcf),
        Extraction_Confidence=0.9,
        audio_duration=audio_duration,
    )


def _uniform_scoring(score: int, *, confidence: float = 0.8) -> SermonScoringStep2:
    return SermonScoringStep2(
        **_uniform_raw(score, confidence=confidence).model_dump()
    )


def _uniform_raw(score: int, *, confidence: float) -> SermonScoringStep2Raw:
    return SermonScoringStep2Raw(
        Introduction=IntroductionScores(
            FCF_Introduced=score,
            Arouses_Attention=score,
            Overall=score,
            Feedback=f"introduction-{score}",
        ),
        Proposition=PropositionScores(
            Principle_and_Application_Wed=score,
            Establishes_Main_Theme=score,
            Summarizes_Introduction=score,
            Overall=score,
            Feedback=f"proposition-{score}",
        ),
        Main_Points=MainPointsScores(
            Clarity=score,
            Hortatory_Universal_Truths=score,
            Proportional_and_Coexistent=score,
            Exposition_Quality=score,
            Illustration_Quality=score,
            Application_Quality=score,
            Overall=score,
            Feedback=f"main-points-{score}",
        ),
        Exegetical_Support=ExegeticalSupportScores(
            Alignment_with_Text=score,
            Handles_Difficulties=score,
            Proof_Accuracy_and_Clarity=score,
            Context_and_Genre_Considered=score,
            Not_Belabored=score,
            Aids_Rather_Than_Impresses=score,
            Overall=score,
            Feedback=f"exegesis-{score}",
        ),
        Application=ApplicationScores(
            Clear_and_Practical=score,
            Redemptive_Focus=score,
            Mandate_vs_Idea_Distinction=score,
            Passage_Supported=score,
            Overall=score,
            Feedback=f"application-{score}",
        ),
        Illustrations=IllustrationsScores(
            Lived_Body_Detail=score,
            Strengthens_Points=score,
            Proportion=score,
            Overall=score,
            Feedback=f"illustrations-{score}",
        ),
        Conclusion=ConclusionScores(
            Summary=score,
            Compelling_Exhortation=score,
            Climax=score,
            Pointed_End=score,
            Overall=score,
            Feedback=f"conclusion-{score}",
        ),
        Strengths=[f"strength-{score}"],
        Growth_Areas=[f"growth-{score}"],
        Next_Steps=[f"next-{score}"],
        Scoring_Confidence=confidence,
    )


def _aggregation_scoring() -> SermonScoringStep2:
    scoring = _uniform_scoring(3)
    scoring.Exegetical_Support = ExegeticalSupportScores(
        Alignment_with_Text=5,
        Handles_Difficulties=5,
        Proof_Accuracy_and_Clarity=5,
        Context_and_Genre_Considered=5,
        Not_Belabored=5,
        Aids_Rather_Than_Impresses=5,
        Overall=5,
    )
    scoring.Main_Points = MainPointsScores(
        Clarity=1,
        Hortatory_Universal_Truths=1,
        Proportional_and_Coexistent=1,
        Exposition_Quality=5,
        Illustration_Quality=2,
        Application_Quality=3,
        Overall=2,
    )
    scoring.Proposition = PropositionScores(
        Principle_and_Application_Wed=4,
        Establishes_Main_Theme=4,
        Summarizes_Introduction=4,
        Overall=4,
    )
    scoring.Introduction = IntroductionScores(
        FCF_Introduced=2,
        Arouses_Attention=2,
        Overall=2,
    )
    scoring.Application = ApplicationScores(
        Clear_and_Practical=3,
        Redemptive_Focus=3,
        Mandate_vs_Idea_Distinction=3,
        Passage_Supported=3,
        Overall=3,
    )
    scoring.Illustrations = IllustrationsScores(
        Lived_Body_Detail=2,
        Strengthens_Points=2,
        Proportion=2,
        Overall=2,
    )
    scoring.Conclusion = ConclusionScores(
        Summary=1,
        Compelling_Exhortation=3,
        Climax=3,
        Pointed_End=1,
        Overall=2,
    )
    return scoring


def _numeric_section_dump(scoring: SermonScoringStep2) -> dict[str, dict[str, int]]:
    return {
        section_name: {
            field_name: value
            for field_name, value in getattr(scoring, section_name)
            .model_dump()
            .items()
            if field_name != "Feedback"
        }
        for section_name in (
            "Introduction",
            "Proposition",
            "Main_Points",
            "Exegetical_Support",
            "Application",
            "Illustrations",
            "Conclusion",
        )
    }


def _rich_extraction() -> SermonExtractionStep1:
    body = [
        SermonPoint(
            Point="Trust Christ because his verdict is final",
            Verses="Romans 8:1",
            Summary="Believers should rest in Christ rather than self-justify.",
            Illustrations=["A canceled legal debt"],
            Application=["Trust in Christ and reject self-righteousness."],
        ),
        SermonPoint(
            Point="Walk by the Spirit because he gives life",
            Verses="Romans 8:2",
            Summary="Believers must obey through the Spirit's power.",
            Illustrations=["A freed prisoner"],
            Application=["Pray for grace and obey the Spirit's word."],
        ),
        SermonPoint(
            Point="Rejoice because God accomplished salvation",
            Verses="Romans 8:3-4",
            Summary="The church should rejoice in the gospel's finished work.",
            Illustrations=["A debt fully paid"],
            Application=["Rejoice in the gospel and serve your neighbor."],
        ),
    ]
    conclusion = (
        "The preacher exhorts the church to believe the gospel and builds toward "
        "a compelling climax: Christ has borne condemnation, the Spirit has given "
        "life, and the Father will finish his saving work. Therefore the congregation "
        "must reject self-righteousness, rest in grace, walk in obedient faith, serve "
        "one another, and rejoice together in God's eternal glory forevermore."
    )
    return _extraction(
        body=body,
        proposition="Because Christ removed condemnation, believers must walk by the Spirit.",
        conclusion=conclusion,
        fcf="The fear of man that drives self-righteous performance under condemnation.",
        audio_duration=40 * 60,
    )


def test_frozen_aggregation_weights_and_duration_policy() -> None:
    assert SOURCE_COMMIT == "4fc02cb2da2c7c8c51ac84558bf9f592cf2d0485"
    extraction = _rich_extraction()
    aggregator = SermonAggregator()
    summary = aggregator.compute_aggregates(_aggregation_scoring(), extraction)

    assert summary.model_dump() == SOURCE_PARITY_EXPECTED["aggregates"]
    # 5(.24) + 3(.24) + 1.5(.20) + 4(.12) + 2(.10) + 2(.10)
    assert summary.Overall_Impact_Base == 3.1

    off = aggregator.apply_duration_penalty(
        summary.model_copy(deep=True),
        20 * 60,
        enabled=False,
    )
    assert off.model_dump() == {
        **SOURCE_PARITY_EXPECTED["aggregates"],
        "Overall_Impact_Adjusted": 2.1,
        "Overall_Impact": 3.1,
        "duration_penalty": 1.0,
        "duration_adjustment_enabled": False,
    }

    on = aggregator.apply_duration_penalty(
        summary.model_copy(deep=True),
        20 * 60,
        enabled=True,
    )
    assert on.model_dump() == {
        **SOURCE_PARITY_EXPECTED["aggregates"],
        "Overall_Impact_Adjusted": 2.1,
        "Overall_Impact": 2.1,
        "duration_penalty": 1.0,
        "duration_adjustment_enabled": True,
    }


def test_frozen_strict_calibration_and_ceiling_compression() -> None:
    extraction = _extraction(
        body=[
            SermonPoint(
                Point=(
                    "This deliberately long descriptive point recounts several "
                    "ideas without giving the hearer any imperative or clear "
                    "hortatory universal truth to obey"
                ),
                Summary="The passage discusses a number of related ideas.",
                Illustrations=[],
                Application=[],
            )
        ],
        proposition="",
        conclusion="",
        fcf="sin",
    )
    calibrator = SermonScoreCalibrator()

    strict = calibrator.apply_strict_calibration(
        _uniform_scoring(5),
        extraction,
    )
    assert (
        _numeric_section_dump(strict)
        == SOURCE_PARITY_EXPECTED["strict_calibration"]
    )

    compressed = calibrator.apply_ceiling_compression(strict, extraction)
    assert _numeric_section_dump(compressed) == {
        **SOURCE_PARITY_EXPECTED["strict_calibration"],
        **SOURCE_PARITY_EXPECTED["ceiling_compression"],
    }


class _FrozenPrompts:
    HARMONIZE_INSTRUCTIONS = "harmonize"
    HARMONIZE_SYSTEM_PROMPT = "harmonize-system"
    AGG_SUMMARY_INSTRUCTIONS = "aggregate"
    AGG_SUMMARY_SYSTEM_PROMPT = "aggregate-system"
    SCORING_INSTRUCTIONS = "score"
    SCORING_SYSTEM_PROMPT = "score-system"


class _NoopAudioManager:
    @staticmethod
    def upload_indicator(*, message: str):
        assert message
        return nullcontext()


class _FrozenProvider:
    def __init__(self) -> None:
        self.calls: list[type] = []

    def generate_structured(self, *, response_schema: type, **_: object) -> dict:
        self.calls.append(response_schema)
        if response_schema is SermonScoringStep2Raw:
            feedback = _uniform_raw(3, confidence=0.5)
            feedback.Introduction.Feedback = "harmonized introduction"
            feedback.Strengths = ["harmonized strength"]
            feedback.Growth_Areas = ["harmonized growth"]
            feedback.Next_Steps = ["harmonized next step"]
            return feedback.model_dump()
        assert response_schema is AggregatedSummaryFeedback
        return {
            "Textual_Fidelity": "faithful",
            "Proposition_Clarity": "clear",
            "Introduction": "focused",
            "Application_Effectiveness": "practical",
            "Structure_Cohesion": "cohesive",
            "Illustrations": "proportionate",
            "Overall_Impact": "strong",
        }


def test_frozen_confidence_weighted_harmonization() -> None:
    provider = _FrozenProvider()
    harmonizer = SermonHarmonizer(
        provider=provider,
        model="frozen-model",
        prompts=_FrozenPrompts(),
    )
    harmonizer.audio_manager = _NoopAudioManager()

    scoring = harmonizer.harmonize_runs(
        [
            _uniform_raw(1, confidence=0.25),
            _uniform_raw(5, confidence=0.75),
        ],
        _rich_extraction(),
        audio_file_obj=None,
    )

    numeric_sections = scoring.model_dump(
        exclude={
            "Strengths",
            "Growth_Areas",
            "Next_Steps",
            "Scoring_Confidence",
            "Aggregated_Summary",
            "Aggregated_Summary_Feedback",
        }
    )
    for section in numeric_sections.values():
        assert {
            key: value
            for key, value in section.items()
            if key != "Feedback"
        } == {
            key: 4
            for key in section
            if key != "Feedback"
        }
    # (1 * .25) + (5 * .75) = 4; a simple unweighted average would be 3.
    assert scoring.Scoring_Confidence == 0.625
    assert scoring.Introduction.Feedback == "harmonized introduction"
    assert scoring.Strengths == ["harmonized strength"]
    assert scoring.Aggregated_Summary.model_dump() == {
        "Textual_Fidelity": 4.0,
        "Proposition_Clarity": 4.0,
        "Introduction": 4.0,
        "Application_Effectiveness": 4.0,
        "Structure_Cohesion": 4.0,
        "Illustrations": 4.0,
        "Overall_Impact_Base": 4.0,
        "Overall_Impact_Adjusted": 4.0,
        "Overall_Impact": 4.0,
        "duration_penalty": 0.0,
        "duration_adjustment_enabled": False,
    }
    assert scoring.Aggregated_Summary_Feedback.model_dump() == {
        "Textual_Fidelity": "faithful",
        "Proposition_Clarity": "clear",
        "Introduction": "focused",
        "Application_Effectiveness": "practical",
        "Structure_Cohesion": "cohesive",
        "Illustrations": "proportionate",
        "Overall_Impact": "strong",
    }
    assert provider.calls == [SermonScoringStep2Raw, AggregatedSummaryFeedback]


def test_frozen_report_field_mapping() -> None:
    extraction = _rich_extraction()
    scoring = _aggregation_scoring()
    scoring.Aggregated_Summary = SermonAggregator().compute_aggregates(
        scoring,
        extraction,
    )

    csv_report = render_csv(
        preacher="Pastor_Example",
        label="Romans 8",
        scoring=scoring,
        model="frozen-model",
        extraction=extraction,
        num_scoring_runs=3,
        preached_date="2026-07-27",
        timestamp="2026-07-28T00:00:00+00:00",
    )
    assert next(csv.DictReader(csv_report.splitlines())) == {
        "timestamp": "2026-07-28T00:00:00+00:00",
        "label": "Romans 8",
        "model": "frozen-model",
        "preacher": "Pastor Example",
        "preached_date": "2026-07-27",
        "Textual_Fidelity": "5.0",
        "Proposition_Clarity": "4.0",
        "Introduction": "2.0",
        "Application_Effectiveness": "3.0",
        "Structure_Cohesion": "1.5",
        "Illustrations": "2.0",
        "Overall_Impact_Base": "3.1",
        "Overall_Impact_Adjusted": "3.1",
        "Overall_Impact": "3.1",
        "audio_duration_minutes": "40.0",
        "duration_penalty": "0.0",
        "duration_adjustment_enabled": "False",
        "num_scoring_runs": "3",
    }

    json_report = json.loads(
        render_json(
            extraction,
            scoring,
            metadata={
                "sourceCommit": SOURCE_COMMIT,
                "evaluationId": "evaluation-golden",
            },
        )
    )
    assert json_report["reportVersion"] == "1.0.0"
    assert json_report["metadata"] == {
        "evaluationId": "evaluation-golden",
        "sourceCommit": SOURCE_COMMIT,
    }
    assert json_report["extraction"]["Proposition"] == extraction.Proposition
    assert (
        json_report["scoring"]["Aggregated_Summary"]
        == SOURCE_PARITY_EXPECTED["aggregates"]
    )

    markdown = render_markdown(
        extraction,
        scoring,
        label="Romans 8",
        model="frozen-model",
        num_scoring_runs=3,
        generated_at="2026-07-28 00:00:00",
    )
    assert "# Sermon Evaluation Report — Romans 8" in markdown
    assert "Generated: 2026-07-28 00:00:00" in markdown
    assert "**Overall Impact: 3.1**" in markdown
    assert "| Textual Fidelity | 5.0 | - |" in markdown
    assert "**Audio Duration:** 40.0 minutes (penalty applied: 0.00)" in markdown
