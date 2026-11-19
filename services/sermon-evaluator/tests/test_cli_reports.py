from __future__ import annotations

import csv
import json
import wave
from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from sermon_evaluator.aggregation import SermonAggregator
from sermon_evaluator.audio import AudioFileManager
from sermon_evaluator.cli import DEFAULT_MODEL, main, parse_args
from sermon_evaluator.engine import SermonEvaluationEngine
from sermon_evaluator.reports import render_json, render_markdown
from sermon_evaluator.rubric import RUBRIC_SECTIONS
from sermon_evaluator.schemas import SermonExtractionStep1, SermonHarmonizedFeedback
from sermon_evaluator.service import SermonEvaluationService


def test_cli_preserves_flags_and_defaults() -> None:
    args = parse_args(
        [
            "--audio",
            "sermon.mp3",
            "--label",
            "romans-8",
            "--preacher",
            "Pastor",
            "--md-file",
            "report.md",
            "--markdown",
            "--num-scoring-runs",
            "3",
            "--preached-date",
            "2026-07-27",
            "--apply-duration-adjustment",
        ]
    )
    assert args.model == DEFAULT_MODEL
    assert args.num_scoring_runs == 3
    assert args.apply_duration_adjustment is True
    assert args.preached_date == "2026-07-27"


def test_cli_historic_files_are_jsonl_and_append(
    tmp_path: Path, extraction, scoring
) -> None:
    scoring.Aggregated_Summary = SermonAggregator().compute_aggregates(
        scoring, extraction
    )

    engine = Mock()
    engine.extract_structure_with_audio_file.return_value = extraction, "files/fake"
    engine.score_from_extraction.return_value = scoring
    engine_factory = Mock(return_value=engine)

    argv = [
        "--audio",
        "sermon.mp3",
        "--out-dir",
        str(tmp_path),
        "--label",
        "sermon",
        "--preacher",
        "Pastor",
    ]
    assert main(argv, engine_factory=engine_factory) == 0
    assert main(argv, engine_factory=engine_factory) == 0
    step1 = tmp_path / "sermon_step1_extraction.json"
    step2 = tmp_path / "sermon_step2_scoring.json"
    assert len(step1.read_text().splitlines()) == 2
    assert len(step2.read_text().splitlines()) == 2
    assert all(json.loads(line) for line in step1.read_text().splitlines())
    with (tmp_path / "sermon_aggregated_summary.csv").open(newline="") as stream:
        assert len(list(csv.DictReader(stream))) == 2


@pytest.mark.parametrize("runs", [1, 3])
def test_cli_scores_the_original_upload_if_audio_changes_during_extraction(
    tmp_path: Path, extraction, raw_scoring, runs
) -> None:
    audio = tmp_path / "sermon.wav"
    with wave.open(str(audio), "wb") as wav:
        wav.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
        wav.writeframes(bytes(16000))

    original = SimpleNamespace(name="files/original")
    provider = Mock()
    provider.upload_file.side_effect = [
        original, SimpleNamespace(name="files/replacement")
    ]

    def generate_with_audio(*, response_schema, **_):
        if response_schema is SermonExtractionStep1:
            audio.write_bytes(b"replacement sermon")
            return extraction.model_dump()
        return raw_scoring.model_dump()

    def generate_feedback(*, response_schema, **_):
        if response_schema is SermonHarmonizedFeedback:
            return {section.key: "Combined feedback" for section in RUBRIC_SECTIONS}
        return {"Overall_Impact": "Summary feedback"}

    provider.generate_structured_with_contents.side_effect = generate_with_audio
    provider.generate_structured.side_effect = generate_feedback
    engine = SermonEvaluationEngine(provider=provider)
    engine.audio_manager = AudioFileManager(tmp_path / "cache")
    argv = [
        "--audio", str(audio),
        "--out-dir", str(tmp_path),
        "--label", "sermon",
        "--preacher", "Pastor",
        "--num-scoring-runs", str(runs),
    ]
    assert main(argv, engine_factory=lambda **_: engine) == 0
    files_used = [
        call.kwargs["contents"][1]
        for call in provider.generate_structured_with_contents.call_args_list
    ]
    assert files_used == [original] * (1 + runs)
    provider.upload_file.assert_called_once_with(str(audio))


def test_reports_include_structure_scores_and_metadata(extraction, scoring) -> None:
    scoring.Aggregated_Summary = SermonAggregator().compute_aggregates(
        scoring, extraction
    )
    markdown = render_markdown(
        extraction, scoring, label="Romans 8", model=DEFAULT_MODEL
    )
    assert "Step 1 – Structural Extraction" in markdown
    assert "Step 2 – Analytical Scoring" in markdown
    assert "Aggregated Summary" in markdown
    assert markdown.index("## Aggregated Summary") < markdown.index(
        "## Evaluation Metadata"
    )
    assert markdown.index("| Metric | Score |") < markdown.index(
        "Generated:"
    )
    assert "## Aggregate Coaching" in markdown
    assert markdown.index("| Metric | Score |") < markdown.index(
        "## Aggregate Coaching"
    )
    assert markdown.rstrip().endswith("Duration Adjustment: Disabled")
    report = json.loads(
        render_json(extraction, scoring, metadata={"responseId": "response-1"})
    )
    assert report["metadata"]["responseId"] == "response-1"
    assert report["scoring"]["Aggregated_Summary"]["Overall_Impact_Base"]


def test_duration_adjustment_is_off_by_default(extraction, scoring) -> None:
    extraction.audio_duration = 20 * 60
    aggregator = SermonAggregator()
    summary = aggregator.compute_aggregates(scoring, extraction)
    summary = aggregator.apply_duration_penalty(
        summary, extraction.audio_duration, enabled=False
    )
    assert summary.duration_penalty is None
    assert summary.Overall_Impact == summary.Overall_Impact_Base
    assert summary.Overall_Impact_Adjusted is None


def test_report_regeneration_is_no_llm_and_idempotent(extraction, scoring) -> None:
    extraction.audio_duration = 20 * 60
    aggregator = SermonAggregator()
    summary = aggregator.compute_aggregates(scoring, extraction)
    scoring.Aggregated_Summary = aggregator.apply_duration_penalty(
        summary, extraction.audio_duration, enabled=False
    )

    class FakePersistence:
        published = None

        def fetch_completed_report_state(self, evaluation_id):
            return {
                "evaluationId": evaluation_id,
                "title": "Romans 8: No Condemnation",
                "status": "COMPLETE",
                "requestedRuns": 1,
                "completedRuns": 1,
                "durationAdjustmentEnabled": True,
                "durationPolicyUpdatedAt": datetime(
                    2026, 7, 28, tzinfo=timezone.utc
                ),
                "preachedOn": date(2026, 7, 27),
                "preacherName": "Pastor",
                "result": {
                    "extraction": extraction.model_dump(mode="json"),
                    "scoring": scoring.model_dump(mode="json"),
                },
                "provenance": {"configuredModelAlias": DEFAULT_MODEL},
            }

        def publish_report_set(
            self,
            evaluation_id,
            reports,
            *,
            result,
            expected_duration_adjustment_enabled,
            expected_duration_policy_updated_at,
        ):
            assert expected_duration_adjustment_enabled is True
            assert expected_duration_policy_updated_at == datetime(
                2026, 7, 28, tzinfo=timezone.utc
            )
            assert result["scoring"]["Aggregated_Summary"][
                "duration_adjustment_enabled"
            ] is True
            if self.published is None:
                self.published = reports
            else:
                assert reports == self.published
            return 2

    persistence = FakePersistence()
    service = SermonEvaluationService(
        persistence=persistence, storage=None, provider=None
    )
    first = service.regenerate_reports("evaluation")
    second = service.regenerate_reports("evaluation")
    assert first == second
    assert first["reportVersion"] == 2
    json_report = json.loads(persistence.published["JSON"])
    aggregate = json_report["scoring"]["Aggregated_Summary"]
    assert aggregate["duration_adjustment_enabled"] is True
    assert aggregate["Overall_Impact"] == aggregate["Overall_Impact_Adjusted"]
    assert json_report["metadata"]["title"] == "Romans 8: No Condemnation"
    assert json_report["metadata"]["preacherName"] == "Pastor"
    assert json_report["metadata"]["preachedOn"] == "2026-07-27"
    assert b"Romans 8: No Condemnation" in persistence.published["MARKDOWN"]
    csv_row = next(
        csv.DictReader(
            persistence.published["CSV"].decode("utf-8").splitlines()
        )
    )
    assert csv_row["label"] == "Romans 8: No Condemnation"
    assert csv_row["preacher"] == "Pastor"
    assert csv_row["preached_date"] == "2026-07-27"


def test_report_regeneration_replays_v1_illustration_payloads(
    extraction, scoring
) -> None:
    aggregator = SermonAggregator()
    scoring.Aggregated_Summary = aggregator.apply_duration_penalty(
        aggregator.compute_aggregates(scoring, extraction),
        extraction.audio_duration,
        enabled=False,
    )
    legacy_scoring = scoring.model_dump(mode="json")
    legacy_scoring["Illustrations"].pop("Ethical_Use")
    legacy_scoring.pop("Doctrinal_Fidelity")
    legacy_scoring.pop("Pastoral_Posture")
    legacy_scoring["Aggregated_Summary"].pop("Pastoral_Posture")

    class FakePersistence:
        published_result = None

        def fetch_completed_report_state(self, evaluation_id):
            return {
                "evaluationId": evaluation_id,
                "title": "Legacy sermon",
                "status": "COMPLETE",
                "requestedRuns": 1,
                "completedRuns": 1,
                "durationAdjustmentEnabled": False,
                "durationPolicyUpdatedAt": None,
                "preachedOn": date(2026, 7, 27),
                "preacherName": "Legacy Pastor",
                "result": {
                    "extraction": extraction.model_dump(mode="json"),
                    "scoring": legacy_scoring,
                },
                "provenance": {"configuredModelAlias": DEFAULT_MODEL},
            }

        def publish_report_set(self, evaluation_id, reports, *, result, **kwargs):
            del evaluation_id, reports, kwargs
            self.published_result = result
            return 3

    persistence = FakePersistence()
    service = SermonEvaluationService(
        persistence=persistence, storage=None, provider=None
    )

    regenerated = service.regenerate_reports("legacy-evaluation")

    assert regenerated["reportVersion"] == 3
    assert persistence.published_result is not None
    assert persistence.published_result["scoring"]["Illustrations"][
        "Ethical_Use"
    ] is None
