# Roadmap — deferred work

A running list of items that have been **explicitly decided on** but
not yet built. New conversations / sessions should read this before
starting fresh work; finished items get moved out (or deleted).

Status keys:
- **[engine]** — touches the headless engine.
- **[ui]** — touches the React UI.
- **[spec]** — needs a spec edit (in `docs/game-spec.md`) before code.
- **[host]** — only meaningful once a real host / multiplayer transport
  exists; today everything's loopback.

---

## Multiplayer + host features

- **[host] Multi-turn undo with all-player consent.** A player can
  request a rollback that crosses turn boundaries. All other seated
  players must agree before the engine truncates the intent log to
  the requested point. Probably modeled as a two-phase intent:
  `REQUEST_MULTI_TURN_UNDO { targetLogOffset }` + per-seat
  `VOTE_ON_UNDO { yes | no }`; on unanimous yes, engine truncates +
  replays. Today's `Engine.undo()` only handles within-turn rollback.
- **[host] Per-player chess clocks.** Fischer (X+inc), byo-yomi
  (main + N periods of K seconds), sudden death, hourglass, and a
  custom mode. Host-side authoritative timer; UI reads + paints.
  Engine adds a `CLOCK_TIMEOUT { playerId }` intent. Configurable
  per-room from a host settings screen.
- **[host] Move timestamps in the intent log.** Widen each log entry
  from `Intent` to `{ intent, timestamp, ... }`. Forward-compatible
  whenever; bundle with the clock work since the same log shape
  serves both.
- **[host] `allowUndo: false` host enforcement.** The engine config
  flag is wired (default `true`); the host UI needs a toggle that
  passes it through when the room is created.

---

## Engine polish

- **[engine] Spec §13 UI checklist walk.** The Rules section is
  fully covered by automated tests; the UI section is still a
  manual-verification TODO (needs a human to walk through every
  panel / wizard listed in §13 and confirm).
- **[engine] Repository visibility / `.claude/settings.json`.** Was
  pulled into a refactor commit by accident; consider whether it
  should live in `.gitignore`.

---

## UI — outstanding polish

- **[ui] Markets widget — clickable cubes-as-buy (§2.11.3).** Today
  the resource picker overlay handles MARKET picks via its own
  source rows; the spec also calls for direct-buy by clicking a
  coal / iron cube on the widget itself. The whole-widget glow is
  shipped; the click-target piece would route the cube click into
  the same picker dispatch path.

---

## Conventions for editing this file

- Add new deferred items as bullets with a `[tag]` prefix.
- When an item ships, **delete its bullet** in the same commit that
  ships it. Don't keep history here — `git log` is already that.
- Keep the file under ~150 lines so it's quick to read and trivial
  to load into context.
