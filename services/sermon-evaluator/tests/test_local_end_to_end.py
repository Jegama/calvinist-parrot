from __future__ import annotations

import hashlib
import os
import uuid
import wave
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import pytest
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from sermon_evaluator.fixture import FixtureProvider
from sermon_evaluator.persistence import PsycopgPersistence
from sermon_evaluator.service import SermonEvaluationService
from sermon_evaluator.storage import LocalFilesystemStorage

DATABASE_URL = os.getenv("SERMON_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="Set SERMON_TEST_DATABASE_URL to run the local worker end-to-end test",
)


def _write_wav(path: Path) -> bytes:
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(8_000)
        output.writeframes(b"\x00\x00" * 8_000)
    return path.read_bytes()


def _cleanup(
    pool: ConnectionPool,
    *,
    owner_id: str,
    evaluation_id: str,
) -> None:
    with pool.connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE "sermonWorkerLease"
            SET "leaseOwner" = NULL, "evaluationId" = NULL,
                "evaluationAttemptId" = NULL, "leaseExpiresAt" = NULL,
                "heartbeatAt" = NULL, "updatedAt" = NOW()
            WHERE "evaluationId" = %s
            """,
            (evaluation_id,),
        )
        cursor.execute(
            """
            DELETE FROM "sermonRunCreditReservation"
            WHERE "evaluationId" = %s
            """,
            (evaluation_id,),
        )
        cursor.execute(
            'DELETE FROM "sermonEvaluation" WHERE "id" = %s',
            (evaluation_id,),
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


def test_local_audio_to_fixture_reports(
    tmp_path: Path,
) -> None:
    assert DATABASE_URL is not None
    pool = ConnectionPool(
        conninfo=DATABASE_URL,
        min_size=1,
        max_size=4,
        kwargs={"autocommit": False, "row_factory": dict_row},
        open=True,
    )
    pool.wait()
    suffix = uuid.uuid4().hex
    owner_id = f"local-e2e-owner-{suffix}"
    preacher_id = f"local-e2e-preacher-{suffix}"
    fingerprint_id = f"local-e2e-fingerprint-{suffix}"
    asset_id = f"local-e2e-asset-{suffix}"
    evaluation_id = f"local-e2e-evaluation-{suffix}"
    file_id = str(uuid.uuid4())
    audio_path = tmp_path / f"{file_id}.audio"
    audio_bytes = _write_wav(audio_path)
    sha256 = hashlib.sha256(audio_bytes).hexdigest()
    now = datetime.now(timezone.utc)

    try:
        with pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO "sermonPreacher"
                    ("id", "ownerId", "displayName", "normalizedName",
                     "createdAt", "updatedAt")
                VALUES (%s, %s, 'Local Fixture Pastor', %s, %s, %s)
                """,
                (preacher_id, owner_id, f"local-fixture-{suffix}", now, now),
            )
            cursor.execute(
                """
                INSERT INTO "sermonAudioFingerprint"
                    ("id", "ownerId", "sha256", "verificationState",
                     "runCreditsLimit", "runCreditsReserved",
                     "runCreditsConsumed", "firstSeenAt", "lastSeenAt")
                VALUES (%s, %s, %s, 'PROVISIONAL', 9, 1, 0, %s, %s)
                """,
                (fingerprint_id, owner_id, sha256, now, now),
            )
            cursor.execute(
                """
                INSERT INTO "sermonAudioAsset"
                    ("id", "fingerprintId", "appwriteBucketId",
                     "appwriteFileId", "originalFilename", "mimeType",
                     "byteSize", "referenceCount", "verificationState",
                     "createdAt", "updatedAt")
                VALUES (%s, %s, 'local-sermon-audio', %s, 'fixture.wav',
                        'audio/wav', %s, 1, 'PENDING', %s, %s)
                """,
                (asset_id, fingerprint_id, file_id, len(audio_bytes), now, now),
            )
            cursor.execute(
                """
                INSERT INTO "sermonEvaluation"
                    ("id", "ownerId", "preacherId", "fingerprintId",
                     "audioAssetId", "title", "preachedOn", "preset",
                     "requestedRuns", "completedRuns", "status", "version",
                     "createdAt", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, 'Local fixture evaluation',
                        %s, 'STANDARD', 1, 0, 'QUEUED', 0, %s, %s)
                """,
                (
                    evaluation_id,
                    owner_id,
                    preacher_id,
                    fingerprint_id,
                    asset_id,
                    date(2026, 7, 28),
                    now,
                    now,
                ),
            )
            cursor.execute(
                """
                INSERT INTO "sermonRunCreditReservation"
                    ("id", "fingerprintId", "evaluationId",
                     "requestedCredits", "preset", "state", "actorId",
                     "reservedAt", "createdAt", "updatedAt")
                VALUES (%s, %s, %s, 1, 'STANDARD', 'RESERVED', %s,
                        %s, %s, %s)
                """,
                (
                    f"local-e2e-credit-{suffix}",
                    fingerprint_id,
                    evaluation_id,
                    owner_id,
                    now,
                    now,
                    now,
                ),
            )

        service = SermonEvaluationService(
            persistence=PsycopgPersistence(pool=pool),
            storage=LocalFilesystemStorage(root=tmp_path),
            provider=FixtureProvider(),
            soft_deadline_seconds=120,
        )
        outcome = service.process(evaluation_id)
        assert outcome["status"] == "COMPLETE"
        assert outcome["completedRuns"] == 1

        with pool.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT evaluation."status"::text, evaluation."result",
                       fingerprint."verificationState"::text
                         AS "fingerprintState",
                       COUNT(report."id") AS "reportCount"
                FROM "sermonEvaluation" evaluation
                JOIN "sermonAudioFingerprint" fingerprint
                  ON fingerprint."id" = evaluation."fingerprintId"
                LEFT JOIN "sermonReportArtifact" report
                  ON report."evaluationId" = evaluation."id"
                WHERE evaluation."id" = %s
                GROUP BY evaluation."id", fingerprint."id"
                """,
                (evaluation_id,),
            )
            row: dict[str, Any] = cursor.fetchone()
            assert row["status"] == "COMPLETE"
            assert row["fingerprintState"] == "VERIFIED"
            assert row["reportCount"] == 3
            assert row["result"]["extraction"]["Proposition"].startswith(
                "God saves"
            )
    finally:
        _cleanup(pool, owner_id=owner_id, evaluation_id=evaluation_id)
        pool.close()
