"""Canonical, machine-readable sermon evaluation rubric.

Prompts, aggregation, reports, generated TypeScript metadata, and the public
framework page derive their rubric shape from this registry. Keep theological
and homiletical judgments in semantic model evaluation; this module contains no
language-specific evidence heuristics.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CriterionDefinition:
    key: str
    label: str
    description: str
    anchors: tuple[tuple[int, str], ...] = ()


@dataclass(frozen=True)
class SectionDefinition:
    key: str
    label: str
    goal: str
    criteria: tuple[CriterionDefinition, ...]
    gate_only: bool = False


@dataclass(frozen=True)
class AggregateDefinition:
    key: str
    client_key: str
    label: str
    weight: float
    members: tuple[str, ...]


RUBRIC_VERSION = "sermon-rubric-v2"
DOCTRINAL_GATE_CAP = 3.0


RUBRIC_SECTIONS = (
    SectionDefinition(
        key="Introduction",
        label="Introduction",
        goal="Orient hearers to the text, surface its burden, and awaken text-relevant attention.",
        criteria=(
            CriterionDefinition(
                "FCF_Introduced",
                "FCF Introduced",
                "A specific fallen condition is derived from the preached text and previewed.",
            ),
            CriterionDefinition(
                "Arouses_Attention",
                "Arouses Attention",
                "The opening creates text-relevant tension or need rather than distracting from Scripture.",
            ),
        ),
    ),
    SectionDefinition(
        key="Proposition",
        label="Proposition",
        goal="State one text-derived controlling truth that weds principle and response.",
        criteria=(
            CriterionDefinition(
                "Principle_and_Application_Wed",
                "Principle + Application Wed",
                "Subject and complement form one gospel principle with an implied or explicit response.",
            ),
            CriterionDefinition(
                "Establishes_Main_Theme",
                "Establishes Main Theme",
                "The proposition controls the sermon's scope and governs every point without competitors.",
            ),
            CriterionDefinition(
                "Summarizes_Introduction",
                "Summarizes Introduction",
                "The proposition carries forward and resolves the tension or need raised in the introduction.",
            ),
        ),
    ),
    SectionDefinition(
        key="Main_Points",
        label="Main Points",
        goal="Develop the proposition through clear, progressive, text-rooted movements.",
        criteria=(
            CriterionDefinition(
                "Clarity",
                "Clarity",
                "Main points are succinct, memorable, and readily distinguishable.",
            ),
            CriterionDefinition(
                "Hortatory_Universal_Truths",
                "Hortatory Universal Truths",
                "Points state timeless truths that call hearers to trust or obey rather than merely recapping verses.",
            ),
            CriterionDefinition(
                "Proportional_and_Coexistent",
                "Proportional & Coexistent",
                "Each point advances the single proposition through a distinct theological move toward a coherent climax.",
            ),
            CriterionDefinition(
                "Exposition_Quality",
                "Exposition Quality",
                "The sermon explains the text's meaning in context before moving to application.",
            ),
            CriterionDefinition(
                "Illustration_Quality",
                "Illustration Quality",
                "Illustrations illuminate the stated point and remain proportionate to it.",
            ),
            CriterionDefinition(
                "Application_Quality",
                "Application Quality",
                "Applications are specific, grace-motivated, and directed to heart and life.",
            ),
        ),
    ),
    SectionDefinition(
        key="Exegetical_Support",
        label="Exegetical Support",
        goal="Demonstrate that the sermon is governed by the passage's meaning, context, and purpose.",
        criteria=(
            CriterionDefinition(
                "Alignment_with_Text",
                "Alignment with Text",
                "The sermon's structure and emphasis mirror the passage's burden.",
            ),
            CriterionDefinition(
                "Handles_Difficulties",
                "Handles Difficulties",
                "Key interpretive, translation, and theological tensions are engaged honestly.",
            ),
            CriterionDefinition(
                "Proof_Accuracy_and_Clarity",
                "Proof Accuracy & Clarity",
                "Claims are supported with sound, understandable reasoning from the text.",
            ),
            CriterionDefinition(
                "Context_and_Genre_Considered",
                "Context & Genre Considered",
                "Literary, historical, canonical, and redemptive contexts are handled appropriately.",
            ),
            CriterionDefinition(
                "Not_Belabored",
                "Not Belabored",
                "The sermon stops proving once sufficient and avoids pedantic overload.",
            ),
            CriterionDefinition(
                "Aids_Rather_Than_Impresses",
                "Aids Rather Than Impresses",
                "Exegetical detail serves listener understanding rather than scholarly display.",
            ),
        ),
    ),
    SectionDefinition(
        key="Application",
        label="Application",
        goal="Carry the text's purpose into concrete, grace-powered faith and obedience.",
        criteria=(
            CriterionDefinition(
                "Clear_and_Practical",
                "Clear & Practical",
                "Concrete next steps or heart postures are identifiable.",
            ),
            CriterionDefinition(
                "Redemptive_Focus",
                "Redemptive Focus",
                "Application is motivated by Christ's person, work, and grace rather than bare willpower.",
            ),
            CriterionDefinition(
                "Mandate_vs_Idea_Distinction",
                "Mandate vs Idea Distinction",
                "Divine commands are distinguished from pastoral wisdom and suggestions.",
            ),
            CriterionDefinition(
                "Passage_Supported",
                "Passage Supported",
                "Application flows organically from the passage's explained meaning.",
            ),
        ),
    ),
    SectionDefinition(
        key="Illustrations",
        label="Illustrations",
        goal="Use concrete material that clarifies truth without eclipsing it or exploiting people.",
        criteria=(
            CriterionDefinition(
                "Lived_Body_Detail",
                "Lived-Body Detail",
                "Concrete, sensory realism helps hearers inhabit the truth.",
            ),
            CriterionDefinition(
                "Strengthens_Points",
                "Strengthens Points",
                "Illustrations illuminate the stated truth without hijacking focus.",
            ),
            CriterionDefinition(
                "Proportion",
                "Proportion",
                "Length and frequency are economical and avoid narrative domination.",
            ),
            CriterionDefinition(
                "Ethical_Use",
                "Illustration Ethics",
                "Stories protect confidentiality, dignity, and vulnerable people; they do not exploit family, congregants, or counselees.",
                anchors=(
                    (5, "Consistently protects dignity and privacy, uses permission or sufficient anonymization, and never turns vulnerable people into sermon material."),
                    (3, "No evident ethical breach, but privacy, permission, or power implications are unclear."),
                    (1, "Exposes, humiliates, stereotypes, or exploits identifiable or vulnerable people, or uses entrusted information irresponsibly."),
                ),
            ),
        ),
    ),
    SectionDefinition(
        key="Conclusion",
        label="Conclusion",
        goal="Land the sermon with a faithful summary, gospel-rooted exhortation, and decisive end.",
        criteria=(
            CriterionDefinition(
                "Summary",
                "Summary",
                "The conclusion concisely recapitulates the proposition and main movements.",
            ),
            CriterionDefinition(
                "Compelling_Exhortation",
                "Compelling Exhortation",
                "The sermon closes with a specific, gospel-rooted call to response.",
            ),
            CriterionDefinition(
                "Climax",
                "Climax",
                "The sermon reaches an appropriate theological and pastoral crescendo without emotional manipulation.",
            ),
            CriterionDefinition(
                "Pointed_End",
                "Pointed End",
                "The sermon lands decisively rather than fading or introducing new material.",
            ),
        ),
    ),
    SectionDefinition(
        key="Doctrinal_Fidelity",
        label="Doctrinal Fidelity",
        goal="Guard the sermon from compensating for contradiction of essential Christian doctrine with strong homiletical form.",
        gate_only=True,
        criteria=(
            CriterionDefinition(
                "Core_Doctrine_Fidelity",
                "Core Doctrine Fidelity",
                "The sermon affirms and does not deny or materially distort the ministry's core doctrines when they are implicated by the text or sermon claims.",
                anchors=(
                    (5, "Core doctrine implicated by the sermon is stated accurately, specifically, and integrated with the passage."),
                    (3, "No core contradiction is evident, but doctrinal treatment is generic, implicit, or not materially implicated."),
                    (1, "The sermon explicitly denies or materially distorts an implicated core doctrine."),
                ),
            ),
            CriterionDefinition(
                "Doctrinal_Proportionality",
                "Doctrinal Proportionality",
                "The sermon emphasizes doctrine in proportion to the passage and does not force a system onto the text.",
            ),
            CriterionDefinition(
                "Secondary_and_Tertiary_Charity",
                "Secondary & Tertiary Charity",
                "Differences among faithful Christians are represented accurately, humbly, and according to their proper doctrinal weight.",
            ),
        ),
    ),
    SectionDefinition(
        key="Pastoral_Posture",
        label="Pastoral Posture and Humble Authority",
        goal="Evaluate delegated authority with shared subjection: the preacher proclaims God's Word boldly while visibly remaining under it with the hearers.",
        criteria=(
            CriterionDefinition(
                "Shared_Subjection_and_Self_Application",
                "Shared Subjection & Self-Application",
                "The preacher credibly receives and applies the text as one addressed by it, sharing the congregation's need for Christ and grace without making himself the center.",
                anchors=(
                    (5, "At material exhortations the preacher stands under the text, appropriately owns shared need or dependence, and directs hearers with himself to Christ."),
                    (3, "Shared need is generic or implicit; the sermon is mainly hearer-directed but contains no clear self-exemption."),
                    (1, "The congregation is treated as the deficient party while the preacher presents himself as observer, exception, superior, or accomplished standard."),
                ),
            ),
            CriterionDefinition(
                "Servant_Authority",
                "Servant Authority",
                "Authority is located in Scripture and Christ rather than personality, office, experience, or preference; command is distinguished from counsel.",
                anchors=(
                    (5, "Speaks with confidence derived from the text while demonstrating submission to Christ, appropriate limits, and accountable servant leadership."),
                    (3, "Generally biblical and non-domineering, though the delegated source or limits of authority remain implicit."),
                    (1, "Claims authority from office, charisma, loyalty, or preference; binds consciences beyond Scripture or elevates the preacher."),
                ),
            ),
            CriterionDefinition(
                "Courageous_and_Gentle_Care",
                "Courageous & Gentle Care",
                "The preacher names sin and Christ's standard plainly with affection, patience, grief, hope, and gospel sufficiency.",
                anchors=(
                    (5, "Combines moral clarity with evident love, patience, hope, and dependence on Christ's provision."),
                    (3, "Clear and generally kind but clinical, generic, or uneven in warmth and hope."),
                    (1, "Harsh, contemptuous, mocking, coercive, manipulative, or so soft that biblical authority disappears."),
                ),
            ),
            CriterionDefinition(
                "Differentiated_Pastoral_Application",
                "Differentiated Pastoral Application",
                "Application distinguishes the rebellious, repentant, weak, doubting, suffering, and victimized rather than flattening every hearer into the same culpability or remedy.",
                anchors=(
                    (5, "Meaningfully differentiates hearers and applies law, comfort, warning, hope, and responsibility according to their condition."),
                    (3, "Application is sound but mostly undifferentiated or addressed to a generic hearer."),
                    (1, "Misassigns guilt, burdens sufferers or victims, comforts the unrepentant, or treats every condition as morally identical."),
                ),
            ),
            CriterionDefinition(
                "Pastoral_Use_of_Power",
                "Pastoral Use of Power",
                "The sermon uses pastoral influence to serve truth and hearers, avoiding fear, humiliation, loyalty demands, retaliation, manipulation, and conscience-binding.",
                anchors=(
                    (5, "Uses influence transparently and protectively, invites biblical examination, and directs loyalty to Christ rather than the preacher or institution."),
                    (3, "No evident abuse of power, though accountability, conscience boundaries, or invitations to examine the claims remain implicit."),
                    (1, "Uses fear, shame, threats, public exposure, institutional loyalty, or spiritual authority to control hearers or silence legitimate examination."),
                ),
            ),
        ),
    ),
)


AGGREGATES = (
    AggregateDefinition(
        "Textual_Fidelity",
        "textualFidelity",
        "Textual Fidelity",
        0.21,
        (
            "Exegetical_Support.Alignment_with_Text",
            "Exegetical_Support.Handles_Difficulties",
            "Exegetical_Support.Proof_Accuracy_and_Clarity",
            "Exegetical_Support.Context_and_Genre_Considered",
            "Exegetical_Support.Not_Belabored",
            "Exegetical_Support.Aids_Rather_Than_Impresses",
            "Main_Points.Exposition_Quality",
        ),
    ),
    AggregateDefinition(
        "Application_Effectiveness",
        "applicationEffectiveness",
        "Application Effectiveness",
        0.21,
        (
            "Application.Clear_and_Practical",
            "Application.Redemptive_Focus",
            "Application.Mandate_vs_Idea_Distinction",
            "Application.Passage_Supported",
            "Main_Points.Application_Quality",
            "Conclusion.Compelling_Exhortation",
            "Conclusion.Climax",
        ),
    ),
    AggregateDefinition(
        "Structure_Cohesion",
        "structureCohesion",
        "Structure Cohesion",
        0.17,
        (
            "Proposition.Establishes_Main_Theme",
            "Main_Points.Proportional_and_Coexistent",
            "Main_Points.Clarity",
            "Main_Points.Hortatory_Universal_Truths",
            "Conclusion.Summary",
            "Conclusion.Pointed_End",
        ),
    ),
    AggregateDefinition(
        "Proposition_Clarity",
        "propositionClarity",
        "Proposition Clarity",
        0.10,
        (
            "Proposition.Principle_and_Application_Wed",
            "Proposition.Establishes_Main_Theme",
            "Proposition.Summarizes_Introduction",
        ),
    ),
    AggregateDefinition(
        "Illustrations",
        "illustrations",
        "Illustrations",
        0.08,
        (
            "Main_Points.Illustration_Quality",
            "Illustrations.Lived_Body_Detail",
            "Illustrations.Strengthens_Points",
            "Illustrations.Proportion",
            "Illustrations.Ethical_Use",
        ),
    ),
    AggregateDefinition(
        "Introduction",
        "introduction",
        "Introduction",
        0.08,
        (
            "Introduction.FCF_Introduced",
            "Introduction.Arouses_Attention",
        ),
    ),
    AggregateDefinition(
        "Pastoral_Posture",
        "pastoralPosture",
        "Pastoral Posture and Humble Authority",
        0.15,
        (
            "Pastoral_Posture.Shared_Subjection_and_Self_Application",
            "Pastoral_Posture.Servant_Authority",
            "Pastoral_Posture.Courageous_and_Gentle_Care",
            "Pastoral_Posture.Differentiated_Pastoral_Application",
            "Pastoral_Posture.Pastoral_Use_of_Power",
        ),
    ),
)


CRITERIA_COUNT = sum(len(section.criteria) for section in RUBRIC_SECTIONS)


def section_by_key(key: str) -> SectionDefinition:
    return next(section for section in RUBRIC_SECTIONS if section.key == key)


def render_scoring_rubrics() -> str:
    blocks: list[str] = []
    for index, section in enumerate(RUBRIC_SECTIONS):
        letter = chr(ord("A") + index)
        gate_note = " This is a gate-only section and is not averaged into Overall Impact." if section.gate_only else ""
        lines = [
            f"### {letter}. {section.label}",
            "",
            f"Goal: {section.goal}{gate_note}",
            "",
            "Sub-Criteria:",
        ]
        for criterion_index, criterion in enumerate(section.criteria, start=1):
            lines.append(
                f"{criterion_index}. **{criterion.label}** *({criterion.description})*"
            )
            for score, anchor in criterion.anchors:
                lines.append(f"   - **{score}:** {anchor}")
        if section.key == "Doctrinal_Fidelity":
            lines.extend(
                [
                    "",
                    "Core Doctrine Gate:",
                    "- Set `Core_Doctrine_Gate` to `FAIL` only when the sermon provides specific evidence of an explicit denial or material distortion of a core doctrine implicated by its text or claims.",
                    "- Omission of a doctrine the passage does not implicate is not a failure. Ambiguity, thinness, or generic treatment should lower the score but remain `PASS` unless a contradiction is evidenced.",
                    "- Provide the exact claim and its location in `Gate_Reason` when failing the gate.",
                ]
            )
        lines.append("Feedback: Give concise, evidence-grounded, actionable coaching.")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def render_framework_rubric() -> str:
    return render_scoring_rubrics().replace("Feedback: Give", "**Feedback:** Give")


def render_framework_aggregates() -> str:
    rows = ["| Aggregate | Weight | Members |", "|---|---:|---|"]
    for aggregate in AGGREGATES:
        members = ", ".join(f"`{member}`" for member in aggregate.members)
        rows.append(
            f"| {aggregate.label} | {aggregate.weight * 100:.0f}% | {members} |"
        )
    rows.extend(
        [
            "",
            "`Overall_Impact_Base` is the weighted average of the seven aggregates above.",
            "",
            f"`Doctrinal_Fidelity` is not weighted. If `Core_Doctrine_Gate = FAIL`, `Overall_Impact` is capped at {DOCTRINAL_GATE_CAP:.1f}; strong homiletical form cannot compensate for contradiction of an implicated core doctrine.",
            "",
            "When the optional duration adjustment is enabled, the selected `Overall_Impact` may then be reduced by the configured duration penalty. Duration policy is reported separately and is never supplied to homiletical coaching. When it is disabled, no hypothetical penalty is computed or exposed.",
        ]
    )
    return "\n".join(rows)


__all__ = [
    "AGGREGATES",
    "CRITERIA_COUNT",
    "DOCTRINAL_GATE_CAP",
    "RUBRIC_SECTIONS",
    "RUBRIC_VERSION",
    "AggregateDefinition",
    "CriterionDefinition",
    "SectionDefinition",
    "render_framework_aggregates",
    "render_framework_rubric",
    "render_scoring_rubrics",
    "section_by_key",
]
