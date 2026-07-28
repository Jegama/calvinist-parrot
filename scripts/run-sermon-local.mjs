import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const environment = {
  ...process.env,
  SERMON_RUNTIME: "local",
};
const children = [
  spawn(path.join(repositoryRoot, "node_modules", ".bin", "next"), ["dev"], {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
  }),
  spawn(
    process.execPath,
    [path.join(scriptDirectory, "run-sermon-worker-local.mjs")],
    {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
    },
  ),
];

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal));
}
for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!stopping) {
      stop();
      process.exitCode = signal ? 1 : (code ?? 1);
    }
  });
}
