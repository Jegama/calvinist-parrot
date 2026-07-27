import { describe, expect, it } from "vitest";

import { serializeSpec } from "../../../../lib/api/spec";

import { GET } from "./route";

describe("served OpenAPI route", () => {
  it("serves the canonical serialization as JSON", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(await response.text()).toBe(serializeSpec());
  });
});
