import type { CSSProperties } from "react";
import { VictoryPointsIcon } from "./VictoryPointsIcon";

/** Shared numbered VP badge; callers use this width to reserve board space. */
export function linkPointsIconWidth(count: number, size: number): number {
  return count > 0 ? size : 0;
}

export function LinkPointsIcon({ count = 1, ...props }: {
  count?: number; size?: number; x?: number; y?: number; style?: CSSProperties;
}) {
  if (count <= 0) return null;
  return <VictoryPointsIcon amount={count} {...props}
    label={`${count} victory points per adjacent link`} />;
}
