from __future__ import annotations

import threading

import pytest

from sermon_evaluator.stages import (
    ParallelScoringCoordinator,
    SCORING_SEEDS,
    SoftDeadline,
    replacement_seed,
)


@pytest.mark.parametrize("requested_runs", [3, 9])
def test_requested_runs_overlap(requested_runs: int) -> None:
    barrier = threading.Barrier(requested_runs)
    seen: list[int] = []
    lock = threading.Lock()

    def score(ordinal: int, seed: int, attempt: int, timeout: float) -> int:
        assert timeout > 60
        assert attempt == 1
        barrier.wait(timeout=2)
        with lock:
            seen.append(seed)
        return ordinal

    outcome = ParallelScoringCoordinator(max_parallel=9).run(
        evaluation_id="evaluation-1",
        requested_runs=requested_runs,
        prompt_version="prompt-v1",
        deadline=SoftDeadline.from_budget(300),
        scoring_call=score,
    )
    assert outcome.completed_runs == requested_runs
    assert set(seen) == set(SCORING_SEEDS[:requested_runs])


def test_failures_retry_in_parallel_and_partial_success_warns() -> None:
    retry_barrier = threading.Barrier(2)
    attempts: dict[int, int] = {}

    def score(ordinal: int, seed: int, attempt: int, timeout: float) -> int:
        attempts[ordinal] = attempt
        if ordinal in {2, 3} and attempt == 1:
            raise RuntimeError("primary failed")
        if ordinal in {2, 3} and attempt == 2:
            retry_barrier.wait(timeout=2)
        if ordinal == 3:
            raise RuntimeError("slot remains failed")
        return ordinal

    outcome = ParallelScoringCoordinator(max_parallel=3).run(
        evaluation_id="evaluation-2",
        requested_runs=3,
        prompt_version="prompt-v1",
        deadline=SoftDeadline.from_budget(300),
        scoring_call=score,
    )
    assert outcome.completed_runs == 2
    assert outcome.warning_code == "SCORING_RUNS_PARTIAL"
    assert len({attempt.spec.seed for attempt in outcome.attempts}) == len(
        outcome.attempts
    )
    assert attempts[3] == 3


def test_replacement_seed_is_stable_and_collision_safe() -> None:
    first = replacement_seed(
        evaluation_id="evaluation",
        ordinal=4,
        attempt_number=2,
        prompt_version="v1",
        used_seeds=SCORING_SEEDS,
    )
    assert first == replacement_seed(
        evaluation_id="evaluation",
        ordinal=4,
        attempt_number=2,
        prompt_version="v1",
        used_seeds=SCORING_SEEDS,
    )
    second = replacement_seed(
        evaluation_id="evaluation",
        ordinal=4,
        attempt_number=2,
        prompt_version="v1",
        used_seeds=(*SCORING_SEEDS, first),
    )
    assert 0 < first <= 0x7FFFFFFF
    assert second != first


def test_resume_does_not_repeat_completed_slots() -> None:
    calls: list[int] = []

    def score(ordinal: int, seed: int, attempt: int, timeout: float) -> int:
        calls.append(ordinal)
        assert attempt == 2
        return ordinal

    outcome = ParallelScoringCoordinator().run(
        evaluation_id="resume",
        requested_runs=3,
        prompt_version="v1",
        deadline=SoftDeadline.from_budget(300),
        scoring_call=score,
        preexisting_values_by_ordinal={1: "complete"},
        prior_attempt_counts={1: 1, 2: 1, 3: 1},
        preexisting_seeds=SCORING_SEEDS[:3],
    )
    assert set(calls) == {2, 3}
    assert outcome.completed_runs == 3
