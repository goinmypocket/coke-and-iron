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
import { DISTRICT_FILL, INDUSTRY_ICON } from "../industryIcons";
import { Panel } from "../layout/Panel";
import { TILE, TileFace } from "../tiles/TileFace";
import { useWizard } from "../wizards/WizardProvider";

const CANVAS = 900;
// City bounding box scales to the slot count rather than padding to a
// fixed square (§ user-spec / §11.2):
//   1 slot  → 1×1 (TILE × TILE)            — Farm Brewery
//   2 slots → 2×1 (2*TILE × TILE)          — most district cities
//   3 slots → 2×2 (2*TILE × 2*TILE)        — top row × 2 + centred bottom
//   4 slots → 2×2 (2*TILE × 2*TILE)
function cityBodyDims(slotCount: number): readonly [number, number] {
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
    <Panel id="board" title="Board" maximizable>
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

function DistrictCityShape({
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
      <rect
        x={0}
        y={0}
        width={cityW}
        height={cityH}
        rx={4}
        fill={fill}
        fillOpacity={0.18}
        stroke={fill}
        strokeWidth={1.2}
      />
      <text
        x={cityW / 2}
        y={-3}
        className="board-city__label"
        textAnchor="middle"
      >
        {city.name}
      </text>
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

const BEER_BOX = 10;

function MerchantCityShape({
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
  // Layout: name on top, bonus badge below name, then a row of D-slots
  // (TILE × TILE each), each with a beer indicator below it. The
  // city always renders city.slotCount slots; inactive cities show
  // empty D frames + no beer indicator.
  const slotCount = Math.max(city.slotCount, 1);
  const clusterW = slotCount * TILE;
  const totalH = TILE + BEER_BOX + 2;
  return (
    <g
      className={"board-merchant" + (active ? "" : " board-merchant--inactive")}
      transform={`translate(${x - clusterW / 2}, ${y - totalH / 2})`}
    >
      <text
        x={clusterW / 2}
        y={-12}
        className="board-merchant__label"
        textAnchor="middle"
      >
        {city.name}
      </text>
      <g transform={`translate(${clusterW / 2}, -3)`}>
        <BonusBadge bonus={city.bonus} value={city.bonusValue} />
      </g>
      {Array.from({ length: slotCount }).map((_, i) => {
        const slot = slotMap.get(i);
        return (
          <g key={i} transform={`translate(${i * TILE}, 0)`}>
            <DSlot accept={slot?.accept ?? null} />
            {slot ? <BeerIndicator hasBeer={slot.hasBeer} /> : null}
          </g>
        );
      })}
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
  // Small square below the slot. Beer icon when present, empty
  // outline when consumed.
  const x = (TILE - BEER_BOX) / 2;
  const y = TILE + 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={BEER_BOX}
        height={BEER_BOX}
        fill={hasBeer ? "#fffdf6" : "transparent"}
        stroke="#7d6a3a"
        strokeWidth={0.7}
        opacity={hasBeer ? 1 : 0.55}
      />
      {hasBeer ? (
        <ellipse
          cx={x + BEER_BOX / 2}
          cy={y + BEER_BOX / 2}
          rx={BEER_BOX / 2 - 2}
          ry={BEER_BOX / 2 - 1.5}
          fill="#c79b3f"
          stroke="#5b4516"
          strokeWidth={0.5}
        >
          <title>Merchant beer barrel available</title>
        </ellipse>
      ) : null}
    </g>
  );
}

function BonusBadge({
  bonus,
  value,
}: {
  bonus: string;
  value: number;
}) {
  // Renders the bonus icon centred at (0, 0) with the value overlaid.
  if (bonus === "VP") {
    const r = 6;
    return (
      <g>
        <polygon
          points={hexPoints(0, 0, r)}
          fill="#fffdf6"
          stroke="#1a1a1a"
          strokeWidth={0.6}
        />
        <text
          x={0}
          y={2.2}
          textAnchor="middle"
          fontSize={6}
          fontWeight={700}
          fill="#1a1a1a"
        >
          {value}
        </text>
      </g>
    );
  }
  if (bonus === "MONEY") {
    return (
      <g>
        <circle r={6} fill="#d4a017" stroke="#1a1a1a" strokeWidth={0.6} />
        <text
          x={0}
          y={2.2}
          textAnchor="middle"
          fontSize={6}
          fontWeight={700}
          fill="#1a1a1a"
        >
          {value}
        </text>
      </g>
    );
  }
  if (bonus === "INCOME") {
    return (
      <g>
        <polygon
          points="0,-6 -5,4 5,4"
          fill="#fffdf6"
          stroke="#1a1a1a"
          strokeWidth={0.6}
        />
        <text
          x={0}
          y={2.5}
          textAnchor="middle"
          fontSize={5.5}
          fontWeight={700}
          fill="#1a1a1a"
        >
          {value}
        </text>
      </g>
    );
  }
  // DEVELOP — light bulb (not crossed out: bonus, not constraint)
  return (
    <g>
      <circle cx={0} cy={-1.5} r={3.6} fill="#f0d050" stroke="#1a1a1a" strokeWidth={0.6} />
      <rect x={-1.6} y={2} width={3.2} height={1.4} fill="#888" stroke="#1a1a1a" strokeWidth={0.4} />
      <rect x={-1.2} y={3.4} width={2.4} height={0.9} fill="#888" stroke="#1a1a1a" strokeWidth={0.4} />
      <text
        x={6}
        y={3}
        fontSize={5.5}
        fontWeight={700}
        fill="#1a1a1a"
      >
        {value}
      </text>
    </g>
  );
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function LinkToken({
  cx,
  cy,
  color,
  era,
}: {
  cx: number;
  cy: number;
  color: string;
  era: Era;
}) {
  // Small owner-coloured shape at the line midpoint. Boat-ish circle for
  // canal era, train-ish rect for rail era.
  if (era === "CANAL") {
    return (
      <g>
        <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="#1a1a1a" strokeWidth={1} />
      </g>
    );
  }
  return (
    <g>
      <rect
        x={cx - 6}
        y={cy - 3}
        width={12}
        height={6}
        rx={1}
        fill={color}
        stroke="#1a1a1a"
        strokeWidth={1}
      />
    </g>
  );
}

function Lines({
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
                <LinkToken cx={mx} cy={my} color={ownerColor} era={line.era} />
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
  const widgetH = innerPadY + coalRows * ROW_H + ROW_GAP + ICON + innerPadY;
  const colW = (widgetW - innerPadX * 2) / 2;
  const iconY = widgetH - innerPadY - ICON;
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
        rowsTopY={innerPadY}
        iconY={iconY}
        iconSize={ICON}
        rowH={ROW_H}
        colW={colW}
        glow={coalGlow}
      />
      <MarketColumn
        market={iron}
        industry="IRON_WORKS"
        cubeColor="#a8825a"
        x={innerPadX + colW}
        rowsTopY={innerPadY}
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
