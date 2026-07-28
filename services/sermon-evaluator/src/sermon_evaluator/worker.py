"""Polling worker for cloud-independent local sermon evaluation."""

from __future__ import annotations

import argparse
import json
import os
import signal
import threading
from typing import Optional, Sequence

from .service import SermonEvaluationService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--once",
        action="store_true",
        help="Recover one batch and exit.",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=float(os.getenv("SERMON_LOCAL_WORKER_POLL_SECONDS", "2")),
        help="Seconds to wait between empty queue polls.",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    if args.poll_interval <= 0:
        raise SystemExit("--poll-interval must be greater than zero")
    stop = threading.Event()

    def request_stop(_signum: int, _frame: object) -> None:
        stop.set()

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)
    service = SermonEvaluationService.from_environment()
    batch_size = int(os.getenv("SERMON_LOCAL_WORKER_BATCH_SIZE", "2"))
    print(
        json.dumps(
            {
                "event": "sermon-worker-ready",
                "runtime": os.getenv("SERMON_RUNTIME", "appwrite"),
                "provider": os.getenv("SERMON_EVALUATOR_PROVIDER", "default"),
                "batchSize": batch_size,
            }
        ),
        flush=True,
    )
    try:
        while not stop.is_set():
            results = service.recover(limit=batch_size)
            for result in results:
                print(json.dumps(result, default=str), flush=True)
            if args.once:
                break
            if not results:
                stop.wait(args.poll_interval)
    finally:
        pool = getattr(service.persistence, "pool", None)
        if pool is not None:
            pool.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
