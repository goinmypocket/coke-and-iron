# Brass Birmingham — digital port to web

A TypeScript + React web implementation of Brass Birmingham, built from
a platform-agnostic spec.

## Project layout

- `docs/game-spec.md` — platform-agnostic authoritative spec. Source of
  truth for rules, entities, configs, UI, and panels.
- `docs/rulebook.pdf` — original published rulebook. Reference only;
  the spec is authoritative. If the two conflict, trust the spec.
- `assets/industry_icons/` — SVG icons for the six industries. Referenced
  by spec §2.9.2.
- `config/` — tunable data per spec §9 (cities, cards, links, tiles).
  Loaded by the engine at setup.
- `src/` — project source (engine, ui, network per the
  boardgame-platform-ts-web skill's scaffold layout).
- `tests/` — engine tests.

**Do not modify** `docs/` or `assets/` without asking — they're
spec-owned and not touched by build code.

`config/` is partly build-owned: the in-game UI / layout / board
editors persist their changes back into `config/ui.json`,
`config/layout.json`, and parts of `config/cities.json` (board
positions and slot edits). The remaining seed values —
`config/cards.json`, `config/links.json`,
`config/industry_tiles.json`, and the spec-defined fields of
`config/cities.json` — are spec-owned; don't edit them outside an
explicit task.

## Target platform

Web, TypeScript + React, event-sourced engine with swappable networking
transport. Follow the `boardgame-platform-ts-web` skill for the architecture
and implementation procedure.

## Git workflow

This project uses git for version control. Claude Code manages commits
as part of the development flow. Follow these rules.

### Setup (first session only)

If this is a fresh project without git initialised:

1. Check for git: run `git --version` to confirm it's installed.
2. Initialise if needed: `git init` and set the default branch to `main`.
3. Ask me for user.name and user.email, then configure them locally for
   this repo. Do not guess values.
4. Confirm a `.gitignore` exists that covers at minimum: `node_modules/`,
   `dist/`, `build/`, `.vite/`, `coverage/`, `*.tsbuildinfo`, `.env`,
   `.env.*.local`, `.DS_Store`, `Thumbs.db`, `.idea/`, and editor-specific
   folders.
5. Make an initial commit of whatever's already in the repo using a
   conventional-commits message (e.g. `chore: initial project skeleton`).
6. Ask whether to add a remote. If yes, ask for the URL.
   - **If the remote is GitHub (or any host where the repo might be
     created via Claude Code), the repository MUST be created private.**
     Confirm with me that the repo is private before any push.
   - Run `git remote add origin <url>`. Do not push.

### Commit cadence

Commit at natural milestones — not after every file edit, and not only at
the end.

Good milestones look like:

- `scaffold: initialise 4-layer project skeleton`
- `feat(engine): implement §5.1 Build action with tests`
- `feat(engine): implement §5.2 Network action with tests`
- `feat(ui): implement Main Board panel`
- `feat(ui): implement Hand panel and PLAY_CARD wizard`
- `test: add §6.4 end-of-Canal-era scoring tests`

### Commit messages

Use conventional-commits prefixes: `feat`, `fix`, `refactor`, `test`,
`docs`, `chore`, `style`, `perf`. When the commit implements or fixes
behaviour defined by the spec, reference the spec section in parentheses
after the scope or in the body:

```
feat(engine): implement §5.1 Build action

- Validates card authorisation per §5.1 step 1
- Enforces specific-before-combo slot rule per §5.1 step 2
- Triggers move-to-market for Coal Mine / Iron Works per §5.1.1
- Tests cover all failure modes and overbuild cases
```

Keep subject lines under ~72 characters; use the body for detail when
needed.

### Staging rules

- Always run `git status` before committing.
- Only stage files that belong to the current milestone. Don't use
  `git add -A` indiscriminately if unrelated changes are present.
- If there are uncommitted changes outside the current milestone's scope,
  stop and ask me before committing.

### Pushing

- Never push without asking me first.
- Never force-push.
- If I haven't set up a remote yet, don't push at all — just commit
  locally.

### Repository visibility

This repository is **private**. Never make it public, and never suggest
or recommend making it public. Specifically:

- If you create the GitHub repo on my behalf (via `gh repo create` or
  similar), use the `--private` flag. Never `--public`. Example:
  `gh repo create brass-birmingham --private --source=. --remote=origin`.
- If the repo already exists as public, stop and tell me — do not push
  to it, and do not try to change its visibility autonomously.
- Do not commit any content that implies or advertises the repo's
  existence to third parties (no README badges pointing to a public URL,
  no public issue-tracker links, etc.) without asking.
- Do not add collaborators, deploy keys, webhooks, or integrations
  without my explicit approval.

### Branches

- For this project, work directly on `main` unless I ask for a feature
  branch.
- If I ask for a branch, use the pattern `feat/<short-description>` or
  `fix/<short-description>`.

### Merge conflicts

If a conflict arises (from a rebase, merge, or pull), stop immediately
and surface it to me. Do not attempt to resolve conflicts autonomously —
even small ones.

### Things never to do without explicit instruction

- `git push --force` / `--force-with-lease`
- `git reset --hard` on committed work
- Rewriting pushed history (`rebase -i` on pushed commits, amending
  pushed commits)
- Deleting branches (local or remote)
- Changing remote URLs
- Modifying `.git/` directly
- Making the repository public (see "Repository visibility" above)