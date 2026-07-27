import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("API reference route", () => {
  it("pins Redoc with verified SRI and anonymous CORS", async () => {
    const response = GET();
    const html = await response.text();

    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(html).toContain(
      'src="https://cdn.jsdelivr.net/npm/redoc@2.5.2/bundles/redoc.standalone.js"',
    );
    expect(html).toContain(
      'integrity="sha384-70P5pmIdaQdVbxvjhrcTDv1uKcKqalZ3OHi7S2J+uzDl0PW8dO6L+pHOpm9EEjGJ"',
    );
    expect(html).toContain('crossorigin="anonymous"');
    expect(html).toContain('spec-url="/api/v1/openapi.json"');
  });
});
