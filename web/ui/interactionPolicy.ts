import type { GameState, IndustryTileSpec } from "../../engine";

/** UI availability only. The engine remains authoritative about legal moves. */
export function canTakeTurn(state: GameState, actualSeatId: number | null, paused: boolean): boolean {
  return !paused && actualSeatId !== null &&
    state.turnOrder[state.currentPlayerIndex] === actualSeatId &&
    state.phase === "PLAYER_TURNS" && state.pendingShortfalls.length === 0;
}

export function canPickIndustry(spec: IndustryTileSpec | undefined | null, build: boolean): boolean {
  return spec != null && (build || !spec.lightBulb);
}

/** Developing repeatedly advances through the stack; Build keeps the top tile. */
export function nextIndustryTile(
  stack: readonly number[], catalogue: readonly IndustryTileSpec[],
  build: boolean, pickedCount: number,
): IndustryTileSpec | undefined {
  const index = stack[build ? 0 : pickedCount];
  return index === undefined ? undefined : catalogue[index];
}

/** Check at activation time as a pause may arrive after a callback was captured. */
export function guardChoice<Args extends unknown[]>(allowed: () => boolean, callback: (...args: Args) => void): (...args: Args) => void {
  return (...args) => { if (allowed()) callback(...args); };
}
