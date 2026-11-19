from __future__ import annotations

import json
import multiprocessing
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from struct import pack
from types import SimpleNamespace
from typing import Any
from unittest.mock import Mock

import pytest

import sermon_evaluator.audio as audio_module
from sermon_evaluator.audio import AudioFileManager, InvalidAudioError


@pytest.mark.parametrize("custom_directory", [False, True])
def test_cli_upload_cache_is_lazy_and_reused(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, custom_directory: bool
) -> None:
    scratch = tmp_path / "scratch"
    scratch.mkdir()
    monkeypatch.setattr(audio_module.tempfile, "tempdir", str(scratch))
    deployment = tmp_path / "deployment"
    deployment.mkdir()
    monkeypatch.chdir(deployment)
    cache_dir = scratch / "custom" if custom_directory else None
    manager = AudioFileManager(cache_dir)
    assert list(scratch.iterdir()) == []

    audio = tmp_path / "sermon.wav"
    audio.write_bytes(b"audio")
    provider = Mock()
    remote = SimpleNamespace(name="files/sermon")
    provider.upload_file.return_value = remote
    provider.get_file.return_value = remote
    uploaded = manager.upload_or_get_gemini_file(str(audio), provider)
    assert uploaded == (remote.name, remote)
    assert any((cache_dir or scratch).iterdir())
    next_manager = AudioFileManager(cache_dir)
    assert next_manager.upload_or_get_gemini_file(str(audio), provider) == uploaded
    provider.upload_file.assert_called_once_with(str(audio))
    provider.get_file.assert_called_once_with(remote.name)
    assert list(deployment.iterdir()) == []


def test_replaced_audio_at_the_same_path_is_uploaded_again(tmp_path, monkeypatch):
    manager = AudioFileManager(tmp_path / "cache")
    audio = tmp_path / "sermon.wav"
    provider = Mock()
    original = SimpleNamespace(name="files/original")
    revised = SimpleNamespace(name="files/revised")
    provider.upload_file.side_effect = [original, revised]
    provider.get_file.side_effect = lambda name: SimpleNamespace(name=name)
    audio.write_bytes(b"first sermon")
    assert manager.upload_or_get_gemini_file(str(audio), provider)[0] == original.name

    monkeypatch.chdir(tmp_path)
    audio.write_bytes(b"other sermon")
    assert manager.upload_or_get_gemini_file(audio.name, provider)[0] == revised.name
    assert manager.upload_or_get_gemini_file(audio.name, provider)[0] == revised.name
    provider.get_file.assert_called_once_with(revised.name)


@pytest.mark.skipif(not hasattr(os, "getuid"), reason="POSIX cache permissions")
@pytest.mark.parametrize("obstruction", ["non-private directory", "regular file"])
def test_unavailable_default_cache_falls_back_to_private_temp(
    tmp_path, monkeypatch, obstruction
):
    monkeypatch.setattr(audio_module.tempfile, "tempdir", str(tmp_path))
    stable = tmp_path / f"calvinist-parrot-{os.getuid()}"
    if obstruction == "regular file":
        stable.write_bytes(b"keep")
    else:
        stable.mkdir()
        stable.chmod(0o755)

    audio = tmp_path / "sermon.wav"
    audio.write_bytes(b"sermon")
    manager = AudioFileManager()
    provider = Mock()
    remote = SimpleNamespace(name="files/original")
    provider.get_file.return_value = provider.upload_file.return_value = remote
    assert manager.upload_or_get_gemini_file(str(audio), provider)[1] is remote
    assert manager.upload_or_get_gemini_file(str(audio), provider)[1] is remote
    provider.upload_file.assert_called_once()
    fallback, = [p for p in tmp_path.iterdir() if p not in (audio, stable)]
    assert fallback.stat().st_mode & 0o777 == 0o700
    if stable.is_dir():
        assert list(stable.iterdir()) == []
    else:
        assert stable.read_bytes() == b"keep"


@pytest.mark.parametrize(("remaining", "refresh"), [
    (timedelta(minutes=2), True),
    (timedelta(days=1), False),
])
def test_cached_gemini_file_has_time_for_extraction_and_scoring(
    tmp_path, remaining, refresh
):
    audio = tmp_path / "sermon.wav"
    audio.write_bytes(b"sermon")
    manager = AudioFileManager(tmp_path / "cache")
    original = SimpleNamespace(name="files/original")
    cached = SimpleNamespace(name=original.name, expiration_time=datetime.now(UTC) + remaining)
    fresh = SimpleNamespace(name="files/fresh")
    provider = Mock()
    provider.upload_file.side_effect = [original, fresh]
    provider.get_file.return_value = cached
    manager.upload_or_get_gemini_file(str(audio), provider)
    selected_id, selected_file = manager.upload_or_get_gemini_file(str(audio), provider)
    expected = fresh if refresh else cached
    assert selected_file is expected
    assert selected_id == expected.name


def test_legacy_path_only_cache_entry_requires_a_fresh_upload(tmp_path):
    audio = tmp_path / "sermon.wav"
    audio.write_bytes(b"current sermon")
    (tmp_path / "gemini_files_cache.json").write_text(
        json.dumps({str(audio): "files/unverified"})
    )
    provider = Mock()
    provider.upload_file.return_value = SimpleNamespace(name="files/current")
    manager = AudioFileManager(tmp_path)
    assert manager.upload_or_get_gemini_file(str(audio), provider)[0] == "files/current"
    provider.get_file.assert_not_called()


def _upload_in_process(cache_dir, audio, uploads_ready):
    def upload(path):
        # Both processes have finished their first cache lookup before either saves.
        uploads_ready.wait(timeout=10)
        return SimpleNamespace(name=f"files/{Path(path).stem}")

    provider = Mock(upload_file=upload)
    AudioFileManager(cache_dir).upload_or_get_gemini_file(str(audio), provider)


def test_overlapping_cli_uploads_preserve_both_entries(tmp_path):
    cache_dir = tmp_path / "cache"
    audio_files = [tmp_path / "one.wav", tmp_path / "two.wav"]
    context = multiprocessing.get_context("spawn")
    uploads_ready = context.Barrier(len(audio_files))
    processes = []
    for audio in audio_files:
        audio.write_bytes(audio.stem.encode())
        process = context.Process(
            target=_upload_in_process, args=(cache_dir, audio, uploads_ready)
        )
        process.start()
        processes.append(process)
    try:
        for process in processes:
            process.join(timeout=20)
            assert process.exitcode == 0
    finally:
        for process in processes:
            if process.is_alive():
                process.terminate()
                process.join()

    provider = Mock()
    provider.upload_file.side_effect = AssertionError("Lost a saved upload")
    provider.get_file.side_effect = lambda name: SimpleNamespace(name=name)
    manager = AudioFileManager(cache_dir)
    for audio in audio_files:
        remote_id, _ = manager.upload_or_get_gemini_file(str(audio), provider)
        assert remote_id == f"files/{audio.stem}"


def test_failed_refresh_preserves_the_previous_cache_entry(tmp_path, monkeypatch):
    cache_dir = tmp_path / "cache"
    manager = AudioFileManager(cache_dir)
    audio = tmp_path / "sermon.wav"
    audio.write_bytes(b"original")
    provider = Mock()
    original = SimpleNamespace(name="files/original")
    provider.upload_file.side_effect = [original, SimpleNamespace(name="files/refresh")]
    provider.get_file.side_effect = [TimeoutError(), original]
    manager.upload_or_get_gemini_file(str(audio), provider)
    entries = list(cache_dir.iterdir())

    def fail_replace(*_):
        raise OSError("Cache write interrupted")

    monkeypatch.setattr(audio_module.os, "replace", fail_replace)
    with pytest.raises(OSError, match="Cache write interrupted"):
        manager.upload_or_get_gemini_file(str(audio), provider)
    assert list(cache_dir.iterdir()) == entries
    assert manager.upload_or_get_gemini_file(str(audio), provider) == (original.name, original)
    provider.get_file.assert_called_with(original.name)


def test_audio_changed_during_upload_is_never_cached(tmp_path):
    audio = tmp_path / "sermon.wav"
    audio.write_bytes(b"first version")
    provider = Mock()

    def replace_audio(path):
        Path(path).write_bytes(b"replacement")
        return SimpleNamespace(name="files/changed")

    provider.upload_file.side_effect = replace_audio
    manager = AudioFileManager(tmp_path / "cache")
    with pytest.raises(InvalidAudioError, match="Audio changed"):
        manager.upload_or_get_gemini_file(str(audio), provider)

    audio.write_bytes(b"first version")
    provider.upload_file.side_effect = None
    provider.upload_file.return_value = SimpleNamespace(name="files/original")
    assert manager.upload_or_get_gemini_file(str(audio), provider)[0] == "files/original"
    provider.get_file.assert_not_called()


def _fake_container(
    monkeypatch: pytest.MonkeyPatch, actual_container: str
) -> None:
    class FakeMP3:
        def __init__(self) -> None:
            self.info = SimpleNamespace(length=60.0)

    class FakeMP4:
        def __init__(self) -> None:
            self.info = SimpleNamespace(length=60.0)

    class FakeWAVE:
        def __init__(self) -> None:
            self.info = SimpleNamespace(length=60.0)

    containers: dict[str, type[Any]] = {
        "mpeg": FakeMP3,
        "mp4": FakeMP4,
        "wav": FakeWAVE,
    }
    monkeypatch.setattr(audio_module, "MP3", FakeMP3)
    monkeypatch.setattr(audio_module, "MP4", FakeMP4)
    monkeypatch.setattr(audio_module, "WAVE", FakeWAVE)
    monkeypatch.setattr(
        audio_module,
        "MutagenFile",
        lambda _path: containers[actual_container](),
    )


def _mpeg1_layer3_frame(bitrate_index: int) -> bytes:
    bitrate_kbps = [
        0,
        32,
        40,
        48,
        56,
        64,
        80,
        96,
        112,
        128,
        160,
        192,
        224,
        256,
        320,
        0,
    ][bitrate_index]
    sample_rate = 48_000
    header = (
        0xFFE00000
        | (0b11 << 19)
        | (0b01 << 17)
        | (1 << 16)
        | (bitrate_index << 12)
        | (0b01 << 10)
    )
    frame_length = 144 * bitrate_kbps * 1000 // sample_rate
    return pack(">I", header) + bytes(frame_length - 4)


@pytest.mark.parametrize(
    ("extension", "mime_type", "container"),
    [
        (".mp3", "audio/mpeg", "mpeg"),
        (".mp3", "audio/mp3", "mpeg"),
        (".m4a", "audio/mp4", "mp4"),
        (".m4a", "audio/x-m4a", "mp4"),
        (".wav", "audio/wav", "wav"),
        (".wav", "audio/wave", "wav"),
        (".wav", "audio/x-wav", "wav"),
    ],
)
def test_audio_container_accepts_supported_mime_aliases(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    extension: str,
    mime_type: str,
    container: str,
) -> None:
    _fake_container(monkeypatch, container)
    path = tmp_path / f"sermon{extension}"
    path.write_bytes(b"valid-container-fixture")

    _, byte_size, duration = AudioFileManager.validate_local_audio(
        path,
        expected_size=path.stat().st_size,
        declared_mime_type=mime_type,
        declared_extension=extension,
    )

    assert byte_size == path.stat().st_size
    assert duration == 60.0


def test_renamed_mp3_cannot_pass_as_wav(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _fake_container(monkeypatch, "mpeg")
    path = tmp_path / "renamed.wav"
    path.write_bytes(b"mp3-bytes")

    with pytest.raises(
        InvalidAudioError,
        match="container does not match its filename extension",
    ):
        AudioFileManager.validate_local_audio(
            path,
            declared_mime_type="audio/wav",
            declared_extension=".wav",
        )


def test_declared_mime_and_extension_must_agree_before_processing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _fake_container(monkeypatch, "mpeg")
    path = tmp_path / "sermon.mp3"
    path.write_bytes(b"mp3-bytes")

    with pytest.raises(
        InvalidAudioError,
        match="MIME type and filename extension do not match",
    ):
        AudioFileManager.validate_local_audio(
            path,
            declared_mime_type="audio/x-wav",
            declared_extension=".mp3",
        )


def test_headerless_vbr_mp3_duration_counts_frames_instead_of_first_bitrate(
    tmp_path: Path,
) -> None:
    path = tmp_path / "headerless-vbr.mp3"
    frames = [_mpeg1_layer3_frame(9)] + [
        _mpeg1_layer3_frame(13) for _ in range(99)
    ]
    path.write_bytes(b"".join(frames))

    _, _, duration = AudioFileManager.validate_local_audio(
        path,
        declared_mime_type="audio/mpeg",
        declared_extension=".mp3",
    )

    assert duration == pytest.approx(2.4)
    assert AudioFileManager.get_audio_duration(str(path)) == pytest.approx(2.4)
