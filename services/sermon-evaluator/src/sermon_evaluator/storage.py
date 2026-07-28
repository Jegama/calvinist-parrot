"""Private audio storage adapters for the sermon worker."""

from __future__ import annotations

import os
import shutil
import tempfile
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from appwrite.client import Client
from appwrite.services.storage import Storage


@dataclass(frozen=True)
class DownloadedAudio:
    path: Path
    bucket_id: str
    file_id: str

    def cleanup(self) -> None:
        self.path.unlink(missing_ok=True)


class AppwriteStorage:
    """Read sermon audio with the Function's injected dynamic API key."""

    def __init__(
        self,
        *,
        endpoint: Optional[str] = None,
        project_id: Optional[str] = None,
        api_key: Optional[str] = None,
        allowed_bucket_id: Optional[str] = None,
    ) -> None:
        self.endpoint = (
            endpoint
            or os.getenv("APPWRITE_FUNCTION_API_ENDPOINT")
            or os.getenv("APPWRITE_ENDPOINT")
        )
        self.project_id = (
            project_id
            or os.getenv("APPWRITE_FUNCTION_PROJECT_ID")
            or os.getenv("APPWRITE_PROJECT_ID")
        )
        self.api_key = (
            api_key
            or os.getenv("APPWRITE_FUNCTION_API_KEY")
            or os.getenv("APPWRITE_API_KEY")
        )
        self.allowed_bucket_id = allowed_bucket_id or os.getenv(
            "SERMON_AUDIO_BUCKET_ID"
        )
        if not all(
            [self.endpoint, self.project_id, self.api_key, self.allowed_bucket_id]
        ):
            raise ValueError(
                "Appwrite Function endpoint, project, dynamic key, and "
                "SERMON_AUDIO_BUCKET_ID must be configured"
            )
        client = (
            Client()
            .set_endpoint(str(self.endpoint))
            .set_project(str(self.project_id))
            .set_key(str(self.api_key))
        )
        self._storage = Storage(client)

    def _require_bucket(self, bucket_id: str) -> None:
        if bucket_id != self.allowed_bucket_id:
            raise PermissionError("Evaluation references an unexpected storage bucket")

    def download_to_temp(
        self,
        *,
        bucket_id: str,
        file_id: str,
        suffix: str,
        timeout_seconds: float = 120,
    ) -> DownloadedAudio:
        self._require_bucket(bucket_id)
        quoted_bucket = urllib.parse.quote(bucket_id, safe="")
        quoted_file = urllib.parse.quote(file_id, safe="")
        url = (
            f"{str(self.endpoint).rstrip('/')}/storage/buckets/"
            f"{quoted_bucket}/files/{quoted_file}/download"
        )
        request = urllib.request.Request(
            url,
            headers={
                "X-Appwrite-Project": str(self.project_id),
                "X-Appwrite-Key": str(self.api_key),
            },
        )
        descriptor, path_string = tempfile.mkstemp(
            prefix="sermon-audio-", suffix=suffix
        )
        os.close(descriptor)
        path = Path(path_string)
        try:
            with urllib.request.urlopen(
                request, timeout=min(120, max(1, timeout_seconds))
            ) as response:
                with path.open("wb") as destination:
                    shutil.copyfileobj(response, destination, length=1024 * 1024)
        except BaseException:
            path.unlink(missing_ok=True)
            raise
        return DownloadedAudio(path=path, bucket_id=bucket_id, file_id=file_id)

    def delete_file(self, *, bucket_id: str, file_id: str) -> None:
        self._require_bucket(bucket_id)
        self._storage.delete_file(bucket_id=bucket_id, file_id=file_id)


class LocalFilesystemStorage:
    """Read local-development audio written by the Next.js upload route."""

    def __init__(
        self,
        *,
        root: Optional[str | Path] = None,
        allowed_bucket_id: str = "local-sermon-audio",
    ) -> None:
        configured = root or os.getenv("SERMON_LOCAL_AUDIO_DIR")
        self.root = Path(configured or Path.cwd() / ".data" / "sermon-audio").resolve()
        self.allowed_bucket_id = allowed_bucket_id

    def _source(self, bucket_id: str, file_id: str) -> Path:
        if bucket_id != self.allowed_bucket_id:
            raise PermissionError("Evaluation references an unexpected storage bucket")
        if (
            not file_id
            or len(file_id) > 36
            or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for character in file_id)
        ):
            raise ValueError("Invalid local sermon audio file identifier")
        return self.root / f"{file_id}.audio"

    def download_to_temp(
        self,
        *,
        bucket_id: str,
        file_id: str,
        suffix: str,
        timeout_seconds: float = 120,
    ) -> DownloadedAudio:
        del timeout_seconds
        source = self._source(bucket_id, file_id)
        descriptor, path_string = tempfile.mkstemp(
            prefix="sermon-audio-", suffix=suffix
        )
        os.close(descriptor)
        path = Path(path_string)
        try:
            shutil.copyfile(source, path)
        except BaseException:
            path.unlink(missing_ok=True)
            raise
        return DownloadedAudio(path=path, bucket_id=bucket_id, file_id=file_id)

    def delete_file(self, *, bucket_id: str, file_id: str) -> None:
        source = self._source(bucket_id, file_id)
        source.unlink(missing_ok=True)
        source.with_suffix(".json").unlink(missing_ok=True)


__all__ = ["AppwriteStorage", "DownloadedAudio", "LocalFilesystemStorage"]
