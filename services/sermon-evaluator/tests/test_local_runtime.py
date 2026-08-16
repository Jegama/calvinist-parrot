from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from sermon_evaluator.gemini import GeminiProvider
from sermon_evaluator.service import SermonEvaluationService
from sermon_evaluator.storage import LocalFilesystemStorage
from sermon_evaluator.worker import main as worker_main


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


def test_local_environment_selects_filesystem_and_gemini(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("SERMON_RUNTIME", "local")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("SERMON_GEMINI_MODEL", "gemini-test-model")
    monkeypatch.setenv("SERMON_LOCAL_AUDIO_DIR", str(tmp_path))
    monkeypatch.setattr(
        "sermon_evaluator.service.PsycopgPersistence",
        lambda: SimpleNamespace(),
    )

    service = SermonEvaluationService.from_environment()
    assert isinstance(service.storage, LocalFilesystemStorage)
    assert isinstance(service.provider, GeminiProvider)
    assert service.provider.model_name == "gemini-test-model"


def test_worker_readiness_reports_gemini(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    service = SimpleNamespace(
        persistence=SimpleNamespace(pool=None),
        recover=lambda *, limit: [],
    )
    monkeypatch.setenv("SERMON_RUNTIME", "local")
    monkeypatch.setattr(
        "sermon_evaluator.worker.SermonEvaluationService.from_environment",
        lambda: service,
    )

    assert worker_main(["--once"]) == 0
    readiness = json.loads(capsys.readouterr().out)
    assert readiness == {
        "event": "sermon-worker-ready",
        "runtime": "local",
        "provider": "gemini",
        "batchSize": 2,
    }
