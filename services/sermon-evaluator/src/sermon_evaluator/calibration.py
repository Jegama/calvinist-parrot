"""Score calibration heuristics for sermon evaluation.

Applies conservative evidence-based adjustments to prevent score inflation.
"""

from __future__ import annotations

from math import ceil
from typing import List

from .schemas import (
    SermonExtractionStep1,
    SermonScoringStep2,
)


class SermonScoreCalibrator:
    """Applies strict calibration heuristics to scoring results."""

    @staticmethod
    def clamp_int(v: int, lo: int = 1, hi: int = 5) -> int:
        """Clamp integer value to [lo, hi] range."""
        return max(lo, min(hi, int(v)))

    @staticmethod
    def is_fcf_specific(fcf_str: str) -> bool:
        """Check if FCF is specific (not vague).

        Returns False if:
        - Length < 20 chars OR < 6 words
        - Contains unqualified generic singletons
        - Contains vague phrases
        Returns True if:
        - Contains specificity signals (qualifiers, concrete needs)
        """
        if not fcf_str or len(fcf_str) < 20:
            return False
        word_count = len(fcf_str.split())
        if word_count < 6:
            return False

        # Generic singletons (exact word match)
        generic_singletons = [
            "sin",
            "sinfulness",
            "brokenness",
            "struggle",
            "temptation",
            "fear",
            "doubt",
            "pride",
            "guilt",
            "shame",
            "idolatry",
            "loneliness",
            "suffering",
            "pain",
        ]
        words = fcf_str.split()
        if word_count <= 2 and any(w in generic_singletons for w in words):
            return False

        # Vague phrases
        vague_phrases = [
            "we all struggle",
            "people struggle",
            "general",
            "human condition",
            "broken world",
            "sin nature",
            "common issue",
            "life is hard",
            "try harder",
        ]
        if any(vp in fcf_str for vp in vague_phrases):
            return False

        # Specificity signals
        qualifiers = [
            "of ",
            "for ",
            "in ",
            "under ",
            "against ",
            "before ",
            "toward ",
            "from ",
        ]
        concrete_needs = [
            "fear of man",
            "works-righteousness",
            "self-reliant",
            "self reliant",
            "partiality",
            "bitterness",
            "envy",
            "sexual immorality",
            "resentment",
            "control",
            "anxiety",
            "legalism",
            "unbelief",
            "despair",
            "self-righteousness",
            "self righteousness",
            "performance",
            "approval",
            "abandonment",
        ]
        has_qualifier = any(q in fcf_str for q in qualifiers)
        has_concrete = any(cn in fcf_str for cn in concrete_needs)

        return has_qualifier or has_concrete

    @staticmethod
    def has_hortatory_cues(point_text: str, summary_text: str) -> bool:
        """Check for hortatory language (imperative/exhortation) vs mere recap."""
        combined = (point_text + " " + summary_text).lower()
        hortatory = [
            "should",
            "must",
            "ought",
            "need to",
            "called to",
            "repent",
            "obey",
            "trust",
            "believe",
            "follow",
            "pursue",
            "reject",
            "embrace",
            "because",
            "therefore",
            "so that",
            "thus",
            "hence",
        ]
        recap = [
            "verses",
            "talks about",
            "is about",
            "discusses",
            "mentions",
            "says that",
        ]

        has_hort = any(h in combined for h in hortatory)
        has_recap = any(r in combined for r in recap)

        return has_hort and not has_recap

    @staticmethod
    def has_concrete_application(app_list: List[str]) -> bool:
        """Check if application list contains concrete action verbs/nouns."""
        if not app_list:
            return False
        app_text = " ".join(app_list).lower()
        concrete_verbs = [
            "repent",
            "confess",
            "trust",
            "believe",
            "pray",
            "reconcile",
            "forgive",
            "serve",
            "love",
            "honor",
            "submit",
            "obey",
            "seek",
            "rest",
            "rejoice",
            "give",
            "share",
            "pursue",
            "reject",
            "turn",
        ]
        return any(cv in app_text for cv in concrete_verbs)

    # ---- Ceiling compression evidence helpers ----

    @staticmethod
    def has_exhortation_language(text: str) -> bool:
        """Check for exhortation signals in extraction description text.

        Matches descriptive vocabulary (\"exhorts the listeners\") and
        direct verbs (\"repent\", \"believe\") when they appear.
        """
        if not text:
            return False
        lower = text.lower()
        signals = [
            "exhort",
            "appeal",
            "urge",
            "plea",
            "warning",
            "call to",
            "prayer",
            "charge",
            "repent",
            "believe",
        ]
        return any(s in lower for s in signals)

    @staticmethod
    def has_climactic_language(text: str) -> bool:
        """Check for climactic/emotional intensity signals in extraction description.

        Matches descriptive signals used in Step 1 extraction text.
        """
        if not text:
            return False
        lower = text.lower()
        signals = [
            "climax",
            "crescendo",
            "emphatic",
            "passionate",
            "emotional urgency",
            "decisive",
            "powerful",
            "stirring",
            "compelling",
            "glory",
            "eternal",
            "forevermore",
        ]
        return any(s in lower for s in signals)

    @staticmethod
    def has_christ_gospel_language(app_texts: List[str]) -> bool:
        """Check for Christ/grace/gospel language in application texts.

        Application texts tend to be more direct (\"Trust in Christ's provision\").
        """
        if not app_texts:
            return False
        combined = " ".join(app_texts).lower()
        signals = [
            "christ",
            "gospel",
            "grace",
            "cross",
            "redeemer",
            "redemption",
            "savior",
            "salvation",
            "atonement",
            "justif",
            "sanctif",
        ]
        return any(s in combined for s in signals)

    def apply_ceiling_compression(
        self, scoring: SermonScoringStep2, extraction: SermonExtractionStep1
    ) -> SermonScoringStep2:
        """Apply evidence-gated ceiling compression to inflated sub-scores.

        Targets the most inflated sections based on empirical analysis:
        - Conclusion (89% of sub-scores are 4)
        - Proposition (67%)
        - Main Points (67%)
        - Illustrations (74%)
        - Application (50%)
        - Exegetical Support (72%)

        After all caps, recomputes each affected section's Overall as
        ceil(avg(subs)), clamped 1-5.  No placeholder_bias in this step.
        """
        body = extraction.Body or []
        conclusion_text = (extraction.Conclusion or "").strip()

        # --- Conclusion gates (89% 4s) ---
        # Gate 1: Conclusion < 50 words -> cap Summary and Pointed_End at 3
        if len(conclusion_text.split()) < 50:
            scoring.Conclusion.Summary = self.clamp_int(
                min(scoring.Conclusion.Summary, 3)
            )
            scoring.Conclusion.Pointed_End = self.clamp_int(
                min(scoring.Conclusion.Pointed_End, 3)
            )

        # Gate 2: No exhortation language -> cap Compelling_Exhortation at 3
        if not self.has_exhortation_language(conclusion_text):
            scoring.Conclusion.Compelling_Exhortation = self.clamp_int(
                min(scoring.Conclusion.Compelling_Exhortation, 3)
            )

        # Gate 3: No climactic language -> cap Climax at 3
        if not self.has_climactic_language(conclusion_text):
            scoring.Conclusion.Climax = self.clamp_int(
                min(scoring.Conclusion.Climax, 3)
            )

        # --- Proposition gate (67% 4s) ---
        # Gate 4: Proposition > 25 words -> cap Establishes_Main_Theme at 3
        prop_text = (extraction.Proposition or "").strip()
        if len(prop_text.split()) > 25:
            scoring.Proposition.Establishes_Main_Theme = self.clamp_int(
                min(scoring.Proposition.Establishes_Main_Theme, 3)
            )

        # --- Main Points gates (67% 4s) ---
        if body:
            # Gate 5: Avg point text > 15 words -> cap Clarity at 3
            point_word_counts = [len((p.Point or "").split()) for p in body]
            avg_point_words = sum(point_word_counts) / len(point_word_counts)
            if avg_point_words > 15:
                scoring.Main_Points.Clarity = self.clamp_int(
                    min(scoring.Main_Points.Clarity, 3)
                )

            # Gate 6: <67% of points have hortatory cues -> cap Hortatory at 3
            hortatory_count = sum(
                1
                for p in body
                if self.has_hortatory_cues(p.Point or "", p.Summary or "")
            )
            if hortatory_count / len(body) < 0.67:
                scoring.Main_Points.Hortatory_Universal_Truths = self.clamp_int(
                    min(scoring.Main_Points.Hortatory_Universal_Truths, 3)
                )

        # --- Illustrations gates (74% 4s) ---
        if body:
            illus_counts = [len(p.Illustrations or []) for p in body]
            avg_illus = sum(illus_counts) / len(illus_counts)

            # Gate 7: Avg illustrations per point < 1.0 -> cap Lived_Body_Detail at 3
            if avg_illus < 1.0:
                scoring.Illustrations.Lived_Body_Detail = self.clamp_int(
                    min(scoring.Illustrations.Lived_Body_Detail, 3)
                )

            # Gate 8: Avg illustrations per point > 3.0 -> cap Proportion at 3
            if avg_illus > 3.0:
                scoring.Illustrations.Proportion = self.clamp_int(
                    min(scoring.Illustrations.Proportion, 3)
                )

        # --- Application gates (50% 4s) ---
        if body:
            # Gate 9: <67% of points have concrete application -> cap Clear_and_Practical at 3
            concrete_count = sum(
                1 for p in body if self.has_concrete_application(p.Application or [])
            )
            if concrete_count / len(body) < 0.67:
                scoring.Application.Clear_and_Practical = self.clamp_int(
                    min(scoring.Application.Clear_and_Practical, 3)
                )

            # Gate 10: No Christ/gospel language in applications -> cap Redemptive_Focus at 4
            all_apps = [
                app for p in body for app in (p.Application or [])
            ]
            if not self.has_christ_gospel_language(all_apps):
                scoring.Application.Redemptive_Focus = self.clamp_int(
                    min(scoring.Application.Redemptive_Focus, 4)
                )

        # --- Exegetical Support gate (72% 4s) ---
        if body:
            # Gate 11: <67% of body points have Verses -> cap Alignment_with_Text at 3
            verse_count = sum(
                1 for p in body if (p.Verses or "").strip()
            )
            if verse_count / len(body) < 0.67:
                scoring.Exegetical_Support.Alignment_with_Text = self.clamp_int(
                    min(scoring.Exegetical_Support.Alignment_with_Text, 3)
                )

        # --- Recompute section Overalls as ceil(avg(subs)), no placeholder_bias ---
        def recompute_overall(values: List[int]) -> int:
            avg_val = sum(values) / max(1, len(values))
            return self.clamp_int(ceil(avg_val))

        scoring.Conclusion.Overall = recompute_overall(
            [
                scoring.Conclusion.Summary,
                scoring.Conclusion.Compelling_Exhortation,
                scoring.Conclusion.Climax,
                scoring.Conclusion.Pointed_End,
            ]
        )
        scoring.Proposition.Overall = recompute_overall(
            [
                scoring.Proposition.Principle_and_Application_Wed,
                scoring.Proposition.Establishes_Main_Theme,
                scoring.Proposition.Summarizes_Introduction,
            ]
        )
        scoring.Main_Points.Overall = recompute_overall(
            [
                scoring.Main_Points.Clarity,
                scoring.Main_Points.Hortatory_Universal_Truths,
                scoring.Main_Points.Proportional_and_Coexistent,
                scoring.Main_Points.Exposition_Quality,
                scoring.Main_Points.Illustration_Quality,
                scoring.Main_Points.Application_Quality,
            ]
        )
        scoring.Illustrations.Overall = recompute_overall(
            [
                scoring.Illustrations.Lived_Body_Detail,
                scoring.Illustrations.Strengthens_Points,
                scoring.Illustrations.Proportion,
            ]
        )
        scoring.Application.Overall = recompute_overall(
            [
                scoring.Application.Clear_and_Practical,
                scoring.Application.Redemptive_Focus,
                scoring.Application.Mandate_vs_Idea_Distinction,
                scoring.Application.Passage_Supported,
            ]
        )
        scoring.Exegetical_Support.Overall = recompute_overall(
            [
                scoring.Exegetical_Support.Alignment_with_Text,
                scoring.Exegetical_Support.Handles_Difficulties,
                scoring.Exegetical_Support.Proof_Accuracy_and_Clarity,
                scoring.Exegetical_Support.Context_and_Genre_Considered,
                scoring.Exegetical_Support.Not_Belabored,
                scoring.Exegetical_Support.Aids_Rather_Than_Impresses,
            ]
        )

        return scoring

    def apply_strict_calibration(
        self, scoring: SermonScoringStep2, extraction: SermonExtractionStep1
    ) -> SermonScoringStep2:
        """Downshift inflated scores using evidence from Step 1.

        Heuristics (conservative, integer outputs 1-5):
        - No explicit proposition -> cap scores (3 if conditional thresholds met, else 2)
        - No explicit conclusion -> Conclusion sub-scores max 2
        - FCF missing/vague -> Introduction.FCF_Introduced max 2
        - Body points: >50% lack Applications -> Application_Quality max 2
        - Body points: >50% lack Illustrations -> Illustration_Quality max 2, Illustrations.* max 3
        - Body <2 points -> Proportional_and_Coexistent max 2
        - Structure_Comments flag fragmentation -> Proportional_and_Coexistent max 2, Hortatory max 2
        - Placeholder bias: downshift Overall by 1 (except when conditional softening applies)

        After changes, recompute each section's Overall as ceil(avg(subs)).
        """
        prop_text = (extraction.Proposition or "").strip().lower()
        concl_text = (extraction.Conclusion or "").strip().lower()
        fcf_original = (extraction.Fallen_Condition_Focus.FCF or "").strip().lower()
        body = extraction.Body or []
        structure_comments = (
            extraction.General_Comments.Structure_Comments or ""
        ).strip().lower()

        # Check if Structure_Comments explicitly flag fragmentation patterns
        fragmentation_markers = [
            "repeat",
            "repetition",
            "repetitive",
            "orphan",
            "disconnected",
            "disjointed",
            "verse-by-verse",
            "verse by verse", 
            "multiple mini-sermons",
            "lacks progression",
            "without progression",
            "different spheres",
        ]
        structure_flags_fragmentation = any(
            marker in structure_comments for marker in fragmentation_markers
        )

        # 1) Proposition present? Check conditional thresholds
        proposition_missing = "no explicit proposition" in prop_text or not prop_text
        conditional_softening_applies = False
        fcf_specific = self.is_fcf_specific(fcf_original)

        if proposition_missing:
            body_count_ok = len(body) >= 3 or (
                len(body) >= 2 and any(p.Subpoints for p in body)
            )

            points_with_concrete_apps = sum(
                1 for p in body if self.has_concrete_application(p.Application or [])
            )
            apps_present = len(body) > 0 and (
                points_with_concrete_apps / len(body)
            ) >= 0.67

            hortatory_count = sum(
                1
                for p in body
                if self.has_hortatory_cues(p.Point or "", p.Summary or "")
            )
            hortatory_ok = hortatory_count >= 2

            conclusion_present = (
                "no explicit conclusion" not in concl_text and concl_text
            )
            fcf_words = set(w for w in fcf_original.lower().split() if len(w) > 3)
            point_words = set(
                w for p in body for w in (p.Point or "").lower().split() if len(w) > 3
            )
            overlap_ok = len(fcf_words & point_words) >= 2
            cohesion_ok = conclusion_present and overlap_ok

            conditional_softening_applies = (
                fcf_specific
                and body_count_ok
                and apps_present
                and hortatory_ok
                and cohesion_ok
            )

            cap = 3 if conditional_softening_applies else 2
            s = scoring.Proposition
            s.Principle_and_Application_Wed = self.clamp_int(
                min(s.Principle_and_Application_Wed, cap)
            )
            s.Establishes_Main_Theme = self.clamp_int(min(s.Establishes_Main_Theme, cap))
            s.Summarizes_Introduction = self.clamp_int(
                min(s.Summarizes_Introduction, cap)
            )

        # 2) Conclusion present?
        if "no explicit conclusion" in concl_text or not concl_text:
            s = scoring.Conclusion
            s.Summary = self.clamp_int(min(s.Summary, 2))
            s.Compelling_Exhortation = self.clamp_int(min(s.Compelling_Exhortation, 2))
            s.Climax = self.clamp_int(min(s.Climax, 2))
            s.Pointed_End = self.clamp_int(min(s.Pointed_End, 2))

        # 3) FCF specificity
        if not fcf_specific:
            scoring.Introduction.FCF_Introduced = self.clamp_int(
                min(scoring.Introduction.FCF_Introduced, 2)
            )

        # 4) Body applications / illustrations
        total_points = len(body)
        empty_apps = sum(1 for p in body if not (p.Application or []))
        empty_illus = sum(1 for p in body if not (p.Illustrations or []))
        if total_points > 0:
            if empty_apps / total_points > 0.5:
                scoring.Main_Points.Application_Quality = self.clamp_int(
                    min(scoring.Main_Points.Application_Quality, 2)
                )
            if empty_illus / total_points > 0.5:
                scoring.Main_Points.Illustration_Quality = self.clamp_int(
                    min(scoring.Main_Points.Illustration_Quality, 2)
                )
                scoring.Illustrations.Lived_Body_Detail = self.clamp_int(
                    min(scoring.Illustrations.Lived_Body_Detail, 3)
                )
                scoring.Illustrations.Strengthens_Points = self.clamp_int(
                    min(scoring.Illustrations.Strengthens_Points, 3)
                )
                scoring.Illustrations.Proportion = self.clamp_int(
                    min(scoring.Illustrations.Proportion, 3)
                )

        # 5) Too few points
        if total_points < 2:
            scoring.Main_Points.Proportional_and_Coexistent = self.clamp_int(
                min(scoring.Main_Points.Proportional_and_Coexistent, 2)
            )

        # 5b) Structure_Comments explicit fragmentation flags
        # If extraction explicitly identifies structural issues, trust that assessment
        if structure_flags_fragmentation:
            scoring.Main_Points.Proportional_and_Coexistent = self.clamp_int(
                min(scoring.Main_Points.Proportional_and_Coexistent, 2)
            )
            scoring.Main_Points.Hortatory_Universal_Truths = self.clamp_int(
                min(scoring.Main_Points.Hortatory_Universal_Truths, 2)
            )

        # 6) Placeholder bias
        placeholder_bias = 0
        proposition_bias_applies = (
            "no explicit proposition" in prop_text or not prop_text
        ) and not conditional_softening_applies
        placeholder_bias += 1 if proposition_bias_applies else 0
        placeholder_bias += (
            1 if ("no explicit conclusion" in concl_text or not concl_text) else 0
        )

        # Recompute per-section Overall
        def recompute_overall(values: List[int], current_overall: int) -> int:
            avg_val = sum(values) / max(1, len(values))
            recomputed = self.clamp_int(ceil(avg_val))
            if placeholder_bias and current_overall >= recomputed:
                recomputed = self.clamp_int(recomputed - 1)
            return recomputed

        scoring.Introduction.Overall = recompute_overall(
            [
                scoring.Introduction.FCF_Introduced,
                scoring.Introduction.Arouses_Attention,
            ],
            scoring.Introduction.Overall,
        )
        scoring.Proposition.Overall = recompute_overall(
            [
                scoring.Proposition.Principle_and_Application_Wed,
                scoring.Proposition.Establishes_Main_Theme,
                scoring.Proposition.Summarizes_Introduction,
            ],
            scoring.Proposition.Overall,
        )
        scoring.Main_Points.Overall = recompute_overall(
            [
                scoring.Main_Points.Clarity,
                scoring.Main_Points.Hortatory_Universal_Truths,
                scoring.Main_Points.Proportional_and_Coexistent,
                scoring.Main_Points.Exposition_Quality,
                scoring.Main_Points.Illustration_Quality,
                scoring.Main_Points.Application_Quality,
            ],
            scoring.Main_Points.Overall,
        )
        scoring.Exegetical_Support.Overall = recompute_overall(
            [
                scoring.Exegetical_Support.Alignment_with_Text,
                scoring.Exegetical_Support.Handles_Difficulties,
                scoring.Exegetical_Support.Proof_Accuracy_and_Clarity,
                scoring.Exegetical_Support.Context_and_Genre_Considered,
                scoring.Exegetical_Support.Not_Belabored,
                scoring.Exegetical_Support.Aids_Rather_Than_Impresses,
            ],
            scoring.Exegetical_Support.Overall,
        )
        scoring.Application.Overall = recompute_overall(
            [
                scoring.Application.Clear_and_Practical,
                scoring.Application.Redemptive_Focus,
                scoring.Application.Mandate_vs_Idea_Distinction,
                scoring.Application.Passage_Supported,
            ],
            scoring.Application.Overall,
        )
        scoring.Illustrations.Overall = recompute_overall(
            [
                scoring.Illustrations.Lived_Body_Detail,
                scoring.Illustrations.Strengthens_Points,
                scoring.Illustrations.Proportion,
            ],
            scoring.Illustrations.Overall,
        )
        scoring.Conclusion.Overall = recompute_overall(
            [
                scoring.Conclusion.Summary,
                scoring.Conclusion.Compelling_Exhortation,
                scoring.Conclusion.Climax,
                scoring.Conclusion.Pointed_End,
            ],
            scoring.Conclusion.Overall,
        )

        return scoring


__all__ = ["SermonScoreCalibrator"]
