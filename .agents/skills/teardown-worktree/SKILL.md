---
name: teardown-worktree
description: Safely tear down a completed Calvinist Parrot Codex worktree and its isolated local PostgreSQL development, shadow, and test databases. Use when the user asks to clean up, remove, prune, or tear down a worktree/task/job, including deleting the local tables or databases created for that worktree.
---

# Teardown Worktree

Remove only the exact completed worktree and its three path-derived local databases. Preserve shared infrastructure, production data, and branches unless the user separately authorizes their deletion.

## Guardrails

- Treat database and worktree removal as destructive and irreversible for uncommitted files and local database contents.
- Read the repository `AGENTS.md` completely before acting.
- Resolve and display the exact absolute worktree path, branch or detached commit, and derived database names before requesting approval.
- Allow read-only inspection and the database dry-run in a dirty worktree, but do not run confirmed database deletion or worktree removal until the worktree is clean and has no unpushed commits. If either condition fails, stop after the preview and ask the user how to preserve the work.
- Never target the primary checkout, a path that is not listed by `git worktree list --porcelain`, or a worktree other than the one the user selected.
- Never read or use `PRODUCTION_DATABASE_URL`, Neon credentials, `CCEL_URL`, or database URLs from `.env.local`.
- Never run `docker compose up`, `docker compose down`, `docker compose down -v`, `rm -rf`, or a forceful worktree removal. The teardown command may start the existing fixed-name shared Postgres container, but it must never recreate that container.
- Do not delete local or remote branches unless the user explicitly asks for branch deletion as a separate action.

## Workflow

1. Resolve the target with read-only commands:

   ```bash
   git worktree list --porcelain
   git -C "<absolute-worktree-path>" status --short
   git -C "<absolute-worktree-path>" branch --show-current
   git -C "<absolute-worktree-path>" rev-parse HEAD
   ```

   If the branch has an upstream, verify that no commits are ahead:

   ```bash
   git -C "<absolute-worktree-path>" rev-list --left-right --count "@{upstream}...HEAD"
   ```

2. Preview the database cleanup from the target worktree:

   ```bash
   CODEX_WORKTREE_PATH="<absolute-worktree-path>" npm run db:worktree:teardown -- --dry-run
   ```

   Run with the target worktree as the command working directory. The command must report the same exact path-derived development, shadow, and test database suffix.

3. Show the user:

   - absolute worktree path;
   - branch or detached commit;
   - three database names;
   - that all tables and local data inside those databases will be permanently removed;
   - that the Git branch and remote branch will remain.

   Ask for explicit approval after showing these resolved targets.

4. After approval, run the confirmation command from the target worktree using the exact ID printed by the dry-run:

   ```bash
   CODEX_WORKTREE_PATH="<absolute-worktree-path>" npm run db:worktree:teardown -- --confirm <worktree-id>
   ```

   Confirm that all three database removals succeed before proceeding. If database cleanup fails, leave the worktree intact and report the error.

5. Switch subsequent commands to the primary checkout or another surviving checkout. Remove and prune the exact worktree:

   ```bash
   git -C "<primary-checkout-path>" worktree remove "<absolute-worktree-path>"
   git -C "<primary-checkout-path>" worktree prune
   ```

   If normal removal refuses because of local changes, do not add `--force`; stop and ask the user.

6. Verify the target path is absent from `git worktree list --porcelain`. Report the removed databases and worktree, state that local data is not recoverable, and identify the preserved branch and remote branch.
