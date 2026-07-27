import { pathToFileURL } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { writeFileSync } = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({ writeFileSync }));

import {
  isDirectExecution,
  writeOpenApiSpec,
} from "./generate-openapi";
import { serializeSpec } from "../lib/api/spec";

describe("OpenAPI generator", () => {
  beforeEach(() => {
    writeFileSync.mockClear();
  });

  it("does not write merely because the module was imported", () => {
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("writes the same serialization used by the served spec", () => {
    const target = "/tmp/calvinist-parrot-openapi-test.json";

    expect(writeOpenApiSpec(target)).toBe(target);
    expect(writeFileSync).toHaveBeenCalledOnce();
    expect(writeFileSync).toHaveBeenCalledWith(
      target,
      serializeSpec(),
      "utf8",
    );
  });

  it("only identifies the exact CLI entrypoint as direct execution", () => {
    const scriptPath = "/workspace/scripts/generate-openapi.ts";
    const scriptUrl = pathToFileURL(scriptPath).href;

    expect(isDirectExecution(scriptUrl, scriptPath)).toBe(true);
    expect(
      isDirectExecution(scriptUrl, "/workspace/scripts/another-script.ts"),
    ).toBe(false);
    expect(isDirectExecution(scriptUrl, undefined)).toBe(false);
  });
});
