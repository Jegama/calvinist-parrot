"""Strict Pydantic schemas for the canonical sermon evaluator."""

from __future__ import annotations

from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


Score = Annotated[int, Field(ge=1, le=5)]
Confidence = Annotated[float, Field(ge=0.0, le=1.0)]
AggregateScore = Annotated[float, Field(ge=1.0, le=5.0)]
Penalty = Annotated[float, Field(ge=0.0, le=1.0)]
CoreDoctrineGate = Literal["PASS", "FAIL"]


class StrictModel(BaseModel):
    """Reject provider/schema drift rather than silently discarding fields."""

    model_config = ConfigDict(extra="forbid", strict=True)


class SermonPoint(StrictModel):
    Point: str
    Verses: Optional[str] = None
    Summary: str
    Subpoints: list[str] = Field(default_factory=list)
    Illustrations: list[str] = Field(default_factory=list)
    Application: list[str] = Field(default_factory=list)
    Comments: Optional[str] = None
    Feedback: Optional[str] = None


class SermonGeneralComments(StrictModel):
    Content_Comments: Optional[str] = None
    Structure_Comments: Optional[str] = None
    Explanation_Comments: Optional[str] = None
    Illustration_Ethics_Comments: Optional[str] = None


class SermonFCF(StrictModel):
    FCF: str
    Comments: Optional[str] = None


class PastoralPostureEvidence(StrictModel):
    Shared_Subjection_Evidence: list[str] = Field(default_factory=list)
    Servant_Authority_Evidence: list[str] = Field(default_factory=list)
    Courageous_Gentle_Care_Evidence: list[str] = Field(default_factory=list)
    Differentiated_Application_Evidence: list[str] = Field(default_factory=list)
    Pastoral_Power_Evidence: list[str] = Field(default_factory=list)
    Contrary_Evidence: list[str] = Field(default_factory=list)
    Comments: Optional[str] = None


class DoctrinalFidelityEvidence(StrictModel):
    Core_Doctrines_Implicated: list[str] = Field(default_factory=list)
    Affirming_Evidence: list[str] = Field(default_factory=list)
    Contradicting_Evidence: list[str] = Field(default_factory=list)
    Secondary_Tertiary_Handling: Optional[str] = None
    Comments: Optional[str] = None


class SermonExtractionStep1(StrictModel):
    """Step 1 – Descriptive extraction and semantic evidence collection."""

    Scripture_Introduction: str
    Sermon_Introduction: str
    Proposition: str
    Body: list[SermonPoint]
    Conclusion: str
    General_Comments: SermonGeneralComments
    Fallen_Condition_Focus: SermonFCF
    Pastoral_Posture_Evidence: Optional[PastoralPostureEvidence] = None
    Doctrinal_Fidelity_Evidence: Optional[DoctrinalFidelityEvidence] = None
    Extraction_Confidence: Confidence
    audio_duration: Optional[Annotated[float, Field(ge=0.0)]] = None


class IntroductionScores(StrictModel):
    FCF_Introduced: Score
    Arouses_Attention: Score
    Overall: Score
    Feedback: Optional[str] = None


class PropositionScores(StrictModel):
    Principle_and_Application_Wed: Score
    Establishes_Main_Theme: Score
    Summarizes_Introduction: Score
    Overall: Score
    Feedback: Optional[str] = None


class MainPointsScores(StrictModel):
    Clarity: Score
    Hortatory_Universal_Truths: Score
    Proportional_and_Coexistent: Score
    Exposition_Quality: Score
    Illustration_Quality: Score
    Application_Quality: Score
    Overall: Score
    Feedback: Optional[str] = None


class ExegeticalSupportScores(StrictModel):
    Alignment_with_Text: Score
    Handles_Difficulties: Score
    Proof_Accuracy_and_Clarity: Score
    Context_and_Genre_Considered: Score
    Not_Belabored: Score
    Aids_Rather_Than_Impresses: Score
    Overall: Score
    Feedback: Optional[str] = None


class ApplicationScores(StrictModel):
    Clear_and_Practical: Score
    Redemptive_Focus: Score
    Mandate_vs_Idea_Distinction: Score
    Passage_Supported: Score
    Overall: Score
    Feedback: Optional[str] = None


class PersistedIllustrationsScores(StrictModel):
    """Persisted illustration scores, including immutable v1 payloads."""

    Lived_Body_Detail: Score
    Strengthens_Points: Score
    Proportion: Score
    Ethical_Use: Optional[Score] = None
    Overall: Score
    Feedback: Optional[str] = None


class IllustrationsScores(PersistedIllustrationsScores):
    """Strict v2 illustration scores required at the provider boundary."""

    Ethical_Use: Score


class ConclusionScores(StrictModel):
    Summary: Score
    Compelling_Exhortation: Score
    Climax: Score
    Pointed_End: Score
    Overall: Score
    Feedback: Optional[str] = None


class DoctrinalFidelityScores(StrictModel):
    Core_Doctrine_Fidelity: Score
    Doctrinal_Proportionality: Score
    Secondary_and_Tertiary_Charity: Score
    Overall: Score
    Core_Doctrine_Gate: CoreDoctrineGate
    Gate_Reason: Optional[str] = None
    Feedback: Optional[str] = None


class PastoralPostureScores(StrictModel):
    Shared_Subjection_and_Self_Application: Score
    Servant_Authority: Score
    Courageous_and_Gentle_Care: Score
    Differentiated_Pastoral_Application: Score
    Pastoral_Use_of_Power: Score
    Overall: Score
    Feedback: Optional[str] = None


class AggregatedSummary(StrictModel):
    """Computed rollups. New v2 fields remain optional for v1 report replay."""

    Textual_Fidelity: AggregateScore
    Proposition_Clarity: AggregateScore
    Introduction: AggregateScore
    Application_Effectiveness: AggregateScore
    Structure_Cohesion: AggregateScore
    Illustrations: AggregateScore
    Pastoral_Posture: Optional[AggregateScore] = None
    Overall_Impact_Base: AggregateScore
    Overall_Impact_Adjusted: Optional[AggregateScore] = None
    Overall_Impact: AggregateScore
    doctrinal_gate_applied: bool = False
    doctrinal_gate_cap: Optional[AggregateScore] = None
    duration_penalty: Optional[Penalty] = None
    duration_adjustment_enabled: bool = False


class AggregatedSummaryFeedback(StrictModel):
    Textual_Fidelity: Optional[str] = None
    Proposition_Clarity: Optional[str] = None
    Introduction: Optional[str] = None
    Application_Effectiveness: Optional[str] = None
    Structure_Cohesion: Optional[str] = None
    Illustrations: Optional[str] = None
    Pastoral_Posture: Optional[str] = None
    Doctrinal_Fidelity: Optional[str] = None
    Overall_Impact: Optional[str] = None


class SermonScoringStep2(StrictModel):
    """Step 2 result; optional v2 sections permit immutable v1 report replay."""

    Introduction: IntroductionScores
    Proposition: PropositionScores
    Main_Points: MainPointsScores
    Exegetical_Support: ExegeticalSupportScores
    Application: ApplicationScores
    Illustrations: PersistedIllustrationsScores
    Conclusion: ConclusionScores
    Doctrinal_Fidelity: Optional[DoctrinalFidelityScores] = None
    Pastoral_Posture: Optional[PastoralPostureScores] = None
    Strengths: list[str] = Field(default_factory=list)
    Growth_Areas: list[str] = Field(default_factory=list)
    Next_Steps: list[str] = Field(default_factory=list)
    Scoring_Confidence: Confidence
    Aggregated_Summary: Optional[AggregatedSummary] = None
    Aggregated_Summary_Feedback: Optional[AggregatedSummaryFeedback] = None


class SermonScoringStep2Raw(StrictModel):
    """Strict v2 model used at the LLM structured-output boundary."""

    Introduction: IntroductionScores
    Proposition: PropositionScores
    Main_Points: MainPointsScores
    Exegetical_Support: ExegeticalSupportScores
    Application: ApplicationScores
    Illustrations: IllustrationsScores
    Conclusion: ConclusionScores
    Doctrinal_Fidelity: DoctrinalFidelityScores
    Pastoral_Posture: PastoralPostureScores
    Strengths: list[str] = Field(default_factory=list)
    Growth_Areas: list[str] = Field(default_factory=list)
    Next_Steps: list[str] = Field(default_factory=list)
    Scoring_Confidence: Confidence


class SermonHarmonizedFeedback(StrictModel):
    """Feedback-only schema for self-consistency synthesis."""

    Introduction: str
    Proposition: str
    Main_Points: str
    Exegetical_Support: str
    Application: str
    Illustrations: str
    Conclusion: str
    Doctrinal_Fidelity: str
    Pastoral_Posture: str
    Doctrinal_Gate_Reason: Optional[str] = None
    Strengths: list[str] = Field(default_factory=list)
    Growth_Areas: list[str] = Field(default_factory=list)
    Next_Steps: list[str] = Field(default_factory=list)


__all__ = [
    "AggregateScore",
    "AggregatedSummary",
    "AggregatedSummaryFeedback",
    "ApplicationScores",
    "ConclusionScores",
    "Confidence",
    "CoreDoctrineGate",
    "DoctrinalFidelityEvidence",
    "DoctrinalFidelityScores",
    "ExegeticalSupportScores",
    "IllustrationsScores",
    "IntroductionScores",
    "MainPointsScores",
    "PastoralPostureEvidence",
    "PastoralPostureScores",
    "Penalty",
    "PersistedIllustrationsScores",
    "PropositionScores",
    "Score",
    "SermonExtractionStep1",
    "SermonFCF",
    "SermonGeneralComments",
    "SermonHarmonizedFeedback",
    "SermonPoint",
    "SermonScoringStep2",
    "SermonScoringStep2Raw",
    "StrictModel",
]
