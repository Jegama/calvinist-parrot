"""Audio helpers shared by the local CLI and the Appwrite worker."""

from __future__ import annotations

import hashlib
import itertools
import json
import os
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterator, Optional, Tuple

from mutagen import File as MutagenFile
from mutagen.mp3 import MP3
from mutagen.mp4 import MP4
from mutagen.wave import WAVE

ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".m4a", ".wav"}
ALLOWED_AUDIO_MIME_TYPES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
}
MAX_AUDIO_BYTES = 60 * 1024 * 1024
MAX_AUDIO_DURATION_SECONDS = 3 * 60 * 60
CONTAINER_BY_EXTENSION = {
    ".mp3": "mpeg",
    ".m4a": "mp4",
    ".wav": "wav",
}
CONTAINER_BY_MIME_TYPE = {
    "audio/mpeg": "mpeg",
    "audio/mp3": "mpeg",
    "audio/mp4": "mp4",
    "audio/x-m4a": "mp4",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
}


class InvalidAudioError(ValueError):
    """Raised when an audio file violates the production input contract."""


class AudioFileManager:
    """Manage deterministic audio validation, duration, hashing, and CLI caching."""

    def __init__(self, cache_dir: Path = Path(".cache")) -> None:
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(exist_ok=True)
        self.audio_cache_path = self.cache_dir / "gemini_files_cache.json"
        if not self.audio_cache_path.exists():
            self.audio_cache_path.write_text("{}", encoding="utf-8")

    @staticmethod
    def get_audio_duration(file_path: str) -> Optional[float]:
        """Return duration in seconds using mutagen only.

        Production must not silently depend on an unprovisioned ffprobe binary.
        Explicit type readers are retained as a fallback for containers that the
        generic mutagen dispatcher cannot identify.
        """

        try:
            audio = MutagenFile(file_path)
            if audio is None:
                extension = Path(file_path).suffix.lower()
                readers = {".mp3": MP3, ".m4a": MP4, ".wav": WAVE}
                reader = readers.get(extension)
                audio = reader(file_path) if reader else None
            if audio is not None and getattr(audio, "info", None):
                return float(audio.info.length)
        except (OSError, AttributeError, ValueError, TypeError):
            return None
        return None

    @staticmethod
    def stream_sha256(
        file_path: str | Path, chunk_size: int = 1024 * 1024
    ) -> Tuple[str, int]:
        digest = hashlib.sha256()
        byte_count = 0
        with Path(file_path).open("rb") as source:
            while chunk := source.read(chunk_size):
                digest.update(chunk)
                byte_count += len(chunk)
        return digest.hexdigest(), byte_count

    @classmethod
    def validate_local_audio(
        cls,
        file_path: str | Path,
        *,
        expected_sha256: Optional[str] = None,
        expected_size: Optional[int] = None,
        declared_mime_type: Optional[str] = None,
        declared_extension: Optional[str] = None,
    ) -> Tuple[str, int, float]:
        path = Path(file_path)
        extension = (declared_extension or path.suffix).lower()
        if extension and not extension.startswith("."):
            extension = f".{extension}"
        declared_container = CONTAINER_BY_EXTENSION.get(extension)
        if declared_container is None:
            raise InvalidAudioError("Only MP3, M4A, and WAV audio is supported")
        if declared_mime_type is not None:
            mime_container = CONTAINER_BY_MIME_TYPE.get(
                declared_mime_type.strip().lower()
            )
            if mime_container is None:
                raise InvalidAudioError("Declared audio MIME type is unsupported")
            if mime_container != declared_container:
                raise InvalidAudioError(
                    "Declared audio MIME type and filename extension do not match"
                )
        sha256, byte_count = cls.stream_sha256(path)
        if byte_count > MAX_AUDIO_BYTES:
            raise InvalidAudioError("Audio exceeds the 60 MiB limit")
        if expected_size is not None and byte_count != expected_size:
            raise InvalidAudioError("Downloaded audio size does not match its metadata")
        if expected_sha256 is not None and sha256 != expected_sha256.lower():
            raise InvalidAudioError("Downloaded audio SHA-256 does not match its claim")
        try:
            audio = MutagenFile(path)
        except (OSError, AttributeError, ValueError, TypeError) as error:
            raise InvalidAudioError(
                "Audio container could not be determined"
            ) from error
        actual_container = (
            "mpeg"
            if isinstance(audio, MP3)
            else "mp4"
            if isinstance(audio, MP4)
            else "wav"
            if isinstance(audio, WAVE)
            else None
        )
        if actual_container is None or getattr(audio, "info", None) is None:
            raise InvalidAudioError(
                "Audio must contain a valid MP3, M4A, or WAV container"
            )
        if actual_container != declared_container:
            raise InvalidAudioError(
                "Audio container does not match its filename extension"
            )
        if (
            declared_mime_type is not None
            and actual_container
            != CONTAINER_BY_MIME_TYPE[declared_mime_type.strip().lower()]
        ):
            raise InvalidAudioError(
                "Audio container does not match its declared MIME type"
            )
        duration = float(audio.info.length)
        if duration > MAX_AUDIO_DURATION_SECONDS:
            raise InvalidAudioError("Audio exceeds the three-hour duration limit")
        return sha256, byte_count, duration

    @staticmethod
    def format_file_size(bytes_count: int) -> str:
        mb = bytes_count / (1024 * 1024)
        return f"{mb / 1024:.2f} GB" if mb >= 1024 else f"{mb:.2f} MB"

    @staticmethod
    @contextmanager
    def upload_indicator(message: str = "Working") -> Iterator[None]:
        stop = threading.Event()

        def spin() -> None:
            for character in itertools.cycle("|/-\\"):
                if stop.is_set():
                    break
                print(f"\r{message} {character}", end="", flush=True)
                time.sleep(0.1)
            print("\r", end="")

        thread = threading.Thread(target=spin, daemon=True)
        thread.start()
        try:
            yield
        finally:
            stop.set()
            thread.join(timeout=1.0)
            print(f"{message} done.")

    def load_cache(self) -> Dict[str, Any]:
        try:
            value = json.loads(self.audio_cache_path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return {}

    def save_cache(self, cache: Dict[str, Any]) -> None:
        self.audio_cache_path.write_text(
            json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def upload_or_get_gemini_file(
        self, local_path: str, provider: Any
    ) -> Tuple[str, Any]:
        absolute_path = str(Path(local_path).expanduser().resolve())
        cache = self.load_cache()
        remote_id = cache.get(absolute_path)
        if remote_id:
            try:
                file_object = provider.get_file(remote_id)
                return remote_id, file_object
            except Exception:
                pass

        try:
            size = os.path.getsize(absolute_path)
        except OSError as error:
            raise InvalidAudioError(f"Audio file is unavailable: {error}") from error
        if size > MAX_AUDIO_BYTES:
            raise InvalidAudioError("Audio exceeds the 60 MiB limit")

        with self.upload_indicator(message="Uploading to Gemini"):
            file_object = provider.upload_file(absolute_path)
        remote_id = (
            getattr(file_object, "name", None)
            or getattr(file_object, "uri", None)
            or getattr(file_object, "id", None)
        )
        if not remote_id:
            raise RuntimeError("Gemini upload response did not include a file identifier")
        cache[absolute_path] = remote_id
        self.save_cache(cache)
        return str(remote_id), file_object


__all__ = [
    "ALLOWED_AUDIO_EXTENSIONS",
    "ALLOWED_AUDIO_MIME_TYPES",
    "MAX_AUDIO_BYTES",
    "MAX_AUDIO_DURATION_SECONDS",
    "AudioFileManager",
    "InvalidAudioError",
]
