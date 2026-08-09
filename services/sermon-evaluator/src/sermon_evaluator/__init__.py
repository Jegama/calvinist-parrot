"""Canonical Calvinist Parrot sermon evaluator."""

from .engine import SermonEvaluationEngine
from .schemas import SermonExtractionStep1, SermonScoringStep2

__version__ = "2.0.0"

__all__ = [
    "SermonEvaluationEngine",
    "SermonExtractionStep1",
    "SermonScoringStep2",
    "__version__",
]
