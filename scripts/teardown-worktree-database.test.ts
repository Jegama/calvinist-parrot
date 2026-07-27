import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertCurrentWorktreePath,
  inspectWorktreeDatabaseTarget,
  parseTeardownArgs,
  renderDropDatabaseSql,
  teardownWorktreeDatabases,
} from "./teardown-worktree-database.mjs";
import {
  createWorktreeDatabaseConfig,
  GENERATED_ENV_MARKER,
} from "./setup-worktree-database.mjs";

const temporaryDirectories: string[] = [];

async function createWorktreeFixture() {
  const worktreePath = await mkdtemp(
    path.join(os.tmpdir(), "calvinist-parrot-worktree-"),
  );
  temporaryDirectories.push(worktreePath);

  await writeFile(path.join(worktreePath, ".git"), "gitdir: /tmp/example\n");
  const config = createWorktreeDatabaseConfig(worktreePath);
  const envContents = [
    GENERATED_ENV_MARKER,
    `DATABASE_URL="postgresql://local/${config.databaseNames.development}?schema=public"`,
    `SHADOW_DATABASE_URL="postgresql://local/${config.databaseNames.shadow}?schema=public"`,
    `TEST_DATABASE_URL="postgresql://local/${config.databaseNames.test}?schema=public"`,
    "",
  ].join("\n");
  await writeFile(path.join(worktreePath, ".env"), envContents);

  return { worktreePath, config };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("worktree database teardown", () => {
  it("requires either a dry-run or an exact confirmation", () => {
    expect(parseTeardownArgs(["--dry-run"])).toEqual({
      dryRun: true,
      confirmation: null,
    });
    expect(parseTeardownArgs(["--confirm", "abc123"])).toEqual({
      dryRun: false,
      confirmation: "abc123",
    });
    expect(() => parseTeardownArgs([])).toThrow("Usage:");
    expect(() => parseTeardownArgs(["--confirm"])).toThrow("Usage:");
  });

  it("validates the linked worktree and generated database URLs", async () => {
    const { worktreePath, config } = await createWorktreeFixture();

    await expect(inspectWorktreeDatabaseTarget(worktreePath))
      .resolves.toEqual(config);
  });

  it("rejects a primary checkout even if it has a generated environment", async () => {
    const { worktreePath } = await createWorktreeFixture();
    await rm(path.join(worktreePath, ".git"));
    await mkdir(path.join(worktreePath, ".git"));

    await expect(inspectWorktreeDatabaseTarget(worktreePath))
      .rejects.toThrow("not a linked Git worktree");
  });

  it("rejects a mismatched current directory", () => {
    expect(() =>
      assertCurrentWorktreePath(
        "/tmp/codex/worktrees/intended",
        "/tmp/codex/worktrees/other",
      )
    ).toThrow("does not match the current directory");
  });

  it("uses quoted psql identifiers through a derived variable", () => {
    const sql = renderDropDatabaseSql();

    expect(sql).toContain("pg_terminate_backend");
    expect(sql).toContain("format('DROP DATABASE %I', :'db_name')");
    expect(sql).toContain("\\gexec");
  });

  it("requires the derived ID and targets only the three isolated databases", async () => {
    const { worktreePath, config } = await createWorktreeFixture();
    const runCommand = vi.fn();

    await expect(
      teardownWorktreeDatabases(worktreePath, "wrong-id", {
        currentDirectory: worktreePath,
        runCommand,
      }),
    ).rejects.toThrow(`--confirm ${config.worktreeId}`);
    expect(runCommand).not.toHaveBeenCalled();

    await teardownWorktreeDatabases(worktreePath, config.worktreeId, {
      currentDirectory: worktreePath,
      runCommand,
    });

    expect(runCommand).toHaveBeenCalledTimes(4);
    expect(runCommand).toHaveBeenNthCalledWith(
      1,
      "docker",
      ["start", "calvinist-parrot-postgres"],
      { cwd: worktreePath },
    );

    const databaseTargets = runCommand.mock.calls.slice(1).map(
      ([, args]) => args.find((arg: string) => arg.startsWith("--set=db_name=")),
    );
    expect(databaseTargets).toEqual(
      Object.values(config.databaseNames).map(
        (databaseName) => `--set=db_name=${databaseName}`,
      ),
    );
  });
});
