"""Compatibility CLI for the canonical sermon evaluator."""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Any, Callable, Optional, Sequence

from .engine import SermonEvaluationEngine
from .reports import append_aggregated_summary_csv, render_markdown

DEFAULT_MODEL = "gemini-3.6-flash"


def iso_date(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected YYYY-MM-DD") from error


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Two-step sermon evaluation (audio-only)"
    )
    parser.add_argument("--audio", required=True, help="Path to MP3, M4A, or WAV audio")
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Developer-only Gemini override (default: {DEFAULT_MODEL})",
    )
    parser.add_argument("--out-dir", default="data/sermons_evals")
    parser.add_argument("--label", required=True)
    parser.add_argument("--md-file")
    parser.add_argument("--preacher", required=True)
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--num-scoring-runs", type=int, default=1, choices=range(1, 10))
    parser.add_argument("--preached-date", type=iso_date)
    parser.add_argument(
        "--apply-duration-adjustment",
        action="store_true",
        help="Apply the legacy <35/>50 minute Overall Impact adjustment",
    )
    return parser.parse_args(argv)


def main(
    argv: Optional[Sequence[str]] = None,
    *,
    engine_factory: Callable[..., Any] = SermonEvaluationEngine,
) -> int:
    args = parse_args(argv)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    step1_path = out_dir / f"{args.label}_step1_extraction.json"
    step2_path = out_dir / f"{args.label}_step2_scoring.json"

    engine = engine_factory(
        model=args.model,
        apply_duration_adjustment=args.apply_duration_adjustment,
    )
    step1 = engine.extract_structure_from_audio(args.audio)
    _, audio_file = engine.audio_manager.upload_or_get_gemini_file(
        args.audio, engine.provider
    )
    with step1_path.open("a", encoding="utf-8") as destination:
        destination.write(
            json.dumps(step1.model_dump(), ensure_ascii=False) + "\n"
        )

    if args.num_scoring_runs > 1:
        step2 = engine.score_from_extraction_multi_run(
            step1,
            audio_file_obj=audio_file,
            num_runs=args.num_scoring_runs,
        )
    else:
        step2 = engine.score_from_extraction(step1, audio_file_obj=audio_file)
    with step2_path.open("a", encoding="utf-8") as destination:
        destination.write(
            json.dumps(step2.model_dump(), ensure_ascii=False) + "\n"
        )

    append_aggregated_summary_csv(
        out_dir / "sermon_aggregated_summary.csv",
        preacher=args.preacher,
        label=args.label,
        scoring=step2,
        model=args.model,
        extraction=step1,
        num_scoring_runs=args.num_scoring_runs,
        preached_date=args.preached_date,
    )

    if args.markdown:
        markdown = render_markdown(
            step1,
            step2,
            label=args.label,
            model=args.model,
            num_scoring_runs=args.num_scoring_runs,
        )
        markdown_path = (
            Path(args.md_file) if args.md_file else out_dir / f"{args.label}.md"
        )
        markdown_path.parent.mkdir(parents=True, exist_ok=True)
        markdown_path.write_text(markdown, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
