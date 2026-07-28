from __future__ import annotations

import csv
import json
from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from sermon_evaluator.aggregation import SermonAggregator
from sermon_evaluator.cli import DEFAULT_MODEL, main, parse_args
from sermon_evaluator.reports import render_json, render_markdown
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

    class FakeAudioManager:
        def upload_or_get_gemini_file(self, path, provider):
            return "files/fake", object()

    class FakeEngine:
        def __init__(self, **kwargs):
            self.audio_manager = FakeAudioManager()
            self.provider = object()

        def extract_structure_from_audio(self, path):
            return extraction

        def score_from_extraction(self, value, audio_file_obj):
            return scoring

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
    assert main(argv, engine_factory=FakeEngine) == 0
    assert main(argv, engine_factory=FakeEngine) == 0
    step1 = tmp_path / "sermon_step1_extraction.json"
    step2 = tmp_path / "sermon_step2_scoring.json"
    assert len(step1.read_text().splitlines()) == 2
    assert len(step2.read_text().splitlines()) == 2
    assert all(json.loads(line) for line in step1.read_text().splitlines())
    with (tmp_path / "sermon_aggregated_summary.csv").open(newline="") as stream:
        assert len(list(csv.DictReader(stream))) == 2


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
    assert summary.duration_penalty == 1.0
    assert summary.Overall_Impact == summary.Overall_Impact_Base
    assert summary.Overall_Impact_Adjusted < summary.Overall_Impact_Base


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
            expected_duration_adjustment_enabled,
            expected_duration_policy_updated_at,
        ):
            assert expected_duration_adjustment_enabled is True
            assert expected_duration_policy_updated_at == datetime(
                2026, 7, 28, tzinfo=timezone.utc
            )
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
