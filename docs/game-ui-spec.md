# Brass Birmingham — UI specification

Companion to `game-spec.md`. The rules spec describes WHAT the game
is; this document describes HOW the React + SVG UI surfaces it.
Anything visual (panel layout, icon rendering, wizard flow,
overlays) lives here; any rule reference uses `§N.M` to point back
into the rules spec.

The board canvas is `900 × 900` SVG units, rendered via `viewBox`
and scaled into the host panel.

---

## 1. Visual primitives

### 1.1 Tile constant

`TILE` (currently 28) is the single edge length used everywhere a
tile is drawn — board slots, mat tiles, resource pickers. Any
related layout (city body dims, slot cells, mat row height) is
expressed as a multiple of `TILE`.

### 1.2 Shared icon components (`src/ui/icons/`)

Every glyph the game shows for a unit / quantity / bonus comes from
a single shared React component. Each component:

- Renders a self-contained `<svg>` with its own viewBox.
- Accepts `size?: number`, `x?: number`, `y?: number`, `style?: CSSProperties`.
- Drops into either an HTML host (parent ignores `x` / `y`) or an
  SVG host (nested SVG positioned by `x` / `y`).

| Component | Purpose | Extra props |
|--|--|--|
| `MoneyCoin` | gold coin with value inside | `amount` |
| `CoalIcon` | small black square | — |
| `IronIcon` | small orange square (`#d97706`) | — |
| `BeerIcon` | beer-barrel ellipse | `consumption?` (default `false`) |
| `LinkPointsIcon` | hexagon (matches VP) with a horizontal gold bar between two filled gold dots | — |
| `LinkTileIcon` | rounded rect filled with the player's pawn colour, holding the canal-boat or steam-train asset (`assets/link_icons/canal.svg` / `rail.svg`) | `era` (`"CANAL"` / `"RAIL"`), `color`, optional `angle` |
| `VictoryPointsIcon` | hex with VP value inside | `amount` |
| `IncomeGainedIcon` | gold up-arrow with gain inside | `amount` |
| `CurrentIncomeIcon` | open palm + coin, value to its right | `amount` |
| `DevelopIcon` | yellow light-bulb | `consumption?` (default `false`) |

Conventions:

- Coal / iron / beer / link points: caller renders **one icon per
  unit** (no count overlay). Three coal cubes = three `<CoalIcon />`.
- VP and income gained carry their value inside the icon.
- `BeerIcon consumption` flips to a beer-barrel with a red diagonal
  strike — used wherever a tile *consumes* beer (the beer-cost flag
  on Cotton/Manufacturer/Pottery).
- `DevelopIcon consumption` flips to a struck-through bulb — used
  on the no-Develop flag for Pottery light-bulb tiles.
- `VictoryPointsIcon` and `LinkPointsIcon` share a black-bg hexagon
  with a dark-golden border (`#c89020`); their internal artwork
  is in the same gold so they read together as a stylistic family.
  All viewBox-relative — line widths, lengths, dot radii scale
  proportionally with `size`.
- `LinkTileIcon` is the digital stand-in for a physical canal /
  rail link tile. It's used on the seat stats bar (with `×N`
  remaining count), and on the board as the developed-link
  marker (centred at the line midpoint for 2-endpoint links,
  rotated by the line's angle so the asset reads "right-side up";
  centred at the centroid horizontally for triple links).
  The asset SVGs (`assets/link_icons/canal.svg`,
  `assets/link_icons/rail.svg`) are detailed line-art that read
  against any pawn colour.

The components above are the only icon definitions in the codebase.
No panel may invent or inline an alternative.

### 1.3 District / pawn colours

District colours and pawn colours come from `src/ui/industryIcons.ts`
(`DISTRICT_FILL`, `DISTRICT_LABEL`) and the engine's `Player.pawnColor`
respectively. UI code reads these directly; no other palette is used.

---

## 2. Industry tile face

Every tile is a `TILE × TILE` square painted in the owner's pawn
colour. Two faces; corner positions are fixed across both.

### 2.1 Unflipped face

The player-facing side on the mat and on a freshly-built tile.

- **TL** — level Roman numeral.
- **TR** — `BeerIcon consumption` per beer required (`spec.beerToSell`
  copies, defaulting to none).
- **BL** — when on the player mat: `n` small black dots indicating
  remaining tiles at this level. Empty otherwise.
- **BR** — `DevelopIcon consumption` when `lightBulb` (Pottery
  L1 / L3).
- **Bottom-right packed token stack** — for Coal/Iron/Brewery only.
  Cubes/barrels pack column-major from the bottom-right going UP a
  maximum of 2 rows before starting a new column to the left. Mat
  callers pass the level's max capacity; board callers pass the
  live `t.resources` so it drains as cubes are consumed.
- **Centre** — the industry asset icon (`assets/industry_icons/`).

The build cost (money / coal / iron) is **never** drawn on the tile
face — it lives in the mat row's left column (§3.2).

### 2.2 Flipped face

Used on the board after a tile has flipped (Sell or last-resource
drain). Top half full pawn colour, bottom half a paler tint.

- **TL** — level Roman numeral, light fill.
- **TR** — cascade of `LinkPointsIcon`, one per `linkPoints`.
- **BL** — `VictoryPointsIcon` with the level's VP.
- **BR** — `IncomeGainedIcon` with the level's income bonus.
- **Centre** — the industry asset icon.

### 2.3 Bounding rule

No element on a tile face overhangs the outer rectangle and no two
sub-rectangles overlap. Glyphs scale with the tile via the icon
components' viewBox; nothing uses absolute pixel sizes.

---

## 3. Player mat (§11.3)

One outer panel, one sub-panel per seat, sub-panel border in pawn
colour.

### 3.1 Stats bar

`MoneyCoin · VictoryPointsIcon · CurrentIncomeIcon · LinkTileIcon ×N`.

The `LinkTileIcon` here uses the seat's pawn colour and the
current era's asset (canal in Canal era, rail in Rail era). `×N`
is the remaining link tile supply.

### 3.2 Mat grid

Six industry columns laid out as a flex row whose children size to
content (no fixed-width grid). Manufacturer is the only column
that's two sub-columns wide (L1-L5 left, L6-L8 right); the others
are single-column. Each column has one row per fixed level,
ordered **bottom-up** — L1 (the next-to-build tile) at the bottom
and the highest level at the top. Manufacturer's right column
gets ghost cells at the **top** so its bottom row (L6) lines up
with L1 in the left column.

Adjacent columns are separated by a 1-px ink-coloured vertical
rule (`border-left` on `.mat-stack + .mat-stack`) plus a small
horizontal padding inside each column. The columns are
**bottom-aligned** (`align-items: flex-end`), so columns of
different heights share a baseline along the L1 row.

The industry icon + name caption hangs **below** the column.

A `<MatScaler>` wraps the grid: a `ResizeObserver` derives a
`transform: scale()` factor from `clientWidth / scrollWidth`, so
the mat shrinks to fit a narrow panel and renders at full size when
the panel is maximised.

### 3.3 Per-level row

Three sub-cells, packed flush:

- **Left column — cost icons.** Vertical stack: `MoneyCoin` with
  the £ value, then one `CoalIcon` per coal cube, then one
  `IronIcon` per iron cube. Stack height ≈ `TILE`.
- **Tile face** — unflipped face per §2.1, painted in the seat's
  pawn colour, sized at the natural mat tile width (40 px before
  the scaler). Receives `stackCount` so it can render BL dots.
- **Right column — bonus icons.** SVG column showing
  `VictoryPointsIcon` (top), `IncomeGainedIcon` (middle),
  `LinkPointsIcon` cascade (bottom). Rows whose value is 0 drop
  out. Resource production is on the tile face, not here.

The lowest level still in the stack (engine `stack[0]`) is the click
target during Build / Develop / Sell-Gloucester. Spent levels (count
0) render at 35 % opacity.

---

## 4. Main board (§11.2)

Renders into a `900 × 900` SVG via `viewBox`.

### 4.1 District cities

Body sized to slot count:

| Slots | Body dims | Slot positions |
|--|--|--|
| 1 | TILE × TILE | centred single cell |
| 2 | 2·TILE × TILE | row 0: cells 0, 1 |
| 3 | 2·TILE × 2·TILE | row 0: cells 0, 1; row 1: cell 2 centred |
| 4 | 2·TILE × 2·TILE | 2 × 2 grid |

Empty slots show their accept-list — the centroid of icon centres
sits at the slot centre regardless of count:

- 1 industry → single big icon, centred (~70 % of cell).
- 2 industries → side-by-side, midpoint at centre.
- 3 industries → equilateral triangle (top, bottom-left, bottom-right).
- ≥ 4 industries → 2 × 2 grid.
- Wildcard (empty `acceptList`) → "ANY" text.

Built tiles render via `TileFace` positioned at the slot's cell
top-left.

### 4.2 Merchant cities

All five render regardless of player count. Each is a horizontal
row of D-shaped slots (square top, rounded bottom) sized like a
district-city slot. Below each active D, a small square holds a
`BeerIcon` when the slot has its beer; an empty outline otherwise.
Inactive cities (Nottingham at 2 P, Warrington at 2 / 3 P) draw the
D frames at the same opacity as active ones, with no accept icon
and no beer indicator.

The bonus is rendered above the cluster using the bonus's own icon:
`VictoryPointsIcon` / `MoneyCoin` / `IncomeGainedIcon` / `DevelopIcon`
with the value baked in (or alongside, for Develop).

ANY slot fills the D with three small industry icons in a triangle
(Cotton / Manufacturer / Pottery). BLANK slot leaves the D empty.

### 4.3 Lines

Canal blue `#5e8fc7`, rail brown `#9c7656`. Era-current lines render
at 0.85 opacity, off-era at 0.18. Triple links centroid-junction
to a small dot. **Developed links** carry a `LinkTileIcon` —
player-coloured rounded rectangle holding the canal-boat or
steam-train asset:

- 2-endpoint links — centred on the line midpoint, rotated by the
  line's angle so the asset reads upright (rotation normalised to
  the upper half-plane).
- 3-endpoint (triple) links — centred at the centroid, **always
  horizontal** (no rotation).

### 4.4 Markets widget

Sits at the bottom-right of the canvas. No title strip, no
Buy / Sell / cube-count summary text — just two columns:

- **Tier rows** at the top (priced + overflow on top), one row per
  tier. Each row: `<MoneyCoin amount={price} />` (small) on the
  left, two square cube slots (filled = `<CoalIcon />` / `<IronIcon />`,
  empty = hollow rect) on the right. Overflow row's slot rects use
  a dashed stroke and the coin renders dimmed; the overflow row
  always shows two filled cubes to signal unlimited supply.
- **Industry icon** (coal-mine / iron-works asset) below the rows,
  aligned on a shared baseline across both columns.

Glow modifier: when a Build or Network coal-/iron-source picker is
active, the widget background and border tint warm-gold, and the
active column's row labels render bold.

---

## 5. UI flow

The ground state is **IDLE**: no wizard active, the Actions panel
is emphasised. From IDLE:

- Clicking a card stashes it; the player then picks an action.
- Clicking an action button starts its wizard; the player then
  picks a card.

Inside a wizard:

- Inputs are picked in any order (cards aren't forced first).
- Unique-cardinality picks (Build slot, Network line, etc.) replace
  on a second click.
- Variable-cardinality picks (Develop industries 1-2, Sell tiles,
  Scout cards 3) accumulate, respecting per-action caps. Repeatable
  targets (Develop industry) ADD on duplicate click; distinct-id
  targets (Sell tiles, Scout cards) TOGGLE.
- Auto-submit fires once every required input is set AND every
  variable input is at its cap. End Action submits when required
  inputs are set even if a variable input hasn't capped (Develop
  with 1, Sell with ≥1).
- Structurally invalid clicks reject with a toast; valid ones go
  through and the engine surfaces final-combination failures via
  toast.

Resource-picker sub-states (coal / iron / beer) interpose between
input-complete and dispatch when ambiguity exists; auto-resolve
when there's a single source and a market connection.

**Second-rail offer.** After a Rail-era Network with one link, the
wizard surfaces the optional second link.

**Gloucester follow-up.** After Sell consumes Gloucester beers, one
develop-like industry pick per beer.

**IDLE card-first hint.** When a card is stashed, the four main
action buttons distinguish where the card naturally fits: a
Brewery industry card highlights Build + Develop and dims Network +
Sell. Dimmed buttons stay clickable — the engine still accepts the
card as discard fodder.

### 5.1 Build slot narrowing

Once a card or industry is picked during Build:

- **Card with a Location pin** — every city other than the named
  one dims to 35 % opacity.
- **Industry pin** — slots whose accept-list excludes the picked
  industry render dimmed (the slot rect, not just the city).

Engine still owns the final validation (occupancy, era,
specific-before-combo).

### 5.2 Wizard controls

- **Reset Selection** clears all picks (card included).
- **End Action** dispatches when required inputs are set.
- **Undo** rolls back the last successful dispatch within the
  current turn; cleared at End Turn.
- **End Turn** commits and advances seats.

---

## 6. Panels

| id | Title | Notes |
|--|--|--|
| `income` | Income Tracker | vertical ladder of income steps; pawn-coloured markers |
| `board` | Main Board | the 900 × 900 SVG |
| `players` | Players (one sub-panel per seat) | mat per §3 |
| `game_state` | Game state | era / round / phase / turn / actions left |
| `player_state` | Player state | seat scoreboard sorted by current turn order |
| `remaining_cards` | Remaining cards | unseen-pool inventory grouped by district + industry; muted ×0 rows for spent categories; district-colour swatch per group |
| `hand` | Hand | active seat's 8-card grid |
| `actions` | Actions | verb buttons + wizard controls; emphasised on IDLE |
| `recent_actions` | Recent actions | newest-first log; player names in pawn colour, cities in district colour |

### 6.1 Affordances (no panel chrome)

- **Prompt strip** above the board: short imperative hint per
  wizard sub-state.
- **Context bar** below the prompt: chip summary of every pick made
  in the active wizard plus a phase-specific primary submit button
  ("Lay one link only" / "Submit Gloucester picks" / "Build" / etc.)
  and a Reset shortcut. Hidden when no wizard is active and no
  card stashed.
- **Toast** (sonner): ephemeral feedback on success / failure.

### 6.2 Overlays

- **Era / round banner** (~1.5 s) on transition.
- **Resource picker overlay** during ambiguous Build / Network /
  Sell resource sub-states.
- **Sell merchant picker overlay** when a sold tile reaches 2+
  merchant slots — one row per ambiguous tile, one button per
  merchant option (city + bonus + beer-barrel state).
- **Shortfall overlay** during the income-shortfall sub-flow.
- **End-game overlay** at `phase === GAME_OVER`: ranked seats per
  §6.6, winner / draw line, Close button.

---

## 7. Dev tooling

A separate `editor.html` Vite entry point ships a WYSIWYG editor
for `config/cities.json` and `config/links.json`. Drag-to-reposition
cities / merchants / market with snap-to-5; inline forms for slot
accept-lists, district, name, merchant bonuses; click-to-create /
delete links per era. Backed by a dev-only Vite middleware plugin
that round-trips the files. Run via `npm run editor`.

---

## 8. Verification

- No hard-coded viewport. Resize the window — panels reflow.
- Every panel clips its content; no sub-element overflows.
- Sub-rectangles inside a panel never overlap (other than
  documented overlays).
- Every industry tile draws within its outer rectangle.
- Hit-rects match painted rects exactly.
- Card-first and action-first flows both work.
- Reset Selection clears every pick (including the card).
- End Action submits Develop (1 tile) and Sell (any number of
  orders).
- Undo can't cross a completed End Turn.
- Dev editor persists positions + slot edits back to
  `config/cities.json` and links to `config/links.json`.
