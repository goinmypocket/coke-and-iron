# Brass Birmingham — digital-game specification

> **Authoritative spec.** This file is the sole source of truth for the
> game's **rules, entities, config schemas, screen inventory, and
> interaction flow** — expressed in platform-agnostic terms. Changes to
> any of those things are edits to this file.
>
> **Platform-specific conventions** (tech stack, rendering API,
> networking transport, file layout for the chosen platform, coding
> style) are externalised — they live wherever the chosen platform's
> tooling, scaffold skill, or project documentation puts them, not
> in this file. A build of the game is always this spec PLUS the
> platform's externalised conventions. If any statement in this
> document implies a specific platform, treat it as a bug in the
> spec.

A single, **self-contained** reference that takes a project from zero
to playable on any target platform. Every rule, every entity, every
config schema, every screen, and every interaction is defined inside
this document — no external rulebook is referenced. A developer should
be able to rebuild the game from this document plus a chosen platform
profile alone.

**Scope.** Everything a 2–4 player hot-seat (plus optional networked)
implementation needs: the full rules, a glossary of every in-game
entity, the configuration-file schemas, the interaction flow, and an
inventory of every on-screen panel by contents and functionality —
all described in terms independent of any rendering or networking
technology.

**Out of scope.** AI opponents, matchmaking, public servers, art
style, input-device specifics.

Throughout, "**the engine**" means the pure rules core; "**the UI**"
means whatever layer presents state and collects input (its realisation
varies by platform); "**the player**" means the human at the active
seat.

---

## 1. Architecture contract

This section declares the boundaries the implementation must honour,
independent of platform. The platform profile fills in *how* each
boundary is realised on the chosen stack.

### 1.1 Three separated layers

1. **Engine.** Pure rules core. Holds all game state. Exposes a
   small API of intents (§5) and a single root `GameState`. No
   imports from the UI or networking layers. Unit-testable headless.
2. **UI.** Presents state; collects input; dispatches intents to the
   engine; re-renders on state changes. No direct state mutation —
   the UI never reaches into `GameState` to change it, only reads
   it and sends intents.
3. **Networking.** When multiplayer is enabled, transports intents
   between seats. Host-authoritative: exactly one engine instance is
   canonical; non-host seats' UIs mirror its state and forward
   intents to it. When single-player / hot-seat, this layer is a
   no-op passthrough.

The platform profile specifies which language and framework realises
each layer, the folder names, and how the layers are wired together.

### 1.2 Intents, not mutations

Clients never mutate game state directly. Every change to
`GameState` originates from an **intent** — a named, validated action
defined in §5. Intents are the only input the engine accepts. This
is what makes the game deterministic, replayable, and networkable.

### 1.3 Deterministic replay

Given the same `(player_count, seed)` and the same sequence of
intents, the engine produces the same `GameState` every time.
Randomness inside the engine routes through a single seeded RNG
initialised at `setup()`. No intent reads wall-clock time, system
entropy, or any other non-deterministic source.

This property makes Undo (§10.7), save/load, replay, and automated
testing trivial. Platform profiles must not break it — e.g. by
introducing platform-RNG calls inside the engine.

### 1.4 Rules correctness > visual polish

Every rule in §2–§7 below is the specification; rule changes are
changes to this document. Visual presentation may vary across
platform profiles; rules may not.

---

## 2. Glossary of entities

Every in-game concept used later in the document is defined here
first. Nothing is referenced without appearing in this list.

### 2.1 Board

A fixed topology of **district cities** + **merchant cities** +
a list of **canal lines** + a list of **rail lines**. Counts and
endpoints are config-driven (§9) and loaded once at setup;
unchanged during play.

### 2.2 District city

An inland city where players build industry. Has:

- A **name**.
- A **district tag** — purple / brown / red / blue / teal — used to
  colour-code the city label.
- A **position** on the board canvas (two floats in the board's
  own coordinate space; the platform profile maps this to whatever
  coordinate system the renderer uses).
- A list of 1–4 **slots** (§2.3).
- A **farm-brewery flag** — when set, the city accepts Brewery
  tiles exclusively via Brewery / Wild-Industry cards.

### 2.3 Slot

A single build spot on a city. A slot has an **accept list**:

- Empty accept list → **wildcard** slot, accepts any industry.
- One-entry accept list → **specific** slot, accepts only that
  industry.
- Multi-entry accept list → **combo** slot, accepts any of those
  industries.

Slot order within a city matters: §5.1 prefers a specific slot for
this industry over a combo slot even when both are empty.

### 2.4 Merchant city

A city at the board's edge. Has:

- A **name** and a **position** on the board canvas.
- A **slot count** — 1 or 2.
- A **bonus** (VP / DEVELOP / INCOME / MONEY) and a numeric
  **bonus value**, fired when a player consumes a merchant beer at
  this city during a Sell action (§5.4).
- A **link-point count of exactly 2** — added to adjacent links at
  end-of-era scoring (§6.1). This is a fixed contract for every
  merchant city, active or inert; unlike district cities (whose
  link-point contribution is the sum of link points on their
  flipped tiles), a merchant city always contributes 2 VP to any
  developed link adjacent to it.
- An **active-player-counts** list. A merchant city not active at
  the current player count is *inert*: it still contributes link
  points, but holds no merchant tile and cannot be the target of a
  Sell.

### 2.5 Merchant tile

A small tile placed into a merchant-city slot at setup. A merchant
tile has:

- An **accept list** — which industries it buys: cotton-only,
  manufacturer-only, pottery-only, wildcard (any industry), or
  **blank** (accepts nothing; pure filler).
- A **beer slot** — a single barrel sits next to every non-blank
  merchant tile after setup and after each end-of-era refill. That
  barrel is the **merchant beer** that fires the merchant-city
  bonus when consumed during Sell.

At setup the pool of merchant tiles is shuffled and distributed into
the active merchant cities; the mix per player count is declared in
`config/cities.json.merchantBag`.

### 2.6 Canal line, rail line, link

- A **canal line** is a potential connection between 2 cities
  (or among 3 for a triple link, §2.6.1) that can be built during
  the Canal era.
- A **rail line** is the same concept for the Rail era.
- A line is **undeveloped** if no link tile sits on it; **developed**
  if one does. A developed line is often called a **link**.

#### 2.6.1 Triple link

A **triple link** is a line with **three** endpoint cities rather
than the usual two. Which lines are triples (and in which era) is
config-driven (§9 — `config/links.json`). The engine treats a
triple link as **one edge with three endpoints** — not as three
separate edges — and the uniformity must be preserved everywhere
a line is referenced:

- **Placement.** Building places **one** link tile at the
  centroid of the three endpoints. One Network action, one
  link-tile supply decrement, the standard £3 canal cost. The
  cost is **never** tripled.
- **Adjacency.** The link tile is adjacent to **all three**
  endpoints. A player's network (§2.18) includes every endpoint
  of every triple link they own. A location is adjacent to the
  triple link iff it is one of its three endpoints.
- **Connectivity / traversal.** Moving across a triple link
  goes from any one endpoint to either of the other two in a
  single hop. BFS / DFS from one endpoint reaches the other two
  via the triple edge. This is the rule invoked by coal-source
  distance (§5.6.1), Coal-Market connection to a merchant
  (§5.6.1), opponent-brewery beer reach (§5.6.3), Sell merchant
  reach (§5.4), and the Build network test (§5.1).
- **Resource consumption during a Network build on a triple
  line.** Standard Network cost (§5.2). The three endpoints are
  the consumers for source-list validation — tripling endpoints
  does **not** triple resource cost.
- **Scoring.** At era end the link tile scores its owner VP
  equal to the sum of link-point icons on **all three**
  endpoints (§6.1).
- **Era.** Removed at its era's end like any other link of that
  era.

The engine's link data structure therefore stores endpoints as a
set of size 2 or 3, not a fixed pair; no code path may assume
exactly two endpoints when walking connectivity, paying resource,
or scoring.

### 2.7 Link tile

A pawn-coloured marker placed on a line by the Network action
(§5.2). Each seat starts with 14 link tiles in their colour. Once
on a line, a link tile stays there until its era ends (Canal links
scored and removed at Canal-era flip; rail links scored and removed
at Rail-era flip).

### 2.8 Resources: coal, iron, beer

Three resource types flow through the game:

- **Coal cubes** — black markers required by rail links and certain
  industry tiles (§5.1, §5.2, §6.1). Coal originates on Coal Mine
  tiles and in the Coal Market (§2.11).
- **Iron cubes** — orange markers required by Develop and certain
  industry tiles (§5.3, §6.2). Iron originates on Iron Works tiles
  and in the Iron Market (§2.11).
- **Beer barrels** — brown markers required by Sell orders (§5.4)
  and by the second rail in a 2-rail Network action (§5.2). Beer
  originates on Brewery tiles and in the merchant-beer slots
  (§2.5).

Consumed resources disappear from their source and return to a
**general supply** counter.

### 2.9 Industry tile — data and visual contract

An industry tile is a per-seat asset that starts on the mat (§2.12)
and moves to the board via Build (§5.1). This section defines the
tile's **data fields** and the **visual contract** it must honour
in any rendering. How those are actually drawn — using SVG assets,
CSS, canvas, a shader, or any other mechanism — is up to the
platform profile.

#### 2.9.1 Tile fields

Every tile carries these fields:

- **Industry type** — one of six (§2.9.2).
- **Level** (1..N; N varies per industry).
- **Money cost** paid on Build.
- **Coal cost** and **iron cost** consumed on Build.
- **VP** scored when flipped.
- **Income bonus** — progress-track steps added to the owner's
  income when the tile flips.
- **Link points** — VP contributed to each adjacent developed link
  at end-of-era scoring.
- **Beer-to-sell** — barrels consumed per Sell order (Cotton /
  Manufacturer / Pottery only).
- **Canal-only flag** — true → cannot be Built in the Rail era.
- **Rail-only flag** — true → cannot be Built in the Canal era.
  (Brewery level 4 and Pottery level 5 are the two rail-only
  tiles.)
- **Light-bulb flag** — true → cannot be Develop-ed (Pottery I,
  III).
- **Resource capacity** — for Coal Mine / Iron Works / Brewery,
  the cubes / barrels placed on the tile at Build time.
- **Rail-era resource-capacity override** — Breweries hold 2
  barrels in the Rail era instead of 1.

Once placed on the board, the tile also carries: owner seat id,
location name, live resource count, is-flipped flag.

#### 2.9.2 Industries and their icons

There are six industries. Each has a dedicated visual icon:

| Industry     | Icon id               | Visual                          |
|--------------|-----------------------|---------------------------------|
| Coal Mine    | `icon_coal`           | stacked black cubes / chunk     |
| Iron Works   | `icon_iron`           | orange bar / ingot              |
| Brewery      | `icon_beer`           | brown standing barrel           |
| Cotton Mill  | `icon_cotton`         | pale-cream mill silhouette      |
| Manufacturer | `icon_manufacturer`   | dual-icon factory glyph         |
| Pottery      | `icon_pottery`        | amphora / kiln glyph            |

Icon ids are referenced by the rendering layer; the platform profile
specifies the asset format (SVG, PNG, font glyph, etc.) and load path.
All other on-screen glyphs — the resource tokens and every UI badge —
are authored procedurally (§2.9.2.1) rather than as static assets.

##### 2.9.2.1 Procedural glyphs

Each glyph below is a small drawing routine that takes a target
**centre** and **target size** (the edge length of the bounding
square the glyph must fit inside) and paints the glyph to fit. The
routine expresses every internal dimension as a fraction of the
target size, so the same routine renders crisply at any zoom. The
platform profile declares the exact drawing API used (e.g. SVG
paths, Canvas2D commands, CustomPainter calls) but the *contract*
is the same: input centre + size, output a glyph inside that
bounding square.

The glyphs:

- **Coal cube** — a small solid black square. Used as the resource
  token on Coal Mine tiles and as the filled slots in the Coal
  Market column.
- **Iron cube** — a small solid orange square. Same role as coal
  for Iron Works tiles and the Iron Market column.
- **Beer barrel** — a standing brown barrel silhouette with a
  couple of horizontal hoop bands. Used on Brewery tiles and in
  merchant-beer slots.
- **Money coin** — a filled beige disc with an ink outline and a
  numeric value centred inside. Used on cost badges, on the
  income tracker's level badges, and wherever a £ amount needs
  to read as "money".
- **Income arrow** — a beige square with a small upward-pointing
  chevron painted over it. Optional numeric value sits centred
  below the chevron. Used on flipped-tile income bonuses, on the
  stats bar of each Player Board, and as the marker dropped onto
  the income track.
- **VP hex** — a regular hexagon filled in a mauve tint, ink
  outline, numeric VP total centred inside. Used on flipped
  tiles and on the stats bar.
- **Link-point icon** — a regular hexagon filled in **purple**
  with an ink outline. A single **line segment** runs across the
  middle of the hexagon, with a small filled **circle** at each
  of its two endpoints. This is the glyph used everywhere a
  link-point contribution is shown: next to a merchant city
  (§11.2), on the flipped face of an industry tile, and in the
  bonus column of the player mat.
- **Boat** — a small open-cup silhouette painted in the owner's
  pawn colour. Used as the canal-link token on developed lines
  and as the link-supply icon on the Player Board's stats bar
  during the Canal era.
- **Train** — a small locomotive silhouette painted in the
  owner's pawn colour. Used as the rail-link token on developed
  lines and as the link-supply icon on the Player Board's stats
  bar during the Rail era.
- **Light bulb** — a bulb silhouette over a short base. Painted
  as a badge on the two Pottery tiles that cannot be
  Develop-ed.

Every glyph is centred on the `centre` argument and fits entirely
inside the bounding square of side `size`. None overflow their
bounding rect; the caller is free to request any size and trust
the glyph will fit.

#### Hard scalability rule

Every glyph — icon assets plus the procedural glyphs above — must
look crisp at every zoom the game can reach. Practically:

- **Never hard-code absolute dimensions.** All internal
  measurements are fractions of the target size. Whatever unit
  system the platform uses — device pixels, logical points, SVG
  units, CSS pixels — the rule is the same: dimensions are
  relative, not absolute.
- **Never cache a fixed-resolution rasterisation.** Draw on
  demand from vector sources whenever possible. If the platform
  forces a cache (e.g. sprite atlases), the cache must be
  regenerated at the resolution the glyph is currently rendered
  at, not at a single fixed resolution.
- **Never compose glyphs via bitmap overlays.** Every glyph
  renders in vector / code so it stays sharp at 4K and still
  legible at 720p.
- **Stroke widths scale.** Any stroke is `max(1, size * k)` for
  some small `k` (typically 0.06) — scaling linearly with the
  glyph, with a 1-unit floor so very small icons still show a
  visible outline. The "1" here is one unit in whatever coordinate
  system the platform renders in.
- **Text sizes scale.** Any text inside a glyph uses a size
  proportional to the glyph's `size`, never a constant absolute
  value.
- **Hit-rects match painted rects exactly.** A glyph drawn at a
  given `size` exposes a hit-rect equal to that bounding square.
  Clicking the visible rendering always targets the same logical
  object — no invisible padding, no inflated hit zone.

#### 2.9.3 Layout of an industry tile face

Each tile face is a single rectangle with an ink border, painted
in the owner's pawn colour. Every sub-element the tile draws sits
inside a named sub-rectangle of that outer rectangle.
**Sub-rectangles never overlap, and no element ever extends beyond
the tile border.** When the tile shrinks at a lower zoom, every
sub-rectangle scales proportionally — overflow is never a fallback.

A tile has two distinct faces: **unflipped** (the player-facing side
of every fresh build, used both on the mat and on the board until
flip) and **flipped** (the scored / drained side, used only after
the tile has flipped on the board).

##### 2.9.3.a Unflipped face

Tiles sit on the mat with the unflipped face showing, and stay on
the unflipped face when first built onto the board. The four
corners and the centre carry:

- **Top-left (TL)** — the **level** Roman numeral in ink on a
  pawn-colour-tinted background.
- **Top-right (TR)** — the **beer-cost** glyph: a beer-barrel
  icon struck through with a red diagonal line, with the
  required count overlaid when greater than 1. Rendered only
  when `beerToSell > 0` (Cotton / Manufacturer / Pottery).
- **Bottom-left (BL)** — empty.
- **Bottom-right (BR)** — the **no-Develop** glyph: a struck-through
  bulb. Rendered only when `lightBulb === true` (Pottery
  levels 1 and 3 in the published config).
- **Centre** — the **industry icon** (§2.9.2).

The build cost (money / coal / iron), the production cubes /
barrels (for Coal / Iron / Brewery), the link-point count, the
income-bonus arrow, and the VP hex are all rendered **outside**
the tile face — in the mat row's left and right side columns
(§11.3). The tile face itself is reserved for the level, the
industry icon, the beer-cost flag, and the no-Develop flag.

##### 2.9.3.b Flipped face

Used only when a tile has flipped on the board — either by Sell
(Cotton / Manufacturer / Pottery) or by its last resource draining
(Coal Mine / Iron Works / Brewery). The face's top half renders the
owner's pawn colour at full saturation, the bottom half a paler
tint of the same colour, so the badges read against contrasting
fields:

- **TL** — level Roman numeral in light fill.
- **TR** — link-point cluster, one dot per link point.
- **BL** — VP hex with the scored VP.
- **BR** — income-bonus arrow with the step count inside.
- **Centre** — the industry icon.

A flipped tile carries no live resources, so BL is the VP hex (the
slot that carries the production count on the unflipped face).

#### 2.9.4 Bounding rule — restatement

**No element rendered on an industry tile — level badge,
industry icon, resource token, VP hex, income arrow, link-point
icon, beer-cost glyph, or no-Develop glyph — ever extends beyond
the tile's outer rectangle. Sub-rectangles never overlap.**
When the tile shrinks at a lower zoom, every sub-rectangle and
every element inside it shrinks proportionally; when the tile
would shrink below the point where every badge is legible, the
viewport's zoom control (or a maximizable host panel) is the
escape hatch — overflow is never used as a relief valve.

### 2.10 Flipped vs unflipped

Every placed industry tile starts **unflipped**. It flips when:

- A Sell consumes the required beer and flips the tile (Cotton /
  Manufacturer / Pottery only).
- Its last resource is removed (Coal Mine on last cube out; Iron
  Works on last cube out; Brewery on last barrel out).

Only **flipped** tiles score VP at end of era (§6.2). A tile
flipped during the Canal era stays on the board (unless removed by
the Canal-era level-1 cleanup, §6.4) and scores again at end of
Rail era.

### 2.11 Markets

A **market** is a fixed-price table the engine uses for buying and
selling resource cubes. Two exist: the Coal Market and the Iron
Market. Neither stores beer — beer has no market.

#### 2.11.1 Coal Market

- **7 priced tiers** — £1, £2, £3, £4, £5, £6, £7.
- **2 slots per tier**, for 14 possible cubes in the priced range.
- **Overflow tier** at £8 — unlimited supply, buy-only. The widget
  always renders this tier as two cubes to signal "unlimited at
  this price". Sells never land here.
- **Setup fill** — cubes are placed from the most expensive priced
  tier downward, leaving exactly one £1 slot empty. Total at setup: 13
  cubes (in the priced range).
- **Buy** — a player pays the cheapest filled slot's price and
  takes the cube from that slot. When all priced tiers are empty,
  cubes may still be bought at the **overflow price £8** per cube
  (unlimited).
- **Sell** — when a Coal Mine auto-sells cubes on Build (§5.1.1),
  each cube fills the **most expensive empty priced slot first**
  and the owner collects that slot's price. The £8 overflow tier
  is never a sell target; if all priced tiers are full when a
  Coal Mine tries to auto-sell, the surplus cubes stay on the
  tile.
- **Connection requirement for buying.** To buy from the Coal
  Market, the consumer location must be **connected** (via any
  player's links) to at least one merchant city, whether that
  merchant city is active or inert at this player count. This is
  the **only** market-access rule — no such requirement exists for
  iron.

#### 2.11.2 Iron Market

- **5 priced tiers** — £1, £2, £3, £4, £5.
- **2 slots per tier**, for 10 possible cubes in the priced range.
- **Overflow tier** at £6 — unlimited supply, buy-only, rendered
  as two always-present cubes. Sells never land here.
- **Setup fill** — from the most expensive priced tier downward,
  leaving both £1 slots empty. Total at setup: 8 cubes (in the
  priced range, at £2..£5).
- **Buy** — a player pays the cheapest filled slot's price and
  takes the cube from that slot. **No connection requirement** —
  the Iron Market is always reachable regardless of the consumer's
  network or connection. Overflow price £6 per cube when the
  priced range is empty (unlimited).
- **Sell** — when an Iron Works auto-sells cubes on Build
  (§5.1.1), each cube fills the most expensive empty priced slot
  first and the owner collects that slot's price. The £6 overflow
  tier is never a sell target.

The connection distinction — **coal needs a connection to any
merchant city, iron does not** — is the single market rule that
players most often forget. The engine enforces it on every Build
and on every coal-consuming source-list validation.

#### 2.11.3 Market Place widget — what the player sees

Both markets are rendered as one **Market Place** widget that lives
on the Main Board panel (§11.2). The widget surfaces, at a glance,
which individual slots at each tier are filled vs. empty — the
current buy price, sell price, and total cubes are all derivable
from the slot pattern, so the widget shows just the slots and lets
the player read them directly.

The widget's layout:

- Two side-by-side columns, one per market. The column header is
  the **industry icon** (coal-mine icon for the coal market,
  iron-works icon for the iron market) — no text label.
- Each market column is a stack of rows, highest tier at the top.
  The top row is the **overflow tier** (£8 for coal, £6 for iron),
  rendered with two always-present cubes outlined dashed to
  signal unlimited supply at that price. Below it, **one row per
  priced tier**, descending. Each row shows:
  - A small **money-coin glyph** on the left containing the tier
    price (`N` inside the coin, no `£` prefix — the coin shape
    itself is the money sign).
  - Two **square cube slots** on the right. A filled slot
    renders the resource cube glyph (a small square — black for
    coal, orange for iron — matching the cube tokens drawn
    elsewhere on the board); an empty slot renders a faint
    square outline of the same size.
- During a coal-source sub-state (a Build or Network asking the
  player to pick coal) the widget glows warm-gold to mark it as
  a legal click target, and clicking any of its coal cubes is
  interpreted as "buy from the market". Clicking an overflow
  cube buys one at the overflow price.

The widget is the single source of truth for market state on
screen — no panel duplicates the numbers. A player who wants to
double-check price or supply looks here.

### 2.12 Mat

Each seat has a **mat** — a private stack of industry tiles
grouped by industry. Ordered lowest-level-first per industry;
`stack[0]` is the next tile to Build / Develop. A tile leaves the
mat when built (moves to a board slot), developed (returns to the
box), or overbuilt-from-elsewhere (returns to the box).

### 2.13 Cards, hand, discard pile, draw deck, wild reserve

- The **draw deck** is a shared, shuffled stack.
- Each seat has a private **hand** of cards drawn from the deck.
- Each seat has a private **discard pile** of consumed cards.
- Four **Wild Location** and four **Wild Industry** cards live
  face-up in a **wild reserve** outside the deck. When a seat
  consumes a wild card, it returns to the reserve (NOT the
  seat's discard pile).

Card types:

- **Location card** — names one specific district city.
- **Industry card** — names one industry; the dual cotton /
  manufacturer card (3+ players only) names two industries.
- **Wild Location card** — acts as any Location card.
- **Wild Industry card** — acts as any Industry card.

### 2.14 Money

Each seat holds an integer `money`. Money spent on actions leaves
the wallet and is added to `spent_this_round` (§2.15) in the same
operation.

### 2.15 Spent-this-round (turn-order tally)

The digital game tracks the amount of money each seat has spent
this round as a single integer `spent_this_round` on the Player
object. At end of round the seats are sorted by this tally
ascending (least spent goes first next round) and the tally is
reset to 0. There is no physical proxy — no character tile, no
turn-order track — just the integer.

### 2.16 Income step and income level

Each seat has an **income step** on a 0–99 Progress Track. Steps
map to income **levels** non-uniformly (§6.3). "Advance N income
levels" crosses N whole levels regardless of step width; "advance
N spaces" or "advance N steps" moves N raw ladder steps.

### 2.17 VP

Each seat has a VP integer bounded below by 0. VP accrues during
play via merchant bonuses; bulk VP is scored at end-of-era (§6.1,
§6.2).

### 2.18 Network vs connection

- **Your network.** A location is part of your network if it
  holds one of your industry tiles OR if it's adjacent to one of
  your link tiles.
- **Connected.** Two locations are connected if there is a chain
  of link tiles **owned by any player** between them.

Network governs **where you may Build** (plus the first-action
exemption, §5.1). Connection governs **resource reachability**
for coal / iron / beer rules (§5.6) and merchant reach for Sell
(§5.4).

---

## 3. Game initialisation

The engine exposes `setup(player_count, seed)`. Given the same
seed and player count, initialisation is deterministic.

### 3.1 Board initialisation

1. Load city topology from `config/cities.json`.
2. Instantiate merchant cities for every merchant whose
   `activePlayerCounts` includes the current count.
3. Load canal and rail lines from `config/links.json`.
4. Draw the merchant-tile mix from
   `config/cities.json.merchantBag` for the current count,
   shuffle with the seeded RNG, and distribute one tile per
   merchant slot in declaration order. Place 1 beer barrel in
   the adjacent slot of every non-blank merchant tile.
5. Build the Coal Market per §2.11.1.
6. Build the Iron Market per §2.11.2.

### 3.2 Per-seat initialisation

For each seat the engine creates a Player with:

- Unique id and display name.
- £17, VP 0, income step 10 (income level 0), loans_taken 0,
  spent_this_round 0.
- Mat stacks populated from `config/industry_tiles.json`, ordered
  lowest-level-first.
- 14 link tiles in the seat's colour.
- Empty hand, empty discard pile.

**Canal-setup card removal.** Before dealing, `playerCount` cards
are removed face-down from the top of the shuffled draw deck. They
stay out of the game permanently — they are NOT reshuffled into
the rail-era deck at §6.4 step 5. This balances the first-round
one-action rule (§3.4) so the canal-era deck depletes in step
with player hands; without it, the deck would have one extra card
per seat at era end.

Starting hands: 8 cards each from the top of the shuffled draw
deck, kept private.

### 3.3 Turn order

The engine seeds a random permutation of seat ids and stores it
as `turn_order`. `turn_order[0]` acts first.

### 3.4 Era and round

`era = CANAL`, `round = 1`, `phase = PLAYER_TURNS`,
`actions_remaining = 1`. Every subsequent round (and the entire
Rail era) grants 2 actions per seat.

### 3.5 `auto_end_turn` flag

The engine's `auto_end_turn` flag defaults to `true` (so headless
tests can chain dispatches without extra ceremony). The UI should
set it to `false` immediately after `setup()`. With the flag off
the engine does not auto-advance when `actions_remaining` hits 0 —
the UI must call `end_turn(pid)` explicitly.

---

## 4. Game flow

### 4.1 The goal

Highest total VP at the end of the Rail era.

### 4.2 Turn sequence

When `turn_order[current_player_index] == pid` and
`actions_remaining > 0`:

1. The UI marks the seat active; its hand becomes interactive,
   every other hand renders face-down.
2. The Actions panel enables each action whose preconditions are
   met; others grey out with a tooltip explaining why.
3. The player picks a card and an action in either order (§10.6).
4. The wizard gathers remaining inputs in any order.
5. On dispatch the engine either succeeds (state mutates and
   `actions_remaining` decrements) or fails (state unchanged,
   tooltip toast explains).
6. When `actions_remaining == 0`, End Turn becomes available.

### 4.3 End of round

When every seat has finished and End Turn commits the final seat:

1. **Recompute turn order.** Sort seats by `spent_this_round`
   ascending; ties preserve relative order. Reset each seat's
   `spent_this_round` to 0.
2. **Collect income.** Each seat reads income level from the
   Progress Track ladder (§6.3) and gains or pays that many
   pounds. A negative income the seat cannot cover triggers the
   **shortfall sub-flow**: the UI prompts the player to remove
   industry tiles from the board, each yielding half its printed
   build cost (rounded down); when no sellable tiles remain, each
   £1 still owed costs 1 VP (stopping at 0 VP). Income is not
   collected in the final round.
3. **Refill hands** — each seat draws back up to 8. Once the
   deck empties, hands no longer refill — each seat's hand shrinks
   by the number of actions they took that round (2 in standard
   play; 1 in the very first Canal-era round) until it reaches
   zero. Hands are refilled back to 8 at the start of the Rail era
   as part of the era flip (§6.4 step 7).
4. **Check era end.** If every seat ended the round with zero
   cards and the deck is empty, proceed to §6.4 (Canal) or §6.5
   (Rail).

### 4.4 Rounds per era

| Players | Rounds / era | Rounds total |
|---|---|---|
| 2 | 10 | 20 |
| 3 | 9  | 18 |
| 4 | 8  | 16 |

---

## 5. Actions

Every action consumes one card from the active seat. Wild cards
return to the wild reserve; every other card goes to the seat's
discard pile. Money spent is added to `spent_this_round`.

### 5.1 Build

Place an industry tile from the mat onto an empty slot of a city.

**UI flow.** Player picks — in any order — a card, an empty slot
on a city, and an industry on the mat. Once all three are set,
the wizard transitions to coal / iron source sub-states if
required.

**Engine steps on dispatch:**

1. Verify the card authorises the build:
   - *Location / Wild Location* — location must match the card
     (or any for a wild).
   - *Industry / Wild Industry* — industry must match the card
     (or any for a wild); location must be in the player's
     network unless the network is empty (first-build
     exemption).
2. Verify the chosen slot accepts the industry. Enforce
   **specific-before-combo**: if the city has any empty
   specific slot for this industry, a combo slot is rejected.
3. Pop the lowest-level tile of that industry from the mat.
   Reject if the stack is empty, if the tile is canal-only and
   the era is Rail, or if the tile is rail-only and the era is
   Canal.
4. Deduct the money cost. Reject on insufficient funds.
5. Consume coal (§5.6.1) then iron (§5.6.2). Reject on
   reachability or supply failure.
6. Place the tile on the slot. Stamp owner, location, resource
   count (capacity at build time).
7. **Move-to-market** for Coal Mine / Iron Works (§5.1.1).
8. If the tile is now at 0 resources, flip it and advance the
   owner's income by the tile's income bonus.

#### 5.1.1 Coal / Iron move-to-market

- **Coal Mine**: moves cubes only if the build location is
  connected (any player's links) to any merchant city, active or
  inert. Fills the most expensive empty Coal Market slot first;
  owner receives that slot's price per cube.
- **Iron Works**: always moves cubes regardless of connection.
  Same most-expensive-first rule and crediting.
- If every cube moves out, flip the tile now.

#### 5.1.2 Farm-brewery rules

A farm-brewery city (flagged in `config/cities.json`) accepts only
Brewery tiles AND only via Brewery / Wild Industry cards. Location
/ Wild Location cards cannot build a farm brewery.

*Sanity check (subsumed):* "accepts only Brewery tiles" is enforced
by §5.1 step 2 (slot-accept check) because farm-brewery slots are
configured to list only `BREWERY`. The card-type restriction
("only via Brewery / Wild Industry cards") is the independent rule
this section adds.

#### 5.1.3 Overbuild

A Build on an already-occupied slot succeeds only if:

- The incoming tile is a strictly higher level of the same
  industry.
- The existing tile has zero resources.
- The existing owner is the player themselves, OR — only for
  Coal Mine / Iron Works — every cube of that resource is
  globally exhausted (board + market).

The replaced tile returns to the box; the prior owner keeps any
VP already scored from it.

#### 5.1.4 One tile per location (Canal era only)

In the Canal era a player may hold at most **one industry tile
per city**. The Build dispatcher rejects any attempt that would
give the player a second tile at the same location. An overbuild
of the player's OWN tile is a net-zero swap (one tile in, one
out) and is therefore exempt.

This restriction lifts entirely in the Rail era — a player may
own several tiles at the same city.

### 5.2 Network

**UI flow.** Player picks a card and a canal / rail line in any
order. In the Rail era after a successful first-rail dispatch,
the wizard offers a second-rail sub-state.

**Engine steps on dispatch:**

1. Discard the card.
2. Verify the line is undeveloped and of the current era.
3. Verify the line is adjacent to the player's network or the
   network is empty (first-action exemption).
4. Deduct costs:
   - Canal era: £3.
   - Rail era first link: £5 + 1 coal.
   - Rail era second link in the same action: £10 + 1 coal + 1
     beer (beer must come from a brewery, never from a merchant
     beer slot).
5. Consume coal from the declared source list (§5.6.1). The
   line's endpoints are the consumers.
6. Consume beer for the second rail.
7. Place a link tile; decrement the player's link supply.

### 5.3 Develop

Remove 1 or 2 industry tiles from the mat, paying 1 iron per
removal.

**UI flow.** Player picks — in any order — a card and 1 or 2
industries from the mat. Auto-submits when both the card and a
second industry are picked; "End Action" finalises with the card
and just 1 industry.

**Engine steps on dispatch:**

1. Discard the card.
2. For each picked industry, reject if the top tile has the
   light-bulb flag or the stack is empty.
3. Consume 1 iron per removed tile (§5.6.2).
4. Pop the tiles to the box.

### 5.4 Sell

Flip any number of own built Cotton / Manufacturer / Pottery
tiles, paying beer per tile.

**UI flow.** Player picks — in any order — a card and any number
of their own built tiles. Per tile, the wizard prompts a merchant
pick if multiple merchants accept, and a beer-source pick if
ambiguous. "End Action" dispatches the accumulated orders.

**Engine steps on dispatch:**

1. Discard the card.
2. For each order:
   - Verify the tile belongs to the player, is unflipped, and is
     a Cotton / Manufacturer / Pottery at the stated location.
   - Each order names a specific **buying merchant tile** —
     identified by (merchant city, merchant slot). The chosen
     merchant tile must be non-blank, must accept the industry,
     and the tile being sold must be connected to the merchant
     city (any player's links).
   - Consume `beer_to_sell` barrels from the declared source
     list. Each barrel may come from a different source, but
     **merchant beer can ONLY come from the buying merchant
     tile's own beer slot** (§5.6.3 priority 3). Beer from any
     other merchant tile — whether in a different merchant city
     or a different slot within the same merchant city — is not
     a legal source for this sale.
   - Flip the tile; advance the player's income by the tile's
     income bonus.
   - If the buying merchant tile's beer was consumed, fire that
     merchant city's §5.4.1 bonus once. (The bonus is *per beer
     consumed*, and since each merchant tile holds at most one
     barrel, the bonus fires at most once per order — even if
     `beer_to_sell` is 2 or more.)
3. If any Gloucester merchant beers were consumed, queue one
   pending develop per beer; the UI drops into a follow-up
   sub-state that lets the player remove lowest-level tiles at
   no iron cost, one per queued develop.

#### 5.4.1 Merchant bonuses

- **Shrewsbury (VP 4)** — add 4 VP.
- **Nottingham (VP 3)** — add 3 VP.
- **Oxford (INCOME 2)** — advance income 2 progress-track
  spaces (spaces, not levels).
- **Gloucester (DEVELOP 1)** — queue a follow-up Develop-like
  removal with no iron cost.
- **Warrington (MONEY 5)** — add £5.

### 5.5 Loan

Take £30 at the cost of 3 income levels.

**Engine steps on dispatch:**

1. Discard the card.
2. Reject if the loan would drop income below level −10.
3. Add £30.
4. Move the income marker back by 3 income levels (not steps),
   landing on the highest step of the lower level reached.
5. Increment `loans_taken`.

### 5.6 Resource consumption

The engine is the sole validator of resource sources. Sources are
consumed in the priority order below; if the declared list doesn't
satisfy the requirement, the dispatch fails.

#### 5.6.1 Coal

1. **Closest unflipped Coal Mine** (any owner). Ties: player
   picks. Free.
2. **Coal Market** — only if the consumer is connected (any
   player's links) to any merchant city (active or inert).
   Cheapest empty slot first. Overflow £8 when empty.
3. No other source; action illegal without (1) or (2).
   *Sanity check (subsumed by 1 + 2):* steps 1 and 2 already
   enumerate the only legal sources; step 3 is a clarification,
   not an independent rule to implement.

The connection requirement for Coal Market access is the one
rule players most commonly miss; the engine enforces it on every
coal-consuming dispatch.

#### 5.6.2 Iron

1. **Any unflipped Iron Works**, regardless of connection.
   Ties: player picks. Free.
2. **Iron Market** — **no connection requirement**. Cheapest
   empty slot first. Overflow £6 when empty.

#### 5.6.3 Beer

Per barrel:

1. **Own unflipped Brewery** — no connection required.
2. **Opponent's unflipped Brewery** — must be connected to the
   consumer.
3. **Merchant beer** — Sell action only, never Network (even the
   second-rail beer of a 2-rail Network action may not come from a
   merchant beer slot). Within a Sell order, a merchant beer may
   come only from the buying merchant tile's own beer slot — see
   §5.4 step 2. Consuming it fires that merchant city's bonus.

### 5.7 Scout

Discard 3 non-wild cards for 1 Wild Location + 1 Wild Industry.

**UI flow.** Player picks 3 distinct non-wild cards from the hand
in any order. "End Action" dispatches once 3 are selected; an
explicit submit is required because picks are toggleable up to
the third.

**Engine steps on dispatch:**

1. Reject if the player holds any Wild card in hand.
2. Reject if any of the 3 selected cards is a wild or a duplicate
   index.
   *Sanity check (partially subsumed by step 1):* the "is a wild"
   clause follows from step 1 — a hand with no wilds can't yield a
   wild-valued index. Only the "duplicate index" clause is an
   independent rule.
3. Discard the 3 cards.
4. Transfer 1 Wild Location and 1 Wild Industry from the wild
   reserve into the player's hand.

### 5.8 Pass

Discard one card; no other effect. The player may Pass on
subsequent actions in the same turn.

---

## 6. Scoring and end-of-era

### 6.1 Link tile scoring

At end of each era every link tile on the board scores its owner
VP equal to the sum of link-point icons on the locations the link
is adjacent to. A 2-city link scores from both endpoints; a
triple link scores from all three endpoints.

**Merchant cities always contribute exactly 2 link points**,
regardless of player count and whether the city is active or
inert (§2.4). A link adjacent to a merchant city therefore always
scores at least 2 VP from that endpoint, added to whatever the
link's other endpoint(s) contribute.

A district city's link-point contribution is the sum of link
points on its **flipped** industry tiles — so district cities
start at 0 and grow as tiles flip during play.

### 6.2 Flipped industry tile scoring

Every flipped industry tile on the board scores its owner VP
equal to the value printed on the tile. Unflipped tiles score
nothing. Canal-flipped tiles still on the board at Rail-era end
score again.

### 6.3 Income ladder

The Progress Track has 99 steps grouped non-uniformly:

| Steps  | Level range | Steps per level |
|--------|-------------|-----------------|
| 0–10   | −10 … 0     | 1               |
| 11–30  | 1 … 10      | 2               |
| 31–60  | 11 … 20     | 3               |
| 61–99  | 21 … 30     | 4               |

Capped at level 30 above and −10 below.

### 6.4 End of Canal era

Triggered after the round in which every hand reaches zero AND
the draw deck is empty:

1. Score link tiles per §6.1. Remove each as it scores.
2. Score flipped industry tiles per §6.2. Leave them on the
   board.
3. Remove every level-1 industry tile from the board. Level-2
   and higher remain. Tiles on mats are unaffected. Unflipped
   Pottery I has no canal-only flag and stays.
4. Refill merchant beer — 1 fresh barrel in every merchant-tile
   beer slot next to a non-blank merchant tile.
5. Reshuffle the deck — combine all discard piles with the draw
   deck, shuffle, place as new draw deck.
6. `era = RAIL`.
7. Refill each seat's hand back to 8 cards from the new draw
   deck before Rail-era play resumes.

### 6.5 End of Rail era

Triggered after the round in which every hand reaches zero in
the Rail era:

1. Score link tiles per §6.1.
2. Score flipped industry tiles per §6.2.
3. `phase = GAME_OVER`.

### 6.6 Tie-breaking

When two or more seats tie for highest VP:

1. **Highest income level** wins.
2. If still tied, **most money remaining** wins.
3. If still tied, the tied players share victory (a draw).

---

## 7. Canonical reminders

**Most of this section is sanity-check restatement of rules that
live authoritatively in §3–§6.** The implementation should follow
the referenced section; these bullets exist so reviewers can scan
the often-forgotten rules in one place. Each bullet below is
tagged with its owning section, or explicitly marked when it is an
independent rule that appears *only* here.

- Discard exactly 1 card per action, including Pass. *(Restates
  the preamble of §5 and each per-action step 1.)*
- Each action may be performed twice in a turn. *(Restates §3.4 /
  §3.5 turn structure.)*
- Canal era: 1 tile per location per player. *(Restates §5.1.4.)*
- Overbuild your own tiles freely (subject to "no resources on
  the old tile"); overbuild opponents' only for Coal Mine / Iron
  Works when that resource is globally exhausted. *(Restates
  §5.1.3.)*
- Must be connected to a merchant tile (not an inert merchant
  city) to Sell. *(Restates §5.4 step 2.)*
- **Coal Market buying needs connection to ANY merchant city.
  Iron Market buying has no such requirement.** *(Restates
  §5.6.1 step 2 and §5.6.2 step 2.)*
- No connection required for your own Brewery's beer. *(Restates
  §5.6.3 priority 1.)*
- Merchant beer is consumable only during Sell. *(Restates
  §5.6.3 priority 3.)*
- A location must be in your network to Build, unless the card
  is a specific Location or Wild Location card. *(Restates §5.1
  step 1.)*
- Pottery level-1 has no canal-only flag: buildable in either
  era. *(Data-driven — the authority is `config/industry_tiles.json`.)*
- The first Build / Network of the game is exempt from the
  network requirement. *(Vacuous case of §5.1 step 1 and §5.2
  step 3: when the player's network is empty, the adjacency
  check has nothing to compare against.)*

---

## 8. Domain model

The developer should design a domain model that represents every
entity defined in §2 as runtime objects owned by the engine. The
model is **not prescribed** here — pick class/type names and
method signatures that best fit the chosen language and idioms.
The constraints:

- The engine code imports nothing from the UI or networking
  layers. It is unit-testable headless.
- Every action entry point must return a result value (an enum /
  tagged union / result type — platform profile picks the idiom)
  rather than raising an exception, so the UI can present the
  result directly.
- State is rooted at a single `GameState` object so save/load and
  deterministic replay (Undo, §10.7) are trivial.
- Every entity in §2 maps one-to-one to a concept in the model.
- The config schemas in §9 are the authority on what the model
  needs to represent.

---

## 9. Config files

Tunable data lives in `config/`. Code ships defaults that mirror
the configs, so the game boots even if a file is missing. JSON
files use a `"_comment"` string key for free-form notes.

- **`config/ui.json`** — font sizes, paddings, palette, default
  panel heading alignment, maximize-button glyph.
- **`config/layout.json`** — panel grid: columns / rows and their
  weights, per-panel placement and orientation. Written live by
  the in-game layout editor (§10.8).
- **`config/industry_tiles.json`** — one entry per tile in a
  `tiles` array, ordered industry-then-level-ascending. Each entry
  carries: industry, level, qty (mat-stack count), money cost,
  coal cost, iron cost, VP, income bonus, link points,
  beer-to-sell, canal-only flag, rail-only flag, light-bulb flag,
  resource capacity, and an optional rail-era resource-capacity
  override (`null` when none).
- **`config/cities.json`** — district and merchant city
  definitions: name, district tag, position, slot list,
  farm-brewery flag, activePlayerCounts (merchants only),
  merchantBag (per player count). Also persists live board
  positions edited in the board editor (§10.8).
- **`config/cards.json`** — deck composition per player count
  (location counts, industry counts, dual cotton/manufacturer
  count, wilds, starting hand size).
- **`config/links.json`** — canal and rail line endpoint lists.
  Two top-level arrays, `canal` and `rail`. Each entry is an
  array of endpoint city names: length 2 for a normal line,
  length 3 for a **triple link** (§2.6.1). Canal era plays
  `canal` only; rail era plays `rail` only. The loader must not
  assume length 2.

---

## 10. UI framework

The UI is organised as a collection of **panels** (§11). A panel is
a bounded, rectangular region of the screen that owns one coherent
chunk of content (e.g. the board, the hand, the action buttons).
Every panel:

- Declares a **minimum size** but never a fixed outer size — panels
  reflow with the viewport.
- **Clips its content** to its own bounds; nothing inside a panel
  overflows.
- Has a **title strip**, optional **maximize chevron**, and uses the
  game's shared visual style (font, palette, spacing) from
  `config/ui.json`.
- Is placed via `config/layout.json` — a grid-like layout whose
  cells hold named panel ids.
- Resolves click / pointer events against **hit-rects that match
  painted rects exactly** (§2.9.2.1 restates this for glyphs; the
  same discipline applies to panels and their interactive
  children).

The shared panel framework is described in full in the platform
profile's panel-system reference. This document names the panels
and specifies their contents and functionality (§11); the platform
profile specifies *how* panels are realised (which widget base
class, how the layout grid is implemented, how chrome is drawn,
etc.). Only the game-specific pins below belong in this spec:

- The panel ids listed in §11 are authoritative. Each id in
  `config/layout.json` must match one of them.
- The **Actions** panel is always emphasised (accent-gold outline)
  while the game is in IDLE. Nothing else on screen tells the
  player where to start their turn, so the emphasis is load-bearing.
- The **Players** panel is a single top-level panel that hosts
  one **sub-panel per seat**. Each per-seat sub-panel paints its
  border in the seat's pawn colour instead of the neutral ink —
  this is the one game-specific chrome override.

### 10.1 UI flow — the order things happen

The ground state is **IDLE**: no action in progress; the Actions
panel is emphasised; nothing on the board is highlighted.

From IDLE:

- Clicking a **card** stashes it; the player then picks an action.
- Clicking an **action button** starts its wizard; the player then
  picks a card from the Hand panel.

Inside a wizard:

- Inputs are picked in **any order** — including the card.
  Wizards never force a card-first ordering; the player may click
  a slot, an industry, a tile, a line, or a card first, and the
  wizard accepts it.
- **Unique-cardinality inputs** (one card per Build / Develop /
  Sell / Network / Loan / Pass; one slot per Build; one line per
  Network) **replace** on a second click.
- **Variable-cardinality inputs** (Develop's 1–2 industries,
  Sell's tile orders, Scout's 3 cards) accumulate on each click up
  to the action's cap; the player clears via Reset Selection.
  Same-target re-click behaviour depends on whether duplicates are
  semantically meaningful:
  - **Repeatable targets** (Develop industries — 2 of the same
    industry pops 2 tiles from one stack, §5.3). A second click
    ADDS another instance.
  - **Distinct-id targets** (Sell tile orders, Scout cards — each
    target is a unique id and "selling the same tile twice" or
    "discarding the same card twice" is meaningless). A second
    click TOGGLES the prior pick off, so the player can deselect
    without clearing the whole wizard.
- Auto-submit fires once every required input is set AND every
  variable-arity input is at its cap. End Action submits when
  required inputs are set even if a variable input hasn't hit its
  cap (e.g. Develop with 1 industry, Sell with 1+ orders).
- Structurally-invalid clicks (occupied slot during Build,
  merchant city during a non-Sell action) are rejected with a
  reason toast.
- Structurally-valid clicks are always accepted; the engine
  toasts the final-combination reason when the dispatch fails.

Once card + primary inputs are set, the wizard transitions to its
resource-picker sub-state(s) (coal / iron / beer). When no source
is required, the wizard dispatches immediately.

**Second-rail offer.** After a Rail-era Network succeeds with one
link, the wizard offers the second.

**Gloucester follow-up.** If Sell consumed one or more Gloucester
beers, the UI prompts a develop-like removal per beer, or Skip.

### 10.2 Undo, Reset, End Action, End Turn

- **Undo** rolls back the most recent successful dispatch by
  replaying history from the original seed minus the last entry.
- **Reset Selection** clears all picks from the current wizard
  (card included) but stays in the same action.
- **End Action** is the wizard explicit-submit, used by actions
  whose input count is not fixed (Develop 1 tile; Sell any number
  of orders).
- **End Turn** commits: validates actions_remaining == 0 and no
  pending merchant bonuses; advances to the next seat. On success,
  the undo history clears — nothing from the committed turn can be
  rolled back later.

### 10.3 In-game editing

Two editors the game should provide (the platform profile picks
the entry gesture and input idioms):

- **Board editor** — reposition district / merchant / marketplace
  and edit slot definitions; writes through to
  `config/cities.json`.
- **Layout editor** — rearrange / resize / reorient panels; writes
  to `config/layout.json`.

---

## 11. Panels — Brass Birmingham inventory

The game ships the panels below. For each, **Contents** describes
what the panel paints; **Functionality** describes what the player
can do with it. Everything about chrome, maximize / collapse /
focus, hit-rects, and motion is inherited from the shared panel
framework (see the platform profile's panel-system reference);
these entries describe only the Brass-Birmingham-specific content.

Registered panel ids (must match entries in `config/layout.json`):
`income`, `board`, `players` (one top-level panel containing one
sub-panel per seat — `player_1`, `player_2`, `player_3`,
`player_4`), `game_state`, `player_state`, `remaining_cards`,
`hand`, `actions`, `recent_actions`.

### 11.1 Income Tracker — id "income"

**Contents.** A vertical ladder of rows. Each row is one income
step, or a short run of steps comprising one income level (see
§6.3). Every row shows a level badge (round beige disc with
the level number, drawn only on the first row of a level that
spans several) and one or more step cells (dark rectangles with
the raw step number in beige). Each seat's pawn-coloured income
marker sits in the cell for its current step; two or more markers
in the same cell tile in a 2x2 grid so they never overlap. Level
30 at the top, level −10 at the bottom.

**Functionality.** Purely informational. Re-renders on every state
change so loans, flips, and merchant bonuses visibly move the
markers.

### 11.2 Main Board — id "board"

**Contents.**

- **District cities**, each as a rectangle at its configured
  position with the city name in district colour. The city body
  is **sized to its slot count** rather than padded to a fixed
  square — a 1-slot city (the two Farm Breweries) is a single
  TILE × TILE square, a 2-slot city is a 2×1 rectangle
  (2*TILE × TILE), and 3- or 4-slot cities are 2×2 squares
  (2*TILE × 2*TILE). 3-slot cities use the top row for slots 0
  and 1 and centre slot 2 in the bottom row. Empty slots show
  their accept-list icons; placed tiles render per §2.9.3.
- **Merchant cities** on the board edges. **All five merchant
  cities** (Shrewsbury, Nottingham, Gloucester, Oxford,
  Warrington) render regardless of player count — only the slot
  *fill* depends on whether the city is active for that count.
  Each city renders as a cluster of **D-shaped slots** — one D
  per `slotCount` (1 for Shrewsbury, 2 for the other four),
  sized like a district-city slot (TILE wide). The D is a square
  top with a rounded bottom edge. For an **active slot** (the
  city is in `activePlayerCounts` and a merchant tile was
  drawn into the slot), the D shows the **accept-list icon** —
  industry icon when the slot accepts a specific industry, an
  "ANY" glyph when wildcard, and an empty D when the bag drew
  a `BLANK` tile. Below each active D a small square holds the
  **beer indicator** (beer-barrel icon when the slot still has
  its beer, empty outline when consumed). For an **inactive
  city** at this player count (Nottingham at 2 players,
  Warrington at 2 / 3 players), the D-slots render empty (no
  accept icon, same opacity as active D-slots), and there is
  no beer indicator. Above the cluster sits the city name and a
  **bonus badge** that uses the bonus's own icon — VP hex for
  `bonus = "VP"`, money coin for `"MONEY"`, income arrow for
  `"INCOME"`, light-bulb for `"DEVELOP"` — with its
  `bonusValue` overlaid. The fixed 2-link-point contribution
  (§6.1) is implied by the merchant city's presence and is
  not rendered separately on the slot.
- **Canal and rail lines** — canal muted-blue during Canal era,
  hidden in Rail era; rail dim during Canal era, full-opacity in
  Rail era. Triple links show a centroid junction dot. Developed
  links display an owner-coloured boat or train token at the
  line midpoint. During a Network wizard, every undeveloped
  current-era line displays its base cost label above it.
- **Coal + Iron Market Place widget** — see §2.11.3 for
  the full spec. Header strip shows the live Buy price / Sell
  price / cube count per market; two columns of price tiers
  below with filled / empty slots **rendered as small squares**
  (cube glyphs) — black for coal, orange for iron — matching
  the resource tokens drawn elsewhere on the board.

**Functionality.**

- City slots, merchant-city Ds, canal / rail lines, and resource
  tokens (coal cube, iron cube, beer barrel, merchant beer) are
  all click targets routed to the current wizard sub-state.
- Maximize chevron expands to full-viewport.
- The board editor repositions cities / merchants / marketplace
  on drag and edits slot accept-lists on a secondary gesture
  (right-click, long-press, or whatever the platform profile
  designates).

### 11.3 Players — id "players" (one panel, one sub-panel per seat)

A single top-level panel that hosts a horizontal (or grid) split
with one sub-panel per seat. Each sub-panel is itself a full panel
with its own title, chrome, and maximise chevron. The outer
`players` panel's title strip reads "Players"; its own chrome is
neutral. All game-specific detail below describes **each per-seat
sub-panel**.

**Per-seat sub-panel ids.** `player_1`, `player_2`, `player_3`,
`player_4` (only the sub-panels for seated players render; empties
collapse).

**Contents (per seat).**

- Title strip = seat name + " turn-marker" when active. The
  sub-panel's outer border is painted in the seat pawn colour
  (the one chrome exception this game takes — applied at the
  sub-panel level, not the outer `players` panel).
- **Stats bar** below the title, left-to-right: money coin with
  £N, income arrow with level, VP hex with total, link-supply
  icon (boat in Canal era, train in Rail era, in pawn colour)
  with "x N" remaining link tiles.
- **Mat grid** — six industry groups (Coal, Iron, Brewery, Cotton
  Mill, Manufacturer, Pottery) laid out as columns. Manufacturer
  spans two columns (levels 1–5 in the left, 6–8 in the right);
  every other industry is a single column. Each industry column
  has one row per level (top row = lowest level = next to build).
- **Per-level row** — three sub-cells, packed tight with one
  column of space on each side of the tile and no extra padding
  anywhere else:
  - **Left column — cost icons.** A money coin with `£N` overlaid,
    then a coal-cube badge with the coal cost (only when
    `coalCost > 0`), then an iron-cube badge with the iron cost
    (only when `ironCost > 0`). Each icon is the same square
    size; cells with zero cost drop out entirely.
  - **Tile face** in the centre — the unflipped face per
    §2.9.3.a, painted in the seat's pawn colour. Tile size is
    the global TILE constant, identical to board-side tiles.
  - **Right column — bonus / production icons.** Contents differ
    by industry:
    - **Coal Mine / Iron Works / Brewery** — the resource cubes
      this tile will produce (or, on the board, the live count
      remaining). Cubes pack **column-major from the bottom-right
      corner**, growing **upward to a maximum of 2 rows** before
      starting a new column to the left. A coal mine showing 5
      cubes therefore renders as three columns: rightmost full
      (2 cubes), middle full (2 cubes), leftmost partial (1 cube).
      Coal renders as a black square cube; iron as an orange
      square cube; brewery as a beer-barrel ellipse.
    - **Cotton Mill / Manufacturer / Pottery** — bonus icons
      stacked vertically:
      - **Top** — the VP hex with the level's VP value inside.
      - **Middle** — the income-bonus arrow with its step count.
      - **Bottom** — a cascading link-point cluster (one icon
        per link point, 0 / 1 / 2 in the published config).
      Cells whose value is 0 drop out of the stack entirely.
  - **Count** — `×N` showing how many copies of this level
    remain in the seat's stack, rendered as a small text inside
    or alongside the right column. When the wizard has reserved
    one or more picks at this level the badge reads `×P/N`.
- The lowest level still in the stack — the engine's `stack[0]`,
  the next tile a Build or Develop will consume — is the click
  target for the active pick. It is the only row with a
  thicker outer border. Other rows are display-only. Spent
  levels (`count === 0`) render muted at 35 % opacity.

**Functionality (per seat).** Clicking a mat tile during Build
selects that industry. Clicking a mat tile during Develop toggles
selection; the wizard auto-submits at 2 picks. The sub-panel's
maximize chevron expands it to the full viewport for close reading
(not just within the `players` panel). Stats bar purely
informational.

### 11.4 Game state — id "game_state"

**Contents.** A short list of read-only rows — Era (bold), Round N,
Phase label, "Turn: NAME" with name in pawn colour, Actions left,
cards still in draw deck.

**Functionality.** Purely informational.

### 11.5 Player state — id "player_state"

**Contents.** Header row + one data row per seat in current turn
order (first-to-act at the top; active seat tinted warm gold).
Columns: pawn-colour swatch, name, money, VP, income step, income
level, spent_this_round (the integer that sorts next round turn
order, §2.15), turn ordinal ("1st" / "2nd" / "3rd" / "4th"
with an arrow glyph after the active seat).

**Functionality.** Purely informational.

### 11.6 Remaining cards — id "remaining_cards"

**Contents.** Title strip with a right-edge summary "N/total" ratio.
Two columns of deck entries in the smallest body font. Entries
grouped: location cards by district (purple, brown, red, blue, teal
— alphabetical within each), then industry cards (Coal, Iron,
Cotton, Manuf, Cotton/Manuf dual, Pottery, Brewery), then wild
cards when any are in circulation. Entries with 0 remaining render
muted but stay listed.

**Functionality.** Purely informational. Maximize chevron expands
for close reading.

### 11.7 Hand — id "hand"

**Contents.** Title strip "Hand — NAME". A 2x4 grid of card slots.
Each card face: Location card → city name in district colour
(shrunk or wrapped to fit); Industry card → industry icon
(dual card stacks two); Wild → beige disc with "WL" or "WI".
Picked cards render with a warm-gold border. Non-active seats
render a single face-down back with "x N" count.

**Functionality.** Clicking a card selects it for the current
wizard (or stashes it in IDLE). Clicking a different card swaps
the selection; clicking an already-picked card is a no-op.

### 11.8 Actions — id "actions"

**Contents.** Title strip "Actions" (panel outlined warm-gold when
IDLE). Action-verb buttons: Build, Network, Develop, Sell, Loan,
Scout, Pass — greyed with a tooltip when unavailable (e.g. "Out of
link tiles", "No cards in hand"). Wizard-control row: Reset
Selection, End Action, Undo, End Turn. The verb active in the
current wizard renders with a warm-gold tint.

**Functionality.** Verb buttons open their wizard (carrying over
any stashed card). Reset Selection clears picks and stays in the
same mode. End Action dispatches the current wizard. Undo replays
history minus the last entry. End Turn commits and advances the
seat.

### 11.9 Recent actions — id "recent_actions"

**Contents.** Title strip "Recent actions". A scrollable list of
formatted log lines, newest at top, colour-coded — round banners
in warm gold, era banners in the era accent, player names in pawn
colour, city / industry / card references in their scheme colours.
Up to 100 entries retained.

**Functionality.** Scrollbar when the list overflows. Read-only.

### 11.10 Affordances (no panel chrome)

- **Prompt** — single line of text above the main board describing
  the active wizard expected next click.
- **Context bar** — transient strip of buttons populated by the
  current sub-state (resource pickers, second-rail offer,
  Gloucester follow-up, pick-list summary).
- **Toast** — ephemeral centred label shown for ~2 seconds on
  success or failure.

### 11.11 Overlays

- **Era banner** on era flip, ~1.5 s.
- **Round banner** on round transition, ~1.5 s.
- **End-game screen** on phase = GAME_OVER. Lists each seat with
  final VP, income level, money, tie-break reason; announces the
  winner (or draw); Close button.
- **Maximized panel** — any panel with a chevron expands and
  floats above everything until toggled back.

### 11.12 City slot editor (board-editor overlay)

When the player invokes the board editor slot-edit gesture on a
non-merchant city, a pop-up appears next to that city.

**Contents.** Title "Edit spaces: CITYNAME". One row per slot with a
"#N" index label, industry toggles (Coa / Iro / Bre / Cot / Man /
Pot), an "Any" toggle (wildcard), and a "x" delete button. "+ Add
space (wildcard)" button at the bottom; "Close" next to it.

**Functionality.** Toggles mutate the slot accept list live; "+ Add"
appends a wildcard slot; "x" removes the slot. Every change saves
to `config/cities.json`. Close dismisses; edits stay.

---

## 12. Build order

A suggested order to bring the game up end-to-end. The platform
profile may slot its own platform-specific steps around these
(e.g. "set up project skeleton" first), but the rules-and-UI
sequence below is the same everywhere.

1. **Visual asset set** — icons from §2.9.2 and the procedural
   glyphs from §2.9.2.1, in whatever format the platform profile
   prescribes.
2. **Pure rules engine** — every entity in §2, every action in
   §5, every resource rule in §5.6, every scoring rule in §6.
   Fully unit-tested headless before any UI work begins.
3. **Board renderer** — draws cities + lines + merchants +
   resource tokens with hit-rects matching paint.
4. **Panel framework** wiring — load `config/ui.json` and
   `config/layout.json` at startup; lay out the named panels.
5. **Each panel** (§11).
6. **Wizards** — one per verb. Order-free picks;
   resource-picker sub-states; engine-result-driven toasts.
7. **End Turn and Undo.**
8. **Board editor + layout editor** (§10.3).
9. **Networking** — host/client + intent transport. Optional;
   single-player / hot-seat ships without it.

---

## 13. Verification checklist

### Rules

- [ ] Every engine test passes; coverage spans every action
      path, every edge case, every merchant bonus, era
      transitions, overbuild, shortfall.
- [ ] Turn order reorders by previous-round `spent_this_round`;
      ties preserve order.
- [ ] Rounds per era: 8 / 9 / 10 at 4 / 3 / 2 players.
- [ ] First round of Canal Era gives each seat only 1 action;
      every other turn gives 2.
- [ ] Income level −10 is a hard floor; loans at this level are
      rejected.
- [ ] Income level 30 is a hard ceiling.
- [ ] Coal Market requires connection to any merchant city;
      Iron Market does not.
- [ ] Own-brewery beer needs no connection; opponent-brewery
      beer does.
- [ ] Merchant beer is usable only during Sell; bonus fires once
      per beer consumed.
- [ ] Overbuild: own tiles any industry; opponents' only Coal
      Mine / Iron Works when that resource is globally
      exhausted.
- [ ] Canal Era: 1 tile per location per player.
- [ ] End of Canal Era: score links, score flipped tiles,
      remove level-1 tiles, reset merchant beer, reshuffle.
- [ ] End of Rail Era: score; tie-break by income → money →
      shared draw.

### UI

- [ ] No hard-coded viewport anywhere. Resize the window —
      panels reflow.
- [ ] No panel sets its outer size; every panel declares only
      a minimum size.
- [ ] Every panel clips its content; no sub-element overflows
      its bounding rect.
- [ ] Regions inside a panel do not overlap. Only documented
      overlaps exist.
- [ ] Every industry tile draws within its outer rectangle; no
      badge, icon, or resource token overhangs.
- [ ] Every maximize button appears only on maximizable panels.
- [ ] Heading alignment default is `left`; per-panel overrides
      are honoured.
- [ ] All text draws pass a max-width.
- [ ] Card text auto-shrinks or wraps to fit.
- [ ] Hit-rects match painted rects exactly.
- [ ] Card-first and action-first flows both work.
- [ ] Reset Selection clears every pick (including the card).
- [ ] End Action submits Develop (1 tile) and Sell (any number
      of orders).
- [ ] Undo cannot cross a completed End Turn.
- [ ] Board editor persists positions + slot edits back to
      `config/cities.json`.
- [ ] Layout editor persists panel placement, size, and
      orientation back to `config/layout.json`.
