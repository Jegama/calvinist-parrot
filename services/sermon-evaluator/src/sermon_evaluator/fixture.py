"""Deterministic provider for cloud-independent local end-to-end testing."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .gemini import GeminiFileMetadata, ProviderResponseMetadata
from .schemas import (
    AggregatedSummaryFeedback,
    SermonExtractionStep1,
    SermonHarmonizedFeedback,
    SermonScoringStep2Raw,
)


@dataclass(frozen=True)
class FixtureFile:
    name: str
    uri: str
    mime_type: str
    state: str = "ACTIVE"


def _feedback(section: str) -> str:
    return (
        f"Fixture feedback for {section}: the structure is clear enough to test "
        "the full report and coaching interface locally."
    )


def _scoring(seed: Optional[int]) -> dict[str, Any]:
    score = 4 if seed is None or seed % 3 else 3
    return {
        "Introduction": {
            "FCF_Introduced": score,
            "Arouses_Attention": 4,
            "Overall": score,
            "Feedback": _feedback("the introduction"),
        },
        "Proposition": {
            "Principle_and_Application_Wed": 4,
            "Establishes_Main_Theme": score,
            "Summarizes_Introduction": 4,
            "Overall": 4,
            "Feedback": _feedback("the proposition"),
        },
        "Main_Points": {
            "Clarity": 4,
            "Hortatory_Universal_Truths": score,
            "Proportional_and_Coexistent": 4,
            "Exposition_Quality": 4,
            "Illustration_Quality": 3,
            "Application_Quality": 4,
            "Overall": 4,
            "Feedback": _feedback("the main points"),
        },
        "Exegetical_Support": {
            "Alignment_with_Text": 4,
            "Handles_Difficulties": 3,
            "Proof_Accuracy_and_Clarity": 4,
            "Context_and_Genre_Considered": 4,
            "Not_Belabored": 4,
            "Aids_Rather_Than_Impresses": 4,
            "Overall": 4,
            "Feedback": _feedback("exegetical support"),
        },
        "Application": {
            "Clear_and_Practical": 4,
            "Redemptive_Focus": 4,
            "Mandate_vs_Idea_Distinction": 3,
            "Passage_Supported": 4,
            "Overall": 4,
            "Feedback": _feedback("application"),
        },
        "Illustrations": {
            "Lived_Body_Detail": 3,
            "Strengthens_Points": 4,
            "Proportion": 4,
            "Ethical_Use": 4,
            "Overall": 4,
            "Feedback": _feedback("illustrations"),
        },
        "Conclusion": {
            "Summary": 4,
            "Compelling_Exhortation": 4,
            "Climax": 3,
            "Pointed_End": 4,
            "Overall": 4,
            "Feedback": _feedback("the conclusion"),
        },
        "Doctrinal_Fidelity": {
            "Core_Doctrine_Fidelity": 4,
            "Doctrinal_Proportionality": 4,
            "Secondary_and_Tertiary_Charity": 4,
            "Overall": 4,
            "Core_Doctrine_Gate": "PASS",
            "Gate_Reason": None,
            "Feedback": _feedback("doctrinal fidelity"),
        },
        "Pastoral_Posture": {
            "Shared_Subjection_and_Self_Application": 4,
            "Servant_Authority": 4,
            "Courageous_and_Gentle_Care": 4,
            "Differentiated_Pastoral_Application": 3,
            "Pastoral_Use_of_Power": 4,
            "Overall": 4,
            "Feedback": _feedback("pastoral posture"),
        },
        "Strengths": [
            "The fixture sermon keeps its proposition visible throughout the outline.",
            "Applications are connected to the passage and the gospel.",
        ],
        "Growth_Areas": [
            "Develop the difficult exegetical question more explicitly.",
        ],
        "Next_Steps": [
            "Revise one main point so its explanation, illustration, and application are unmistakable.",
        ],
        "Scoring_Confidence": 0.91,
    }


class FixtureProvider:
    """Provider-compatible deterministic responses without Gemini credentials."""

    def __init__(self, model: str = "fixture-sermon-evaluator-v1") -> None:
        self.model_name = model
        self._last_response_metadata = ProviderResponseMetadata(
            response_id="fixture-response",
            model_version="fixture-sermon-evaluator-v1",
        )

    @property
    def last_response_metadata(self) -> ProviderResponseMetadata:
        return self._last_response_metadata

    def set_model(self, model_name: str) -> None:
        self.model_name = model_name

    def _payload(
        self, response_schema: type, seed: Optional[int]
    ) -> dict[str, Any]:
        if response_schema is SermonExtractionStep1:
            return {
                "Scripture_Introduction": "The fixture introduces Ephesians 2:1-10 in context.",
                "Sermon_Introduction": "A deterministic local sermon introduction.",
                "Proposition": "God saves sinners by grace for a life of good works.",
                "Body": [
                    {
                        "Point": "Grace makes the spiritually dead alive in Christ.",
                        "Verses": "Ephesians 2:1-5",
                        "Summary": "Salvation begins with God's mercy, not human merit.",
                        "Subpoints": ["Our former condition", "God's merciful intervention"],
                        "Illustrations": ["A debt that the debtor cannot repay"],
                        "Application": ["Abandon boasting and rest in Christ"],
                    },
                    {
                        "Point": "Grace creates a people prepared for good works.",
                        "Verses": "Ephesians 2:6-10",
                        "Summary": "Good works follow salvation; they do not purchase it.",
                        "Subpoints": ["Saved through faith", "Created for obedience"],
                        "Illustrations": ["A craftsman displaying his workmanship"],
                        "Application": ["Walk in the works God has prepared"],
                    },
                ],
                "Conclusion": "Trust Christ alone and walk in grateful obedience.",
                "General_Comments": {
                    "Content_Comments": "Fixture content for local workflow testing.",
                    "Structure_Comments": "Two main points support one proposition.",
                    "Explanation_Comments": "The passage drives the outline.",
                    "Illustration_Ethics_Comments": "The examples preserve dignity and do not expose identifiable people.",
                },
                "Fallen_Condition_Focus": {
                    "FCF": "Sinners trust their own merit instead of God's grace.",
                    "Comments": "The gospel answers human boasting.",
                },
                "Pastoral_Posture_Evidence": {
                    "Shared_Subjection_Evidence": ["The preacher includes himself among sinners saved by grace."],
                    "Servant_Authority_Evidence": ["Commands are grounded in Ephesians 2."],
                    "Courageous_Gentle_Care_Evidence": ["The sermon names boasting and offers hope in Christ."],
                    "Differentiated_Application_Evidence": ["The proud are warned and weary believers are invited to rest."],
                    "Pastoral_Power_Evidence": ["Loyalty is directed to Christ rather than the preacher."],
                    "Contrary_Evidence": [],
                    "Comments": "Fixture pastoral evidence.",
                },
                "Doctrinal_Fidelity_Evidence": {
                    "Core_Doctrines_Implicated": ["Gospel", "Justification by faith"],
                    "Affirming_Evidence": ["Salvation is by grace through faith, not works."],
                    "Contradicting_Evidence": [],
                    "Secondary_Tertiary_Handling": None,
                    "Comments": "Fixture doctrinal evidence.",
                },
                "Extraction_Confidence": 0.94,
            }
        if response_schema is SermonScoringStep2Raw:
            return _scoring(seed)
        if response_schema is SermonHarmonizedFeedback:
            return {
                "Introduction": _feedback("the introduction"),
                "Proposition": _feedback("the proposition"),
                "Main_Points": _feedback("the main points"),
                "Exegetical_Support": _feedback("exegetical support"),
                "Application": _feedback("application"),
                "Illustrations": _feedback("illustrations"),
                "Conclusion": _feedback("the conclusion"),
                "Doctrinal_Fidelity": _feedback("doctrinal fidelity"),
                "Pastoral_Posture": _feedback("pastoral posture"),
                "Doctrinal_Gate_Reason": None,
                "Strengths": ["Fixture harmonized strength."],
                "Growth_Areas": ["Fixture harmonized growth area."],
                "Next_Steps": ["Fixture harmonized next step."],
            }
        if response_schema is AggregatedSummaryFeedback:
            return {
                "Textual_Fidelity": _feedback("textual fidelity"),
                "Proposition_Clarity": _feedback("proposition clarity"),
                "Introduction": _feedback("the introduction"),
                "Application_Effectiveness": _feedback("application effectiveness"),
                "Structure_Cohesion": _feedback("structure cohesion"),
                "Illustrations": _feedback("illustrations"),
                "Pastoral_Posture": _feedback("pastoral posture"),
                "Doctrinal_Fidelity": _feedback("doctrinal fidelity"),
                "Overall_Impact": _feedback("overall impact"),
            }
        return response_schema().model_dump()

    def generate_structured(
        self,
        prompt: str,
        response_schema: type,
        system: Optional[str] = None,
        model: Optional[str] = None,
        seed: Optional[int] = 1689,
        timeout_seconds: Optional[float] = None,
    ) -> dict[str, Any]:
        del prompt, system, model, timeout_seconds
        return self._payload(response_schema, seed)

    def generate_structured_with_contents(
        self,
        contents: list[Any],
        response_schema: type,
        system: Optional[str] = None,
        model: Optional[str] = None,
        seed: Optional[int] = 1689,
        timeout_seconds: Optional[float] = None,
    ) -> dict[str, Any]:
        del contents
        return self.generate_structured(
            "",
            response_schema,
            system=system,
            model=model,
            seed=seed,
            timeout_seconds=timeout_seconds,
        )

    def upload_file(
        self, file_path: str, *, timeout_seconds: Optional[float] = None
    ) -> FixtureFile:
        del timeout_seconds
        name = f"files/local-{Path(file_path).stem}"
        return FixtureFile(name=name, uri=f"fixture://{name}", mime_type="audio/wav")

    def get_file(
        self, file_name_or_id: str, *, timeout_seconds: Optional[float] = None
    ) -> FixtureFile:
        del timeout_seconds
        name = (
            file_name_or_id
            if str(file_name_or_id).startswith("files/")
            else f"files/{file_name_or_id}"
        )
        return FixtureFile(name=name, uri=f"fixture://{name}", mime_type="audio/wav")

    @staticmethod
    def wait_until_active(
        file_object: FixtureFile,
        *,
        timeout_seconds: float,
        poll_seconds: float = 2.0,
    ) -> FixtureFile:
        del timeout_seconds, poll_seconds
        return file_object

    @staticmethod
    def file_metadata(file_object: FixtureFile) -> GeminiFileMetadata:
        now = datetime.now(timezone.utc).isoformat()
        return GeminiFileMetadata(
            name=file_object.name,
            uri=file_object.uri,
            mime_type=file_object.mime_type,
            created_at=now,
            expires_at=None,
        )


__all__ = ["FixtureFile", "FixtureProvider"]
