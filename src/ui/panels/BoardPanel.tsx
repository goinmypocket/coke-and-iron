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
  PlacedIndustryTile,
} from "../../engine";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { DISTRICT_FILL, INDUSTRY_ICON } from "../industryIcons";
import { Panel } from "../layout/Panel";
import { TILE, TileFace } from "../tiles/TileFace";
import { useWizard } from "../wizards/WizardProvider";

const CANVAS = 900;
// Every district city body is a fixed square. Slots are square cells
// of TILE × TILE laid out per slot count (§ user-spec):
//   1 → centred single cell
//   2 → 1 row × 2 cols
//   3 → 1 row × 2 cols + 1 centred cell below
//   4 → 2 rows × 2 cols
const CITY_SIZE = TILE * 2;
const MERCHANT_R = 30;

/** Top-left of slot cell within a CITY_SIZE × CITY_SIZE city body. */
function slotCellPos(
  slotIndex: number,
  slotCount: number,
): readonly [number, number] {
  if (slotCount <= 1) {
    return [TILE / 2, TILE / 2];
  }
  if (slotCount === 2) {
    return slotIndex === 0 ? [0, TILE / 2] : [TILE, TILE / 2];
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
  // owns the final validation (occupancy, era, specific-before-combo).
  const buildFilters = useGameState(
    (s) => {
      if (wizard.state.phase !== "AWAITING_BUILD_INPUTS") {
        return { cityName: null, industry: null };
      }
      const cardIndex = wizard.state.cardIndex;
      const industry = wizard.state.industry;
      let cityName: string | null = null;
      if (cardIndex !== null) {
        const id = s.turnOrder[s.currentPlayerIndex];
        const player = id !== undefined ? s.players.find((p) => p.id === id) : null;
        const card = player?.hand[cardIndex] ?? null;
        if (card?.kind === "LOCATION") cityName = card.cityName;
      }
      return { cityName, industry };
    },
    shallowEqual,
  );

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
        {view.merchantCities.map((m) => (
          <MerchantCityShape
            key={m.name}
            city={m}
            slots={view.merchantSlots
              .filter((ms) => ms.merchantCityName === m.name)
              .sort((a, b) => a.slotIndex - b.slotIndex)}
          />
        ))}
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
  const cityWrongForCard =
    cityFilter !== null && cityFilter !== city.name;
  return (
    <g
      className="board-city"
      transform={`translate(${x - CITY_SIZE / 2}, ${y - CITY_SIZE / 2})`}
      style={cityWrongForCard ? { opacity: 0.35 } : undefined}
    >
      <rect
        x={0}
        y={0}
        width={CITY_SIZE}
        height={CITY_SIZE}
        rx={4}
        fill={fill}
        fillOpacity={0.18}
        stroke={fill}
        strokeWidth={1.2}
      />
      <text
        x={CITY_SIZE / 2}
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

function SlotAcceptGlyph({
  accept,
}: {
  accept: readonly IndustryName[];
}) {
  // Slot cell is TILE × TILE; the glyph centres inside it.
  if (accept.length === 0) {
    return (
      <text
        x={TILE / 2}
        y={TILE / 2 + 3}
        className="board-slot__label"
        textAnchor="middle"
      >
        ANY
      </text>
    );
  }
  // Pack accept-list icons in a square grid inside the cell. 1-2 icons
  // sit on a single row; 3 icons → 2 on top + 1 centred below; 4+ →
  // 2×2 grid (capped). Icons stay sized so the rhythm matches a
  // single-icon slot.
  const n = accept.length;
  const cols = n <= 2 ? n : 2;
  const rows = n <= 2 ? 1 : Math.ceil(n / 2);
  const iconSize = Math.min(11, (TILE - 4) / Math.max(cols, rows));
  const cells: { ind: IndustryName; x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const isOddLast = n === 3 && i === 2;
    const col = isOddLast ? 0.5 : i % 2;
    const row = isOddLast ? 1 : Math.floor(i / 2);
    const x = TILE / 2 + (col - 0.5) * iconSize - iconSize / 2 + iconSize / 2;
    const y = TILE / 2 + (row - (rows - 1) / 2) * iconSize - iconSize / 2;
    cells.push({ ind: accept[i]!, x: x - iconSize / 2, y });
  }
  return (
    <g>
      {cells.map(({ ind, x, y }, i) => (
        <image
          key={ind + i}
          href={INDUSTRY_ICON[ind]}
          x={x}
          y={y}
          width={iconSize}
          height={iconSize}
          preserveAspectRatio="xMidYMid meet"
        />
      ))}
    </g>
  );
}

function MerchantCityShape({
  city,
  slots,
}: {
  city: MerchantCity;
  slots: readonly { hasBeer: boolean }[];
}) {
  const [x, y] = city.position;
  return (
    <g className="board-merchant" transform={`translate(${x}, ${y})`}>
      <circle r={MERCHANT_R} fill="#e5d9b4" stroke="#7d6a3a" strokeWidth={1.4} />
      <text
        y={-MERCHANT_R - 4}
        className="board-merchant__label"
        textAnchor="middle"
      >
        {city.name}
      </text>
      <text y={-2} className="board-merchant__bonus" textAnchor="middle">
        {city.bonus} {city.bonusValue}
      </text>
      <g transform={`translate(0, ${MERCHANT_R - 14})`}>
        {slots.map((slot, i) => {
          // Spread the beer markers along the bottom of the disc.
          const offset = (i - (slots.length - 1) / 2) * 9;
          return slot.hasBeer ? (
            <circle
              key={i}
              cx={offset}
              cy={0}
              r={3.5}
              fill="#c79b3f"
              stroke="#5b4516"
              strokeWidth={0.8}
            >
              <title>Merchant beer barrel available</title>
            </circle>
          ) : (
            <circle
              key={i}
              cx={offset}
              cy={0}
              r={3.5}
              fill="#fffdf6"
              stroke="#7d6a3a"
              strokeWidth={0.8}
              opacity={0.4}
            />
          );
        })}
      </g>
    </g>
  );
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
        const ox = city.position[0] - CITY_SIZE / 2 + cellX;
        const oy = city.position[1] - CITY_SIZE / 2 + cellY;
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
              context="board"
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
  // pick target (warm-gold border + tinted background); per-column
  // sub-glow on the active column.
  const widgetW = 160;
  const widgetH = 230;
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
      <text
        x={widgetW / 2}
        y={14}
        textAnchor="middle"
        className="board-markets__title"
      >
        Markets
      </text>
      <MarketColumn
        market={coal}
        label="Coal"
        cubeColor="#1a1a1a"
        x={12}
        glow={coalGlow}
      />
      <MarketColumn
        market={iron}
        label="Iron"
        cubeColor="#a8825a"
        x={88}
        glow={ironGlow}
      />
    </g>
  );
}

function MarketColumn({
  market,
  label,
  cubeColor,
  x,
  glow,
}: {
  market: Market;
  label: string;
  cubeColor: string;
  x: number;
  glow: boolean;
}) {
  // Stack tiers from highest price (top) to lowest (bottom). Header
  // strip + a row per priced tier. The top row is the overflow tier
  // (always two cubes, signalling unlimited supply at that price);
  // sells never land there.
  //
  // Header strip per spec §2.11.3:
  //   "<Label> — Buy £X · Sell £Y · N/<priced-max> cubes"
  //   when priced range empty:  Buy reads "£<overflow> (overflow)"
  //   when priced range full:   Sell reads "—"
  const tiers = market.tiers;
  const rowH = 18;
  const total = market.filled.reduce((a, n) => a + n, 0);
  const max = tiers.length * 2;
  const filledIdx = market.filled.findIndex((n) => n > 0);
  const isEmpty = filledIdx === -1;
  const buyText = isEmpty
    ? `£${market.overflowPrice} (overflow)`
    : `£${market.tiers[filledIdx]}`;
  // Highest empty priced tier (most-expensive-empty-first sell rule).
  let nextSell: number | null = null;
  for (let t = tiers.length - 1; t >= 0; t--) {
    if ((market.filled[t] ?? 0) < 2) {
      nextSell = tiers[t] ?? null;
      break;
    }
  }
  const sellText = nextSell === null ? "—" : `£${nextSell}`;
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
      transform={`translate(${x}, 28)`}
      className={glow ? "board-markets__col board-markets__col--active" : "board-markets__col"}
    >
      <text
        x={0}
        y={0}
        className="board-markets__row-label"
        fill={glow ? "var(--warm-gold)" : undefined}
      >
        {label}
      </text>
      <text x={0} y={12} className="board-markets__row-data">
        Buy {buyText}
      </text>
      <text x={0} y={22} className="board-markets__row-data">
        Sell {sellText}
      </text>
      <text x={0} y={32} className="board-markets__row-data">
        {total}/{max} cubes
      </text>
      <g transform="translate(0, 40)">
        {rows.map((row, rowIdx) => (
          <g key={rowIdx} transform={`translate(0, ${rowIdx * rowH})`}>
            <text
              x={0}
              y={9}
              className={
                row.isOverflow
                  ? "board-markets__tier-price board-markets__tier-price--overflow"
                  : "board-markets__tier-price"
              }
            >
              £{row.price}
              {row.isOverflow ? "+" : ""}
            </text>
            {[0, 1].map((slot) => (
              <circle
                key={slot}
                cx={26 + slot * 14}
                cy={6}
                r={4.5}
                fill={slot < row.cubes ? cubeColor : "#fffdf6"}
                stroke="#1a1a1a"
                strokeWidth={0.7}
                strokeDasharray={row.isOverflow ? "1.5 1.5" : undefined}
              />
            ))}
          </g>
        ))}
      </g>
    </g>
  );
}
