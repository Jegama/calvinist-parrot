import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { serializeSpec } from "../lib/api/spec";

export const DEFAULT_OPENAPI_PATH = resolve(
  process.cwd(),
  "docs/api/openapi.json",
);

export function writeOpenApiSpec(targetPath = DEFAULT_OPENAPI_PATH) {
  writeFileSync(targetPath, serializeSpec(), "utf8");
  return targetPath;
}

export function isDirectExecution(
  moduleUrl = import.meta.url,
  entrypoint = process.argv[1],
) {
  return Boolean(
    entrypoint &&
      resolve(entrypoint) === resolve(fileURLToPath(moduleUrl)),
  );
}

if (isDirectExecution()) {
  const targetPath = writeOpenApiSpec();
  console.log(`Wrote ${targetPath}`);
}
