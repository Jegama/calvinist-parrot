from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from entrypoints.appwrite import Invocation, _body
from sermon_evaluator.gemini import GeminiProvider
from sermon_evaluator.stages import (
    DeadlineExceeded,
    EvaluationStatus,
    SoftDeadline,
    validate_transition,
)


def test_appwrite_payload_accepts_only_opaque_evaluation_id() -> None:
    invocation = Invocation.model_validate({"evaluationId": "opaque"})
    assert invocation.evaluation_id == "opaque"
    with pytest.raises(ValidationError):
        Invocation.model_validate({"evaluationId": "opaque", "ownerId": "spoof"})
    with pytest.raises(ValidationError):
        Invocation.model_validate(
            {"evaluationId": "opaque", "requestedRuns": 9}
        )
    assert (
        Invocation.model_validate(
            {"action": "regenerate_reports", "evaluationId": "opaque"}
        ).action
        == "regenerate_reports"
    )
    with pytest.raises(ValidationError):
        Invocation.model_validate(
            {"action": "delete", "evaluationId": "opaque"}
        )
    assert _body(SimpleNamespace(body=json.dumps({"evaluationId": "x"}))) == {
        "evaluationId": "x"
    }


def test_gemini_config_matches_36_migration_rules() -> None:
    captured = {}

    class FakeConfig:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    class FakeThinking:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    provider = object.__new__(GeminiProvider)
    provider._types = SimpleNamespace(
        GenerateContentConfig=FakeConfig,
        ThinkingConfig=FakeThinking,
    )
    provider._config(dict, "system", 1689)
    assert captured["thinking_config"].kwargs == {"thinking_level": "medium"}
    assert captured["response_mime_type"] == "application/json"
    assert captured["response_schema"] is dict
    assert "temperature" not in captured
    assert "top_p" not in captured
    assert "top_k" not in captured
    assert "candidate_count" not in captured


def test_stage_machine_and_deadline_guards() -> None:
    validate_transition(EvaluationStatus.QUEUED, EvaluationStatus.PREPARING_AUDIO)
    with pytest.raises(ValueError):
        validate_transition(EvaluationStatus.QUEUED, EvaluationStatus.COMPLETE)
    deadline = SoftDeadline.from_budget(59)
    with pytest.raises(DeadlineExceeded):
        deadline.provider_timeout()
