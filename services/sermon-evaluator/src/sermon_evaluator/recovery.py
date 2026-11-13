"""Durable Appwrite wakeups for active evaluations, without idle DB polling."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone


def schedule_recovery(evaluation_id: str | None, *, api_key: str | None) -> None:
    """Schedule this Function again before work begins, using a fresh runtime key.

    Only the opaque job ID is stored in the delayed execution. Appwrite injects
    its own dynamic key when that execution runs; the current key is never saved
    in the payload. A terminal job schedules nothing, so its chain stops. A null
    ID schedules a bounded maintenance sweep while a queue backlog is draining.
    """

    endpoint = os.getenv("APPWRITE_FUNCTION_API_ENDPOINT")
    project_id = os.getenv("APPWRITE_FUNCTION_PROJECT_ID")
    function_id = os.getenv("APPWRITE_FUNCTION_ID")
    if not all((endpoint, project_id, function_id, api_key)):
        raise ValueError("Appwrite recovery requires Function identity and dynamic key")

    # Appwrite schedules have minute precision. Leave at least a full minute
    # for the API request and scheduler; checks run 60-120 seconds apart.
    scheduled_at = datetime.now(timezone.utc).replace(
        second=0, microsecond=0
    ) + timedelta(minutes=2)
    payload = json.dumps(
        {
            "body": json.dumps({"evaluationId": evaluation_id}) if evaluation_id else "",
            "async": True,
            "headers": {"content-type": "application/json"},
            "scheduledAt": scheduled_at.isoformat(),
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{endpoint.rstrip('/')}/functions/"
        f"{urllib.parse.quote(function_id, safe='')}/executions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-Appwrite-Project": project_id,
            "X-Appwrite-Key": api_key,
        },
        method="POST",
    )
    # Bound transient API failures. If registration fails, do not begin a new
    # attempt: the hourly sweep can still pick up the durable queued job.
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                response.read()
            return
        except urllib.error.HTTPError as error:
            if error.code != 429 and error.code < 500:
                raise
            if attempt == 2:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
        time.sleep(attempt + 1)
