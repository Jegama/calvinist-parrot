import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
dotenv.config({ path: path.join(repositoryRoot, ".env"), quiet: true });
dotenv.config({
  path: path.join(repositoryRoot, ".env.local"),
  override: true,
  quiet: true,
});

function localDatabaseUrl() {
  const applicationUrl = process.env.DATABASE_URL?.trim();
  if (!applicationUrl) {
    throw new Error(
      "DATABASE_URL is required; copy .env.template to .env before starting the local sermon worker.",
    );
  }
  const parsed = new URL(applicationUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      "The local sermon worker only accepts DATABASE_URL on localhost.",
    );
  }
  parsed.searchParams.delete("schema");
  if (!parsed.searchParams.has("sslmode")) {
    parsed.searchParams.set("sslmode", "disable");
  }
  return parsed.toString();
}

const environment = {
  ...process.env,
  SERMON_RUNTIME: "local",
  SERMON_EVALUATOR_PROVIDER:
    process.env.SERMON_EVALUATOR_PROVIDER?.trim() || "fixture",
  SERMON_DATABASE_URL: localDatabaseUrl(),
  SERMON_LOCAL_AUDIO_DIR:
    process.env.SERMON_LOCAL_AUDIO_DIR?.trim() ||
    path.join(repositoryRoot, ".data", "sermon-audio"),
  SERMON_REPO_ROOT: repositoryRoot,
};

const child = spawn(
  "zsh",
  [
    "-ic",
    'workon cp_evals && cd "$SERMON_REPO_ROOT" && exec python -m sermon_evaluator.worker "$@"',
    "sermon-worker",
    ...process.argv.slice(2),
  ],
  {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
