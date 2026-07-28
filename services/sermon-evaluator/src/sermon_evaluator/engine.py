"""Sermon evaluation engine (language-agnostic):

Provides two-step evaluation per resources/Sermon Evaluation Framework.md:
 - Step 1: Structural extraction into JSON (deterministic)
 - Step 2: Analytical scoring with 1-5 rubric

Provider: Gemini only (supports both text and audio via Files API)
 - Text: transcript input
 - Audio: mp3, wav, m4a files via Files API with upload caching

CLI wrapper is implemented separately in cp_eval_sermons.py
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from .schemas import (
    SermonExtractionStep1,
    SermonScoringStep2,
    SermonScoringStep2Raw,
)
from .gemini import ParrotAIGemini
from .audio import AudioFileManager
from .calibration import SermonScoreCalibrator
from .aggregation import SermonAggregator
from .harmonization import SermonHarmonizer

def _load_sermon_prompts():
    return prompts


class SermonEvaluationEngine:
    """Two-step sermon evaluation runner.

    Note: Language-agnostic; assumes English prompts. For other languages, add a new
    prompts module or extend routing.
    """

    def __init__(
        self,
        model: str = "gemini-3.6-flash",
        *,
        provider: Optional[Any] = None,
        apply_duration_adjustment: bool = False,
    ) -> None:
        self.provider_name = "gemini"
        self.model = model
        self.apply_duration_adjustment = apply_duration_adjustment
        self.prompts = _load_sermon_prompts()
        self.provider = provider or ParrotAIGemini(model=model)
        self.provider.set_model(model)

        # Initialize helper components
        self.audio_manager = AudioFileManager()
        self.calibrator = SermonScoreCalibrator()
        self.aggregator = SermonAggregator()
        self.harmonizer = SermonHarmonizer(
            self.provider,
            self.model,
            self.prompts,
            apply_duration_adjustment=apply_duration_adjustment,
        )

    # ----------- Step 1: Extraction -----------
    def extract_structure_from_text(self, transcript: str) -> SermonExtractionStep1:
        """Extract sermon structure from text transcript."""
        system = self.prompts.EXTRACTION_SYSTEM_PROMPT
        with self.audio_manager.upload_indicator(
            message="Step 1: Extracting structure from transcript"
        ):
            data = self.provider.generate_structured(
                prompt=f"{self.prompts.EXTRACTION_INSTRUCTIONS_TEXT}\n\n{transcript}",
                response_schema=SermonExtractionStep1,
                system=system,
                model=self.model,
            )
        return SermonExtractionStep1(**data)

    def extract_structure_from_audio(self, audio_path: str) -> SermonExtractionStep1:
        """Extract sermon structure from audio file."""
        if self.provider_name != "gemini":
            raise ValueError("Audio extraction currently supported only for Gemini")

        # Extract duration before upload
        duration = self.audio_manager.get_audio_duration(audio_path)
        if duration:
            print(f"[sermons] Audio duration: {duration / 60.0:.1f} minutes")

        file_id, file_obj = self.audio_manager.upload_or_get_gemini_file(
            audio_path, self.provider
        )

        if file_obj is None and hasattr(self.provider, "get_file"):
            try:
                file_obj = self.provider.get_file(file_id)
            except Exception as e:
                print(
                    f"[sermons] Warning: could not retrieve file object for {file_id}; proceeding with id only. {e}"
                )

        instruction = self.prompts.EXTRACTION_INSTRUCTIONS_AUDIO
        system = self.prompts.EXTRACTION_SYSTEM_PROMPT

        with self.audio_manager.upload_indicator(
            message="Step 1: Extracting structure from audio"
        ):
            data = self.provider.generate_structured_with_contents(
                contents=[instruction, file_obj or file_id],
                response_schema=SermonExtractionStep1,
                system=system,
                model=self.model,
            )

        extraction = SermonExtractionStep1(**data)
        extraction.audio_duration = duration
        return extraction

    # ----------- Step 2: Scoring -----------
    def score_from_extraction(
        self,
        extraction: SermonExtractionStep1,
        audio_file_obj: Optional[Any] = None,
    ) -> SermonScoringStep2:
        """Score sermon from Step 1 extraction (single run)."""
        extraction_json = json.dumps(extraction.model_dump(), ensure_ascii=False)
        scoring_prompt = (
            f"{self.prompts.SCORING_INSTRUCTIONS}\\n\\n"
            f"Step 1 JSON below:\\n\\n{extraction_json}"
        )
        system = self.prompts.SCORING_SYSTEM_PROMPT

        with self.audio_manager.upload_indicator(
            message="Step 2: Scoring sermon (rubric)"
        ):
            if audio_file_obj is not None:
                data = self.provider.generate_structured_with_contents(
                    contents=[scoring_prompt, audio_file_obj],
                    response_schema=SermonScoringStep2Raw,
                    system=system,
                    model=self.model,
                )
            else:
                data = self.provider.generate_structured(
                    prompt=scoring_prompt,
                    response_schema=SermonScoringStep2Raw,
                    system=system,
                    model=self.model,
                )

        raw_scoring = SermonScoringStep2Raw(**data)

        # Convert raw to full scoring object
        scoring = SermonScoringStep2(
            Introduction=raw_scoring.Introduction,
            Proposition=raw_scoring.Proposition,
            Main_Points=raw_scoring.Main_Points,
            Exegetical_Support=raw_scoring.Exegetical_Support,
            Application=raw_scoring.Application,
            Illustrations=raw_scoring.Illustrations,
            Conclusion=raw_scoring.Conclusion,
            Strengths=raw_scoring.Strengths,
            Growth_Areas=raw_scoring.Growth_Areas,
            Next_Steps=raw_scoring.Next_Steps,
            Scoring_Confidence=raw_scoring.Scoring_Confidence,
        )

        # Apply post-processing pipeline: strict -> ceiling compression -> aggregates -> duration
        scoring = self.calibrator.apply_strict_calibration(scoring, extraction)
        scoring = self.calibrator.apply_ceiling_compression(scoring, extraction)
        scoring.Aggregated_Summary = self.aggregator.compute_aggregates(
            scoring, extraction
        )

        if extraction.audio_duration is not None:
            scoring.Aggregated_Summary = self.aggregator.apply_duration_penalty(
                scoring.Aggregated_Summary,
                extraction.audio_duration,
                enabled=self.apply_duration_adjustment,
            )

        # Generate aggregate feedback
        self._generate_aggregate_feedback(scoring, extraction, num_runs=1)

        return scoring

    def score_from_extraction_multi_run(
        self,
        extraction: SermonExtractionStep1,
        audio_file_obj: Optional[Any],
        num_runs: int = 3,
    ) -> SermonScoringStep2:
        """Execute multiple parallel Step 2 scoring runs and harmonize results.

        Uses ThreadPoolExecutor for parallel API calls. Retries failed runs up to 2 batches
        until num_runs successful results are obtained. Returns harmonized scoring with
        averaged integers and synthesized feedback.
        """
        return self.harmonizer.score_multi_run(extraction, audio_file_obj, num_runs)

    def _generate_aggregate_feedback(
        self,
        scoring: SermonScoringStep2,
        extraction: SermonExtractionStep1,
        num_runs: int,
    ) -> None:
        """Generate and attach aggregate feedback to scoring.

        Delegates to harmonizer's implementation to avoid code duplication.
        """
        self.harmonizer._generate_aggregate_feedback(scoring, extraction, num_runs)

    # ----------- Legacy helpers (preserved for compatibility) -----------
    @staticmethod
    def get_audio_duration(file_path: str) -> Optional[float]:
        """Extract audio duration in seconds (legacy compatibility wrapper)."""
        return AudioFileManager.get_audio_duration(file_path)

    @staticmethod
    def _safe_json_parse(text: str) -> Dict[str, Any]:
        """Parse JSON from potentially wrapped text (legacy helper)."""
        text = text.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:]
        try:
            return json.loads(text)
        except Exception:
            first = text.find("{")
            last = text.rfind("}")
            if first != -1 and last != -1 and last > first:
                return json.loads(text[first : last + 1])
            raise


__all__ = [
    "SermonEvaluationEngine",
]
