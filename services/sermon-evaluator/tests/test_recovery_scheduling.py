from __future__ import annotations

import io
import json
import urllib.error
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

import entrypoints.appwrite as adapter
import sermon_evaluator.recovery as recovery
from sermon_evaluator.persistence import LeaseUnavailable
from sermon_evaluator.service import SermonEvaluationService
from sermon_evaluator.stages import EvaluationStatus, TERMINAL_STATUSES


def make_service(status: EvaluationStatus = EvaluationStatus.QUEUED):
    job = SimpleNamespace(id="job-1", status=status)
    persistence = SimpleNamespace(fetch_evaluation=lambda _: job)
    service = SermonEvaluationService(
        persistence=persistence, storage=SimpleNamespace(), provider=SimpleNamespace()
    )
    return service, persistence, job


@pytest.mark.parametrize("status", list(TERMINAL_STATUSES))
def test_delayed_checks_stop_for_every_terminal_status(status) -> None:
    service, _, _ = make_service(status)
    scheduled = []
    service.schedule_recovery = scheduled.append
    assert service.process("job-1") == {
        "evaluationId": "job-1", "status": status.value, "replayed": True
    }
    assert scheduled == []


def test_recovery_is_registered_before_attempt_or_lease(monkeypatch) -> None:
    service, persistence, _ = make_service()
    calls = []
    service.schedule_recovery = lambda job: calls.append(("schedule", job))
    deadline = datetime.now(timezone.utc) + timedelta(minutes=15)

    def attempt(job, execution_id):
        calls.append(("attempt", job.id))
        return "attempt-1", deadline

    def claim(**kwargs):
        calls.append(("lease", kwargs["evaluation_id"]))
        raise LeaseUnavailable("another worker owns this job")

    monkeypatch.setattr(service, "_attempt", attempt)
    persistence.claim_lease = claim
    with pytest.raises(LeaseUnavailable):
        service.process("job-1")
    assert calls == [("schedule", "job-1"), ("attempt", "job-1"), ("lease", "job-1")]


def test_registration_failure_leaves_queued_job_without_starting_attempt() -> None:
    service, _, job = make_service()

    def unavailable(_):
        raise TimeoutError("Appwrite temporarily unavailable")

    service.schedule_recovery = unavailable
    # The persistence stub intentionally has no attempt/lease write methods.
    with pytest.raises(TimeoutError):
        service.process("job-1")
    assert job.status == EvaluationStatus.QUEUED


def test_recovery_keeps_original_deadline_then_stops_after_timeout() -> None:
    service, persistence, job = make_service(EvaluationStatus.SCORING)
    deadline = datetime.now(timezone.utc) - timedelta(seconds=1)
    persistence.active_evaluation_attempt = lambda _: ("original-attempt", deadline)
    timed_out = []

    def expire(**kwargs):
        timed_out.append(kwargs)
        job.status = EvaluationStatus.TIMED_OUT
        return True

    persistence.mark_unleased_attempt_timed_out = expire
    scheduled = []
    service.schedule_recovery = scheduled.append
    assert service.process("job-1")["status"] == "TIMED_OUT"
    assert timed_out[0]["hard_deadline"] == deadline
    assert timed_out[0]["evaluation_attempt_id"] == "original-attempt"
    assert service.process("job-1")["replayed"] is True
    assert scheduled == ["job-1"]


def test_adapter_installs_recovery_for_direct_and_maintenance_calls(monkeypatch) -> None:
    captured = []

    class FakeService:
        def process(self, evaluation_id, **kwargs):
            self.schedule_recovery(evaluation_id)
            return {"status": "DEFERRED"}

        def recover(self, *, limit):
            return [self.process("missed-dispatch")]

    monkeypatch.setattr(adapter.SermonEvaluationService, "from_environment", lambda **_: FakeService())
    monkeypatch.setattr(adapter, "schedule_recovery", lambda job, *, api_key: captured.append((job, api_key)))
    for body in [None, {"evaluationId": "direct-job"}]:
        context = SimpleNamespace(
            req=SimpleNamespace(body=body, headers={"X-Appwrite-Key": "dynamic"}),
            res=SimpleNamespace(json=lambda body, *, statusCode: statusCode),
            error=lambda _: None,
        )
        assert adapter.main(context) == 200
    assert captured == [("missed-dispatch", "dynamic"), ("direct-job", "dynamic")]


@pytest.fixture
def appwrite_environment(monkeypatch):
    monkeypatch.setenv("APPWRITE_FUNCTION_API_ENDPOINT", "https://appwrite.example/v1")
    monkeypatch.setenv("APPWRITE_FUNCTION_PROJECT_ID", "project")
    monkeypatch.setenv("APPWRITE_FUNCTION_ID", "sermon-evaluator-preview")
    monkeypatch.setattr(recovery.time, "sleep", lambda _: None)


@pytest.mark.parametrize("function_id", ["sermon-evaluator", "sermon-evaluator-preview"])
def test_wakeup_targets_same_function_without_persisting_credentials(
    appwrite_environment, monkeypatch, function_id
) -> None:
    monkeypatch.setenv("APPWRITE_FUNCTION_ID", function_id)
    requests = []

    def send(request, *, timeout):
        requests.append((request, timeout))
        return io.BytesIO(b'{"$id":"scheduled-execution"}')

    monkeypatch.setattr(recovery.urllib.request, "urlopen", send)
    before = datetime.now(timezone.utc)
    recovery.schedule_recovery("job-1", api_key="ephemeral-secret")
    request, timeout = requests[0]
    payload = json.loads(request.data)
    assert request.full_url == f"https://appwrite.example/v1/functions/{function_id}/executions"
    assert timeout == 10
    assert json.loads(payload["body"]) == {"evaluationId": "job-1"}
    assert payload["async"] is True
    assert "ephemeral-secret" not in request.data.decode()
    assert payload["headers"] == {"content-type": "application/json"}
    scheduled_at = datetime.fromisoformat(payload["scheduledAt"])
    assert timedelta(seconds=59) < scheduled_at - before <= timedelta(seconds=120)
    assert scheduled_at.second == scheduled_at.microsecond == 0


@pytest.mark.parametrize("status", [429, 503])
def test_transient_registration_errors_retry_with_a_bound(appwrite_environment, monkeypatch, status) -> None:
    calls = []

    def send(request, *, timeout):
        calls.append(request)
        if len(calls) < 3:
            raise urllib.error.HTTPError(request.full_url, status, "unavailable", {}, None)
        return io.BytesIO(b"{}")

    monkeypatch.setattr(recovery.urllib.request, "urlopen", send)
    recovery.schedule_recovery("job-1", api_key="dynamic")
    assert len(calls) == 3


@pytest.mark.parametrize("error,expected_calls", [(TimeoutError("timeout"), 3), (urllib.error.HTTPError("https://appwrite.example", 401, "unauthorized", {}, None), 1)])
def test_registration_failure_is_propagated(appwrite_environment, monkeypatch, error, expected_calls) -> None:
    calls = []

    def send(request, *, timeout):
        calls.append(request)
        raise error

    monkeypatch.setattr(recovery.urllib.request, "urlopen", send)
    with pytest.raises(type(error)):
        recovery.schedule_recovery("job-1", api_key="dynamic")
    assert len(calls) == expected_calls


def test_missing_dynamic_key_fails_without_scheduling(appwrite_environment) -> None:
    with pytest.raises(ValueError, match="dynamic key"):
        recovery.schedule_recovery("job-1", api_key=None)


@pytest.mark.parametrize("queued", [[], ["job-1"], ["job-1", "job-2"]])
def test_maintenance_only_chains_when_a_full_batch_needs_draining(monkeypatch, queued) -> None:
    service, persistence, _ = make_service()
    persistence.timeout_expired_attempts = lambda: 0
    persistence.stale_duration_report_evaluation_ids = lambda **_: []
    persistence.recoverable_evaluation_ids = lambda **_: queued
    for method in ["cleanup_expired_uploads", "cleanup_rejected_audio", "cleanup_deleted_audio"]:
        monkeypatch.setattr(service, method, lambda **_: 0)
    calls = []
    service.schedule_maintenance = lambda: calls.append("sweep")
    monkeypatch.setattr(service, "process", lambda job: calls.append(job) or {"evaluationId": job})
    service.recover(limit=2)
    assert calls == (["sweep"] if len(queued) == 2 else []) + queued


def test_backlog_wakeup_has_an_empty_maintenance_body(appwrite_environment, monkeypatch) -> None:
    payloads = []

    def send(request, **_):
        payloads.append(json.loads(request.data))
        return io.BytesIO(b"{}")

    monkeypatch.setattr(recovery.urllib.request, "urlopen", send)
    recovery.schedule_recovery(None, api_key="dynamic")
    assert payloads[0]["body"] == ""
