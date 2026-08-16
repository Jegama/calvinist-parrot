from __future__ import annotations

import json
from types import SimpleNamespace

import httpx
import pytest
from pydantic import ValidationError

from entrypoints.appwrite import Invocation, _body, main
from sermon_evaluator.gemini import GeminiProvider
from sermon_evaluator.schemas import SermonExtractionStep1
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


def test_appwrite_recovery_response_uses_runtime_status_code_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeService:
        def recover(self, *, limit: int) -> list[object]:
            assert limit == 2
            return []

    class FakeResponse:
        def json(self, body: object, *, statusCode: int) -> dict[str, object]:
            return {"body": body, "statusCode": statusCode}

    monkeypatch.setattr(
        "entrypoints.appwrite.SermonEvaluationService.from_environment",
        lambda: FakeService(),
    )
    context = SimpleNamespace(
        req=SimpleNamespace(body=None, headers={}),
        res=FakeResponse(),
        error=lambda _message: None,
    )

    assert main(context) == {
        "body": {"mode": "recovery", "results": []},
        "statusCode": 200,
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
    provider._config(SermonExtractionStep1, "system", 1689)
    assert captured["thinking_config"].kwargs == {"thinking_level": "medium"}
    assert captured["response_mime_type"] == "application/json"
    assert "response_schema" not in captured
    schema = captured["response_json_schema"]
    assert schema["type"] == "object"
    assert schema["additionalProperties"] is False
    assert schema["properties"]["Extraction_Confidence"]["maximum"] == 1.0
    assert schema["properties"]["Extraction_Confidence"]["minimum"] == 0.0
    assert "temperature" not in captured
    assert "top_p" not in captured
    assert "top_k" not in captured
    assert "candidate_count" not in captured


def test_gemini_config_accepts_explicit_json_schema_mapping() -> None:
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
    schema = {
        "type": "object",
        "properties": {"value": {"type": "integer"}},
        "required": ["value"],
        "additionalProperties": False,
    }

    provider._config(schema, None, None)

    assert captured["response_json_schema"] is schema
    assert "response_schema" not in captured


def test_gemini_retries_remote_disconnect_with_bounded_backoff(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = object.__new__(GeminiProvider)
    provider.default_timeout_seconds = 30
    provider.max_transient_attempts = 4
    provider.retry_initial_delay_seconds = 1.0
    provider.retry_max_delay_seconds = 8.0
    sleeps: list[float] = []
    calls = 0

    monkeypatch.setattr(
        "sermon_evaluator.gemini.random.uniform", lambda _low, _high: 1.0
    )
    monkeypatch.setattr("sermon_evaluator.gemini.time.sleep", sleeps.append)

    def call(_remaining: float) -> str:
        nonlocal calls
        calls += 1
        if calls < 3:
            raise httpx.RemoteProtocolError(
                "Server disconnected without sending a response"
            )
        return "ok"

    assert provider._with_transient_retry("test", 30, call) == "ok"
    assert calls == 3
    assert sleeps == [1.0, 2.0]


def test_gemini_does_not_retry_invalid_requests(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = object.__new__(GeminiProvider)
    provider.default_timeout_seconds = 30
    provider.max_transient_attempts = 4
    provider.retry_initial_delay_seconds = 1.0
    provider.retry_max_delay_seconds = 8.0
    calls = 0

    class InvalidRequest(RuntimeError):
        code = 400

    def call(_remaining: float) -> str:
        nonlocal calls
        calls += 1
        raise InvalidRequest("invalid schema")

    monkeypatch.setattr(
        "sermon_evaluator.gemini.time.sleep",
        lambda _seconds: pytest.fail("400 errors must not be retried"),
    )
    with pytest.raises(InvalidRequest):
        provider._with_transient_retry("test", 30, call)
    assert calls == 1


def test_stage_machine_and_deadline_guards() -> None:
    validate_transition(EvaluationStatus.QUEUED, EvaluationStatus.PREPARING_AUDIO)
    with pytest.raises(ValueError):
        validate_transition(EvaluationStatus.QUEUED, EvaluationStatus.COMPLETE)
    deadline = SoftDeadline.from_budget(59)
    with pytest.raises(DeadlineExceeded):
        deadline.provider_timeout()
