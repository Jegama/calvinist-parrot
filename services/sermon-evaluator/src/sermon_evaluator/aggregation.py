"""Registry-driven aggregate score computation for sermon evaluation."""

from __future__ import annotations

from typing import Optional

from .rubric import AGGREGATES, DOCTRINAL_GATE_CAP
from .schemas import AggregatedSummary, SermonExtractionStep1, SermonScoringStep2


class SermonAggregator:
    """Compute aggregate scores, the doctrinal gate, and optional duration policy."""

    @staticmethod
    def clamp(value: float, lo: float = 1.0, hi: float = 5.0) -> float:
        return max(lo, min(hi, value))

    @staticmethod
    def avg(values: list[float]) -> float:
        if not values:
            raise ValueError("An aggregate cannot be computed without rubric members")
        return sum(values) / len(values)

    @staticmethod
    def _member_value(scoring: SermonScoringStep2, member: str) -> float:
        section_name, field_name = member.split(".", 1)
        section = getattr(scoring, section_name, None)
        if section is None:
            raise ValueError(
                f"Rubric section {section_name!r} is required to compute {member!r}"
            )
        return float(getattr(section, field_name))

    @staticmethod
    def _r2(value: float) -> float:
        return float(f"{value:.2f}")

    def compute_aggregates(
        self, scoring: SermonScoringStep2, extraction: SermonExtractionStep1
    ) -> AggregatedSummary:
        del extraction
        aggregate_values: dict[str, float] = {}
        weighted_total = 0.0

        for aggregate in AGGREGATES:
            value = self.clamp(
                self.avg(
                    [self._member_value(scoring, member) for member in aggregate.members]
                )
            )
            aggregate_values[aggregate.key] = self._r2(value)
            weighted_total += value * aggregate.weight

        if abs(sum(aggregate.weight for aggregate in AGGREGATES) - 1.0) > 1e-9:
            raise ValueError("Sermon aggregate weights must sum to 1.0")

        doctrinal_gate_applied = bool(
            scoring.Doctrinal_Fidelity
            and scoring.Doctrinal_Fidelity.Core_Doctrine_Gate == "FAIL"
        )
        overall_impact_base = self.clamp(weighted_total)
        selected_impact = overall_impact_base
        if doctrinal_gate_applied:
            selected_impact = min(selected_impact, DOCTRINAL_GATE_CAP)

        return AggregatedSummary(
            **aggregate_values,
            Overall_Impact_Base=self._r2(overall_impact_base),
            Overall_Impact_Adjusted=None,
            Overall_Impact=self._r2(selected_impact),
            doctrinal_gate_applied=doctrinal_gate_applied,
            doctrinal_gate_cap=(
                DOCTRINAL_GATE_CAP if doctrinal_gate_applied else None
            ),
            duration_penalty=None,
            duration_adjustment_enabled=False,
        )

    @staticmethod
    def calculate_duration_penalty(duration_seconds: Optional[float]) -> float:
        if duration_seconds is None:
            return 0.0
        duration_minutes = duration_seconds / 60.0
        if duration_minutes < 35:
            return round(min((35 - duration_minutes) / 10.0, 1.0), 2)
        if duration_minutes > 50:
            return round(min((duration_minutes - 50) / 15.0, 1.0), 2)
        return 0.0

    def apply_duration_penalty(
        self,
        aggregated: AggregatedSummary,
        duration_seconds: Optional[float],
        *,
        enabled: bool = True,
    ) -> AggregatedSummary:
        """Apply and expose duration policy only when the user enabled it."""

        aggregated.duration_adjustment_enabled = enabled
        selected_impact = aggregated.Overall_Impact_Base
        if (
            aggregated.doctrinal_gate_applied
            and aggregated.doctrinal_gate_cap is not None
        ):
            selected_impact = min(
                selected_impact, aggregated.doctrinal_gate_cap
            )
        if not enabled:
            aggregated.duration_penalty = None
            aggregated.Overall_Impact_Adjusted = None
            aggregated.Overall_Impact = selected_impact
            return aggregated

        penalty = self.calculate_duration_penalty(duration_seconds)
        adjusted = round(max(1.0, selected_impact - penalty), 2)
        aggregated.duration_penalty = penalty
        aggregated.Overall_Impact_Adjusted = adjusted
        aggregated.Overall_Impact = adjusted
        return aggregated


__all__ = ["SermonAggregator"]
