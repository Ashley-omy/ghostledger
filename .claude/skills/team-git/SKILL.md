---
name: team-git
description: Team Git and GitHub workflow for GhostLedger — create a branch, commit, push, open a PR with gh, review or merge a teammate's PR, resolve conflicts, and keep secrets and personal data out of the repo. Use whenever someone asks to commit, push, open/review/merge a PR, sync with main, or fix a merge conflict.
---

# Team Git workflow

Repo: `Ashley-omy/ghostledger`, default branch `main`. Three people work in parallel, so keep PRs small and merge often (aim for every 30–60 min).

## Start work
```bash
git switch main && git pull --rebase
git switch -c feat/<area>-<topic>      # area: api | backend | ai | frontend | infra | docs
```

## Before every commit
1. **Never commit secrets or personal data.** `git status` must not show `.env`, `data/`, or receipts that show names or card numbers. Then scan what's staged:
   ```bash
   git diff --cached --name-only
   git grep --cached -nE 'AIza[0-9A-Za-z_-]{20,}|AQ\.[A-Za-z0-9_-]{20,}' && echo "STOP: key found"
   ```
   If a key was ever committed, even if it was removed later: rotate it in Google AI Studio first, then tell the team.
2. Run the relevant check:
   - spec changed → `npx @redocly/cli lint docs/openapi.yaml`
   - backend changed → the server starts and the touched endpoint works
   - prompts changed → the eval table (skill `llm-extraction`)
3. Stage specific files (`git add <paths>`), not `git add -A`, unless `git status` is clean of surprises.

## Commit message
```
<area>: <what changed, imperative>

<why, if not obvious>
```
Examples: `api: add payment_method to Receipt`, `frontend: highlight TOTAL_MISMATCH rows`.

## Open a PR
```bash
git push -u origin HEAD
gh pr create --fill --base main
```
The PR body should include:
- what changed
- how you tested it
- for prompt changes, the eval table
- for UI changes, a screenshot

## Review and merge
- Contract PRs (`docs/openapi.yaml`) need 👍 from the frontend **and** the backend owner. Other PRs need one teammate's look.
- Review: `gh pr checkout <n>`, run it, then `gh pr review <n> --approve` or `--comment -b "..."`.
- Merge: `gh pr merge <n> --squash --delete-branch`. Then everyone runs `git switch main && git pull --rebase`.
- **After 16:15 (feature freeze), only merge bug fixes.**

## Sync and conflicts
```bash
git fetch origin && git rebase origin/main
```
- On conflict: open the files, keep both sides' intent, then `git add <file> && git rebase --continue`.
- For conflicts in `docs/openapi.yaml`, ask the spec owner (C) instead of guessing.
- Never `git push --force` to `main`. On your own branch use `--force-with-lease`, and only after a rebase.
