// utils/buildParrotSystemPrompt.ts
// Centralized builder for the Parrot system prompt with denomination mapping and pastoral context injection

import * as prompts from "@/lib/prompts/core";

export interface PastoralUserProfile {
  denomination: string | null;
  preferredDepth: string | null; // expected: "concise" | "moderate" | "detailed"
  followUpTendency: string | null; // expected: "deep_diver" | "quick_mover" | "balanced"
  spiritualStatus: string | null; // expected: seeker | new_believer | growing_believer | mature_believer | unclear
  gospelPresentationCount: number | null;
  coreDoctrineQuestions: number | null;
  secondaryDoctrineQuestions: number | null;
  tertiaryDoctrineQuestions: number | null;
  ministryContext: string[] | null;
  churchInvolvement: string | null; // expected: active_member | seeking_church | unclear
}

function mapDenominationPrompt(value: string) {
  switch (value) {
    case "reformed-baptist":
      return prompts.secondary_reformed_baptist;
    case "presbyterian":
      return prompts.secondary_presbyterian;
    case "wesleyan":
      return prompts.secondary_wesleyan;
    case "lutheran":
      return prompts.secondary_lutheran;
    case "anglican":
      return prompts.secondary_anglican;
    case "pentecostal":
      return prompts.secondary_pentecostal;
    case "non-denom":
      return prompts.secondary_non_denom;
    default:
      return prompts.secondary_reformed_baptist;
  }
}

function mapFollowUpTendency(val?: string): string | null {
  if (!val) return null;
  const map: Record<string, string> = {
    deep_diver: "Frequently asks follow-ups",
    quick_mover: "Prefers standalone answers",
    balanced: "Moderate follow-up engagement",
  };
  return map[val] ?? "Moderate follow-up engagement";
}

function buildPastoralContext(userProfile: PastoralUserProfile | null, effectiveUserId?: string): string {
  if (!userProfile) {
    return "# Pastoral Context\n(No user profile data available yet. User preferences will be learned over time.)";
  }

  const lines: string[] = ["# Pastoral Context"];
  lines.push(
    "Use this structured data to inform your pastoral approach silently (NEVER mention these details explicitly to the user):"
  );
  lines.push("");

  // Denomination (user-controlled preference)
  if (userProfile.denomination) {
    lines.push(
      `- **User's Theological Tradition**: ${userProfile.denomination} (apply appropriate secondary doctrine framework)`
    );
  }

  // Spiritual Status (PRIVATE - for agent's internal use only)
  if (userProfile.spiritualStatus) {
    const statusMap: Record<string, string> = {
      seeker: "Exploring faith (emphasize Gospel clarity, avoid jargon)",
      new_believer: "Recently saved (gentle discipleship, foundational truths)",
      growing_believer: "Established in faith (balanced teaching, application focus)",
      mature_believer: "Spiritually mature (deeper doctrine, ministry application)",
    };
    lines.push(
      `- **Spiritual Maturity** (PRIVATE): ${statusMap[userProfile.spiritualStatus] || userProfile.spiritualStatus}`
    );
  }

  // Gospel Engagement
  if (userProfile.gospelPresentationCount !== null && (userProfile.gospelPresentationCount ?? 0) > 0) {
    lines.push(
      `- **Gospel Presentations Received**: ${userProfile.gospelPresentationCount} time(s) — avoid redundant Gospel explanations unless specifically asked`
    );
  }

  // Ministry Context
  if (userProfile.ministryContext && userProfile.ministryContext.length > 0) {
    lines.push(
      `- **Ministry Roles**: ${userProfile.ministryContext.join(
        ", "
      )} — tailor examples and applications to these contexts`
    );
  }

  // Church Involvement
  if (userProfile.churchInvolvement) {
    lines.push(`- **Church Involvement**: ${userProfile.churchInvolvement}`);
  }

  // Learning Preferences
  if (userProfile.preferredDepth) {
    const depthMap: Record<string, string> = {
      concise: "Prefers brief, focused answers (60-100 words)",
      moderate: "Comfortable with moderate detail (3-5 paragraphs)",
      detailed: "Appreciates thorough explanations and outlines",
    };
    lines.push(`- **Preferred Answer Depth**: ${depthMap[userProfile.preferredDepth] || userProfile.preferredDepth}`);
  } else if (effectiveUserId) {
    // keep debug parity with original implementation
    console.debug("PastoralContext: preferredDepth missing for user", effectiveUserId);
  }

  const followUp = mapFollowUpTendency(userProfile.followUpTendency || undefined);
  if (followUp) {
    lines.push(`- **Follow-Up Style**: ${followUp}`);
  } else if (effectiveUserId) {
    console.debug("PastoralContext: followUpTendency missing for user", effectiveUserId);
  }

  // Doctrinal Question History
  const coreQ = userProfile.coreDoctrineQuestions || 0;
  const secondaryQ = userProfile.secondaryDoctrineQuestions || 0;
  const tertiaryQ = userProfile.tertiaryDoctrineQuestions || 0;
  if (coreQ + secondaryQ + tertiaryQ > 0) {
    lines.push(
      `- **Doctrinal Question History**: ${coreQ} core, ${secondaryQ} secondary, ${tertiaryQ} tertiary — ${
        coreQ > 3 ? "needs clarity on essentials" : "solid foundation in essentials"
      }; ${secondaryQ > 5 ? "exploring denominational distinctives" : ""}; ${
        tertiaryQ > 5 ? "interested in disputable matters" : ""
      }`
    );
  }

  lines.push("");
  lines.push(
    '**Remember**: Use this context to shape your tone, depth, examples, and doctrinal emphasis. Do NOT explicitly reference this data in your response (e.g., never say "I see you\'re a new believer" or "Based on your spiritual status").'
  );

  return lines.join("\n");
}

export function buildParrotSystemPrompt(params: {
  userProfile: PastoralUserProfile | null;
  denominationFallback?: string;
  effectiveUserId?: string;
}): string {
  const { userProfile, denominationFallback, effectiveUserId } = params;

  const pastoralContext = buildPastoralContext(userProfile, effectiveUserId);

  const effectiveDenomination = userProfile?.denomination || denominationFallback || "reformed-baptist";
  const secondaryPromptText = mapDenominationPrompt(effectiveDenomination);
  const coreSysPromptWithDenomination = prompts.CORE_SYS_PROMPT.replace("{denomination}", secondaryPromptText);
  let newParrotSysPrompt = prompts.PARROT_SYS_PROMPT_MAIN.replace("{CORE}", coreSysPromptWithDenomination);
  newParrotSysPrompt = newParrotSysPrompt.replace("{PASTORAL_CONTEXT}", pastoralContext);

  // Inject effective user id literal for tools that require it (do not expose to user)
  const effectiveUserIdLiteral = effectiveUserId || "unknown_user";
  newParrotSysPrompt = newParrotSysPrompt.replace(/\{EFFECTIVE_USER_ID\}/g, effectiveUserIdLiteral);

  return newParrotSysPrompt;
}
