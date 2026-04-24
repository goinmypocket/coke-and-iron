// =============================================================================
// Connectivity graph over the board.
//
// Edges are the entries in state.developedLinks. Each developed link refers
// to state.lines[lineIndex], whose endpoints are 2 or 3 city names (§2.6,
// §2.6.1). A triple link is ONE edge — BFS hops across it reach the other
// two endpoints in a single step (§2.6.1 "Connectivity / traversal").
//
// Two concepts matter here (§2.18):
//   - CONNECTION  — transitive reachability through ANY player's developed
//     links. Governs resource reachability (§5.6) and merchant reach (§5.4).
//   - NETWORK     — per-player relation: a city is in player P's network if
//     P owns a tile there OR P owns a link adjacent to it. NON-transitive.
//     Governs where P may Build (§5.1 step 1).
//
// We don't memoise: this module runs per dispatch, and BFS over ≤60 lines
// + whatever subset is developed is trivially cheap. If profiling says
// otherwise, the graph can be cached on GameState.
// =============================================================================

import type { GameState, PlayerId } from "../types";

/**
 * Multi-source BFS over the any-player connectivity graph. Returns a map
 * from city → hop distance to the nearest entry in `fromCities`. Cities
 * not reachable are absent from the result.
 */
export function buildDistanceMap(
  state: GameState,
  fromCities: readonly string[],
): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const city of fromCities) {
    if (!dist.has(city)) {
      dist.set(city, 0);
      queue.push(city);
    }
  }

  const linesByEndpoint = indexLinesByEndpoint(state);
  const developedLineIndices = new Set<number>(
    state.developedLinks.map((dl) => dl.lineIndex),
  );

  while (queue.length > 0) {
    const city = queue.shift()!;
    const d = dist.get(city)!;
    const adj = linesByEndpoint.get(city);
    if (!adj) continue;
    for (const lineIdx of adj) {
      if (!developedLineIndices.has(lineIdx)) continue;
      const line = state.lines[lineIdx];
      if (!line) continue;
      for (const endpoint of line.endpoints) {
        if (!dist.has(endpoint)) {
          dist.set(endpoint, d + 1);
          queue.push(endpoint);
        }
      }
    }
  }

  return dist;
}

/** §2.18 — is there any path of any-player developed links between `city`
 * and some merchant city? Covers active OR inert merchants per §2.11.1. */
export function isConnectedToAnyMerchantCity(
  state: GameState,
  city: string,
): boolean {
  const dist = buildDistanceMap(state, [city]);
  return state.merchantCities.some((m) => dist.has(m.name));
}

/** §2.18 — is `city` part of `playerId`'s network? NON-transitive: owning
 * a tile at `city`, or owning a link whose endpoints include `city`. */
export function isInPlayerNetwork(
  state: GameState,
  playerId: PlayerId,
  city: string,
): boolean {
  for (const tile of state.builtTiles) {
    if (tile.owner === playerId && tile.cityName === city) return true;
  }
  for (const dl of state.developedLinks) {
    if (dl.owner !== playerId) continue;
    const line = state.lines[dl.lineIndex];
    if (line && line.endpoints.includes(city)) return true;
  }
  return false;
}

/** A player's network is empty iff they own no tiles AND no links. §5.1
 * grants a first-build exemption only when this returns true. */
export function isPlayerNetworkEmpty(
  state: GameState,
  playerId: PlayerId,
): boolean {
  if (state.builtTiles.some((t) => t.owner === playerId)) return false;
  if (state.developedLinks.some((dl) => dl.owner === playerId)) return false;
  return true;
}

function indexLinesByEndpoint(state: GameState): Map<string, number[]> {
  const map = new Map<string, number[]>();
  state.lines.forEach((line, i) => {
    for (const ep of line.endpoints) {
      const arr = map.get(ep);
      if (arr) arr.push(i);
      else map.set(ep, [i]);
    }
  });
  return map;
}
