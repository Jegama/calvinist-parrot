import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildReleaseNotes,
  extractChangelogSection,
  planRelease,
  previousReleaseTag,
  publishCurrentRelease,
  versionTagsFromLsRemote,
} from "./publish-github-release.mjs";

const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const changelog = readFileSync(path.join(repoRoot, "CHANGELOG.md"), "utf8");

const connectToParrotSection = `- Connect to Parrot from the Labs or More menu for ChatGPT, Codex and Claude setup, chat persistence and permissions. A runnable Node.js example compares evaluated churches across cities using the public API. [#130](https://github.com/Jegama/calvinist-parrot/pull/130)`;

const prayerSection =
  "- Prayer Tracker now checks a household revision to pick up shared changes with fewer database reads. Moving a prayer request keeps the original if the destination is unavailable. [#129](https://github.com/Jegama/calvinist-parrot/pull/129)";

const releaseChangelog = `# Changelog

## 2.7.0 — November 27, 2026

${connectToParrotSection}

## 2.6.1 — November 27, 2026

${prayerSection}

## 2.6.0 — November 26, 2026

- Profile now shows email verification status.
- Google sign-in fills missing profile names when available.

## 2.1.0 — November 25, 2026

- **Chat costs and dashboard history.** Admins can see estimated chat spend.

Previously shipped in [#121](https://github.com/Jegama/calvinist-parrot/pull/121)

- **Form visibility.** Light-mode fields have clearer outlines.

## 2.0.0 — November 24, 2026

### Breaking change for Q&A integrations

- Counsel of Three retired.

### Maintenance

- Ten Dependabot PRs updated dependencies.

## 1.0.0 — July 26, 2026

- Integrators gained a documented API.

## Earlier package versions

| Version | Milestone |
| --- | --- |
| 0.3.1 | Improved chat caching. |
`;

describe("changelog section extraction", () => {
  it("extracts every dated section of the repository changelog", () => {
    const versions = [
      ...changelog.matchAll(/^## (\d+\.\d+\.\d+) — .+$/gm),
    ].map((match) => match[1]);

    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions).size).toBe(versions.length);

    for (const version of versions) {
      const section = extractChangelogSection(changelog, version);
      expect(section.length).toBeGreaterThan(0);
      expect(section.startsWith("## ")).toBe(false);
      expect(section).not.toMatch(/^## /m);
      expect(changelog).toContain(section);
    }
  });

  it("keeps a new release section and the sections around it", () => {
    expect(extractChangelogSection(releaseChangelog, "2.7.0")).toBe(
      connectToParrotSection,
    );
    expect(extractChangelogSection(releaseChangelog, "2.6.1")).toBe(
      prayerSection,
    );
    expect(extractChangelogSection(releaseChangelog, "2.6.0")).toBe(
      [
        "- Profile now shows email verification status.",
        "- Google sign-in fills missing profile names when available.",
      ].join("\n"),
    );
  });

  it("keeps the previously-shipped note as prose", () => {
    const section = extractChangelogSection(releaseChangelog, "2.1.0");

    expect(section.startsWith("- **Chat costs and dashboard history.**")).toBe(
      true,
    );
    expect(section).toContain(
      "Previously shipped in [#121](https://github.com/Jegama/calvinist-parrot/pull/121)",
    );
    expect(section).not.toContain("### Previously shipped");
    expect(section).toContain("- **Form visibility.**");
  });

  it("stops a section before the next version and ignores the history table", () => {
    const section = extractChangelogSection(releaseChangelog, "2.0.0");

    expect(section).toContain("### Breaking change for Q&A integrations");
    expect(section).toContain("Counsel of Three retired");
    expect(section).toContain("### Maintenance");
    expect(section).not.toContain("Integrators gained");
    expect(section).not.toContain("## 1.0.0");
    expect(() => extractChangelogSection(releaseChangelog, "0.3.1")).toThrow(
      /no section/,
    );
  });

  it("accepts Windows newlines", () => {
    const markdown = releaseChangelog.replace(/\n/g, "\r\n");
    expect(extractChangelogSection(markdown, "2.7.0")).toBe(
      connectToParrotSection,
    );
  });

  it("fails when the section is missing, empty, duplicated, or hyphenated", () => {
    expect(() => extractChangelogSection(releaseChangelog, "9.9.9")).toThrow(
      /no section headed "## 9\.9\.9/,
    );
    expect(() =>
      extractChangelogSection(
        "## 9.9.9 — January 1, 2026\n\n## 9.9.8 — January 1, 2026\n\n- Kept.\n",
        "9.9.9",
      ),
    ).toThrow(/empty/);
    expect(() =>
      extractChangelogSection(
        "## 2.7.0 — November 27, 2026\n\n- One.\n\n## 2.7.0 — November 27, 2026\n\n- Two.\n",
        "2.7.0",
      ),
    ).toThrow(/2 sections/);
    expect(() =>
      extractChangelogSection(
        "## 2.7.0 - November 27, 2026\n\n- A hyphen is not the changelog heading.\n",
        "2.7.0",
      ),
    ).toThrow(/no section/);
    expect(() => extractChangelogSection(releaseChangelog, "2.6")).toThrow(
      /major\.minor\.patch/,
    );
  });
});

describe("release notes", () => {
  it("chooses the greatest earlier numeric tag", () => {
    expect(previousReleaseTag(["v2.0.0", "v2.9.0", "v2.10.0"], "2.11.0")).toBe(
      "v2.10.0",
    );
    expect(previousReleaseTag(["v2.10.0", "v2.0.0", "latest"], "2.6.1")).toBe(
      "v2.0.0",
    );
    expect(previousReleaseTag(["v2.6.0", "v2.6.1", "v2.5.0"], "2.6.1")).toBe(
      "v2.6.0",
    );
    expect(() => previousReleaseTag(["v2.6.1"], "2.6.1")).toThrow(
      /No earlier vX\.Y\.Z tag/,
    );
  });

  it("reads lightweight and annotated tags from ls-remote", () => {
    const output = [
      "2de7eaa68550fe92f8b1e5ad08da357a9f717f97\trefs/tags/v2.0.0",
      "24208c758f70337dd2df7d38bda86567597c4555\trefs/tags/v2.0.0^{}",
      "04e3a1d3e5f43804270e6ec5433e2286fa55eca2\trefs/tags/v2.1.0",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trefs/tags/not-a-release",
      "",
    ].join("\n");

    expect(versionTagsFromLsRemote(output)).toEqual([
      {
        name: "v2.0.0",
        commit: "24208c758f70337dd2df7d38bda86567597c4555",
      },
      {
        name: "v2.1.0",
        commit: "04e3a1d3e5f43804270e6ec5433e2286fa55eca2",
      },
    ]);
  });

  it("builds the release body and compare link from the section", () => {
    const section = extractChangelogSection(releaseChangelog, "2.7.0");
    const notes = buildReleaseNotes({
      section,
      repository: "Jegama/calvinist-parrot",
      previousTag: "v2.6.1",
      tag: "v2.7.0",
    });

    expect(notes).toBe(
      `${section}\n\n**Full Changelog**: https://github.com/Jegama/calvinist-parrot/compare/v2.6.1...v2.7.0\n`,
    );
    expect(() =>
      buildReleaseNotes({
        section: "   ",
        repository: "Jegama/calvinist-parrot",
        previousTag: "v2.6.1",
        tag: "v2.7.0",
      }),
    ).toThrow(/empty release body/);
  });

  it("publishes a newly added version and refuses a missing section or moved tag", () => {
    const head = "3a1fd2e22a4cf5e782ba2ed56b7e427a23c8b3c1";
    const plan = planRelease({
      version: "2.7.0",
      releaseExists: false,
      tagCommit: null,
      headCommit: head,
      changelog: releaseChangelog,
      tagNames: ["v2.0.0", "v2.6.1", "v2.10.0"],
      repository: "Jegama/calvinist-parrot",
    });
    expect(plan.action).toBe("publish");
    if (plan.action !== "publish") {
      throw new Error("expected a publish plan");
    }
    expect(plan).toMatchObject({
      tag: "v2.7.0",
      title: "Calvinist Parrot 2.7.0",
      target: head,
      previousTag: "v2.6.1",
    });
    expect(plan.notes).toContain(connectToParrotSection);
    expect(plan.notes).toContain(
      "https://github.com/Jegama/calvinist-parrot/compare/v2.6.1...v2.7.0",
    );

    expect(
      planRelease({
        version: "2.6.1",
        releaseExists: true,
        tagCommit: "elsewhere",
        headCommit: head,
        changelog: "",
        tagNames: [],
        repository: "Jegama/calvinist-parrot",
      }),
    ).toEqual({
      action: "skip",
      tag: "v2.6.1",
      reason: "Release v2.6.1 already exists.",
    });

    expect(() =>
      planRelease({
        version: "9.9.9",
        releaseExists: false,
        tagCommit: null,
        headCommit: head,
        changelog: releaseChangelog,
        tagNames: ["v2.7.0"],
        repository: "Jegama/calvinist-parrot",
      }),
    ).toThrow(/no section headed "## 9\.9\.9/);

    expect(() =>
      planRelease({
        version: "2.7.0",
        releaseExists: false,
        tagCommit: "other-commit",
        headCommit: head,
        changelog: releaseChangelog,
        tagNames: ["v2.6.1"],
        repository: "Jegama/calvinist-parrot",
      }),
    ).toThrow(/points at other-commit/);
  });

  it("follows the package version in fixture files", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "github-release-test-"));
    const packageJsonPath = path.join(directory, "package.json");
    const changelogPath = path.join(directory, "CHANGELOG.md");
    writeFileSync(packageJsonPath, JSON.stringify({ version: "2.7.0" }));
    writeFileSync(
      changelogPath,
      "## 2.6.1 — November 27, 2026\n\n- Older.\n",
    );

    try {
      expect(
        publishCurrentRelease({
          repository: "Jegama/calvinist-parrot",
          packageJsonPath,
          releaseAlreadyExists: true,
        }),
      ).toEqual({
        action: "skip",
        tag: "v2.7.0",
        reason: "Release v2.7.0 already exists.",
      });

      expect(() =>
        publishCurrentRelease({
          repository: "Jegama/calvinist-parrot",
          packageJsonPath,
          changelogPath,
          releaseAlreadyExists: false,
          headCommit: "3a1fd2e22a4cf5e782ba2ed56b7e427a23c8b3c1",
          remoteOutput:
            "3a1fd2e22a4cf5e782ba2ed56b7e427a23c8b3c1\trefs/tags/v2.6.1\n",
        }),
      ).toThrow(/no section headed "## 2\.7\.0/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
