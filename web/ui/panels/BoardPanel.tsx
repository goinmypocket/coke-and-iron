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
} from "../../../engine";
import { useMySeatId } from "../hooks/EngineProvider";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { BeerIcon } from "../icons/BeerIcon";
import { CoalIcon } from "../icons/CoalIcon";
import { DevelopIcon } from "../icons/DevelopIcon";
import { IncomeGainedIcon } from "../icons/IncomeGainedIcon";
import { IronIcon } from "../icons/IronIcon";
import {
  LinkPointsIcon,
  linkPointsIconWidth,
} from "../icons/LinkPointsIcon";
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
import { IncomeLadder } from "./IncomeTrackerPanel";

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
  const mySeatId = useMySeatId();
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
    marketPlacePosition: s.marketPlacePosition,
    roundTrackerPosition: s.roundTrackerPosition,
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

  // Axis-aligned bounding box per city, used by Lines to drop link
  // tokens at the midpoint of the segment that lies OUTSIDE both
  // cities' bounding boxes (so the canal/rail token never sits on top
  // of slots or the city name banner). Approximate — width follows
  // the body, height is inflated to cover the banner that hangs
  // below district cities and the bonus/name/link badges that hang
  // below merchants.
  const cityBBoxes = useMemo(
    () => buildCityBBoxes(view.districtCities, view.merchantCities),
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
  const buildMode = wizard.state.phase === "AWAITING_BUILD_INPUTS";
  // Slot narrowing: once the player has stashed / picked a card or
  // industry, dim slots the engine wouldn't accept anyway. Card with
  // a LOCATION constraint pins the legal city; industry pin narrows
  // to slots whose accept-list includes that industry. Engine still
  // owns the final validation.
  //
  // Derive filters from `wizard` directly (not via useGameState) so
  // they react to wizard transitions even when the engine state ref
  // hasn't changed. Pull the VIEWER's hand (not the active player's)
  // — the wizard cardIndex always points into the seat-holder's hand
  // and the build filter is only meaningful during the viewer's turn.
  const myHand = useGameState((s) => {
    if (mySeatId === null) return null;
    return s.players.find((p) => p.id === mySeatId)?.hand ?? null;
  });
  const buildFilters = useMemo(() => {
    if (wizard.state.phase !== "AWAITING_BUILD_INPUTS") {
      return { cityName: null, industry: null };
    }
    const cardIndex = wizard.state.cardIndex;
    const industry = wizard.state.industry;
    let cityName: string | null = null;
    if (cardIndex !== null && myHand) {
      const card = myHand[cardIndex] ?? null;
      if (card?.kind === "LOCATION") cityName = card.cityName;
    }
    return { cityName, industry };
  }, [wizard.state, myHand]);

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
    <Panel id="board" title="Board" hideTitle>
      <div className="board-region">
        <div className="board-region__income">
          <IncomeLadder />
        </div>
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
          cityBBoxes={cityBBoxes}
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
          buildMode={buildMode}
          buildCityFilter={buildFilters.cityName}
          onBuildOverbuildClick={(cityName, slotIndex, industry) => {
            wizard.pickSlot({ cityName, slotIndex });
            wizard.pickIndustry(mySeatId!, industry);
          }}
        />
        <Markets
          coal={view.coalMarket}
          iron={view.ironMarket}
          coalGlow={coalGlow}
          ironGlow={ironGlow}
          position={view.marketPlacePosition}
        />
        <CityBanners
          districtCities={view.districtCities}
          merchantCities={view.merchantCities}
        />
        <TurnOrderWidget
          era={view.era}
          round={view.round}
          playerCount={view.playerCount}
          turnOrder={view.turnOrder}
          currentPlayerIndex={view.currentPlayerIndex}
          players={view.players}
          position={view.roundTrackerPosition}
        />
        </svg>
      </div>
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

interface CityBBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Build axis-aligned bounding boxes (in board viewBox units) covering
 *  the visible footprint of every city — slot row + everything that
 *  hangs below it (the name banner for districts; bonus / name /
 *  link badges for merchants). Used by Lines so link tokens sit in
 *  the OUTSIDE portion of each line. */
function buildCityBBoxes(
  districts: readonly DistrictCity[],
  merchants: readonly MerchantCity[],
): ReadonlyMap<string, CityBBox> {
  const m = new Map<string, CityBBox>();
  // District: body centred on position; banner hangs 4u below body
  // (height CITY_BANNER_HEIGHT). Width tracks body, ignoring the
  // narrow case where a long name balloons banner width past body —
  // the user accepted approximation here.
  for (const c of districts) {
    const [w, h] = cityBodyDims(c.slots.length);
    const [cx, cy] = c.position;
    m.set(c.name, {
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minY: cy - h / 2,
      maxY: cy + h / 2 + 4 + CITY_BANNER_HEIGHT,
    });
  }
  // Merchant: cluster centred horizontally on position; vertical
  // content runs from the slot-row top (-totalH/2 in local frame)
  // down to the bottom of the link-points badge below the name.
  for (const c of merchants) {
    const slotCount = Math.max(c.slotCount, 1);
    const clusterW = slotCount * TILE;
    const totalH = TILE + BEER_BOX + 2;
    // Local frame: slot-row top at 0, bonus badge at TILE+BEER_BOX+14,
    // name banner ~18 below that, link badge ~16 below the name. The
    // badge half-extent is MERCHANT_BADGE_SIZE / 2 below its centre.
    const localBonusY = TILE + BEER_BOX + 14;
    const localNameY = localBonusY + 18;
    const localLinkY = localNameY + 16;
    const localBottom = localLinkY + MERCHANT_BADGE_SIZE / 2;
    const [cx, cy] = c.position;
    m.set(c.name, {
      minX: cx - clusterW / 2,
      maxX: cx + clusterW / 2,
      minY: cy - totalH / 2,
      maxY: cy - totalH / 2 + localBottom,
    });
  }
  return m;
}

/** Distance from `(px, py)` along unit vector `(ux, uy)` to the first
 *  rect boundary it hits, assuming the point starts inside the rect.
 *  Returns 0 if the point is on the boundary; Infinity if the ray is
 *  parallel to both axes (impossible for a unit vector). */
function rayRectExitDistance(
  px: number,
  py: number,
  ux: number,
  uy: number,
  rect: CityBBox,
): number {
  const tx = ux > 1e-9
    ? (rect.maxX - px) / ux
    : ux < -1e-9
      ? (rect.minX - px) / ux
      : Infinity;
  const ty = uy > 1e-9
    ? (rect.maxY - py) / uy
    : uy < -1e-9
      ? (rect.minY - py) / uy
      : Infinity;
  return Math.max(0, Math.min(tx, ty));
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
 *  the slot's centre. The 3D-rendered industry icons read clearly even
 *  with slight overlap, so the multi-icon cases trade a bit of overlap
 *  for a larger per-icon size. */
function iconCentroidPositions(
  n: number,
  cx: number,
  cy: number,
): { size: number; centres: readonly (readonly [number, number])[] } {
  if (n <= 1) {
    // Single icon: large, centred.
    return { size: TILE * 0.78, centres: [[cx, cy]] };
  }
  if (n === 2) {
    // Diagonal layout: top-left + bottom-right, each icon filling a 66%
    // bbox of the slot pinned to its corner. With size=0.66*T and
    // off=0.17*T, TL.bbox = (0,0)→(0.66T, 0.66T) and BR.bbox =
    // (0.34T, 0.34T)→(T, T) — touching the slot edges exactly, no
    // overflow, with a 32%×32% overlap region in the centre that the
    // 3D-rendered icons handle cleanly.
    const size = TILE * 0.66;
    const off = TILE * 0.17;
    return {
      size,
      centres: [
        [cx - off, cy - off],
        [cx + off, cy + off],
      ],
    };
  }
  if (n === 3) {
    // Triple-merchant layout: top-left + bottom-middle + top-right.
    // size=0.5*T, dx=0.25*T, dy=0.125*T tunes the three 50% bboxes so
    // each one's outer edge sits exactly on a slot edge — TL/TR touch
    // the top corners, BM touches the bottom — with a small overlap
    // between BM and the upper pair. dy2 = 2*dy keeps the centroid at
    // (cx, cy).
    const size = TILE * 0.5;
    const dx = TILE * 0.25;
    const dy = TILE * 0.125;
    return {
      size,
      centres: [
        [cx - dx, cy - dy],
        [cx, cy + dy * 2],
        [cx + dx, cy - dy],
      ],
    };
  }
  // 4+ icons → 2×2 grid (positions form a regular grid whose centroid
  // is the slot centre). Extras cycle inside the grid.
  const cols = 2;
  const rows = Math.ceil(n / 2);
  const size = Math.min(TILE * 0.36, (TILE - 4) / rows);
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

/** Merchant link-points badge — N pointy-top hexes joined edge-to-edge,
 *  centred on (0, 0). Delegates to the shared LinkPointsIcon so the
 *  merchant badges and the tile-face / mat link cascades all share
 *  geometry (one source of truth). */
function LinkPointsBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const widthPx = linkPointsIconWidth(count, MERCHANT_BADGE_SIZE);
  return (
    <LinkPointsIcon
      count={count}
      size={MERCHANT_BADGE_SIZE}
      x={-widthPx / 2}
      y={-MERCHANT_BADGE_SIZE / 2}
    />
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
  cityBBoxes,
  developedLineOwners,
  pawnColorById,
  linesClickable,
  pickedLineIndices,
  onLineClick,
}: {
  lines: readonly Line[];
  era: Era;
  cityByName: ReadonlyMap<string, readonly [number, number]>;
  cityBBoxes: ReadonlyMap<string, CityBBox>;
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
          // Place the link token at the midpoint of the OUTSIDE part
          // of the line — the segment that lies between the two
          // cities' bounding boxes. Falls back to the geometric
          // midpoint if the cities overlap or one bbox is missing.
          const p0 = points[0]!;
          const p1 = points[1]!;
          const dx = p1[0] - p0[0];
          const dy = p1[1] - p0[1];
          const len = Math.hypot(dx, dy);
          const ux = len > 0 ? dx / len : 1;
          const uy = len > 0 ? dy / len : 0;
          const bbox0 = cityBBoxes.get(line.endpoints[0]!);
          const bbox1 = cityBBoxes.get(line.endpoints[1]!);
          const exit0 = bbox0
            ? rayRectExitDistance(p0[0], p0[1], ux, uy, bbox0)
            : 0;
          // Distance from p1 going BACK along the line until it leaves
          // c1's bbox; the line first ENTERS c1's bbox at len - exit1.
          const exit1 = bbox1
            ? rayRectExitDistance(p1[0], p1[1], -ux, -uy, bbox1)
            : 0;
          const tStart = exit0;
          const tEnd = len - exit1;
          let mx: number;
          let my: number;
          if (tStart < tEnd) {
            const tMid = (tStart + tEnd) / 2;
            mx = p0[0] + ux * tMid;
            my = p0[1] + uy * tMid;
          } else {
            // Cities overlap or are touching — geometric midpoint.
            mx = (p0[0] + p1[0]) / 2;
            my = (p0[1] + p1[1]) / 2;
          }
          // Tile rotation aligns with the line direction. Atan2 gives
          // an angle in [-90°, 90°] when we normalise to the upper
          // half plane so the boat / train always reads "right-side up".
          let lineAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
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
  buildMode,
  buildCityFilter,
  onBuildOverbuildClick,
}: {
  tiles: readonly PlacedIndustryTile[];
  tileCatalogue: readonly IndustryTileSpec[];
  districtCities: readonly DistrictCity[];
  pawnColorById: ReadonlyMap<number, string>;
  sellMode: boolean;
  activeSeatId: number | null;
  sellPickedTileIds: ReadonlySet<string>;
  onTileClick: (tileId: string) => void;
  buildMode: boolean;
  buildCityFilter: string | null;
  onBuildOverbuildClick: (
    cityName: string,
    slotIndex: number,
    industry: IndustryName,
  ) => void;
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
        const sellClickable =
          sellMode &&
          t.owner === activeSeatId &&
          !t.flipped &&
          SELLABLE_INDUSTRIES.has(spec.industry);
        // Overbuild affordance: during the BUILD wizard, an existing
        // tile becomes a click target that picks both its slot AND
        // its industry in one go. Engine still validates legality —
        // the click is just a shortcut for the player who's already
        // looking at the tile they want to overbuild.
        const overbuildClickable =
          buildMode &&
          (buildCityFilter === null || buildCityFilter === t.cityName);
        const clickable = sellClickable || overbuildClickable;
        const isPicked = sellPickedTileIds.has(t.id);
        const cls = clickable
          ? "board-tile board-tile--clickable"
          : "board-tile";
        const ownerColor = pawnColorById.get(t.owner) ?? "#888888";
        const onClick = sellClickable
          ? () => onTileClick(t.id)
          : overbuildClickable
            ? () =>
                onBuildOverbuildClick(t.cityName, t.slotIndex, spec.industry)
            : undefined;
        return (
          <g
            key={t.id}
            transform={`translate(${ox}, ${oy})`}
            className={cls}
            onClick={onClick}
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

export function Markets({
  coal,
  iron,
  coalGlow,
  ironGlow,
  position,
}: {
  coal: Market;
  iron: Market;
  coalGlow: boolean;
  ironGlow: boolean;
  /** Centre of the widget on the 900×900 board canvas, sourced from
   *  config/board.json so the editor can reposition it. */
  position: readonly [number, number];
}) {
  // §2.11.3 widget. Whole-widget glow when either market is an active
  // pick target. Two columns side by side; each column is a stack of
  // price-coin + cube-slot rows with the industry icon BELOW the rows
  // (aligned to the same y baseline across both columns so the icons
  // sit symmetrically along the bottom). No header text, no
  // Buy/Sell summary, no cube-count line.
  const widgetW = 156;
  // Widget height accommodates the taller coal column (8 rows) plus
  // the icon and even padding top + bottom.
  const innerPadX = 11;
  const innerPadY = 11;
  const ICON = 28;
  const ROW_H = 18;
  const ROW_GAP = 7;
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
  // Translate so `position` ends up at the widget's CENTRE — matches
  // the convention used for cities (`position` is the centre on the
  // canvas) and means the editor can drag the widget around without
  // reasoning about rectangle corners.
  const tx = position[0] - widgetW / 2;
  const ty = position[1] - widgetH / 2;
  return (
    <g
      className={
        "board-markets" + (anyGlow ? " board-markets--active" : "")
      }
      transform={`translate(${tx}, ${ty})`}
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
  const cubeSize = 13;
  const cubeGap = 5;
  const coinSize = 14;
  // Row content layout: coin + spacer + cube + gap + cube. Centred
  // inside the column so a column with fewer rows still aligns to
  // the same horizontal axis.
  const coinSpacer = 5;
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
                y={rowY + 3}
                fontSize={6}
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

// Bumped ~20% (was 14 / 5.5). Drives the rectangle and the text glyphs;
// labels read clearly at conversational distance even on the darker
// district fills.
const CITY_BANNER_HEIGHT = 17;
const CITY_BANNER_CHAR_W = 6.6;
const CITY_BANNER_PAD_X = 5;
// Merchant banners get a soft light-gray (vs. the sandier district
// fills); district names render white-on-color, merchant names render
// black-on-light-gray, both for legibility.
const MERCHANT_BANNER_FILL = "#d8d8d8";

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
        const [, cityH] = cityBodyDims(c.slots.length);
        const cx = c.position[0];
        // Banner top sits 4u below the bottom edge of the city body.
        const topY = c.position[1] + cityH / 2 + 4;
        return (
          <CityBanner
            key={c.name}
            cx={cx}
            topY={topY}
            fill={fill}
            text={c.name}
            textColor="#fff"
          />
        );
      })}
      {merchantCities.map((m) => {
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
            fill={MERCHANT_BANNER_FILL}
            text={m.name}
            textColor="#000"
          />
        );
      })}
    </g>
  );
}

function CityBanner({
  cx,
  topY,
  fill,
  text,
  textColor,
}: {
  cx: number;
  topY: number;
  fill: string;
  text: string;
  /** District banners use white text on the dark district fills;
   *  merchants use black on the light-gray fill. Both are legible. */
  textColor: string;
}) {
  // Font size and banner height are uniform across every city (set in
  // CSS / by CITY_BANNER_HEIGHT) — only the width grows to contain the
  // name. We deliberately don't pad the banner out to the city body /
  // merchant cluster width: stretching it makes the centred text look
  // smaller in big cities even though the font-size hasn't changed.
  const bannerW = text.length * CITY_BANNER_CHAR_W + CITY_BANNER_PAD_X * 2;
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
        y={CITY_BANNER_HEIGHT - 5}
        textAnchor="middle"
        className="board-city__label"
        style={{ fill: textColor }}
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

export interface TurnOrderPlayer {
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

export function TurnOrderWidget({
  era,
  round,
  playerCount,
  turnOrder,
  currentPlayerIndex,
  players,
  position,
}: {
  era: Era;
  round: number;
  playerCount: number;
  turnOrder: readonly number[];
  currentPlayerIndex: number;
  players: readonly TurnOrderPlayer[];
  /** Centre of the widget on the 900×900 board canvas (from
   *  config/board.json roundTracker.position). */
  position: readonly [number, number];
}) {
  // Bumped wider + taller so the era / round header reads at a glance,
  // each seat row gets more vertical room, and the turn-coin can render
  // big enough to be legible without leaning in.
  const W = 210;
  const ROW_H = 40;
  const HEADER_H = 50;
  const H = HEADER_H + turnOrder.length * ROW_H + 4;
  // Centre the box on `position`, mirroring city/merchant convention.
  const X = position[0] - W / 2;
  const Y = position[1] - H / 2;
  const totalRounds = LAST_ROUND_BY_PLAYER_COUNT[playerCount] ?? round;
  const eraLabel = era === "CANAL" ? "Canal Era" : "Rail Era";
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
        y={20}
        textAnchor="middle"
        fontSize={15}
        fontWeight={700}
        fill="#1a1a1a"
      >
        {eraLabel}
      </text>
      <text
        x={W / 2}
        y={38}
        textAnchor="middle"
        fontSize={13}
        fontWeight={600}
        fill="var(--muted)"
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
        const SWATCH = 18;
        // Coin sized to dominate the row — the per-seat money spent
        // is the most-glanced-at info in the widget.
        const COIN = 34;
        return (
          <g key={seatId} transform={`translate(0, ${rowTop})`}>
            {/* Active player gets a strong amber fill, a coloured left
                rail in their pawn colour, and a bolder outline so they
                pop out of the list at a glance. */}
            {isActive ? (
              <>
                <rect
                  x={2}
                  y={0}
                  width={W - 4}
                  height={ROW_H}
                  fill="#fde68a"
                  stroke="#b45309"
                  strokeWidth={1.25}
                  rx={2}
                />
                <rect
                  x={2}
                  y={0}
                  width={4}
                  height={ROW_H}
                  fill={p.pawnColor}
                />
              </>
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
              x={28}
              y={ROW_H / 2 + 4}
              fontSize={isActive ? 14 : 13}
              fontWeight={isActive ? 800 : 600}
              fill={isActive ? "#78350f" : "#1a1a1a"}
            >
              {isActive ? `▶ ${p.displayName}` : p.displayName}
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
