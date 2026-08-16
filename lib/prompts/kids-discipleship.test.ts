import { describe, expect, it } from "vitest";
import {
  ENDORSED_PARENTING_RESOURCES,
  KIDS_CALL2_SYSTEM_PROMPT,
  buildKidsCall1SystemPrompt,
  buildKidsCall1UserMessage,
  type KidsPromptContext,
} from "@/lib/prompts/kids-discipleship";
import { KIDS_CALL1_SCHEMA } from "@/lib/schemas/kids-discipleship";

const TODDLER_DISCIPLINE_CONTEXT: KidsPromptContext = {
  childName: "A child",
  childAge: "1 year, 1 month",
  ageBracket: "INFANT_TODDLER",
  characterGoal: "Self-control",
  competencyGoal: "Respectful communication",
  category: "ADMONITION",
  entryText:
    "A toddler has had screaming tantrums. The parent described calm correction, comfort after the child settled, and advice already received from the pastor's wife.",
  gospelConnection: "God forgives us when we sin.",
};

describe("kids discipleship counseling prompt", () => {
  it("requires biblical counseling rather than psychological techniques", () => {
    const prompt = buildKidsCall1SystemPrompt(TODDLER_DISCIPLINE_CONTEXT);

    expect(prompt).toContain(
      "Treat Scripture as the sufficient and final authority for counseling and parenting"
    );
    expect(prompt).toContain(
      "Never introduce secular or integrationist psychological theories"
    );
    expect(prompt).toContain("Prohibited examples include co-regulation");
    expect(prompt).toContain(
      "Describe emotions, suffering, habits, desires, sin, obedience, authority, self-control"
    );
    expect(prompt).not.toContain("appropriate professionals");
    expect(prompt).not.toContain("lawful");
  });

  it("preserves existing church counsel instead of repeating a boilerplate referral", () => {
    const prompt = buildKidsCall1SystemPrompt(TODDLER_DISCIPLINE_CONTEXT);
    const userMessage = buildKidsCall1UserMessage(TODDLER_DISCIPLINE_CONTEXT);

    expect(prompt).toContain("Referrals must be contextual, never boilerplate");
    expect(prompt).toContain(
      "accurately acknowledge that fact and do not tell you to seek the same counsel again"
    );
    expect(prompt).toContain("Never change who gave advice");
    expect(userMessage).toContain("advice already received from the pastor's wife");
  });

  it("limits recommended reading to the three endorsed parenting books", () => {
    const prompt = buildKidsCall1SystemPrompt(TODDLER_DISCIPLINE_CONTEXT);
    const resourceSchema = KIDS_CALL1_SCHEMA.schema.properties.recommendedResources;

    for (const resource of ENDORSED_PARENTING_RESOURCES) {
      expect(prompt).toContain(`\"${resource.title}\" by ${resource.author}`);
      expect(resourceSchema.items.properties.title.enum).toContain(resource.title);
      expect(resourceSchema.items.properties.author.enum).toContain(resource.author);
    }

    expect(resourceSchema.minItems).toBe(1);
    expect(resourceSchema.maxItems).toBe(2);
    expect(KIDS_CALL1_SCHEMA.schema.required).toContain("recommendedResources");
  });

  it("uses biblical categories instead of emotional-regulation tagging", () => {
    expect(KIDS_CALL2_SYSTEM_PROMPT).not.toContain("Emotional regulation");
    expect(KIDS_CALL2_SYSTEM_PROMPT).toContain("Self-control");
    expect(KIDS_CALL2_SYSTEM_PROMPT).toContain("Anger");
  });

  it("applies the counseling boundary semantically across languages", () => {
    const spanishContext: KidsPromptContext = {
      ...TODDLER_DISCIPLINE_CONTEXT,
      entryText:
        "El niño gritó cuando recibió una instrucción. Su madre respondió con calma y después le recordó el perdón de Dios.",
      gospelConnection: "Dios nos perdona cuando pecamos.",
    };
    const prompt = buildKidsCall1SystemPrompt(spanishContext);
    const userMessage = buildKidsCall1UserMessage(spanishContext);

    expect(prompt).toContain(
      "Apply these counseling boundaries semantically in every input and output language"
    );
    expect(prompt).toContain("Do not depend on matching English words");
    expect(userMessage).toContain("El niño gritó cuando recibió una instrucción");
  });
});
