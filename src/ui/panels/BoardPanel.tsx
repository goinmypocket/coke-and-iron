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
import { Panel } from "../layout/Panel";
import { useWizard } from "../wizards/WizardProvider";

const CANVAS = 900;
const CITY_W = 78;
const CITY_H = 38;
const MERCHANT_R = 30;

const INDUSTRY_GLYPH: Readonly<Record<IndustryName, string>> = {
  COAL_MINE: "C",
  IRON_WORKS: "I",
  BREWERY: "B",
  COTTON_MILL: "Co",
  MANUFACTURER: "M",
  POTTERY: "P",
};

const DISTRICT_FILL: Readonly<Record<string, string>> = {
  purple: "#8a6fb0",
  brown: "#9c7656",
  red: "#c75e5e",
  blue: "#5e8fc7",
  teal: "#5eb0a8",
  farm: "#a89568",
};

export function BoardPanel() {
  const wizard = useWizard();
  const view = useGameState((s) => ({
    era: s.era,
    districtCities: s.districtCities,
    merchantCities: s.merchantCities,
    lines: s.lines,
    builtTiles: s.builtTiles,
    developedLinks: s.developedLinks,
    tileCatalogue: s.tileCatalogue,
    coalMarket: s.coalMarket,
    ironMarket: s.ironMarket,
  }), shallowEqual);

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
  const developedLineIndices = useMemo(() => {
    const set = new Set<number>();
    for (const l of view.developedLinks) set.add(l.lineIndex);
    return set;
  }, [view.developedLinks]);

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
          developedLineIndices={developedLineIndices}
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
          <MerchantCityShape key={m.name} city={m} />
        ))}
        <BuiltTiles
          tiles={view.builtTiles}
          tileCatalogue={view.tileCatalogue}
          districtCities={view.districtCities}
          sellMode={sellMode}
          activeSeatId={activeSeatId}
          sellPickedTileIds={sellPickedTileIds}
          onTileClick={(tileId) => wizard.pickTile(tileId)}
        />
        <Markets coal={view.coalMarket} iron={view.ironMarket} />
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
  picked,
  onSlotClick,
}: {
  city: DistrictCity;
  occupied: ReadonlySet<string>;
  slotsClickable: boolean;
  picked: number | null;
  onSlotClick: (slotIndex: number) => void;
}) {
  const [x, y] = city.position;
  const fill = DISTRICT_FILL[city.districtTag] ?? "#aaaaaa";
  const slotW = CITY_W / Math.max(city.slots.length, 1);
  return (
    <g className="board-city" transform={`translate(${x - CITY_W / 2}, ${y - CITY_H / 2})`}>
      <rect
        x={0}
        y={0}
        width={CITY_W}
        height={CITY_H}
        rx={4}
        fill={fill}
        fillOpacity={0.18}
        stroke={fill}
        strokeWidth={1.2}
      />
      <text
        x={CITY_W / 2}
        y={-4}
        className="board-city__label"
        textAnchor="middle"
      >
        {city.name}
      </text>
      <g transform={`translate(0, ${CITY_H / 2 - 6})`}>
        {city.slots.map((slot, i) => {
          const isOccupied = occupied.has(`${city.name}#${i}`);
          const isPicked = picked === i;
          // Build wizard accepts ANY slot click — engine validates the
          // overbuild rules per §5.1.3. Empty slots are the common case;
          // filled slots may resolve to overbuild (own tile, or
          // Coal Mine / Iron Works with global supply exhausted) and
          // get a different fill so the hover distinction is obvious.
          const clickable = slotsClickable;
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
              transform={`translate(${i * slotW}, 0)`}
              className={cls}
              onClick={clickable ? () => onSlotClick(i) : undefined}
            >
              <rect
                x={1}
                y={-7}
                width={slotW - 2}
                height={14}
                fill={isOccupied ? "#d8d4c2" : "#fffdf6"}
                stroke={isPicked ? "var(--warm-gold)" : fill}
                strokeWidth={isPicked ? 2 : 0.8}
              />
              <text
                x={slotW / 2}
                y={3}
                className="board-slot__label"
                textAnchor="middle"
              >
                {slotGlyph(slot.acceptList)}
              </text>
            </g>
          );
        })}
      </g>
    </g>
  );
}

function slotGlyph(accept: readonly IndustryName[]): string {
  if (accept.length === 0) return "ANY";
  return accept.map((i) => INDUSTRY_GLYPH[i]).join("/");
}

function MerchantCityShape({ city }: { city: MerchantCity }) {
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
      <text y={2} className="board-merchant__bonus" textAnchor="middle">
        {city.bonus} {city.bonusValue}
      </text>
      <text
        y={MERCHANT_R - 6}
        className="board-merchant__slots"
        textAnchor="middle"
      >
        ×{city.slotCount}
      </text>
    </g>
  );
}

function Lines({
  lines,
  era,
  cityByName,
  developedLineIndices,
  linesClickable,
  pickedLineIndices,
  onLineClick,
}: {
  lines: readonly Line[];
  era: Era;
  cityByName: ReadonlyMap<string, readonly [number, number]>;
  developedLineIndices: ReadonlySet<number>;
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
        const developed = developedLineIndices.has(i);
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
  sellMode,
  activeSeatId,
  sellPickedTileIds,
  onTileClick,
}: {
  tiles: readonly PlacedIndustryTile[];
  tileCatalogue: readonly IndustryTileSpec[];
  districtCities: readonly DistrictCity[];
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
        const slotCount = Math.max(city.slots.length, 1);
        const slotW = CITY_W / slotCount;
        const ox = city.position[0] - CITY_W / 2 + t.slotIndex * slotW + 2;
        const oy = city.position[1] + CITY_H / 2 + 4;
        const clickable =
          sellMode &&
          t.owner === activeSeatId &&
          !t.flipped &&
          SELLABLE_INDUSTRIES.has(spec.industry);
        const isPicked = sellPickedTileIds.has(t.id);
        const cls = clickable
          ? "board-tile board-tile--clickable"
          : "board-tile";
        return (
          <g
            key={t.id}
            transform={`translate(${ox}, ${oy})`}
            className={cls}
            onClick={clickable ? () => onTileClick(t.id) : undefined}
          >
            <rect
              width={slotW - 4}
              height={16}
              rx={2}
              fill={t.flipped ? "#d8d4c2" : "#fffdf6"}
              stroke={isPicked ? "var(--warm-gold)" : "#1a1a1a"}
              strokeWidth={isPicked ? 2 : 0.8}
            />
            <text
              x={(slotW - 4) / 2}
              y={11}
              className="board-tile__label"
              textAnchor="middle"
            >
              {INDUSTRY_GLYPH[spec.industry]}
              {spec.level}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Markets({ coal, iron }: { coal: Market; iron: Market }) {
  return (
    <g
      className="board-markets"
      transform={`translate(${CANVAS - 170}, ${CANVAS - 110})`}
    >
      <rect
        x={0}
        y={0}
        width={160}
        height={100}
        fill="#fffdf6"
        stroke="#1a1a1a"
        strokeWidth={1}
      />
      <text x={80} y={16} textAnchor="middle" className="board-markets__title">
        Markets
      </text>
      <MarketRow market={coal} label="Coal" yOffset={32} />
      <MarketRow market={iron} label="Iron" yOffset={64} />
    </g>
  );
}

function MarketRow({
  market,
  label,
  yOffset,
}: {
  market: Market;
  label: string;
  yOffset: number;
}) {
  const cubes = market.filled.reduce((a, n) => a + n, 0);
  const filledIdx = market.filled.findIndex((n) => n > 0);
  const buyPrice =
    filledIdx === -1 ? market.overflowPrice : market.tiers[filledIdx];
  return (
    <g transform={`translate(8, ${yOffset})`}>
      <text x={0} y={0} className="board-markets__row-label">
        {label}
      </text>
      <text x={0} y={14} className="board-markets__row-data">
        cubes ×{cubes} · buy £{buyPrice}
      </text>
    </g>
  );
}
