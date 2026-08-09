"""Durable stage and parallel scoring coordination primitives."""

from __future__ import annotations

import hashlib
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Callable, Iterable, Mapping, Optional, Protocol

SCORING_SEEDS = (1689, 2025, 3141, 4567, 5000, 6789, 7890, 8888, 9999)
MAX_SCORING_RUNS = len(SCORING_SEEDS)
MAX_REPLACEMENT_ATTEMPTS = 2
MIN_EXTERNAL_CALL_BUDGET_SECONDS = 60.0


class EvaluationStatus(StrEnum):
    QUEUED = "QUEUED"
    PREPARING_AUDIO = "PREPARING_AUDIO"
    EXTRACTING = "EXTRACTING"
    SCORING = "SCORING"
    HARMONIZING = "HARMONIZING"
    AGGREGATING = "AGGREGATING"
    SUMMARIZING = "SUMMARIZING"
    COMPLETE = "COMPLETE"
    COMPLETE_WITH_WARNINGS = "COMPLETE_WITH_WARNINGS"
    FAILED = "FAILED"
    TIMED_OUT = "TIMED_OUT"
    CANCELED = "CANCELED"


TERMINAL_STATUSES = frozenset(
    {
        EvaluationStatus.COMPLETE,
        EvaluationStatus.COMPLETE_WITH_WARNINGS,
        EvaluationStatus.FAILED,
        EvaluationStatus.TIMED_OUT,
        EvaluationStatus.CANCELED,
    }
)

STAGE_ORDER = (
    EvaluationStatus.PREPARING_AUDIO,
    EvaluationStatus.EXTRACTING,
    EvaluationStatus.SCORING,
    EvaluationStatus.HARMONIZING,
    EvaluationStatus.AGGREGATING,
    EvaluationStatus.SUMMARIZING,
)

ALLOWED_TRANSITIONS: Mapping[EvaluationStatus, frozenset[EvaluationStatus]] = {
    EvaluationStatus.QUEUED: frozenset(
        {EvaluationStatus.PREPARING_AUDIO, EvaluationStatus.CANCELED}
    ),
    EvaluationStatus.PREPARING_AUDIO: frozenset(
        {
            EvaluationStatus.EXTRACTING,
            EvaluationStatus.FAILED,
            EvaluationStatus.TIMED_OUT,
            EvaluationStatus.CANCELED,
        }
    ),
    EvaluationStatus.EXTRACTING: frozenset(
        {
            EvaluationStatus.SCORING,
            EvaluationStatus.FAILED,
            EvaluationStatus.TIMED_OUT,
            EvaluationStatus.CANCELED,
        }
    ),
    EvaluationStatus.SCORING: frozenset(
        {
            EvaluationStatus.HARMONIZING,
            EvaluationStatus.FAILED,
            EvaluationStatus.TIMED_OUT,
            EvaluationStatus.CANCELED,
        }
    ),
    EvaluationStatus.HARMONIZING: frozenset(
        {
            EvaluationStatus.AGGREGATING,
            EvaluationStatus.FAILED,
            EvaluationStatus.TIMED_OUT,
            EvaluationStatus.CANCELED,
        }
    ),
    EvaluationStatus.AGGREGATING: frozenset(
        {
            EvaluationStatus.SUMMARIZING,
            EvaluationStatus.FAILED,
            EvaluationStatus.TIMED_OUT,
            EvaluationStatus.CANCELED,
        }
    ),
    EvaluationStatus.SUMMARIZING: frozenset(
        {
            EvaluationStatus.COMPLETE,
            EvaluationStatus.COMPLETE_WITH_WARNINGS,
            EvaluationStatus.FAILED,
            EvaluationStatus.TIMED_OUT,
            EvaluationStatus.CANCELED,
        }
    ),
}


class DeadlineExceeded(TimeoutError):
    code = "EVALUATION_DEADLINE_EXCEEDED"


class EvaluationCanceled(RuntimeError):
    code = "EVALUATION_CANCELED"


class InvalidStageTransition(ValueError):
    pass


class SoftDeadline:
    def __init__(
        self,
        expires_at_monotonic: float,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.expires_at_monotonic = expires_at_monotonic
        self.clock = clock

    @classmethod
    def from_budget(
        cls,
        seconds: float,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> "SoftDeadline":
        return cls(clock() + seconds, clock=clock)

    @property
    def remaining(self) -> float:
        return max(0.0, self.expires_at_monotonic - self.clock())

    def provider_timeout(self, minimum: float = MIN_EXTERNAL_CALL_BUDGET_SECONDS) -> float:
        remaining = self.remaining
        if remaining < minimum:
            raise DeadlineExceeded(
                f"Only {remaining:.1f}s remains; refusing to start an external call"
            )
        return remaining


def validate_transition(
    current: EvaluationStatus | str, target: EvaluationStatus | str
) -> None:
    current_status = EvaluationStatus(current)
    target_status = EvaluationStatus(target)
    if target_status not in ALLOWED_TRANSITIONS.get(current_status, frozenset()):
        raise InvalidStageTransition(f"{current_status} cannot transition to {target_status}")


def replacement_seed(
    *,
    evaluation_id: str,
    ordinal: int,
    attempt_number: int,
    prompt_version: str,
    used_seeds: Iterable[int],
) -> int:
    """Produce a stable positive 31-bit seed and deterministically avoid collisions."""

    used = set(used_seeds)
    collision_ordinal = 0
    while True:
        material = (
            f"{evaluation_id}:{ordinal}:{attempt_number}:{prompt_version}:"
            f"{collision_ordinal}"
        ).encode("utf-8")
        candidate = int.from_bytes(hashlib.sha256(material).digest()[:4], "big")
        candidate &= 0x7FFFFFFF
        candidate = candidate or 1
        if candidate not in used:
            return candidate
        collision_ordinal += 1


@dataclass(frozen=True)
class AttemptSpec:
    ordinal: int
    attempt_number: int
    seed: int
    retry_wave: int


@dataclass(frozen=True)
class AttemptResult:
    spec: AttemptSpec
    value: Optional[Any] = None
    error: Optional[BaseException] = None
    ignored_after_cancel: bool = False

    @property
    def succeeded(self) -> bool:
        return self.value is not None and self.error is None and not self.ignored_after_cancel


@dataclass(frozen=True)
class ScoringOutcome:
    requested_runs: int
    completed_runs: int
    values_by_ordinal: Mapping[int, Any]
    attempts: tuple[AttemptResult, ...]
    warning_code: Optional[str] = None

    @property
    def complete_with_warnings(self) -> bool:
        return 0 < self.completed_runs < self.requested_runs


class ScoringPersistence(Protocol):
    def prepare_scoring_runs(self, evaluation_id: str, requested_runs: int) -> None: ...

    def record_attempt_started(
        self, evaluation_id: str, spec: AttemptSpec
    ) -> None: ...

    def record_attempt_result(
        self, evaluation_id: str, result: AttemptResult
    ) -> None: ...


class NullScoringPersistence:
    def prepare_scoring_runs(self, evaluation_id: str, requested_runs: int) -> None:
        return None

    def record_attempt_started(
        self, evaluation_id: str, spec: AttemptSpec
    ) -> None:
        return None

    def record_attempt_result(
        self, evaluation_id: str, result: AttemptResult
    ) -> None:
        return None


ScoringCall = Callable[[int, int, int, float], Any]


class ParallelScoringCoordinator:
    """Run logical scoring slots in concurrent waves with durable attempts."""

    def __init__(
        self,
        *,
        max_parallel: int = MAX_SCORING_RUNS,
        persistence: Optional[ScoringPersistence] = None,
    ) -> None:
        if not 1 <= max_parallel <= MAX_SCORING_RUNS:
            raise ValueError("max_parallel must be between 1 and 9")
        self.max_parallel = max_parallel
        self.persistence = persistence or NullScoringPersistence()

    def run(
        self,
        *,
        evaluation_id: str,
        requested_runs: int,
        prompt_version: str,
        deadline: SoftDeadline,
        scoring_call: ScoringCall,
        is_canceled: Callable[[], bool] = lambda: False,
        preexisting_seeds: Iterable[int] = (),
        preexisting_values_by_ordinal: Optional[Mapping[int, Any]] = None,
        prior_attempt_counts: Optional[Mapping[int, int]] = None,
    ) -> ScoringOutcome:
        if not 1 <= requested_runs <= MAX_SCORING_RUNS:
            raise ValueError("requested_runs must be between 1 and 9")
        self.persistence.prepare_scoring_runs(evaluation_id, requested_runs)
        values: dict[int, Any] = dict(preexisting_values_by_ordinal or {})
        attempts: list[AttemptResult] = []
        pending = [
            ordinal
            for ordinal in range(1, requested_runs + 1)
            if ordinal not in values
        ]
        used_seeds = set(preexisting_seeds)
        attempt_counts = dict(prior_attempt_counts or {})

        while pending:
            if not pending:
                break
            if is_canceled():
                raise EvaluationCanceled("Evaluation cancellation was requested")
            timeout_seconds = deadline.provider_timeout()
            specs: list[AttemptSpec] = []
            for ordinal in pending:
                attempt_number = attempt_counts.get(ordinal, 0) + 1
                if attempt_number > MAX_REPLACEMENT_ATTEMPTS + 1:
                    continue
                retry_wave = attempt_number - 1
                if attempt_number == 1:
                    seed = SCORING_SEEDS[ordinal - 1]
                    if seed in used_seeds:
                        raise ValueError(f"Primary seed {seed} was already persisted")
                else:
                    seed = replacement_seed(
                        evaluation_id=evaluation_id,
                        ordinal=ordinal,
                        attempt_number=attempt_number,
                        prompt_version=prompt_version,
                        used_seeds=used_seeds,
                    )
                used_seeds.add(seed)
                spec = AttemptSpec(
                    ordinal=ordinal,
                    attempt_number=attempt_number,
                    seed=seed,
                    retry_wave=retry_wave,
                )
                self.persistence.record_attempt_started(evaluation_id, spec)
                specs.append(spec)
                attempt_counts[ordinal] = attempt_number

            if not specs:
                break

            results_by_ordinal: dict[int, AttemptResult] = {}
            with ThreadPoolExecutor(
                max_workers=min(len(specs), self.max_parallel)
            ) as executor:
                futures = {
                    executor.submit(
                        scoring_call,
                        spec.ordinal,
                        spec.seed,
                        spec.attempt_number,
                        timeout_seconds,
                    ): spec
                    for spec in specs
                }
                for future in as_completed(futures):
                    spec = futures[future]
                    try:
                        value = future.result()
                        result = AttemptResult(
                            spec=spec,
                            value=value,
                            ignored_after_cancel=is_canceled(),
                        )
                    except BaseException as error:
                        result = AttemptResult(spec=spec, error=error)
                    self.persistence.record_attempt_result(evaluation_id, result)
                    attempts.append(result)
                    results_by_ordinal[spec.ordinal] = result

            if is_canceled():
                raise EvaluationCanceled("Evaluation was canceled during scoring")
            for ordinal, result in results_by_ordinal.items():
                if result.succeeded:
                    values[ordinal] = result.value
            pending = [
                ordinal
                for ordinal in pending
                if ordinal not in values
                and attempt_counts.get(ordinal, 0)
                < MAX_REPLACEMENT_ATTEMPTS + 1
            ]

        if not values:
            raise RuntimeError("All scoring runs failed")
        warning = "SCORING_RUNS_PARTIAL" if len(values) < requested_runs else None
        return ScoringOutcome(
            requested_runs=requested_runs,
            completed_runs=len(values),
            values_by_ordinal=dict(sorted(values.items())),
            attempts=tuple(attempts),
            warning_code=warning,
        )


__all__ = [
    "ALLOWED_TRANSITIONS",
    "AttemptResult",
    "AttemptSpec",
    "DeadlineExceeded",
    "EvaluationCanceled",
    "EvaluationStatus",
    "InvalidStageTransition",
    "MAX_REPLACEMENT_ATTEMPTS",
    "MAX_SCORING_RUNS",
    "MIN_EXTERNAL_CALL_BUDGET_SECONDS",
    "NullScoringPersistence",
    "ParallelScoringCoordinator",
    "SCORING_SEEDS",
    "STAGE_ORDER",
    "ScoringOutcome",
    "SoftDeadline",
    "TERMINAL_STATUSES",
    "replacement_seed",
    "validate_transition",
]
