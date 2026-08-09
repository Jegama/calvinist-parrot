from __future__ import annotations

import os
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

import pytest
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from sermon_evaluator.persistence import (
    AudioHashMismatch,
    LeaseUnavailable,
    PsycopgPersistence,
)
from sermon_evaluator.stages import (
    AttemptResult,
    AttemptSpec,
    EvaluationCanceled,
    EvaluationStatus,
)

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
    reserved_credits: int = 1,
    consumed_credits: int = 0,
    reference_count: int = 1,
    with_credit_reservation: bool = True,
) -> None:
    now = datetime.now(timezone.utc)
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
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'STANDARD', 1, %s,
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
            VALUES (%s, %s, %s, 1, 'STANDARD', 'RESERVED', %s, %s, %s, %s)
            """,
            (
                f"credit-{prefix}",
                fingerprint_id,
                evaluation_id,
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
                "fingerprintState": "PROVISIONAL",
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
                       fingerprint."verificationState"::text
                         AS "fingerprintState",
                       fingerprint."runCreditsReserved",
                       fingerprint."runCreditsConsumed",
                       asset."verificationState"::text AS "assetState",
                       reservation."state"::text AS "creditState",
                       reservation."releaseReason",
                       attempt."terminalOutcome"::text,
                       attempt."endedAt" IS NOT NULL AS "attemptEnded"
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
                "status": "FAILED",
                "result": {"canonicalEvaluationId": main_evaluation_id},
                "fingerprintState": "REJECTED",
                "runCreditsReserved": 0,
                "runCreditsConsumed": 0,
                "assetState": "REJECTED",
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
    finally:
        try:
            _cleanup_owner(pool, owner_id)
        finally:
            pool.close()
