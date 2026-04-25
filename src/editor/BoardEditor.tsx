import { useCallback, useMemo, useRef, useState } from "react";
import {
  CANVAS,
  DISTRICT_FILL,
  INDUSTRY_GLYPH,
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
  type RawSlot,
} from "./types";

const CITY_W = 78;
const CITY_H = 38;
const MERCHANT_R = 30;
const MARKET_W = 60;
const MARKET_H = 60;

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
    [eventToCanvas, cities, onUpdateCities],
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
        // Merchants can be link endpoints too (Shrewsbury, Oxford,
        // Gloucester, Nottingham, Warrington in the published map).
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

      {cities.cities.map((c) => (
        <CityShape
          key={c.name}
          city={c}
          selected={selectedCity === c.name}
          highlighted={pendingLinkStart === c.name}
          dimWhenLink={linkEra !== null && pendingLinkStart === null}
          onPointerDown={(e) => {
            if (mode === "cities") {
              startDrag("city", c.name, e.pointerId, e.currentTarget);
            }
          }}
          onClick={() => handleCityClick(c.name)}
        />
      ))}

      {cities.merchantCities.map((m) => (
        <MerchantShape
          key={m.name}
          merchant={m}
          selected={selectedMerchant === m.name}
          highlighted={pendingLinkStart === m.name}
          onPointerDown={(e) => {
            if (mode === "merchants") {
              startDrag("merchant", m.name, e.pointerId, e.currentTarget);
            }
          }}
          onClick={() => handleMerchantClick(m.name)}
        />
      ))}

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

function CityShape({
  city,
  selected,
  highlighted,
  dimWhenLink,
  onPointerDown,
  onClick,
}: {
  city: CityRaw;
  selected: boolean;
  highlighted: boolean;
  dimWhenLink: boolean;
  onPointerDown: (e: React.PointerEvent<SVGGElement>) => void;
  onClick: () => void;
}) {
  const [x, y] = city.position;
  const fill = DISTRICT_FILL[city.district] ?? "#aaaaaa";
  const slotW = CITY_W / Math.max(city.slots.length, 1);
  const stroke = selected
    ? "#d4a017"
    : highlighted
      ? "#1f6feb"
      : fill;
  const strokeWidth = selected || highlighted ? 2.5 : 1.2;
  const opacity = dimWhenLink ? 0.85 : 1;
  return (
    <g
      className="editor-city"
      transform={`translate(${x - CITY_W / 2}, ${y - CITY_H / 2})`}
      onPointerDown={onPointerDown}
      onClick={onClick}
      style={{ opacity, cursor: "pointer" }}
    >
      <rect
        x={0}
        y={0}
        width={CITY_W}
        height={CITY_H}
        rx={4}
        fill={fill}
        fillOpacity={0.18}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <text
        x={CITY_W / 2}
        y={-4}
        className="editor-city__label"
        textAnchor="middle"
      >
        {city.name}
      </text>
      <g transform={`translate(0, ${CITY_H / 2 - 6})`}>
        {city.slots.map((slot, i) => (
          <SlotCell
            key={i}
            slot={slot}
            offset={i * slotW}
            width={slotW}
            stroke={fill}
          />
        ))}
      </g>
      {city.farmBrewery ? (
        <text
          x={CITY_W / 2}
          y={CITY_H + 12}
          className="editor-city__sub"
          textAnchor="middle"
        >
          farm brewery
        </text>
      ) : null}
    </g>
  );
}

function SlotCell({
  slot,
  offset,
  width,
  stroke,
}: {
  slot: RawSlot;
  offset: number;
  width: number;
  stroke: string;
}) {
  const accept = slotAcceptList(slot);
  return (
    <g transform={`translate(${offset}, 0)`}>
      <rect
        x={1}
        y={-7}
        width={width - 2}
        height={14}
        fill="#fffdf6"
        stroke={stroke}
        strokeWidth={0.8}
      />
      <text
        x={width / 2}
        y={3}
        className="editor-slot__label"
        textAnchor="middle"
      >
        {accept.length === 0
          ? "ANY"
          : accept.map((i) => INDUSTRY_GLYPH[i]).join("/")}
      </text>
    </g>
  );
}

function MerchantShape({
  merchant,
  selected,
  highlighted,
  onPointerDown,
  onClick,
}: {
  merchant: MerchantCityRaw;
  selected: boolean;
  highlighted: boolean;
  onPointerDown: (e: React.PointerEvent<SVGGElement>) => void;
  onClick: () => void;
}) {
  const [x, y] = merchant.position;
  const stroke = selected
    ? "#d4a017"
    : highlighted
      ? "#1f6feb"
      : "#7d6a3a";
  const strokeWidth = selected || highlighted ? 2.5 : 1.4;
  return (
    <g
      className="editor-merchant"
      transform={`translate(${x}, ${y})`}
      onPointerDown={onPointerDown}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      <circle
        r={MERCHANT_R}
        fill="#e5d9b4"
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <text
        y={-MERCHANT_R - 4}
        className="editor-merchant__label"
        textAnchor="middle"
      >
        {merchant.name}
      </text>
      <text y={-2} className="editor-merchant__bonus" textAnchor="middle">
        {merchant.bonus} {merchant.bonusValue}
      </text>
      <text y={14} className="editor-merchant__sub" textAnchor="middle">
        {merchant.slots} slot{merchant.slots === 1 ? "" : "s"}
      </text>
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
