"""Appwrite Function adapter for the platform-neutral sermon service."""

from __future__ import annotations

import json
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from sermon_evaluator.persistence import LeaseUnavailable
from sermon_evaluator.service import SermonEvaluationService


class Invocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evaluation_id: str = Field(alias="evaluationId", min_length=1, max_length=191)
    action: Literal["evaluate", "regenerate_reports"] = "evaluate"


def _body(request: Any) -> Optional[dict[str, Any]]:
    body = getattr(request, "body", None)
    if body in (None, "", b""):
        return None
    if isinstance(body, dict):
        return body
    if isinstance(body, bytes):
        body = body.decode("utf-8")
    parsed = json.loads(body)
    if not isinstance(parsed, dict):
        raise ValueError("Invocation body must be a JSON object")
    return parsed


def _execution_id(request: Any) -> Optional[str]:
    headers = getattr(request, "headers", {}) or {}
    for name in (
        "x-appwrite-execution-id",
        "X-Appwrite-Execution-Id",
        "x-appwrite-execution",
    ):
        if headers.get(name):
            return str(headers[name])
    return None


def _dynamic_api_key(request: Any) -> Optional[str]:
    headers = getattr(request, "headers", {}) or {}
    for name, value in headers.items():
        if str(name).lower() == "x-appwrite-key" and value:
            return str(value)
    return None


def main(context: Any) -> Any:
    """Handle an opaque evaluation ID or a scheduled recovery tick."""

    try:
        payload = _body(context.req)
        service = SermonEvaluationService.from_environment(
            appwrite_api_key=_dynamic_api_key(context.req)
        )
        if payload is None:
            result = {"mode": "recovery", "results": service.recover(limit=2)}
        else:
            invocation = Invocation.model_validate(payload)
            if invocation.action == "regenerate_reports":
                result = service.regenerate_reports(invocation.evaluation_id)
            else:
                result = service.process(
                    invocation.evaluation_id,
                    appwrite_execution_id=_execution_id(context.req),
                )
        return context.res.json(result, statusCode=200)
    except (ValidationError, ValueError, json.JSONDecodeError) as error:
        context.error(f"Invalid sermon evaluator invocation: {error}")
        return context.res.json(
            {"error": "INVALID_INVOCATION"}, statusCode=400
        )
    except LeaseUnavailable:
        return context.res.json(
            {"status": "DEFERRED", "reason": "WORKER_CAPACITY"},
            statusCode=202,
        )
    except Exception as error:
        context.error(
            f"Sermon evaluator failed with {error.__class__.__name__}: {error}"
        )
        return context.res.json(
            {"error": "WORKER_EXECUTION_FAILED"}, statusCode=500
        )


__all__ = ["Invocation", "main"]
