import { describe, expect, it } from "vitest";

import type {
  ChurchEvaluationRaw,
  CoreDoctrineKey,
  CoreDoctrineMap,
} from "@/types/church";

import { postProcessEvaluation } from "./post-process";

const allCoreTrue = {
  trinity: "true",
  gospel: "true",
  justification_by_faith: "true",
  christ_deity_humanity: "true",
  scripture_authority: "true",
  incarnation_virgin_birth: "true",
  atonement_necessary_sufficient: "true",
  resurrection_of_jesus: "true",
  return_and_judgment: "true",
  character_of_god: "true",
} satisfies CoreDoctrineMap;

function evaluationFixture({
  core = allCoreTrue,
  badges = [],
  confessionAdopted = false,
  beliefsUrl = "https://example.church/beliefs",
}: {
  core?: CoreDoctrineMap;
  badges?: string[];
  confessionAdopted?: boolean;
  beliefsUrl?: string | null;
} = {}): ChurchEvaluationRaw {
  return {
    church: {
      name: "Example Church",
      website: "https://example.church",
      addresses: [],
      contacts: { phone: null, email: null },
      service_times: [],
      best_pages_for: {
        beliefs: beliefsUrl,
        confession: null,
        about: null,
        leadership: null,
      },
      denomination: { label: null, confidence: null, signals: [] },
      confession: {
        adopted: confessionAdopted,
        name: confessionAdopted ? "Second London Baptist Confession (1689)" : null,
        source_url: null,
      },
      core_doctrines: core,
      secondary: {
        baptism: null,
        governance: null,
        lords_supper: null,
        gifts: null,
        sanctification: null,
        continuity: null,
        security: null,
        atonement_model: null,
      },
      tertiary: {
        eschatology: null,
        worship_style: null,
        counseling: null,
        creation: null,
        christian_liberty: null,
        discipline: null,
        parachurch: null,
        marriage_roles: null,
      },
      badges,
      notes: [],
    },
  };
}

function withUnknown(
  ...keys: CoreDoctrineKey[]
): CoreDoctrineMap {
  const core: CoreDoctrineMap = { ...allCoreTrue };
  for (const key of keys) {
    core[key] = "unknown";
  }
  return core;
}

describe("postProcessEvaluation", () => {
  it("downgrades the existing Refuge Community 70% result to limited information", () => {
    const core = withUnknown(
      "justification_by_faith",
      "incarnation_virgin_birth",
      "character_of_god",
    );

    const result = postProcessEvaluation(evaluationFixture({
      core,
      badges: [
        "👥 Plurality of Elders",
        "🗒️ Biblical Counseling",
        "🤝 Denomination/Network Affiliated",
      ],
    }));

    expect(result.coverageRatio).toBe(0.7);
    expect(result.status).toBe("limited_information");
    expect(result.badges).toContain("⚠️ Low Essentials Coverage");
    expect(result.badges).toContain("ℹ️ Minimal Doctrinal Detail");
  });

  it("requires every non-negotiable core doctrine even when coverage reaches 80%", () => {
    const result = postProcessEvaluation(evaluationFixture({
      core: withUnknown("justification_by_faith", "character_of_god"),
      badges: ["📜 Reformed"],
    }));

    expect(result.coverageRatio).toBe(0.8);
    expect(result.status).toBe("limited_information");
  });

  it("uses the lower 60% floor for a sound-with-differences result", () => {
    const result = postProcessEvaluation(evaluationFixture({
      core: withUnknown(
        "incarnation_virgin_birth",
        "atonement_necessary_sufficient",
        "return_and_judgment",
        "character_of_god",
      ),
      badges: ["📜 Reformed"],
    }));

    expect(result.coverageRatio).toBe(0.6);
    expect(result.status).toBe("biblically_sound_with_differences");
    expect(result.badges).not.toContain("⚠️ Low Essentials Coverage");
    expect(result.badges).not.toContain("ℹ️ Minimal Doctrinal Detail");
  });

  it("does not treat multiple supporting practices as strong Reformed evidence", () => {
    const result = postProcessEvaluation(evaluationFixture({
      badges: [
        "📖 Expository Preaching",
        "👥 Plurality of Elders",
        "📚 Catechism Use",
      ],
    }));

    expect(result.status).toBe("biblically_sound_with_differences");
  });

  it.each(["📜 Reformed", "📃 Covenant Theology"])(
    "accepts %s as strong Reformed evidence",
    (badge) => {
      const result = postProcessEvaluation(evaluationFixture({ badges: [badge] }));
      expect(result.status).toBe("recommended");
    },
  );

  it("accepts an adopted historic Reformed confession as strong evidence", () => {
    const result = postProcessEvaluation(evaluationFixture({ confessionAdopted: true }));
    expect(result.status).toBe("recommended");
    expect(result.badges).toContain("📜 Reformed");
  });

  it.each(["🔄 Dispensational", "🍷 Paedocommunion"])(
    "uses the shared secondary-difference policy for %s",
    (badge) => {
      const result = postProcessEvaluation(evaluationFixture({
        badges: ["📜 Reformed", badge],
      }));
      expect(result.status).toBe("biblically_sound_with_differences");
    },
  );

  it("does not endorse an explicitly denied core doctrine", () => {
    const core = { ...allCoreTrue, trinity: "false" } satisfies CoreDoctrineMap;
    const result = postProcessEvaluation(evaluationFixture({
      core,
      badges: ["📜 Reformed"],
    }));

    expect(result.status).toBe("not_endorsed");
    expect(result.badges).toContain("⚠️ Non-Trinitarian");
  });
});
