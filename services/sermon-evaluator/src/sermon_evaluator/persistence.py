"""Least-privileged pooled PostgreSQL boundary for the Appwrite worker.

Prisma remains the schema and migration owner. This module is the only Python
module that contains application SQL.
"""

from __future__ import annotations

import hashlib
import os
import threading
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterator, Mapping, Optional

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from .stages import (
    AttemptResult,
    AttemptSpec,
    EvaluationCanceled,
    EvaluationStatus,
    ScoringPersistence,
    validate_transition,
)

_POOL: Optional[ConnectionPool] = None
_POOL_LOCK = threading.Lock()


class PersistenceError(RuntimeError):
    pass


class CompareAndSetConflict(PersistenceError):
    pass


class LeaseUnavailable(PersistenceError):
    pass


class LeaseLost(PersistenceError):
    pass


class AudioHashMismatch(PersistenceError):
    code = "AUDIO_HASH_MISMATCH"

    def __init__(self, canonical_evaluation_id: Optional[str] = None) -> None:
        super().__init__("Verified audio SHA-256 differs from the claimed fingerprint")
        self.canonical_evaluation_id = canonical_evaluation_id


@dataclass(frozen=True)
class EvaluationJob:
    id: str
    owner_id: str
    title: str
    preacher_name: str
    preached_on: date
    status: EvaluationStatus
    version: int
    requested_runs: int
    completed_runs: int
    duration_adjustment_enabled: bool
    attempt_deadline_at: Optional[datetime]
    cancel_requested_at: Optional[datetime]
    fingerprint_id: str
    claimed_sha256: str
    audio_asset_id: str
    appwrite_bucket_id: str
    appwrite_file_id: str
    byte_size: int
    mime_type: str
    original_filename: str
    result: Mapping[str, Any]
    provenance: Mapping[str, Any]


@dataclass(frozen=True)
class Lease:
    slot_id: int
    lease_owner: str
    evaluation_id: str
    evaluation_attempt_id: str


def _new_id() -> str:
    return uuid.uuid4().hex


def get_pool(database_url: Optional[str] = None) -> ConnectionPool:
    """Create one lazy bounded pool per warm function instance."""

    global _POOL
    if _POOL is None:
        with _POOL_LOCK:
            if _POOL is None:
                conninfo = database_url or os.getenv("SERMON_DATABASE_URL")
                if not conninfo:
                    raise ValueError("SERMON_DATABASE_URL must be configured")
                if "sslmode=" not in conninfo:
                    separator = "&" if "?" in conninfo else "?"
                    conninfo = f"{conninfo}{separator}sslmode=require"
                _POOL = ConnectionPool(
                    conninfo=conninfo,
                    min_size=0,
                    max_size=int(os.getenv("SERMON_DB_POOL_MAX_SIZE", "4")),
                    timeout=float(os.getenv("SERMON_DB_POOL_TIMEOUT_SECONDS", "10")),
                    kwargs={
                        "autocommit": False,
                        "row_factory": dict_row,
                        "options": "-c statement_timeout=30000",
                    },
                    open=False,
                )
                _POOL.open(wait=False)
    return _POOL


class PsycopgPersistence(ScoringPersistence):
    def __init__(self, pool: Optional[ConnectionPool] = None) -> None:
        self.pool = pool or get_pool()

    def fetch_evaluation(self, evaluation_id: str) -> EvaluationJob:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT e."id", e."ownerId", e."title", e."preachedOn",
                       preacher."displayName" AS "preacherName",
                       e."status"::text, e."version",
                       e."requestedRuns", e."completedRuns",
                       e."durationAdjustmentEnabled", e."attemptDeadlineAt",
                       e."cancelRequestedAt", e."fingerprintId",
                       f."sha256" AS "claimedSha256",
                       a."id" AS "audioAssetId", a."appwriteBucketId",
                       a."appwriteFileId", a."byteSize", a."mimeType",
                       a."originalFilename", e."result", e."provenance"
                FROM "sermonEvaluation" e
                JOIN "sermonAudioFingerprint" f ON f."id" = e."fingerprintId"
                JOIN "sermonAudioAsset" a ON a."id" = e."audioAssetId"
                JOIN "sermonPreacher" preacher ON preacher."id" = e."preacherId"
                WHERE e."id" = %s AND e."deletedAt" IS NULL
                """,
                (evaluation_id,),
            )
            row = cursor.fetchone()
        if row is None:
            raise PersistenceError("Evaluation or retained audio was not found")
        return EvaluationJob(
            id=row["id"],
            owner_id=row["ownerId"],
            title=row["title"],
            preacher_name=row["preacherName"],
            preached_on=row["preachedOn"],
            status=EvaluationStatus(row["status"]),
            version=row["version"],
            requested_runs=row["requestedRuns"],
            completed_runs=row["completedRuns"],
            duration_adjustment_enabled=row["durationAdjustmentEnabled"],
            attempt_deadline_at=row["attemptDeadlineAt"],
            cancel_requested_at=row["cancelRequestedAt"],
            fingerprint_id=row["fingerprintId"],
            claimed_sha256=row["claimedSha256"].strip(),
            audio_asset_id=row["audioAssetId"],
            appwrite_bucket_id=row["appwriteBucketId"],
            appwrite_file_id=row["appwriteFileId"],
            byte_size=row["byteSize"],
            mime_type=row["mimeType"],
            original_filename=row["originalFilename"],
            result=row["result"] or {},
            provenance=row["provenance"] or {},
        )

    def create_evaluation_attempt(
        self,
        evaluation_id: str,
        *,
        deadline_at: datetime,
        appwrite_execution_id: Optional[str],
        resume_reason: str,
    ) -> tuple[str, datetime]:
        attempt_id = _new_id()
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))
                """,
                (f"sermon-evaluation:{evaluation_id}",),
            )
            cursor.execute(
                """
                SELECT "id" FROM "sermonEvaluation"
                WHERE "id" = %s AND "deletedAt" IS NULL
                FOR UPDATE
                """,
                (evaluation_id,),
            )
            if cursor.fetchone() is None:
                raise PersistenceError("Evaluation was not found")
            cursor.execute(
                """
                SELECT "id", "deadlineAt"
                FROM "sermonEvaluationAttempt"
                WHERE "evaluationId" = %s AND "endedAt" IS NULL
                ORDER BY "attemptNumber" DESC
                LIMIT 1
                FOR UPDATE
                """,
                (evaluation_id,),
            )
            active_attempt = cursor.fetchone()
            if active_attempt is not None:
                return active_attempt["id"], active_attempt["deadlineAt"]
            cursor.execute(
                """
                SELECT COALESCE(MAX("attemptNumber"), 0) + 1 AS next_number
                FROM "sermonEvaluationAttempt"
                WHERE "evaluationId" = %s
                """,
                (evaluation_id,),
            )
            attempt_number = cursor.fetchone()["next_number"]
            cursor.execute(
                """
                INSERT INTO "sermonEvaluationAttempt"
                    ("id", "evaluationId", "attemptNumber", "startedAt",
                     "deadlineAt", "appwriteExecutionId", "resumeReason", "updatedAt")
                VALUES (%s, %s, %s, NOW(), %s, %s, %s, NOW())
                """,
                (
                    attempt_id,
                    evaluation_id,
                    attempt_number,
                    deadline_at,
                    appwrite_execution_id,
                    resume_reason,
                ),
            )
            cursor.execute(
                """
                UPDATE "sermonEvaluation"
                SET "attemptDeadlineAt" = %s,
                    "startedAt" = COALESCE("startedAt", NOW()),
                    "updatedAt" = NOW()
                WHERE "id" = %s
                """,
                (deadline_at, evaluation_id),
            )
        return attempt_id, deadline_at

    def active_evaluation_attempt(self, evaluation_id: str) -> tuple[str, datetime]:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT "id", "deadlineAt"
                FROM "sermonEvaluationAttempt"
                WHERE "evaluationId" = %s AND "endedAt" IS NULL
                ORDER BY "attemptNumber" DESC
                LIMIT 1
                """,
                (evaluation_id,),
            )
            row = cursor.fetchone()
        if row is None:
            raise PersistenceError("Active evaluation attempt is missing")
        return row["id"], row["deadlineAt"]

    def claim_lease(
        self,
        *,
        evaluation_id: str,
        evaluation_attempt_id: str,
        lease_owner: str,
        lease_seconds: int = 90,
    ) -> Lease:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))
                """,
                (f"sermon-evaluation:{evaluation_id}",),
            )
            cursor.execute(
                """
                SELECT evaluation."status"::text, evaluation."version"
                FROM "sermonEvaluation" evaluation
                JOIN "sermonEvaluationAttempt" attempt
                  ON attempt."evaluationId" = evaluation."id"
                WHERE evaluation."id" = %s
                  AND attempt."id" = %s
                  AND attempt."endedAt" IS NULL
                  AND evaluation."status" IN (
                    'QUEUED', 'PREPARING_AUDIO', 'EXTRACTING', 'SCORING',
                    'HARMONIZING', 'CALIBRATING', 'SUMMARIZING'
                  )
                FOR UPDATE OF evaluation, attempt
                """,
                (evaluation_id, evaluation_attempt_id),
            )
            if cursor.fetchone() is None:
                raise LeaseUnavailable(
                    "Evaluation attempt is no longer active or claimable"
                )
            cursor.execute(
                """
                SELECT "slotId"
                FROM "sermonWorkerLease"
                WHERE "evaluationId" = %s
                  AND "leaseExpiresAt" >= NOW()
                LIMIT 1
                FOR UPDATE
                """,
                (evaluation_id,),
            )
            if cursor.fetchone() is not None:
                raise LeaseUnavailable(
                    "This evaluation already has a live worker lease"
                )
            cursor.execute(
                """
                SELECT "slotId"
                FROM "sermonWorkerLease"
                WHERE "leaseOwner" IS NULL OR "leaseExpiresAt" < NOW()
                ORDER BY "slotId"
                FOR UPDATE SKIP LOCKED
                LIMIT 1
                """
            )
            row = cursor.fetchone()
            if row is not None:
                cursor.execute(
                    """
                    UPDATE "sermonWorkerLease"
                    SET "leaseOwner" = %s,
                        "evaluationId" = %s,
                        "evaluationAttemptId" = %s,
                        "leaseExpiresAt" = NOW() + (%s * INTERVAL '1 second'),
                        "heartbeatAt" = NOW(),
                        "updatedAt" = NOW()
                    WHERE "slotId" = %s
                    RETURNING "slotId"
                    """,
                    (
                        lease_owner,
                        evaluation_id,
                        evaluation_attempt_id,
                        lease_seconds,
                        row["slotId"],
                    ),
                )
                row = cursor.fetchone()
        if row is None:
            raise LeaseUnavailable("Both sermon worker slots are active")
        return Lease(
            slot_id=row["slotId"],
            lease_owner=lease_owner,
            evaluation_id=evaluation_id,
            evaluation_attempt_id=evaluation_attempt_id,
        )

    def heartbeat_lease(self, lease: Lease, lease_seconds: int = 90) -> bool:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE "sermonWorkerLease"
                SET "leaseExpiresAt" = NOW() + (%s * INTERVAL '1 second'),
                    "heartbeatAt" = NOW(), "updatedAt" = NOW()
                WHERE "slotId" = %s AND "leaseOwner" = %s
                  AND "evaluationId" = %s AND "evaluationAttemptId" = %s
                """,
                (
                    lease_seconds,
                    lease.slot_id,
                    lease.lease_owner,
                    lease.evaluation_id,
                    lease.evaluation_attempt_id,
                ),
            )
            return cursor.rowcount == 1

    def assert_lease_owned(self, lease: Lease) -> None:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT 1
                FROM "sermonWorkerLease"
                WHERE "slotId" = %s AND "leaseOwner" = %s
                  AND "evaluationId" = %s
                  AND "evaluationAttemptId" = %s
                  AND "leaseExpiresAt" >= NOW()
                """,
                (
                    lease.slot_id,
                    lease.lease_owner,
                    lease.evaluation_id,
                    lease.evaluation_attempt_id,
                ),
            )
            if cursor.fetchone() is None:
                raise LeaseLost("Sermon worker lease ownership was lost")

    def release_lease(self, lease: Lease) -> None:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE "sermonWorkerLease"
                SET "leaseOwner" = NULL, "evaluationId" = NULL,
                    "evaluationAttemptId" = NULL, "leaseExpiresAt" = NULL,
                    "heartbeatAt" = NOW(), "updatedAt" = NOW()
                WHERE "slotId" = %s AND "leaseOwner" = %s
                  AND "evaluationId" = %s AND "evaluationAttemptId" = %s
                """,
                (
                    lease.slot_id,
                    lease.lease_owner,
                    lease.evaluation_id,
                    lease.evaluation_attempt_id,
                ),
            )

    @staticmethod
    def _lock_owned_evaluation(cursor: Any, lease: Lease) -> Optional[dict[str, Any]]:
        """Lock an evaluation only when this exact live lease owns its attempt."""

        cursor.execute(
            """
            SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))
            """,
            (f"sermon-evaluation:{lease.evaluation_id}",),
        )
        cursor.execute(
            """
            SELECT evaluation."status"::text, evaluation."version",
                   evaluation."cancelRequestedAt",
                   evaluation."fingerprintId", evaluation."audioAssetId"
            FROM "sermonEvaluation" evaluation
            JOIN "sermonEvaluationAttempt" attempt
              ON attempt."evaluationId" = evaluation."id"
            JOIN "sermonWorkerLease" lease
              ON lease."evaluationId" = evaluation."id"
             AND lease."evaluationAttemptId" = attempt."id"
            WHERE evaluation."id" = %s
              AND attempt."id" = %s
              AND attempt."endedAt" IS NULL
              AND lease."slotId" = %s
              AND lease."leaseOwner" = %s
              AND lease."leaseExpiresAt" >= NOW()
            FOR UPDATE OF evaluation, attempt, lease
            """,
            (
                lease.evaluation_id,
                lease.evaluation_attempt_id,
                lease.slot_id,
                lease.lease_owner,
            ),
        )
        return cursor.fetchone()

    def compare_and_set_status(
        self,
        *,
        evaluation_id: str,
        expected_status: EvaluationStatus,
        expected_version: int,
        target_status: EvaluationStatus,
        result_patch: Optional[Mapping[str, Any]] = None,
        lease: Lease,
    ) -> int:
        validate_transition(expected_status, target_status)
        if evaluation_id != lease.evaluation_id:
            raise LeaseLost("Stage transition lease targets another evaluation")
        with self.pool.connection() as connection, connection.cursor() as cursor:
            owned = self._lock_owned_evaluation(cursor, lease)
            if owned is not None and owned["cancelRequestedAt"] is not None:
                raise EvaluationCanceled("Evaluation cancellation was requested")
            if (
                owned is None
                or owned["status"] != expected_status.value
                or owned["version"] != expected_version
            ):
                raise LeaseLost(
                    "Stage transition no longer owns the expected evaluation"
                )
            cursor.execute(
                """
                UPDATE "sermonEvaluation"
                SET "status" = %s::"SermonEvaluationStatus",
                    "version" = "version" + 1,
                    "result" = COALESCE("result", '{}'::jsonb) || %s::jsonb,
                    "updatedAt" = NOW()
                WHERE "id" = %s AND "status" = %s::"SermonEvaluationStatus"
                  AND "version" = %s AND "cancelRequestedAt" IS NULL
                RETURNING "version"
                """,
                (
                    target_status.value,
                    Jsonb(dict(result_patch or {})),
                    evaluation_id,
                    expected_status.value,
                    expected_version,
                ),
            )
            row = cursor.fetchone()
        if row is None:
            raise CompareAndSetConflict(
                "Evaluation changed status, version, or cancellation state"
            )
        return row["version"]

    def save_stage_output(
        self,
        evaluation_id: str,
        stage_key: str,
        value: Any,
        *,
        lease: Lease,
    ) -> None:
        if evaluation_id != lease.evaluation_id:
            raise LeaseLost("Stage output lease targets another evaluation")
        with self.pool.connection() as connection, connection.cursor() as cursor:
            owned = self._lock_owned_evaluation(cursor, lease)
            if owned is None:
                raise LeaseLost("Stage output no longer owns a live lease")
            if owned["cancelRequestedAt"] is not None:
                raise EvaluationCanceled("Evaluation cancellation was requested")
            cursor.execute(
                """
                UPDATE "sermonEvaluation"
                SET "result" = jsonb_set(
                    COALESCE("result", '{}'::jsonb),
                    ARRAY[%s]::text[], %s::jsonb, true
                ), "updatedAt" = NOW()
                WHERE "id" = %s AND "cancelRequestedAt" IS NULL
                  AND "status" = %s::"SermonEvaluationStatus"
                  AND "version" = %s
                """,
                (
                    stage_key,
                    Jsonb(value),
                    evaluation_id,
                    owned["status"],
                    owned["version"],
                ),
            )
            if cursor.rowcount != 1:
                raise CompareAndSetConflict("Stage output could not be persisted")

    def is_canceled(self, evaluation_id: str) -> bool:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                'SELECT "cancelRequestedAt" IS NOT NULL AS canceled '
                'FROM "sermonEvaluation" WHERE "id" = %s',
                (evaluation_id,),
            )
            row = cursor.fetchone()
            return row is None or bool(row["canceled"])

    def verify_audio(
        self,
        job: EvaluationJob,
        *,
        verified_sha256: str,
        duration_seconds: float,
        byte_size: int,
        lease: Lease,
    ) -> None:
        if job.id != lease.evaluation_id:
            raise LeaseLost("Audio verification lease targets another evaluation")
        canonical_evaluation_id: Optional[str] = None
        with self.pool.connection() as connection, connection.cursor() as cursor:
            owned = self._lock_owned_evaluation(cursor, lease)
            if owned is None:
                raise LeaseLost("Audio verification no longer owns a live lease")
            if owned["cancelRequestedAt"] is not None:
                raise EvaluationCanceled("Evaluation cancellation was requested")
            if verified_sha256 != job.claimed_sha256:
                cursor.execute(
                    """
                    SELECT e."id"
                    FROM "sermonAudioFingerprint" f
                    LEFT JOIN LATERAL (
                        SELECT "id" FROM "sermonEvaluation"
                        WHERE "fingerprintId" = f."id"
                          AND "status" IN ('COMPLETE', 'COMPLETE_WITH_WARNINGS')
                        ORDER BY "createdAt" DESC LIMIT 1
                    ) e ON TRUE
                    WHERE f."ownerId" = %s AND f."sha256" = %s
                      AND f."verificationState" = 'VERIFIED'
                    """,
                    (job.owner_id, verified_sha256),
                )
                canonical = cursor.fetchone()
                canonical_evaluation_id = canonical["id"] if canonical else None
            else:
                cursor.execute(
                    """
                    UPDATE "sermonAudioFingerprint"
                    SET "verificationState" = 'VERIFIED', "verifiedAt" = NOW(),
                        "lastSeenAt" = NOW()
                    WHERE "id" = %s
                    """,
                    (job.fingerprint_id,),
                )
                cursor.execute(
                    """
                    UPDATE "sermonAudioAsset"
                    SET "verificationState" = 'VERIFIED', "verifiedAt" = NOW(),
                        "durationSeconds" = %s, "byteSize" = %s, "updatedAt" = NOW()
                    WHERE "id" = %s
                    """,
                    (duration_seconds, byte_size, job.audio_asset_id),
                )
        if verified_sha256 != job.claimed_sha256:
            raise AudioHashMismatch(
                canonical_evaluation_id=canonical_evaluation_id
            )

    def consume_run_credits(self, evaluation_id: str, *, lease: Lease) -> None:
        """Move a single evaluation reservation to consumed exactly once."""

        if evaluation_id != lease.evaluation_id:
            raise LeaseLost("Run-credit lease targets another evaluation")
        with self.pool.connection() as connection, connection.cursor() as cursor:
            owned = self._lock_owned_evaluation(cursor, lease)
            if owned is None:
                raise LeaseLost("Run-credit consumption lost its worker lease")
            if owned["cancelRequestedAt"] is not None:
                raise EvaluationCanceled("Evaluation cancellation was requested")
            cursor.execute(
                """
                SELECT r."id", r."fingerprintId", r."requestedCredits", r."state"::text
                FROM "sermonRunCreditReservation" r
                WHERE r."evaluationId" = %s
                FOR UPDATE
                """,
                (evaluation_id,),
            )
            reservation = cursor.fetchone()
            if reservation is None:
                raise PersistenceError("Run-credit reservation is missing")
            if reservation["state"] == "CONSUMED":
                return
            if reservation["state"] != "RESERVED":
                raise PersistenceError("Run-credit reservation is not consumable")
            cursor.execute(
                """
                UPDATE "sermonAudioFingerprint"
                SET "runCreditsReserved" = "runCreditsReserved" - %s,
                    "runCreditsConsumed" = "runCreditsConsumed" + %s,
                    "lastSeenAt" = NOW()
                WHERE "id" = %s
                  AND "runCreditsReserved" >= %s
                  AND "runCreditsConsumed" + %s <= "runCreditsLimit"
                """,
                (
                    reservation["requestedCredits"],
                    reservation["requestedCredits"],
                    reservation["fingerprintId"],
                    reservation["requestedCredits"],
                    reservation["requestedCredits"],
                ),
            )
            if cursor.rowcount != 1:
                raise PersistenceError("Run-credit invariant rejected consumption")
            cursor.execute(
                """
                UPDATE "sermonRunCreditReservation"
                SET "state" = 'CONSUMED', "consumedAt" = NOW(), "updatedAt" = NOW()
                WHERE "id" = %s AND "state" = 'RESERVED'
                """,
                (reservation["id"],),
            )

    @staticmethod
    def _release_reserved_run_credits(
        cursor: Any, evaluation_id: str, reason: str
    ) -> bool:
        if reason not in {
            "AUDIO_VERIFICATION_FAILED",
            "CANCELED_BEFORE_SCORING",
        }:
            raise ValueError(
                "Reserved credits may only be released for invalid audio or "
                "pre-scoring cancellation"
            )
        cursor.execute(
            """
            SELECT "id", "fingerprintId", "requestedCredits"
            FROM "sermonRunCreditReservation"
            WHERE "evaluationId" = %s AND "state" = 'RESERVED'
            FOR UPDATE
            """,
            (evaluation_id,),
        )
        reservation = cursor.fetchone()
        if reservation is None:
            return False
        cursor.execute(
            """
            UPDATE "sermonAudioFingerprint"
            SET "runCreditsReserved" = "runCreditsReserved" - %s,
                "lastSeenAt" = NOW()
            WHERE "id" = %s AND "runCreditsReserved" >= %s
            """,
            (
                reservation["requestedCredits"],
                reservation["fingerprintId"],
                reservation["requestedCredits"],
            ),
        )
        if cursor.rowcount != 1:
            raise PersistenceError("Run-credit invariant rejected release")
        cursor.execute(
            """
            UPDATE "sermonRunCreditReservation"
            SET "state" = 'RELEASED', "releasedAt" = NOW(),
                "releaseReason" = %s, "updatedAt" = NOW()
            WHERE "id" = %s AND "state" = 'RESERVED'
            """,
            (reason, reservation["id"]),
        )
        if cursor.rowcount != 1:
            raise CompareAndSetConflict(
                "Run-credit reservation changed during release"
            )
        return True

    def release_run_credits(self, evaluation_id: str, reason: str) -> None:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            self._release_reserved_run_credits(cursor, evaluation_id, reason)

    # ScoringPersistence implementation
    def prepare_scoring_runs(
        self,
        evaluation_id: str,
        requested_runs: int,
        *,
        lease: Lease,
    ) -> None:
        if evaluation_id != lease.evaluation_id:
            raise LeaseLost("Scoring preparation lease targets another evaluation")
        with self.pool.connection() as connection, connection.cursor() as cursor:
            if self._lock_owned_evaluation(cursor, lease) is None:
                raise LeaseLost("Scoring preparation lost its worker lease")
            for ordinal in range(1, requested_runs + 1):
                cursor.execute(
                    """
                    INSERT INTO "sermonScoringRun"
                        ("id", "evaluationId", "ordinal", "updatedAt")
                    VALUES (%s, %s, %s, NOW())
                    ON CONFLICT ("evaluationId", "ordinal") DO NOTHING
                    """,
                    (_new_id(), evaluation_id, ordinal),
                )

    def record_attempt_started(
        self, evaluation_id: str, spec: AttemptSpec, *, lease: Lease
    ) -> None:
        if evaluation_id != lease.evaluation_id:
            raise LeaseLost("Scoring attempt lease targets another evaluation")
        with self.pool.connection() as connection, connection.cursor() as cursor:
            if self._lock_owned_evaluation(cursor, lease) is None:
                raise LeaseLost("Scoring attempt start lost its worker lease")
            cursor.execute(
                """
                SELECT "id" FROM "sermonScoringRun"
                WHERE "evaluationId" = %s AND "ordinal" = %s
                """,
                (evaluation_id, spec.ordinal),
            )
            run = cursor.fetchone()
            if run is None:
                raise PersistenceError("Scoring run was not prepared")
            cursor.execute(
                """
                INSERT INTO "sermonScoringAttempt"
                    ("id", "evaluationId", "scoringRunId", "attemptNumber",
                     "seed", "status", "startedAt", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, 'RUNNING', NOW(), NOW())
                ON CONFLICT ("scoringRunId", "attemptNumber") DO NOTHING
                """,
                (
                    _new_id(),
                    evaluation_id,
                    run["id"],
                    spec.attempt_number,
                    spec.seed,
                ),
            )
            cursor.execute(
                """
                UPDATE "sermonScoringRun"
                SET "status" = 'RUNNING', "startedAt" = COALESCE("startedAt", NOW()),
                    "updatedAt" = NOW()
                WHERE "id" = %s AND "status" <> 'SUCCEEDED'
                """,
                (run["id"],),
            )
            cursor.execute(
                """
                UPDATE "sermonEvaluation"
                SET "retryWave" = GREATEST("retryWave", %s), "updatedAt" = NOW()
                WHERE "id" = %s
                """,
                (spec.retry_wave, evaluation_id),
            )

    def record_attempt_result(
        self, evaluation_id: str, result: AttemptResult, *, lease: Lease
    ) -> None:
        if evaluation_id != lease.evaluation_id:
            raise LeaseLost("Scoring result lease targets another evaluation")
        status = "SUCCEEDED" if result.succeeded else "FAILED"
        value = result.value
        structured = (
            value.model_dump(mode="json") if hasattr(value, "model_dump") else value
        )
        metadata = getattr(value, "provider_metadata", None)
        response_id = getattr(metadata, "response_id", None)
        model_version = getattr(metadata, "model_version", None)
        error_code = (
            getattr(result.error, "code", result.error.__class__.__name__)
            if result.error
            else None
        )
        error_message = str(result.error)[:1000] if result.error else None
        with self.pool.connection() as connection, connection.cursor() as cursor:
            if self._lock_owned_evaluation(cursor, lease) is None:
                raise LeaseLost("Scoring result lost its worker lease")
            cursor.execute(
                """
                UPDATE "sermonScoringAttempt" attempt
                SET "status" = %s::"SermonScoringAttemptStatus",
                    "providerResponseId" = %s, "providerModelVersion" = %s,
                    "structuredResult" = %s::jsonb, "errorCode" = %s,
                    "errorMessage" = %s, "completedAt" = NOW(), "updatedAt" = NOW()
                FROM "sermonScoringRun" run
                WHERE attempt."scoringRunId" = run."id"
                  AND attempt."evaluationId" = %s
                  AND run."ordinal" = %s
                  AND attempt."attemptNumber" = %s
                """,
                (
                    status,
                    response_id,
                    model_version,
                    Jsonb(structured) if structured is not None else None,
                    error_code,
                    error_message,
                    evaluation_id,
                    result.spec.ordinal,
                    result.spec.attempt_number,
                ),
            )
            if result.succeeded:
                confidence = getattr(value, "Scoring_Confidence", None)
                cursor.execute(
                    """
                    UPDATE "sermonScoringRun"
                    SET "status" = 'SUCCEEDED', "finalSeed" = %s,
                        "rawScore" = %s::jsonb, "confidence" = %s,
                        "completedAt" = NOW(), "updatedAt" = NOW()
                    WHERE "evaluationId" = %s AND "ordinal" = %s
                    """,
                    (
                        result.spec.seed,
                        Jsonb(structured),
                        confidence,
                        evaluation_id,
                        result.spec.ordinal,
                    ),
                )
            elif result.spec.attempt_number == 3:
                cursor.execute(
                    """
                    UPDATE "sermonScoringRun"
                    SET "status" = 'FAILED', "completedAt" = NOW(), "updatedAt" = NOW()
                    WHERE "evaluationId" = %s AND "ordinal" = %s
                      AND "status" <> 'SUCCEEDED'
                    """,
                    (evaluation_id, result.spec.ordinal),
                )

    def existing_attempt_seeds(self, evaluation_id: str) -> set[int]:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                'SELECT "seed" FROM "sermonScoringAttempt" WHERE "evaluationId" = %s',
                (evaluation_id,),
            )
            return {row["seed"] for row in cursor.fetchall()}

    def scoring_resume_state(
        self, evaluation_id: str
    ) -> tuple[dict[int, Any], dict[int, int], set[int]]:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT run."ordinal", run."rawScore",
                       COALESCE(MAX(attempt."attemptNumber"), 0) AS attempts
                FROM "sermonScoringRun" run
                LEFT JOIN "sermonScoringAttempt" attempt
                  ON attempt."scoringRunId" = run."id"
                WHERE run."evaluationId" = %s
                GROUP BY run."ordinal", run."rawScore"
                ORDER BY run."ordinal"
                """,
                (evaluation_id,),
            )
            rows = cursor.fetchall()
            cursor.execute(
                'SELECT "seed" FROM "sermonScoringAttempt" WHERE "evaluationId" = %s',
                (evaluation_id,),
            )
            seeds = {row["seed"] for row in cursor.fetchall()}
        values = {
            row["ordinal"]: row["rawScore"]
            for row in rows
            if row["rawScore"] is not None
        }
        attempt_counts = {row["ordinal"]: row["attempts"] for row in rows}
        return values, attempt_counts, seeds

    def finish(
        self,
        *,
        evaluation_id: str,
        status: EvaluationStatus,
        completed_runs: int,
        result: Mapping[str, Any],
        provenance: Mapping[str, Any],
        warning_codes: list[str],
        evaluation_attempt_id: str,
        lease: Lease,
        reports: Mapping[str, bytes],
        report_version: int,
    ) -> None:
        if status not in {
            EvaluationStatus.COMPLETE,
            EvaluationStatus.COMPLETE_WITH_WARNINGS,
        }:
            raise ValueError("finish requires a successful terminal status")
        if (
            evaluation_id != lease.evaluation_id
            or evaluation_attempt_id != lease.evaluation_attempt_id
        ):
            raise CompareAndSetConflict(
                "Final publication lease does not match its evaluation attempt"
            )
        if set(reports) != {"MARKDOWN", "JSON", "CSV"}:
            raise ValueError(
                "Final publication requires Markdown, JSON, and CSV reports"
            )
        report_checksums = {
            format_name: hashlib.sha256(content).hexdigest()
            for format_name, content in reports.items()
        }
        summary = result.get("scoring", {}).get("Aggregated_Summary", {})
        with self.pool.connection() as connection, connection.cursor() as cursor:
            owned = self._lock_owned_evaluation(cursor, lease)
            if owned is not None and owned["cancelRequestedAt"] is not None:
                raise EvaluationCanceled("Evaluation cancellation was requested")
            if (
                owned is None
                or owned["status"] != EvaluationStatus.SUMMARIZING.value
                or evaluation_attempt_id != lease.evaluation_attempt_id
            ):
                raise CompareAndSetConflict(
                    "Final publication no longer owns the active lease"
                )
            cursor.execute(
                """
                UPDATE "sermonEvaluation"
                SET "status" = %s::"SermonEvaluationStatus",
                    "completedRuns" = %s, "result" = %s::jsonb,
                    "provenance" = %s::jsonb, "warningCodes" = %s,
                    "overallImpactBase" = %s,
                    "calculatedDurationPenalty" = %s,
                    "overallImpactAdjusted" = %s,
                    "completedAt" = NOW(), "updatedAt" = NOW(),
                    "version" = "version" + 1
                WHERE "id" = %s AND "status" = 'SUMMARIZING'
                  AND "version" = %s
                  AND "cancelRequestedAt" IS NULL
                """,
                (
                    status.value,
                    completed_runs,
                    Jsonb(dict(result)),
                    Jsonb(dict(provenance)),
                    warning_codes,
                    summary.get("Overall_Impact_Base"),
                    summary.get("duration_penalty"),
                    summary.get("Overall_Impact_Adjusted"),
                    evaluation_id,
                    owned["version"],
                ),
            )
            if cursor.rowcount != 1:
                raise CompareAndSetConflict("Final publication lost its CAS")
            for format_name, content in reports.items():
                cursor.execute(
                    """
                    INSERT INTO "sermonReportArtifact"
                        ("id", "evaluationId", "format", "content", "checksum",
                         "reportVersion")
                    VALUES (%s, %s, %s::"SermonReportFormat", %s, %s, %s)
                    ON CONFLICT ("evaluationId", "format", "reportVersion")
                    DO NOTHING
                    """,
                    (
                        _new_id(),
                        evaluation_id,
                        format_name,
                        content,
                        report_checksums[format_name],
                        report_version,
                    ),
                )
            cursor.execute(
                """
                SELECT "format"::text, "checksum"
                FROM "sermonReportArtifact"
                WHERE "evaluationId" = %s AND "reportVersion" = %s
                """,
                (evaluation_id, report_version),
            )
            persisted_reports = {
                row["format"]: row["checksum"].strip()
                for row in cursor.fetchall()
            }
            if persisted_reports != report_checksums:
                raise CompareAndSetConflict(
                    "Final report artifacts conflict with immutable publication"
                )
            cursor.execute(
                """
                UPDATE "sermonEvaluationAttempt"
                SET "terminalOutcome" = %s::"SermonEvaluationAttemptOutcome",
                    "endedAt" = NOW(), "updatedAt" = NOW()
                WHERE "id" = %s AND "endedAt" IS NULL
                """,
                (status.value, evaluation_attempt_id),
            )
            if cursor.rowcount != 1:
                raise CompareAndSetConflict(
                    "Final publication lost its active attempt"
                )

    def mark_terminal(
        self,
        *,
        evaluation_id: str,
        evaluation_attempt_id: str,
        status: EvaluationStatus,
        error_code: Optional[str],
        error_message: Optional[str],
        lease: Lease,
        release_credit_reason: Optional[str] = None,
        rejected_audio_asset_id: Optional[str] = None,
        rejected_fingerprint_id: Optional[str] = None,
        canonical_evaluation_id: Optional[str] = None,
    ) -> bool:
        if status not in {
            EvaluationStatus.FAILED,
            EvaluationStatus.TIMED_OUT,
            EvaluationStatus.CANCELED,
        }:
            raise ValueError("mark_terminal requires a failure terminal status")
        if (
            evaluation_id != lease.evaluation_id
            or evaluation_attempt_id != lease.evaluation_attempt_id
        ):
            return False
        if (rejected_audio_asset_id is None) != (
            rejected_fingerprint_id is None
        ):
            raise ValueError(
                "Rejected audio asset and fingerprint IDs must be provided together"
            )
        if rejected_audio_asset_id is not None and (
            status != EvaluationStatus.FAILED
            or release_credit_reason != "AUDIO_VERIFICATION_FAILED"
        ):
            raise ValueError(
                "Rejected audio requires a failed terminal transition with "
                "atomic reserved-credit release"
            )
        with self.pool.connection() as connection, connection.cursor() as cursor:
            owned = self._lock_owned_evaluation(cursor, lease)
            if (
                owned is None
                or evaluation_attempt_id != lease.evaluation_attempt_id
                or owned["status"]
                not in {
                    EvaluationStatus.QUEUED.value,
                    EvaluationStatus.PREPARING_AUDIO.value,
                    EvaluationStatus.EXTRACTING.value,
                    EvaluationStatus.SCORING.value,
                    EvaluationStatus.HARMONIZING.value,
                    EvaluationStatus.CALIBRATING.value,
                    EvaluationStatus.SUMMARIZING.value,
                }
            ):
                return False
            if rejected_audio_asset_id is not None and (
                owned["audioAssetId"] != rejected_audio_asset_id
                or owned["fingerprintId"] != rejected_fingerprint_id
            ):
                raise CompareAndSetConflict(
                    "Rejected audio no longer belongs to the leased evaluation"
                )
            cursor.execute(
                """
                UPDATE "sermonEvaluation"
                SET "status" = %s::"SermonEvaluationStatus",
                    "errorCode" = %s, "errorMessage" = %s,
                    "canceledAt" = CASE WHEN %s = 'CANCELED' THEN NOW() ELSE "canceledAt" END,
                    "result" = CASE
                      WHEN %s::text IS NULL THEN "result"
                      ELSE COALESCE("result", '{}'::jsonb)
                           || jsonb_build_object(
                                'canonicalEvaluationId', %s::text
                              )
                    END,
                    "updatedAt" = NOW(), "version" = "version" + 1
                WHERE "id" = %s
                  AND "status" = %s::"SermonEvaluationStatus"
                  AND "version" = %s
                """,
                (
                    status.value,
                    error_code,
                    (error_message or "")[:1000],
                    status.value,
                    canonical_evaluation_id,
                    canonical_evaluation_id,
                    evaluation_id,
                    owned["status"],
                    owned["version"],
                ),
            )
            if cursor.rowcount != 1:
                return False
            released_reserved_credits = False
            if release_credit_reason is not None:
                released_reserved_credits = self._release_reserved_run_credits(
                    cursor, evaluation_id, release_credit_reason
                )
            if rejected_audio_asset_id is not None:
                if not released_reserved_credits:
                    raise CompareAndSetConflict(
                        "Rejected audio terminal transition requires reserved credits"
                    )
                cursor.execute(
                    """
                    UPDATE "sermonAudioFingerprint"
                    SET "verificationState" = 'REJECTED',
                        "lastSeenAt" = NOW()
                    WHERE "id" = %s
                      AND "verificationState" = 'PROVISIONAL'
                    """,
                    (rejected_fingerprint_id,),
                )
                if cursor.rowcount != 1:
                    raise CompareAndSetConflict(
                        "Fingerprint rejection lost its provisional state"
                    )
                cursor.execute(
                    """
                    UPDATE "sermonAudioAsset"
                    SET "verificationState" = 'REJECTED',
                        "updatedAt" = NOW()
                    WHERE "id" = %s
                      AND "verificationState" = 'PENDING'
                    """,
                    (rejected_audio_asset_id,),
                )
                if cursor.rowcount != 1:
                    raise CompareAndSetConflict(
                        "Audio asset rejection lost its pending state"
                    )
            cursor.execute(
                """
                UPDATE "sermonEvaluationAttempt"
                SET "terminalOutcome" = %s::"SermonEvaluationAttemptOutcome",
                    "endedAt" = NOW(), "updatedAt" = NOW()
                WHERE "id" = %s AND "endedAt" IS NULL
                """,
                (status.value, evaluation_attempt_id),
            )
            if cursor.rowcount != 1:
                raise CompareAndSetConflict(
                    "Terminal transition lost its active attempt"
                )
            return True

    def mark_unleased_attempt_timed_out(
        self,
        *,
        evaluation_id: str,
        evaluation_attempt_id: str,
        hard_deadline: datetime,
        error_message: str,
    ) -> bool:
        """Close a soft-expired attempt only when no live worker owns it."""

        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))
                """,
                (f"sermon-evaluation:{evaluation_id}",),
            )
            cursor.execute(
                """
                SELECT evaluation."status"::text, evaluation."version"
                FROM "sermonEvaluation" evaluation
                JOIN "sermonEvaluationAttempt" attempt
                  ON attempt."evaluationId" = evaluation."id"
                WHERE evaluation."id" = %s
                  AND attempt."id" = %s
                  AND attempt."endedAt" IS NULL
                  AND attempt."deadlineAt" = %s
                  AND attempt."deadlineAt" <= NOW() + INTERVAL '60 seconds'
                  AND NOT EXISTS (
                    SELECT 1 FROM "sermonWorkerLease" lease
                    WHERE lease."evaluationId" = evaluation."id"
                      AND lease."leaseExpiresAt" >= NOW()
                  )
                  AND evaluation."status" IN (
                    'QUEUED', 'PREPARING_AUDIO', 'EXTRACTING', 'SCORING',
                    'HARMONIZING', 'CALIBRATING', 'SUMMARIZING'
                  )
                FOR UPDATE OF evaluation, attempt
                """,
                (evaluation_id, evaluation_attempt_id, hard_deadline),
            )
            current = cursor.fetchone()
            if current is None:
                return False
            cursor.execute(
                """
                UPDATE "sermonEvaluation"
                SET "status" = 'TIMED_OUT',
                    "errorCode" = 'EVALUATION_DEADLINE_EXCEEDED',
                    "errorMessage" = %s,
                    "updatedAt" = NOW(), "version" = "version" + 1
                WHERE "id" = %s
                  AND "status" = %s::"SermonEvaluationStatus"
                  AND "version" = %s
                """,
                (
                    error_message[:1000],
                    evaluation_id,
                    current["status"],
                    current["version"],
                ),
            )
            if cursor.rowcount != 1:
                return False
            cursor.execute(
                """
                UPDATE "sermonEvaluationAttempt"
                SET "terminalOutcome" = 'TIMED_OUT',
                    "endedAt" = NOW(), "updatedAt" = NOW()
                WHERE "id" = %s AND "endedAt" IS NULL
                """,
                (evaluation_attempt_id,),
            )
            return cursor.rowcount == 1

    def fetch_completed_report_state(self, evaluation_id: str) -> dict[str, Any]:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT evaluation."id", evaluation."title",
                       evaluation."status"::text,
                       evaluation."requestedRuns", evaluation."completedRuns",
                       evaluation."durationAdjustmentEnabled",
                       evaluation."durationPolicyUpdatedAt",
                       evaluation."preachedOn", evaluation."result",
                       evaluation."provenance",
                       preacher."displayName" AS "preacherName"
                FROM "sermonEvaluation" evaluation
                JOIN "sermonPreacher" preacher
                  ON preacher."id" = evaluation."preacherId"
                WHERE evaluation."id" = %s AND evaluation."deletedAt" IS NULL
                  AND evaluation."status" IN ('COMPLETE', 'COMPLETE_WITH_WARNINGS')
                """,
                (evaluation_id,),
            )
            row = cursor.fetchone()
        if row is None:
            raise PersistenceError(
                "Only completed evaluations can regenerate reports"
            )
        return {
            "evaluationId": row["id"],
            "title": row["title"],
            "status": row["status"],
            "requestedRuns": row["requestedRuns"],
            "completedRuns": row["completedRuns"],
            "durationAdjustmentEnabled": row["durationAdjustmentEnabled"],
            "durationPolicyUpdatedAt": row["durationPolicyUpdatedAt"],
            "preachedOn": row["preachedOn"],
            "preacherName": row["preacherName"],
            "result": row["result"] or {},
            "provenance": row["provenance"] or {},
        }

    def publish_report_set(
        self,
        evaluation_id: str,
        reports: Mapping[str, bytes],
        *,
        expected_duration_adjustment_enabled: bool,
        expected_duration_policy_updated_at: Optional[datetime],
    ) -> int:
        """Publish one immutable report version, idempotent by all checksums."""

        checksums = {
            format_name: hashlib.sha256(content).hexdigest()
            for format_name, content in reports.items()
        }
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT "id" FROM "sermonEvaluation"
                WHERE "id" = %s
                  AND "status" IN ('COMPLETE', 'COMPLETE_WITH_WARNINGS')
                  AND "durationAdjustmentEnabled" = %s
                  AND "durationPolicyUpdatedAt" IS NOT DISTINCT FROM %s
                FOR UPDATE
                """,
                (
                    evaluation_id,
                    expected_duration_adjustment_enabled,
                    expected_duration_policy_updated_at,
                ),
            )
            if cursor.fetchone() is None:
                raise CompareAndSetConflict(
                    "Duration policy changed during report regeneration"
                )
            cursor.execute(
                """
                SELECT COALESCE(MAX("reportVersion"), 0) AS version
                FROM "sermonReportArtifact"
                WHERE "evaluationId" = %s
                """,
                (evaluation_id,),
            )
            latest_version = cursor.fetchone()["version"]
            if latest_version:
                cursor.execute(
                    """
                    SELECT "format"::text, "checksum"
                    FROM "sermonReportArtifact"
                    WHERE "evaluationId" = %s AND "reportVersion" = %s
                    """,
                    (evaluation_id, latest_version),
                )
                latest = {
                    row["format"]: row["checksum"].strip()
                    for row in cursor.fetchall()
                }
                if latest == checksums:
                    return latest_version
            next_version = latest_version + 1
            for format_name, content in reports.items():
                cursor.execute(
                    """
                    INSERT INTO "sermonReportArtifact"
                        ("id", "evaluationId", "format", "content", "checksum",
                         "reportVersion")
                    VALUES (%s, %s, %s::"SermonReportFormat", %s, %s, %s)
                    """,
                    (
                        _new_id(),
                        evaluation_id,
                        format_name,
                        content,
                        checksums[format_name],
                        next_version,
                    ),
                )
            return next_version

    def recoverable_evaluation_ids(self, limit: int = 2) -> list[str]:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT e."id"
                FROM "sermonEvaluation" e
                WHERE e."deletedAt" IS NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM "sermonWorkerLease" lease
                    WHERE lease."evaluationId" = e."id"
                      AND lease."leaseExpiresAt" >= NOW()
                  )
                  AND (
                    e."status" = 'QUEUED'
                    OR (
                        e."status" IN (
                            'PREPARING_AUDIO', 'EXTRACTING', 'SCORING',
                            'HARMONIZING', 'CALIBRATING', 'SUMMARIZING'
                        )
                        AND e."attemptDeadlineAt" > NOW()
                    )
                  )
                ORDER BY e."createdAt"
                FOR UPDATE SKIP LOCKED
                LIMIT %s
                """,
                (limit,),
            )
            return [row["id"] for row in cursor.fetchall()]

    def timeout_expired_attempts(self) -> int:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT evaluation."id", evaluation."status"::text,
                       evaluation."version", attempt."id" AS "attemptId"
                FROM "sermonEvaluation" evaluation
                JOIN "sermonEvaluationAttempt" attempt
                  ON attempt."evaluationId" = evaluation."id"
                 AND attempt."endedAt" IS NULL
                WHERE evaluation."status" IN (
                    'QUEUED', 'PREPARING_AUDIO', 'EXTRACTING', 'SCORING',
                    'HARMONIZING', 'CALIBRATING', 'SUMMARIZING'
                )
                  AND attempt."deadlineAt" <= NOW()
                  AND NOT EXISTS (
                    SELECT 1 FROM "sermonEvaluationAttempt" newer
                    WHERE newer."evaluationId" = evaluation."id"
                      AND newer."endedAt" IS NULL
                      AND newer."attemptNumber" > attempt."attemptNumber"
                  )
                FOR UPDATE OF evaluation, attempt SKIP LOCKED
                """
            )
            expired = cursor.fetchall()
            count = 0
            for row in expired:
                cursor.execute(
                    """
                    UPDATE "sermonEvaluation"
                    SET "status" = 'TIMED_OUT',
                        "errorCode" = 'EVALUATION_DEADLINE_EXCEEDED',
                        "errorMessage" = 'The 15-minute evaluation attempt expired',
                        "updatedAt" = NOW(), "version" = "version" + 1
                    WHERE "id" = %s
                      AND "status" = %s::"SermonEvaluationStatus"
                      AND "version" = %s
                    """,
                    (row["id"], row["status"], row["version"]),
                )
                if cursor.rowcount != 1:
                    continue
                cursor.execute(
                    """
                    UPDATE "sermonEvaluationAttempt"
                    SET "terminalOutcome" = 'TIMED_OUT',
                        "endedAt" = NOW(), "updatedAt" = NOW()
                    WHERE "id" = %s AND "endedAt" IS NULL
                    """,
                    (row["attemptId"],),
                )
                cursor.execute(
                    """
                    UPDATE "sermonWorkerLease"
                    SET "leaseOwner" = NULL, "evaluationId" = NULL,
                        "evaluationAttemptId" = NULL, "leaseExpiresAt" = NULL,
                        "heartbeatAt" = NOW(), "updatedAt" = NOW()
                    WHERE "evaluationId" = %s
                      AND "evaluationAttemptId" = %s
                    """,
                    (row["id"], row["attemptId"]),
                )
                count += 1
            return count

    def expired_prepared_uploads(self, limit: int = 10) -> list[dict[str, Any]]:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT reservation."id", reservation."ownerId",
                       reservation."appwriteBucketId",
                       reservation."appwriteFileId",
                       reservation."expiresAt"
                FROM "sermonUploadReservation" reservation
                WHERE reservation."state" = 'PREPARED'
                  AND reservation."expiresAt" <= NOW()
                  AND NOT EXISTS (
                    SELECT 1 FROM "sermonAudioAsset" asset
                    WHERE asset."appwriteBucketId" =
                            reservation."appwriteBucketId"
                      AND asset."appwriteFileId" =
                            reservation."appwriteFileId"
                      AND asset."verificationState" <> 'DELETED'
                  )
                ORDER BY reservation."expiresAt"
                LIMIT %s
                """,
                (limit,),
            )
            return list(cursor.fetchall())

    def expire_prepared_upload(
        self,
        *,
        reservation_id: str,
        owner_id: str,
        bucket_id: str,
        file_id: str,
    ) -> bool:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE "sermonUploadReservation"
                SET "state" = 'EXPIRED', "updatedAt" = NOW()
                WHERE "id" = %s AND "ownerId" = %s
                  AND "state" = 'PREPARED' AND "expiresAt" <= NOW()
                  AND "appwriteBucketId" = %s AND "appwriteFileId" = %s
                  AND NOT EXISTS (
                    SELECT 1 FROM "sermonAudioAsset" asset
                    WHERE asset."appwriteBucketId" = %s
                      AND asset."appwriteFileId" = %s
                      AND asset."verificationState" <> 'DELETED'
                  )
                """,
                (
                    reservation_id,
                    owner_id,
                    bucket_id,
                    file_id,
                    bucket_id,
                    file_id,
                ),
            )
            return cursor.rowcount == 1

    def expired_finalized_pending_assets(
        self, limit: int = 10
    ) -> list[dict[str, Any]]:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT reservation."id" AS "reservationId",
                       reservation."ownerId",
                       reservation."appwriteBucketId",
                       reservation."appwriteFileId",
                       asset."id" AS "assetId"
                FROM "sermonUploadReservation" reservation
                JOIN "sermonAudioFingerprint" fingerprint
                  ON fingerprint."id" = reservation."fingerprintId"
                 AND fingerprint."ownerId" = reservation."ownerId"
                JOIN "sermonAudioAsset" asset
                  ON asset."fingerprintId" = fingerprint."id"
                 AND asset."appwriteBucketId" =
                        reservation."appwriteBucketId"
                 AND asset."appwriteFileId" =
                        reservation."appwriteFileId"
                WHERE reservation."state" = 'FINALIZED'
                  AND reservation."expiresAt" <= NOW()
                  AND asset."verificationState" = 'PENDING'
                  AND asset."referenceCount" = 0
                  AND NOT EXISTS (
                    SELECT 1 FROM "sermonEvaluation" evaluation
                    WHERE evaluation."audioAssetId" = asset."id"
                      AND evaluation."deletedAt" IS NULL
                  )
                ORDER BY reservation."expiresAt"
                LIMIT %s
                """,
                (limit,),
            )
            return list(cursor.fetchall())

    def expire_finalized_pending_asset(
        self,
        *,
        reservation_id: str,
        owner_id: str,
        asset_id: str,
        bucket_id: str,
        file_id: str,
    ) -> bool:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT reservation."id"
                FROM "sermonUploadReservation" reservation
                JOIN "sermonAudioFingerprint" fingerprint
                  ON fingerprint."id" = reservation."fingerprintId"
                 AND fingerprint."ownerId" = reservation."ownerId"
                JOIN "sermonAudioAsset" asset
                  ON asset."fingerprintId" = fingerprint."id"
                WHERE reservation."id" = %s
                  AND reservation."ownerId" = %s
                  AND reservation."state" = 'FINALIZED'
                  AND reservation."expiresAt" <= NOW()
                  AND reservation."appwriteBucketId" = %s
                  AND reservation."appwriteFileId" = %s
                  AND asset."id" = %s
                  AND asset."verificationState" = 'PENDING'
                  AND asset."referenceCount" = 0
                  AND asset."appwriteBucketId" = %s
                  AND asset."appwriteFileId" = %s
                  AND NOT EXISTS (
                    SELECT 1 FROM "sermonEvaluation" evaluation
                    WHERE evaluation."audioAssetId" = asset."id"
                      AND evaluation."deletedAt" IS NULL
                  )
                FOR UPDATE OF reservation, asset
                """,
                (
                    reservation_id,
                    owner_id,
                    bucket_id,
                    file_id,
                    asset_id,
                    bucket_id,
                    file_id,
                ),
            )
            if cursor.fetchone() is None:
                return False
            cursor.execute(
                """
                UPDATE "sermonAudioAsset"
                SET "verificationState" = 'DELETED',
                    "appwriteBucketId" = NULL, "appwriteFileId" = NULL,
                    "deletedAt" = NOW(), "updatedAt" = NOW()
                WHERE "id" = %s AND "verificationState" = 'PENDING'
                  AND "referenceCount" = 0
                  AND "appwriteBucketId" = %s AND "appwriteFileId" = %s
                """,
                (asset_id, bucket_id, file_id),
            )
            if cursor.rowcount != 1:
                raise CompareAndSetConflict(
                    "Pending audio asset changed during expiry cleanup"
                )
            cursor.execute(
                """
                UPDATE "sermonUploadReservation"
                SET "state" = 'EXPIRED', "updatedAt" = NOW()
                WHERE "id" = %s AND "ownerId" = %s
                  AND "state" = 'FINALIZED' AND "expiresAt" <= NOW()
                  AND "appwriteBucketId" = %s AND "appwriteFileId" = %s
                """,
                (reservation_id, owner_id, bucket_id, file_id),
            )
            if cursor.rowcount != 1:
                raise CompareAndSetConflict(
                    "Finalized reservation changed during expiry cleanup"
                )
            return True

    def stale_duration_report_evaluation_ids(
        self, limit: int = 10
    ) -> list[str]:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT evaluation."id"
                FROM "sermonEvaluation" evaluation
                WHERE evaluation."deletedAt" IS NULL
                  AND evaluation."status" IN (
                    'COMPLETE', 'COMPLETE_WITH_WARNINGS'
                  )
                  AND evaluation."durationPolicyUpdatedAt" IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1
                    FROM "sermonReportArtifact" report
                    WHERE report."evaluationId" = evaluation."id"
                    GROUP BY report."reportVersion"
                    HAVING COUNT(DISTINCT report."format") = 3
                       AND MIN(report."createdAt") >=
                            evaluation."durationPolicyUpdatedAt"
                  )
                ORDER BY evaluation."durationPolicyUpdatedAt"
                LIMIT %s
                """,
                (limit,),
            )
            return [row["id"] for row in cursor.fetchall()]

    def rejected_audio_pointer_is_deletable(
        self, *, asset_id: str, bucket_id: str, file_id: str
    ) -> bool:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT 1
                FROM "sermonAudioAsset" asset
                WHERE asset."id" = %s
                  AND asset."verificationState" = 'REJECTED'
                  AND asset."appwriteBucketId" = %s
                  AND asset."appwriteFileId" = %s
                """,
                (asset_id, bucket_id, file_id),
            )
            return cursor.fetchone() is not None

    def pending_rejected_audio_assets(
        self, limit: int = 10
    ) -> list[dict[str, str]]:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT asset."id", asset."appwriteBucketId",
                       asset."appwriteFileId"
                FROM "sermonAudioAsset" asset
                WHERE asset."verificationState" = 'REJECTED'
                  AND asset."appwriteBucketId" IS NOT NULL
                  AND asset."appwriteFileId" IS NOT NULL
                ORDER BY asset."updatedAt"
                LIMIT %s
                """,
                (limit,),
            )
            return list(cursor.fetchall())

    def clear_rejected_audio_pointer(
        self, *, asset_id: str, bucket_id: str, file_id: str
    ) -> bool:
        """Clear a rejected asset pointer only after Storage deletion."""

        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT asset."id"
                FROM "sermonAudioAsset" asset
                WHERE asset."id" = %s
                  AND asset."verificationState" = 'REJECTED'
                  AND asset."appwriteBucketId" = %s
                  AND asset."appwriteFileId" = %s
                FOR UPDATE
                """,
                (asset_id, bucket_id, file_id),
            )
            if cursor.fetchone() is None:
                return False
            cursor.execute(
                """
                UPDATE "sermonEvaluation"
                SET "audioAssetId" = NULL, "updatedAt" = NOW()
                WHERE "audioAssetId" = %s
                """,
                (asset_id,),
            )
            cursor.execute(
                """
                UPDATE "sermonAudioAsset" asset
                SET "appwriteBucketId" = NULL, "appwriteFileId" = NULL,
                    "referenceCount" = 0, "updatedAt" = NOW()
                WHERE asset."id" = %s
                  AND asset."verificationState" = 'REJECTED'
                  AND asset."appwriteBucketId" = %s
                  AND asset."appwriteFileId" = %s
                """,
                (asset_id, bucket_id, file_id),
            )
            return cursor.rowcount == 1

    def pending_deleted_audio_assets(self, limit: int = 10) -> list[dict[str, str]]:
        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT "id", "appwriteBucketId", "appwriteFileId"
                FROM "sermonAudioAsset"
                WHERE "verificationState" = 'DELETED'
                  AND "appwriteBucketId" IS NOT NULL
                  AND "appwriteFileId" IS NOT NULL
                ORDER BY "deletedAt"
                LIMIT %s
                """,
                (limit,),
            )
            return list(cursor.fetchall())

    def clear_deleted_audio_pointer(
        self, *, asset_id: str, bucket_id: str, file_id: str
    ) -> bool:
        """Clear a soft-deleted asset pointer only after Storage deletion."""

        with self.pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE "sermonAudioAsset"
                SET "appwriteBucketId" = NULL, "appwriteFileId" = NULL,
                    "updatedAt" = NOW()
                WHERE "id" = %s AND "verificationState" = 'DELETED'
                  AND "appwriteBucketId" = %s AND "appwriteFileId" = %s
                """,
                (asset_id, bucket_id, file_id),
            )
            return cursor.rowcount == 1


class LeaseHeartbeat:
    """Heartbeat a claimed worker lease every 30 seconds."""

    def __init__(
        self,
        persistence: PsycopgPersistence,
        lease: Lease,
        *,
        interval_seconds: float = 30.0,
    ) -> None:
        self.persistence = persistence
        self.lease = lease
        self.interval_seconds = interval_seconds
        self._stop = threading.Event()
        self._lost = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def __enter__(self) -> "LeaseHeartbeat":
        self._thread.start()
        return self

    def _run(self) -> None:
        while not self._stop.wait(self.interval_seconds):
            try:
                owned = self.persistence.heartbeat_lease(self.lease)
            except Exception:
                owned = False
            if not owned:
                self._lost.set()
                self._stop.set()

    def assert_owned(self) -> None:
        if self._lost.is_set():
            raise LeaseLost("Sermon worker lease ownership was lost")
        try:
            self.persistence.assert_lease_owned(self.lease)
        except Exception as error:
            self._lost.set()
            if isinstance(error, LeaseLost):
                raise
            raise LeaseLost(
                "Sermon worker lease ownership could not be confirmed"
            ) from error

    def __exit__(self, *_: object) -> None:
        self._stop.set()
        self._thread.join(timeout=self.interval_seconds + 1)


__all__ = [
    "AudioHashMismatch",
    "CompareAndSetConflict",
    "EvaluationJob",
    "Lease",
    "LeaseHeartbeat",
    "LeaseLost",
    "LeaseUnavailable",
    "PersistenceError",
    "PsycopgPersistence",
    "get_pool",
]
