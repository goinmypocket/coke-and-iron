// =============================================================================
// §2.9.3 Industry tile face — single component used everywhere a tile
// is drawn (board, mat). Always renders as a square of TILE × TILE
// units. Owner pawn colour fills the body so the player can read which
// seat owns the tile at a glance.
//
// Two faces:
//   - "unflipped" — the industry side. Corners: TL level (Roman), TR
//     link-point cluster, BL cost block (£N + coal/iron costs), BR
//     income arrow with step count. Centre band carries the industry
//     icon. On the board, Coal Mine / Iron Works / Brewery additionally
//     paint a resource strip across the bottom (§2.9.3.d). On the mat
//     the BL is the cost block as authored.
//   - "flipped" — the VP side. Corners: TL level (Roman, in beige),
//     TR link-point cluster, BL VP hex with the scored VP, BR income
//     arrow. No resource strip. The top half is darkened with the
//     pawn colour at full saturation; the bottom half holds the icon
//     band over a paler tint of the same colour.
//
// On the player's mat we show the flipped face — the side-margin
// alongside each row carries the cost details that the flipped face
// drops, so the mat still surfaces every piece of info per the user's
// requirement that the mat reveal what the unflipped side shows.
// =============================================================================

import type { IndustryName, IndustryTileSpec } from "../../engine";
import { INDUSTRY_ICON } from "../industryIcons";

export const TILE = 28;

// Resource strip constants — single global set per §2.9.3.e so every
// resource render uses the same rhythm.
const STRIP_HEIGHT = 7;
const STRIP_INSET = 1.5;
const TOKEN_SIZE = 2.6;
const TOKEN_GAP_H = 1;
const TOKEN_GAP_V = 1;

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
  // For board-unflipped: live resource count drives the resource
  // strip. Mat / board-flipped ignore this field.
  resources?: number;
  // For unflipped mat tiles, the cost block goes in BL. For
  // unflipped board tiles, the cost block is replaced by a resource
  // strip (Coal/Iron/Brewery). Pottery/Cotton/Manufacturer board-
  // unflipped have an empty BL.
  context: "mat" | "board";
}

export function TileFace({
  spec,
  ownerColor,
  face,
  resources,
  context,
}: TileFaceProps) {
  if (face === "flipped") {
    return <FlippedFace spec={spec} ownerColor={ownerColor} />;
  }
  return (
    <UnflippedFace
      spec={spec}
      ownerColor={ownerColor}
      resources={resources ?? 0}
      context={context}
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
  // Top half full pawn colour (darker reading); bottom half a paler
  // tint so the level / VP / icon all read against contrasting fields.
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
      {spec.lightBulb ? <CornerLightBulb /> : null}
      <CenterIcon industry={spec.industry} y={TILE * 0.62} />
    </g>
  );
}

function UnflippedFace({
  spec,
  ownerColor,
  resources,
  context,
}: {
  spec: IndustryTileSpec;
  ownerColor: string;
  resources: number;
  context: "mat" | "board";
}) {
  const tint = mix(ownerColor, "#fffdf6", 0.7);
  const showResourceStrip =
    context === "board" && carriesResources(spec.industry);
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
      <CornerLinkPoints linkPoints={spec.linkPoints} ownerColor={ownerColor} />
      {context === "mat" ? (
        <CornerCost
          costMoney={spec.costMoney}
          coalCost={spec.coalCost}
          ironCost={spec.ironCost}
        />
      ) : null}
      <CornerIncome income={spec.incomeBonus} />
      {spec.lightBulb ? <CornerLightBulb /> : null}
      <CenterIcon industry={spec.industry} y={showResourceStrip ? TILE * 0.42 : TILE * 0.5} />
      {showResourceStrip ? (
        <ResourceStrip industry={spec.industry} count={resources} ownerColor={ownerColor} />
      ) : null}
    </g>
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
  // Stack small dots at TR, one per link point.
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

function CornerCost({
  costMoney,
  coalCost,
  ironCost,
}: {
  costMoney: number;
  coalCost: number;
  ironCost: number;
}) {
  // BL: stacked cost lines. Tight at this tile size — single-line £N
  // with optional resource indicators stacked above.
  const lines: string[] = [];
  if (coalCost > 0) lines.push(`${coalCost}c`);
  if (ironCost > 0) lines.push(`${ironCost}i`);
  return (
    <g>
      <text
        x={2}
        y={TILE - 2}
        fontSize={5}
        fontWeight={600}
        fill="#1a1a1a"
        style={{ pointerEvents: "none" }}
      >
        £{costMoney}
      </text>
      {lines.map((l, i) => (
        <text
          key={i}
          x={2}
          y={TILE - 2 - 5 * (lines.length - i)}
          fontSize={4.5}
          fill="#1a1a1a"
          style={{ pointerEvents: "none" }}
        >
          {l}
        </text>
      ))}
    </g>
  );
}

function CornerVp({ vp }: { vp: number }) {
  if (vp <= 0) return null;
  // BL hex with VP value inside (flipped face).
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
  // BR: small upward arrow with step count.
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

function CornerLightBulb() {
  // Tiny bulb-with-strikethrough centred along the top edge — signals
  // "cannot Develop" without colliding with the corner badges (level
  // TL, link points TR).
  const cx = TILE / 2;
  const cy = 3.5;
  const w = 4.2;
  const h = 4.2;
  const left = cx - w / 2;
  const top = cy - h / 2;
  return (
    <g style={{ pointerEvents: "none" }}>
      <title>Light-bulb — cannot Develop</title>
      <circle
        cx={cx}
        cy={cy - 0.4}
        r={1.4}
        fill="#f0d050"
        stroke="#1a1a1a"
        strokeWidth={0.3}
      />
      <rect
        x={cx - 0.7}
        y={cy + 0.8}
        width={1.4}
        height={0.6}
        fill="#888"
        stroke="#1a1a1a"
        strokeWidth={0.2}
      />
      <line
        x1={left}
        y1={top + h}
        x2={left + w}
        y2={top}
        stroke="#b03030"
        strokeWidth={0.6}
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

function ResourceStrip({
  industry,
  count,
  ownerColor,
}: {
  industry: IndustryName;
  count: number;
  ownerColor: string;
}) {
  if (count <= 0) return null;
  // Pack column-major from bottom-right (§2.9.3.d). Worst case is a
  // level-3 Coal Mine at 5 cubes / level-4 Iron Works at 6 cubes; the
  // strip dimensions are sized so those fit without overflow.
  const yTop = TILE - STRIP_HEIGHT;
  const xRight = TILE - STRIP_INSET;
  const yBottom = TILE - STRIP_INSET;
  const colStep = TOKEN_SIZE + TOKEN_GAP_H;
  const rowStep = TOKEN_SIZE + TOKEN_GAP_V;
  const tokens: JSX.Element[] = [];
  // tokens-per-column = how many fit vertically inside the strip.
  const usableHeight = STRIP_HEIGHT - 2 * STRIP_INSET;
  const perColumn = Math.max(1, Math.floor((usableHeight + TOKEN_GAP_V) / rowStep));
  for (let i = 0; i < count; i++) {
    const col = Math.floor(i / perColumn);
    const rowFromBottom = i % perColumn;
    const cx = xRight - TOKEN_SIZE / 2 - col * colStep;
    const cy = yBottom - TOKEN_SIZE / 2 - rowFromBottom * rowStep;
    tokens.push(
      <ResourceToken
        key={i}
        kind={resourceKindFor(industry)}
        cx={cx}
        cy={cy}
        ownerColor={ownerColor}
      />,
    );
  }
  return (
    <g>
      <rect
        x={0}
        y={yTop}
        width={TILE}
        height={STRIP_HEIGHT}
        fill="rgba(0,0,0,0.06)"
      />
      {tokens}
    </g>
  );
}

function ResourceToken({
  kind,
  cx,
  cy,
  ownerColor,
}: {
  kind: "coal" | "iron" | "beer";
  cx: number;
  cy: number;
  ownerColor: string;
}) {
  const half = TOKEN_SIZE / 2;
  if (kind === "coal") {
    return (
      <rect
        x={cx - half}
        y={cy - half}
        width={TOKEN_SIZE}
        height={TOKEN_SIZE}
        fill="#1a1a1a"
        stroke="#fffdf6"
        strokeWidth={0.2}
      />
    );
  }
  if (kind === "iron") {
    return (
      <rect
        x={cx - half}
        y={cy - half}
        width={TOKEN_SIZE}
        height={TOKEN_SIZE}
        fill="#a8825a"
        stroke="#1a1a1a"
        strokeWidth={0.2}
      />
    );
  }
  // beer barrel — tiny ellipse
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={half}
      ry={half * 1.1}
      fill="#c79b3f"
      stroke="#5b4516"
      strokeWidth={0.2}
    >
      <title>Beer (owner {ownerColor})</title>
    </ellipse>
  );
}

function carriesResources(industry: IndustryName): boolean {
  return (
    industry === "COAL_MINE" ||
    industry === "IRON_WORKS" ||
    industry === "BREWERY"
  );
}

function resourceKindFor(industry: IndustryName): "coal" | "iron" | "beer" {
  if (industry === "COAL_MINE") return "coal";
  if (industry === "IRON_WORKS") return "iron";
  return "beer";
}

function hexPoints(cx: number, cy: number, r: number): string {
  // Pointy-top hex.
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

/** Linear blend between two CSS hex colours by ratio of `b` (0..1). */
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
