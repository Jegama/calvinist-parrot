"""Minimal Gemini adapter required by the sermon evaluator."""

from __future__ import annotations

import json
import os
import random
import threading
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Callable, Optional, TypeVar

import httpx


T = TypeVar("T")


@dataclass(frozen=True)
class ProviderResponseMetadata:
    response_id: Optional[str] = None
    model_version: Optional[str] = None


@dataclass(frozen=True)
class GeminiFileMetadata:
    name: str
    uri: Optional[str]
    mime_type: Optional[str]
    created_at: Optional[str]
    expires_at: Optional[str]

    def model_dump(self) -> dict[str, Optional[str]]:
        return asdict(self)


class GeminiProvider:
    """Google Gen AI structured-output and Files API adapter.

    The adapter intentionally omits deprecated sampling controls and
    ``candidate_count``. Gemini 3.6 receives medium thinking and a structured
    Pydantic response schema on every evaluator call.
    """

    def __init__(
        self,
        model: str = "gemini-3.6-flash",
        *,
        api_key: Optional[str] = None,
        default_timeout_seconds: int = 300,
        max_transient_attempts: int = 4,
        retry_initial_delay_seconds: float = 1.0,
        retry_max_delay_seconds: float = 8.0,
    ) -> None:
        try:
            from google import genai
            from google.genai import types
        except ImportError as error:  # pragma: no cover - packaging guard
            raise ImportError("google-genai is required for Gemini evaluation") from error

        self._genai = genai
        self._types = types
        self._api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self._api_key:
            raise ValueError("GEMINI_API_KEY must be configured")
        self.model_name = model
        self.default_timeout_seconds = default_timeout_seconds
        if max_transient_attempts < 1:
            raise ValueError("max_transient_attempts must be at least one")
        self.max_transient_attempts = max_transient_attempts
        self.retry_initial_delay_seconds = retry_initial_delay_seconds
        self.retry_max_delay_seconds = retry_max_delay_seconds
        self._clients: dict[int, Any] = {}
        self._response_local = threading.local()

    @property
    def last_response_metadata(self) -> ProviderResponseMetadata:
        return getattr(
            self._response_local, "metadata", ProviderResponseMetadata()
        )

    def set_model(self, model_name: str) -> None:
        self.model_name = model_name

    def _client(self, timeout_seconds: Optional[float] = None) -> Any:
        seconds = max(1, int(timeout_seconds or self.default_timeout_seconds))
        if seconds not in self._clients:
            self._clients[seconds] = self._genai.Client(
                api_key=self._api_key,
                http_options=self._types.HttpOptions(timeout=seconds * 1000),
            )
        return self._clients[seconds]

    def _config(
        self,
        response_schema: type,
        system: Optional[str],
        seed: Optional[int],
    ) -> Any:
        if hasattr(response_schema, "model_json_schema"):
            json_schema = response_schema.model_json_schema()
        elif isinstance(response_schema, dict):
            json_schema = response_schema
        elif response_schema is dict:
            json_schema = {"type": "object"}
        else:
            raise TypeError(
                "response_schema must be a Pydantic model or JSON Schema mapping"
            )
        return self._types.GenerateContentConfig(
            seed=seed,
            system_instruction=system or None,
            response_mime_type="application/json",
            response_json_schema=json_schema,
            thinking_config=self._types.ThinkingConfig(thinking_level="medium"),
        )

    @staticmethod
    def _is_transient_error(error: BaseException) -> bool:
        code = getattr(error, "code", None)
        try:
            status_code = int(code)
        except (TypeError, ValueError):
            status_code = None
        if status_code in {408, 429, 500, 502, 503, 504}:
            return True
        return isinstance(
            error,
            (
                httpx.TimeoutException,
                httpx.ConnectError,
                httpx.NetworkError,
                httpx.RemoteProtocolError,
            ),
        )

    def _with_transient_retry(
        self,
        operation: str,
        timeout_seconds: Optional[float],
        call: Callable[[float], T],
    ) -> T:
        timeout = float(timeout_seconds or self.default_timeout_seconds)
        deadline = time.monotonic() + max(1.0, timeout)
        for attempt in range(1, self.max_transient_attempts + 1):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"{operation} exhausted its provider timeout")
            try:
                return call(remaining)
            except BaseException as error:
                if (
                    not self._is_transient_error(error)
                    or attempt >= self.max_transient_attempts
                ):
                    raise
                exponential_delay = min(
                    self.retry_max_delay_seconds,
                    self.retry_initial_delay_seconds * (2 ** (attempt - 1)),
                )
                delay = exponential_delay * random.uniform(0.5, 1.5)
                if delay >= deadline - time.monotonic():
                    raise
                print(
                    json.dumps(
                        {
                            "event": "gemini-transient-retry",
                            "operation": operation,
                            "attempt": attempt,
                            "maxAttempts": self.max_transient_attempts,
                            "error": error.__class__.__name__,
                            "delaySeconds": round(delay, 2),
                        }
                    ),
                    flush=True,
                )
                time.sleep(delay)
        raise AssertionError("Transient retry loop ended unexpectedly")

    def _parse(self, response: Any) -> dict[str, Any]:
        self._response_local.metadata = ProviderResponseMetadata(
            response_id=getattr(response, "response_id", None),
            model_version=getattr(response, "model_version", None),
        )
        parsed = getattr(response, "parsed", None)
        if hasattr(parsed, "model_dump"):
            return parsed.model_dump()
        if isinstance(parsed, dict):
            return parsed
        return json.loads(getattr(response, "text", "") or "{}")

    def generate_structured(
        self,
        prompt: str,
        response_schema: type,
        system: Optional[str] = None,
        model: Optional[str] = None,
        seed: Optional[int] = 1689,
        timeout_seconds: Optional[float] = None,
    ) -> dict[str, Any]:
        config = self._config(response_schema, system, seed)
        response = self._with_transient_retry(
            "generate_structured",
            timeout_seconds,
            lambda remaining: self._client(remaining).models.generate_content(
                model=model or self.model_name,
                contents=prompt,
                config=config,
            ),
        )
        return self._parse(response)

    def generate_structured_with_contents(
        self,
        contents: list[Any],
        response_schema: type,
        system: Optional[str] = None,
        model: Optional[str] = None,
        seed: Optional[int] = 1689,
        timeout_seconds: Optional[float] = None,
    ) -> dict[str, Any]:
        config = self._config(response_schema, system, seed)
        response = self._with_transient_retry(
            "generate_structured_with_contents",
            timeout_seconds,
            lambda remaining: self._client(remaining).models.generate_content(
                model=model or self.model_name,
                contents=contents,
                config=config,
            ),
        )
        return self._parse(response)

    def upload_file(
        self, file_path: str, *, timeout_seconds: Optional[float] = None
    ) -> Any:
        return self._with_transient_retry(
            "upload_file",
            timeout_seconds,
            lambda remaining: self._client(remaining).files.upload(file=file_path),
        )

    def get_file(
        self, file_name_or_id: str, *, timeout_seconds: Optional[float] = None
    ) -> Any:
        name = (
            file_name_or_id
            if str(file_name_or_id).startswith("files/")
            else f"files/{file_name_or_id}"
        )
        return self._with_transient_retry(
            "get_file",
            timeout_seconds,
            lambda remaining: self._client(remaining).files.get(name=name),
        )

    def wait_until_active(
        self,
        file_object: Any,
        *,
        timeout_seconds: float,
        poll_seconds: float = 2.0,
    ) -> Any:
        deadline = time.monotonic() + timeout_seconds
        current = file_object
        while True:
            state = str(getattr(current, "state", "")).upper()
            if state.endswith("ACTIVE") or not state:
                return current
            if state.endswith("FAILED"):
                raise RuntimeError("Gemini file processing failed")
            if time.monotonic() + poll_seconds >= deadline:
                raise TimeoutError("Gemini file did not become active before deadline")
            time.sleep(poll_seconds)
            current = self.get_file(
                getattr(current, "name"),
                timeout_seconds=max(1, deadline - time.monotonic()),
            )

    @staticmethod
    def file_metadata(file_object: Any) -> GeminiFileMetadata:
        def iso(value: Any) -> Optional[str]:
            if value is None:
                return None
            if isinstance(value, datetime):
                return value.isoformat()
            return str(value)

        name = getattr(file_object, "name", None)
        if not name:
            raise ValueError("Gemini file object has no name")
        return GeminiFileMetadata(
            name=str(name),
            uri=getattr(file_object, "uri", None),
            mime_type=getattr(file_object, "mime_type", None),
            created_at=iso(
                getattr(file_object, "create_time", None)
                or getattr(file_object, "created_at", None)
            ),
            expires_at=iso(
                getattr(file_object, "expiration_time", None)
                or getattr(file_object, "expires_at", None)
            ),
        )


# Compatibility name used by the copied engine.
ParrotAIGemini = GeminiProvider

__all__ = [
    "GeminiFileMetadata",
    "GeminiProvider",
    "ParrotAIGemini",
    "ProviderResponseMetadata",
]
