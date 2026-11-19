"""Audio helpers shared by the local CLI and the Appwrite worker."""

from __future__ import annotations

import hashlib
import itertools
import os
import stat
import tempfile
import threading
import time
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from functools import cached_property
from pathlib import Path
from typing import Any, Iterator, Optional, Tuple

from mutagen import File as MutagenFile
from mutagen.mp3 import BitrateMode, HeaderNotFoundError, MP3, MPEGFrame
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
MAX_AUDIO_MIB = 100
MAX_AUDIO_BYTES = MAX_AUDIO_MIB * 1024 * 1024
MAX_AUDIO_DURATION_SECONDS = 3 * 60 * 60
# The CLI can spend five minutes in extraction and several scoring waves.
MIN_CACHED_FILE_LIFETIME = timedelta(hours=1)
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

    def __init__(self, cache_dir: Path | None = None) -> None:
        self.cache_dir = cache_dir
        self._private_cache: tempfile.TemporaryDirectory | None = None

    @cached_property
    def _upload_cache_dir(self) -> Path:
        """Prepare the CLI cache only when looking up or saving an upload."""
        if self.cache_dir is not None:
            self.cache_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
            return self.cache_dir

        uid = os.getuid() if hasattr(os, "getuid") else None
        name = "calvinist-parrot" if uid is None else f"calvinist-parrot-{uid}"
        directory = Path(tempfile.gettempdir()) / name
        try:
            directory.mkdir(mode=0o700, exist_ok=True)
            info = directory.lstat()
            if (
                stat.S_ISDIR(info.st_mode)
                and (uid is None or (info.st_uid == uid and not info.st_mode & 0o077))
                and os.access(directory, os.R_OK | os.W_OK | os.X_OK)
            ):
                return directory
        except OSError:
            pass

        # Leave an occupied or inaccessible shared-temp path untouched.
        self._private_cache = tempfile.TemporaryDirectory(prefix="calvinist-parrot-")
        return Path(self._private_cache.name)

    @staticmethod
    def _exact_mp3_duration(path: Path, audio: MP3) -> float:
        """Count MPEG frames when an MP3 has no trustworthy VBR header.

        Mutagen estimates UNKNOWN-bitrate MP3 duration from the first frame's
        bitrate. That can substantially overstate headerless VBR recordings.
        Summing each frame's sample duration matches the decodable timeline.
        """

        info = audio.info
        if getattr(info, "bitrate_mode", None) != BitrateMode.UNKNOWN:
            return float(info.length)

        frame_offset = getattr(info, "frame_offset", None)
        if not isinstance(frame_offset, int) or frame_offset < 0:
            return float(info.length)

        duration = 0.0
        frame_count = 0
        file_size = path.stat().st_size
        with path.open("rb") as source:
            source.seek(frame_offset)
            while source.tell() < file_size:
                previous_offset = source.tell()
                try:
                    frame = MPEGFrame(source)
                except HeaderNotFoundError:
                    break
                samples_per_frame = (
                    384
                    if frame.layer == 1
                    else 576
                    if frame.version >= 2 and frame.layer == 3
                    else 1152
                )
                duration += samples_per_frame / frame.sample_rate
                frame_count += 1
                if source.tell() <= previous_offset:
                    break

        return duration if frame_count > 0 else float(info.length)

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
                if isinstance(audio, MP3):
                    return AudioFileManager._exact_mp3_duration(
                        Path(file_path), audio
                    )
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
            raise InvalidAudioError(
                f"Audio exceeds the {MAX_AUDIO_MIB} MiB limit"
            )
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
        duration = (
            cls._exact_mp3_duration(path, audio)
            if isinstance(audio, MP3)
            else float(audio.info.length)
        )
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

    @staticmethod
    def _audio_revision(path: Path) -> tuple[int, ...]:
        try:
            info = path.stat()
        except OSError as error:
            raise InvalidAudioError(f"Audio file is unavailable: {error}") from error
        if info.st_size > MAX_AUDIO_BYTES:
            raise InvalidAudioError(f"Audio exceeds the {MAX_AUDIO_MIB} MiB limit")
        return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns

    @staticmethod
    def _cache_upload(entry: Path, remote_id: str) -> None:
        # Each digest owns one entry. Readers see a complete ID even if other
        # CLI processes are uploading or refreshing files at the same time.
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=entry.parent, delete_on_close=False
        ) as pending:
            pending.write(remote_id)
            pending.close()
            os.replace(pending.name, entry)

    @staticmethod
    def _has_time_for_evaluation(file_object: Any) -> bool:
        expires = getattr(file_object, "expiration_time", None) or getattr(
            file_object, "expires_at", None
        )
        if expires is None:
            return True  # Gemini omits this field for files without a scheduled expiry.
        if isinstance(expires, str):
            expires = datetime.fromisoformat(expires)
        if not isinstance(expires, datetime):
            return False
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        return expires > datetime.now(UTC) + MIN_CACHED_FILE_LIFETIME

    def upload_or_get_gemini_file(
        self, local_path: str, provider: Any
    ) -> Tuple[str, Any]:
        path = Path(local_path).expanduser().resolve()
        revision = self._audio_revision(path)

        def require_unchanged_audio() -> None:
            if self._audio_revision(path) != revision:
                raise InvalidAudioError(
                    "Audio changed during file preparation. Retry with the finished file."
                )

        try:
            digest, _ = self.stream_sha256(path)
        except OSError as error:
            raise InvalidAudioError(f"Audio file is unavailable: {error}") from error
        entry = self._upload_cache_dir / f"gemini-{digest}.id"
        try:
            remote_id = entry.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            remote_id = None
        if remote_id:
            try:
                file_object = provider.get_file(remote_id)
                reusable = self._has_time_for_evaluation(file_object)
            except Exception:
                reusable = False
            if reusable:
                require_unchanged_audio()
                return remote_id, file_object

        with self.upload_indicator(message="Uploading to Gemini"):
            file_object = provider.upload_file(str(path))
        remote_id = (
            getattr(file_object, "name", None)
            or getattr(file_object, "uri", None)
            or getattr(file_object, "id", None)
        )
        if not remote_id:
            raise RuntimeError("Gemini upload response did not include a file identifier")
        require_unchanged_audio()
        self._cache_upload(entry, str(remote_id))
        return str(remote_id), file_object


__all__ = [
    "ALLOWED_AUDIO_EXTENSIONS",
    "ALLOWED_AUDIO_MIME_TYPES",
    "MAX_AUDIO_BYTES",
    "MAX_AUDIO_MIB",
    "MAX_AUDIO_DURATION_SECONDS",
    "AudioFileManager",
    "InvalidAudioError",
]
