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

const sermonRuntime =
  process.env.SERMON_RUNTIME?.trim().toLowerCase() || "local";
if (sermonRuntime !== "local" && sermonRuntime !== "appwrite") {
  throw new Error("SERMON_RUNTIME must be either local or appwrite");
}
const environment = {
  ...process.env,
  SERMON_RUNTIME: sermonRuntime,
};
const processDefinitions = [
  {
    name: "Next.js",
    command: path.join(repositoryRoot, "node_modules", ".bin", "next"),
    args: ["dev"],
  },
];
if (sermonRuntime === "local") {
  processDefinitions.push({
    name: "sermon worker",
    command: process.execPath,
    args: [path.join(scriptDirectory, "run-sermon-worker-local.mjs")],
  });
}
const children = processDefinitions.map((definition) => ({
  definition,
  child: spawn(definition.command, definition.args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
  }),
}));

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const { child } of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stop(signal);
    process.exitCode = signal === "SIGINT" ? 130 : 143;
  });
}
for (const { child, definition } of children) {
  child.on("error", (error) => {
    console.error(`[local-dev] Could not start ${definition.name}`, error);
    process.exitCode = 1;
    stop();
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(
        `[local-dev] ${definition.name} exited unexpectedly (${signal || code || 0})`,
      );
      stop();
      process.exitCode = signal || code === 0 ? 1 : (code ?? 1);
    }
  });
}
