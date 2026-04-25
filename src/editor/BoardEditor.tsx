import { useCallback, useMemo, useRef } from "react";
import {
  CityBanners,
  cityBodyDims,
  DistrictCityShape,
  MerchantCityShape,
} from "../ui/panels/BoardPanel";
import type {
  DistrictCity as EngineDistrictCity,
  IndustryName as EngineIndustryName,
  MerchantBonus as EngineMerchantBonus,
  MerchantCity as EngineMerchantCity,
  MerchantTileAccept,
} from "../engine";
import {
  CANVAS,
  clampToCanvas,
  slotAcceptList,
  snap,
  type CitiesConfigRaw,
  type CityRaw,
  type EditorMode,
  type LinkEra,
  type LinksConfigRaw,
  type MerchantCityRaw,
  type Position,
} from "./types";

const MARKET_W = 60;
const MARKET_H = 60;
const EMPTY_OCCUPIED: ReadonlySet<string> = new Set<string>();
const EMPTY_MERCHANT_SLOT_MAP: ReadonlyMap<
  number,
  { accept: MerchantTileAccept; hasBeer: boolean }
> = new Map();
const noop = () => {};

interface Props {
  cities: CitiesConfigRaw;
  links: LinksConfigRaw;
  mode: EditorMode;
  selectedCity: string | null;
  selectedMerchant: string | null;
  selectedLink: { era: LinkEra; index: number } | null;
  pendingLinkStart: string | null;
  onUpdateCities: (next: CitiesConfigRaw) => void;
  onUpdateLinks: (next: LinksConfigRaw) => void;
  onSelectCity: (name: string) => void;
  onSelectMerchant: (name: string) => void;
  onSelectLink: (sel: { era: LinkEra; index: number } | null) => void;
  setPendingLinkStart: (name: string | null) => void;
}

export function BoardEditor({
  cities,
  links,
  mode,
  selectedCity,
  selectedMerchant,
  selectedLink,
  pendingLinkStart,
  onUpdateCities,
  onUpdateLinks,
  onSelectCity,
  onSelectMerchant,
  onSelectLink,
  setPendingLinkStart,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Tracks whether the last pointerup was preceded by a drag, so we can
  // suppress the click-to-select that fires after a drag.
  const dragMovedRef = useRef(false);

  const positionByName = useMemo(() => {
    const m = new Map<string, Position>();
    for (const c of cities.cities) m.set(c.name, c.position);
    for (const c of cities.merchantCities) m.set(c.name, c.position);
    return m;
  }, [cities]);

  // Convert the editor's raw config into the engine's shapes so the
  // imported live-board components can render the preview directly.
  // This is the whole point of using the in-game renderer here: the
  // editor preview and the actual game board stay visually in sync.
  const engineDistrictCities = useMemo(
    () => cities.cities.map(rawCityToDistrict),
    [cities],
  );
  const engineMerchantCities = useMemo(
    () => cities.merchantCities.map(rawMerchantToMerchant),
    [cities],
  );

  const linkEra: LinkEra | null =
    mode === "canal" ? "canal" : mode === "rail" ? "rail" : null;

  const eventToCanvas = useCallback(
    (clientX: number, clientY: number): Position | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const sx = (clientX - rect.left) / rect.width;
      const sy = (clientY - rect.top) / rect.height;
      return [sx * CANVAS, sy * CANVAS];
    },
    [],
  );

  const applyPosition = useCallback(
    (
      kind: "city" | "merchant" | "market",
      name: string | null,
      pos: Position,
    ) => {
      if (kind === "city" && name) {
        onUpdateCities({
          ...cities,
          cities: cities.cities.map((c) =>
            c.name === name ? { ...c, position: pos } : c,
          ),
        });
      } else if (kind === "merchant" && name) {
        onUpdateCities({
          ...cities,
          merchantCities: cities.merchantCities.map((c) =>
            c.name === name ? { ...c, position: pos } : c,
          ),
        });
      } else if (kind === "market") {
        onUpdateCities({
          ...cities,
          marketPlace: { ...cities.marketPlace, position: pos },
        });
      }
    },
    [cities, onUpdateCities],
  );

  const startDrag = useCallback(
    (
      kind: "city" | "merchant" | "market",
      name: string | null,
      pointerId: number,
      target: Element,
    ) => {
      dragMovedRef.current = false;
      target.setPointerCapture(pointerId);

      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        const pos = eventToCanvas(e.clientX, e.clientY);
        if (!pos) return;
        dragMovedRef.current = true;
        const x = snap(clampToCanvas(pos[0]));
        const y = snap(clampToCanvas(pos[1]));
        applyPosition(kind, name, [x, y]);
      };
      const onUp = () => {
        target.removeEventListener("pointermove", onMove as EventListener);
        target.removeEventListener("pointerup", onUp as EventListener);
        target.removeEventListener("pointercancel", onUp as EventListener);
      };
      target.addEventListener("pointermove", onMove as EventListener);
      target.addEventListener("pointerup", onUp as EventListener);
      target.addEventListener("pointercancel", onUp as EventListener);
    },
    [eventToCanvas, applyPosition],
  );

  const handleCityClick = useCallback(
    (name: string) => {
      if (dragMovedRef.current) return;
      if (linkEra) {
        if (pendingLinkStart === null) {
          setPendingLinkStart(name);
        } else if (pendingLinkStart === name) {
          setPendingLinkStart(null);
        } else {
          // Add a new link between pendingLinkStart and name.
          const arr = links[linkEra];
          const exists = arr.some(
            (eps) =>
              eps.length === 2 &&
              eps.includes(pendingLinkStart) &&
              eps.includes(name),
          );
          if (!exists) {
            const nextLinks: LinksConfigRaw = {
              ...links,
              [linkEra]: [...arr, [pendingLinkStart, name]],
            };
            onUpdateLinks(nextLinks);
          }
          setPendingLinkStart(null);
        }
        return;
      }
      if (mode === "cities") onSelectCity(name);
    },
    [
      linkEra,
      pendingLinkStart,
      links,
      onUpdateLinks,
      setPendingLinkStart,
      mode,
      onSelectCity,
    ],
  );

  const handleMerchantClick = useCallback(
    (name: string) => {
      if (dragMovedRef.current) return;
      if (linkEra) {
        if (pendingLinkStart === null) {
          setPendingLinkStart(name);
        } else if (pendingLinkStart === name) {
          setPendingLinkStart(null);
        } else {
          const arr = links[linkEra];
          const exists = arr.some(
            (eps) =>
              eps.length === 2 &&
              eps.includes(pendingLinkStart) &&
              eps.includes(name),
          );
          if (!exists) {
            onUpdateLinks({
              ...links,
              [linkEra]: [...arr, [pendingLinkStart, name]],
            });
          }
          setPendingLinkStart(null);
        }
        return;
      }
      if (mode === "merchants") onSelectMerchant(name);
    },
    [
      linkEra,
      pendingLinkStart,
      links,
      onUpdateLinks,
      setPendingLinkStart,
      mode,
      onSelectMerchant,
    ],
  );

  const handleLinkClick = useCallback(
    (era: LinkEra, index: number) => {
      onSelectLink({ era, index });
    },
    [onSelectLink],
  );

  return (
    <svg
      ref={svgRef}
      className="editor-svg"
      viewBox={`0 0 ${CANVAS} ${CANVAS}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={0} y={0} width={CANVAS} height={CANVAS} fill="#f3edd8" />
      <Grid />

      <LinesLayer
        links={links}
        positionByName={positionByName}
        activeEra={linkEra}
        selectedLink={selectedLink}
        onLinkClick={handleLinkClick}
      />

      {engineDistrictCities.map((engineCity, i) => {
        const raw = cities.cities[i]!;
        const isSelected = selectedCity === raw.name;
        const isHighlighted = pendingLinkStart === raw.name;
        const dim = linkEra !== null && pendingLinkStart === null ? 0.85 : 1;
        return (
          <g
            key={raw.name}
            style={{ cursor: "pointer", opacity: dim }}
            onPointerDown={(e) => {
              if (mode === "cities") {
                startDrag("city", raw.name, e.pointerId, e.currentTarget);
              }
            }}
            onClick={() => handleCityClick(raw.name)}
          >
            <DistrictCityShape
              city={engineCity}
              occupied={EMPTY_OCCUPIED}
              slotsClickable={false}
              cityFilter={null}
              industryFilter={null}
              picked={null}
              onSlotClick={noop}
            />
            <SelectionRing
              cx={engineCity.position[0]}
              cy={engineCity.position[1]}
              w={cityBodyDims(engineCity.slots.length)[0]}
              h={cityBodyDims(engineCity.slots.length)[1]}
              selected={isSelected}
              highlighted={isHighlighted}
            />
          </g>
        );
      })}

      {engineMerchantCities.map((engineMerchant, i) => {
        const raw = cities.merchantCities[i]!;
        const isSelected = selectedMerchant === raw.name;
        const isHighlighted = pendingLinkStart === raw.name;
        const slotCount = Math.max(engineMerchant.slotCount, 1);
        // Match the live MerchantCityShape's bounding box: width =
        // slotCount * TILE, but the visible cluster (incl. badges) is
        // taller. The selection ring just rings the slot row.
        const w = slotCount * 40; // TILE = 40 in TileFace.tsx
        const h = 40;
        return (
          <g
            key={raw.name}
            style={{ cursor: "pointer" }}
            onPointerDown={(e) => {
              if (mode === "merchants") {
                startDrag("merchant", raw.name, e.pointerId, e.currentTarget);
              }
            }}
            onClick={() => handleMerchantClick(raw.name)}
          >
            <MerchantCityShape
              city={engineMerchant}
              slotMap={EMPTY_MERCHANT_SLOT_MAP}
              active={false}
            />
            <SelectionRing
              cx={engineMerchant.position[0]}
              cy={engineMerchant.position[1]}
              w={w}
              h={h}
              selected={isSelected}
              highlighted={isHighlighted}
            />
          </g>
        );
      })}

      <CityBanners
        districtCities={engineDistrictCities}
        merchantCities={engineMerchantCities}
      />

      <MarketShape
        position={cities.marketPlace.position}
        onPointerDown={(e) => {
          if (mode === "cities" || mode === "merchants") {
            startDrag("market", null, e.pointerId, e.currentTarget);
          }
        }}
      />

      {linkEra && pendingLinkStart ? (
        <PendingLinkHint name={pendingLinkStart} />
      ) : null}
    </svg>
  );
}

function rawCityToDistrict(c: CityRaw): EngineDistrictCity {
  return {
    name: c.name,
    districtTag: c.district,
    position: c.position,
    slots: c.slots.map((s) => ({
      acceptList: slotAcceptList(s) as readonly EngineIndustryName[],
    })),
    farmBrewery: c.farmBrewery ?? false,
  };
}

function rawMerchantToMerchant(m: MerchantCityRaw): EngineMerchantCity {
  return {
    name: m.name,
    position: m.position,
    slotCount: m.slots,
    bonus: m.bonus as EngineMerchantBonus,
    bonusValue: m.bonusValue,
    linkPoints: m.linkPoints,
    activePlayerCounts: m.activePlayerCounts,
  };
}

function SelectionRing({
  cx,
  cy,
  w,
  h,
  selected,
  highlighted,
}: {
  cx: number;
  cy: number;
  w: number;
  h: number;
  selected: boolean;
  highlighted: boolean;
}) {
  if (!selected && !highlighted) return null;
  const stroke = selected ? "#d4a017" : "#1f6feb";
  const PAD = 4;
  return (
    <rect
      x={cx - w / 2 - PAD}
      y={cy - h / 2 - PAD}
      width={w + PAD * 2}
      height={h + PAD * 2}
      rx={4}
      fill="none"
      stroke={stroke}
      strokeWidth={2.5}
      strokeDasharray="4 3"
      pointerEvents="none"
    />
  );
}

function Grid() {
  // Faint 50px grid so it's easier to position cities visually.
  const lines: number[] = [];
  for (let i = 50; i < CANVAS; i += 50) lines.push(i);
  return (
    <g className="editor-grid">
      {lines.map((v) => (
        <line
          key={`v${v}`}
          x1={v}
          y1={0}
          x2={v}
          y2={CANVAS}
          stroke="#d8cfa8"
          strokeWidth={0.5}
        />
      ))}
      {lines.map((v) => (
        <line
          key={`h${v}`}
          x1={0}
          y1={v}
          x2={CANVAS}
          y2={v}
          stroke="#d8cfa8"
          strokeWidth={0.5}
        />
      ))}
    </g>
  );
}

function LinesLayer({
  links,
  positionByName,
  activeEra,
  selectedLink,
  onLinkClick,
}: {
  links: LinksConfigRaw;
  positionByName: ReadonlyMap<string, Position>;
  activeEra: LinkEra | null;
  selectedLink: { era: LinkEra; index: number } | null;
  onLinkClick: (era: LinkEra, index: number) => void;
}) {
  const eras: LinkEra[] = ["canal", "rail"];
  return (
    <g className="editor-lines">
      {eras.map((era) => {
        const arr = links[era];
        const isActiveEra = activeEra === era;
        const baseColor = era === "canal" ? "#5e8fc7" : "#9c7656";
        return arr.map((endpoints, i) => {
          const points = endpoints
            .map((n) => positionByName.get(n))
            .filter((p): p is Position => p !== undefined);
          if (points.length < 2) return null;
          const isSelected =
            selectedLink && selectedLink.era === era && selectedLink.index === i;
          const stroke = isSelected ? "#d4a017" : baseColor;
          const opacity = activeEra === null
            ? 0.4
            : isActiveEra
              ? 0.85
              : 0.12;
          const width = isSelected ? 6 : isActiveEra ? 4 : 2.5;
          const clickable = isActiveEra;
          const onClick = clickable ? () => onLinkClick(era, i) : undefined;
          if (points.length === 2) {
            return (
              <g
                key={`${era}-${i}`}
                className={
                  "editor-line" + (clickable ? " editor-line--clickable" : "")
                }
                onClick={onClick}
              >
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
          const cx = points.reduce((a, p) => a + p[0], 0) / points.length;
          const cy = points.reduce((a, p) => a + p[1], 0) / points.length;
          return (
            <g
              key={`${era}-${i}`}
              className={
                "editor-line" + (clickable ? " editor-line--clickable" : "")
              }
              onClick={onClick}
            >
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
              <circle cx={cx} cy={cy} r={3} fill={stroke} fillOpacity={opacity} />
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
        });
      })}
    </g>
  );
}

function MarketShape({
  position,
  onPointerDown,
}: {
  position: Position;
  onPointerDown: (e: React.PointerEvent<SVGGElement>) => void;
}) {
  const [x, y] = position;
  return (
    <g
      className="editor-market"
      transform={`translate(${x - MARKET_W / 2}, ${y - MARKET_H / 2})`}
      onPointerDown={onPointerDown}
      style={{ cursor: "pointer" }}
    >
      <rect
        x={0}
        y={0}
        width={MARKET_W}
        height={MARKET_H}
        rx={4}
        fill="#d8cfa8"
        stroke="#7d6a3a"
        strokeWidth={1.2}
        strokeDasharray="3 3"
      />
      <text
        x={MARKET_W / 2}
        y={MARKET_H / 2 + 4}
        textAnchor="middle"
        className="editor-market__label"
      >
        Market
      </text>
    </g>
  );
}

function PendingLinkHint({ name }: { name: string }) {
  return (
    <text
      x={CANVAS / 2}
      y={20}
      textAnchor="middle"
      className="editor-link-hint"
    >
      Linking from <tspan fontWeight="600">{name}</tspan> — click another city
      to add the link, or click {name} again to cancel.
    </text>
  );
}
