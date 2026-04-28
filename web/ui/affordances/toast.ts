// =============================================================================
// FailureReason → human-readable text for sonner toasts.
//
// Exhaustive switch with a `never` default — when a new FailureReason is
// added to types.ts the build fails here until we add a friendly string.
// =============================================================================

import type { FailureReason } from "../../../engine";

export function reasonToText(reason: FailureReason): string {
  switch (reason) {
    // --- Infrastructure ---
    case "not_implemented":
      return "That action isn't implemented yet.";

    // --- Turn flow ---
    case "not_current_turn":
      return "Not your turn.";
    case "game_over":
      return "Game over.";
    case "no_actions_remaining":
      return "No actions remaining — end your turn.";
    case "actions_still_remaining":
      return "Use your remaining actions before ending the turn.";

    // --- Shortfall ---
    case "shortfall_resolution_required":
      return "A player must resolve their shortfall first.";
    case "no_pending_shortfall":
      return "No shortfall pending.";
    case "shortfall_not_satisfied":
      return "Proceeds don't cover the debt — pick more tiles or finalize.";
    case "shortfall_tile_not_owned":
      return "You don't own that tile.";
    case "shortfall_duplicate_tile":
      return "Tile already selected.";

    // --- Card / authorisation ---
    case "card_not_in_hand":
      return "Card isn't in your hand.";
    case "card_does_not_authorise":
      return "That card doesn't authorise this build.";

    // --- Build ---
    case "not_in_network":
      return "Location is outside your network.";
    case "slot_does_not_accept_industry":
      return "That slot doesn't accept this industry.";
    case "specific_slot_available":
      return "A specific slot for this industry is still open — use it first.";
    case "mat_stack_empty":
      return "No tiles left on your mat for that industry.";
    case "tile_wrong_era":
      return "That tile can't be built in the current era.";
    case "insufficient_funds":
      return "Insufficient funds.";
    case "farm_brewery_wrong_card":
      return "Farm breweries require a Brewery or Wild-Industry card.";
    case "one_tile_per_city_canal":
      return "You already have a tile in this city (canal era).";

    // --- Overbuild ---
    case "overbuild_industry_mismatch":
      return "Overbuild requires the same industry.";
    case "overbuild_not_higher_level":
      return "Overbuild requires a strictly higher level.";
    case "overbuild_has_resources":
      return "The existing tile still has resources.";
    case "overbuild_ownership_blocked":
      return "Can't overbuild that tile (not yours, and the resource isn't globally exhausted).";

    // --- Resource sources ---
    case "coal_source_invalid":
      return "Invalid coal source.";
    case "iron_source_invalid":
      return "Invalid iron source.";
    case "beer_source_invalid":
      return "Invalid beer source.";
    case "coal_market_not_connected":
      return "Need a connection to a merchant city to buy coal.";
    case "brewery_not_connected":
      return "That opponent's brewery isn't connected.";
    case "merchant_beer_not_from_buyer":
      return "Merchant beer must come from the buying merchant tile.";
    case "merchant_beer_in_network":
      return "Merchant beer can't be used for Network.";

    // --- Network ---
    case "line_already_developed":
      return "That line is already developed.";
    case "line_wrong_era":
      return "That line is for a different era.";
    case "line_not_adjacent":
      return "Line isn't adjacent to your network.";
    case "link_supply_empty":
      return "Out of link tiles.";

    // --- Develop ---
    case "develop_count_invalid":
      return "Develop accepts 1 or 2 tiles.";
    case "develop_tile_has_lightbulb":
      return "That tile can't be developed (light-bulb).";

    // --- Sell ---
    case "sell_tile_not_owned":
      return "You don't own that tile.";
    case "sell_tile_wrong_industry":
      return "That tile isn't a sellable industry.";
    case "sell_tile_already_flipped":
      return "Tile is already flipped.";
    case "sell_merchant_invalid":
      return "Merchant slot doesn't accept this industry.";
    case "sell_not_connected_to_merchant":
      return "Tile isn't connected to that merchant city.";

    // --- Loan ---
    case "loan_income_floor":
      return "Loan would drop income below −10.";

    // --- Scout ---
    case "scout_has_wild_in_hand":
      return "Can't Scout while holding a Wild card.";
    case "scout_duplicate_indices":
      return "Pick three distinct cards.";
    case "scout_wild_reserve_exhausted":
      return "Wild reserve is empty.";

    default: {
      const _exhaustive: never = reason;
      return `Unknown error: ${String(_exhaustive)}`;
    }
  }
}
