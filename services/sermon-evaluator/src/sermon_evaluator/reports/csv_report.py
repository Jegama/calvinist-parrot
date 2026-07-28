"""CSV compatibility and immutable snapshot reporting."""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ..schemas import SermonExtractionStep1, SermonScoringStep2

FIELDNAMES = [
    "timestamp",
    "label",
    "model",
    "preacher",
    "preached_date",
    "Textual_Fidelity",
    "Proposition_Clarity",
    "Introduction",
    "Application_Effectiveness",
    "Structure_Cohesion",
    "Illustrations",
    "Overall_Impact_Base",
    "Overall_Impact_Adjusted",
    "Overall_Impact",
    "audio_duration_minutes",
    "duration_penalty",
    "duration_adjustment_enabled",
    "num_scoring_runs",
]


def _row(
    *,
    preacher: str,
    label: str,
    scoring: SermonScoringStep2,
    model: str,
    extraction: Optional[SermonExtractionStep1],
    num_scoring_runs: int,
    preached_date: Optional[str],
    timestamp: Optional[str] = None,
) -> Optional[dict[str, object]]:
    summary = scoring.Aggregated_Summary
    if summary is None:
        return None
    duration_minutes = (
        round(extraction.audio_duration / 60.0, 2)
        if extraction and extraction.audio_duration is not None
        else ""
    )
    return {
        "timestamp": timestamp or datetime.now(timezone.utc).isoformat(),
        "label": label,
        "model": model,
        "preacher": preacher.replace("_", " "),
        "preached_date": preached_date or "",
        "Textual_Fidelity": summary.Textual_Fidelity,
        "Proposition_Clarity": summary.Proposition_Clarity,
        "Introduction": summary.Introduction,
        "Application_Effectiveness": summary.Application_Effectiveness,
        "Structure_Cohesion": summary.Structure_Cohesion,
        "Illustrations": summary.Illustrations,
        "Overall_Impact_Base": summary.Overall_Impact_Base,
        "Overall_Impact_Adjusted": summary.Overall_Impact_Adjusted,
        "Overall_Impact": summary.Overall_Impact,
        "audio_duration_minutes": duration_minutes,
        "duration_penalty": summary.duration_penalty,
        "duration_adjustment_enabled": summary.duration_adjustment_enabled,
        "num_scoring_runs": num_scoring_runs,
    }


def render_csv(**kwargs: object) -> str:
    row = _row(**kwargs)  # type: ignore[arg-type]
    if row is None:
        return ""
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=FIELDNAMES)
    writer.writeheader()
    writer.writerow(row)
    return stream.getvalue()


def append_aggregated_summary_csv(csv_path: Path, **kwargs: object) -> None:
    row = _row(**kwargs)  # type: ignore[arg-type]
    if row is None:
        return
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    write_header = not csv_path.exists()
    with csv_path.open("a", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(destination, fieldnames=FIELDNAMES)
        if write_header:
            writer.writeheader()
        writer.writerow(row)


__all__ = ["FIELDNAMES", "append_aggregated_summary_csv", "render_csv"]
