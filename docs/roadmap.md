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

- **[engine] Spec §13 verification-checklist walk — partial.**
  Rules section 1-12 audited; coverage existed for 9 items.
  Added tests for the 3 gaps: rounds-per-era invariant
  (deck-size.test.ts), income level 30 hard ceiling
  (advanceSteps clamp), iron-market-no-connection (counterpart
  to existing coal_market_not_connected). UI section of the
  checklist still TODO — needs manual verification, not
  automated tests.
- **[engine] Repository visibility / `.claude/settings.json`.** Was
  pulled into a refactor commit by accident; consider whether it
  should live in `.gitignore`.

---

## UI — panels still to build

- **[ui] Board panel polish (§11.2).** Read-only render +
  click-targets-for-wizards + industry icon glyphs on built tiles +
  industry icon glyphs in city slot accept-lists + resource cubes /
  iron cubes / beer barrels on tiles + beer barrels on merchant
  slots + owner-coloured link tokens + market-tile widget per
  §2.11.3 (header strip with Buy / Sell / N/max cubes, "£X
  (overflow)" when empty, "—" when full) + warm-gold glow on the
  whole widget when a coal- or iron-source picker is active
  (tinted background + bold label on the active column) all
  shipped. Still TODO: clickable cubes-as-buy (today the picker
  overlay handles MARKET picks).
- **[ui] Players panel polish (§11.3).** Sub-panel + minimal mat
  grid + Manufacturer spanning two columns (L1-5 / L6-8) +
  Pottery as 5 fixed-level rows + full cost / bonus margins per
  row + link-supply icon in the stats bar all shipped.
- **[ui] Remaining cards polish (§11.6).** Inventory + face-down
  fold-in + muted zero-rows for canonical cards no longer in the
  unseen pool + district-colour swatch on each group label all
  shipped.
- **[ui] Recent actions polish (§11.9).** Newest-first text list +
  pawn-coloured player names + district-coloured city refs +
  era / round banners (transient overlay) all shipped.
- **[ui] Affordances polish (§11.10).** Prompt strip + toast +
  context bar (chip summary of every pick made in the active
  wizard plus a phase-specific primary submit button —
  "Lay one link only" / "Submit Gloucester picks" / "Build" /
  etc. — and a Reset shortcut) all shipped.
- **[ui] Overlays polish (§11.11).** End-game summary, shortfall
  sub-flow, era / round transient banners, and Gloucester
  follow-up sub-state all shipped.

## UI — wizards still to build

- **[ui] Build wizard polish.** Three-pick happy path + overbuild
  click target + explicit coal/iron pickers + visual narrowing of
  valid slots once a Location card / industry is picked (whole
  city dims when card pins a different city; individual slots
  dim when their accept-list excludes the picked industry) all
  shipped.
- **[ui] Network wizard polish.** Card + line + second-rail
  offer + explicit coal/beer pickers shipped.
- **[ui] Sell wizard polish.** Card + tile picks + Gloucester
  follow-up + explicit per-order beer picker + explicit merchant
  picker (overlay listing every reachable merchant slot per
  ambiguous tile, with bonus and beer-barrel state on each
  option) all shipped.
- **[ui] IDLE card-first polish.** Stash + auto-prefill +
  suggested-actions hinting (warm-gold border on actions where
  the stashed card naturally fits, dimmed on actions where the
  card is wasteful — e.g. a Brewery industry card highlights
  Build/Develop and dims Network/Sell) all shipped.

---

## Conventions for editing this file

- Add new deferred items as bullets with a `[tag]` prefix.
- When an item ships, **delete its bullet** in the same commit that
  ships it. Don't keep history here — `git log` is already that.
- Keep the file under ~150 lines so it's quick to read and trivial
  to load into context.
