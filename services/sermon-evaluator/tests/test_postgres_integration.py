from __future__ import annotations

import csv
import hashlib
import json
import os
import tempfile
import uuid
import wave
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import Mock

import httpx
import pytest
from pydantic import ValidationError
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

import sermon_evaluator.persistence as persistence_module

from sermon_evaluator.gemini import GeminiProvider
from sermon_evaluator.persistence import (
    AudioHashMismatch,
    LeaseUnavailable,
    PsycopgPersistence,
)
from sermon_evaluator.rubric import RUBRIC_SECTIONS
from sermon_evaluator.schemas import (
    AggregatedSummaryFeedback,
    SermonExtractionStep1,
    SermonHarmonizedFeedback,
    SermonScoringStep2Raw,
)
from sermon_evaluator.service import SermonEvaluationService
from sermon_evaluator.stages import (
    AttemptResult,
    AttemptSpec,
    EvaluationCanceled,
    EvaluationStatus,
)
from sermon_evaluator.storage import LocalFilesystemStorage

RUN_DATABASE_TESTS = (
    os.getenv("RUN_SERMON_DATABASE_INTEGRATION_TESTS") == "1"
)
DATABASE_URL = os.getenv("SERMON_TEST_DATABASE_URL") or os.getenv(
    "SERMON_DATABASE_URL"
)

pytestmark = pytest.mark.skipif(
    not RUN_DATABASE_TESTS or not DATABASE_URL,
    reason=(
        "Set RUN_SERMON_DATABASE_INTEGRATION_TESTS=1 and "
        "SERMON_TEST_DATABASE_URL to run PostgreSQL integration tests"
    ),
)


def test_warm_worker_reconnects_after_idle_connection_is_closed(monkeypatch) -> None:
    import psycopg

    assert DATABASE_URL is not None
    monkeypatch.setattr(persistence_module, "_POOL", None)
    monkeypatch.setenv("SERMON_DB_POOL_MAX_SIZE", "1")
    pool = persistence_module.get_pool(DATABASE_URL)
    try:
        with pool.connection() as connection:
            old_pid = connection.execute("SELECT pg_backend_pid() AS pid").fetchone()["pid"]
        # Simulate the server dropping only this test pool's idle connection.
        with psycopg.connect(DATABASE_URL, autocommit=True) as control:
            control.execute("SELECT pg_terminate_backend(%s)", (old_pid,))
        with pool.connection() as connection:
            new_pid = connection.execute("SELECT pg_backend_pid() AS pid").fetchone()["pid"]
        assert new_pid != old_pid
    finally:
        pool.close()


class _ScoreValue:
    Scoring_Confidence = 0.9

    def model_dump(self, **_: Any) -> dict[str, Any]:
        return {"Introduction": {"Overall": 4}}


def _insert_bundle(
    cursor: Any,
    *,
    prefix: str,
    owner_id: str,
    preacher_id: str,
    fingerprint_id: str,
    asset_id: str,
    evaluation_id: str,
    sha256: str,
    status: str = "QUEUED",
    fingerprint_state: str = "PROVISIONAL",
    asset_state: str = "PENDING",
    requested_runs: int = 1,
    reserved_credits: int = 1,
    consumed_credits: int = 0,
    reference_count: int = 1,
    with_credit_reservation: bool = True,
) -> None:
    now = datetime.now(timezone.utc)
    preset = "STANDARD" if requested_runs == 1 else "HIGH_CONFIDENCE"
    cursor.execute(
        """
        INSERT INTO "sermonAudioFingerprint"
            ("id", "ownerId", "sha256", "verificationState",
             "runCreditsLimit", "runCreditsReserved", "runCreditsConsumed",
             "firstSeenAt", "lastSeenAt")
        VALUES (%s, %s, %s, %s::"SermonFingerprintState",
                9, %s, %s, %s, %s)
        """,
        (
            fingerprint_id,
            owner_id,
            sha256,
            fingerprint_state,
            reserved_credits,
            consumed_credits,
            now,
            now,
        ),
    )
    cursor.execute(
        """
        INSERT INTO "sermonAudioAsset"
            ("id", "fingerprintId", "appwriteBucketId", "appwriteFileId",
             "originalFilename", "mimeType", "byteSize", "referenceCount",
             "verificationState", "createdAt", "updatedAt")
        VALUES (%s, %s, %s, %s, 'sermon.mp3', 'audio/mpeg', 123, %s,
                %s::"SermonAudioAssetState", %s, %s)
        """,
        (
            asset_id,
            fingerprint_id,
            f"bucket-{prefix}",
            f"file-{prefix}",
            reference_count,
            asset_state,
            now,
            now,
        ),
    )
    completed_runs = 1 if status in {"COMPLETE", "COMPLETE_WITH_WARNINGS"} else 0
    cursor.execute(
        """
        INSERT INTO "sermonEvaluation"
            ("id", "ownerId", "preacherId", "fingerprintId", "audioAssetId",
             "title", "preachedOn", "preset", "requestedRuns",
             "completedRuns", "status", "version", "createdAt", "updatedAt")
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s::"SermonEvaluationStatus", 0, %s, %s)
        """,
        (
            evaluation_id,
            owner_id,
            preacher_id,
            fingerprint_id,
            asset_id,
            f"Integration {prefix}",
            date(2026, 7, 27),
            preset,
            requested_runs,
            completed_runs,
            status,
            now,
            now,
        ),
    )
    if with_credit_reservation:
        cursor.execute(
            """
            INSERT INTO "sermonRunCreditReservation"
                ("id", "fingerprintId", "evaluationId", "requestedCredits",
                 "preset", "state", "actorId", "reservedAt",
                 "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, 'RESERVED', %s, %s, %s, %s)
            """,
            (
                f"credit-{prefix}",
                fingerprint_id,
                evaluation_id,
                requested_runs,
                preset,
                owner_id,
                now,
                now,
                now,
            ),
        )


def _cleanup_owner(pool: ConnectionPool, owner_id: str) -> None:
    with pool.connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE "sermonWorkerLease"
            SET "leaseOwner" = NULL, "evaluationId" = NULL,
                "evaluationAttemptId" = NULL, "leaseExpiresAt" = NULL,
                "heartbeatAt" = NOW(), "updatedAt" = NOW()
            WHERE "evaluationId" IN (
                SELECT "id" FROM "sermonEvaluation" WHERE "ownerId" = %s
            )
            """,
            (owner_id,),
        )
        cursor.execute(
            """
            DELETE FROM "sermonRunCreditReservation"
            WHERE "fingerprintId" IN (
                SELECT "id" FROM "sermonAudioFingerprint"
                WHERE "ownerId" = %s
            )
            """,
            (owner_id,),
        )
        cursor.execute(
            'DELETE FROM "sermonEvaluation" WHERE "ownerId" = %s',
            (owner_id,),
        )
        cursor.execute(
            """
            DELETE FROM "sermonAudioAsset"
            WHERE "fingerprintId" IN (
                SELECT "id" FROM "sermonAudioFingerprint"
                WHERE "ownerId" = %s
            )
            """,
            (owner_id,),
        )
        cursor.execute(
            'DELETE FROM "sermonAudioFingerprint" WHERE "ownerId" = %s',
            (owner_id,),
        )
        cursor.execute(
            'DELETE FROM "sermonPreacher" WHERE "ownerId" = %s',
            (owner_id,),
        )


def test_psycopg_persistence_against_prisma_schema() -> None:
    assert DATABASE_URL is not None
    pool = ConnectionPool(
        conninfo=DATABASE_URL,
        min_size=1,
        max_size=4,
        kwargs={"autocommit": False, "row_factory": dict_row},
        open=True,
    )
    pool.wait()
    persistence = PsycopgPersistence(pool=pool)
    suffix = uuid.uuid4().hex
    owner_id = f"integration-owner-{suffix}"
    preacher_id = f"integration-preacher-{suffix}"
    main_fingerprint_id = f"integration-fingerprint-main-{suffix}"
    main_asset_id = f"integration-asset-main-{suffix}"
    main_evaluation_id = f"integration-evaluation-main-{suffix}"
    canceled_fingerprint_id = f"integration-fingerprint-cancel-{suffix}"
    canceled_asset_id = f"integration-asset-cancel-{suffix}"
    canceled_evaluation_id = f"integration-evaluation-cancel-{suffix}"
    mismatch_fingerprint_id = f"integration-fingerprint-mismatch-{suffix}"
    mismatch_asset_id = f"integration-asset-mismatch-{suffix}"
    mismatch_evaluation_id = f"integration-evaluation-mismatch-{suffix}"
    rejected_fingerprint_id = f"integration-fingerprint-rejected-{suffix}"
    rejected_asset_id = f"integration-asset-rejected-{suffix}"
    historical_evaluation_id = f"integration-evaluation-history-{suffix}"
    failed_evaluation_id = f"integration-evaluation-failed-{suffix}"
    now = datetime.now(timezone.utc)

    try:
        with pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO "sermonPreacher"
                    ("id", "ownerId", "displayName", "normalizedName",
                     "createdAt", "updatedAt")
                VALUES (%s, %s, 'Integration Pastor', %s, %s, %s)
                """,
                (
                    preacher_id,
                    owner_id,
                    f"integration-pastor-{suffix}",
                    now,
                    now,
                ),
            )
            _insert_bundle(
                cursor,
                prefix=f"main-{suffix}",
                owner_id=owner_id,
                preacher_id=preacher_id,
                fingerprint_id=main_fingerprint_id,
                asset_id=main_asset_id,
                evaluation_id=main_evaluation_id,
                sha256="a" * 64,
            )
            _insert_bundle(
                cursor,
                prefix=f"rejected-{suffix}",
                owner_id=owner_id,
                preacher_id=preacher_id,
                fingerprint_id=rejected_fingerprint_id,
                asset_id=rejected_asset_id,
                evaluation_id=historical_evaluation_id,
                sha256="c" * 64,
                status="COMPLETE",
                fingerprint_state="VERIFIED",
                asset_state="REJECTED",
                reserved_credits=0,
                consumed_credits=2,
                reference_count=2,
                with_credit_reservation=False,
            )
            cursor.execute(
                """
                INSERT INTO "sermonEvaluation"
                    ("id", "ownerId", "preacherId", "fingerprintId",
                     "audioAssetId", "title", "preachedOn", "preset",
                     "requestedRuns", "completedRuns", "status", "version",
                     "createdAt", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, 'Failed reattachment',
                        %s, 'STANDARD', 1, 0, 'FAILED', 0, %s, %s)
                """,
                (
                    failed_evaluation_id,
                    owner_id,
                    preacher_id,
                    rejected_fingerprint_id,
                    rejected_asset_id,
                    date(2026, 7, 28),
                    now,
                    now,
                ),
            )

        job = persistence.fetch_evaluation(main_evaluation_id)
        assert job.title == f"Integration main-{suffix}"
        assert job.claimed_sha256 == "a" * 64

        deadline = datetime.now(timezone.utc) + timedelta(minutes=15)
        attempt_id, persisted_deadline = persistence.create_evaluation_attempt(
            main_evaluation_id,
            deadline_at=deadline,
            appwrite_execution_id=f"execution-main-{suffix}",
            resume_reason="integration",
        )
        assert abs((persisted_deadline - deadline).total_seconds()) < 0.001
        lease = persistence.claim_lease(
            evaluation_id=main_evaluation_id,
            evaluation_attempt_id=attempt_id,
            lease_owner=f"worker-main-{suffix}",
        )
        with pytest.raises(LeaseUnavailable):
            persistence.claim_lease(
                evaluation_id=main_evaluation_id,
                evaluation_attempt_id=attempt_id,
                lease_owner=f"duplicate-worker-{suffix}",
            )

        version = persistence.compare_and_set_status(
            evaluation_id=main_evaluation_id,
            expected_status=EvaluationStatus.QUEUED,
            expected_version=0,
            target_status=EvaluationStatus.PREPARING_AUDIO,
            lease=lease,
        )
        persistence.verify_audio(
            job,
            verified_sha256="a" * 64,
            duration_seconds=1800,
            byte_size=123,
            lease=lease,
        )
        version = persistence.compare_and_set_status(
            evaluation_id=main_evaluation_id,
            expected_status=EvaluationStatus.PREPARING_AUDIO,
            expected_version=version,
            target_status=EvaluationStatus.EXTRACTING,
            lease=lease,
        )
        version = persistence.compare_and_set_status(
            evaluation_id=main_evaluation_id,
            expected_status=EvaluationStatus.EXTRACTING,
            expected_version=version,
            target_status=EvaluationStatus.SCORING,
            lease=lease,
        )
        spec = AttemptSpec(
            ordinal=1,
            attempt_number=1,
            seed=1689,
            retry_wave=0,
        )
        persistence.prepare_scoring_runs(
            main_evaluation_id, 1, lease=lease
        )
        persistence.record_attempt_started(
            main_evaluation_id, spec, lease=lease
        )
        persistence.record_attempt_result(
            main_evaluation_id,
            AttemptResult(spec=spec, value=_ScoreValue()),
            lease=lease,
        )
        for target in (
            EvaluationStatus.HARMONIZING,
            EvaluationStatus.AGGREGATING,
            EvaluationStatus.SUMMARIZING,
        ):
            current = EvaluationStatus(
                {
                    EvaluationStatus.HARMONIZING: "SCORING",
                    EvaluationStatus.AGGREGATING: "HARMONIZING",
                    EvaluationStatus.SUMMARIZING: "AGGREGATING",
                }[target]
            )
            version = persistence.compare_and_set_status(
                evaluation_id=main_evaluation_id,
                expected_status=current,
                expected_version=version,
                target_status=target,
                lease=lease,
            )

        persistence.finish(
            evaluation_id=main_evaluation_id,
            status=EvaluationStatus.COMPLETE,
            completed_runs=1,
            result={
                "scoring": {
                    "Aggregated_Summary": {
                        "Overall_Impact_Base": 4.2,
                        "duration_penalty": 0.0,
                        "Overall_Impact_Adjusted": 4.2,
                    }
                }
            },
            provenance={"responseId": "integration-response"},
            warning_codes=[],
            evaluation_attempt_id=attempt_id,
            lease=lease,
            reports={
                "MARKDOWN": b"integration markdown",
                "JSON": b'{"integration":true}',
                "CSV": b"header\nvalue\n",
            },
            report_version=1,
        )
        persistence.release_lease(lease)

        with pool.connection() as connection, connection.cursor() as cursor:
            _insert_bundle(
                cursor,
                prefix=f"mismatch-{suffix}",
                owner_id=owner_id,
                preacher_id=preacher_id,
                fingerprint_id=mismatch_fingerprint_id,
                asset_id=mismatch_asset_id,
                evaluation_id=mismatch_evaluation_id,
                sha256="d" * 64,
                fingerprint_state="VERIFIED",
            )

        mismatch_job = persistence.fetch_evaluation(mismatch_evaluation_id)
        mismatch_deadline = datetime.now(timezone.utc) + timedelta(minutes=15)
        mismatch_attempt_id, _ = persistence.create_evaluation_attempt(
            mismatch_evaluation_id,
            deadline_at=mismatch_deadline,
            appwrite_execution_id=f"execution-mismatch-{suffix}",
            resume_reason="integration-mismatch",
        )
        mismatch_lease = persistence.claim_lease(
            evaluation_id=mismatch_evaluation_id,
            evaluation_attempt_id=mismatch_attempt_id,
            lease_owner=f"worker-mismatch-{suffix}",
        )
        persistence.compare_and_set_status(
            evaluation_id=mismatch_evaluation_id,
            expected_status=EvaluationStatus.QUEUED,
            expected_version=0,
            target_status=EvaluationStatus.PREPARING_AUDIO,
            lease=mismatch_lease,
        )
        with pytest.raises(AudioHashMismatch) as mismatch_error:
            persistence.verify_audio(
                mismatch_job,
                verified_sha256="a" * 64,
                duration_seconds=1800,
                byte_size=123,
                lease=mismatch_lease,
            )
        assert (
            mismatch_error.value.canonical_evaluation_id
            == main_evaluation_id
        )

        with pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT evaluation."status"::text, evaluation."result",
                       fingerprint."verificationState"::text
                         AS "fingerprintState",
                       fingerprint."runCreditsReserved",
                       fingerprint."runCreditsConsumed",
                       asset."verificationState"::text AS "assetState",
                       reservation."state"::text AS "creditState",
                       reservation."releaseReason",
                       attempt."terminalOutcome"::text,
                       attempt."endedAt"
                FROM "sermonEvaluation" evaluation
                JOIN "sermonAudioFingerprint" fingerprint
                  ON fingerprint."id" = evaluation."fingerprintId"
                JOIN "sermonAudioAsset" asset
                  ON asset."id" = evaluation."audioAssetId"
                JOIN "sermonRunCreditReservation" reservation
                  ON reservation."evaluationId" = evaluation."id"
                JOIN "sermonEvaluationAttempt" attempt
                  ON attempt."evaluationId" = evaluation."id"
                WHERE evaluation."id" = %s
                """,
                (mismatch_evaluation_id,),
            )
            assert cursor.fetchone() == {
                "status": "PREPARING_AUDIO",
                "result": {},
                "fingerprintState": "VERIFIED",
                "runCreditsReserved": 1,
                "runCreditsConsumed": 0,
                "assetState": "PENDING",
                "creditState": "RESERVED",
                "releaseReason": None,
                "terminalOutcome": None,
                "endedAt": None,
            }
        assert mismatch_asset_id not in {
            row["id"]
            for row in persistence.pending_rejected_audio_assets(limit=20)
        }

        assert persistence.mark_terminal(
            evaluation_id=mismatch_evaluation_id,
            evaluation_attempt_id=mismatch_attempt_id,
            status=EvaluationStatus.FAILED,
            error_code="AUDIO_HASH_MISMATCH",
            error_message="integration hash mismatch",
            lease=mismatch_lease,
            release_credit_reason="AUDIO_VERIFICATION_FAILED",
            rejected_audio_asset_id=mismatch_asset_id,
            rejected_fingerprint_id=mismatch_fingerprint_id,
            canonical_evaluation_id=main_evaluation_id,
        )
        persistence.release_lease(mismatch_lease)

        with pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT evaluation."status"::text, evaluation."result",
                       evaluation."audioAssetId",
                       fingerprint."verificationState"::text
                         AS "fingerprintState",
                       fingerprint."runCreditsReserved",
                       fingerprint."runCreditsConsumed",
                       asset."verificationState"::text AS "assetState",
                       asset."referenceCount",
                       reservation."state"::text AS "creditState",
                       reservation."releaseReason",
                       attempt."terminalOutcome"::text,
                       attempt."endedAt" IS NOT NULL AS "attemptEnded"
                FROM "sermonEvaluation" evaluation
                JOIN "sermonAudioFingerprint" fingerprint
                  ON fingerprint."id" = evaluation."fingerprintId"
                JOIN "sermonAudioAsset" asset
                  ON asset."id" = %s
                JOIN "sermonRunCreditReservation" reservation
                  ON reservation."evaluationId" = evaluation."id"
                JOIN "sermonEvaluationAttempt" attempt
                  ON attempt."evaluationId" = evaluation."id"
                WHERE evaluation."id" = %s
                """,
                (mismatch_asset_id, mismatch_evaluation_id),
            )
            assert cursor.fetchone() == {
                "status": "FAILED",
                "result": {"canonicalEvaluationId": main_evaluation_id},
                "audioAssetId": None,
                "fingerprintState": "VERIFIED",
                "runCreditsReserved": 0,
                "runCreditsConsumed": 0,
                "assetState": "REJECTED",
                "referenceCount": 0,
                "creditState": "RELEASED",
                "releaseReason": "AUDIO_VERIFICATION_FAILED",
                "terminalOutcome": "FAILED",
                "attemptEnded": True,
            }
        assert mismatch_asset_id in {
            row["id"]
            for row in persistence.pending_rejected_audio_assets(limit=20)
        }

        with pool.connection() as connection, connection.cursor() as cursor:
            _insert_bundle(
                cursor,
                prefix=f"cancel-{suffix}",
                owner_id=owner_id,
                preacher_id=preacher_id,
                fingerprint_id=canceled_fingerprint_id,
                asset_id=canceled_asset_id,
                evaluation_id=canceled_evaluation_id,
                sha256="b" * 64,
            )

        canceled_deadline = datetime.now(timezone.utc) + timedelta(minutes=15)
        canceled_attempt_id, _ = persistence.create_evaluation_attempt(
            canceled_evaluation_id,
            deadline_at=canceled_deadline,
            appwrite_execution_id=f"execution-cancel-{suffix}",
            resume_reason="integration-cancel",
        )
        canceled_lease = persistence.claim_lease(
            evaluation_id=canceled_evaluation_id,
            evaluation_attempt_id=canceled_attempt_id,
            lease_owner=f"worker-cancel-{suffix}",
        )
        with pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE "sermonEvaluation"
                SET "cancelRequestedAt" = NOW(), "version" = "version" + 1,
                    "updatedAt" = NOW()
                WHERE "id" = %s
                """,
                (canceled_evaluation_id,),
            )
        with pytest.raises(EvaluationCanceled):
            persistence.compare_and_set_status(
                evaluation_id=canceled_evaluation_id,
                expected_status=EvaluationStatus.QUEUED,
                expected_version=1,
                target_status=EvaluationStatus.PREPARING_AUDIO,
                lease=canceled_lease,
            )
        assert persistence.mark_terminal(
            evaluation_id=canceled_evaluation_id,
            evaluation_attempt_id=canceled_attempt_id,
            status=EvaluationStatus.CANCELED,
            error_code="EVALUATION_CANCELED",
            error_message="integration cancellation",
            lease=canceled_lease,
            release_credit_reason="CANCELED_BEFORE_SCORING",
        )
        persistence.release_lease(canceled_lease)

        rejected = {
            row["id"]: row
            for row in persistence.pending_rejected_audio_assets(limit=10)
        }
        assert rejected_asset_id in rejected
        assert persistence.clear_rejected_audio_pointer(
            asset_id=rejected_asset_id,
            bucket_id=f"bucket-rejected-{suffix}",
            file_id=f"file-rejected-{suffix}",
        )

        with pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT evaluation."status"::text, evaluation."result",
                       attempt."terminalOutcome"::text,
                       reservation."state"::text AS "creditState",
                       fingerprint."runCreditsReserved",
                       fingerprint."runCreditsConsumed"
                FROM "sermonEvaluation" evaluation
                JOIN "sermonEvaluationAttempt" attempt
                  ON attempt."evaluationId" = evaluation."id"
                JOIN "sermonRunCreditReservation" reservation
                  ON reservation."evaluationId" = evaluation."id"
                JOIN "sermonAudioFingerprint" fingerprint
                  ON fingerprint."id" = evaluation."fingerprintId"
                WHERE evaluation."id" = %s
                """,
                (main_evaluation_id,),
            )
            completed = cursor.fetchone()
            assert completed == {
                "status": "COMPLETE",
                "result": {
                    "scoring": {
                        "Aggregated_Summary": {
                            "Overall_Impact_Base": 4.2,
                            "duration_penalty": 0.0,
                            "Overall_Impact_Adjusted": 4.2,
                        }
                    }
                },
                "terminalOutcome": "COMPLETE",
                "creditState": "CONSUMED",
                "runCreditsReserved": 0,
                "runCreditsConsumed": 1,
            }
            cursor.execute(
                """
                SELECT COUNT(*) AS count
                FROM "sermonReportArtifact"
                WHERE "evaluationId" = %s AND "reportVersion" = 1
                """,
                (main_evaluation_id,),
            )
            assert cursor.fetchone()["count"] == 3
            cursor.execute(
                """
                SELECT run."status"::text, run."finalSeed",
                       attempt."status"::text AS "attemptStatus"
                FROM "sermonScoringRun" run
                JOIN "sermonScoringAttempt" attempt
                  ON attempt."scoringRunId" = run."id"
                WHERE run."evaluationId" = %s AND run."ordinal" = 1
                """,
                (main_evaluation_id,),
            )
            assert cursor.fetchone() == {
                "status": "SUCCEEDED",
                "finalSeed": 1689,
                "attemptStatus": "SUCCEEDED",
            }
            cursor.execute(
                """
                SELECT reservation."state"::text,
                       fingerprint."runCreditsReserved",
                       fingerprint."runCreditsConsumed",
                       evaluation."status"::text
                FROM "sermonRunCreditReservation" reservation
                JOIN "sermonAudioFingerprint" fingerprint
                  ON fingerprint."id" = reservation."fingerprintId"
                JOIN "sermonEvaluation" evaluation
                  ON evaluation."id" = reservation."evaluationId"
                WHERE reservation."evaluationId" = %s
                """,
                (canceled_evaluation_id,),
            )
            assert cursor.fetchone() == {
                "state": "RELEASED",
                "runCreditsReserved": 0,
                "runCreditsConsumed": 0,
                "status": "CANCELED",
            }
            cursor.execute(
                """
                SELECT "verificationState"::text, "appwriteBucketId",
                       "appwriteFileId", "referenceCount"
                FROM "sermonAudioAsset"
                WHERE "id" = %s
                """,
                (rejected_asset_id,),
            )
            assert cursor.fetchone() == {
                "verificationState": "REJECTED",
                "appwriteBucketId": None,
                "appwriteFileId": None,
                "referenceCount": 0,
            }
            cursor.execute(
                """
                SELECT "id", "audioAssetId"
                FROM "sermonEvaluation"
                WHERE "id" IN (%s, %s)
                ORDER BY "id"
                """,
                (historical_evaluation_id, failed_evaluation_id),
            )
            detached = cursor.fetchall()
            assert {row["id"] for row in detached} == {
                historical_evaluation_id,
                failed_evaluation_id,
            }
            assert all(row["audioAssetId"] is None for row in detached)
            cursor.execute(
                """
                SELECT "verificationState"::text, "runCreditsConsumed"
                FROM "sermonAudioFingerprint"
                WHERE "id" = %s
                """,
                (rejected_fingerprint_id,),
            )
            assert cursor.fetchone() == {
                "verificationState": "VERIFIED",
                "runCreditsConsumed": 2,
            }

        retry_run_id = f"integration-retry-run-{suffix}"
        with pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO "sermonScoringRun"
                    ("id", "evaluationId", "ordinal", "status",
                     "createdAt", "updatedAt")
                VALUES (%s, %s, 1, 'FAILED', NOW(), NOW())
                """,
                (retry_run_id, mismatch_evaluation_id),
            )
            for attempt_number, seed in enumerate((101, 102, 103), start=1):
                cursor.execute(
                    """
                    INSERT INTO "sermonScoringAttempt"
                        ("id", "evaluationId", "evaluationAttemptId",
                         "scoringRunId", "attemptNumber", "seed", "status",
                         "startedAt", "completedAt", "createdAt", "updatedAt")
                    VALUES (%s, %s, %s, %s, %s, %s, 'FAILED',
                            NOW(), NOW(), NOW(), NOW())
                    """,
                    (
                        f"integration-historical-scoring-{attempt_number}-{suffix}",
                        mismatch_evaluation_id,
                        mismatch_attempt_id,
                        retry_run_id,
                        attempt_number,
                        seed,
                    ),
                )
            cursor.execute(
                """
                UPDATE "sermonEvaluation"
                SET "status" = 'QUEUED', "errorCode" = NULL,
                    "errorMessage" = NULL, "updatedAt" = NOW()
                WHERE "id" = %s
                """,
                (mismatch_evaluation_id,),
            )

        retry_attempt_id, _ = persistence.create_evaluation_attempt(
            mismatch_evaluation_id,
            deadline_at=datetime.now(timezone.utc) + timedelta(minutes=15),
            appwrite_execution_id=f"execution-manual-retry-{suffix}",
            resume_reason="integration-manual-retry",
        )
        retry_lease = persistence.claim_lease(
            evaluation_id=mismatch_evaluation_id,
            evaluation_attempt_id=retry_attempt_id,
            lease_owner=f"worker-manual-retry-{suffix}",
        )
        previous_values, retry_attempt_counts, historical_seeds = (
            persistence.scoring_resume_state(
                mismatch_evaluation_id, retry_attempt_id
            )
        )
        assert previous_values == {}
        assert retry_attempt_counts == {1: 0}
        assert historical_seeds == {101, 102, 103}

        retry_spec = AttemptSpec(
            ordinal=1,
            attempt_number=1,
            seed=104,
            retry_wave=0,
        )
        persistence.record_attempt_started(
            mismatch_evaluation_id, retry_spec, lease=retry_lease
        )
        persistence.record_attempt_result(
            mismatch_evaluation_id,
            AttemptResult(
                spec=retry_spec,
                error=RuntimeError("manual retry provider failure"),
            ),
            lease=retry_lease,
        )
        with pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*) AS "attemptCount",
                       COUNT(DISTINCT "evaluationAttemptId") AS "scopeCount"
                FROM "sermonScoringAttempt"
                WHERE "evaluationId" = %s
                """,
                (mismatch_evaluation_id,),
            )
            assert cursor.fetchone() == {
                "attemptCount": 4,
                "scopeCount": 2,
            }
        assert persistence.mark_terminal(
            evaluation_id=mismatch_evaluation_id,
            evaluation_attempt_id=retry_attempt_id,
            status=EvaluationStatus.FAILED,
            error_code="PROVIDER_FAILURE",
            error_message="manual retry provider failure",
            lease=retry_lease,
        )
        persistence.release_lease(retry_lease)
    finally:
        try:
            _cleanup_owner(pool, owner_id)
        finally:
            pool.close()


@pytest.fixture
def queued_report_job(tmp_path, requested_runs, retry, saved_alias, legacy, extraction, raw_scoring):
    suffix = uuid.uuid4().hex[:24]
    evaluation_id = f"evaluation-{suffix}"
    owner_id = f"owner-{suffix}"
    preacher_id = f"preacher-{suffix}"
    asset_id = f"asset-{suffix}"
    bucket_id = f"bucket-{suffix}"
    audio = tmp_path / f"file-{suffix}.audio"
    with wave.open(str(audio), "wb") as wav:
        wav.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
        wav.writeframes(bytes(16000))

    storage = LocalFilesystemStorage(root=tmp_path, allowed_bucket_id=bucket_id)
    with ConnectionPool(DATABASE_URL, kwargs={"row_factory": dict_row}) as pool:
        try:
            with pool.connection() as conn, conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO "sermonPreacher"
                        ("id", "ownerId", "displayName", "normalizedName", "updatedAt")
                    VALUES (%s, %s, 'Pastor', 'pastor', NOW())
                    """,
                    (preacher_id, owner_id),
                )
                _insert_bundle(
                    cur,
                    prefix=suffix,
                    owner_id=owner_id,
                    preacher_id=preacher_id,
                    fingerprint_id=f"fingerprint-{suffix}",
                    asset_id=asset_id,
                    evaluation_id=evaluation_id,
                    sha256=hashlib.sha256(audio.read_bytes()).hexdigest(),
                    requested_runs=requested_runs,
                    reserved_credits=requested_runs,
                )
                cur.execute(
                    """
                    UPDATE "sermonAudioAsset" SET "originalFilename" = 'sermon.wav',
                        "mimeType" = 'audio/wav', "byteSize" = %s WHERE id = %s
                    """,
                    (audio.stat().st_size, asset_id),
                )
                if not legacy:
                    cur.execute(
                        'UPDATE "sermonEvaluation" SET channel = %s, "usageEnvironment" = %s, "expectedUsageAttempts" = 0 WHERE id = %s',
                        ("public_api", "test", evaluation_id),
                    )
                if retry:
                    # The retry endpoint requeues the evaluation and preserves its outputs.
                    result = {
                        "audio": {
                            "geminiFile": {"name": "files/saved"},
                            "durationSeconds": 1,
                        },
                        "extraction": extraction.model_dump(mode="json"),
                    }
                    if saved_alias:
                        result["provenance"] = {
                            "configuredModelAlias": saved_alias,
                            "modelVersion": "flash-version-from-saved-response",
                        }
                    cur.execute(
                        'UPDATE "sermonEvaluation" SET result = %s WHERE id = %s',
                        (Jsonb(result), evaluation_id),
                    )
                    raw_score = Jsonb(raw_scoring.model_dump())
                    cur.executemany(
                        """
                        INSERT INTO "sermonScoringRun"
                            (id, "evaluationId", ordinal, status, "rawScore", "updatedAt")
                        VALUES (%s, %s, %s, 'SUCCEEDED', %s, NOW())
                        """,
                        [
                            (uuid.uuid4().hex, evaluation_id, ordinal, raw_score)
                            for ordinal in range(1, requested_runs + 1)
                        ],
                    )

            yield evaluation_id, pool, storage
        finally:
            with pool.connection() as conn:
                conn.execute('DELETE FROM "ProviderCallAttempt" WHERE "operationId" = %s', (evaluation_id,))
            _cleanup_owner(pool, owner_id)


@pytest.mark.parametrize(
    ("requested_runs", "retry", "expired_file", "saved_alias", "legacy"),
    [
        (1, False, False, None, False),
        (3, False, False, None, False),
        (3, True, False, None, False),
        (3, True, True, None, False),
        (3, True, False, "gemini-3.8-flash", False),
        (3, True, False, None, True),
    ],
    ids=["standard", "high-confidence", "retry-active-file", "retry-expired-file", "retry-flash", "retry-legacy"],
)
def test_worker_publishes_reports_from_read_only_directory(
    queued_report_job,
    tmp_path: Path,
    monkeypatch,
    extraction,
    raw_scoring,
    requested_runs,
    retry,
    expired_file,
    saved_alias,
    legacy,
) -> None:
    monkeypatch.setenv("SERMON_USAGE_ENVIRONMENT", "production")
    evaluation_id, pool, storage = queued_report_job
    from google.genai import types

    provider = GeminiProvider(api_key="offline-test")
    provider.upload_file = Mock(return_value=SimpleNamespace(name="files/uploaded"))
    provider.get_file = Mock(return_value=SimpleNamespace(name="files/saved"))
    if expired_file:
        provider.get_file.side_effect = FileNotFoundError("Expired Gemini file")
    provider.wait_until_active = Mock(side_effect=lambda file, **_: file)
    responses = {
        SermonExtractionStep1: extraction.model_dump(),
        SermonScoringStep2Raw: raw_scoring.model_dump(),
        SermonHarmonizedFeedback: {
            section.key: "Combined feedback" for section in RUBRIC_SECTIONS
        },
        AggregatedSummaryFeedback: {"Overall_Impact": "Summary feedback"},
    }

    # In the Standard case, a provider timeout coincides with a receipt-store
    # outage. The retry succeeds, leaving one fewer receipt than dispatches.
    lose_first_response = requested_runs == 1

    def generate(*, contents, config, model):
        nonlocal lose_first_response
        if lose_first_response:
            lose_first_response = False
            raise httpx.ReadTimeout("lost response")
        assert model == (saved_alias or "gemini-4-hydrogen")
        return SimpleNamespace(
            parsed=responses[config], model_version="hydrogen-version-from-response",
            response_id="offline-response",
            usage_metadata=types.GenerateContentResponseUsageMetadata(
                prompt_token_count=100, candidates_token_count=15, thoughts_token_count=5,
                total_token_count=120, prompt_tokens_details=(
                    [types.ModalityTokenCount(modality="AUDIO", token_count=60)]
                    if isinstance(contents, list) else None
                ),
            ),
        )

    provider._config = lambda schema, *_: schema
    provider._client = lambda _: SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    persistence = PsycopgPersistence(pool=pool)
    if requested_runs == 1:
        provider.retry_initial_delay_seconds = 0
        write_receipt = persistence.record_provider_usage
        missing_id = None

        def miss_first_receipt(job, stage, receipt):
            nonlocal missing_id
            if missing_id is None:
                missing_id = receipt["attemptId"]
            if receipt["attemptId"] == missing_id:
                raise RuntimeError("receipt store unavailable")
            write_receipt(job, stage, receipt)

        monkeypatch.setattr(persistence, "record_provider_usage", miss_first_receipt)
    if retry:
        # The prior worker paid for these outputs before their checkpoints
        # were recovered. Re-deliver its received receipt after finalization.
        job = persistence.fetch_evaluation(evaluation_id)
        for schema in [SermonExtractionStep1] + [SermonScoringStep2Raw] * requested_runs:
            stage = "extraction" if schema is SermonExtractionStep1 else "scoring"
            receipts = []
            provider.generate_structured_with_contents(
                ["Offline", object()], schema, model=saved_alias, record_usage=receipts.append,
                count_attempt=lambda: persistence.count_provider_attempt(job.id),
            )
            for receipt in [*receipts, *reversed(receipts)]:
                persistence.record_provider_usage(job, stage, receipt)
        # Harmonization failed after a billed response. Restart from the saved
        # scores, paying only for the new harmonization and summary requests.
        harmonized = responses[SermonHarmonizedFeedback]
        responses[SermonHarmonizedFeedback] = {}
        with pytest.raises(ValidationError):
            provider.generate_structured(
                "Offline", SermonHarmonizedFeedback, model=saved_alias,
                record_usage=lambda receipt: persistence.record_provider_usage(job, "harmonization", receipt),
                count_attempt=lambda: persistence.count_provider_attempt(job.id),
            )
        responses[SermonHarmonizedFeedback] = harmonized

    provider.generate_structured_with_contents = Mock(wraps=provider.generate_structured_with_contents)
    service = SermonEvaluationService(persistence=persistence, storage=storage, provider=provider)
    scratch = tmp_path / "scratch"
    scratch.mkdir()
    monkeypatch.setattr(tempfile, "tempdir", str(scratch))
    deployment = tmp_path / "deployment"
    deployment.mkdir(mode=0o555)
    monkeypatch.chdir(deployment)
    try:
        assert service.process(evaluation_id)["status"] == "COMPLETE"
        assert list(deployment.iterdir()) == []
        assert list(scratch.iterdir()) == []
    finally:
        deployment.chmod(0o755)

    with pool.connection() as conn:
        expected_attempts = conn.execute(
            'SELECT "expectedUsageAttempts" FROM "sermonEvaluation" WHERE id = %s', (evaluation_id,),
        ).fetchone()["expectedUsageAttempts"]
        artifacts = conn.execute(
            'SELECT format, content FROM "sermonReportArtifact" WHERE "evaluationId" = %s',
            (evaluation_id,),
        ).fetchall()
        usage = conn.execute(
            """
            SELECT stage, modality, preset, channel, environment, outcome, "requestedModel", "returnedModel",
                   "audioInputTokens", "inputTokens", "outputTokens", count(*) AS attempts
            FROM "ProviderCallAttempt" WHERE "operationId" = %s AND feature = 'sermon'
            GROUP BY 1,2,3,4,5,6,7,8,9,10,11
            """,
            (evaluation_id,),
        ).fetchall()
    expected_stages = {("extraction", "success"): 1, ("scoring", "success"): requested_runs, ("summary", "success"): 1}
    if requested_runs > 1:
        expected_stages["harmonization", "success"] = 1
    if retry:
        expected_stages["harmonization", "invalid_output"] = 1
    lost_attempts = 1 if requested_runs == 1 else 0
    assert expected_attempts == (None if legacy else sum(expected_stages.values()) + lost_attempts)
    assert {(row["stage"], row["outcome"]): row["attempts"] for row in usage} == expected_stages
    for row in usage:
        audio = row["stage"] in {"extraction", "scoring"}
        assert row["channel"] == ("unknown" if legacy else "public_api")
        assert row["preset"] == ("STANDARD" if requested_runs == 1 else "HIGH_CONFIDENCE")
        assert row["modality"] == ("audio" if audio else "text")
        assert row["audioInputTokens"] == (60 if audio else None)
        assert row["environment"] == ("production" if legacy else "test")
        assert (row["inputTokens"], row["outputTokens"]) == (100, 20)
        assert row["requestedModel"] == (saved_alias or "gemini-4-hydrogen")
        assert row["returnedModel"] == "hydrogen-version-from-response"
    reports = {row["format"]: bytes(row["content"]) for row in artifacts}
    assert set(reports) == {"JSON", "MARKDOWN", "CSV"}
    assert all(reports.values())
    report = json.loads(reports["JSON"])
    metadata = report["metadata"]
    assert metadata["completedRuns"] == requested_runs
    expected_alias = saved_alias if retry else "gemini-4-hydrogen"
    assert metadata["configuredModelAlias"] == expected_alias
    if saved_alias:
        assert metadata["modelVersion"] == "flash-version-from-saved-response"
    elif retry:
        assert metadata["modelVersion"] is None
        assert "reused stages" in metadata["modelProvenanceNote"]
    else:
        assert metadata["modelVersion"] == "hydrogen-version-from-response"
    csv_row = next(csv.DictReader(reports["CSV"].decode().splitlines()))
    assert csv_row["model"] == (expected_alias or "")
    assert f'Model: {expected_alias or "-"}' in reports["MARKDOWN"].decode()
    feedback = report["scoring"]["Aggregated_Summary_Feedback"]
    assert feedback["Overall_Impact"] == "Summary feedback"
    if requested_runs > 1:
        assert report["scoring"]["Introduction"]["Feedback"] == "Combined feedback"

    audio_calls = [
        call.kwargs["response_schema"]
        for call in provider.generate_structured_with_contents.call_args_list
    ]
    if retry:
        assert audio_calls == []
        provider.get_file.assert_called_once()
    else:
        assert audio_calls == [SermonExtractionStep1] + [
            SermonScoringStep2Raw
        ] * requested_runs
    if retry and not expired_file:
        provider.upload_file.assert_not_called()
    else:
        provider.upload_file.assert_called_once()
