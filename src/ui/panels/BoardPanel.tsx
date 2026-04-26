// =============================================================================
// §11.2 Main Board — read-only render at this milestone.
//
// Renders the 900x900 board as an SVG with viewBox so the whole canvas
// scales into the panel. Layers (back to front):
//
//   1. Lines           — canal (blue) prominent in CANAL era, rail
//                        (brown) prominent in RAIL era. Triple links
//                        connect every endpoint to the centroid.
//   2. District cities — labelled rectangles with one cell per slot
//                        showing the slot's accept-list as compact
//                        glyphs (industry initials).
//   3. Farm Brewery    — same shape as district cities, taupe colour.
//   4. Merchant cities — D shapes pinned to the canvas edge nearest
//                        their position; bonus badge + slot count
//                        underneath.
//   5. Built tiles     — small overlay boxes anchored to the slot;
//                        flipped tiles render with a strike-through.
//   6. Markets widget  — bottom-right corner; live cube counts +
//                        next buy price for coal and iron.
//
// Click handlers / wizard wiring deferred — this milestone is purely
// informational so players can SEE the board while the existing
// card-only wizards run.
// =============================================================================

import { useMemo } from "react";
import type {
  DistrictCity,
  Era,
  IndustryName,
  IndustryTileSpec,
  Line,
  Market,
  MerchantCity,
  MerchantTileAccept,
  PlacedIndustryTile,
} from "../../engine";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { BeerIcon } from "../icons/BeerIcon";
import { CoalIcon } from "../icons/CoalIcon";
import { DevelopIcon } from "../icons/DevelopIcon";
import { IncomeGainedIcon } from "../icons/IncomeGainedIcon";
import { IronIcon } from "../icons/IronIcon";
import { LinkTileIcon } from "../icons/LinkTileIcon";
import { MoneyCoin } from "../icons/MoneyCoin";
import { VictoryPointsIcon } from "../icons/VictoryPointsIcon";
import { DISTRICT_FILL, INDUSTRY_ICON } from "../industryIcons";
import { Panel } from "../layout/Panel";
import {
  LINK_TILE_HEIGHT,
  LINK_TILE_WIDTH,
  TILE,
  TileFace,
} from "../tiles/TileFace";
import { useWizard } from "../wizards/WizardProvider";

const CANVAS = 900;
// City bounding box scales to the slot count rather than padding to a
// fixed square (§ user-spec / §11.2):
//   1 slot  → 1×1 (TILE × TILE)            — Farm Brewery
//   2 slots → 2×1 (2*TILE × TILE)          — most district cities
//   3 slots → 2×2 (2*TILE × 2*TILE)        — top row × 2 + centred bottom
//   4 slots → 2×2 (2*TILE × 2*TILE)
export function cityBodyDims(slotCount: number): readonly [number, number] {
  if (slotCount <= 1) return [TILE, TILE];
  if (slotCount === 2) return [TILE * 2, TILE];
  return [TILE * 2, TILE * 2];
}

/** Top-left of slot cell within the city body returned by cityBodyDims. */
function slotCellPos(
  slotIndex: number,
  slotCount: number,
): readonly [number, number] {
  if (slotCount <= 1) {
    return [0, 0];
  }
  if (slotCount === 2) {
    return slotIndex === 0 ? [0, 0] : [TILE, 0];
  }
  if (slotCount === 3) {
    if (slotIndex === 0) return [0, 0];
    if (slotIndex === 1) return [TILE, 0];
    return [TILE / 2, TILE];
  }
  // 4 or more — fill 2x2 grid; extras (rare) wrap into the same grid.
  const col = slotIndex % 2;
  const row = Math.floor(slotIndex / 2) % 2;
  return [col * TILE, row * TILE];
}

export function BoardPanel() {
  const wizard = useWizard();
  const view = useGameState((s) => ({
    era: s.era,
    round: s.round,
    playerCount: s.playerCount,
    turnOrder: s.turnOrder,
    currentPlayerIndex: s.currentPlayerIndex,
    districtCities: s.districtCities,
    merchantCities: s.merchantCities,
    lines: s.lines,
    builtTiles: s.builtTiles,
    developedLinks: s.developedLinks,
    merchantSlots: s.merchantSlots,
    tileCatalogue: s.tileCatalogue,
    coalMarket: s.coalMarket,
    ironMarket: s.ironMarket,
    players: s.players,
  }), shallowEqual);

  const pawnColorById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of view.players) m.set(p.id, p.pawnColor);
    return m;
  }, [view.players]);

  const cityByName = useMemo(
    () => indexCities(view.districtCities, view.merchantCities),
    [view.districtCities, view.merchantCities],
  );

  const occupiedSlots = useMemo(() => {
    const set = new Set<string>();
    for (const t of view.builtTiles) set.add(`${t.cityName}#${t.slotIndex}`);
    return set;
  }, [view.builtTiles]);

  const buildPick =
    wizard.state.phase === "AWAITING_BUILD_INPUTS" ? wizard.state.slot : null;
  const slotsClickable = wizard.state.phase === "AWAITING_BUILD_INPUTS";
  // Slot narrowing: once the player has stashed / picked a card or
  // industry, dim slots the engine wouldn't accept anyway. Card with
  // a LOCATION constraint pins the legal city; industry pin narrows
  // to slots whose accept-list includes that industry. Engine still
  // owns the final validation.
  //
  // Derive filters from `wizard` directly (not via useGameState) so
  // they react to wizard transitions even when the engine state ref
  // hasn't changed. Pulling the active hand via useGameState is fine
  // because the hand only changes when the engine state changes.
  const activeHand = useGameState((s) => {
    const id = s.turnOrder[s.currentPlayerIndex];
    if (id === undefined) return null;
    return s.players.find((p) => p.id === id)?.hand ?? null;
  });
  const buildFilters = useMemo(() => {
    if (wizard.state.phase !== "AWAITING_BUILD_INPUTS") {
      return { cityName: null, industry: null };
    }
    const cardIndex = wizard.state.cardIndex;
    const industry = wizard.state.industry;
    let cityName: string | null = null;
    if (cardIndex !== null && activeHand) {
      const card = activeHand[cardIndex] ?? null;
      if (card?.kind === "LOCATION") cityName = card.cityName;
    }
    return { cityName, industry };
  }, [wizard.state, activeHand]);

  const linesClickable = wizard.state.phase === "AWAITING_NETWORK_INPUTS";
  const linePicks = useMemo(() => {
    if (wizard.state.phase !== "AWAITING_NETWORK_INPUTS") {
      return new Set<number>();
    }
    const set = new Set<number>();
    if (wizard.state.lineIndex !== null) set.add(wizard.state.lineIndex);
    if (wizard.state.secondLineIndex !== null) {
      set.add(wizard.state.secondLineIndex);
    }
    return set;
  }, [wizard.state]);
  const developedLineOwners = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of view.developedLinks) m.set(l.lineIndex, l.owner);
    return m;
  }, [view.developedLinks]);

  // Coal market glow per §2.11.3: any sub-state actively asking for
  // coal lights the markets widget so it's an obvious click target.
  const coalGlow =
    (wizard.state.phase === "AWAITING_BUILD_RESOURCES" &&
      wizard.state.coalPicks.length < wizard.state.coalNeed) ||
    (wizard.state.phase === "AWAITING_NETWORK_RESOURCES" &&
      (wizard.state.firstCoalPicks.length < wizard.state.firstCoalNeed ||
        wizard.state.secondCoalPicks.length < wizard.state.secondCoalNeed));
  const ironGlow =
    wizard.state.phase === "AWAITING_BUILD_RESOURCES" &&
    wizard.state.ironPicks.length < wizard.state.ironNeed;

  const sellMode = wizard.state.phase === "AWAITING_SELL_INPUTS";
  const sellPickedTileIds = useMemo(
    () =>
      wizard.state.phase === "AWAITING_SELL_INPUTS"
        ? new Set(wizard.state.tileIds)
        : new Set<string>(),
    [wizard.state],
  );
  const activeSeatId = useGameState(
    (s) => s.turnOrder[s.currentPlayerIndex] ?? null,
  );

  return (
    <Panel id="board" title="Board">
      <svg
        className="board-svg"
        viewBox={`0 0 ${CANVAS} ${CANVAS}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <rect x="0" y="0" width={CANVAS} height={CANVAS} fill="#f3edd8" />
        <Lines
          lines={view.lines}
          era={view.era}
          cityByName={cityByName}
          developedLineOwners={developedLineOwners}
          pawnColorById={pawnColorById}
          linesClickable={linesClickable}
          pickedLineIndices={linePicks}
          onLineClick={(i) => wizard.pickLine(i)}
        />
        {view.districtCities.map((c) => (
          <DistrictCityShape
            key={c.name}
            city={c}
            occupied={occupiedSlots}
            slotsClickable={slotsClickable}
            cityFilter={buildFilters.cityName}
            industryFilter={buildFilters.industry}
            picked={
              buildPick !== null && buildPick.cityName === c.name
                ? buildPick.slotIndex
                : null
            }
            onSlotClick={(slotIndex) =>
              wizard.pickSlot({ cityName: c.name, slotIndex })
            }
          />
        ))}
        {view.merchantCities.map((m) => {
          // All five merchant cities render even when not active for
          // this player count. The slot map covers only the slots that
          // were actually filled with a merchant tile; inactive cities
          // (Nottingham at 2p, Warrington at 2p / 3p) draw empty D
          // slots with no accept-list icon and no beer indicator.
          const slotMap = new Map<
            number,
            { accept: MerchantTileAccept; hasBeer: boolean }
          >();
          for (const ms of view.merchantSlots) {
            if (ms.merchantCityName !== m.name) continue;
            slotMap.set(ms.slotIndex, {
              accept: ms.accept,
              hasBeer: ms.hasBeer,
            });
          }
          const isActive = slotMap.size > 0;
          return (
            <MerchantCityShape
              key={m.name}
              city={m}
              slotMap={slotMap}
              active={isActive}
            />
          );
        })}
        <BuiltTiles
          tiles={view.builtTiles}
          tileCatalogue={view.tileCatalogue}
          districtCities={view.districtCities}
          pawnColorById={pawnColorById}
          sellMode={sellMode}
          activeSeatId={activeSeatId}
          sellPickedTileIds={sellPickedTileIds}
          onTileClick={(tileId) => wizard.pickTile(tileId)}
        />
        <Markets
          coal={view.coalMarket}
          iron={view.ironMarket}
          coalGlow={coalGlow}
          ironGlow={ironGlow}
        />
        <CityBanners
          districtCities={view.districtCities}
          merchantCities={view.merchantCities}
        />
        <TurnOrderWidget
          round={view.round}
          playerCount={view.playerCount}
          turnOrder={view.turnOrder}
          currentPlayerIndex={view.currentPlayerIndex}
          players={view.players}
        />
      </svg>
    </Panel>
  );
}

function indexCities(
  districts: readonly DistrictCity[],
  merchants: readonly MerchantCity[],
): ReadonlyMap<string, readonly [number, number]> {
  const m = new Map<string, readonly [number, number]>();
  for (const c of districts) m.set(c.name, c.position);
  for (const c of merchants) m.set(c.name, c.position);
  return m;
}

export function DistrictCityShape({
  city,
  occupied,
  slotsClickable,
  cityFilter,
  industryFilter,
  picked,
  onSlotClick,
}: {
  city: DistrictCity;
  occupied: ReadonlySet<string>;
  slotsClickable: boolean;
  cityFilter: string | null;
  industryFilter: IndustryName | null;
  picked: number | null;
  onSlotClick: (slotIndex: number) => void;
}) {
  const [x, y] = city.position;
  const fill = DISTRICT_FILL[city.districtTag] ?? "#aaaaaa";
  const [cityW, cityH] = cityBodyDims(city.slots.length);
  const cityWrongForCard =
    cityFilter !== null && cityFilter !== city.name;
  return (
    <g
      className="board-city"
      transform={`translate(${x - cityW / 2}, ${y - cityH / 2})`}
      style={cityWrongForCard ? { opacity: 0.35 } : undefined}
    >
      {/* No tinted background and no outer city outline — the district
       * colour lives in each slot's border + the city-name banner
       * (rendered as a separate front layer in CityBanners). */}
      {city.slots.map((slot, i) => {
        const [cellX, cellY] = slotCellPos(i, city.slots.length);
        const isOccupied = occupied.has(`${city.name}#${i}`);
        const isPicked = picked === i;
        const slotAcceptsIndustry =
          industryFilter === null ||
          slot.acceptList.length === 0 ||
          slot.acceptList.includes(industryFilter);
        const clickable =
          slotsClickable && !cityWrongForCard && slotAcceptsIndustry;
        const slotDim =
          slotsClickable &&
          !cityWrongForCard &&
          !slotAcceptsIndustry;
        const cls = [
          "board-slot",
          clickable ? "board-slot--clickable" : "",
          isOccupied ? "board-slot--occupied" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <g
            key={i}
            transform={`translate(${cellX}, ${cellY})`}
            className={cls}
            style={slotDim ? { opacity: 0.35 } : undefined}
            onClick={clickable ? () => onSlotClick(i) : undefined}
          >
            <rect
              x={0}
              y={0}
              width={TILE}
              height={TILE}
              fill={isOccupied ? "transparent" : "#fffdf6"}
              stroke={isPicked ? "var(--warm-gold)" : fill}
              strokeWidth={isPicked ? 2 : 0.8}
            />
            {!isOccupied ? (
              <SlotAcceptGlyph accept={slot.acceptList} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

/** Compute icon centre positions and a unit icon size for n icons
 *  packed inside a TILE-sized cell. Centroid of the centres equals
 *  the slot's centre. */
function iconCentroidPositions(
  n: number,
  cx: number,
  cy: number,
): { size: number; centres: readonly (readonly [number, number])[] } {
  if (n <= 1) {
    // Single icon: large, centred.
    return { size: TILE * 0.7, centres: [[cx, cy]] };
  }
  if (n === 2) {
    // Side by side, midpoint at centre.
    const size = TILE * 0.42;
    const offset = size / 2 + 1;
    return {
      size,
      centres: [
        [cx - offset, cy],
        [cx + offset, cy],
      ],
    };
  }
  if (n === 3) {
    // Equilateral triangle: top, bottom-left, bottom-right. Centroid
    // sits at (cx, cy) by construction.
    const size = TILE * 0.36;
    const r = TILE * 0.26;
    const sin60 = Math.sqrt(3) / 2;
    return {
      size,
      centres: [
        [cx, cy - r],
        [cx - r * sin60, cy + r * 0.5],
        [cx + r * sin60, cy + r * 0.5],
      ],
    };
  }
  // 4+ icons → 2×2 grid (positions form a regular grid whose centroid
  // is the slot centre). Extras cycle inside the grid.
  const cols = 2;
  const rows = Math.ceil(n / 2);
  const size = Math.min(TILE * 0.32, (TILE - 4) / rows);
  const centres: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = cx + (col - (cols - 1) / 2) * size;
    const y = cy + (row - (rows - 1) / 2) * size;
    centres.push([x, y]);
  }
  return { size, centres };
}

function SlotAcceptGlyph({
  accept,
}: {
  accept: readonly IndustryName[];
}) {
  // Slot cell is TILE × TILE; the centroid of the icon-centre positions
  // is always the slot's own centre. Sizing rules:
  //   1 industry  → big centred icon
  //   2 industries → side-by-side, midpoint at centre
  //   3 industries → triangle (top, bottom-left, bottom-right)
  //   4+ industries → 2×2 grid (rare combo case)
  //   wildcard (empty list) → "ANY" text
  const cx = TILE / 2;
  const cy = TILE / 2;
  if (accept.length === 0) {
    return (
      <text
        x={cx}
        y={cy + 3}
        className="board-slot__label"
        textAnchor="middle"
      >
        ANY
      </text>
    );
  }
  const positions = iconCentroidPositions(accept.length, cx, cy);
  const iconSize = positions.size;
  return (
    <g>
      {accept.map((ind, i) => (
        <image
          key={ind + i}
          href={INDUSTRY_ICON[ind]}
          x={positions.centres[i]![0] - iconSize / 2}
          y={positions.centres[i]![1] - iconSize / 2}
          width={iconSize}
          height={iconSize}
          preserveAspectRatio="xMidYMid meet"
        />
      ))}
    </g>
  );
}

/** Beer-indicator side length, kept proportional to TILE so a TILE
 *  bump scales the merchant beer slots in lock-step. 10/28 from the
 *  original constants. */
const BEER_BOX = TILE * (10 / 28);

export function MerchantCityShape({
  city,
  slotMap,
  active,
}: {
  city: MerchantCity;
  slotMap: ReadonlyMap<
    number,
    { accept: MerchantTileAccept; hasBeer: boolean }
  >;
  active: boolean;
}) {
  const [x, y] = city.position;
  // Layout (top → bottom):
  //   - row of D-slots (TILE × TILE each)
  //   - beer indicator below each slot
  //   - bonus badge (the rewards offered for selling here)
  //   - city name
  //   - link-points badge (one LinkPointsIcon per link point — 2 for
  //     every merchant per §2.4, rendered as connected hexes)
  // Inactive cities show empty D frames + empty beer placeholders.
  const slotCount = Math.max(city.slotCount, 1);
  const clusterW = slotCount * TILE;
  const totalH = TILE + BEER_BOX + 2;
  // Vertical offsets relative to the slot row's top-left (0, 0):
  const BONUS_BADGE_Y = TILE + BEER_BOX + 14;
  const NAME_Y = BONUS_BADGE_Y + 18;
  const LINK_BADGE_Y = NAME_Y + 16;
  return (
    <g
      className={"board-merchant" + (active ? "" : " board-merchant--inactive")}
      transform={`translate(${x - clusterW / 2}, ${y - totalH / 2})`}
    >
      {Array.from({ length: slotCount }).map((_, i) => {
        const slot = slotMap.get(i);
        // Beer indicator always renders so inactive merchants
        // (Nottingham / Warrington in 2-player, Nottingham in 3-player)
        // still show an empty barrel placeholder under each D-slot.
        return (
          <g key={i} transform={`translate(${i * TILE}, 0)`}>
            <DSlot accept={slot?.accept ?? null} />
            <BeerIndicator hasBeer={slot?.hasBeer ?? false} />
          </g>
        );
      })}
      <g transform={`translate(${clusterW / 2}, ${BONUS_BADGE_Y})`}>
        <BonusBadge bonus={city.bonus} value={city.bonusValue} />
      </g>
      {/* City name is rendered as a banner in the front-layer
       * CityBanners pass; merchant link points sit just below where
       * the name lives, so we still reserve the NAME_Y row. */}
      <g transform={`translate(${clusterW / 2}, ${LINK_BADGE_Y})`}>
        <LinkPointsBadge count={city.linkPoints} />
      </g>
    </g>
  );
}

function DSlot({ accept }: { accept: MerchantTileAccept | null }) {
  // D shape: square top with rounded bottom corners. When accept is
  // null (inactive merchant city) or "BLANK" (drawn-blank tile), the
  // D renders empty — no icon, no glyph.
  const w = TILE;
  const h = TILE;
  const r = TILE / 3;
  const path = [
    `M 0 0`,
    `L ${w} 0`,
    `L ${w} ${h - r}`,
    `Q ${w} ${h} ${w - r} ${h}`,
    `L ${r} ${h}`,
    `Q 0 ${h} 0 ${h - r}`,
    `Z`,
  ].join(" ");
  const empty = accept === null || accept === "BLANK";
  return (
    <g>
      <path
        d={path}
        fill="#e5d9b4"
        stroke="#7d6a3a"
        strokeWidth={0.9}
      />
      {empty ? null : <SlotAcceptDisplay accept={accept} />}
    </g>
  );
}

const MERCHANT_ANY_INDUSTRIES: readonly IndustryName[] = [
  "COTTON_MILL",
  "MANUFACTURER",
  "POTTERY",
];

function SlotAcceptDisplay({ accept }: { accept: MerchantTileAccept }) {
  if (accept === "BLANK") return null;
  // ANY merchant slot → render the three sellable industries in a
  // triangle, same centroid-at-centre rule as building slots.
  if (accept === "ANY") {
    const positions = iconCentroidPositions(3, TILE / 2, TILE / 2);
    const iconSize = positions.size;
    return (
      <g>
        {MERCHANT_ANY_INDUSTRIES.map((ind, i) => (
          <image
            key={ind}
            href={INDUSTRY_ICON[ind]}
            x={positions.centres[i]![0] - iconSize / 2}
            y={positions.centres[i]![1] - iconSize / 2}
            width={iconSize}
            height={iconSize}
            preserveAspectRatio="xMidYMid meet"
          />
        ))}
      </g>
    );
  }
  // Specific industry — single big centred icon (matches the city
  // slot's single-industry rendering).
  const positions = iconCentroidPositions(1, TILE / 2, TILE / 2);
  const iconSize = positions.size;
  const ind = accept as IndustryName;
  return (
    <image
      href={INDUSTRY_ICON[ind]}
      x={positions.centres[0]![0] - iconSize / 2}
      y={positions.centres[0]![1] - iconSize / 2}
      width={iconSize}
      height={iconSize}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

function BeerIndicator({ hasBeer }: { hasBeer: boolean }) {
  // Slot for the merchant's beer barrel below each D. Renders a
  // BeerIcon when present, an outline placeholder when consumed.
  const x = (TILE - BEER_BOX) / 2;
  const y = TILE + 2;
  if (hasBeer) {
    return <BeerIcon x={x} y={y} size={BEER_BOX} />;
  }
  return (
    <rect
      x={x}
      y={y}
      width={BEER_BOX}
      height={BEER_BOX}
      fill="transparent"
      stroke="#7d6a3a"
      strokeWidth={0.7}
      opacity={0.55}
    />
  );
}

/** Merchant bonus / link-point badge sizing. 1.5× the underlying icon
 *  size used elsewhere — keeps the merchant indicators readable at the
 *  larger TILE scale. */
const MERCHANT_BADGE_SIZE = 21;

function BonusBadge({
  bonus,
  value,
}: {
  bonus: string;
  value: number;
}) {
  // Renders the bonus icon(s) centred at (0, 0). The four bonuses
  // share their respective shared icon components; DEVELOP uses one
  // bulb per develop point (no numeric overlay).
  const half = MERCHANT_BADGE_SIZE / 2;
  if (bonus === "VP") {
    return (
      <VictoryPointsIcon
        x={-half}
        y={-half}
        size={MERCHANT_BADGE_SIZE}
        amount={value}
      />
    );
  }
  if (bonus === "MONEY") {
    return (
      <MoneyCoin
        amount={value}
        size={MERCHANT_BADGE_SIZE}
        x={-half}
        y={-half}
      />
    );
  }
  if (bonus === "INCOME") {
    return (
      <IncomeGainedIcon
        x={-half}
        y={-half}
        size={MERCHANT_BADGE_SIZE}
        amount={value}
      />
    );
  }
  // DEVELOP — N uncrossed light bulbs in a row (no numeric overlay).
  const count = Math.max(1, value);
  const gap = 1.5;
  const totalW = MERCHANT_BADGE_SIZE * count + gap * (count - 1);
  const startX = -totalW / 2;
  return (
    <g>
      {Array.from({ length: count }).map((_, i) => (
        <DevelopIcon
          key={i}
          x={startX + i * (MERCHANT_BADGE_SIZE + gap)}
          y={-half}
          size={MERCHANT_BADGE_SIZE}
        />
      ))}
    </g>
  );
}

/** N pointy-top link-point hexagons sharing vertical edges so they
 *  read as a single connected merchant indicator with one outer
 *  border. Per-hex content (golden bar with filled circular ends) is
 *  the same as LinkPointsIcon. Centred at (0, 0). */
function LinkPointsBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  // Internal coord frame: 16 units tall (one hex + 1u top/bottom
  // margin); per-hex centre-to-centre distance is r√3 horizontally.
  const r = 7;
  const halfHexW = (r * Math.sqrt(3)) / 2; // ≈ 6.062
  const dx = halfHexW * 2; // ≈ 12.124
  const cy = 8;
  const yTop = cy - r;
  const yMidTop = cy - r / 2;
  const yMidBot = cy + r / 2;
  const yBot = cy + r;
  const sideMargin = 16 - dx; // ≈ 3.876
  const innerW = sideMargin + dx * count;
  const innerH = 16;
  const cxs: number[] = [];
  for (let i = 0; i < count; i++) {
    cxs.push(sideMargin / 2 + halfHexW + i * dx);
  }
  // Walk the outer outline clockwise: top edge zig-zag → right side →
  // bottom zig-zag in reverse → left side. Yields 4*count + 2 verts.
  const outline: string[] = [];
  for (let i = 0; i < count; i++) {
    outline.push(`${cxs[i]!.toFixed(2)},${yTop.toFixed(2)}`);
    outline.push(`${(cxs[i]! + halfHexW).toFixed(2)},${yMidTop.toFixed(2)}`);
  }
  outline.push(
    `${(cxs[count - 1]! + halfHexW).toFixed(2)},${yMidBot.toFixed(2)}`,
  );
  for (let i = count - 1; i >= 0; i--) {
    outline.push(`${cxs[i]!.toFixed(2)},${yBot.toFixed(2)}`);
    if (i > 0) {
      outline.push(
        `${(cxs[i - 1]! + halfHexW).toFixed(2)},${yMidBot.toFixed(2)}`,
      );
    }
  }
  outline.push(`${(cxs[0]! - halfHexW).toFixed(2)},${yMidBot.toFixed(2)}`);
  outline.push(`${(cxs[0]! - halfHexW).toFixed(2)},${yMidTop.toFixed(2)}`);

  const pxPerUnit = MERCHANT_BADGE_SIZE / 16;
  const widthPx = innerW * pxPerUnit;
  const heightPx = MERCHANT_BADGE_SIZE;
  const innerHalfW = 3.5;
  const innerR = 1.9;

  return (
    <svg
      x={-widthPx / 2}
      y={-heightPx / 2}
      width={widthPx}
      height={heightPx}
      viewBox={`0 0 ${innerW.toFixed(2)} ${innerH}`}
      aria-label={`${count} link points`}
    >
      <polygon
        points={outline.join(" ")}
        fill="#0a0a0a"
        stroke="#c89020"
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      {/* Faint divider between adjacent hex cells. */}
      {Array.from({ length: count - 1 }).map((_, i) => (
        <line
          key={i}
          x1={cxs[i]! + halfHexW}
          y1={yMidTop}
          x2={cxs[i]! + halfHexW}
          y2={yMidBot}
          stroke="#c89020"
          strokeWidth={0.45}
          opacity={0.45}
        />
      ))}
      {/* Per-hex link glyph: horizontal golden bar + filled ends. */}
      {cxs.map((cx, i) => (
        <g key={i}>
          <line
            x1={cx - innerHalfW}
            y1={cy}
            x2={cx + innerHalfW}
            y2={cy}
            stroke="#c89020"
            strokeWidth={1.6}
          />
          <circle cx={cx - innerHalfW} cy={cy} r={innerR} fill="#c89020" />
          <circle cx={cx + innerHalfW} cy={cy} r={innerR} fill="#c89020" />
        </g>
      ))}
    </svg>
  );
}

function LinkToken({
  cx,
  cy,
  color,
  era,
  angle = 0,
}: {
  cx: number;
  cy: number;
  color: string;
  era: Era;
  /** Rotation in degrees, applied around (cx, cy). 0 = horizontal. */
  angle?: number;
}) {
  // Player-coloured rounded rectangle with the canal / rail asset
  // inside, painted at the line midpoint or centroid. Size derives
  // from `LINK_TILE_HEIGHT` so a single TILE bump scales tiles AND
  // their links together at a fixed ratio.
  return (
    <LinkTileIcon
      era={era}
      color={color}
      size={LINK_TILE_HEIGHT}
      x={cx - LINK_TILE_WIDTH / 2}
      y={cy - LINK_TILE_HEIGHT / 2}
      angle={angle}
    />
  );
}

export function Lines({
  lines,
  era,
  cityByName,
  developedLineOwners,
  pawnColorById,
  linesClickable,
  pickedLineIndices,
  onLineClick,
}: {
  lines: readonly Line[];
  era: Era;
  cityByName: ReadonlyMap<string, readonly [number, number]>;
  developedLineOwners: ReadonlyMap<number, number>;
  pawnColorById: ReadonlyMap<number, string>;
  linesClickable: boolean;
  pickedLineIndices: ReadonlySet<number>;
  onLineClick: (lineIndex: number) => void;
}) {
  return (
    <g className="board-lines">
      {lines.map((line, i) => {
        const points = line.endpoints
          .map((n) => cityByName.get(n))
          .filter((p): p is readonly [number, number] => p !== undefined);
        if (points.length < 2) return null;
        const isEra = line.era === era;
        const ownerId = developedLineOwners.get(i);
        const developed = ownerId !== undefined;
        const ownerColor =
          ownerId !== undefined ? pawnColorById.get(ownerId) : undefined;
        const isPicked = pickedLineIndices.has(i);
        const stroke = isPicked
          ? "var(--warm-gold)"
          : line.era === "CANAL"
            ? "#5e8fc7"
            : "#9c7656";
        const opacity = isEra ? 0.85 : 0.18;
        const width = isPicked ? 6 : isEra ? 4 : 2.5;
        const clickable = linesClickable && isEra && !developed;
        const handleClick = clickable ? () => onLineClick(i) : undefined;
        const groupClass = clickable
          ? "board-line board-line--clickable"
          : "board-line";

        if (points.length === 2) {
          const mx = (points[0]![0] + points[1]![0]) / 2;
          const my = (points[0]![1] + points[1]![1]) / 2;
          // Tile rotation aligns with the line direction. Atan2 gives
          // an angle in [-90°, 90°] when we normalise to the upper
          // half plane so the boat / train always reads "right-side up".
          let lineAngle = (Math.atan2(
            points[1]![1] - points[0]![1],
            points[1]![0] - points[0]![0],
          ) * 180) / Math.PI;
          if (lineAngle > 90) lineAngle -= 180;
          if (lineAngle < -90) lineAngle += 180;
          return (
            <g key={i} className={groupClass} onClick={handleClick}>
              <line
                x1={points[0]![0]}
                y1={points[0]![1]}
                x2={points[1]![0]}
                y2={points[1]![1]}
                stroke={stroke}
                strokeOpacity={opacity}
                strokeWidth={width}
                strokeLinecap="round"
              />
              {developed && ownerColor ? (
                <LinkToken
                  cx={mx}
                  cy={my}
                  color={ownerColor}
                  era={line.era}
                  angle={lineAngle}
                />
              ) : null}
              {clickable ? (
                // Wider invisible hit-rect for easier clicking.
                <line
                  x1={points[0]![0]}
                  y1={points[0]![1]}
                  x2={points[1]![0]}
                  y2={points[1]![1]}
                  stroke="transparent"
                  strokeWidth={14}
                  strokeLinecap="round"
                />
              ) : null}
            </g>
          );
        }
        // Triple link: connect each endpoint to the centroid (§2.6.1).
        const cx =
          points.reduce((acc, p) => acc + p[0], 0) / points.length;
        const cy =
          points.reduce((acc, p) => acc + p[1], 0) / points.length;
        return (
          <g key={i} className={groupClass} onClick={handleClick}>
            {points.map((p, j) => (
              <line
                key={j}
                x1={p[0]}
                y1={p[1]}
                x2={cx}
                y2={cy}
                stroke={stroke}
                strokeOpacity={opacity}
                strokeWidth={width}
                strokeLinecap="round"
              />
            ))}
            <circle
              cx={cx}
              cy={cy}
              r={3}
              fill={stroke}
              fillOpacity={opacity}
            />
            {developed && ownerColor ? (
              <LinkToken cx={cx} cy={cy} color={ownerColor} era={line.era} />
            ) : null}
            {clickable
              ? points.map((p, j) => (
                  <line
                    key={`hit-${j}`}
                    x1={p[0]}
                    y1={p[1]}
                    x2={cx}
                    y2={cy}
                    stroke="transparent"
                    strokeWidth={14}
                    strokeLinecap="round"
                  />
                ))
              : null}
          </g>
        );
      })}
    </g>
  );
}

const SELLABLE_INDUSTRIES: ReadonlySet<IndustryName> = new Set([
  "COTTON_MILL",
  "MANUFACTURER",
  "POTTERY",
]);

function BuiltTiles({
  tiles,
  tileCatalogue,
  districtCities,
  pawnColorById,
  sellMode,
  activeSeatId,
  sellPickedTileIds,
  onTileClick,
}: {
  tiles: readonly PlacedIndustryTile[];
  tileCatalogue: readonly IndustryTileSpec[];
  districtCities: readonly DistrictCity[];
  pawnColorById: ReadonlyMap<number, string>;
  sellMode: boolean;
  activeSeatId: number | null;
  sellPickedTileIds: ReadonlySet<string>;
  onTileClick: (tileId: string) => void;
}) {
  const cityByName = useMemo(() => {
    const m = new Map<string, DistrictCity>();
    for (const c of districtCities) m.set(c.name, c);
    return m;
  }, [districtCities]);
  return (
    <g className="board-tiles">
      {tiles.map((t) => {
        const city = cityByName.get(t.cityName);
        if (!city) return null;
        const spec = tileCatalogue[t.catalogueIndex];
        if (!spec) return null;
        const [cellX, cellY] = slotCellPos(t.slotIndex, city.slots.length);
        const [cityW, cityH] = cityBodyDims(city.slots.length);
        const ox = city.position[0] - cityW / 2 + cellX;
        const oy = city.position[1] - cityH / 2 + cellY;
        const clickable =
          sellMode &&
          t.owner === activeSeatId &&
          !t.flipped &&
          SELLABLE_INDUSTRIES.has(spec.industry);
        const isPicked = sellPickedTileIds.has(t.id);
        const cls = clickable
          ? "board-tile board-tile--clickable"
          : "board-tile";
        const ownerColor = pawnColorById.get(t.owner) ?? "#888888";
        return (
          <g
            key={t.id}
            transform={`translate(${ox}, ${oy})`}
            className={cls}
            onClick={clickable ? () => onTileClick(t.id) : undefined}
          >
            <TileFace
              spec={spec}
              ownerColor={ownerColor}
              face={t.flipped ? "flipped" : "unflipped"}
              resources={t.resources}
            />
            {isPicked ? (
              <rect
                x={0}
                y={0}
                width={TILE}
                height={TILE}
                fill="none"
                stroke="var(--warm-gold)"
                strokeWidth={2}
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function Markets({
  coal,
  iron,
  coalGlow,
  ironGlow,
}: {
  coal: Market;
  iron: Market;
  coalGlow: boolean;
  ironGlow: boolean;
}) {
  // §2.11.3 widget. Whole-widget glow when either market is an active
  // pick target. Two columns side by side; each column is a stack of
  // price-coin + cube-slot rows with the industry icon BELOW the rows
  // (aligned to the same y baseline across both columns so the icons
  // sit symmetrically along the bottom). No header text, no
  // Buy/Sell summary, no cube-count line.
  const widgetW = 112;
  // Widget height accommodates the taller coal column (8 rows) plus
  // the icon and even padding top + bottom.
  const innerPadX = 8;
  const innerPadY = 8;
  const ICON = 20;
  const ROW_H = 13;
  const ROW_GAP = 5;
  const coalRows = coal.tiers.length + 1;
  const ironRows = iron.tiers.length + 1;
  const widgetH = innerPadY + coalRows * ROW_H + ROW_GAP + ICON + innerPadY;
  const colW = (widgetW - innerPadX * 2) / 2;
  const iconY = widgetH - innerPadY - ICON;
  // Both columns' bottom row sits just above the icon — iron, with
  // fewer rows than coal, has its top of column further down so the
  // BOTTOM of both stacks aligns horizontally.
  const bottomOfRows = iconY - ROW_GAP;
  const coalTopY = bottomOfRows - coalRows * ROW_H;
  const ironTopY = bottomOfRows - ironRows * ROW_H;
  const anyGlow = coalGlow || ironGlow;
  return (
    <g
      className={
        "board-markets" + (anyGlow ? " board-markets--active" : "")
      }
      transform={`translate(${CANVAS - widgetW - 8}, ${CANVAS - widgetH - 8})`}
    >
      <rect
        x={0}
        y={0}
        width={widgetW}
        height={widgetH}
        fill={anyGlow ? "#fff7e0" : "#fffdf6"}
        stroke={anyGlow ? "var(--warm-gold)" : "#1a1a1a"}
        strokeWidth={anyGlow ? 2 : 1}
      />
      <MarketColumn
        market={coal}
        industry="COAL_MINE"
        cubeColor="#1a1a1a"
        x={innerPadX}
        rowsTopY={coalTopY}
        iconY={iconY}
        iconSize={ICON}
        rowH={ROW_H}
        colW={colW}
        glow={coalGlow}
      />
      <MarketColumn
        market={iron}
        industry="IRON_WORKS"
        cubeColor="#d97706"
        x={innerPadX + colW}
        rowsTopY={ironTopY}
        iconY={iconY}
        iconSize={ICON}
        rowH={ROW_H}
        colW={colW}
        glow={ironGlow}
      />
    </g>
  );
}

function MarketColumn({
  market,
  industry,
  cubeColor,
  x,
  rowsTopY,
  iconY,
  iconSize,
  rowH,
  colW,
  glow,
}: {
  market: Market;
  industry: IndustryName;
  cubeColor: string;
  x: number;
  rowsTopY: number;
  iconY: number;
  iconSize: number;
  rowH: number;
  colW: number;
  glow: boolean;
}) {
  const tiers = market.tiers;
  const cubeSize = 9;
  const cubeGap = 4;
  const coinSize = 10;
  // Row content layout: coin + spacer + cube + gap + cube. Centred
  // inside the column so a column with fewer rows still aligns to
  // the same horizontal axis.
  const coinSpacer = 4;
  const rowContentW = coinSize + coinSpacer + cubeSize * 2 + cubeGap;
  const rowStartX = x + (colW - rowContentW) / 2;
  const coinCx = rowStartX + coinSize / 2;
  const cube0X = rowStartX + coinSize + coinSpacer;
  const cube1X = cube0X + cubeSize + cubeGap;
  // Compose rows: overflow on top, then priced tiers high-to-low.
  const rows: { price: number; cubes: number; isOverflow: boolean }[] = [
    { price: market.overflowPrice, cubes: 2, isOverflow: true },
  ];
  for (let t = tiers.length - 1; t >= 0; t--) {
    rows.push({
      price: tiers[t]!,
      cubes: market.filled[t] ?? 0,
      isOverflow: false,
    });
  }
  return (
    <g
      className={
        glow ? "board-markets__col board-markets__col--active" : "board-markets__col"
      }
    >
      {/* Tier rows from top down. */}
      {rows.map((row, rowIdx) => {
        const rowY = rowsTopY + rowIdx * rowH + rowH / 2;
        return (
          <g key={rowIdx}>
            <SvgMoneyCoin
              cx={coinCx}
              cy={rowY}
              size={coinSize}
              amount={row.price}
              dimmed={row.isOverflow}
            />
            {row.isOverflow ? (
              <text
                x={coinCx + coinSize / 2 + 0.5}
                y={rowY + 2}
                fontSize={4}
                fontWeight={700}
                fill="var(--muted)"
                style={{ pointerEvents: "none" }}
              >
                +
              </text>
            ) : null}
            <rect
              x={cube0X}
              y={rowY - cubeSize / 2}
              width={cubeSize}
              height={cubeSize}
              fill={row.cubes > 0 ? cubeColor : "#fffdf6"}
              stroke="#1a1a1a"
              strokeWidth={0.6}
              strokeDasharray={row.isOverflow ? "1.4 1.4" : undefined}
            />
            <rect
              x={cube1X}
              y={rowY - cubeSize / 2}
              width={cubeSize}
              height={cubeSize}
              fill={row.cubes > 1 ? cubeColor : "#fffdf6"}
              stroke="#1a1a1a"
              strokeWidth={0.6}
              strokeDasharray={row.isOverflow ? "1.4 1.4" : undefined}
            />
          </g>
        );
      })}
      {/* Industry icon centred at the bottom of the column, aligned
       * with the icon in the other column so they sit on a shared
       * baseline regardless of how many rows each column has. */}
      <image
        href={INDUSTRY_ICON[industry]}
        x={x + (colW - iconSize) / 2}
        y={iconY}
        width={iconSize}
        height={iconSize}
        preserveAspectRatio="xMidYMid meet"
        opacity={glow ? 1 : 0.95}
      />
    </g>
  );
}

/** Inline SVG coin glyph for board-side use (Markets, BonusBadge). */
function SvgMoneyCoin({
  cx,
  cy,
  size,
  amount,
  dimmed,
}: {
  cx: number;
  cy: number;
  size: number;
  amount: number;
  dimmed?: boolean;
}) {
  const r = size / 2;
  // Font sized so a one- or two-digit value reads cleanly inside the
  // coin without overlapping the rim.
  const fontSize = size * 0.7;
  return (
    <g style={{ pointerEvents: "none" }} opacity={dimmed ? 0.6 : 1}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="#d4a017"
        stroke="#1a1a1a"
        strokeWidth={0.5}
      />
      <text
        x={cx}
        y={cy + fontSize * 0.36}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={700}
        fill="#1a1a1a"
      >
        {amount}
      </text>
    </g>
  );
}

// =============================================================================
// City name banners — front layer (rendered last so banners sit on top
// of every other element, including lines that pass through cities).
// District cities use the district's fill colour; merchant cities
// share a sandy badge colour. All banners draw a black-on-coloured
// label.
// =============================================================================

const CITY_BANNER_HEIGHT = 14;
const CITY_BANNER_CHAR_W = 5.5;
const CITY_BANNER_PAD_X = 5;
const MERCHANT_BANNER_FILL = "#e5d9b4";

export function CityBanners({
  districtCities,
  merchantCities,
}: {
  districtCities: readonly DistrictCity[];
  merchantCities: readonly MerchantCity[];
}) {
  return (
    <g className="board-city-banners">
      {districtCities.map((c) => {
        const fill = DISTRICT_FILL[c.districtTag] ?? "#aaaaaa";
        const [cityW, cityH] = cityBodyDims(c.slots.length);
        const cx = c.position[0];
        // Banner top sits 4u below the bottom edge of the city body.
        const topY = c.position[1] + cityH / 2 + 4;
        return (
          <CityBanner
            key={c.name}
            cx={cx}
            topY={topY}
            innerW={cityW}
            fill={fill}
            text={c.name}
          />
        );
      })}
      {merchantCities.map((m) => {
        const slotCount = Math.max(m.slotCount, 1);
        const clusterW = slotCount * TILE;
        const totalH = TILE + BEER_BOX + 2;
        // Mirror the merchant layout in MerchantCityShape: bonus badge
        // sits at TILE+BEER_BOX+14 below local origin; the name banner
        // takes the slot 18u below that.
        const localBonusY = TILE + BEER_BOX + 14;
        const localNameY = localBonusY + 18;
        const cx = m.position[0];
        const topY = m.position[1] - totalH / 2 + localNameY - CITY_BANNER_HEIGHT / 2;
        return (
          <CityBanner
            key={m.name}
            cx={cx}
            topY={topY}
            innerW={clusterW}
            fill={MERCHANT_BANNER_FILL}
            text={m.name}
          />
        );
      })}
    </g>
  );
}

function CityBanner({
  cx,
  topY,
  innerW,
  fill,
  text,
}: {
  cx: number;
  topY: number;
  innerW: number;
  fill: string;
  text: string;
}) {
  const minTextW = text.length * CITY_BANNER_CHAR_W + CITY_BANNER_PAD_X * 2;
  const bannerW = Math.max(innerW, minTextW);
  const x = cx - bannerW / 2;
  return (
    <g transform={`translate(${x}, ${topY})`}>
      <rect
        x={0}
        y={0}
        width={bannerW}
        height={CITY_BANNER_HEIGHT}
        fill={fill}
        stroke="#1a1a1a"
        strokeWidth={0.6}
        rx={2}
      />
      <text
        x={bannerW / 2}
        y={CITY_BANNER_HEIGHT - 4}
        textAnchor="middle"
        className="board-city__label"
        style={{ fill: "#000" }}
      >
        {text}
      </text>
    </g>
  );
}

// =============================================================================
// Turn order + round indicator — top-right widget on the board canvas.
// One row per seat in the current round's seating order, showing the
// pawn-coloured swatch, name in black, and money spent this turn (via
// MoneyCoin). The active seat row gets a soft highlight strip.
// =============================================================================

interface TurnOrderPlayer {
  readonly id: number;
  readonly displayName: string;
  readonly pawnColor: string;
  readonly spentThisRound: number;
}

/** §4.4 — last round of the current era for each player count. Mirrors
 *  LAST_ROUND in engine/actions/end-turn.ts. */
const LAST_ROUND_BY_PLAYER_COUNT: Readonly<Record<number, number>> = {
  2: 10,
  3: 9,
  4: 8,
};

function TurnOrderWidget({
  round,
  playerCount,
  turnOrder,
  currentPlayerIndex,
  players,
}: {
  round: number;
  playerCount: number;
  turnOrder: readonly number[];
  currentPlayerIndex: number;
  players: readonly TurnOrderPlayer[];
}) {
  const W = 150;
  const ROW_H = 20;
  const HEADER_H = 24;
  const H = HEADER_H + turnOrder.length * ROW_H + 4;
  const X = CANVAS - W - 14;
  const Y = 14;
  const totalRounds = LAST_ROUND_BY_PLAYER_COUNT[playerCount] ?? round;
  const playerById = new Map(players.map((p) => [p.id, p]));
  return (
    <g
      className="board-turn-order"
      transform={`translate(${X}, ${Y})`}
    >
      <rect
        x={0}
        y={0}
        width={W}
        height={H}
        fill="#fafaf7"
        stroke="#1a1a1a"
        strokeWidth={1}
        rx={4}
        opacity={0.95}
      />
      <text
        x={W / 2}
        y={16}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill="#1a1a1a"
      >
        Round {round}/{totalRounds}
      </text>
      <line
        x1={6}
        y1={HEADER_H - 2}
        x2={W - 6}
        y2={HEADER_H - 2}
        stroke="#1a1a1a"
        strokeWidth={0.5}
      />
      {turnOrder.map((seatId, i) => {
        const p = playerById.get(seatId);
        if (!p) return null;
        const rowTop = HEADER_H + i * ROW_H;
        const isActive = i === currentPlayerIndex;
        const SWATCH = 10;
        const COIN = 11;
        return (
          <g key={seatId} transform={`translate(0, ${rowTop})`}>
            {isActive ? (
              <rect
                x={2}
                y={0}
                width={W - 4}
                height={ROW_H}
                fill="#f3edd8"
              />
            ) : null}
            <rect
              x={6}
              y={(ROW_H - SWATCH) / 2}
              width={SWATCH}
              height={SWATCH}
              fill={p.pawnColor}
              stroke="#1a1a1a"
              strokeWidth={0.5}
            />
            <text
              x={20}
              y={ROW_H / 2 + 3.5}
              fontSize={10}
              fontWeight={600}
              fill="#1a1a1a"
            >
              {p.displayName}
            </text>
            <MoneyCoin
              amount={p.spentThisRound}
              size={COIN}
              x={W - COIN - 6}
              y={(ROW_H - COIN) / 2}
            />
          </g>
        );
      })}
    </g>
  );
}
