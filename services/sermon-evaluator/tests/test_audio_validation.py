from __future__ import annotations

from pathlib import Path
from struct import pack
from types import SimpleNamespace
from typing import Any

import pytest

import sermon_evaluator.audio as audio_module
from sermon_evaluator.audio import AudioFileManager, InvalidAudioError


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
