// =============================================================================
// §2.9.3 Industry tile face — single component used everywhere a tile
// is drawn (board, mat). Always renders as a square of TILE × TILE
// units in the owner's pawn colour.
//
// SCALING: internal geometry is authored at BASE_TILE = 28, the
// historical tile size. The output is wrapped in a `scale(TILE_SCALE)`
// transform so the rendered tile fills TILE × TILE units in the host
// SVG. Bumping `TILE` is the single knob that resizes tiles on the
// main board AND in player-mat rows; `LINK_TILE_HEIGHT` and
// `MAT_TILE_PX` are derived from it as ratios so they bump together.
//
// All metadata glyphs (cubes / barrels / VP / link points / income /
// no-develop) come from the shared icon components in src/ui/icons/.
// This file only handles the tile background and corner positioning.
// =============================================================================

import type { IndustryName, IndustryTileSpec } from "../../../engine";
import { BeerIcon } from "../icons/BeerIcon";
import { CoalIcon } from "../icons/CoalIcon";
import { DevelopIcon } from "../icons/DevelopIcon";
import { IncomeGainedIcon } from "../icons/IncomeGainedIcon";
import { IronIcon } from "../icons/IronIcon";
import {
  LinkPointsIcon,
  linkPointsIconWidth,
} from "../icons/LinkPointsIcon";
import { VictoryPointsIcon } from "../icons/VictoryPointsIcon";
import { INDUSTRY_ICON } from "../industryIcons";

/** Internal coordinate system unit. Internal geometry is authored at
 *  this scale and never references TILE directly; the wrapper transform
 *  maps it to the exported TILE size. */
const BASE_TILE = 28;
/** Tile edge length in host-SVG units. Sole knob for tile size. */
export const TILE = 40;
const TILE_SCALE = TILE / BASE_TILE;
/** Link-tile height as a fraction of TILE — keeps the link-to-tile
 *  visual ratio constant regardless of TILE. */
export const LINK_TILE_RATIO = 0.32;
export const LINK_TILE_HEIGHT = TILE * LINK_TILE_RATIO;
export const LINK_TILE_WIDTH = LINK_TILE_HEIGHT * 2;
/** Display size of a mat tile in CSS pixels — also derived from TILE
 *  so player mats grow / shrink in lock-step with the main board. */
export const MAT_TILE_PX = TILE * 1.4;
/** Single source of truth for the corner level (Roman numeral) fill.
 *  Shared by the unflipped and flipped faces so the two never drift
 *  apart. */
const CORNER_LEVEL_FILL = "#1a1a1a";
/** Size (in BASE_TILE units) of every hexagonal badge — VP, link
 *  points, income gained, plus the cascade above the flipped face and
 *  the bonus stack on the mat side column. Defined in one place so
 *  the hex glyphs read at a uniform size across a tile face and the
 *  mat region around it. */
export const HEX_ICON_SIZE = 8;

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
  const topColor = mix(ownerColor, "#ffffff", 0.7);
  const bottomColor = mix(ownerColor, "#ffffff", 0.55);
  return (
    <g transform={`scale(${TILE_SCALE})`}>
      <rect width={BASE_TILE} height={BASE_TILE} rx={2} fill={topColor} />
      <rect
        y={BASE_TILE / 2}
        width={BASE_TILE}
        height={BASE_TILE / 2}
        fill={bottomColor}
      />
      <rect
        width={BASE_TILE}
        height={BASE_TILE}
        rx={2}
        fill="none"
        stroke="#1a1a1a"
        strokeWidth={0.7}
      />
      <CornerLevel level={spec.level} />
      <LinkCascade
        count={spec.linkPoints}
        x={BASE_TILE - 2}
        y={1}
        alignRight
      />
      {spec.vp > 0 ? (
        <VictoryPointsIcon
          x={1}
          y={BASE_TILE - HEX_ICON_SIZE - 1}
          size={HEX_ICON_SIZE}
          amount={spec.vp}
        />
      ) : null}
      {spec.incomeBonus > 0 ? (
        <IncomeGainedIcon
          x={BASE_TILE - HEX_ICON_SIZE - 1}
          y={BASE_TILE - HEX_ICON_SIZE - 1}
          size={HEX_ICON_SIZE}
          amount={spec.incomeBonus}
        />
      ) : null}
      <CenterIcon industry={spec.industry} y={BASE_TILE * 0.5} />
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
  const tint = mix(ownerColor, "#ffffff", 0.7);
  return (
    <g transform={`scale(${TILE_SCALE})`}>
      <rect width={BASE_TILE} height={BASE_TILE} rx={2} fill={tint} />
      <rect
        width={BASE_TILE}
        height={BASE_TILE}
        rx={2}
        fill="none"
        stroke="#1a1a1a"
        strokeWidth={0.7}
      />
      <CornerLevel level={spec.level} />
      <CornerBeerCost count={spec.beerToSell} />
      {spec.lightBulb ? (
        <DevelopIcon
          x={BASE_TILE - 7.5}
          y={BASE_TILE - 7.5}
          size={7}
          consumption
        />
      ) : null}
      <CenterIcon industry={spec.industry} y={BASE_TILE * 0.5} />
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
        x={BASE_TILE - size - 1 - col * (size + 0.5)}
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
  const rightEdge = BASE_TILE - inset;
  const bottomEdge = BASE_TILE - inset;
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

function CornerLevel({ level }: { level: number }) {
  return (
    <text
      x={2}
      y={6.5}
      fontSize={5.5}
      fontWeight={700}
      fill={CORNER_LEVEL_FILL}
      style={{ pointerEvents: "none" }}
    >
      {ROMAN[level] ?? String(level)}
    </text>
  );
}

/** One numbered VP hexagon. When `alignRight`, the badge's
 *  right edge sits at `x`; otherwise its left edge does.
 *  Delegates to the shared LinkPointsIcon so the flipped tile face,
 *  the mat side column, and the merchant badges all render link
 *  points with identical geometry. */
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
  const size = HEX_ICON_SIZE;
  const stripW = linkPointsIconWidth(count, size);
  const left = alignRight ? x - stripW : x;
  return <LinkPointsIcon x={left} y={y} size={size} count={count} />;
}

function CenterIcon({
  industry,
  y,
}: {
  industry: IndustryName;
  y: number;
}) {
  // The simple industry icons read clearly when bumped from the
  // historical 0.42 ratio to 0.55, leaving room for the corner level
  // glyph (TL), beer-cost cubes (TR), and resource-cube stack (BR) on
  // the unflipped face.
  const size = BASE_TILE * 0.55;
  return (
    <image
      href={INDUSTRY_ICON[industry]}
      x={BASE_TILE / 2 - size / 2}
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
        cy={BASE_TILE - 2.5}
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
  // Normalize the default CSS colour names before mixing a quiet paper tint.
  const named: Readonly<Record<string, string>> = {
    red: "#a44a42", yellow: "#ae8834", green: "#45765c", blue: "#476c9c",
  };
  s = named[s] ?? s;
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
