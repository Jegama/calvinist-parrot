#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const POSTGRES_USER = "calvinist_parrot";
const POSTGRES_HOST = "localhost";
const POSTGRES_PORT = 54322;
const GENERATED_ENV_MARKER =
  "# Generated for this Codex worktree by scripts/setup-worktree-database.mjs.";

function databaseUrl(databaseName) {
  return `postgresql://${POSTGRES_USER}:${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${databaseName}?schema=public`;
}

export function createWorktreeDatabaseConfig(worktreePath) {
  const resolvedPath = path.resolve(worktreePath);
  const worktreeId = createHash("sha256")
    .update(resolvedPath)
    .digest("hex")
    .slice(0, 12);

  const databaseNames = {
    development: `calvinist_parrot_dev_${worktreeId}`,
    shadow: `calvinist_parrot_shadow_${worktreeId}`,
    test: `calvinist_parrot_test_${worktreeId}`,
  };

  return {
    worktreeId,
    databaseNames,
    urls: {
      DATABASE_URL: databaseUrl(databaseNames.development),
      SHADOW_DATABASE_URL: databaseUrl(databaseNames.shadow),
      TEST_DATABASE_URL: databaseUrl(databaseNames.test),
    },
  };
}

export function renderWorktreeEnv(template, urls) {
  const remainingKeys = new Set(Object.keys(urls));
  const renderedLines = template.split(/\r?\n/).map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    const key = match?.[1];

    if (!key || !remainingKeys.has(key)) {
      return line;
    }

    remainingKeys.delete(key);
    return `${key}=${JSON.stringify(urls[key])}`;
  });

  if (remainingKeys.size > 0) {
    throw new Error(
      `.env.template is missing required database variables: ${[
        ...remainingKeys,
      ].join(", ")}`,
    );
  }

  return `${GENERATED_ENV_MARKER}\n${renderedLines.join("\n")}`;
}

export function assertCredentialOverlayIsSafe(contents, sourceName) {
  const databaseOverride =
    /^\s*(?:export\s+)?(DATABASE_URL|SHADOW_DATABASE_URL|TEST_DATABASE_URL)\s*=/m.exec(
      contents,
    );

  if (databaseOverride) {
    throw new Error(
      `${sourceName} must not define ${databaseOverride[1]}; Codex worktree database URLs are generated automatically.`,
    );
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    input: options.input,
    stdio: options.input
      ? ["pipe", "inherit", "inherit"]
      : ["ignore", "inherit", "inherit"],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with status ${result.status}`,
    );
  }
}

function ensureDatabase(worktreePath, databaseName) {
  const createDatabaseSql = `
SELECT pg_advisory_lock(hashtext(:'db_name'));

SELECT format(
  'CREATE DATABASE %I OWNER ${POSTGRES_USER}',
  :'db_name'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = :'db_name'
)
\\gexec

SELECT pg_advisory_unlock(hashtext(:'db_name'));
`;

  run(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "--no-psqlrc",
      `--username=${POSTGRES_USER}`,
      "--dbname=postgres",
      "--set=ON_ERROR_STOP=1",
      `--set=db_name=${databaseName}`,
    ],
    { cwd: worktreePath, input: createDatabaseSql },
  );

  run(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "--no-psqlrc",
      `--username=${POSTGRES_USER}`,
      `--dbname=${databaseName}`,
      "--set=ON_ERROR_STOP=1",
      "--command=CREATE EXTENSION IF NOT EXISTS vector;",
    ],
    { cwd: worktreePath },
  );
}

async function writeGeneratedEnv(worktreePath, contents) {
  const envPath = path.join(worktreePath, ".env");
  const temporaryPath = path.join(
    worktreePath,
    `.env.worktree-${process.pid}.tmp`,
  );

  try {
    await writeFile(temporaryPath, contents, { mode: 0o600 });
    await rename(temporaryPath, envPath);
    await chmod(envPath, 0o600);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function copyWorktreeCredentials(worktreePath) {
  const sourcePath = path.join(worktreePath, ".env.worktree.local");
  const destinationPath = path.join(worktreePath, ".env.local");

  try {
    const credentials = await readFile(sourcePath, "utf8");
    assertCredentialOverlayIsSafe(credentials, ".env.worktree.local");
    await copyFile(sourcePath, destinationPath);
    await chmod(destinationPath, 0o600);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      try {
        const existingCredentials = await readFile(destinationPath, "utf8");
        assertCredentialOverlayIsSafe(existingCredentials, ".env.local");
      } catch (destinationError) {
        if (destinationError?.code !== "ENOENT") {
          throw destinationError;
        }
      }
      return false;
    }
    throw error;
  }
}

export async function setupWorktreeDatabase(worktreePath) {
  const resolvedPath = path.resolve(worktreePath);
  const templatePath = path.join(resolvedPath, ".env.template");
  const config = createWorktreeDatabaseConfig(resolvedPath);

  for (const databaseName of Object.values(config.databaseNames)) {
    ensureDatabase(resolvedPath, databaseName);
  }

  const template = await readFile(templatePath, "utf8");
  const envContents = renderWorktreeEnv(template, config.urls);
  await writeGeneratedEnv(resolvedPath, envContents);
  const copiedCredentials = await copyWorktreeCredentials(resolvedPath);

  console.log(`Provisioned isolated databases for worktree ${config.worktreeId}:`);
  console.log(`- development: ${config.databaseNames.development}`);
  console.log(`- shadow: ${config.databaseNames.shadow}`);
  console.log(`- test: ${config.databaseNames.test}`);
  console.log(
    copiedCredentials
      ? "Copied .env.worktree.local to .env.local."
      : "No .env.worktree.local was present; continuing without credential overrides.",
  );

  return config;
}

async function main() {
  const worktreePath = process.env.CODEX_WORKTREE_PATH;
  if (!worktreePath) {
    throw new Error(
      "CODEX_WORKTREE_PATH is required. Run this through the Codex worktree local-environment setup.",
    );
  }

  await setupWorktreeDatabase(worktreePath);
}

const executedModuleUrl = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (import.meta.url === executedModuleUrl) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
