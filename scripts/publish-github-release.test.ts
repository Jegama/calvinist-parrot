import { readFileSync } from "node:fs";
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

const pr130Changelog = `# Changelog

## 2.7.0 — November 27, 2026

${connectToParrotSection}

## 2.6.1 — November 27, 2026

- Prayer Tracker now checks a household revision to pick up shared changes with fewer database reads. Moving a prayer request keeps the original if the destination is unavailable. [#129](https://github.com/Jegama/calvinist-parrot/pull/129)
`;

describe("changelog section extraction", () => {
  it("extracts every dated section from the master changelog", () => {
    const versions = [
      ...changelog.matchAll(/^## (\d+\.\d+\.\d+) — .+$/gm),
    ].map((match) => match[1]);

    expect(versions).toEqual([
      "2.6.1",
      "2.6.0",
      "2.5.0",
      "2.4.0",
      "2.3.0",
      "2.2.0",
      "2.1.0",
      "2.0.0",
      "1.0.0",
      "0.9.0",
      "0.8.0",
      "0.7.0",
      "0.6.1",
      "0.6.0",
      "0.5.2",
      "0.5.1",
    ]);

    for (const version of versions) {
      const section = extractChangelogSection(changelog, version);
      expect(section.startsWith("## ")).toBe(false);
      expect(section).not.toMatch(/^## /m);
      expect(changelog).toContain(section);
    }
  });

  it("keeps the 2.6.1 and 2.6.0 sections as their changelog bullets", () => {
    const lines = changelog.split("\n");
    expect(extractChangelogSection(changelog, "2.6.1")).toBe(
      lines.find((line) => line.startsWith("- Prayer Tracker now checks")),
    );
    expect(extractChangelogSection(changelog, "2.6.0")).toBe(
      [
        lines.find((line) => line.startsWith("- Profile now shows")),
        lines.find((line) => line.startsWith("- Google sign-in")),
      ].join("\n"),
    );
  });

  it("keeps the 2.1.0 previously-shipped note as prose", () => {
    const section = extractChangelogSection(changelog, "2.1.0");

    expect(section.startsWith("- **Chat costs and dashboard history.**")).toBe(
      true,
    );
    expect(section).toContain(
      "Previously shipped in [#121](https://github.com/Jegama/calvinist-parrot/pull/121)",
    );
    expect(section).not.toContain("### Previously shipped");
    expect(section).toContain("- **Form visibility.**");
  });

  it("stops the 2.0.0 section before the next version", () => {
    const section = extractChangelogSection(changelog, "2.0.0");

    expect(section).toContain("### Breaking change for Q&A integrations");
    expect(section).toContain("Counsel of Three retired");
    expect(section).toContain("### Maintenance");
    expect(section).not.toContain("Integrators gained");
    expect(section).not.toContain("## 1.0.0");
  });

  it("extracts the 2.7.0 section format from the open connect-to-parrot branch", () => {
    expect(extractChangelogSection(pr130Changelog, "2.7.0")).toBe(
      connectToParrotSection,
    );
    expect(extractChangelogSection(pr130Changelog, "2.6.1")).toContain(
      "[#129](https://github.com/Jegama/calvinist-parrot/pull/129)",
    );
  });

  it("accepts Windows newlines", () => {
    const markdown = pr130Changelog.replace(/\n/g, "\r\n");
    expect(extractChangelogSection(markdown, "2.7.0")).toBe(
      connectToParrotSection,
    );
  });

  it("fails when the section is missing, empty, duplicated, or hyphenated", () => {
    expect(() => extractChangelogSection(changelog, "2.7.0")).toThrow(
      /no section headed "## 2\.7\.0/,
    );
    expect(() => extractChangelogSection(changelog, "0.3.1")).toThrow(
      /no section/,
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
    expect(() => extractChangelogSection(changelog, "2.6")).toThrow(
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

  it("builds the published release body and compare link", () => {
    const section = extractChangelogSection(changelog, "2.6.1");
    const notes = buildReleaseNotes({
      section,
      repository: "Jegama/calvinist-parrot",
      previousTag: "v2.6.0",
      tag: "v2.6.1",
    });

    expect(notes).toBe(
      `${section}\n\n**Full Changelog**: https://github.com/Jegama/calvinist-parrot/compare/v2.6.0...v2.6.1\n`,
    );
    expect(() =>
      buildReleaseNotes({
        section: "   ",
        repository: "Jegama/calvinist-parrot",
        previousTag: "v2.6.0",
        tag: "v2.6.1",
      }),
    ).toThrow(/empty release body/);
  });

  it("skips an existing release and refuses a moved tag or missing notes", () => {
    expect(
      planRelease({
        version: "2.6.1",
        releaseExists: true,
        tagCommit: "elsewhere",
        headCommit: "3a1fd2e22a4cf5e782ba2ed56b7e427a23c8b3c1",
        changelog: "",
        tagNames: [],
        repository: "Jegama/calvinist-parrot",
      }),
    ).toEqual({
      action: "skip",
      tag: "v2.6.1",
      reason: "Release v2.6.1 already exists.",
    });

    const head = "3a1fd2e22a4cf5e782ba2ed56b7e427a23c8b3c1";
    const plan = planRelease({
      version: "2.6.1",
      releaseExists: false,
      tagCommit: null,
      headCommit: head,
      changelog,
      tagNames: ["v2.0.0", "v2.6.0", "v2.10.0"],
      repository: "Jegama/calvinist-parrot",
    });
    expect(plan.action).toBe("publish");
    expect(plan).toMatchObject({
      tag: "v2.6.1",
      title: "Calvinist Parrot 2.6.1",
      target: head,
      previousTag: "v2.6.0",
    });
    expect(plan.notes).toContain(
      "https://github.com/Jegama/calvinist-parrot/compare/v2.6.0...v2.6.1",
    );
    expect(plan.notes.startsWith("- Prayer Tracker now checks")).toBe(true);

    expect(() =>
      planRelease({
        version: "2.7.0",
        releaseExists: false,
        tagCommit: null,
        headCommit: head,
        changelog,
        tagNames: ["v2.6.1"],
        repository: "Jegama/calvinist-parrot",
      }),
    ).toThrow(/no section headed "## 2\.7\.0/);

    expect(() =>
      planRelease({
        version: "2.6.1",
        releaseExists: false,
        tagCommit: "other-commit",
        headCommit: head,
        changelog,
        tagNames: ["v2.6.0"],
        repository: "Jegama/calvinist-parrot",
      }),
    ).toThrow(/points at other-commit/);
  });

  it("leaves an existing package version unpublished and refuses a missing section", () => {
    expect(
      publishCurrentRelease({
        repository: "Jegama/calvinist-parrot",
        packageJsonPath: path.join(repoRoot, "package.json"),
        releaseAlreadyExists: true,
      }),
    ).toEqual({
      action: "skip",
      tag: "v2.6.1",
      reason: "Release v2.6.1 already exists.",
    });

    expect(() =>
      publishCurrentRelease({
        repository: "Jegama/calvinist-parrot",
        packageJsonPath: path.join(repoRoot, "package.json"),
        changelogPath: path.join(repoRoot, "package.json"),
        releaseAlreadyExists: false,
        headCommit: "3a1fd2e22a4cf5e782ba2ed56b7e427a23c8b3c1",
        remoteOutput:
          "69ea5f4fa67e3863cec189001eaddc63ee50c6f8\trefs/tags/v2.6.0\n",
      }),
    ).toThrow(/no section headed "## 2\.6\.1/);
  });
});
