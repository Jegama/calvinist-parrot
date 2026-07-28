"""Pydantic schemas for the canonical sermon evaluator.

The rubric-facing field names intentionally preserve CP-Evals-Lab compatibility.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

class SermonPoint(BaseModel):
    Point: str
    Verses: Optional[str] = None
    Summary: str
    Subpoints: List[str] = Field(default_factory=list)
    Illustrations: List[str] = Field(default_factory=list)
    Application: List[str] = Field(default_factory=list)
    Comments: Optional[str] = None
    Feedback: Optional[str] = None


class SermonGeneralComments(BaseModel):
    Content_Comments: Optional[str] = None
    Structure_Comments: Optional[str] = None
    Explanation_Comments: Optional[str] = None


class SermonFCF(BaseModel):
    FCF: str
    Comments: Optional[str] = None


class SermonExtractionStep1(BaseModel):
    """Step 1 – Descriptive Extraction (Structural Analysis)."""

    Scripture_Introduction: str
    Sermon_Introduction: str
    Proposition: str
    Body: List[SermonPoint]
    Conclusion: str
    General_Comments: SermonGeneralComments
    Fallen_Condition_Focus: SermonFCF
    Extraction_Confidence: float
    audio_duration: Optional[float] = (
        None  # Duration in seconds (populated for audio mode)
    )


class IntroductionScores(BaseModel):
    FCF_Introduced: int
    Arouses_Attention: int
    Overall: int
    Feedback: Optional[str] = None


class PropositionScores(BaseModel):
    Principle_and_Application_Wed: int
    Establishes_Main_Theme: int
    Summarizes_Introduction: int
    Overall: int
    Feedback: Optional[str] = None


class MainPointsScores(BaseModel):
    Clarity: int
    Hortatory_Universal_Truths: int
    Proportional_and_Coexistent: int
    Exposition_Quality: int
    Illustration_Quality: int
    Application_Quality: int
    Overall: int
    Feedback: Optional[str] = None


class ExegeticalSupportScores(BaseModel):
    Alignment_with_Text: int
    Handles_Difficulties: int
    Proof_Accuracy_and_Clarity: int
    Context_and_Genre_Considered: int
    Not_Belabored: int
    Aids_Rather_Than_Impresses: int
    Overall: int
    Feedback: Optional[str] = None


class ApplicationScores(BaseModel):
    Clear_and_Practical: int
    Redemptive_Focus: int
    Mandate_vs_Idea_Distinction: int
    Passage_Supported: int
    Overall: int
    Feedback: Optional[str] = None


class IllustrationsScores(BaseModel):
    Lived_Body_Detail: int
    Strengthens_Points: int
    Proportion: int
    Overall: int
    Feedback: Optional[str] = None


class ConclusionScores(BaseModel):
    Summary: int
    Compelling_Exhortation: int
    Climax: int
    Pointed_End: int
    Overall: int
    Feedback: Optional[str] = None


class AggregatedSummary(BaseModel):
    """Computed rollups per Sermon Evaluation Framework.

    All values are 1–5 floats rounded to two decimals.
    """

    Textual_Fidelity: float
    Proposition_Clarity: float
    Introduction: float
    Application_Effectiveness: float
    Structure_Cohesion: float
    Illustrations: float
    Overall_Impact_Base: float
    Overall_Impact_Adjusted: Optional[float] = None
    Overall_Impact: float
    duration_penalty: Optional[float] = None
    duration_adjustment_enabled: bool = False


class AggregatedSummaryFeedback(BaseModel):
    """Feedback for the aggregated summary scores."""

    Textual_Fidelity: Optional[str] = None
    Proposition_Clarity: Optional[str] = None
    Introduction: Optional[str] = None
    Application_Effectiveness: Optional[str] = None
    Structure_Cohesion: Optional[str] = None
    Illustrations: Optional[str] = None
    Overall_Impact: Optional[str] = None


class SermonScoringStep2(BaseModel):
    """Step 2 – Analytical Scoring (Synthesis & Coaching)."""

    Introduction: IntroductionScores
    Proposition: PropositionScores
    Main_Points: MainPointsScores
    Exegetical_Support: ExegeticalSupportScores
    Application: ApplicationScores
    Illustrations: IllustrationsScores
    Conclusion: ConclusionScores
    Strengths: List[str] = Field(default_factory=list)
    Growth_Areas: List[str] = Field(default_factory=list)
    Next_Steps: List[str] = Field(default_factory=list)
    Scoring_Confidence: float
    Aggregated_Summary: Optional[AggregatedSummary] = None
    Aggregated_Summary_Feedback: Optional[AggregatedSummaryFeedback] = None


class SermonScoringStep2Raw(BaseModel):
    """Model used for LLM output only (no aggregates)."""

    Introduction: IntroductionScores
    Proposition: PropositionScores
    Main_Points: MainPointsScores
    Exegetical_Support: ExegeticalSupportScores
    Application: ApplicationScores
    Illustrations: IllustrationsScores
    Conclusion: ConclusionScores
    Strengths: List[str] = Field(default_factory=list)
    Growth_Areas: List[str] = Field(default_factory=list)
    Next_Steps: List[str] = Field(default_factory=list)
    Scoring_Confidence: float


__all__ = [
    "SermonPoint", "SermonGeneralComments", "SermonFCF",
    "SermonExtractionStep1", "IntroductionScores", "PropositionScores",
    "MainPointsScores", "ExegeticalSupportScores", "ApplicationScores",
    "IllustrationsScores", "ConclusionScores", "SermonScoringStep2",
    "SermonScoringStep2Raw", "AggregatedSummary", "AggregatedSummaryFeedback",
]
