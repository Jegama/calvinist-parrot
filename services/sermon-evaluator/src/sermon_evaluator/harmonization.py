"""Self-consistency scoring and feedback synthesis for sermon evaluation."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Optional, Protocol

from .audio import AudioFileManager
from .rubric import RUBRIC_SECTIONS
from .schemas import (
    AggregatedSummaryFeedback,
    SermonExtractionStep1,
    SermonHarmonizedFeedback,
    SermonScoringStep2,
    SermonScoringStep2Raw,
)
from .stages import DeadlineExceeded, EvaluationCanceled


SCORING_SEEDS = [1689, 2025, 3141, 4567, 5000, 6789, 7890, 8888, 9999]
MAX_RETRY_BATCHES = 2
MAX_PARALLEL_WORKERS = 5


class ProviderProtocol(Protocol):
    def generate_structured(
        self,
        prompt: str,
        response_schema: type,
        system: Optional[str],
        model: str,
        seed: Optional[int] = None,
    ) -> dict: ...

    def generate_structured_with_contents(
        self,
        contents: list,
        response_schema: type,
        system: Optional[str],
        model: str,
        seed: Optional[int] = None,
    ) -> dict: ...


class PromptsProtocol(Protocol):
    SCORING_INSTRUCTIONS: str
    SCORING_SYSTEM_PROMPT: str
    HARMONIZE_INSTRUCTIONS: str
    HARMONIZE_SYSTEM_PROMPT: str
    AGG_SUMMARY_INSTRUCTIONS: str
    AGG_SUMMARY_SYSTEM_PROMPT: str


class SermonHarmonizer:
    """Run independent judges and synthesize their scores and feedback."""

    def __init__(
        self,
        provider: ProviderProtocol,
        model: str,
        prompts: PromptsProtocol,
        *,
        apply_duration_adjustment: bool = False,
    ) -> None:
        self.provider = provider
        self.model = model
        self.prompts = prompts
        self.apply_duration_adjustment = apply_duration_adjustment
        self.audio_manager = AudioFileManager()

    def score_single_run(
        self,
        extraction: SermonExtractionStep1,
        audio_file_obj: Optional[Any],
        seed: int,
    ) -> Optional[SermonScoringStep2Raw]:
        try:
            extraction_json = json.dumps(
                extraction.model_dump(
                    mode="json", exclude={"audio_duration"}
                ),
                ensure_ascii=False,
            )
            scoring_prompt = (
                f"{self.prompts.SCORING_INSTRUCTIONS}\n\n"
                f"Step 1 JSON below:\n\n{extraction_json}"
            )
            if audio_file_obj is not None:
                data = self.provider.generate_structured_with_contents(
                    contents=[scoring_prompt, audio_file_obj],
                    response_schema=SermonScoringStep2Raw,
                    system=self.prompts.SCORING_SYSTEM_PROMPT,
                    model=self.model,
                    seed=seed,
                )
            else:
                data = self.provider.generate_structured(
                    prompt=scoring_prompt,
                    response_schema=SermonScoringStep2Raw,
                    system=self.prompts.SCORING_SYSTEM_PROMPT,
                    model=self.model,
                    seed=seed,
                )
            return SermonScoringStep2Raw(**data)
        except (DeadlineExceeded, EvaluationCanceled):
            raise
        except Exception as exc:
            print(f"[sermons] Warning: scoring run with seed {seed} failed: {exc}")
            return None

    def score_multi_run(
        self,
        extraction: SermonExtractionStep1,
        audio_file_obj: Optional[Any],
        num_runs: int = 3,
    ) -> SermonScoringStep2:
        if not isinstance(num_runs, int) or num_runs < 1:
            raise ValueError(f"num_runs must be a positive integer, got {num_runs}")
        if num_runs > len(SCORING_SEEDS):
            raise ValueError(
                f"num_runs ({num_runs}) exceeds available seeds ({len(SCORING_SEEDS)})"
            )

        print(
            f"[sermons] Running {num_runs} parallel scoring runs for self-consistency..."
        )
        runs: list[SermonScoringStep2Raw] = []
        seed_index = 0
        retry_batch = 0

        while len(runs) < num_runs and retry_batch <= MAX_RETRY_BATCHES:
            needed = num_runs - len(runs)
            batch_seeds = SCORING_SEEDS[seed_index : seed_index + needed]
            seed_index += needed
            if retry_batch > 0:
                print(
                    f"[sermons] Retry batch {retry_batch}: running {needed} more attempts..."
                )
            with ThreadPoolExecutor(
                max_workers=min(needed, MAX_PARALLEL_WORKERS)
            ) as executor:
                futures = {
                    executor.submit(
                        self.score_single_run, extraction, audio_file_obj, seed
                    ): seed
                    for seed in batch_seeds
                }
                for future in as_completed(futures):
                    result = future.result()
                    if result is not None:
                        runs.append(result)
            retry_batch += 1

        if not runs:
            raise RuntimeError(
                "All scoring runs failed. Cannot proceed with self-consistency evaluation."
            )
        if len(runs) < num_runs:
            print(
                f"[sermons] Warning: only {len(runs)}/{num_runs} runs succeeded; proceeding with available results."
            )
        return self.harmonize_runs(runs, extraction, audio_file_obj)

    def harmonize_runs(
        self,
        runs: list[SermonScoringStep2Raw],
        extraction: SermonExtractionStep1,
        audio_file_obj: Optional[Any],
    ) -> SermonScoringStep2:
        del extraction, audio_file_obj
        if not runs:
            raise ValueError("At least one scoring run is required")

        print(f"[sermons] Harmonizing {len(runs)} scoring runs...")
        confidences = [run.Scoring_Confidence for run in runs]
        confidence_total = sum(confidences)
        weights = (
            [confidence / confidence_total for confidence in confidences]
            if confidence_total > 0
            else [1.0 / len(runs)] * len(runs)
        )

        def weighted_int(values: list[int]) -> int:
            value = sum(score * weight for score, weight in zip(values, weights))
            return max(1, min(5, round(value)))

        averaged_sections: dict[str, Any] = {}
        for section_definition in RUBRIC_SECTIONS:
            section_runs = [getattr(run, section_definition.key) for run in runs]
            payload: dict[str, Any] = {
                criterion.key: weighted_int(
                    [getattr(section, criterion.key) for section in section_runs]
                )
                for criterion in section_definition.criteria
            }
            payload["Overall"] = weighted_int(
                [section.Overall for section in section_runs]
            )
            payload["Feedback"] = ""
            if section_definition.key == "Doctrinal_Fidelity":
                fail_weight = sum(
                    weight
                    for section, weight in zip(section_runs, weights)
                    if section.Core_Doctrine_Gate == "FAIL"
                )
                payload["Core_Doctrine_Gate"] = (
                    "FAIL" if fail_weight >= 0.5 else "PASS"
                )
                payload["Gate_Reason"] = (
                    next(
                        (
                            section.Gate_Reason
                            for section in section_runs
                            if section.Core_Doctrine_Gate == "FAIL"
                            and section.Gate_Reason
                        ),
                        None,
                    )
                    if payload["Core_Doctrine_Gate"] == "FAIL"
                    else None
                )
            averaged_sections[section_definition.key] = type(section_runs[0])(
                **payload
            )

        scoring = SermonScoringStep2(
            **averaged_sections,
            Strengths=runs[0].Strengths,
            Growth_Areas=runs[0].Growth_Areas,
            Next_Steps=runs[0].Next_Steps,
            Scoring_Confidence=sum(
                confidence * weight
                for confidence, weight in zip(confidences, weights)
            ),
        )

        harmonize_input = {
            "averaged_scores": scoring.model_dump(mode="json"),
            "runs_feedback": [
                {
                    "run_id": index + 1,
                    "confidence": run.Scoring_Confidence,
                    "sections": {
                        section.key: {
                            "feedback": getattr(run, section.key).Feedback,
                            **(
                                {
                                    "core_doctrine_gate": getattr(
                                        run, section.key
                                    ).Core_Doctrine_Gate,
                                    "gate_reason": getattr(
                                        run, section.key
                                    ).Gate_Reason,
                                }
                                if section.key == "Doctrinal_Fidelity"
                                else {}
                            ),
                        }
                        for section in RUBRIC_SECTIONS
                    },
                    "strengths": run.Strengths,
                    "growth_areas": run.Growth_Areas,
                    "next_steps": run.Next_Steps,
                }
                for index, run in enumerate(runs)
            ],
        }
        harmonize_prompt = (
            f"{self.prompts.HARMONIZE_INSTRUCTIONS}\n\n"
            f"Harmonization Input:\n"
            f"{json.dumps(harmonize_input, ensure_ascii=False, indent=2)}"
        )

        try:
            with self.audio_manager.upload_indicator(
                message="Harmonizing self-consistency feedback"
            ):
                feedback_data = self.provider.generate_structured(
                    prompt=harmonize_prompt,
                    response_schema=SermonHarmonizedFeedback,
                    system=self.prompts.HARMONIZE_SYSTEM_PROMPT,
                    model=self.model,
                )
            feedback = SermonHarmonizedFeedback(**feedback_data)
            for section_definition in RUBRIC_SECTIONS:
                getattr(scoring, section_definition.key).Feedback = getattr(
                    feedback, section_definition.key
                )
            if (
                scoring.Doctrinal_Fidelity
                and scoring.Doctrinal_Fidelity.Core_Doctrine_Gate == "FAIL"
                and feedback.Doctrinal_Gate_Reason
            ):
                scoring.Doctrinal_Fidelity.Gate_Reason = (
                    feedback.Doctrinal_Gate_Reason
                )
            scoring.Strengths = feedback.Strengths
            scoring.Growth_Areas = feedback.Growth_Areas
            scoring.Next_Steps = feedback.Next_Steps
        except (DeadlineExceeded, EvaluationCanceled):
            raise
        except Exception as exc:
            print(
                "[sermons] Warning: self-consistency feedback synthesis failed; "
                f"using the first run's feedback: {exc}"
            )
            for section_definition in RUBRIC_SECTIONS:
                getattr(scoring, section_definition.key).Feedback = (
                    getattr(runs[0], section_definition.key).Feedback or ""
                )

        return scoring

    def _generate_aggregate_feedback(
        self,
        scoring: SermonScoringStep2,
        extraction: SermonExtractionStep1,
        num_runs: int,
    ) -> None:
        if scoring.Aggregated_Summary is None:
            raise ValueError("Aggregated scores are required before feedback synthesis")

        extraction_payload = extraction.model_dump(mode="json")
        summary_payload = scoring.Aggregated_Summary.model_dump(mode="json")
        extraction_payload.pop("audio_duration", None)
        summary_payload.pop("duration_penalty", None)
        summary_payload.pop("Overall_Impact_Adjusted", None)
        summary_payload.pop("duration_adjustment_enabled", None)
        summary_payload["Overall_Impact"] = summary_payload[
            "Overall_Impact_Base"
        ]
        duration_policy = (
            "Duration policy is outside homiletical coaching. Do not mention "
            "duration, preach time, sermon length, a duration penalty, or a "
            "hypothetical adjustment. Explain Overall_Impact_Base."
        )

        scoring_payload = scoring.model_dump(
            mode="json", exclude={"Aggregated_Summary_Feedback"}
        )
        scoring_payload["Aggregated_Summary"] = summary_payload
        method_note = (
            f"Self-consistency note: {num_runs} independent scoring runs were "
            "combined using confidence-weighted numeric aggregation and "
            "feedback synthesis."
            if num_runs > 1
            else "Evaluation method: one scoring run."
        )
        aggregate_prompt = (
            f"{self.prompts.AGG_SUMMARY_INSTRUCTIONS}\n\n"
            f"{method_note}\n{duration_policy}\n\n"
            f"Step 1 JSON:\n"
            f"{json.dumps(extraction_payload, ensure_ascii=False)}\n\n"
            f"Step 2 JSON:\n"
            f"{json.dumps(scoring_payload, ensure_ascii=False)}\n\n"
            f"Aggregated Summary JSON:\n"
            f"{json.dumps(summary_payload, ensure_ascii=False)}"
        )

        with self.audio_manager.upload_indicator(
            message="Generating aggregate feedback"
        ):
            feedback_data = self.provider.generate_structured(
                prompt=aggregate_prompt,
                response_schema=AggregatedSummaryFeedback,
                system=self.prompts.AGG_SUMMARY_SYSTEM_PROMPT,
                model=self.model,
            )
        scoring.Aggregated_Summary_Feedback = AggregatedSummaryFeedback(
            **feedback_data
        )


__all__ = ["SermonHarmonizer"]
