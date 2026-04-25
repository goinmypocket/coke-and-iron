import { describe, expect, it } from "vitest";
import { initialState } from "../../src/engine";

// §4.4 / §13 Rules item 2 — "Rounds per era: 8 / 9 / 10 at 4 / 3 / 2 players."
//
// The engine doesn't hard-code rounds-per-era. Instead the canal-era
// deck is sized so that, after every player has played all their actions
// across N rounds, all hands and the draw deck are simultaneously empty
// and the era ends.
//
// Per-player accounting at end of era:
//   - 8 cards dealt to start (will be played out by era end)
//   - canal-removed: 1 face-down card per player (never played)
//   - cards played: round 1 = 1, rounds 2..N = 2 each → 2N − 1 per player
//
// Sum across hands + drawDeck + removedCards at SETUP (before any play):
//   total = 8P (initial hands) + (2N − 1)P (drawDeck) + P (canal-removed)
//         = P · (2N + 8)
//
// But initial hands are PART of the cards-played, so the cards still in
// deck at setup are (2N − 1 − 8 + 8) = (2N − 1) cards/player worth in deck
// + 8/player in hands. Either way, total = P · 2N + canal-removed (= P).
// So total = P · (2N + 1) — but canal-removed is included in the P term:
//
//   total = P · (2N − 1) + 8P + P  (removed) = P(2N + 8)
//
// Hmm — actual cards.json totals (40 / 54 / 64) imply total = P · 2N
// because the canal-removed P is counted INSIDE the (2N) accounting:
//   2P, N=10: 40 = 2 · 20 ✓
//   3P, N=9:  54 = 3 · 18 ✓
//   4P, N=8:  64 = 4 · 16 ✓
// — i.e. the rule of thumb is total cards = P · 2N.

const ROUNDS_BY_PLAYER_COUNT: Readonly<Record<2 | 3 | 4, number>> = {
  2: 10,
  3: 9,
  4: 8,
};

describe("§4.4 rounds per era — canonical deck sizes", () => {
  for (const playerCount of [2, 3, 4] as const) {
    const N = ROUNDS_BY_PLAYER_COUNT[playerCount];
    const expectedTotal = playerCount * 2 * N;

    it(`${playerCount} players → deck composition supports exactly ${N} rounds`, () => {
      const state = initialState({ seed: 1, playerCount });
      const handTotal = state.players.reduce(
        (acc, p) => acc + p.hand.length,
        0,
      );
      const total =
        state.drawDeck.length + state.removedCards.length + handTotal;
      expect(total).toBe(expectedTotal);
    });
  }
});
