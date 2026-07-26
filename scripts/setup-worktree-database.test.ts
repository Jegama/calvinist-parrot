import { describe, expect, it } from "vitest";

import {
  assertCredentialOverlayIsSafe,
  createWorktreeDatabaseConfig,
  renderWorktreeEnv,
} from "./setup-worktree-database.mjs";

describe("worktree database setup", () => {
  it("creates stable, isolated database names for each worktree path", () => {
    const first = createWorktreeDatabaseConfig("/tmp/codex/worktrees/first");
    const firstAgain = createWorktreeDatabaseConfig(
      "/tmp/codex/worktrees/first",
    );
    const second = createWorktreeDatabaseConfig("/tmp/codex/worktrees/second");

    expect(first).toEqual(firstAgain);
    expect(first.worktreeId).toMatch(/^[a-f0-9]{12}$/);
    expect(first.databaseNames.development).not.toBe(
      second.databaseNames.development,
    );
    expect(first.urls.DATABASE_URL).toContain(
      `/${first.databaseNames.development}?schema=public`,
    );
    expect(first.urls.SHADOW_DATABASE_URL).toContain(
      `/${first.databaseNames.shadow}?schema=public`,
    );
    expect(first.urls.TEST_DATABASE_URL).toContain(
      `/${first.databaseNames.test}?schema=public`,
    );
  });

  it("replaces the template database URLs without duplicating variables", () => {
    const config = createWorktreeDatabaseConfig(
      "/tmp/codex/worktrees/example",
    );
    const template = [
      "OPENAI_API_KEY=",
      'DATABASE_URL="postgresql://old/dev"',
      'SHADOW_DATABASE_URL="postgresql://old/shadow"',
      'TEST_DATABASE_URL="postgresql://old/test"',
      "",
    ].join("\n");

    const rendered = renderWorktreeEnv(template, config.urls);

    expect(rendered.match(/^DATABASE_URL=/gm)).toHaveLength(1);
    expect(rendered.match(/^SHADOW_DATABASE_URL=/gm)).toHaveLength(1);
    expect(rendered.match(/^TEST_DATABASE_URL=/gm)).toHaveLength(1);
    expect(rendered).toContain(config.urls.DATABASE_URL);
    expect(rendered).toContain(config.urls.SHADOW_DATABASE_URL);
    expect(rendered).toContain(config.urls.TEST_DATABASE_URL);
    expect(rendered).not.toContain("postgresql://old");
  });

  it("fails when the template no longer contains every database variable", () => {
    const config = createWorktreeDatabaseConfig(
      "/tmp/codex/worktrees/example",
    );

    expect(() =>
      renderWorktreeEnv("DATABASE_URL=postgresql://old/dev\n", config.urls),
    ).toThrow("SHADOW_DATABASE_URL, TEST_DATABASE_URL");
  });

  it("rejects database URLs in the credential-only overlay", () => {
    expect(() =>
      assertCredentialOverlayIsSafe(
        "OPENAI_API_KEY=local\nDATABASE_URL=postgresql://production\n",
        ".env.worktree.local",
      ),
    ).toThrow(
      ".env.worktree.local must not define DATABASE_URL; Codex worktree database URLs are generated automatically.",
    );

    expect(() =>
      assertCredentialOverlayIsSafe(
        "# DATABASE_URL is generated\nOPENAI_API_KEY=local\n",
        ".env.worktree.local",
      ),
    ).not.toThrow();
  });
});
