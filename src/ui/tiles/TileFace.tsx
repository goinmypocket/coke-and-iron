// =============================================================================
// §2.9.3 Industry tile face — single component used everywhere a tile
// is drawn (board, mat). Always renders as a square of TILE × TILE
// units in the owner's pawn colour.
//
// All metadata glyphs (cubes / barrels / VP / link points / income /
// no-develop) come from the shared icon components in src/ui/icons/.
// This file only handles the tile background and corner positioning.
// =============================================================================

import type { IndustryName, IndustryTileSpec } from "../../engine";
import { BeerIcon } from "../icons/BeerIcon";
import { CoalIcon } from "../icons/CoalIcon";
import { DevelopIcon } from "../icons/DevelopIcon";
import { IncomeGainedIcon } from "../icons/IncomeGainedIcon";
import { IronIcon } from "../icons/IronIcon";
import { LinkPointsIcon } from "../icons/LinkPointsIcon";
import { VictoryPointsIcon } from "../icons/VictoryPointsIcon";
import { INDUSTRY_ICON } from "../industryIcons";

export const TILE = 28;

const ROMAN: readonly string[] = [
  "",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
];

interface TileFaceProps {
  spec: IndustryTileSpec;
  ownerColor: string;
  face: "unflipped" | "flipped";
  /** Live resource count drawn on the unflipped face for Coal/Iron/
   *  Brewery — cubes/barrels pack column-major from the bottom-right
   *  going up max two rows then leftward. Mat callers pass the level's
   *  capacity; board callers pass live remaining. */
  resources?: number;
  /** Optional count of remaining tiles at this level — rendered as
   *  N small dots at the bottom-left of the unflipped face. Used on
   *  the player mat. */
  stackCount?: number;
}

export function TileFace({
  spec,
  ownerColor,
  face,
  resources,
  stackCount,
}: TileFaceProps) {
  if (face === "flipped") {
    return <FlippedFace spec={spec} ownerColor={ownerColor} />;
  }
  return (
    <UnflippedFace
      spec={spec}
      ownerColor={ownerColor}
      resources={resources ?? 0}
      stackCount={stackCount}
    />
  );
}

function FlippedFace({
  spec,
  ownerColor,
}: {
  spec: IndustryTileSpec;
  ownerColor: string;
}) {
  const topColor = ownerColor;
  const bottomColor = mix(ownerColor, "#fffdf6", 0.55);
  return (
    <g>
      <rect width={TILE} height={TILE} rx={2} fill={topColor} />
      <rect y={TILE / 2} width={TILE} height={TILE / 2} fill={bottomColor} />
      <rect
        width={TILE}
        height={TILE}
        rx={2}
        fill="none"
        stroke="#1a1a1a"
        strokeWidth={0.7}
      />
      <CornerLevel level={spec.level} fill="#fffdf6" />
      <LinkCascade count={spec.linkPoints} x={TILE - 2} y={4} alignRight />
      {spec.vp > 0 ? (
        <VictoryPointsIcon x={1} y={TILE - 9} size={8} amount={spec.vp} />
      ) : null}
      {spec.incomeBonus > 0 ? (
        <IncomeGainedIcon
          x={TILE - 9}
          y={TILE - 9}
          size={8}
          amount={spec.incomeBonus}
        />
      ) : null}
      <CenterIcon industry={spec.industry} y={TILE * 0.62} />
    </g>
  );
}

function UnflippedFace({
  spec,
  ownerColor,
  resources,
  stackCount,
}: {
  spec: IndustryTileSpec;
  ownerColor: string;
  resources: number;
  stackCount: number | undefined;
}) {
  const tint = mix(ownerColor, "#fffdf6", 0.7);
  return (
    <g>
      <rect width={TILE} height={TILE} rx={2} fill={tint} />
      <rect
        width={TILE}
        height={TILE}
        rx={2}
        fill="none"
        stroke="#1a1a1a"
        strokeWidth={0.7}
      />
      <CornerLevel level={spec.level} fill="#1a1a1a" />
      <CornerBeerCost count={spec.beerToSell} />
      {spec.lightBulb ? (
        <DevelopIcon
          x={TILE - 7.5}
          y={TILE - 7.5}
          size={7}
          consumption
        />
      ) : null}
      <CenterIcon industry={spec.industry} y={TILE * 0.5} />
      {carriesResources(spec.industry) && resources > 0 ? (
        <ResourceTokens industry={spec.industry} count={resources} />
      ) : null}
      {stackCount !== undefined && stackCount > 0 ? (
        <StackDots count={stackCount} />
      ) : null}
    </g>
  );
}

function CornerBeerCost({ count }: { count: number }) {
  if (count <= 0) return null;
  // Pack up to 2 BeerIcon (consumption variant) at TR. count > 2 is
  // not produced by the published catalogue, but if it ever happens
  // we wrap to a second row.
  const size = 5;
  const tokens: JSX.Element[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    tokens.push(
      <BeerIcon
        key={i}
        x={TILE - size - 1 - col * (size + 0.5)}
        y={1 + row * (size + 0.5)}
        size={size}
        consumption
      />,
    );
  }
  return <g>{tokens}</g>;
}

/** Bottom-right packed token stack drawn on the unflipped face. Coal,
 *  iron, beer share the same packing geometry; the kind picks the
 *  glyph to render. */
function ResourceTokens({
  industry,
  count,
}: {
  industry: IndustryName;
  count: number;
}) {
  const size = 4.4;
  const gapH = 0.6;
  const gapV = 0.6;
  const inset = 1;
  const rightEdge = TILE - inset;
  const bottomEdge = TILE - inset;
  const colStep = size + gapH;
  const rowStep = size + gapV;
  const tokens: JSX.Element[] = [];
  for (let i = 0; i < count; i++) {
    const col = Math.floor(i / 2);
    const row = i % 2;
    const x = rightEdge - size - col * colStep;
    const y = bottomEdge - size - row * rowStep;
    if (industry === "COAL_MINE") {
      tokens.push(<CoalIcon key={i} x={x} y={y} size={size} />);
    } else if (industry === "IRON_WORKS") {
      tokens.push(<IronIcon key={i} x={x} y={y} size={size} />);
    } else {
      tokens.push(<BeerIcon key={i} x={x} y={y} size={size} />);
    }
  }
  return <g>{tokens}</g>;
}

function CornerLevel({ level, fill }: { level: number; fill: string }) {
  return (
    <text
      x={2}
      y={6.5}
      fontSize={5.5}
      fontWeight={700}
      fill={fill}
      style={{ pointerEvents: "none" }}
    >
      {ROMAN[level] ?? String(level)}
    </text>
  );
}

/** Cascade of N link icons starting at (x, y). When alignRight, x is
 *  the right edge and icons march leftward; otherwise x is the left
 *  edge. */
function LinkCascade({
  count,
  x,
  y,
  alignRight = false,
}: {
  count: number;
  x: number;
  y: number;
  alignRight?: boolean;
}) {
  if (count <= 0) return null;
  const size = 5.5;
  const step = size - 1.5;
  const tokens: JSX.Element[] = [];
  for (let i = 0; i < count; i++) {
    const ix = alignRight ? x - size - i * step : x + i * step;
    tokens.push(<LinkPointsIcon key={i} x={ix} y={y} size={size} />);
  }
  return <g>{tokens}</g>;
}

function CenterIcon({
  industry,
  y,
}: {
  industry: IndustryName;
  y: number;
}) {
  const size = TILE * 0.42;
  return (
    <image
      href={INDUSTRY_ICON[industry]}
      x={TILE / 2 - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

/** N small dots at the bottom-left of an unflipped tile, indicating
 *  the count of remaining tiles at this level on the mat. */
function StackDots({ count }: { count: number }) {
  const r = 1.1;
  const step = 2 * r + 1;
  const startX = 2 + r;
  const dots: JSX.Element[] = [];
  for (let i = 0; i < count; i++) {
    dots.push(
      <circle
        key={i}
        cx={startX + i * step}
        cy={TILE - 2.5}
        r={r}
        fill="#1a1a1a"
      />,
    );
  }
  return <g style={{ pointerEvents: "none" }}>{dots}</g>;
}

export function carriesResources(industry: IndustryName): boolean {
  return (
    industry === "COAL_MINE" ||
    industry === "IRON_WORKS" ||
    industry === "BREWERY"
  );
}

function mix(a: string, b: string, ratio: number): string {
  const A = parseHex(a);
  const B = parseHex(b);
  if (!A || !B) return a;
  const r = Math.round(A[0] * (1 - ratio) + B[0] * ratio);
  const g = Math.round(A[1] * (1 - ratio) + B[1] * ratio);
  const bl = Math.round(A[2] * (1 - ratio) + B[2] * ratio);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

function parseHex(s: string): [number, number, number] | null {
  const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1]!;
  const expand =
    h.length === 3
      ? h.split("").map((c) => c + c).join("")
      : h;
  return [
    parseInt(expand.slice(0, 2), 16),
    parseInt(expand.slice(2, 4), 16),
    parseInt(expand.slice(4, 6), 16),
  ];
}

function toHex(n: number): string {
  const v = Math.max(0, Math.min(255, n));
  return v.toString(16).padStart(2, "0");
}
