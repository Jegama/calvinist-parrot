from __future__ import annotations

import pytest

from sermon_evaluator.schemas import (
    ApplicationScores,
    ConclusionScores,
    DoctrinalFidelityScores,
    ExegeticalSupportScores,
    IllustrationsScores,
    IntroductionScores,
    MainPointsScores,
    PastoralPostureScores,
    PropositionScores,
    SermonExtractionStep1,
    SermonFCF,
    SermonGeneralComments,
    SermonPoint,
    SermonScoringStep2,
    SermonScoringStep2Raw,
)


@pytest.fixture
def extraction() -> SermonExtractionStep1:
    return SermonExtractionStep1(
        Scripture_Introduction="Romans 8:1",
        Sermon_Introduction="Grace for sinners",
        Proposition="Because Christ saves, believers walk by the Spirit.",
        Body=[
            SermonPoint(
                Point="There is no condemnation in Christ",
                Verses="Romans 8:1",
                Summary="Christ bears the judgment of his people.",
                Subpoints=["Union with Christ"],
                Illustrations=["A canceled debt"],
                Application=["Rest in Christ"],
            )
        ],
        Conclusion="Trust Christ and walk by the Spirit.",
        General_Comments=SermonGeneralComments(),
        Fallen_Condition_Focus=SermonFCF(FCF="We trust our own righteousness."),
        Extraction_Confidence=0.9,
        audio_duration=40 * 60,
    )


def make_raw(score: int = 3, confidence: float = 0.8) -> SermonScoringStep2Raw:
    return SermonScoringStep2Raw(
        Introduction=IntroductionScores(
            FCF_Introduced=score, Arouses_Attention=score, Overall=score
        ),
        Proposition=PropositionScores(
            Principle_and_Application_Wed=score,
            Establishes_Main_Theme=score,
            Summarizes_Introduction=score,
            Overall=score,
        ),
        Main_Points=MainPointsScores(
            Clarity=score,
            Hortatory_Universal_Truths=score,
            Proportional_and_Coexistent=score,
            Exposition_Quality=score,
            Illustration_Quality=score,
            Application_Quality=score,
            Overall=score,
        ),
        Exegetical_Support=ExegeticalSupportScores(
            Alignment_with_Text=score,
            Handles_Difficulties=score,
            Proof_Accuracy_and_Clarity=score,
            Context_and_Genre_Considered=score,
            Not_Belabored=score,
            Aids_Rather_Than_Impresses=score,
            Overall=score,
        ),
        Application=ApplicationScores(
            Clear_and_Practical=score,
            Redemptive_Focus=score,
            Mandate_vs_Idea_Distinction=score,
            Passage_Supported=score,
            Overall=score,
        ),
        Illustrations=IllustrationsScores(
            Lived_Body_Detail=score,
            Strengthens_Points=score,
            Proportion=score,
            Ethical_Use=score,
            Overall=score,
        ),
        Conclusion=ConclusionScores(
            Summary=score,
            Compelling_Exhortation=score,
            Climax=score,
            Pointed_End=score,
            Overall=score,
        ),
        Doctrinal_Fidelity=DoctrinalFidelityScores(
            Core_Doctrine_Fidelity=score,
            Doctrinal_Proportionality=score,
            Secondary_and_Tertiary_Charity=score,
            Overall=score,
            Core_Doctrine_Gate="PASS",
        ),
        Pastoral_Posture=PastoralPostureScores(
            Shared_Subjection_and_Self_Application=score,
            Servant_Authority=score,
            Courageous_and_Gentle_Care=score,
            Differentiated_Pastoral_Application=score,
            Pastoral_Use_of_Power=score,
            Overall=score,
        ),
        Strengths=["Text centered"],
        Growth_Areas=["Sharpen applications"],
        Next_Steps=["State the proposition earlier"],
        Scoring_Confidence=confidence,
    )


@pytest.fixture
def raw_scoring() -> SermonScoringStep2Raw:
    return make_raw()


@pytest.fixture
def scoring(raw_scoring: SermonScoringStep2Raw) -> SermonScoringStep2:
    return SermonScoringStep2(**raw_scoring.model_dump())
