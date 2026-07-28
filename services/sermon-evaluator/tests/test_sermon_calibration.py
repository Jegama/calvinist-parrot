"""Unit tests for sermon ceiling-compression calibration.

Tests cover:
- has_exhortation_language()
- has_climactic_language()
- has_christ_gospel_language()
- apply_ceiling_compression() gates (conclusion, proposition, main points,
  illustrations, application, exegetical support)
- Overall recomputation (ceil(avg) without placeholder_bias)
- End-to-end pipeline (strict + ceiling compression together)
"""

import pytest
from math import ceil

from sermon_evaluator.calibration import SermonScoreCalibrator
from sermon_evaluator.schemas import (
    SermonExtractionStep1,
    SermonScoringStep2,
    SermonPoint,
    SermonFCF,
    SermonGeneralComments,
    IntroductionScores,
    PropositionScores,
    MainPointsScores,
    ExegeticalSupportScores,
    ApplicationScores,
    IllustrationsScores,
    ConclusionScores,
)


# ---------- Factory helpers ----------

_SENTINEL = object()


def _make_point(
    point="The believer must trust God",
    summary="We should believe because God is faithful",
    verses="Romans 8:28",
    illustrations=_SENTINEL,
    application=_SENTINEL,
    subpoints=None,
) -> SermonPoint:
    return SermonPoint(
        Point=point,
        Summary=summary,
        Verses=verses,
        Illustrations=["A story of faith in hardship"] if illustrations is _SENTINEL else illustrations,
        Application=["Trust in Christ's provision for daily needs"] if application is _SENTINEL else application,
        Subpoints=subpoints or [],
    )


def _make_extraction(
    proposition="We must trust God in suffering",
    conclusion="The preacher exhorts the congregation to believe and rest in God's sovereign grace with passionate climax",
    body=None,
    fcf="The tendency toward self-reliance and fear of man in the face of trials",
) -> SermonExtractionStep1:
    if body is None:
        body = [
            _make_point(),
            _make_point(
                point="God is sovereign",
                summary="Therefore we must obey His word",
                verses="Psalm 115:3",
            ),
            _make_point(
                point="Christ redeems",
                summary="We should embrace the gospel",
                verses="Ephesians 2:8-9",
            ),
        ]
    return SermonExtractionStep1(
        Scripture_Introduction="Ephesians 2:1-10",
        Sermon_Introduction="Today we look at grace",
        Proposition=proposition,
        Body=body,
        Conclusion=conclusion,
        General_Comments=SermonGeneralComments(),
        Fallen_Condition_Focus=SermonFCF(FCF=fcf),
        Extraction_Confidence=0.9,
    )


def _make_scoring(overrides=None) -> SermonScoringStep2:
    """Return a scoring with all 4s (the inflated baseline)."""
    base = dict(
        Introduction=IntroductionScores(
            FCF_Introduced=4, Arouses_Attention=4, Overall=4
        ),
        Proposition=PropositionScores(
            Principle_and_Application_Wed=4,
            Establishes_Main_Theme=4,
            Summarizes_Introduction=4,
            Overall=4,
        ),
        Main_Points=MainPointsScores(
            Clarity=4,
            Hortatory_Universal_Truths=4,
            Proportional_and_Coexistent=4,
            Exposition_Quality=4,
            Illustration_Quality=4,
            Application_Quality=4,
            Overall=4,
        ),
        Exegetical_Support=ExegeticalSupportScores(
            Alignment_with_Text=4,
            Handles_Difficulties=4,
            Proof_Accuracy_and_Clarity=4,
            Context_and_Genre_Considered=4,
            Not_Belabored=4,
            Aids_Rather_Than_Impresses=4,
            Overall=4,
        ),
        Application=ApplicationScores(
            Clear_and_Practical=4,
            Redemptive_Focus=4,
            Mandate_vs_Idea_Distinction=4,
            Passage_Supported=4,
            Overall=4,
        ),
        Illustrations=IllustrationsScores(
            Lived_Body_Detail=4,
            Strengthens_Points=4,
            Proportion=4,
            Overall=4,
        ),
        Conclusion=ConclusionScores(
            Summary=4,
            Compelling_Exhortation=4,
            Climax=4,
            Pointed_End=4,
            Overall=4,
        ),
        Strengths=["Good exposition"],
        Growth_Areas=["More illustrations"],
        Next_Steps=["Study more"],
        Scoring_Confidence=0.85,
    )
    if overrides:
        base.update(overrides)
    return SermonScoringStep2(**base)


cal = SermonScoreCalibrator()


# ---------- has_exhortation_language ----------

class TestHasExhortationLanguage:
    def test_descriptive_exhort(self):
        assert cal.has_exhortation_language(
            "He exhorts the congregation to stand firm in their faith."
        )

    def test_descriptive_appeal(self):
        assert cal.has_exhortation_language(
            "The preacher makes an emotional appeal to the listeners."
        )

    def test_descriptive_urge(self):
        assert cal.has_exhortation_language(
            "He urges them to consider their ways before God."
        )

    def test_descriptive_warning(self):
        assert cal.has_exhortation_language(
            "A solemn warning is given about the consequences of unbelief."
        )

    def test_direct_repent(self):
        assert cal.has_exhortation_language("Repent and believe in the gospel!")

    def test_call_to(self):
        assert cal.has_exhortation_language(
            "There is a call to renewed commitment to Christ."
        )

    def test_prayer(self):
        assert cal.has_exhortation_language(
            "He closes with a prayer for the congregation."
        )

    def test_charge(self):
        assert cal.has_exhortation_language(
            "The charge is to go forth and proclaim Christ."
        )

    def test_negative_plain_summary(self):
        assert not cal.has_exhortation_language(
            "The sermon summarizes the main points of the passage."
        )

    def test_negative_empty(self):
        assert not cal.has_exhortation_language("")

    def test_negative_none(self):
        assert not cal.has_exhortation_language(None)

    def test_case_insensitive(self):
        assert cal.has_exhortation_language("He EXHORTS the listeners to BELIEVE.")


# ---------- has_climactic_language ----------

class TestHasClimacticLanguage:
    def test_climax(self):
        assert cal.has_climactic_language("The sermon builds to a climax of praise.")

    def test_crescendo(self):
        assert cal.has_climactic_language(
            "A crescendo of theological insight leads to the final point."
        )

    def test_passionate(self):
        assert cal.has_climactic_language(
            "The preacher becomes passionate about the cross."
        )

    def test_stirring(self):
        assert cal.has_climactic_language(
            "A stirring conclusion about God's faithfulness."
        )

    def test_compelling(self):
        assert cal.has_climactic_language(
            "He provides a compelling vision of the new creation."
        )

    def test_glory(self):
        assert cal.has_climactic_language(
            "All is directed toward the glory of God alone."
        )

    def test_eternal(self):
        assert cal.has_climactic_language(
            "The eternal significance of Christ's work is presented."
        )

    def test_powerful(self):
        assert cal.has_climactic_language(
            "A powerful statement about God's sovereignty closes the sermon."
        )

    def test_negative_flat(self):
        assert not cal.has_climactic_language(
            "The preacher then reviews the three points."
        )

    def test_negative_empty(self):
        assert not cal.has_climactic_language("")

    def test_negative_none(self):
        assert not cal.has_climactic_language(None)


# ---------- has_christ_gospel_language ----------

class TestHasChristGospelLanguage:
    def test_trust_in_christ(self):
        assert cal.has_christ_gospel_language(
            ["Trust in Christ's provision for your daily needs"]
        )

    def test_gospel(self):
        assert cal.has_christ_gospel_language(
            ["Embrace the gospel as the foundation of life"]
        )

    def test_grace(self):
        assert cal.has_christ_gospel_language(
            ["Rest in God's grace rather than your own works"]
        )

    def test_cross(self):
        assert cal.has_christ_gospel_language(
            ["Look to the cross for assurance of forgiveness"]
        )

    def test_redemption(self):
        assert cal.has_christ_gospel_language(
            ["Remember the redemption purchased by Christ"]
        )

    def test_justification(self):
        assert cal.has_christ_gospel_language(
            ["Our justification comes through faith alone"]
        )

    def test_negative_moralism(self):
        assert not cal.has_christ_gospel_language(
            ["Try harder to be a better person", "Read your Bible more often"]
        )

    def test_negative_empty(self):
        assert not cal.has_christ_gospel_language([])

    def test_negative_none(self):
        assert not cal.has_christ_gospel_language(None)

    def test_multiple_items_one_match(self):
        assert cal.has_christ_gospel_language(
            ["Be kind to others", "Trust in Christ for strength"]
        )


# ---------- Conclusion gates ----------

class TestConclusionGates:
    def test_short_conclusion_caps_summary_and_pointed_end(self):
        """Gate 1: Conclusion < 50 words caps Summary and Pointed_End at 3."""
        extraction = _make_extraction(conclusion="He ends the sermon. Amen.")
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Conclusion.Summary <= 3
        assert scoring.Conclusion.Pointed_End <= 3

    def test_long_conclusion_no_cap(self):
        """Gate 1: Conclusion >= 50 words does not cap."""
        long_conclusion = " ".join(["word"] * 60)
        extraction = _make_extraction(conclusion=long_conclusion)
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Conclusion.Summary == 4
        assert scoring.Conclusion.Pointed_End == 4

    def test_no_exhortation_caps_compelling(self):
        """Gate 2: No exhortation language caps Compelling_Exhortation at 3."""
        extraction = _make_extraction(
            conclusion="The sermon simply restates the three points and then stops without any further remarks."
        )
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Conclusion.Compelling_Exhortation <= 3

    def test_exhortation_present_no_cap(self):
        """Gate 2: Exhortation language preserves score."""
        extraction = _make_extraction(
            conclusion="The preacher exhorts the congregation to believe in Christ and live by faith every single day of their lives going forward in hope and trust"
        )
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Conclusion.Compelling_Exhortation == 4

    def test_no_climactic_caps_climax(self):
        """Gate 3: No climactic language caps Climax at 3."""
        extraction = _make_extraction(
            conclusion="In summary the preacher wraps up the message by reviewing the outline and saying goodbye to the audience with a brief prayer at the end of the service"
        )
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Conclusion.Climax <= 3

    def test_climactic_present_no_cap(self):
        """Gate 3: Climactic language preserves score."""
        extraction = _make_extraction(
            conclusion="The sermon builds to a passionate climax about the glory of Christ's redemption, stirring the hearts of all who listen to believe and rest in Him forevermore"
        )
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Conclusion.Climax == 4


# ---------- Proposition gate ----------

class TestPropositionGate:
    def test_verbose_proposition_caps_main_theme(self):
        """Gate 4: Proposition > 25 words caps Establishes_Main_Theme at 3."""
        verbose = " ".join(["word"] * 30)
        extraction = _make_extraction(proposition=verbose)
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Proposition.Establishes_Main_Theme <= 3

    def test_concise_proposition_no_cap(self):
        """Gate 4: Proposition <= 25 words does not cap."""
        extraction = _make_extraction(proposition="Trust God in all of life")
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Proposition.Establishes_Main_Theme == 4


# ---------- Main Points gates ----------

class TestMainPointsGates:
    def test_long_point_text_caps_clarity(self):
        """Gate 5: Avg point text > 15 words caps Clarity at 3."""
        long_point = " ".join(["word"] * 20)
        body = [
            _make_point(point=long_point),
            _make_point(point=long_point),
            _make_point(point=long_point),
        ]
        extraction = _make_extraction(body=body)
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Main_Points.Clarity <= 3

    def test_short_point_text_no_cap(self):
        """Gate 5: Avg point text <= 15 words does not cap."""
        body = [
            _make_point(point="Trust God"),
            _make_point(point="Obey His Word"),
            _make_point(point="Love one another"),
        ]
        extraction = _make_extraction(body=body)
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Main_Points.Clarity == 4

    def test_few_hortatory_caps(self):
        """Gate 6: <67% hortatory cues caps Hortatory_Universal_Truths at 3."""
        body = [
            _make_point(
                point="The passage talks about love",
                summary="It discusses the nature of love",
            ),
            _make_point(
                point="Paul mentions grace",
                summary="He says that grace is important",
            ),
            _make_point(
                point="We must obey",
                summary="Therefore we should follow Christ",
            ),
        ]
        extraction = _make_extraction(body=body)
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Main_Points.Hortatory_Universal_Truths <= 3

    def test_many_hortatory_no_cap(self):
        """Gate 6: >=67% hortatory cues does not cap."""
        body = [
            _make_point(
                point="We must trust God",
                summary="Therefore we should believe His promises",
            ),
            _make_point(
                point="We should obey",
                summary="Because Christ commands us to follow",
            ),
            _make_point(
                point="We ought to love",
                summary="Thus we must embrace one another",
            ),
        ]
        extraction = _make_extraction(body=body)
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Main_Points.Hortatory_Universal_Truths == 4


# ---------- Illustration gates ----------

class TestIllustrationGates:
    def test_low_density_caps_lived_body(self):
        """Gate 7: Avg illustrations per point < 1.0 caps Lived_Body_Detail at 3."""
        body = [
            _make_point(illustrations=[]),
            _make_point(illustrations=[]),
            _make_point(illustrations=["One story"]),
        ]
        extraction = _make_extraction(body=body)
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Illustrations.Lived_Body_Detail <= 3

    def test_adequate_density_no_cap(self):
        """Gate 7: Avg illustrations >= 1.0 does not cap."""
        body = [
            _make_point(illustrations=["Story 1"]),
            _make_point(illustrations=["Story 2"]),
            _make_point(illustrations=["Story 3"]),
        ]
        extraction = _make_extraction(body=body)
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Illustrations.Lived_Body_Detail == 4

    def test_excessive_density_caps_proportion(self):
        """Gate 8: Avg illustrations > 3.0 caps Proportion at 3."""
        body = [
            _make_point(illustrations=["S1", "S2", "S3", "S4"]),
            _make_point(illustrations=["S5", "S6", "S7", "S8"]),
            _make_point(illustrations=["S9", "S10", "S11", "S12"]),
        ]
        extraction = _make_extraction(body=body)
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Illustrations.Proportion <= 3

    def test_moderate_density_no_proportion_cap(self):
        """Gate 8: Avg illustrations <= 3.0 does not cap Proportion."""
        body = [
            _make_point(illustrations=["S1", "S2"]),
            _make_point(illustrations=["S3", "S4"]),
            _make_point(illustrations=["S5", "S6"]),
        ]
        extraction = _make_extraction(body=body)
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Illustrations.Proportion == 4


# ---------- Application gates ----------

class TestApplicationGates:
    def test_few_concrete_apps_caps_clear_practical(self):
        """Gate 9: <67% concrete application caps Clear_and_Practical at 3."""
        body = [
            _make_point(application=["Think about God more"]),
            _make_point(application=["Consider your ways"]),
            _make_point(application=["Trust in Christ's provision"]),
        ]
        extraction = _make_extraction(body=body)
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Application.Clear_and_Practical <= 3

    def test_many_concrete_apps_no_cap(self):
        """Gate 9: >=67% concrete application does not cap."""
        body = [
            _make_point(application=["Repent of your sins daily"]),
            _make_point(application=["Pray for your neighbors"]),
            _make_point(application=["Serve the local church with your gifts"]),
        ]
        extraction = _make_extraction(body=body)
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Application.Clear_and_Practical == 4

    def test_no_gospel_language_caps_redemptive(self):
        """Gate 10: No Christ/gospel language caps Redemptive_Focus at 4."""
        body = [
            _make_point(application=["Be a better person"]),
            _make_point(application=["Try harder every day"]),
            _make_point(application=["Follow the rules"]),
        ]
        extraction = _make_extraction(body=body)
        scoring = _make_scoring()
        # Set to 5 so we can see the cap at 4
        scoring.Application.Redemptive_Focus = 5
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Application.Redemptive_Focus <= 4

    def test_gospel_language_preserves_redemptive(self):
        """Gate 10: Christ/gospel language preserves score."""
        body = [
            _make_point(application=["Trust in Christ's finished work"]),
            _make_point(application=["Rest in the gospel of grace"]),
            _make_point(application=["Look to the cross for hope"]),
        ]
        extraction = _make_extraction(body=body)
        scoring = _make_scoring()
        scoring.Application.Redemptive_Focus = 5
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Application.Redemptive_Focus == 5


# ---------- Exegetical Support gate ----------

class TestExegeticalGate:
    def test_few_verses_caps_alignment(self):
        """Gate 11: <67% of points with Verses caps Alignment_with_Text at 3."""
        body = [
            _make_point(verses=""),
            _make_point(verses=""),
            _make_point(verses="Romans 8:28"),
        ]
        extraction = _make_extraction(body=body)
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Exegetical_Support.Alignment_with_Text <= 3

    def test_many_verses_no_cap(self):
        """Gate 11: >=67% of points with Verses does not cap."""
        body = [
            _make_point(verses="Romans 8:28"),
            _make_point(verses="Psalm 23:1"),
            _make_point(verses="John 3:16"),
        ]
        extraction = _make_extraction(body=body)
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Exegetical_Support.Alignment_with_Text == 4


# ---------- Overall recomputation ----------

class TestOverallRecomputation:
    def test_overall_is_ceil_avg_no_bias(self):
        """After ceiling compression, Overall = ceil(avg(subs)) without placeholder_bias."""
        extraction = _make_extraction(conclusion="Short.")
        scoring = _make_scoring()
        # Conclusion will have Summary=3, Pointed_End=3, Compelling_Exhortation and Climax also capped
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        subs = [
            scoring.Conclusion.Summary,
            scoring.Conclusion.Compelling_Exhortation,
            scoring.Conclusion.Climax,
            scoring.Conclusion.Pointed_End,
        ]
        expected = max(1, min(5, ceil(sum(subs) / len(subs))))
        assert scoring.Conclusion.Overall == expected

    def test_all_fives_recomputed_to_five(self):
        """If no gates fire, sub-scores stay at 4 and Overall = ceil(4) = 4."""
        extraction = _make_extraction(
            conclusion="The preacher exhorts the congregation to believe in the gospel. "
            "He builds to a passionate climax about the glory of God and the eternal "
            "significance of Christ. " * 5,
            proposition="Trust God in trials",
        )
        scoring = _make_scoring()
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        # With exhortation + climactic + enough words, conclusion scores stay at 4
        assert scoring.Conclusion.Overall == 4

    def test_mixed_subs_recompute(self):
        """Verify correct recomputation with a mix of capped and uncapped."""
        extraction = _make_extraction(conclusion="Short end.")
        scoring = _make_scoring()
        # Set one high, rest will be capped
        scoring.Conclusion.Summary = 5
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        # Summary was 5 but capped to 3 (< 50 words), others also capped
        assert scoring.Conclusion.Summary == 3
        subs = [
            scoring.Conclusion.Summary,
            scoring.Conclusion.Compelling_Exhortation,
            scoring.Conclusion.Climax,
            scoring.Conclusion.Pointed_End,
        ]
        expected = max(1, min(5, ceil(sum(subs) / len(subs))))
        assert scoring.Conclusion.Overall == expected


# ---------- End-to-end pipeline ----------

class TestEndToEndPipeline:
    def test_strict_then_ceiling_compression(self):
        """Both strict calibration and ceiling compression apply in sequence."""
        # Extraction with no proposition (triggers strict) + short conclusion (triggers ceiling)
        extraction = _make_extraction(
            proposition="no explicit proposition",
            conclusion="Brief ending.",
            fcf="sin",  # non-specific FCF
        )
        scoring = _make_scoring()

        # Apply strict first
        scoring = cal.apply_strict_calibration(scoring, extraction)
        # Proposition sub-scores should be capped at 2 (non-specific FCF, no softening)
        assert scoring.Proposition.Establishes_Main_Theme <= 2

        # Apply ceiling compression
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        # Conclusion sub-scores capped by short conclusion
        assert scoring.Conclusion.Summary <= 3
        assert scoring.Conclusion.Pointed_End <= 3

    def test_already_low_scores_not_raised(self):
        """Ceiling compression never raises scores, only caps them."""
        extraction = _make_extraction(conclusion="Short.")
        scoring = _make_scoring()
        scoring.Conclusion.Summary = 2
        scoring.Conclusion.Pointed_End = 1
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        assert scoring.Conclusion.Summary == 2
        assert scoring.Conclusion.Pointed_End == 1

    def test_empty_body_no_crash(self):
        """Empty body list should not cause division by zero."""
        extraction = _make_extraction(body=[])
        scoring = _make_scoring()
        # Should not raise
        scoring = cal.apply_ceiling_compression(scoring, extraction)
        # Body-dependent gates don't fire, other gates may
        assert 1 <= scoring.Conclusion.Overall <= 5

    def test_method_exists_on_calibrator(self):
        """Verify apply_ceiling_compression is a method on SermonScoreCalibrator."""
        c = SermonScoreCalibrator()
        assert hasattr(c, "apply_ceiling_compression")
        assert callable(c.apply_ceiling_compression)
