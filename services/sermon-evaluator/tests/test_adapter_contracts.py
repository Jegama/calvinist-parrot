from __future__ import annotations

import json
from types import SimpleNamespace

import httpx
import httpx2
import pytest
from pydantic import ValidationError

from entrypoints.appwrite import Invocation, _body, _dynamic_api_key, main
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
    captured: dict[str, object] = {}

    class FakeService:
        def recover(self, *, limit: int) -> list[object]:
            assert limit == 2
            return []

    class FakeResponse:
        def json(self, body: object, *, statusCode: int) -> dict[str, object]:
            return {"body": body, "statusCode": statusCode}

    monkeypatch.setattr(
        "entrypoints.appwrite.SermonEvaluationService.from_environment",
        lambda *, appwrite_api_key=None: (
            captured.update(appwrite_api_key=appwrite_api_key) or FakeService()
        ),
    )
    context = SimpleNamespace(
        req=SimpleNamespace(
            body=None,
            headers={"X-Appwrite-Key": "runtime-dynamic-key"},
        ),
        res=FakeResponse(),
        error=lambda _message: None,
    )

    assert main(context) == {
        "body": {"mode": "recovery", "results": []},
        "statusCode": 200,
    }
    assert captured == {"appwrite_api_key": "runtime-dynamic-key"}


def test_appwrite_dynamic_key_is_read_case_insensitively() -> None:
    assert (
        _dynamic_api_key(
            SimpleNamespace(headers={"x-AppWrite-Key": "runtime-key"})
        )
        == "runtime-key"
    )
    assert _dynamic_api_key(SimpleNamespace(headers={})) is None


def test_gemini_structured_generation_config() -> None:
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


@pytest.mark.parametrize("with_audio", [False, True])
def test_gemini_sdk_serializes_schema_and_uses_stable_endpoint(
    monkeypatch: pytest.MonkeyPatch, extraction, with_audio: bool,
) -> None:
    from google import genai
    from google.genai import types

    monkeypatch.setenv("GOOGLE_GENAI_HTTP_CLIENT", "httpx2")
    for name in ("GOOGLE_API_KEY", "GOOGLE_GENAI_USE_VERTEXAI", "GOOGLE_GENAI_USE_ENTERPRISE", "GOOGLE_GENAI_API_VERSION"):
        monkeypatch.delenv(name, raising=False)
    requests = []
    clients = []
    receipts = []

    def handle(request):
        requests.append(request)
        if len(requests) == 1:
            return httpx2.Response(503, json={
                "error": {"status": "UNAVAILABLE", "message": "private error"},
                "modelVersion": "offline-model",
                "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 2},
            })
        return httpx2.Response(200, json={
            "candidates": [{
                "content": {"role": "model", "parts": [{"text": extraction.model_dump_json()}]},
                "finishReason": "STOP",
            }],
            "responseId": "offline-response", "modelVersion": "offline-model",
            "usageMetadata": {
                "promptTokenCount": 36, "cachedContentTokenCount": 6,
                "candidatesTokenCount": 5, "thoughtsTokenCount": 19, "totalTokenCount": 60,
                "promptTokensDetails": [{"modality": "AUDIO", "tokenCount": 21}] if with_audio else [],
            },
        })

    def make_client(**kwargs):
        kwargs["http_options"].client_args = {"transport": httpx2.MockTransport(handle)}
        client = genai.Client(**kwargs)
        clients.append(client)
        return client

    provider = GeminiProvider(api_key="offline-test-key", retry_initial_delay_seconds=0)
    provider._genai = SimpleNamespace(Client=make_client)
    try:
        if with_audio:
            result = provider.generate_structured_with_contents(
                ["Extract", types.Part.from_uri(
                    file_uri="https://generativelanguage.googleapis.com/v1/files/offline-audio",
                    mime_type="audio/mpeg",
                )], SermonExtractionStep1, record_usage=receipts.append,
            )
        else:
            result = provider.generate_structured("Extract", SermonExtractionStep1, record_usage=receipts.append)
    finally:
        for client in clients:
            client.close()

    assert SermonExtractionStep1.model_validate(result) == extraction
    assert provider.last_response_metadata.response_id == "offline-response"
    assert provider.last_response_metadata.model_version == "offline-model"
    assert len(requests) == 2
    assert [r["outcome"] for r in receipts] == ["started", "provider_error", "started", "received", "success"]
    first, error, second, received, success = receipts
    assert first["attemptId"] == error["attemptId"] != second["attemptId"]
    assert second["attemptId"] == received["attemptId"] == success["attemptId"]
    assert (error["inputTokens"], error["outputTokens"]) == (10, 2)
    assert (success["inputTokens"], success["cacheReadTokens"], success["outputTokens"]) == (30, 6, 24)
    assert success["audioInputTokens"] == (21 if with_audio else None)
    assert success["modality"] == ("audio" if with_audio else "text")
    assert success["returnedModel"] == "offline-model"
    assert "private error" not in str(receipts) and extraction.Proposition not in str(receipts)
    assert requests[0].url.path == "/v1/models/gemini-4-hydrogen:generateContent"
    body = json.loads(requests[0].content)
    config = body["generationConfig"]
    assert config["responseMimeType"] == "application/json"
    assert types.ThinkingConfig.model_validate(config["thinkingConfig"]).thinking_level == "MEDIUM"
    assert config["responseJsonSchema"]["properties"]["Extraction_Confidence"]["maximum"] == 1.0
    if with_audio:
        file_data = types.FileData.model_validate(body["contents"][0]["parts"][1]["fileData"])
        assert file_data.mime_type == "audio/mpeg"


def test_invalid_response_is_metered_and_logging_failure_does_not_retry(monkeypatch) -> None:
    from google.genai import types

    provider = GeminiProvider(api_key="offline-test-key")
    calls = []

    def generate_content(**_):
        calls.append(1)
        return SimpleNamespace(
            parsed=None, text="{}", model_version=None,
            usage_metadata=types.GenerateContentResponseUsageMetadata(
                prompt_token_count=9, candidates_token_count=2, total_token_count=30,
            ),
        )

    monkeypatch.setattr(provider, "_client", lambda _: SimpleNamespace(
        models=SimpleNamespace(generate_content=generate_content)
    ))
    receipts = []

    def failing_recorder(receipt):
        receipts.append(receipt)
        raise RuntimeError("Storage unavailable")

    with pytest.raises(ValidationError):
        provider.generate_structured("private prompt", SermonExtractionStep1, record_usage=failing_recorder)
    assert len(calls) == 1
    assert [r["outcome"] for r in receipts] == ["started", "received", "invalid_output"]
    assert receipts[-1]["inputTokens"] == 9 and receipts[-1]["outputTokens"] is None
    assert "private prompt" not in str(receipts)


def test_unreadable_usage_preserves_output_and_never_retries(monkeypatch, extraction) -> None:
    provider = GeminiProvider(api_key="offline-test-key", retry_initial_delay_seconds=0)
    calls = []

    def unreadable(**_):
        # This error class normally triggers a fresh provider request.
        raise httpx2.ConnectError("Receipt conversion failed")

    def generate_content(**_):
        calls.append(1)
        return SimpleNamespace(
            parsed=extraction.model_dump(), model_version="offline-model",
            usage_metadata=SimpleNamespace(model_dump=unreadable),
        )

    monkeypatch.setattr(provider, "_client", lambda _: SimpleNamespace(
        models=SimpleNamespace(generate_content=generate_content)
    ))
    receipts = []
    result = provider.generate_structured("Extract", SermonExtractionStep1, record_usage=receipts.append)
    assert SermonExtractionStep1.model_validate(result) == extraction
    assert calls == [1]
    assert receipts[-1]["outcome"] == "success"
    assert receipts[-1]["inputTokens"] is None and receipts[-1]["outputTokens"] is None
    assert receipts[-1]["returnedModel"] == "offline-model"


@pytest.mark.parametrize("transport", [httpx, httpx2])
def test_gemini_retries_remote_disconnect_with_bounded_backoff(
    monkeypatch: pytest.MonkeyPatch,
    transport,
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
            raise transport.RemoteProtocolError(
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
