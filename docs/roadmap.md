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

- **[engine] Spec §13 verification-checklist walk.** Confirm every
  item in the spec's verification checklist is covered by an
  automated test. Add what's missing.
- **[engine] Hand-empty mid-turn.** If a player exhausts their hand
  before `actionsRemaining` reaches 0, every action rejects with
  `card_not_in_hand` and `END_TURN` rejects with
  `actions_still_remaining` — the seat is stuck. Either auto-clear
  remaining actions when hand is empty, or relax END_TURN to allow
  it when hand is empty even with actions left.
- **[engine] §6.6 tie-breaking helper.** Pure utility:
  `rankSeats(state) → PlayerId[]` ordered by VP, then income level,
  then money. Useful for the eventual scoreboard panel.
- **[engine] Repository visibility / `.claude/settings.json`.** Was
  pulled into a refactor commit by accident; consider whether it
  should live in `.gitignore`.

---

## UI — panels still to build

- **[ui] Board panel polish (§11.2).** Read-only render shipped
  (cities, lines, built tiles, markets). Still TODO: industry icon
  glyphs in slots (currently letter codes), resource cubes / iron
  cubes / beer barrels on tiles + merchants, owner-coloured
  link tokens, era-flip animation, market-tile widget per §2.11.3,
  click handlers wired to Build / Network / Sell wizards.
- **[ui] Players panel polish (§11.3).** Sub-panel + minimal mat
  grid (six stacks, top-tile click-target) shipped. Still TODO:
  Manufacturer spanning two columns (1–5 / 6–8), Pottery as 5
  fixed-level rows, full cost / bonus margins, link-supply icon
  in the stats bar.
- **[ui] Income tracker (§11.1).** Vertical ladder with pawn-coloured
  markers; re-renders on every state change.
- **[ui] Remaining cards polish (§11.6).** Live drawDeck inventory +
  canal-removed count shipped. Still TODO: muted zero-rows for cards
  that have left the deck (need a deck catalogue on GameState),
  district-colour labels.
- **[ui] Recent actions polish (§11.9).** Newest-first text list
  shipped. Still TODO: pawn-colour player names, district-colour
  city refs, era / round banners.
- **[ui] Affordances (§11.10).** Prompt strip, context bar, toast
  primitives — toast already lives via Sonner; the others are still
  TODO.
- **[ui] Overlays (§11.11).** Per the spec — game-end summary,
  shortfall sub-flow prompt, Gloucester follow-up sub-state, etc.
- **[ui] City slot editor (§11.12).** Board-editor overlay that
  writes through to `config/cities.json`.
- **[ui] Layout editor (§10.3).** In-game panel layout editor that
  writes through to `config/layout.json`.

## UI — wizards still to build

- **[ui] Develop wizard — iron-source sub-state.** Auto-resolution
  of free network iron > market is wired. Manual iron source
  picker (when ambiguous, e.g. multiple unflipped Iron Works) is
  still TODO; today the wizard just walks builtTiles in order.
- **[ui] Build wizard.** Card + city + slot + industry, then
  coal/iron sub-states. Needs board panel first.
- **[ui] Network wizard.** Line pick (canal or rail), coal sub-state
  (rail), beer sub-state (rail-2nd). Second-rail-offer follow-up
  per §10.1. Needs board panel first.
- **[ui] Sell wizard.** Tile picks, merchant pick when ambiguous,
  beer-source sub-state per order, Gloucester follow-up. Needs
  board panel + mat panel.
- **[ui] RESOLVE_SHORTFALL UI.** When `state.pendingShortfalls` is
  non-empty, prompt the head-of-queue player to pick tiles to
  remove. Currently the engine accepts the intent but no UI surfaces
  it.
- **[ui] IDLE card-first flow (§10.1).** Right now clicking a card
  in IDLE no-ops; should stash the card and offer compatible action
  buttons.

---

## Conventions for editing this file

- Add new deferred items as bullets with a `[tag]` prefix.
- When an item ships, **delete its bullet** in the same commit that
  ships it. Don't keep history here — `git log` is already that.
- Keep the file under ~150 lines so it's quick to read and trivial
  to load into context.
