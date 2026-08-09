"""Platform-neutral sermon evaluation service and durable worker orchestration."""

from __future__ import annotations

import hashlib
import json
import os
import socket
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Optional

from . import __version__, prompts
from .aggregation import SermonAggregator
from .audio import InvalidAudioError
from .gemini import GeminiProvider, ProviderResponseMetadata
from .fixture import FixtureProvider
from .harmonization import SermonHarmonizer
from .persistence import (
    AudioHashMismatch,
    EvaluationJob,
    Lease,
    LeaseHeartbeat,
    LeaseLost,
    LeaseUnavailable,
    PersistenceError,
    PsycopgPersistence,
)
from .reports import render_csv, render_json, render_markdown
from .rubric import RUBRIC_VERSION
from .schemas import (
    SermonExtractionStep1,
    SermonScoringStep2,
    SermonScoringStep2Raw,
)
from .stages import (
    DeadlineExceeded,
    EvaluationCanceled,
    EvaluationStatus,
    ParallelScoringCoordinator,
    SoftDeadline,
)
from .storage import AppwriteStorage, LocalFilesystemStorage

PROMPT_VERSION = "sermon-eval-2026-08-08-v2"
REPORT_VERSION = 2
SOURCE_COMMIT = "4fc02cb2da2c7c8c51ac84558bf9f592cf2d0485"


@dataclass(frozen=True)
class StructuredScoringValue:
    raw: SermonScoringStep2Raw
    provider_metadata: ProviderResponseMetadata

    @property
    def Scoring_Confidence(self) -> float:
        return self.raw.Scoring_Confidence

    def model_dump(self, **kwargs: Any) -> dict[str, Any]:
        return self.raw.model_dump(**kwargs)


class LeaseScopedScoringPersistence:
    """Assert exact worker ownership before each durable scoring mutation."""

    def __init__(
        self,
        persistence: PsycopgPersistence,
        lease: Lease,
        assert_lease_owned: Callable[[], None],
    ) -> None:
        self.persistence = persistence
        self.lease = lease
        self.assert_lease_owned = assert_lease_owned

    def prepare_scoring_runs(
        self, evaluation_id: str, requested_runs: int
    ) -> None:
        self.assert_lease_owned()
        self.persistence.prepare_scoring_runs(
            evaluation_id, requested_runs, lease=self.lease
        )

    def record_attempt_started(self, evaluation_id: str, spec: Any) -> None:
        self.assert_lease_owned()
        self.persistence.record_attempt_started(
            evaluation_id, spec, lease=self.lease
        )

    def record_attempt_result(self, evaluation_id: str, result: Any) -> None:
        self.assert_lease_owned()
        self.persistence.record_attempt_result(
            evaluation_id, result, lease=self.lease
        )


class DeadlineBoundProvider:
    """Inject the remaining deadline and cancellation checks into every call."""

    def __init__(
        self,
        provider: GeminiProvider,
        deadline: SoftDeadline,
        is_canceled: Callable[[], bool],
    ) -> None:
        self.provider = provider
        self.deadline = deadline
        self.is_canceled = is_canceled

    def set_model(self, model_name: str) -> None:
        self.provider.set_model(model_name)

    def _before(self) -> float:
        if self.is_canceled():
            raise EvaluationCanceled("Evaluation cancellation was requested")
        return self.deadline.provider_timeout()

    def _after(self, value: Any) -> Any:
        if self.is_canceled():
            raise EvaluationCanceled("Evaluation was canceled during a provider call")
        if self.deadline.remaining <= 0:
            raise DeadlineExceeded("The evaluation deadline expired during a provider call")
        return value

    def generate_structured(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        kwargs["timeout_seconds"] = min(
            kwargs.get("timeout_seconds", float("inf")), self._before()
        )
        return self._after(self.provider.generate_structured(*args, **kwargs))

    def generate_structured_with_contents(
        self, *args: Any, **kwargs: Any
    ) -> dict[str, Any]:
        kwargs["timeout_seconds"] = min(
            kwargs.get("timeout_seconds", float("inf")), self._before()
        )
        return self._after(
            self.provider.generate_structured_with_contents(*args, **kwargs)
        )


def _to_full_scoring(raw: SermonScoringStep2Raw) -> SermonScoringStep2:
    return SermonScoringStep2(
        Introduction=raw.Introduction,
        Proposition=raw.Proposition,
        Main_Points=raw.Main_Points,
        Exegetical_Support=raw.Exegetical_Support,
        Application=raw.Application,
        Illustrations=raw.Illustrations,
        Conclusion=raw.Conclusion,
        Doctrinal_Fidelity=raw.Doctrinal_Fidelity,
        Pastoral_Posture=raw.Pastoral_Posture,
        Strengths=raw.Strengths,
        Growth_Areas=raw.Growth_Areas,
        Next_Steps=raw.Next_Steps,
        Scoring_Confidence=raw.Scoring_Confidence,
    )


def _build_scoring_prompt(extraction: SermonExtractionStep1) -> str:
    """Serialize only homiletical evidence for durable worker scoring."""

    extraction_json = json.dumps(
        extraction.model_dump(mode="json", exclude={"audio_duration"}),
        ensure_ascii=False,
    )
    return (
        f"{prompts.SCORING_INSTRUCTIONS}\\n\\n"
        f"Step 1 JSON below:\\n\\n{extraction_json}"
    )


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def evaluator_provenance(
    provider: GeminiProvider, gemini_file: Mapping[str, Any]
) -> dict[str, Any]:
    return {
        "configuredModelAlias": provider.model_name,
        "modelVersion": provider.last_response_metadata.model_version,
        "responseId": provider.last_response_metadata.response_id,
        "evaluatorVersion": __version__,
        "promptVersion": PROMPT_VERSION,
        "rubricVersion": RUBRIC_VERSION,
        "reportVersion": REPORT_VERSION,
        "sourceCommit": SOURCE_COMMIT,
        "promptHashes": {
            "extractionSystem": _sha256_text(prompts.EXTRACTION_SYSTEM_PROMPT),
            "extractionAudio": _sha256_text(prompts.EXTRACTION_INSTRUCTIONS_AUDIO),
            "scoringSystem": _sha256_text(prompts.SCORING_SYSTEM_PROMPT),
            "scoring": _sha256_text(prompts.SCORING_INSTRUCTIONS),
            "harmonization": _sha256_text(prompts.HARMONIZE_INSTRUCTIONS),
            "aggregateSummary": _sha256_text(prompts.AGG_SUMMARY_INSTRUCTIONS),
        },
        "geminiFile": dict(gemini_file),
    }


class SermonEvaluationService:
    """Execute and resume a durable evaluation using injected boundaries."""

    def __init__(
        self,
        *,
        persistence: PsycopgPersistence,
        storage: AppwriteStorage,
        provider: GeminiProvider,
        soft_deadline_seconds: int = 840,
        max_parallel_scoring_runs: int = 9,
    ) -> None:
        self.persistence = persistence
        self.storage = storage
        self.provider = provider
        self.soft_deadline_seconds = soft_deadline_seconds
        self.max_parallel_scoring_runs = max_parallel_scoring_runs

    @classmethod
    def from_environment(cls) -> "SermonEvaluationService":
        runtime = os.getenv("SERMON_RUNTIME", "appwrite").strip().lower()
        if runtime not in {"local", "appwrite"}:
            raise ValueError("SERMON_RUNTIME must be either local or appwrite")
        provider_name = os.getenv(
            "SERMON_EVALUATOR_PROVIDER",
            "fixture" if runtime == "local" else "gemini",
        ).strip().lower()
        if provider_name not in {"fixture", "gemini"}:
            raise ValueError(
                "SERMON_EVALUATOR_PROVIDER must be either fixture or gemini"
            )
        if provider_name == "fixture" and runtime != "local":
            raise ValueError(
                "The fixture sermon evaluator provider is restricted to local runtime"
            )
        model = (
            "fixture-sermon-evaluator-v1"
            if provider_name == "fixture"
            else os.getenv("SERMON_GEMINI_MODEL", "gemini-3.6-flash")
        )
        return cls(
            persistence=PsycopgPersistence(),
            storage=(
                LocalFilesystemStorage()
                if runtime == "local"
                else AppwriteStorage()
            ),
            provider=(
                FixtureProvider(model=model)
                if provider_name == "fixture"
                else GeminiProvider(model=model)
            ),
            soft_deadline_seconds=int(
                os.getenv("SERMON_SOFT_DEADLINE_SECONDS", "840")
            ),
            max_parallel_scoring_runs=int(
                os.getenv("SERMON_MAX_PARALLEL_SCORING_RUNS", "9")
            ),
        )

    def _attempt(
        self, job: EvaluationJob, appwrite_execution_id: Optional[str]
    ) -> tuple[str, datetime]:
        if job.status != EvaluationStatus.QUEUED:
            return self.persistence.active_evaluation_attempt(job.id)
        try:
            return self.persistence.active_evaluation_attempt(job.id)
        except PersistenceError:
            hard_deadline = datetime.now(timezone.utc) + timedelta(seconds=900)
            attempt_id, persisted_deadline = (
                self.persistence.create_evaluation_attempt(
                    job.id,
                    deadline_at=hard_deadline,
                    appwrite_execution_id=appwrite_execution_id,
                    resume_reason="queued",
                )
            )
            return attempt_id, persisted_deadline

    @staticmethod
    def _soft_deadline(hard_deadline: datetime, configured_seconds: int) -> SoftDeadline:
        now = datetime.now(timezone.utc)
        if hard_deadline.tzinfo is None:
            hard_deadline = hard_deadline.replace(tzinfo=timezone.utc)
        remaining_hard = (hard_deadline - now).total_seconds()
        remaining_soft = min(configured_seconds, remaining_hard - 60)
        if remaining_soft <= 0:
            raise DeadlineExceeded("The original evaluation attempt deadline expired")
        return SoftDeadline.from_budget(remaining_soft)

    def process(
        self, evaluation_id: str, *, appwrite_execution_id: Optional[str] = None
    ) -> dict[str, Any]:
        job = self.persistence.fetch_evaluation(evaluation_id)
        if job.status in {
            EvaluationStatus.COMPLETE,
            EvaluationStatus.COMPLETE_WITH_WARNINGS,
        }:
            return {"evaluationId": job.id, "status": job.status.value, "replayed": True}
        attempt_id, hard_deadline = self._attempt(job, appwrite_execution_id)
        try:
            deadline = self._soft_deadline(
                hard_deadline, self.soft_deadline_seconds
            )
        except DeadlineExceeded as error:
            marked = self.persistence.mark_unleased_attempt_timed_out(
                evaluation_id=job.id,
                evaluation_attempt_id=attempt_id,
                hard_deadline=hard_deadline,
                error_message=str(error),
            )
            return {
                "evaluationId": job.id,
                "status": "TIMED_OUT" if marked else "DEFERRED",
            }
        lease_owner = (
            f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:12]}"
        )
        lease = self.persistence.claim_lease(
            evaluation_id=job.id,
            evaluation_attempt_id=attempt_id,
            lease_owner=lease_owner,
        )
        try:
            with LeaseHeartbeat(self.persistence, lease) as heartbeat:
                return self._process_claimed(
                    job=job,
                    attempt_id=attempt_id,
                    deadline=deadline,
                    lease=lease,
                    assert_lease_owned=heartbeat.assert_owned,
                )
        except LeaseLost:
            return {"evaluationId": job.id, "status": "DEFERRED"}
        except EvaluationCanceled as error:
            marked = self.persistence.mark_terminal(
                evaluation_id=job.id,
                evaluation_attempt_id=attempt_id,
                status=EvaluationStatus.CANCELED,
                error_code=error.code,
                error_message=str(error),
                lease=lease,
                release_credit_reason="CANCELED_BEFORE_SCORING",
            )
            return {
                "evaluationId": job.id,
                "status": "CANCELED" if marked else "DEFERRED",
            }
        except DeadlineExceeded as error:
            marked = self.persistence.mark_terminal(
                evaluation_id=job.id,
                evaluation_attempt_id=attempt_id,
                status=EvaluationStatus.TIMED_OUT,
                error_code=error.code,
                error_message=str(error),
                lease=lease,
            )
            return {
                "evaluationId": job.id,
                "status": "TIMED_OUT" if marked else "DEFERRED",
            }
        except (AudioHashMismatch, InvalidAudioError) as error:
            canonical_evaluation_id = getattr(
                error, "canonical_evaluation_id", None
            )
            marked = self.persistence.mark_terminal(
                evaluation_id=job.id,
                evaluation_attempt_id=attempt_id,
                status=EvaluationStatus.FAILED,
                error_code=getattr(
                    error, "code", "AUDIO_VERIFICATION_FAILED"
                ),
                error_message=str(error),
                lease=lease,
                release_credit_reason="AUDIO_VERIFICATION_FAILED",
                rejected_audio_asset_id=job.audio_asset_id,
                rejected_fingerprint_id=job.fingerprint_id,
                canonical_evaluation_id=canonical_evaluation_id,
            )
            if marked:
                self._delete_rejected_audio_asset(
                    asset_id=job.audio_asset_id,
                    bucket_id=job.appwrite_bucket_id,
                    file_id=job.appwrite_file_id,
                )
            result = {
                "evaluationId": job.id,
                "status": "FAILED" if marked else "DEFERRED",
                "errorCode": getattr(
                    error, "code", "AUDIO_VERIFICATION_FAILED"
                ),
            }
            if marked and canonical_evaluation_id is not None:
                result["canonicalEvaluationId"] = canonical_evaluation_id
            return result
        except BaseException as error:
            self.persistence.mark_terminal(
                evaluation_id=job.id,
                evaluation_attempt_id=attempt_id,
                status=EvaluationStatus.FAILED,
                error_code=getattr(error, "code", error.__class__.__name__),
                error_message=str(error),
                lease=lease,
            )
            raise
        finally:
            self.persistence.release_lease(lease)

    def _process_claimed(
        self,
        *,
        job: EvaluationJob,
        attempt_id: str,
        deadline: SoftDeadline,
        lease: Lease,
        assert_lease_owned: Callable[[], None] = lambda: None,
    ) -> dict[str, Any]:
        status = job.status
        version = job.version
        result = dict(job.result)

        def canceled() -> bool:
            return self.persistence.is_canceled(job.id)

        def before_external_call() -> float:
            assert_lease_owned()
            if canceled():
                raise EvaluationCanceled("Evaluation cancellation was requested")
            return deadline.provider_timeout()

        def after_external_call() -> None:
            assert_lease_owned()
            if canceled():
                raise EvaluationCanceled(
                    "Evaluation was canceled during an external call"
                )
            if deadline.remaining <= 0:
                raise DeadlineExceeded(
                    "The evaluation deadline expired during an external call"
                )

        bound_provider = DeadlineBoundProvider(self.provider, deadline, canceled)

        def transition(target: EvaluationStatus, patch: Optional[dict] = None) -> None:
            nonlocal status, version
            version = self.persistence.compare_and_set_status(
                evaluation_id=job.id,
                expected_status=status,
                expected_version=version,
                target_status=target,
                result_patch=patch,
                lease=lease,
            )
            status = target

        if status == EvaluationStatus.QUEUED:
            transition(EvaluationStatus.PREPARING_AUDIO)

        gemini_file_object: Any
        audio_state = result.get("audio")
        if status == EvaluationStatus.PREPARING_AUDIO:
            if canceled():
                raise EvaluationCanceled("Evaluation cancellation was requested")
            gemini_metadata = (
                audio_state.get("geminiFile") if isinstance(audio_state, dict) else None
            )
            try:
                if not gemini_metadata:
                    raise LookupError
                timeout_seconds = before_external_call()
                gemini_file_object = self.provider.get_file(
                    gemini_metadata["name"],
                    timeout_seconds=timeout_seconds,
                )
                after_external_call()
                timeout_seconds = before_external_call()
                gemini_file_object = self.provider.wait_until_active(
                    gemini_file_object,
                    timeout_seconds=timeout_seconds,
                )
                after_external_call()
            except (DeadlineExceeded, EvaluationCanceled):
                raise
            except Exception:
                suffix = Path(job.original_filename).suffix.lower()
                timeout_seconds = before_external_call()
                downloaded = self.storage.download_to_temp(
                    bucket_id=job.appwrite_bucket_id,
                    file_id=job.appwrite_file_id,
                    suffix=suffix,
                    timeout_seconds=timeout_seconds,
                )
                after_external_call()
                try:
                    verified_hash, byte_size, duration = (
                        self._validate_downloaded_audio(downloaded.path, job)
                    )
                    self.persistence.verify_audio(
                        job,
                        verified_sha256=verified_hash,
                        duration_seconds=duration,
                        byte_size=byte_size,
                        lease=lease,
                    )
                    timeout_seconds = before_external_call()
                    gemini_file_object = self.provider.upload_file(
                        str(downloaded.path),
                        timeout_seconds=timeout_seconds,
                    )
                    after_external_call()
                    timeout_seconds = before_external_call()
                    gemini_file_object = self.provider.wait_until_active(
                        gemini_file_object,
                        timeout_seconds=timeout_seconds,
                    )
                    after_external_call()
                finally:
                    downloaded.cleanup()
                gemini_metadata = self.provider.file_metadata(
                    gemini_file_object
                ).model_dump()
                audio_state = {
                    "sha256": verified_hash,
                    "byteSize": byte_size,
                    "durationSeconds": duration,
                    "mimeType": job.mime_type,
                    "geminiFile": gemini_metadata,
                }
                self.persistence.save_stage_output(
                    job.id, "audio", audio_state, lease=lease
                )
                result["audio"] = audio_state
            transition(EvaluationStatus.EXTRACTING)
        else:
            gemini_metadata = result["audio"]["geminiFile"]
            try:
                timeout_seconds = before_external_call()
                gemini_file_object = self.provider.get_file(
                    gemini_metadata["name"],
                    timeout_seconds=timeout_seconds,
                )
                after_external_call()
                timeout_seconds = before_external_call()
                gemini_file_object = self.provider.wait_until_active(
                    gemini_file_object,
                    timeout_seconds=timeout_seconds,
                )
                after_external_call()
            except (DeadlineExceeded, EvaluationCanceled):
                raise
            except Exception:
                suffix = Path(job.original_filename).suffix.lower()
                timeout_seconds = before_external_call()
                downloaded = self.storage.download_to_temp(
                    bucket_id=job.appwrite_bucket_id,
                    file_id=job.appwrite_file_id,
                    suffix=suffix,
                    timeout_seconds=timeout_seconds,
                )
                after_external_call()
                try:
                    verified_hash, byte_size, duration = (
                        self._validate_downloaded_audio(downloaded.path, job)
                    )
                    self.persistence.verify_audio(
                        job,
                        verified_sha256=verified_hash,
                        duration_seconds=duration,
                        byte_size=byte_size,
                        lease=lease,
                    )
                    timeout_seconds = before_external_call()
                    gemini_file_object = self.provider.upload_file(
                        str(downloaded.path),
                        timeout_seconds=timeout_seconds,
                    )
                    after_external_call()
                    timeout_seconds = before_external_call()
                    gemini_file_object = self.provider.wait_until_active(
                        gemini_file_object,
                        timeout_seconds=timeout_seconds,
                    )
                    after_external_call()
                finally:
                    downloaded.cleanup()
                gemini_metadata = self.provider.file_metadata(
                    gemini_file_object
                ).model_dump()
                audio_state = {
                    **result["audio"],
                    "geminiFile": gemini_metadata,
                }
                self.persistence.save_stage_output(
                    job.id, "audio", audio_state, lease=lease
                )
                result["audio"] = audio_state

        extraction_data = result.get("extraction")
        if extraction_data:
            extraction = SermonExtractionStep1(**extraction_data)
            if status == EvaluationStatus.EXTRACTING:
                transition(EvaluationStatus.SCORING)
        elif status == EvaluationStatus.EXTRACTING:
            extraction_payload = bound_provider.generate_structured_with_contents(
                contents=[prompts.EXTRACTION_INSTRUCTIONS_AUDIO, gemini_file_object],
                response_schema=SermonExtractionStep1,
                system=prompts.EXTRACTION_SYSTEM_PROMPT,
                model=self.provider.model_name,
                seed=1689,
            )
            extraction = SermonExtractionStep1(**extraction_payload)
            extraction.audio_duration = result["audio"]["durationSeconds"]
            extraction_data = extraction.model_dump(mode="json")
            self.persistence.save_stage_output(
                job.id, "extraction", extraction_data, lease=lease
            )
            result["extraction"] = extraction_data
            transition(EvaluationStatus.SCORING)
        else:
            raise RuntimeError("Durable extraction output is missing")

        outcome_data = result.get("scoringRuns")
        raw_runs: list[SermonScoringStep2Raw]
        completed_runs: int
        warning_codes: list[str] = list(result.get("warningCodes", []))
        if outcome_data and status != EvaluationStatus.SCORING:
            raw_runs = [SermonScoringStep2Raw(**item) for item in outcome_data["runs"]]
            completed_runs = len(raw_runs)
        elif status == EvaluationStatus.SCORING:
            previous_values, attempt_counts, used_seeds = (
                self.persistence.scoring_resume_state(job.id)
            )
            previous_values = {
                ordinal: SermonScoringStep2Raw(**value)
                for ordinal, value in previous_values.items()
            }
            coordinator = ParallelScoringCoordinator(
                max_parallel=self.max_parallel_scoring_runs,
                persistence=LeaseScopedScoringPersistence(
                    self.persistence, lease, assert_lease_owned
                ),
            )
            scoring_prompt = _build_scoring_prompt(extraction)

            def score(
                ordinal: int, seed: int, attempt_number: int, timeout: float
            ) -> StructuredScoringValue:
                del ordinal, attempt_number
                if canceled():
                    raise EvaluationCanceled("Evaluation cancellation was requested")
                payload = bound_provider.generate_structured_with_contents(
                    contents=[scoring_prompt, gemini_file_object],
                    response_schema=SermonScoringStep2Raw,
                    system=prompts.SCORING_SYSTEM_PROMPT,
                    model=self.provider.model_name,
                    seed=seed,
                    timeout_seconds=timeout,
                )
                return StructuredScoringValue(
                    raw=SermonScoringStep2Raw(**payload),
                    provider_metadata=self.provider.last_response_metadata,
                )

            outcome = coordinator.run(
                evaluation_id=job.id,
                requested_runs=job.requested_runs,
                prompt_version=PROMPT_VERSION,
                deadline=deadline,
                scoring_call=score,
                is_canceled=canceled,
                preexisting_seeds=used_seeds,
                preexisting_values_by_ordinal=previous_values,
                prior_attempt_counts=attempt_counts,
            )
            raw_runs = [
                value.raw if isinstance(value, StructuredScoringValue) else value
                for value in outcome.values_by_ordinal.values()
            ]
            completed_runs = outcome.completed_runs
            if outcome.warning_code and outcome.warning_code not in warning_codes:
                warning_codes.append(outcome.warning_code)
            outcome_data = {
                "requestedRuns": outcome.requested_runs,
                "completedRuns": outcome.completed_runs,
                "retryWave": max(
                    (attempt.spec.retry_wave for attempt in outcome.attempts),
                    default=0,
                ),
                "warningCode": outcome.warning_code,
                "runs": [run.model_dump(mode="json") for run in raw_runs],
            }
            self.persistence.save_stage_output(
                job.id, "scoringRuns", outcome_data, lease=lease
            )
            result["scoringRuns"] = outcome_data
            result["warningCodes"] = warning_codes
            transition(EvaluationStatus.HARMONIZING)
        else:
            raise RuntimeError("Durable scoring runs are missing")

        scoring_data = result.get("scoring")
        if scoring_data and status not in {
            EvaluationStatus.HARMONIZING,
            EvaluationStatus.AGGREGATING,
        }:
            scoring = SermonScoringStep2(**scoring_data)
        elif result.get("harmonized") and status == EvaluationStatus.HARMONIZING:
            scoring = SermonScoringStep2(**result["harmonized"])
            transition(EvaluationStatus.AGGREGATING)
        elif status == EvaluationStatus.HARMONIZING:
            harmonizer = SermonHarmonizer(
                bound_provider,
                self.provider.model_name,
                prompts,
                apply_duration_adjustment=job.duration_adjustment_enabled,
            )
            if len(raw_runs) == 1:
                scoring = _to_full_scoring(raw_runs[0])
            else:
                scoring = harmonizer.harmonize_runs(
                    raw_runs, extraction, gemini_file_object
                )
            self.persistence.save_stage_output(
                job.id,
                "harmonized",
                scoring.model_dump(mode="json"),
                lease=lease,
            )
            result["harmonized"] = scoring.model_dump(mode="json")
            transition(EvaluationStatus.AGGREGATING)
        else:
            scoring = SermonScoringStep2(**result["harmonized"])

        if status == EvaluationStatus.AGGREGATING:
            aggregator = SermonAggregator()
            scoring.Aggregated_Summary = aggregator.compute_aggregates(
                scoring, extraction
            )
            scoring.Aggregated_Summary = aggregator.apply_duration_penalty(
                scoring.Aggregated_Summary,
                extraction.audio_duration,
                enabled=job.duration_adjustment_enabled,
            )
            scoring_data = scoring.model_dump(mode="json")
            self.persistence.save_stage_output(
                job.id, "scoring", scoring_data, lease=lease
            )
            result["scoring"] = scoring_data
            transition(EvaluationStatus.SUMMARIZING)

        if status != EvaluationStatus.SUMMARIZING:
            raise RuntimeError(f"Cannot publish reports from status {status}")
        if scoring.Aggregated_Summary_Feedback is None:
            harmonizer = SermonHarmonizer(
                bound_provider,
                self.provider.model_name,
                prompts,
                apply_duration_adjustment=job.duration_adjustment_enabled,
            )
            harmonizer._generate_aggregate_feedback(
                scoring, extraction, completed_runs
            )
            scoring_data = scoring.model_dump(mode="json")
            result["scoring"] = scoring_data

        provenance = evaluator_provenance(
            self.provider, result["audio"]["geminiFile"]
        )
        result["provenance"] = provenance
        after_external_call()
        reports = self._render_reports(
            job=job,
            extraction=extraction,
            scoring=scoring,
            completed_runs=completed_runs,
            provenance=provenance,
        )
        after_external_call()
        final_status = (
            EvaluationStatus.COMPLETE
            if completed_runs == job.requested_runs
            else EvaluationStatus.COMPLETE_WITH_WARNINGS
        )
        self.persistence.finish(
            evaluation_id=job.id,
            status=final_status,
            completed_runs=completed_runs,
            result=result,
            provenance=provenance,
            warning_codes=warning_codes,
            evaluation_attempt_id=attempt_id,
            lease=lease,
            reports=reports,
            report_version=REPORT_VERSION,
        )
        return {
            "evaluationId": job.id,
            "status": final_status.value,
            "requestedRuns": job.requested_runs,
            "completedRuns": completed_runs,
            "warningCodes": warning_codes,
        }

    @staticmethod
    def _validate_downloaded_audio(
        path: Path, job: EvaluationJob
    ) -> tuple[str, int, float]:
        from .audio import AudioFileManager

        return AudioFileManager.validate_local_audio(
            path,
            expected_size=job.byte_size,
            declared_mime_type=job.mime_type,
            declared_extension=Path(job.original_filename).suffix,
        )

    def _render_reports(
        self,
        *,
        job: EvaluationJob,
        extraction: SermonExtractionStep1,
        scoring: SermonScoringStep2,
        completed_runs: int,
        provenance: Mapping[str, Any],
    ) -> dict[str, bytes]:
        report_metadata = {
            **dict(provenance),
            "evaluationId": job.id,
            "title": job.title,
            "preacherName": job.preacher_name,
            "preachedOn": job.preached_on.isoformat(),
            "requestedRuns": job.requested_runs,
            "completedRuns": completed_runs,
        }
        reports = {
            "MARKDOWN": render_markdown(
                extraction,
                scoring,
                label=job.title,
                model=self.provider.model_name,
                num_scoring_runs=completed_runs,
            ),
            "JSON": render_json(
                extraction, scoring, metadata=report_metadata
            ),
            "CSV": render_csv(
                preacher=job.preacher_name,
                label=job.title,
                scoring=scoring,
                model=self.provider.model_name,
                extraction=extraction,
                num_scoring_runs=completed_runs,
                preached_date=job.preached_on.isoformat(),
            ),
        }
        return {
            format_name: text.encode("utf-8")
            for format_name, text in reports.items()
        }

    def recover(self, limit: int = 2) -> list[dict[str, Any]]:
        self.persistence.timeout_expired_attempts()
        self.cleanup_expired_uploads(limit=10)
        self.cleanup_rejected_audio(limit=10)
        self.cleanup_deleted_audio(limit=10)
        results: list[dict[str, Any]] = []
        for evaluation_id in (
            self.persistence.stale_duration_report_evaluation_ids(limit=10)
        ):
            try:
                results.append(self.regenerate_reports(evaluation_id))
            except Exception as error:
                results.append(
                    {
                        "evaluationId": evaluation_id,
                        "status": "REPORT_REGENERATION_FAILED",
                        "error": error.__class__.__name__,
                    }
                )
        for evaluation_id in self.persistence.recoverable_evaluation_ids(limit=limit):
            try:
                results.append(self.process(evaluation_id))
            except LeaseUnavailable:
                break
            except Exception as error:
                results.append(
                    {
                        "evaluationId": evaluation_id,
                        "status": "FAILED",
                        "error": error.__class__.__name__,
                    }
                )
        return results

    def cleanup_expired_uploads(self, limit: int = 10) -> int:
        """Delete expired orphan uploads, then close their owner-scoped rows."""

        cleaned = 0
        for reservation in self.persistence.expired_prepared_uploads(limit=limit):
            try:
                self.storage.delete_file(
                    bucket_id=reservation["appwriteBucketId"],
                    file_id=reservation["appwriteFileId"],
                )
            except Exception as error:
                if getattr(error, "code", None) != 404:
                    continue
            if self.persistence.expire_prepared_upload(
                reservation_id=reservation["id"],
                owner_id=reservation["ownerId"],
                bucket_id=reservation["appwriteBucketId"],
                file_id=reservation["appwriteFileId"],
            ):
                cleaned += 1

        remaining = max(0, limit - cleaned)
        if remaining == 0:
            return cleaned
        for reservation in self.persistence.expired_finalized_pending_assets(
            limit=remaining
        ):
            try:
                self.storage.delete_file(
                    bucket_id=reservation["appwriteBucketId"],
                    file_id=reservation["appwriteFileId"],
                )
            except Exception as error:
                if getattr(error, "code", None) != 404:
                    continue
            if self.persistence.expire_finalized_pending_asset(
                reservation_id=reservation["reservationId"],
                owner_id=reservation["ownerId"],
                asset_id=reservation["assetId"],
                bucket_id=reservation["appwriteBucketId"],
                file_id=reservation["appwriteFileId"],
            ):
                cleaned += 1
        return cleaned

    def _delete_rejected_audio_asset(
        self, *, asset_id: str, bucket_id: str, file_id: str
    ) -> bool:
        if not self.persistence.rejected_audio_pointer_is_deletable(
            asset_id=asset_id,
            bucket_id=bucket_id,
            file_id=file_id,
        ):
            return False
        try:
            self.storage.delete_file(bucket_id=bucket_id, file_id=file_id)
        except Exception as error:
            if getattr(error, "code", None) != 404:
                return False
        return self.persistence.clear_rejected_audio_pointer(
            asset_id=asset_id,
            bucket_id=bucket_id,
            file_id=file_id,
        )

    def cleanup_rejected_audio(self, limit: int = 10) -> int:
        cleaned = 0
        for asset in self.persistence.pending_rejected_audio_assets(limit=limit):
            if self._delete_rejected_audio_asset(
                asset_id=asset["id"],
                bucket_id=asset["appwriteBucketId"],
                file_id=asset["appwriteFileId"],
            ):
                cleaned += 1
        return cleaned

    def cleanup_deleted_audio(self, limit: int = 10) -> int:
        cleaned = 0
        for asset in self.persistence.pending_deleted_audio_assets(limit=limit):
            try:
                self.storage.delete_file(
                    bucket_id=asset["appwriteBucketId"],
                    file_id=asset["appwriteFileId"],
                )
            except Exception as error:
                if getattr(error, "code", None) != 404:
                    continue
            if self.persistence.clear_deleted_audio_pointer(
                asset_id=asset["id"],
                bucket_id=asset["appwriteBucketId"],
                file_id=asset["appwriteFileId"],
            ):
                cleaned += 1
        return cleaned

    def regenerate_reports(self, evaluation_id: str) -> dict[str, Any]:
        """Regenerate completed reports for the current duration policy only.

        This path performs no Gemini call and leaves raw scoring runs untouched.
        The persistence boundary publishes all formats under one report version
        and returns the existing version when an identical retry is received.
        """

        state = self.persistence.fetch_completed_report_state(evaluation_id)
        result = state["result"]
        extraction = SermonExtractionStep1(**result["extraction"])
        scoring = SermonScoringStep2(**result["scoring"])
        summary = scoring.Aggregated_Summary
        if summary is None:
            raise ValueError("Completed evaluation has no aggregate summary")
        enabled = bool(state["durationAdjustmentEnabled"])
        scoring.Aggregated_Summary = SermonAggregator().apply_duration_penalty(
            summary,
            extraction.audio_duration,
            enabled=enabled,
        )
        updated_result = {
            **result,
            "scoring": scoring.model_dump(mode="json"),
        }
        updated_at = state["durationPolicyUpdatedAt"]
        generated_at = (
            updated_at.isoformat()
            if hasattr(updated_at, "isoformat")
            else str(updated_at or "duration-policy-initial")
        )
        provenance = dict(state["provenance"])
        metadata = {
            **provenance,
            "evaluationId": evaluation_id,
            "title": state["title"],
            "preacherName": state["preacherName"],
            "preachedOn": state["preachedOn"].isoformat(),
            "requestedRuns": state["requestedRuns"],
            "completedRuns": state["completedRuns"],
            "durationAdjustmentEnabled": enabled,
            "generatedAt": generated_at,
        }
        report_text = {
            "MARKDOWN": render_markdown(
                extraction,
                scoring,
                label=state["title"],
                model=provenance.get("configuredModelAlias"),
                num_scoring_runs=state["completedRuns"],
                generated_at=generated_at,
            ),
            "JSON": render_json(extraction, scoring, metadata=metadata),
            "CSV": render_csv(
                preacher=state["preacherName"],
                label=state["title"],
                scoring=scoring,
                model=provenance.get("configuredModelAlias", ""),
                extraction=extraction,
                num_scoring_runs=state["completedRuns"],
                preached_date=state["preachedOn"].isoformat(),
                timestamp=generated_at,
            ),
        }
        version = self.persistence.publish_report_set(
            evaluation_id,
            {
                format_name: text.encode("utf-8")
                for format_name, text in report_text.items()
            },
            result=updated_result,
            expected_duration_adjustment_enabled=enabled,
            expected_duration_policy_updated_at=updated_at,
        )
        return {
            "evaluationId": evaluation_id,
            "status": state["status"],
            "reportVersion": version,
            "durationAdjustmentEnabled": enabled,
        }


__all__ = [
    "PROMPT_VERSION",
    "REPORT_VERSION",
    "RUBRIC_VERSION",
    "SOURCE_COMMIT",
    "DeadlineBoundProvider",
    "LeaseScopedScoringPersistence",
    "SermonEvaluationService",
    "StructuredScoringValue",
    "evaluator_provenance",
]
