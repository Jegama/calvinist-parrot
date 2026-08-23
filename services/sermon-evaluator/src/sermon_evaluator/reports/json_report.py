"""Stable JSON report snapshots."""

from __future__ import annotations

import json
from typing import Any, Mapping

from ..schemas import SermonExtractionStep1, SermonScoringStep2


def render_json(
    extraction: SermonExtractionStep1,
    scoring: SermonScoringStep2,
    *,
    metadata: Mapping[str, Any],
) -> str:
    return json.dumps(
        {
            "reportVersion": "2.0.0",
            "metadata": dict(metadata),
            "extraction": extraction.model_dump(mode="json"),
            "scoring": scoring.model_dump(mode="json"),
        },
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    )


__all__ = ["render_json"]
