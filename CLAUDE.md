# Coke and Iron — game module for In My Pocket

A TypeScript + React implementation of Brass Birmingham, packaged as a
**game module** for the In My Pocket multi-game platform. The
platform owns auth, tables, slots, saves, and the wire transport;
this module owns the rules, the per-recipient projection, and the UI.

The platform repo is `C:\Games\in-my-pocket\` (sibling). For the
plug-in contract this module fulfils, read
`../in-my-pocket/docs/in-my-pocket-game-author-guide.md`.

## Project layout

- `docs/game-spec.md` — platform-agnostic rules spec: entities,
  actions, scoring, config schemas. Engine behaviour authority.
- `docs/game-ui-spec.md` — UI spec: panel inventory, tile-face
  rendering, shared icon library, wizard flow, overlays, dev
  tooling. Visual / interaction authority.
- `docs/rulebook.pdf` — original published rulebook. Reference only;
  the spec is authoritative. If the two conflict, trust the spec.
- `docs/roadmap.md` — running list of explicitly-deferred items.
  Read this before starting a fresh session — it's where decisions
  about future work are persisted across compactions.
- `docs/architecture.md`, `docs/network-layer.md` — current internal
  architecture references for the engine + wire model. Some content
  predates the In My Pocket refactor and may be partly out of date;
  trust the code first when there's a conflict.
- `assets/industry_icons/` — SVG icons for the six industries. Referenced
  by spec §2.9.2.
- `config/` — tunable data per spec §9 (cities, cards, links, tiles).
  Loaded by the engine at setup.
- `src/engine/` — pure rules library.
- `src/network/` — wire types and client-side network layer.
- `src/ui/` — React UI.
- `host/` — server-side game session (will be moved into `server/` and
  refactored into `CokeAndIronSession` against the platform's
  `GameSession` interface in a follow-up).
- `tests/` — engine and session tests.

**Do not modify** `docs/game-spec.md`, `docs/game-ui-spec.md`,
`docs/rulebook.pdf`, or `assets/` without asking — they're
spec-owned and not touched by build code.

`config/` is partly build-owned: the in-game UI / board editors
persist their changes back into `config/ui.json` and parts of
`config/board.json` (board positions and slot edits, plus the
on-canvas widget anchors `marketPlace.position` and
`roundTracker.position`). The remaining seed values —
`config/cards.json`, `config/links.json`,
`config/industry_tiles.json`, and the spec-defined fields of
`config/board.json` — are spec-owned; don't edit them outside an
explicit task. (Note: the layout used to be configured via
`config/layout.json`; it's now hard-coded in
`src/ui/layout/GameLayout.tsx` + CSS template areas. The spec at
`docs/game-spec.md` still references the old approach in §10/§11
and should be updated in a future spec pass. Likewise it still
calls the board file `config/cities.json` — same content, new
name.)

## Standalone host: removed

The game runs only via the In My Pocket platform, which imports this
module's `definition.ts` and lazy-mounts `web/PlatformApp.tsx`
inside its chrome shell. For local development:

- **Game UI**: `cd ../in-my-pocket && npm run dev` — the platform's
  Vite dev server pulls coke-and-iron in via the `file:` link in
  its package.json and code-splits the rich UI into its own bundle.
- **Board / config editor**: `npm run editor` in this repo opens the
  hand-editing UI for `config/*.json` files. Independent of the
  game runtime.

The previous standalone Node host (`host/server.ts`, `npm run host`),
the legacy `web/App.tsx` standalone entry, and its supporting
`web/network/WebSocketClient.ts` / `useNetworkClient.ts` /
`LobbyScreen.tsx` have been removed.

## Git workflow

This project uses git for version control. Claude Code manages commits
as part of the development flow. Follow these rules.

### Commit cadence

Commit at natural milestones — not after every file edit, and not only at
the end.

Good milestones look like:

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
  `gh repo create coke-and-iron --private --source=. --remote=origin`.
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
