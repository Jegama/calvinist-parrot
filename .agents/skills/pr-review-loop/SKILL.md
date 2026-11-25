---
name: pr-review-loop
description: Run a GitHub pull request through review and CI. Use when asked to address PR feedback, push fixes, and monitor Copilot re-reviews through a clean pass or the ten-round limit.
---

# PR Review Loop

## Start with the PR

Use the repository and number from the supplied GitHub PR URL or `OWNER/REPO#NUMBER`. For a bare number, resolve it in the current checkout’s GitHub repository. If no PR was specified, use the current branch’s open PR when unambiguous. Ask for the PR URL if the target is still unclear. Use the PR’s base repository (`repo`) and number (`pr`) for GitHub checks, comments, and review requests. For a fork PR, push fixes to its head repository and branch.

Read the PR description, linked issue, and any repository or path-specific instructions in the target checkout. Record the intended behavior, base, starting head SHA, and head repository and branch. Work on that head in a clean checkout, preserving other contributors’ commits and local edits. A request to run the loop covers fixes, tests, pushes to the PR branch, review replies, and Copilot review requests. Leave the merge decision to the user.

Keep a short record in the Codex chat throughout the run. Save the starting SHA, round number, requested SHA and time, last seen review ID, each distinct finding and its disposition, fix commits, and check results. On resumption, reconcile this record with GitHub before posting, pushing, or requesting again. The initial inspection is round zero. Each fresh Copilot review requested or adopted during this run uses one of ten rounds, even if a newer push supersedes it. Polls, replies, and CI reruns consume no rounds.

## Inspect, fix, and reply

Apply the [code quality standards](../../../CONTRIBUTING.md#code-quality-standards) to the PR and any linked plan. Check the opening summary and rejected alternative against the issue. Look for duplicated logic and added complexity in the diff. When a smaller change meets the same criteria, name it in the review.

1. Read the PR conversation, all review submissions with their **full raw Markdown bodies**, and inline threads with replies and resolution state. Fetch every page. Expand nested `<details>` in the UI or read their raw contents. Look for “previously missed issue”, “open issues”, and “needs a closer look” even when the headline says “No open issues”. Distinguish new issues from resolved history.
2. Inspect the PR’s complete checks and commit statuses, including external providers. Match each to the current PR revision or its current GitHub test merge. Read failed job logs and compare the affected behavior to the base branch when relevant. Use the connected GitHub tools or the CLI. For example, `gh pr checks "$pr" -R "$repo"` shows the check rollup, and `gh api --paginate "repos/$repo/pulls/$pr/reviews"` retrieves review bodies and commit IDs.
3. Evaluate each distinct claim against the current code, the PR’s intent, and existing tests. Deduplicate by underlying behavior across the summary, thread, and earlier rounds. Reopen the question if a repeat supplies new evidence. Reproduce a plausible defect or trace the failing path. Fix valid in-scope findings and CI regressions, grouping related changes. Run the closest relevant checks and add a regression test when it can distinguish the broken behavior from the fix. Retry a failing job when the evidence supports a transient failure.
4. Record the current review IDs and recheck the remote head before pushing. If it moved, incorporate the new work and revalidate affected fixes. Push the tested commit to the PR head branch with an ordinary push. Reply in the original thread with the disposition, short SHA, and specific test or evidence. For a body-only finding, use a PR conversation reply linking the review and naming the finding. Explain declined, duplicate, or already-fixed suggestions where a reply helps. Resolve addressed threads when appropriate. Record genuine human decisions, out-of-scope requests, and validation gaps for the user.

## Request and monitor Copilot

1. After initial triage and any push, identify the current head and inspect the reviewer timeline. Adopt a review already pending for this head or one automatically triggered by this run’s push, even if it has already finished. Otherwise record the existing review IDs and request a fresh **Copilot code review** through GitHub’s reviewer control or, with a CLI that supports it, `gh pr edit "$pr" -R "$repo" --add-reviewer '@copilot'`. Check the timeline for the request or new submission, especially after a timeout, before retrying. Count each distinct request once.
2. Check GitHub **every 10 minutes** while waiting for Copilot or CI. Keep the task active using the available wait or scheduling mechanism. If using a wake-up, keep at most one pending for this PR and cancel it at the end. At each poll refresh the PR state, head, review IDs and bodies, comments, threads, and checks. An empty poll or a vanished reviewer request leaves the review unconfirmed. Wait for a new submitted Copilot review covering the recorded head, verified by review ID and commit SHA. A submitted `COMMENTED` review can qualify. If the head moved, carry forward the round count and obtain a review for the new head within the remaining budget.
3. Triage each new finding using the steps above. If the review produced a new finding or the head changed, get another pass while rounds remain. If a clean pass is in and only CI is pending, keep polling that head. If GitHub reports a failed review or an access problem, try the available supported route. If progress requires human action, notify the user with the failed operation, evidence, and last confirmed state. If the PR closes or merges, stop and report its actual state.
4. **Clean finish.** Immediately before notifying, confirm the head is still current, the fresh Copilot review contains no new findings (including in the body), all known valid in-scope issues are addressed, and all applicable checks are green. Treat missing expected checks, failures, cancellations, and pending runs as outstanding. Identify any conditionally skipped jobs separately. If a material decision or required manual check is still open, report what needs human attention. Notify the user in the originating Codex chat with the PR link, final SHA, round count, review and checks links, fixes, and any residual verification limits.
5. **Tenth round.** Evaluate the tenth review and address valid findings as usual. Stop requesting reviews and send the scorecard below, including on a clean tenth pass. If the last fix changed the head, give both the last reviewed SHA and the final SHA. Report checks as observed and label any remaining validation or review as outstanding.

## Round-ten scorecard

Compare the final head to the **head at loop entry**. Use the original PR goal to judge scope. Inspect the intervening commits and attribute unrelated pushes separately. For each row give **+1** for a demonstrated improvement, **0** for no material change, **−1** for a demonstrated regression, or **?** for insufficient evidence. Cite a before/after behavior, diff, test, review, or check for each judgment.

| Dimension | Question |
| --- | --- |
| Correctness | Which failure can the final code now prevent or reproduce? Did a fix introduce a new failure? |
| Regression protection | Which tests would fail at entry and pass now? Which important behavior still relies on a manual check? |
| Scope fidelity | Does each review-driven change serve the original acceptance criteria? Which change widened the PR? |
| Maintainability | Did the fixes simplify a path or add branches, dependencies, or abstractions with a lasting cost? |
| Review churn | Did later rounds uncover independent defects, repeat earlier points, reverse fixes, or repair defects introduced by the loop? |

Finish with **strengthened**, **mixed**, or **drifted**, and explain which evidence decided the verdict. Use **inconclusive** when evidence is insufficient. Include unique fixes, declined or repeated findings, remaining risks, the current check status, and one recommendation for the owner. A green CI run or a large number of resolved comments alone cannot establish improvement.
