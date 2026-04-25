// =============================================================================
// §11.3 Mat right column — sibling of TileFace inside a mat row.
//
// Coal Mine / Iron Works / Brewery → resource cubes packed column-major
// from the bottom-right corner of the column, growing upward to a max
// of 2 rows before starting a new column to the left. Coal renders as
// a black square cube, iron as an orange square cube, brewery as a
// beer-barrel ellipse.
//
// Cotton Mill / Manufacturer / Pottery → bonus icons stacked vertically:
// VP hex on top, income arrow in the middle, link-point cluster on
// the bottom. Cells whose value is 0 drop out so a tile with only one
// of the three doesn't look top-heavy.
// =============================================================================

import type { IndustryName, IndustryTileSpec } from "../../engine";
import { TILE, carriesResources } from "./TileFace";

export const SIDE_COL_W = 22;

const CUBE = 6;
const CUBE_GAP_H = 1;
const CUBE_GAP_V = 1;
const CUBE_INSET = 1;

export function TileSideColumn({
  spec,
  resources,
}: {
  spec: IndustryTileSpec;
  resources: number;
}) {
  const isResource = carriesResources(spec.industry);
  return (
    <svg
      className="mat-side-col"
      width={SIDE_COL_W}
      height={TILE}
      viewBox={`0 0 ${SIDE_COL_W} ${TILE}`}
      aria-hidden
    >
      {isResource ? (
        <CubeStack industry={spec.industry} count={resources} />
      ) : (
        <BonusStack
          vp={spec.vp}
          income={spec.incomeBonus}
          linkPoints={spec.linkPoints}
        />
      )}
    </svg>
  );
}

function CubeStack({
  industry,
  count,
}: {
  industry: IndustryName;
  count: number;
}) {
  if (count <= 0) return null;
  const rightEdge = SIDE_COL_W - CUBE_INSET;
  const bottomEdge = TILE - CUBE_INSET;
  const colStep = CUBE + CUBE_GAP_H;
  const rowStep = CUBE + CUBE_GAP_V;
  const cubes: JSX.Element[] = [];
  for (let i = 0; i < count; i++) {
    const col = Math.floor(i / 2);
    const row = i % 2;
    const x = rightEdge - CUBE - col * colStep;
    const y = bottomEdge - CUBE - row * rowStep;
    cubes.push(<ResourceToken key={i} industry={industry} x={x} y={y} />);
  }
  return <g>{cubes}</g>;
}

function ResourceToken({
  industry,
  x,
  y,
}: {
  industry: IndustryName;
  x: number;
  y: number;
}) {
  if (industry === "BREWERY") {
    const cx = x + CUBE / 2;
    const cy = y + CUBE / 2;
    return (
      <ellipse
        cx={cx}
        cy={cy}
        rx={CUBE / 2}
        ry={CUBE / 2 + 0.4}
        fill="#c79b3f"
        stroke="#5b4516"
        strokeWidth={0.4}
      />
    );
  }
  const fill = industry === "COAL_MINE" ? "#1a1a1a" : "#a8825a";
  const strokeColor = industry === "COAL_MINE" ? "#fffdf6" : "#1a1a1a";
  return (
    <rect
      x={x}
      y={y}
      width={CUBE}
      height={CUBE}
      fill={fill}
      stroke={strokeColor}
      strokeWidth={0.4}
    />
  );
}

function BonusStack({
  vp,
  income,
  linkPoints,
}: {
  vp: number;
  income: number;
  linkPoints: number;
}) {
  // Vertical layout: top → vp, middle → income, bottom → links.
  // Each row is up to ~9 tall in the 28-tall column. The row only
  // renders if its value is > 0 so a tile with only one of the
  // three doesn't end up top-heavy.
  const rowH = 9;
  const cx = SIDE_COL_W / 2;
  const items: { y: number; render: () => JSX.Element }[] = [];
  if (vp > 0) {
    items.push({
      y: 0,
      render: () => <VpHex cx={cx} cy={rowH / 2} value={vp} />,
    });
  }
  if (income > 0) {
    items.push({
      y: rowH,
      render: () => <IncomeArrow cx={cx} cy={rowH + rowH / 2} value={income} />,
    });
  }
  if (linkPoints > 0) {
    items.push({
      y: 2 * rowH,
      render: () => (
        <LinkCascade cx={cx} cy={2 * rowH + rowH / 2} count={linkPoints} />
      ),
    });
  }
  return <g>{items.map((it, i) => <g key={i}>{it.render()}</g>)}</g>;
}

function VpHex({ cx, cy, value }: { cx: number; cy: number; value: number }) {
  const r = 4;
  return (
    <g>
      <polygon
        points={hexPoints(cx, cy, r)}
        fill="#fffdf6"
        stroke="#1a1a1a"
        strokeWidth={0.5}
      />
      <text
        x={cx}
        y={cy + 1.7}
        fontSize={4.5}
        fontWeight={700}
        textAnchor="middle"
        fill="#1a1a1a"
      >
        {value}
      </text>
    </g>
  );
}

function IncomeArrow({
  cx,
  cy,
  value,
}: {
  cx: number;
  cy: number;
  value: number;
}) {
  // Up-pointing triangle with the value inside.
  const w = 8;
  const h = 7;
  const top = cy - h / 2;
  const bottom = cy + h / 2;
  return (
    <g>
      <polygon
        points={`${cx},${top} ${cx - w / 2},${bottom} ${cx + w / 2},${bottom}`}
        fill="#fffdf6"
        stroke="#1a1a1a"
        strokeWidth={0.5}
      />
      <text
        x={cx}
        y={cy + 2.2}
        fontSize={4}
        fontWeight={700}
        textAnchor="middle"
        fill="#1a1a1a"
      >
        {value}
      </text>
    </g>
  );
}

function LinkCascade({
  cx,
  cy,
  count,
}: {
  cx: number;
  cy: number;
  count: number;
}) {
  // Cascade dots horizontally, centred on cx. Up to 2 in the published
  // config; rendered offset so the cluster shows all dots distinctly.
  const r = 1.4;
  const step = 2 * r + 1;
  const totalW = step * (count - 1);
  const startX = cx - totalW / 2;
  const dots: JSX.Element[] = [];
  for (let i = 0; i < count; i++) {
    dots.push(
      <circle
        key={i}
        cx={startX + i * step}
        cy={cy}
        r={r}
        fill="#fffdf6"
        stroke="#1a1a1a"
        strokeWidth={0.4}
      />,
    );
  }
  return <g>{dots}</g>;
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}
