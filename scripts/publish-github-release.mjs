#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const SECTION_HEADING = /^## (\d+\.\d+\.\d+) — (.+)$/;
const VERSION_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(version) {
  const match = VERSION_PATTERN.exec(version);
  if (!match) {
    throw new Error(
      `package.json version must be major.minor.patch. Received "${version}".`,
    );
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function extractChangelogSection(markdown, version) {
  parseVersion(version);
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = SECTION_HEADING.exec(lines[index]);
    if (heading?.[1] === version) matches.push(index);
  }
  if (matches.length === 0) {
    throw new Error(
      `CHANGELOG.md has no section headed "## ${version} — …". Refusing to publish an empty release.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `CHANGELOG.md has ${matches.length} sections headed "## ${version} — …".`,
    );
  }

  const bodyLines = [];
  for (let index = matches[0] + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) break;
    bodyLines.push(lines[index]);
  }
  const section = bodyLines.join("\n").trim();
  if (!section) {
    throw new Error(
      `CHANGELOG.md section for ${version} is empty. Refusing to publish an empty release.`,
    );
  }
  return section;
}

export function versionTagsFromLsRemote(output) {
  const direct = new Map();
  const peeled = new Map();
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [sha, ref] = line.split("\t");
    if (!sha || !ref) continue;
    const peeledRef = /^refs\/tags\/(v\d+\.\d+\.\d+)\^\{\}$/.exec(ref);
    if (peeledRef) {
      peeled.set(peeledRef[1], sha);
      continue;
    }
    const tagRef = /^refs\/tags\/(v\d+\.\d+\.\d+)$/.exec(ref);
    if (tagRef) direct.set(tagRef[1], sha);
  }

  return [...direct.entries()]
    .map(([name, sha]) => ({ name, commit: peeled.get(name) ?? sha }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function previousReleaseTag(tagNames, version) {
  const current = parseVersion(version);
  let bestName = null;
  let bestParts = null;
  for (const name of tagNames) {
    const match = VERSION_TAG.exec(name);
    if (!match) continue;
    const parts = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (compareVersions(parts, current) >= 0) continue;
    if (!bestParts || compareVersions(parts, bestParts) > 0) {
      bestName = name;
      bestParts = parts;
    }
  }
  if (!bestName) {
    throw new Error(`No earlier vX.Y.Z tag exists before v${version}.`);
  }
  return bestName;
}

export function buildReleaseNotes({
  section,
  repository,
  previousTag,
  tag,
}) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error(
      `GITHUB_REPOSITORY must be owner/repo. Received "${repository}".`,
    );
  }
  if (!section.trim()) {
    throw new Error("Refusing to publish an empty release body.");
  }
  return `${section.trim()}\n\n**Full Changelog**: https://github.com/${repository}/compare/${previousTag}...${tag}\n`;
}

export function planRelease({
  version,
  releaseExists,
  tagCommit,
  headCommit,
  changelog,
  tagNames,
  repository,
}) {
  const tag = `v${version}`;
  if (releaseExists) {
    return { action: "skip", tag, reason: `Release ${tag} already exists.` };
  }
  if (tagCommit && tagCommit !== headCommit) {
    throw new Error(
      `Tag ${tag} points at ${tagCommit}, not the pushed commit ${headCommit}.`,
    );
  }
  if (!headCommit) {
    throw new Error(
      "The pushed commit SHA is required to place the release tag.",
    );
  }

  const section = extractChangelogSection(changelog, version);
  const previousTag = previousReleaseTag(tagNames, version);
  return {
    action: "publish",
    tag,
    title: `Calvinist Parrot ${version}`,
    notes: buildReleaseNotes({ section, repository, previousTag, tag }),
    target: headCommit,
    previousTag,
  };
}

function commandFailureText(error) {
  const stderr = error.stderr?.toString() ?? "";
  const stdout = error.stdout?.toString() ?? "";
  return `${stdout}\n${stderr}`.trim();
}

function releaseExists(repository, tag) {
  try {
    execFileSync("gh", ["release", "view", tag, "--repo", repository], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch (error) {
    const output = commandFailureText(error);
    if (output.includes("release not found") || /\b404\b/.test(output)) {
      return false;
    }
    throw new Error(
      `Could not check for an existing ${tag} release.\n${output}`,
    );
  }
}

function publishRelease(repository, plan) {
  if (!plan.notes.trim()) {
    throw new Error("Refusing to publish an empty release body.");
  }
  const directory = mkdtempSync(path.join(tmpdir(), "github-release-"));
  const notesPath = path.join(directory, "notes.md");
  try {
    writeFileSync(notesPath, plan.notes);
    execFileSync(
      "gh",
      [
        "release",
        "create",
        plan.tag,
        "--repo",
        repository,
        "--target",
        plan.target,
        "--title",
        plan.title,
        "--notes-file",
        notesPath,
        "--latest=true",
      ],
      { stdio: "inherit" },
    );
  } catch (error) {
    const output = commandFailureText(error);
    throw new Error(
      output
        ? `gh release create failed for ${plan.tag}.\n${output}`
        : `gh release create failed for ${plan.tag}.`,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function readHeadCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

function readRemoteTags() {
  return execFileSync("git", ["ls-remote", "--tags", "origin"], {
    encoding: "utf8",
  });
}

export function publishCurrentRelease({
  repository = process.env.GITHUB_REPOSITORY,
  packageJsonPath = "package.json",
  changelogPath = "CHANGELOG.md",
  releaseAlreadyExists,
  headCommit,
  remoteOutput,
} = {}) {
  if (!repository) {
    throw new Error(
      "GITHUB_REPOSITORY is required, in owner/repo form, to publish the release.",
    );
  }

  const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  parseVersion(version);
  const tag = `v${version}`;
  const exists = releaseAlreadyExists ?? releaseExists(repository, tag);
  if (exists) {
    const plan = planRelease({
      version,
      releaseExists: true,
      tagCommit: null,
      headCommit: null,
      changelog: "",
      tagNames: [],
      repository,
    });
    console.log(plan.reason);
    return plan;
  }

  const resolvedHead = headCommit ?? readHeadCommit();
  const remoteTags = versionTagsFromLsRemote(remoteOutput ?? readRemoteTags());
  const tagCommit =
    remoteTags.find((remoteTag) => remoteTag.name === tag)?.commit ?? null;
  const plan = planRelease({
    version,
    releaseExists: false,
    tagCommit,
    headCommit: resolvedHead,
    changelog: readFileSync(changelogPath, "utf8"),
    tagNames: remoteTags.map((remoteTag) => remoteTag.name),
    repository,
  });

  console.log(
    `Publishing ${plan.tag} at ${plan.target} (previous ${plan.previousTag}).`,
  );
  publishRelease(repository, plan);
  return plan;
}

function main() {
  publishCurrentRelease();
}

const executedModuleUrl = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (import.meta.url === executedModuleUrl) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
