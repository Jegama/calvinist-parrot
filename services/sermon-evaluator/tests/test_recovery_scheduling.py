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


@pytest.mark.parametrize("cleanup_kind", ["expired", "rejected", "deleted"])
def test_cleanup_backlogs_drain_without_queued_evaluations(cleanup_kind) -> None:
    service, persistence, _ = make_service()
    pending = [
        {"id": f"asset-{index}", "ownerId": "owner", "appwriteBucketId": "bucket", "appwriteFileId": f"file-{index}"}
        for index in range(11)
    ]
    persistence.timeout_expired_attempts = lambda: 0
    persistence.stale_duration_report_evaluation_ids = lambda **_: []
    persistence.recoverable_evaluation_ids = lambda **_: []
    persistence.expired_prepared_uploads = lambda **_: []
    persistence.expired_finalized_pending_assets = lambda **_: []
    persistence.pending_rejected_audio_assets = lambda **_: []
    persistence.pending_deleted_audio_assets = lambda **_: []
    persistence.rejected_audio_pointer_is_deletable = lambda **_: True

    def clear(**kwargs):
        item_id = kwargs.get("reservation_id", kwargs.get("asset_id"))
        pending.remove(next(item for item in pending if item["id"] == item_id))
        return True

    persistence.expire_prepared_upload = clear
    persistence.clear_rejected_audio_pointer = clear
    persistence.clear_deleted_audio_pointer = clear
    query = {
        "expired": "expired_prepared_uploads",
        "rejected": "pending_rejected_audio_assets",
        "deleted": "pending_deleted_audio_assets",
    }[cleanup_kind]
    setattr(persistence, query, lambda *, limit: pending[:limit])
    storage_available = False

    def delete_file(**_):
        if not storage_available:
            raise TimeoutError("Storage unavailable")

    service.storage.delete_file = delete_file
    scheduled = []
    service.schedule_maintenance = lambda: scheduled.append("sweep")

    # An outage leaves durable work for hourly maintenance, without busy polling.
    assert service.recover() == []
    assert len(pending) == 11
    assert scheduled == []

    storage_available = True
    assert service.recover() == []
    assert len(pending) == 1
    assert scheduled == ["sweep"]
    assert service.recover() == []
    assert pending == []
    assert scheduled == ["sweep"]
    assert service.recover() == []
    assert scheduled == ["sweep"]


def test_report_backlog_drains_without_queued_evaluations_or_cleanup(monkeypatch) -> None:
    service, persistence, _ = make_service()
    pending = [f"report-{index}" for index in range(11)]
    persistence.timeout_expired_attempts = lambda: 0
    persistence.stale_duration_report_evaluation_ids = lambda *, limit: pending[:limit]
    persistence.recoverable_evaluation_ids = lambda **_: []
    for method in ["cleanup_expired_uploads", "cleanup_rejected_audio", "cleanup_deleted_audio"]:
        monkeypatch.setattr(service, method, lambda **_: 0)

    def regenerate(evaluation_id):
        pending.remove(evaluation_id)
        return {"evaluationId": evaluation_id, "status": "COMPLETE"}

    monkeypatch.setattr(service, "regenerate_reports", regenerate)
    scheduled = []
    service.schedule_maintenance = lambda: scheduled.append("sweep")
    assert len(service.recover()) == 10
    assert pending == ["report-10"]
    assert scheduled == ["sweep"]
    assert service.recover() == [{"evaluationId": "report-10", "status": "COMPLETE"}]
    assert pending == []
    assert scheduled == ["sweep"]
    assert service.recover() == []
    assert scheduled == ["sweep"]


@pytest.mark.parametrize("failure_count", [1, 10])
def test_failed_report_batches_do_not_create_a_retry_chain(monkeypatch, failure_count) -> None:
    service, persistence, _ = make_service()
    pending = [f"report-{index}" for index in range(11)]
    failing = set(pending[:failure_count])
    persistence.timeout_expired_attempts = lambda: 0
    persistence.stale_duration_report_evaluation_ids = lambda *, limit: pending[:limit]
    persistence.recoverable_evaluation_ids = lambda **_: []
    for method in ["cleanup_expired_uploads", "cleanup_rejected_audio", "cleanup_deleted_audio"]:
        monkeypatch.setattr(service, method, lambda **_: 0)

    def regenerate(evaluation_id):
        if evaluation_id in failing:
            raise TimeoutError("Report publishing unavailable")
        pending.remove(evaluation_id)
        return {"evaluationId": evaluation_id, "status": "COMPLETE"}

    monkeypatch.setattr(service, "regenerate_reports", regenerate)
    scheduled = []
    service.schedule_maintenance = lambda: scheduled.append("sweep")
    results = service.recover()
    assert len(results) == 10
    assert sum(result["status"] == "REPORT_REGENERATION_FAILED" for result in results) == failure_count
    assert len(pending) == failure_count + 1
    assert scheduled == []


def test_full_cleanup_report_and_evaluation_batches_schedule_only_one_successor(monkeypatch) -> None:
    service, persistence, _ = make_service()
    persistence.timeout_expired_attempts = lambda: 0
    reports = [f"report-{index}" for index in range(10)]
    persistence.stale_duration_report_evaluation_ids = lambda **_: reports
    persistence.recoverable_evaluation_ids = lambda **_: ["job-1", "job-2"]
    calls = []
    for method in ["cleanup_expired_uploads", "cleanup_rejected_audio", "cleanup_deleted_audio"]:
        monkeypatch.setattr(service, method, lambda *, limit, name=method: calls.append(name) or limit)
    service.schedule_maintenance = lambda: calls.append("sweep")
    monkeypatch.setattr(service, "regenerate_reports", lambda job: calls.append(job) or {"evaluationId": job})
    monkeypatch.setattr(service, "process", lambda job: {"evaluationId": job})
    service.recover()
    assert calls == ["cleanup_expired_uploads", "cleanup_rejected_audio", "cleanup_deleted_audio", *reports, "sweep"]


def test_backlog_wakeup_has_an_empty_maintenance_body(appwrite_environment, monkeypatch) -> None:
    payloads = []

    def send(request, **_):
        payloads.append(json.loads(request.data))
        return io.BytesIO(b"{}")

    monkeypatch.setattr(recovery.urllib.request, "urlopen", send)
    recovery.schedule_recovery(None, api_key="dynamic")
    assert payloads[0]["body"] == ""
