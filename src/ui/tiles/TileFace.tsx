// =============================================================================
// §2.9.3 Industry tile face — single component used everywhere a tile
// is drawn (board, mat). Always renders as a square of TILE × TILE
// units in the owner's pawn colour.
//
// Two faces:
//   - "unflipped" — TL level, TR crossed-out beer (if beerToSell > 0),
//     BL production count cube + N (Coal/Iron/Brewery only), BR
//     no-Develop bulb (Pottery light-bulb only), centre industry
//     icon. The build cost (money / coal / iron) is NOT on the tile —
//     it lives in the mat row's cost-icon column (§11.3).
//   - "flipped" — TL level, TR link points, BL VP hex, BR income
//     arrow, centre industry icon. Top half full pawn colour, bottom
//     half a paler tint of the same colour.
// =============================================================================

import type { IndustryName, IndustryTileSpec } from "../../engine";
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
   *  Brewery — cubes pack column-major from the bottom-right going
   *  up max two rows then leftward. Mat callers pass the level's
   *  capacity; board callers pass live remaining. Ignored for
   *  non-resource industries and for the flipped face. */
  resources?: number;
}

export function TileFace({ spec, ownerColor, face, resources }: TileFaceProps) {
  if (face === "flipped") {
    return <FlippedFace spec={spec} ownerColor={ownerColor} />;
  }
  return (
    <UnflippedFace
      spec={spec}
      ownerColor={ownerColor}
      resources={resources ?? 0}
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
      <CornerLinkPoints linkPoints={spec.linkPoints} ownerColor={ownerColor} />
      <CornerVp vp={spec.vp} />
      <CornerIncome income={spec.incomeBonus} />
      <CenterIcon industry={spec.industry} y={TILE * 0.62} />
    </g>
  );
}

function UnflippedFace({
  spec,
  ownerColor,
  resources,
}: {
  spec: IndustryTileSpec;
  ownerColor: string;
  resources: number;
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
      {spec.beerToSell > 0 ? (
        <CornerBeerCrossed count={spec.beerToSell} />
      ) : null}
      {spec.lightBulb ? <CornerNoDev /> : null}
      <CenterIcon industry={spec.industry} y={TILE * 0.5} />
      {carriesResources(spec.industry) && resources > 0 ? (
        <ResourceCubes industry={spec.industry} count={resources} />
      ) : null}
    </g>
  );
}

/** Bottom-right packed cube stack drawn directly on the tile face.
 *  Cubes pack column-major from the bottom-right corner, going up to
 *  a max of 2 rows before starting a new column to the left. */
function ResourceCubes({
  industry,
  count,
}: {
  industry: IndustryName;
  count: number;
}) {
  const cubeSize = 3.6;
  const gapH = 0.7;
  const gapV = 0.7;
  const inset = 1.2;
  const rightEdge = TILE - inset;
  const bottomEdge = TILE - inset;
  const colStep = cubeSize + gapH;
  const rowStep = cubeSize + gapV;
  const tokens: JSX.Element[] = [];
  for (let i = 0; i < count; i++) {
    const col = Math.floor(i / 2);
    const row = i % 2;
    const x = rightEdge - cubeSize - col * colStep;
    const y = bottomEdge - cubeSize - row * rowStep;
    tokens.push(<TileCube key={i} industry={industry} x={x} y={y} size={cubeSize} />);
  }
  return <g style={{ pointerEvents: "none" }}>{tokens}</g>;
}

function TileCube({
  industry,
  x,
  y,
  size,
}: {
  industry: IndustryName;
  x: number;
  y: number;
  size: number;
}) {
  if (industry === "BREWERY") {
    return (
      <ellipse
        cx={x + size / 2}
        cy={y + size / 2}
        rx={size / 2}
        ry={size / 2 + 0.3}
        fill="#c79b3f"
        stroke="#5b4516"
        strokeWidth={0.25}
      />
    );
  }
  const fill = industry === "COAL_MINE" ? "#1a1a1a" : "#a8825a";
  const strokeColor = industry === "COAL_MINE" ? "#fffdf6" : "#1a1a1a";
  return (
    <rect
      x={x}
      y={y}
      width={size}
      height={size}
      fill={fill}
      stroke={strokeColor}
      strokeWidth={0.25}
    />
  );
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

function CornerLinkPoints({
  linkPoints,
  ownerColor,
}: {
  linkPoints: number;
  ownerColor: string;
}) {
  if (linkPoints <= 0) return null;
  const dots: JSX.Element[] = [];
  for (let i = 0; i < linkPoints; i++) {
    dots.push(
      <circle
        key={i}
        cx={TILE - 3 - i * 3}
        cy={3.5}
        r={1.1}
        fill="#fffdf6"
        stroke={ownerColor}
        strokeWidth={0.4}
      />,
    );
  }
  return <g>{dots}</g>;
}

function CornerBeerCrossed({ count }: { count: number }) {
  // TR: beer-barrel ellipse with diagonal red strikethrough.
  const cx = TILE - 5.5;
  const cy = 5.5;
  const rx = 3.2;
  const ry = 2.6;
  return (
    <g style={{ pointerEvents: "none" }}>
      <title>Beer cost — consumed when this tile sells</title>
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="#c79b3f"
        stroke="#5b4516"
        strokeWidth={0.4}
      />
      {/* Two horizontal stave lines for barrel character. */}
      <line x1={cx - rx + 0.3} y1={cy - 0.5} x2={cx + rx - 0.3} y2={cy - 0.5} stroke="#5b4516" strokeWidth={0.25} />
      <line x1={cx - rx + 0.3} y1={cy + 0.7} x2={cx + rx - 0.3} y2={cy + 0.7} stroke="#5b4516" strokeWidth={0.25} />
      <line
        x1={cx - rx - 0.4}
        y1={cy + ry + 0.4}
        x2={cx + rx + 0.4}
        y2={cy - ry - 0.4}
        stroke="#b03030"
        strokeWidth={0.9}
        strokeLinecap="round"
      />
      {count > 1 ? (
        <text
          x={cx + rx + 1.2}
          y={cy + 1.5}
          fontSize={3.3}
          fontWeight={700}
          fill="#1a1a1a"
        >
          {count}
        </text>
      ) : null}
    </g>
  );
}

function CornerVp({ vp }: { vp: number }) {
  if (vp <= 0) return null;
  const cx = 5;
  const cy = TILE - 5;
  const r = 4;
  const points = hexPoints(cx, cy, r);
  return (
    <g>
      <polygon
        points={points}
        fill="#fffdf6"
        stroke="#1a1a1a"
        strokeWidth={0.5}
      />
      <text
        x={cx}
        y={cy + 1.5}
        fontSize={4}
        fontWeight={700}
        textAnchor="middle"
        fill="#1a1a1a"
        style={{ pointerEvents: "none" }}
      >
        {vp}
      </text>
    </g>
  );
}

function CornerIncome({ income }: { income: number }) {
  if (income <= 0) return null;
  const cx = TILE - 5;
  const cy = TILE - 5;
  return (
    <g>
      <polygon
        points={`${cx},${cy - 3} ${cx - 3},${cy + 2} ${cx + 3},${cy + 2}`}
        fill="#fffdf6"
        stroke="#1a1a1a"
        strokeWidth={0.5}
      />
      <text
        x={cx}
        y={cy + 1.5}
        fontSize={3.5}
        fontWeight={700}
        textAnchor="middle"
        fill="#1a1a1a"
        style={{ pointerEvents: "none" }}
      >
        {income}
      </text>
    </g>
  );
}

function CornerNoDev() {
  // BR: small bulb-with-strikethrough. Yellow bulb body + grey base
  // + diagonal red strike. Only Pottery light-bulb tiles render this.
  const cx = TILE - 4;
  const cy = TILE - 4.3;
  return (
    <g style={{ pointerEvents: "none" }}>
      <title>Cannot Develop</title>
      <circle
        cx={cx}
        cy={cy - 0.5}
        r={1.7}
        fill="#f0d050"
        stroke="#1a1a1a"
        strokeWidth={0.3}
      />
      <rect
        x={cx - 0.9}
        y={cy + 1}
        width={1.8}
        height={0.7}
        fill="#888"
        stroke="#1a1a1a"
        strokeWidth={0.2}
      />
      <line
        x1={cx - 2.3}
        y1={cy + 2.3}
        x2={cx + 2.3}
        y2={cy - 2.3}
        stroke="#b03030"
        strokeWidth={0.85}
        strokeLinecap="round"
      />
    </g>
  );
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

export function carriesResources(industry: IndustryName): boolean {
  return (
    industry === "COAL_MINE" ||
    industry === "IRON_WORKS" ||
    industry === "BREWERY"
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
