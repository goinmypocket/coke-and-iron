// =============================================================================
// §5.3 Develop — remove 1 or 2 industry tiles from the mat, 1 iron each.
//
// Engine steps:
//   1. Discard the card.
//   2. For each picked industry, reject if the top tile has the light-bulb
//      flag or the stack is empty.
//   3. Consume 1 iron per removed tile (§5.6.2).
//   4. Pop the tiles to the box.
// =============================================================================

import { consumeIron } from "../sources/iron";
import {
  disposeCard,
  replacePlayer,
  validateActiveTurn,
  validateCardIndex,
} from "../turn";
import type {
  GameState,
  IndustryName,
  IntentDevelop,
  Player,
  Result,
} from "../types";

export function reduceDevelop(
  state: GameState,
  intent: IntentDevelop,
): Result {
  const turnFail = validateActiveTurn(state, intent.playerId);
  if (turnFail !== null) return { ok: false, reason: turnFail };

  const actingPlayer = state.players[intent.playerId];
  if (actingPlayer === undefined) {
    return { ok: false, reason: "not_current_turn" };
  }

  const cardFail = validateCardIndex(actingPlayer.hand, intent.cardIndex);
  if (cardFail !== null) return { ok: false, reason: cardFail };

  if (intent.industries.length !== 1 && intent.industries.length !== 2) {
    return { ok: false, reason: "develop_count_invalid" };
  }
  if (intent.ironSources.length !== intent.industries.length) {
    return { ok: false, reason: "iron_source_invalid" };
  }

  // Walk removals in order so "two tiles from the same industry" sees the
  // depleted stack state between pops.
  let working = state;
  let totalMoneySpent = 0;

  for (let i = 0; i < intent.industries.length; i++) {
    const industry = intent.industries[i]!;

    const current = workingActingPlayer(working, intent.playerId);
    if (current === undefined) {
      return { ok: false, reason: "not_current_turn" };
    }

    const stack = current.mat.stacks[industry];
    if (stack.length === 0) {
      return { ok: false, reason: "mat_stack_empty" };
    }
    const topCatalogueIdx = stack[0]!;
    const topSpec = working.tileCatalogue[topCatalogueIdx];
    if (topSpec === undefined) {
      return { ok: false, reason: "mat_stack_empty" };
    }
    if (topSpec.lightBulb) {
      return { ok: false, reason: "develop_tile_has_lightbulb" };
    }

    const ironResult = consumeIron(
      working,
      1,
      intent.ironSources[i] ?? [],
    );
    if (!ironResult.ok) return ironResult;
    working = ironResult.state;
    totalMoneySpent += ironResult.moneySpent;

    working = popMatTile(working, intent.playerId, industry);
  }

  // Funds check — Iron Market usage can accumulate cost.
  const afterPops = workingActingPlayer(working, intent.playerId);
  if (afterPops === undefined) {
    return { ok: false, reason: "not_current_turn" };
  }
  if (afterPops.money < totalMoneySpent) {
    return { ok: false, reason: "insufficient_funds" };
  }

  // Deduct money + spent_this_round, dispose the card.
  const disposed = disposeCard(
    afterPops.hand,
    afterPops.discardPile,
    working.wildReserve,
    intent.cardIndex,
  );

  const finalPlayers = replacePlayer(working.players, intent.playerId, (p) => ({
    ...p,
    money: p.money - totalMoneySpent,
    spentThisRound: p.spentThisRound + totalMoneySpent,
    hand: disposed.hand,
    discardPile: disposed.discardPile,
  }));

  return {
    ok: true,
    state: {
      ...working,
      players: finalPlayers,
      wildReserve: disposed.wildReserve,
      actionsRemaining: working.actionsRemaining - 1,
    },
  };
}

function workingActingPlayer(
  state: GameState,
  playerId: number,
): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

function popMatTile(
  state: GameState,
  playerId: number,
  industry: IndustryName,
): GameState {
  return {
    ...state,
    players: replacePlayer(state.players, playerId, (p) => ({
      ...p,
      mat: {
        stacks: { ...p.mat.stacks, [industry]: p.mat.stacks[industry].slice(1) },
      },
    })),
  };
}
