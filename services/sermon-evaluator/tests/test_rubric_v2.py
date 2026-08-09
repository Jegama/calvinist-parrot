from __future__ import annotations

from contextlib import nullcontext

import pytest
from pydantic import ValidationError

from sermon_evaluator.aggregation import SermonAggregator
from sermon_evaluator.harmonization import SermonHarmonizer
from sermon_evaluator.rubric import (
    AGGREGATES,
    CRITERIA_COUNT,
    RUBRIC_SECTIONS,
    RUBRIC_VERSION,
)
from sermon_evaluator.schemas import (
    AggregatedSummary,
    AggregatedSummaryFeedback,
    SermonHarmonizedFeedback,
    SermonScoringStep2,
    SermonScoringStep2Raw,
)

from conftest import make_raw


def test_registry_is_the_complete_v2_rubric() -> None:
    assert RUBRIC_VERSION == "sermon-rubric-v2"
    assert CRITERIA_COUNT == 37
    assert [section.key for section in RUBRIC_SECTIONS][-2:] == [
        "Doctrinal_Fidelity",
        "Pastoral_Posture",
    ]
    assert sum(aggregate.weight for aggregate in AGGREGATES) == pytest.approx(1.0)
    assert [aggregate.key for aggregate in AGGREGATES][-1] == "Pastoral_Posture"


def test_registry_matches_llm_and_aggregate_schemas() -> None:
    raw = make_raw()
    for section_definition in RUBRIC_SECTIONS:
        section = getattr(raw, section_definition.key)
        administrative_fields = {"Overall", "Feedback"}
        if section_definition.key == "Doctrinal_Fidelity":
            administrative_fields.update({"Core_Doctrine_Gate", "Gate_Reason"})
        assert set(type(section).model_fields) == {
            criterion.key for criterion in section_definition.criteria
        } | administrative_fields

    for aggregate in AGGREGATES:
        assert aggregate.key in AggregatedSummary.model_fields
        assert aggregate.key in AggregatedSummaryFeedback.model_fields
        for member in aggregate.members:
            section_key, criterion_key = member.split(".", 1)
            section = getattr(raw, section_key)
            assert criterion_key in type(section).model_fields


@pytest.mark.parametrize(
    ("field_path", "value"),
    [
        (("Introduction", "FCF_Introduced"), 0),
        (("Introduction", "FCF_Introduced"), 6),
        (("Introduction", "FCF_Introduced"), 3.5),
        (("Introduction", "FCF_Introduced"), "4"),
        (("Introduction", "FCF_Introduced"), True),
        (("Scoring_Confidence",), -0.1),
        (("Scoring_Confidence",), 1.1),
        (("Scoring_Confidence",), "0.8"),
    ],
)
def test_llm_schema_rejects_out_of_range_values(
    field_path: tuple[str, ...], value: object
) -> None:
    payload = make_raw().model_dump(mode="json")
    target = payload
    for key in field_path[:-1]:
        target = target[key]
    target[field_path[-1]] = value
    with pytest.raises(ValidationError):
        SermonScoringStep2Raw(**payload)


def test_llm_schema_rejects_unknown_fields() -> None:
    payload = make_raw().model_dump(mode="json")
    payload["Pastoral_Humility"] = {"score": 5}
    with pytest.raises(ValidationError, match="extra_forbidden"):
        SermonScoringStep2Raw(**payload)


def test_doctrinal_gate_is_non_compensatory(extraction) -> None:
    raw = make_raw(score=5, confidence=0.9)
    raw.Doctrinal_Fidelity.Core_Doctrine_Gate = "FAIL"
    raw.Doctrinal_Fidelity.Gate_Reason = "The sermon explicitly denied Christ's deity."
    scoring = SermonScoringStep2(**raw.model_dump(mode="json"))

    summary = SermonAggregator().compute_aggregates(scoring, extraction)

    assert summary.doctrinal_gate_applied is True
    assert summary.doctrinal_gate_cap == 3.0
    assert summary.Overall_Impact_Base == 5.0
    assert summary.Overall_Impact == 3.0
    assert summary.Pastoral_Posture == 5.0

    adjusted = SermonAggregator().apply_duration_penalty(
        summary, 56.3 * 60, enabled=True
    )
    assert adjusted.duration_penalty == 0.42
    assert adjusted.Overall_Impact_Base == 5.0
    assert adjusted.Overall_Impact_Adjusted == 2.58
    assert adjusted.Overall_Impact == 2.58


def test_persisted_v1_illustrations_replay_but_provider_boundary_stays_v2() -> None:
    payload = make_raw().model_dump(mode="json")
    payload["Illustrations"].pop("Ethical_Use")
    payload.pop("Doctrinal_Fidelity")
    payload.pop("Pastoral_Posture")

    replayed = SermonScoringStep2(**payload)

    assert replayed.Illustrations.Ethical_Use is None
    assert replayed.Doctrinal_Fidelity is None
    assert replayed.Pastoral_Posture is None
    with pytest.raises(ValidationError):
        SermonScoringStep2Raw(**payload)


def test_duration_policy_is_absent_when_disabled(extraction, scoring) -> None:
    aggregator = SermonAggregator()
    summary = aggregator.compute_aggregates(scoring, extraction)

    disabled = aggregator.apply_duration_penalty(
        summary.model_copy(deep=True), 56.3 * 60, enabled=False
    )
    assert disabled.duration_adjustment_enabled is False
    assert disabled.duration_penalty is None
    assert disabled.Overall_Impact_Adjusted is None
    assert disabled.Overall_Impact == disabled.Overall_Impact_Base

    enabled = aggregator.apply_duration_penalty(
        summary.model_copy(deep=True), 56.3 * 60, enabled=True
    )
    assert enabled.duration_adjustment_enabled is True
    assert enabled.duration_penalty == 0.42
    assert enabled.Overall_Impact_Adjusted == round(
        max(1.0, enabled.Overall_Impact_Base - 0.42), 2
    )


class _Prompts:
    HARMONIZE_INSTRUCTIONS = "harmonize"
    HARMONIZE_SYSTEM_PROMPT = "harmonize-system"
    AGG_SUMMARY_INSTRUCTIONS = "aggregate"
    AGG_SUMMARY_SYSTEM_PROMPT = "aggregate-system"
    SCORING_INSTRUCTIONS = "score"
    SCORING_SYSTEM_PROMPT = "score-system"


class _Audio:
    @staticmethod
    def upload_indicator(*, message: str):
        assert message
        return nullcontext()


class _Provider:
    def __init__(self) -> None:
        self.schemas: list[type] = []
        self.prompts: list[str] = []

    def generate_structured(
        self, *, response_schema: type, prompt: str, **_: object
    ) -> dict:
        self.schemas.append(response_schema)
        self.prompts.append(prompt)
        if response_schema is SermonScoringStep2Raw:
            return make_raw().model_dump(mode="json")
        if response_schema is SermonHarmonizedFeedback:
            return {
                section.key: f"{section.label} feedback"
                for section in RUBRIC_SECTIONS
            } | {
                "Doctrinal_Gate_Reason": None,
                "Strengths": ["strength"],
                "Growth_Areas": ["growth"],
                "Next_Steps": ["next"],
            }
        if response_schema is AggregatedSummaryFeedback:
            return {
                aggregate.key: f"{aggregate.label} feedback"
                for aggregate in AGGREGATES
            } | {
                "Doctrinal_Fidelity": "Doctrine feedback",
                "Overall_Impact": "Overall feedback",
            }
        raise AssertionError(response_schema)


def test_harmonization_uses_feedback_only_schema(extraction) -> None:
    provider = _Provider()
    harmonizer = SermonHarmonizer(provider, "fixture", _Prompts())
    harmonizer.audio_manager = _Audio()

    scoring = harmonizer.harmonize_runs(
        [make_raw(2, 0.25), make_raw(4, 0.75)], extraction, None
    )

    assert provider.schemas == [SermonHarmonizedFeedback]
    assert scoring.Introduction.FCF_Introduced == 4
    assert scoring.Pastoral_Posture is not None
    assert scoring.Pastoral_Posture.Feedback == (
        "Pastoral Posture and Humble Authority feedback"
    )


def test_harmonized_gate_reason_is_empty_when_weighted_gate_passes(
    extraction,
) -> None:
    passing = make_raw(4, 0.75)
    failing = make_raw(2, 0.25)
    failing.Doctrinal_Fidelity.Core_Doctrine_Gate = "FAIL"
    failing.Doctrinal_Fidelity.Gate_Reason = "A lower-weight run found a denial."
    provider = _Provider()
    harmonizer = SermonHarmonizer(provider, "fixture", _Prompts())
    harmonizer.audio_manager = _Audio()

    scoring = harmonizer.harmonize_runs(
        [passing, failing], extraction, None
    )

    assert scoring.Doctrinal_Fidelity is not None
    assert scoring.Doctrinal_Fidelity.Core_Doctrine_Gate == "PASS"
    assert scoring.Doctrinal_Fidelity.Gate_Reason is None


def test_disabled_duration_policy_is_not_exposed_to_coaching_prompt(
    extraction, scoring
) -> None:
    extraction.audio_duration = 56.3 * 60
    aggregator = SermonAggregator()
    scoring.Aggregated_Summary = aggregator.apply_duration_penalty(
        aggregator.compute_aggregates(scoring, extraction),
        extraction.audio_duration,
        enabled=False,
    )
    provider = _Provider()
    harmonizer = SermonHarmonizer(provider, "fixture", _Prompts())
    harmonizer.audio_manager = _Audio()

    harmonizer._generate_aggregate_feedback(scoring, extraction, 1)

    prompt = provider.prompts[-1]
    assert "Duration policy is outside homiletical coaching" in prompt
    assert '"duration_penalty"' not in prompt
    assert "56.3 minutes" not in prompt
    assert "0.42" not in prompt


def test_duration_is_not_exposed_to_scoring_prompt(extraction) -> None:
    extraction.audio_duration = 56.3 * 60
    provider = _Provider()
    harmonizer = SermonHarmonizer(provider, "fixture", _Prompts())

    scoring = harmonizer.score_single_run(extraction, None, 1689)

    assert scoring is not None
    prompt = provider.prompts[-1]
    assert "audio_duration" not in prompt
    assert "3378" not in prompt
