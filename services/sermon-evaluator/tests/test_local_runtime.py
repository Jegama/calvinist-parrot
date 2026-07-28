from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from sermon_evaluator.fixture import FixtureProvider
from sermon_evaluator.schemas import (
    AggregatedSummaryFeedback,
    SermonExtractionStep1,
    SermonScoringStep2Raw,
)
from sermon_evaluator.service import SermonEvaluationService
from sermon_evaluator.storage import LocalFilesystemStorage


def test_local_storage_copies_private_audio_and_deletes_source(
    tmp_path: Path,
) -> None:
    source = tmp_path / "file-1.audio"
    metadata = tmp_path / "file-1.json"
    source.write_bytes(b"fixture-audio")
    metadata.write_text("{}")
    storage = LocalFilesystemStorage(root=tmp_path)

    downloaded = storage.download_to_temp(
        bucket_id="local-sermon-audio",
        file_id="file-1",
        suffix=".wav",
    )
    try:
        assert downloaded.path.read_bytes() == b"fixture-audio"
    finally:
        downloaded.cleanup()
    storage.delete_file(bucket_id="local-sermon-audio", file_id="file-1")
    assert not source.exists()
    assert not metadata.exists()


def test_fixture_provider_returns_valid_deterministic_schemas() -> None:
    provider = FixtureProvider()
    extraction = SermonExtractionStep1.model_validate(
        provider.generate_structured("", SermonExtractionStep1)
    )
    scoring = SermonScoringStep2Raw.model_validate(
        provider.generate_structured("", SermonScoringStep2Raw, seed=1689)
    )
    feedback = AggregatedSummaryFeedback.model_validate(
        provider.generate_structured("", AggregatedSummaryFeedback)
    )
    assert extraction.Proposition.startswith("God saves")
    assert scoring.Scoring_Confidence == pytest.approx(0.91)
    assert feedback.Overall_Impact
    assert provider.last_response_metadata.model_version == (
        "fixture-sermon-evaluator-v1"
    )


def test_local_environment_selects_filesystem_and_fixture(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("SERMON_RUNTIME", "local")
    monkeypatch.setenv("SERMON_EVALUATOR_PROVIDER", "fixture")
    monkeypatch.setenv("SERMON_LOCAL_AUDIO_DIR", str(tmp_path))
    monkeypatch.setattr(
        "sermon_evaluator.service.PsycopgPersistence",
        lambda: SimpleNamespace(),
    )

    service = SermonEvaluationService.from_environment()
    assert isinstance(service.storage, LocalFilesystemStorage)
    assert isinstance(service.provider, FixtureProvider)


def test_fixture_provider_is_rejected_outside_local_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SERMON_RUNTIME", "appwrite")
    monkeypatch.setenv("SERMON_EVALUATOR_PROVIDER", "fixture")
    with pytest.raises(ValueError, match="restricted to local runtime"):
        SermonEvaluationService.from_environment()
