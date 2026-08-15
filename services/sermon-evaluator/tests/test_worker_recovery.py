from __future__ import annotations

import csv
import io
import json
from contextlib import nullcontext
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

import pytest

import sermon_evaluator.harmonization as harmonization_module
import sermon_evaluator.service as service_module
from sermon_evaluator import prompts
from sermon_evaluator.aggregation import SermonAggregator
from sermon_evaluator.audio import InvalidAudioError
from sermon_evaluator.harmonization import SermonHarmonizer
from sermon_evaluator.persistence import (
    AudioHashMismatch,
    CompareAndSetConflict,
    EvaluationJob,
    Lease,
    LeaseLost,
    LeaseUnavailable,
    PersistenceError,
    PsycopgPersistence,
)
from sermon_evaluator.service import (
    LeaseScopedScoringPersistence,
    SermonEvaluationService,
    _build_scoring_prompt,
)
from sermon_evaluator.stages import (
    AttemptResult,
    AttemptSpec,
    DeadlineExceeded,
    EvaluationCanceled,
    EvaluationStatus,
    SoftDeadline,
)


def _job(status: EvaluationStatus = EvaluationStatus.QUEUED) -> EvaluationJob:
    return EvaluationJob(
        id="evaluation-1",
        owner_id="owner-1",
        title="Grace in Romans 8",
        preacher_name="Pastor Example",
        preached_on=date(2026, 7, 27),
        status=status,
        version=3,
        requested_runs=3,
        completed_runs=0,
        duration_adjustment_enabled=False,
        attempt_deadline_at=None,
        cancel_requested_at=None,
        fingerprint_id="fingerprint-1",
        claimed_sha256="a" * 64,
        audio_asset_id="asset-1",
        appwrite_bucket_id="bucket-1",
        appwrite_file_id="file-1",
        byte_size=123,
        mime_type="audio/mpeg",
        original_filename="sermon.mp3",
        result={},
        provenance={},
    )


class _ProcessPersistence:
    def __init__(self, *, claim_error: Exception | None = None) -> None:
        self.job = _job()
        self.attempt_id = "attempt-1"
        self.deadline = datetime.now(timezone.utc) + timedelta(minutes=15)
        self.claim_error = claim_error
        self.lease = Lease(
            slot_id=1,
            lease_owner="worker-1",
            evaluation_id=self.job.id,
            evaluation_attempt_id=self.attempt_id,
        )
        self.mark_calls: list[dict[str, Any]] = []
        self.release_calls: list[Lease] = []
        self.credit_release_calls: list[tuple[str, str]] = []

    def fetch_evaluation(self, evaluation_id: str) -> EvaluationJob:
        assert evaluation_id == self.job.id
        return self.job

    def active_evaluation_attempt(self, evaluation_id: str) -> tuple[str, datetime]:
        assert evaluation_id == self.job.id
        return self.attempt_id, self.deadline

    def claim_lease(self, **_: Any) -> Lease:
        if self.claim_error is not None:
            raise self.claim_error
        return self.lease

    def heartbeat_lease(self, lease: Lease) -> bool:
        return lease == self.lease

    def assert_lease_owned(self, lease: Lease) -> None:
        assert lease == self.lease

    def mark_terminal(self, **kwargs: Any) -> bool:
        self.mark_calls.append(kwargs)
        return False

    def release_lease(self, lease: Lease) -> None:
        self.release_calls.append(lease)

    def release_run_credits(self, evaluation_id: str, reason: str) -> None:
        self.credit_release_calls.append((evaluation_id, reason))


def _service(persistence: Any) -> SermonEvaluationService:
    return SermonEvaluationService(
        persistence=persistence,
        storage=SimpleNamespace(),
        provider=SimpleNamespace(),
    )


def test_duplicate_worker_that_cannot_claim_never_marks_terminal() -> None:
    persistence = _ProcessPersistence(
        claim_error=LeaseUnavailable("already leased")
    )
    service = _service(persistence)

    with pytest.raises(LeaseUnavailable):
        service.process("evaluation-1")

    assert persistence.mark_calls == []
    assert persistence.credit_release_calls == []
    assert persistence.release_calls == []


def test_losing_worker_failure_is_scoped_to_its_exact_lease(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    persistence = _ProcessPersistence()
    service = _service(persistence)

    def fail(**_: Any) -> dict[str, Any]:
        raise RuntimeError("transient provider failure")

    monkeypatch.setattr(service, "_process_claimed", fail)
    with pytest.raises(RuntimeError, match="transient provider failure"):
        service.process("evaluation-1")

    assert persistence.credit_release_calls == []
    assert persistence.release_calls == [persistence.lease]
    assert persistence.mark_calls == [
        {
            "evaluation_id": "evaluation-1",
            "evaluation_attempt_id": "attempt-1",
            "status": EvaluationStatus.FAILED,
            "error_code": "RuntimeError",
            "error_message": "transient provider failure",
            "lease": persistence.lease,
        }
    ]


def test_reclaimed_lease_aborts_old_worker_without_terminal_mutation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    persistence = _ProcessPersistence()
    service = _service(persistence)

    def reclaimed(_lease: Lease) -> None:
        raise LeaseLost("replacement worker owns the attempt")

    persistence.assert_lease_owned = reclaimed

    def check_lease(*, assert_lease_owned: Any, **_: Any) -> dict[str, Any]:
        assert_lease_owned()
        raise AssertionError("lost worker continued after lease check")

    monkeypatch.setattr(service, "_process_claimed", check_lease)
    result = service.process("evaluation-1")

    assert result == {"evaluationId": "evaluation-1", "status": "DEFERRED"}
    assert persistence.mark_calls == []
    assert persistence.credit_release_calls == []
    assert persistence.release_calls == [persistence.lease]


def test_reclaimed_lease_blocks_scoring_attempt_writes() -> None:
    writes: list[tuple[str, Any]] = []
    delegate = SimpleNamespace(
        prepare_scoring_runs=lambda *args: writes.append(("prepare", args)),
        record_attempt_started=lambda *args: writes.append(("start", args)),
        record_attempt_result=lambda *args: writes.append(("result", args)),
    )

    def lost() -> None:
        raise LeaseLost("reclaimed")

    scoped = LeaseScopedScoringPersistence(
        delegate,
        Lease(1, "worker-1", "evaluation-1", "attempt-1"),
        lost,
    )
    with pytest.raises(LeaseLost, match="reclaimed"):
        scoped.prepare_scoring_runs("evaluation-1", 3)
    with pytest.raises(LeaseLost, match="reclaimed"):
        scoped.record_attempt_started("evaluation-1", object())
    with pytest.raises(LeaseLost, match="reclaimed"):
        scoped.record_attempt_result("evaluation-1", object())
    assert writes == []


@pytest.mark.parametrize(
    ("error", "status", "release_reason"),
    [
        (
            InvalidAudioError("invalid audio"),
            EvaluationStatus.FAILED,
            "AUDIO_VERIFICATION_FAILED",
        ),
        (
            EvaluationCanceled("canceled"),
            EvaluationStatus.CANCELED,
            "CANCELED_BEFORE_SCORING",
        ),
    ],
)
def test_credit_release_is_part_of_the_lease_scoped_terminal_cas(
    monkeypatch: pytest.MonkeyPatch,
    error: Exception,
    status: EvaluationStatus,
    release_reason: str,
) -> None:
    persistence = _ProcessPersistence()
    service = _service(persistence)

    def fail(**_: Any) -> dict[str, Any]:
        raise error

    monkeypatch.setattr(service, "_process_claimed", fail)
    result = service.process("evaluation-1")

    assert result["status"] == "DEFERRED"
    assert persistence.credit_release_calls == []
    assert persistence.mark_calls[0]["lease"] == persistence.lease
    assert persistence.mark_calls[0]["status"] == status
    assert (
        persistence.mark_calls[0]["release_credit_reason"]
        == release_reason
    )
    if isinstance(error, InvalidAudioError):
        assert (
            persistence.mark_calls[0]["rejected_audio_asset_id"]
            == "asset-1"
        )
        assert (
            persistence.mark_calls[0]["rejected_fingerprint_id"]
            == "fingerprint-1"
        )


class _RejectedAudioPersistence(_ProcessPersistence):
    def __init__(self) -> None:
        super().__init__()
        self.pointer_cleared = False

    def mark_terminal(self, **kwargs: Any) -> bool:
        self.mark_calls.append(kwargs)
        return True

    def rejected_audio_pointer_is_deletable(self, **kwargs: str) -> bool:
        return not self.pointer_cleared

    def clear_rejected_audio_pointer(self, **kwargs: str) -> bool:
        self.pointer_cleared = True
        return True

    def pending_rejected_audio_assets(self, limit: int) -> list[dict[str, str]]:
        if self.pointer_cleared:
            return []
        return [
            {
                "id": "asset-1",
                "appwriteBucketId": "bucket-1",
                "appwriteFileId": "file-1",
            }
        ]


def test_hash_mismatch_persists_and_returns_canonical_pointer_then_deletes_upload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    persistence = _RejectedAudioPersistence()
    storage = SimpleNamespace(deleted=[])
    storage.delete_file = lambda **kwargs: storage.deleted.append(kwargs)
    service = SermonEvaluationService(
        persistence=persistence,
        storage=storage,
        provider=SimpleNamespace(),
    )

    def mismatch(**_: Any) -> dict[str, Any]:
        raise AudioHashMismatch(canonical_evaluation_id="canonical-1")

    monkeypatch.setattr(service, "_process_claimed", mismatch)
    result = service.process("evaluation-1")

    assert result == {
        "evaluationId": "evaluation-1",
        "status": "FAILED",
        "errorCode": "AUDIO_HASH_MISMATCH",
        "canonicalEvaluationId": "canonical-1",
    }
    terminal = persistence.mark_calls[0]
    assert terminal["canonical_evaluation_id"] == "canonical-1"
    assert terminal["rejected_audio_asset_id"] == "asset-1"
    assert terminal["rejected_fingerprint_id"] == "fingerprint-1"
    assert storage.deleted == [
        {"bucket_id": "bucket-1", "file_id": "file-1"}
    ]
    assert persistence.pointer_cleared is True


def test_failed_immediate_rejected_delete_is_retried_by_recovery(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    persistence = _RejectedAudioPersistence()

    def fail_delete(**_: str) -> None:
        raise RuntimeError("Appwrite unavailable")

    service = SermonEvaluationService(
        persistence=persistence,
        storage=SimpleNamespace(delete_file=fail_delete),
        provider=SimpleNamespace(),
    )
    monkeypatch.setattr(
        service,
        "_process_claimed",
        lambda **_: (_ for _ in ()).throw(InvalidAudioError("bad container")),
    )

    assert service.process("evaluation-1")["status"] == "FAILED"
    assert persistence.pointer_cleared is False

    deleted: list[dict[str, str]] = []
    service.storage = SimpleNamespace(
        delete_file=lambda **kwargs: deleted.append(kwargs)
    )
    assert service.cleanup_rejected_audio() == 1
    assert deleted == [{"bucket_id": "bucket-1", "file_id": "file-1"}]
    assert persistence.pointer_cleared is True


class _Cursor:
    def __init__(self) -> None:
        self.executions: list[tuple[str, Any]] = []
        self.current: Any = None
        self.rowcount = 0
        self.expired_rows: list[dict[str, Any]] = []

    def __enter__(self) -> "_Cursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, query: str, params: Any = None) -> None:
        normalized = " ".join(query.split())
        self.executions.append((normalized, params))
        self.rowcount = 0
        self.current = None
        if (
            'SELECT evaluation."status"::text' in normalized
            and 'JOIN "sermonEvaluationAttempt"' in normalized
            and "FOR UPDATE OF evaluation, attempt" in normalized
        ):
            self.current = {
                "status": "QUEUED",
                "version": 1,
                "cancelRequestedAt": None,
                "fingerprintId": "fingerprint-1",
                "audioAssetId": "asset-1",
            }
        elif (
            'FROM "sermonWorkerLease"' in normalized
            and 'WHERE "evaluationId" = %s' in normalized
            and '"leaseExpiresAt" >= NOW()' in normalized
        ):
            self.current = {"slotId": 1}
        elif (
            'FROM "sermonRunCreditReservation"' in normalized
            and 'WHERE "evaluationId" = %s' in normalized
        ):
            self.current = {
                "id": "reservation-1",
                "fingerprintId": "fingerprint-1",
                "requestedCredits": 1,
                "consumedCredits": 0,
                "state": "RESERVED",
            }
        elif normalized.startswith('UPDATE "sermonEvaluation"'):
            self.rowcount = 1
        elif normalized.startswith('UPDATE "sermonAudioFingerprint"'):
            self.rowcount = 1
        elif normalized.startswith('UPDATE "sermonAudioAsset"'):
            self.rowcount = 1
        elif normalized.startswith('UPDATE "sermonRunCreditReservation"'):
            self.rowcount = 1
        elif normalized.startswith('UPDATE "sermonEvaluationAttempt"'):
            self.rowcount = 1

    def fetchone(self) -> Any:
        return self.current

    def fetchall(self) -> list[dict[str, Any]]:
        return self.expired_rows


class _Connection:
    def __init__(self, cursor: _Cursor) -> None:
        self._cursor = cursor

    def __enter__(self) -> "_Connection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> _Cursor:
        return self._cursor


class _Pool:
    def __init__(self, cursor: _Cursor) -> None:
        self._connection = _Connection(cursor)

    def connection(self) -> _Connection:
        return self._connection


def test_claim_lease_serializes_and_rejects_an_existing_live_lease() -> None:
    cursor = _Cursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))

    with pytest.raises(LeaseUnavailable, match="live worker lease"):
        persistence.claim_lease(
            evaluation_id="evaluation-1",
            evaluation_attempt_id="attempt-1",
            lease_owner="duplicate",
        )

    sql = "\n".join(query for query, _ in cursor.executions)
    assert "pg_advisory_xact_lock" in sql
    assert '"leaseExpiresAt" >= NOW()' in sql
    assert 'UPDATE "sermonWorkerLease"' not in sql


def test_scoring_resume_counts_only_the_current_evaluation_attempt() -> None:
    class ResumeCursor(_Cursor):
        def __init__(self) -> None:
            super().__init__()
            self.rows: list[dict[str, Any]] = []

        def execute(self, query: str, params: Any = None) -> None:
            super().execute(query, params)
            normalized = " ".join(query.split())
            if normalized.startswith('SELECT run."ordinal"'):
                self.rows = [
                    {"ordinal": 1, "rawScore": None, "attempts": 0}
                ]
            elif normalized.startswith('SELECT "seed"'):
                self.rows = [{"seed": 1689}, {"seed": 2025}]

        def fetchall(self) -> list[dict[str, Any]]:
            return self.rows

    cursor = ResumeCursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))

    values, attempt_counts, seeds = persistence.scoring_resume_state(
        "evaluation-1", "attempt-2"
    )

    assert values == {}
    assert attempt_counts == {1: 0}
    assert seeds == {1689, 2025}
    resume_query, resume_params = next(
        (query, params)
        for query, params in cursor.executions
        if query.startswith('SELECT run."ordinal"')
    )
    assert 'attempt."evaluationAttemptId" = %s' in resume_query
    assert resume_params == ("attempt-2", "evaluation-1")


def test_scoring_results_update_only_the_current_evaluation_attempt() -> None:
    cursor = _Cursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))
    lease = Lease(1, "worker-1", "evaluation-1", "attempt-2")
    spec = AttemptSpec(
        ordinal=1,
        attempt_number=1,
        seed=3141,
        retry_wave=0,
    )

    persistence.record_attempt_result(
        "evaluation-1",
        AttemptResult(spec=spec, error=RuntimeError("provider failed")),
        lease=lease,
    )

    update_query, update_params = next(
        (query, params)
        for query, params in cursor.executions
        if query.startswith('UPDATE "sermonScoringAttempt" attempt')
    )
    assert 'attempt."evaluationAttemptId" = %s' in update_query
    assert update_params[-4:] == ("evaluation-1", "attempt-2", 1, 1)


def test_lost_lease_cannot_mutate_terminal_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = _Cursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))
    lease = Lease(1, "stale-worker", "evaluation-1", "attempt-1")
    monkeypatch.setattr(
        persistence, "_lock_owned_evaluation", lambda _cursor, _lease: None
    )

    assert (
        persistence.mark_terminal(
            evaluation_id="evaluation-1",
            evaluation_attempt_id="attempt-1",
            status=EvaluationStatus.FAILED,
            error_code="PROVIDER_ERROR",
            error_message="stale",
            lease=lease,
            release_credit_reason="AUDIO_VERIFICATION_FAILED",
        )
        is False
    )
    assert cursor.executions == []


def test_hash_mismatch_verification_is_read_only_until_terminal_commit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class MismatchCursor(_Cursor):
        def execute(self, query: str, params: Any = None) -> None:
            super().execute(query, params)
            normalized = " ".join(query.split())
            if (
                'FROM "sermonAudioFingerprint" f' in normalized
                and "LEFT JOIN LATERAL" in normalized
            ):
                self.current = {"id": "canonical-1"}

    cursor = MismatchCursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))
    lease = Lease(1, "worker-1", "evaluation-1", "attempt-1")

    with pytest.raises(AudioHashMismatch) as raised:
        persistence.verify_audio(
            _job(),
            verified_sha256="b" * 64,
            duration_seconds=1800,
            byte_size=123,
            lease=lease,
        )

    assert raised.value.canonical_evaluation_id == "canonical-1"
    sql = "\n".join(query for query, _ in cursor.executions)
    assert 'FROM "sermonAudioFingerprint" f' in sql
    assert 'UPDATE "sermonAudioFingerprint"' not in sql
    assert 'UPDATE "sermonAudioAsset"' not in sql
    assert 'UPDATE "sermonEvaluation"' not in sql
    assert 'UPDATE "sermonRunCreditReservation"' not in sql


def test_terminal_hash_mismatch_atomically_rejects_and_closes_attempt() -> None:
    cursor = _Cursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))
    lease = Lease(1, "worker-1", "evaluation-1", "attempt-1")

    assert persistence.mark_terminal(
        evaluation_id="evaluation-1",
        evaluation_attempt_id="attempt-1",
        status=EvaluationStatus.FAILED,
        error_code="AUDIO_HASH_MISMATCH",
        error_message="mismatch",
        lease=lease,
        release_credit_reason="AUDIO_VERIFICATION_FAILED",
        rejected_audio_asset_id="asset-1",
        rejected_fingerprint_id="fingerprint-1",
        canonical_evaluation_id="canonical-1",
    )
    sql = "\n".join(query for query, _ in cursor.executions)
    assert "'canonicalEvaluationId'" in sql
    assert 'WHEN "verificationState" = \'PROVISIONAL\'' in sql
    assert "ELSE \"verificationState\"" in sql
    assert "'PROVISIONAL', 'VERIFIED'" in sql
    assert '"verificationState" = \'PENDING\'' in sql
    assert '"referenceCount" = 0' in sql
    assert 'SET "audioAssetId" = NULL' in sql
    assert 'FROM "sermonRunCreditReservation"' in sql
    assert 'UPDATE "sermonEvaluationAttempt"' in sql


def test_credit_settlement_consumes_only_successful_rounds() -> None:
    class ThreeRunCursor(_Cursor):
        def execute(self, query: str, params: Any = None) -> None:
            super().execute(query, params)
            if 'FROM "sermonRunCreditReservation"' in " ".join(query.split()):
                self.current = {
                    "id": "reservation-1",
                    "fingerprintId": "fingerprint-1",
                    "requestedCredits": 3,
                    "consumedCredits": 0,
                    "state": "RESERVED",
                }

    cursor = ThreeRunCursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))

    released = persistence._settle_run_credits(
        cursor,
        "evaluation-1",
        successful_credits=2,
        release_reason="UNUSED_SCORING_RUNS",
    )

    assert released == 1
    fingerprint_update = next(
        params
        for query, params in cursor.executions
        if query.startswith('UPDATE "sermonAudioFingerprint"')
    )
    assert fingerprint_update == (3, 2, "fingerprint-1", 3, 2)
    reservation_update = next(
        params
        for query, params in cursor.executions
        if query.startswith('UPDATE "sermonRunCreditReservation"')
    )
    assert reservation_update == (
        2,
        2,
        2,
        1,
        1,
        "UNUSED_SCORING_RUNS",
        "reservation-1",
    )


def test_scoring_write_checks_exact_lease_in_the_same_transaction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = _Cursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))
    lease = Lease(1, "reclaimed-worker", "evaluation-1", "attempt-1")
    monkeypatch.setattr(
        persistence, "_lock_owned_evaluation", lambda _cursor, _lease: None
    )

    with pytest.raises(LeaseLost):
        persistence.prepare_scoring_runs(
            "evaluation-1", 3, lease=lease
        )
    assert not any(
        query.startswith('INSERT INTO "sermonScoringRun"')
        for query, _ in cursor.executions
    )


def test_cancellation_blocks_transition_and_credit_settlement_atomically(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = _Cursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))
    lease = Lease(1, "worker-1", "evaluation-1", "attempt-1")
    canceled_row = {
        "status": "QUEUED",
        "version": 1,
        "cancelRequestedAt": datetime.now(timezone.utc),
    }
    monkeypatch.setattr(
        persistence,
        "_lock_owned_evaluation",
        lambda _cursor, _lease: canceled_row,
    )

    with pytest.raises(EvaluationCanceled):
        persistence.compare_and_set_status(
            evaluation_id="evaluation-1",
            expected_status=EvaluationStatus.QUEUED,
            expected_version=1,
            target_status=EvaluationStatus.PREPARING_AUDIO,
            lease=lease,
        )
    with pytest.raises(EvaluationCanceled):
        persistence.finish(
            evaluation_id="evaluation-1",
            status=EvaluationStatus.COMPLETE,
            completed_runs=3,
            result={"scoring": {"Aggregated_Summary": {}}},
            provenance={},
            warning_codes=[],
            evaluation_attempt_id="attempt-1",
            lease=lease,
            reports={
                "MARKDOWN": b"markdown",
                "JSON": b"json",
                "CSV": b"csv",
            },
            report_version=1,
        )
    sql = "\n".join(query for query, _ in cursor.executions)
    assert 'UPDATE "sermonEvaluation"' not in sql
    assert 'UPDATE "sermonAudioFingerprint"' not in sql


def test_recovery_queries_exclude_live_leases_and_select_only_stale_report_sets() -> None:
    cursor = _Cursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))

    assert persistence.recoverable_evaluation_ids() == []
    assert persistence.stale_duration_report_evaluation_ids() == []
    sql = "\n".join(query for query, _ in cursor.executions)

    assert '"leaseExpiresAt" >= NOW()' in sql
    assert "e.\"status\" = 'QUEUED'" in sql
    assert "COUNT(DISTINCT report.\"format\") = 3" in sql
    assert 'MIN(report."createdAt") >=' in sql
    assert 'evaluation."durationPolicyUpdatedAt"' in sql


def test_cleanup_candidates_never_include_canonical_or_referenced_assets() -> None:
    cursor = _Cursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))

    assert persistence.expired_prepared_uploads() == []
    assert persistence.expired_finalized_pending_assets() == []
    sql = "\n".join(query for query, _ in cursor.executions)

    assert 'asset."verificationState" <> \'DELETED\'' in sql
    assert 'asset."verificationState" = \'PENDING\'' in sql
    assert 'asset."referenceCount" = 0' in sql
    assert 'evaluation."deletedAt" IS NULL' in sql


def test_rejected_audio_cleanup_selects_rejected_asset_even_with_complete_history() -> None:
    cursor = _Cursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))

    assert persistence.pending_rejected_audio_assets() == []
    sql = "\n".join(query for query, _ in cursor.executions)
    assert 'asset."verificationState" = \'REJECTED\'' in sql
    assert 'evaluation."status"' not in sql
    assert "'VERIFIED'" not in sql


def test_rejected_pointer_clear_detaches_all_history_and_resets_references() -> None:
    class RejectedCursor(_Cursor):
        def execute(self, query: str, params: Any = None) -> None:
            super().execute(query, params)
            normalized = " ".join(query.split())
            if (
                normalized.startswith('SELECT asset."id"')
                and '"verificationState" = \'REJECTED\'' in normalized
            ):
                self.current = {"id": "asset-1"}
            elif normalized.startswith('UPDATE "sermonAudioAsset" asset'):
                self.rowcount = 1

    cursor = RejectedCursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))

    assert persistence.clear_rejected_audio_pointer(
        asset_id="asset-1",
        bucket_id="bucket-1",
        file_id="file-1",
    )
    sql = "\n".join(query for query, _ in cursor.executions)
    assert 'UPDATE "sermonEvaluation"' in sql
    assert 'SET "audioAssetId" = NULL' in sql
    assert '"referenceCount" = 0' in sql
    assert '"verificationState" = \'REJECTED\'' in sql


def test_report_regeneration_rejects_a_changed_duration_policy() -> None:
    cursor = _Cursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))
    expected_at = datetime(2026, 7, 28, tzinfo=timezone.utc)

    with pytest.raises(
        CompareAndSetConflict, match="Duration policy changed"
    ):
        persistence.publish_report_set(
            "evaluation-1",
            {"MARKDOWN": b"md", "JSON": b"json", "CSV": b"csv"},
            result={
                "scoring": {
                    "Aggregated_Summary": {
                        "Overall_Impact_Base": 4.2,
                        "duration_penalty": 0.2,
                        "Overall_Impact_Adjusted": 4.0,
                    }
                }
            },
            expected_duration_adjustment_enabled=True,
            expected_duration_policy_updated_at=expected_at,
        )
    sql = "\n".join(query for query, _ in cursor.executions)
    assert '"durationAdjustmentEnabled" = %s' in sql
    assert '"durationPolicyUpdatedAt" IS NOT DISTINCT FROM %s' in sql
    assert 'INSERT INTO "sermonReportArtifact"' not in sql


def test_report_publication_persists_duration_derived_state() -> None:
    class PublicationCursor(_Cursor):
        def execute(self, query: str, params: Any = None) -> None:
            super().execute(query, params)
            normalized = " ".join(query.split())
            if normalized.startswith('SELECT "id" FROM "sermonEvaluation"'):
                self.current = {"id": "evaluation-1"}
            elif 'SELECT COALESCE(MAX("reportVersion"), 0)' in normalized:
                self.current = {"version": 0}

    cursor = PublicationCursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))
    result = {
        "scoring": {
            "Aggregated_Summary": {
                "Overall_Impact_Base": 4.2,
                "duration_penalty": None,
                "Overall_Impact_Adjusted": None,
            }
        }
    }

    version = persistence.publish_report_set(
        "evaluation-1",
        {"MARKDOWN": b"md", "JSON": b"json", "CSV": b"csv"},
        result=result,
        expected_duration_adjustment_enabled=False,
        expected_duration_policy_updated_at=None,
    )

    assert version == 1
    sql = "\n".join(query for query, _ in cursor.executions)
    assert 'SET "result" = %s::jsonb' in sql
    assert '"calculatedDurationPenalty" = %s' in sql
    assert '"overallImpactAdjusted" = %s' in sql
    evaluation_update = next(
        params
        for query, params in cursor.executions
        if query.startswith('UPDATE "sermonEvaluation"')
    )
    assert evaluation_update[1:4] == (4.2, None, None)


def test_durable_worker_scoring_prompt_excludes_audio_duration(extraction) -> None:
    extraction.audio_duration = 56.3 * 60

    prompt = _build_scoring_prompt(extraction)

    assert "audio_duration" not in prompt
    assert "3378" not in prompt


class _MaintenancePersistence:
    def __init__(self) -> None:
        self.expired: list[tuple[str, str]] = []

    def timeout_expired_attempts(self) -> int:
        return 1

    def expired_prepared_uploads(self, limit: int) -> list[dict[str, str]]:
        assert limit == 10
        return [
            {
                "id": "prepared-1",
                "ownerId": "owner-1",
                "appwriteBucketId": "bucket-1",
                "appwriteFileId": "prepared-file",
            }
        ]

    def expire_prepared_upload(self, **kwargs: str) -> bool:
        self.expired.append(("prepared", kwargs["reservation_id"]))
        return True

    def expired_finalized_pending_assets(
        self, limit: int
    ) -> list[dict[str, str]]:
        assert limit == 9
        return [
            {
                "reservationId": "finalized-1",
                "ownerId": "owner-1",
                "assetId": "asset-1",
                "appwriteBucketId": "bucket-1",
                "appwriteFileId": "finalized-file",
            }
        ]

    def expire_finalized_pending_asset(self, **kwargs: str) -> bool:
        self.expired.append(("finalized", kwargs["reservation_id"]))
        return True

    def pending_deleted_audio_assets(self, limit: int) -> list[dict[str, str]]:
        assert limit == 10
        return []

    def pending_rejected_audio_assets(self, limit: int) -> list[dict[str, str]]:
        assert limit == 10
        return []

    def stale_duration_report_evaluation_ids(self, limit: int) -> list[str]:
        assert limit == 10
        return ["stale-report"]

    def recoverable_evaluation_ids(self, limit: int) -> list[str]:
        assert limit == 2
        return ["queued-evaluation"]


def test_scheduled_recovery_cleans_uploads_and_regenerates_stale_reports(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    persistence = _MaintenancePersistence()
    storage = SimpleNamespace(deleted=[])

    def delete_file(*, bucket_id: str, file_id: str) -> None:
        storage.deleted.append((bucket_id, file_id))

    storage.delete_file = delete_file
    service = SermonEvaluationService(
        persistence=persistence,
        storage=storage,
        provider=SimpleNamespace(),
    )
    regenerated: list[str] = []

    def regenerate(evaluation_id: str) -> dict[str, Any]:
        regenerated.append(evaluation_id)
        return {"evaluationId": evaluation_id, "status": "COMPLETE"}

    monkeypatch.setattr(service, "regenerate_reports", regenerate)
    monkeypatch.setattr(
        service,
        "process",
        lambda evaluation_id: {
            "evaluationId": evaluation_id,
            "status": "COMPLETE",
        },
    )

    result = service.recover(limit=2)

    assert storage.deleted == [
        ("bucket-1", "prepared-file"),
        ("bucket-1", "finalized-file"),
    ]
    assert persistence.expired == [
        ("prepared", "prepared-1"),
        ("finalized", "finalized-1"),
    ]
    assert regenerated == ["stale-report"]
    assert [item["evaluationId"] for item in result] == [
        "stale-report",
        "queued-evaluation",
    ]


class _FrozenDateTime(datetime):
    current = datetime(2026, 7, 27, 12, 0, tzinfo=timezone.utc)

    @classmethod
    def now(cls, tz: timezone | None = None) -> datetime:
        if tz is None:
            return cls.current.replace(tzinfo=None)
        return cls.current.astimezone(tz)


class _RetryPersistence(_ProcessPersistence):
    def __init__(self) -> None:
        super().__init__()
        self.deadline = _FrozenDateTime.current + timedelta(seconds=30)
        self.active = True
        self.timed_out: list[dict[str, Any]] = []
        self.created_deadline: datetime | None = None

    def active_evaluation_attempt(self, evaluation_id: str) -> tuple[str, datetime]:
        if not self.active:
            raise PersistenceError("no active attempt")
        return self.attempt_id, self.deadline

    def mark_unleased_attempt_timed_out(self, **kwargs: Any) -> bool:
        self.timed_out.append(kwargs)
        self.active = False
        return True

    def create_evaluation_attempt(
        self,
        evaluation_id: str,
        *,
        deadline_at: datetime,
        appwrite_execution_id: str | None,
        resume_reason: str,
    ) -> tuple[str, datetime]:
        assert evaluation_id == self.job.id
        assert appwrite_execution_id == "retry-execution"
        assert resume_reason == "queued"
        self.created_deadline = deadline_at
        self.attempt_id = "attempt-2"
        self.deadline = deadline_at
        self.lease = Lease(
            slot_id=1,
            lease_owner="worker-2",
            evaluation_id=self.job.id,
            evaluation_attempt_id=self.attempt_id,
        )
        return self.attempt_id, deadline_at


def test_expired_attempt_closes_before_retry_gets_fresh_fifteen_minute_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(service_module, "datetime", _FrozenDateTime)
    persistence = _RetryPersistence()
    service = _service(persistence)

    first = service.process("evaluation-1")
    assert first == {"evaluationId": "evaluation-1", "status": "TIMED_OUT"}
    assert persistence.timed_out[0]["evaluation_attempt_id"] == "attempt-1"
    assert persistence.release_calls == []

    monkeypatch.setattr(
        service,
        "_process_claimed",
        lambda **_: {"evaluationId": "evaluation-1", "status": "COMPLETE"},
    )
    second = service.process(
        "evaluation-1", appwrite_execution_id="retry-execution"
    )

    assert second["status"] == "COMPLETE"
    assert persistence.created_deadline == (
        _FrozenDateTime.current + timedelta(minutes=15)
    )
    assert persistence.release_calls == [persistence.lease]


def test_timeout_sweeper_closes_attempt_and_releases_matching_lease() -> None:
    cursor = _Cursor()
    cursor.expired_rows = [
        {
            "id": "evaluation-1",
            "status": "SCORING",
            "version": 7,
            "attemptId": "attempt-1",
        }
    ]
    persistence = PsycopgPersistence(pool=_Pool(cursor))

    assert persistence.timeout_expired_attempts() == 1
    sql = "\n".join(query for query, _ in cursor.executions)

    assert 'SET "terminalOutcome" = \'TIMED_OUT\'' in sql
    assert '"endedAt" = NOW()' in sql
    assert 'UPDATE "sermonAudioFingerprint"' in sql
    assert 'UPDATE "sermonRunCreditReservation"' in sql
    assert 'UPDATE "sermonWorkerLease"' in sql
    assert '"evaluationAttemptId" = NULL' in sql


def test_initial_reports_use_canonical_title_preacher_and_date(
    extraction: Any,
    scoring: Any,
) -> None:
    scoring.Aggregated_Summary = SermonAggregator().compute_aggregates(
        scoring, extraction
    )
    service = SermonEvaluationService(
        persistence=SimpleNamespace(),
        storage=SimpleNamespace(),
        provider=SimpleNamespace(model_name="gemini-3.6-flash"),
    )

    reports = service._render_reports(
        job=_job(EvaluationStatus.SUMMARIZING),
        extraction=extraction,
        scoring=scoring,
        completed_runs=3,
        provenance={"responseId": "response-1"},
    )

    assert b"Sermon Evaluation Report \xe2\x80\x94 Grace in Romans 8" in reports[
        "MARKDOWN"
    ]
    json_report = json.loads(reports["JSON"])
    assert json_report["metadata"] == {
        "completedRuns": 3,
        "evaluationId": "evaluation-1",
        "preachedOn": "2026-07-27",
        "preacherName": "Pastor Example",
        "requestedRuns": 3,
        "responseId": "response-1",
        "title": "Grace in Romans 8",
    }
    csv_row = next(
        csv.DictReader(io.StringIO(reports["CSV"].decode("utf-8")))
    )
    assert csv_row["label"] == "Grace in Romans 8"
    assert csv_row["preacher"] == "Pastor Example"
    assert csv_row["preached_date"] == "2026-07-27"


def test_lost_final_cas_inserts_no_partial_report_artifacts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class LostCasCursor(_Cursor):
        def execute(self, query: str, params: Any = None) -> None:
            super().execute(query, params)
            normalized = " ".join(query.split())
            if normalized.startswith('UPDATE "sermonEvaluation"'):
                self.rowcount = 0

    cursor = LostCasCursor()
    persistence = PsycopgPersistence(pool=_Pool(cursor))
    lease = Lease(1, "worker-1", "evaluation-1", "attempt-1")
    monkeypatch.setattr(
        persistence,
        "_lock_owned_evaluation",
        lambda _cursor, _lease: {
            "status": "SUMMARIZING",
            "version": 7,
            "cancelRequestedAt": None,
        },
    )

    with pytest.raises(CompareAndSetConflict, match="lost its CAS"):
        persistence.finish(
            evaluation_id="evaluation-1",
            status=EvaluationStatus.COMPLETE,
            completed_runs=3,
            result={"scoring": {"Aggregated_Summary": {}}},
            provenance={},
            warning_codes=[],
            evaluation_attempt_id="attempt-1",
            lease=lease,
            reports={
                "MARKDOWN": b"markdown",
                "JSON": b"json",
                "CSV": b"csv",
            },
            report_version=1,
        )

    assert not any(
        query.startswith('INSERT INTO "sermonReportArtifact"')
        for query, _ in cursor.executions
    )


@pytest.mark.parametrize(
    "control_error",
    [
        EvaluationCanceled("canceled during harmonization"),
        DeadlineExceeded("deadline during harmonization"),
    ],
)
def test_harmonization_never_swallows_worker_control_flow(
    monkeypatch: pytest.MonkeyPatch,
    extraction: Any,
    raw_scoring: Any,
    control_error: Exception,
) -> None:
    class Provider:
        def generate_structured(self, **_: Any) -> dict[str, Any]:
            raise control_error

    monkeypatch.setattr(
        harmonization_module,
        "AudioFileManager",
        lambda: SimpleNamespace(
            upload_indicator=lambda **_: nullcontext()
        ),
    )
    harmonizer = SermonHarmonizer(
        Provider(),
        "gemini-3.6-flash",
        prompts,
    )

    with pytest.raises(type(control_error), match=str(control_error)):
        harmonizer.harmonize_runs(
            [raw_scoring, raw_scoring], extraction, None
        )


@pytest.mark.parametrize(
    "control_error",
    [
        EvaluationCanceled("canceled during aggregate feedback"),
        DeadlineExceeded("deadline during aggregate feedback"),
    ],
)
def test_aggregate_feedback_never_swallows_worker_control_flow(
    monkeypatch: pytest.MonkeyPatch,
    extraction: Any,
    scoring: Any,
    control_error: Exception,
) -> None:
    class Provider:
        def generate_structured(self, **_: Any) -> dict[str, Any]:
            raise control_error

    monkeypatch.setattr(
        harmonization_module,
        "AudioFileManager",
        lambda: SimpleNamespace(
            upload_indicator=lambda **_: nullcontext()
        ),
    )
    harmonizer = SermonHarmonizer(
        Provider(),
        "gemini-3.6-flash",
        prompts,
    )
    scoring.Aggregated_Summary = SermonAggregator().compute_aggregates(
        scoring, extraction
    )

    with pytest.raises(type(control_error), match=str(control_error)):
        harmonizer._generate_aggregate_feedback(scoring, extraction, 3)


def test_aggregate_feedback_provider_failure_is_not_published_as_complete(
    monkeypatch: pytest.MonkeyPatch,
    extraction: Any,
    scoring: Any,
) -> None:
    class Provider:
        def generate_structured(self, **_: Any) -> dict[str, Any]:
            raise RuntimeError("aggregate provider failed")

    monkeypatch.setattr(
        harmonization_module,
        "AudioFileManager",
        lambda: SimpleNamespace(
            upload_indicator=lambda **_: nullcontext()
        ),
    )
    harmonizer = SermonHarmonizer(
        Provider(),
        "gemini-3.6-flash",
        prompts,
    )
    scoring.Aggregated_Summary = SermonAggregator().compute_aggregates(
        scoring, extraction
    )

    with pytest.raises(RuntimeError, match="aggregate provider failed"):
        harmonizer._generate_aggregate_feedback(scoring, extraction, 3)

    assert scoring.Aggregated_Summary_Feedback is None


class _ResumePersistence:
    def __init__(self, cancel_on_check: int | None = None) -> None:
        self.cancel_on_check = cancel_on_check
        self.cancel_checks = 0
        self.finish_calls: list[dict[str, Any]] = []

    def is_canceled(self, evaluation_id: str) -> bool:
        assert evaluation_id == "evaluation-1"
        self.cancel_checks += 1
        return (
            self.cancel_on_check is not None
            and self.cancel_checks >= self.cancel_on_check
        )

    def finish(self, **kwargs: Any) -> None:
        self.finish_calls.append(kwargs)


class _ResumeProvider:
    model_name = "gemini-3.6-flash"
    last_response_metadata = SimpleNamespace(
        model_version="gemini-3.6-flash",
        response_id="response-1",
    )

    def get_file(self, name: str, *, timeout_seconds: float) -> object:
        assert name == "files/audio"
        assert timeout_seconds > 0
        return object()

    def wait_until_active(
        self, file_object: object, *, timeout_seconds: float
    ) -> object:
        assert timeout_seconds > 0
        return file_object


def _resume_job(
    *,
    status: EvaluationStatus,
    extraction: Any,
    raw_scoring: Any,
    scoring: Any | None = None,
) -> EvaluationJob:
    result: dict[str, Any] = {
        "audio": {"geminiFile": {"name": "files/audio"}},
        "extraction": extraction.model_dump(mode="json"),
        "scoringRuns": {
            "requestedRuns": 2,
            "completedRuns": 2,
            "runs": [
                raw_scoring.model_dump(mode="json"),
                raw_scoring.model_dump(mode="json"),
            ],
        },
    }
    if scoring is not None:
        result["scoring"] = scoring.model_dump(mode="json")
    return replace(
        _job(status),
        requested_runs=2,
        completed_runs=2,
        result=result,
    )


@pytest.mark.parametrize(
    ("status", "method_name", "control_error"),
    [
        (
            EvaluationStatus.HARMONIZING,
            "harmonize_runs",
            EvaluationCanceled("canceled during harmonization"),
        ),
        (
            EvaluationStatus.SUMMARIZING,
            "_generate_aggregate_feedback",
            DeadlineExceeded("deadline during aggregate feedback"),
        ),
    ],
)
def test_control_flow_during_final_stages_cannot_publish_or_complete(
    monkeypatch: pytest.MonkeyPatch,
    extraction: Any,
    raw_scoring: Any,
    scoring: Any,
    status: EvaluationStatus,
    method_name: str,
    control_error: Exception,
) -> None:
    persistence = _ResumePersistence()
    service = SermonEvaluationService(
        persistence=persistence,
        storage=SimpleNamespace(),
        provider=_ResumeProvider(),
    )
    published: list[dict[str, Any]] = []
    monkeypatch.setattr(
        service,
        "_render_reports",
        lambda **kwargs: (published.append(kwargs) or {}),
    )

    def interrupt(*_: Any, **__: Any) -> None:
        raise control_error

    monkeypatch.setattr(SermonHarmonizer, method_name, interrupt)
    job = _resume_job(
        status=status,
        extraction=extraction,
        raw_scoring=raw_scoring,
        scoring=scoring if status == EvaluationStatus.SUMMARIZING else None,
    )

    with pytest.raises(type(control_error), match=str(control_error)):
        service._process_claimed(
            job=job,
            attempt_id="attempt-1",
            deadline=SoftDeadline.from_budget(500),
            lease=Lease(
                1, "worker-1", "evaluation-1", "attempt-1"
            ),
        )

    assert published == []
    assert persistence.finish_calls == []


def test_cancellation_guard_runs_immediately_before_report_publication(
    monkeypatch: pytest.MonkeyPatch,
    extraction: Any,
    raw_scoring: Any,
    scoring: Any,
) -> None:
    persistence = _ResumePersistence(cancel_on_check=5)
    service = SermonEvaluationService(
        persistence=persistence,
        storage=SimpleNamespace(),
        provider=_ResumeProvider(),
    )
    published: list[dict[str, Any]] = []
    monkeypatch.setattr(
        service,
        "_render_reports",
        lambda **kwargs: (published.append(kwargs) or {}),
    )
    monkeypatch.setattr(
        SermonHarmonizer,
        "_generate_aggregate_feedback",
        lambda *_args, **_kwargs: None,
    )
    job = _resume_job(
        status=EvaluationStatus.SUMMARIZING,
        extraction=extraction,
        raw_scoring=raw_scoring,
        scoring=scoring,
    )

    with pytest.raises(EvaluationCanceled):
        service._process_claimed(
            job=job,
            attempt_id="attempt-1",
            deadline=SoftDeadline.from_budget(500),
            lease=Lease(
                1, "worker-1", "evaluation-1", "attempt-1"
            ),
        )

    assert persistence.cancel_checks == 5
    assert published == []
    assert persistence.finish_calls == []
