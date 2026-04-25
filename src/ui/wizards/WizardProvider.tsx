// =============================================================================
// WizardProvider — context glue for the local UI state machine.
//
// The engine never knows about "half-picked" inputs; this provider keeps
// them in React state and assembles full Intents on dispatch.
//
//   Pass / Loan       — card click dispatches immediately.
//   Scout             — three card clicks then endAction().
//   Develop           — card + 1 or 2 industries in any order.
//                       Auto-submit when card + 2 industries; endAction()
//                       submits with card + 1 industry. Iron auto-resolves
//                       at submit time: cheapest free network iron (any
//                       unflipped Iron Works, any owner) then market.
//   Build             — card + slot + industry in any order. Auto-submit
//                       when all three are set. Coal goes to market;
//                       iron prefers free network iron.
//
// CONVENTIONS for click-based input (per spec §10.1):
//
//   1. Order-agnostic. No wizard forces a card-first ordering. The user
//      may click a slot, industry, line, tile, or card in whatever order
//      suits them.
//
//   2. Unique-cardinality inputs REPLACE on a second click (e.g. picking
//      a different card mid-Develop swaps the card; the prior card is
//      no longer authorising the action).
//
//   3. Variable-cardinality inputs ACCUMULATE on each click up to the
//      action's cap; the user clears via Reset Selection. Develop's
//      industries[] is a known-repeatable case — clicking the same
//      industry twice picks 2 tiles from that stack (engine pops the
//      stack between iterations). Toggle-on-duplicate would silently
//      make this impossible to express.
//
// Card-first flow (§10.1) is not yet implemented — clicks in IDLE no-op.
// =============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { buildDistanceMap } from "../../engine";
import type {
  BeerSource,
  CoalSource,
  Era,
  GameState,
  IndustryName,
  IronSource,
  PlayerId,
  SecondRailLink,
  SellOrder,
} from "../../engine";

type NetworkSecondLink = SecondRailLink;
import { reasonToText } from "../affordances/toast";
import { useEngine } from "../hooks/useEngine";
import {
  INITIAL_WIZARD,
  pickedCardIndices,
  wizardReducer,
  type BreweryBeerSource,
  type BuildSlotPick,
  type SellResourceOrder,
  type WizardState,
} from "./wizardState";

interface WizardApi {
  readonly state: WizardState;
  /** Card indices currently highlighted (for HandPanel rendering). */
  readonly picked: ReadonlySet<number>;
  startPass(): void;
  startLoan(): void;
  startScout(): void;
  startDevelop(): void;
  startBuild(): void;
  startNetwork(): void;
  startSell(): void;
  /** Click on a card from HandPanel. Routes to the active phase. */
  pickCard(cardIndex: number): void;
  /** Click on a mat top-tile from a player sub-panel. */
  pickIndustry(seatId: PlayerId, industry: IndustryName): void;
  /** Click on a city slot from BoardPanel. Build wizard only. */
  pickSlot(slot: BuildSlotPick): void;
  /** Click on a canal/rail line from BoardPanel. Network wizard only. */
  pickLine(lineIndex: number): void;
  /** Click on a built tile from BoardPanel. Sell wizard only. */
  pickTile(tileId: string): void;
  /** Click an iron source in the resource picker (Develop). */
  pickIronSource(source: IronSource): void;
  /** Clear iron picks (stays in the picker phase). */
  resetIronPicks(): void;
  /** Click a coal source in the Build resource picker. */
  pickBuildCoal(source: CoalSource): void;
  /** Click an iron source in the Build resource picker. */
  pickBuildIron(source: IronSource): void;
  /** Clear all picks in the Build resource picker. */
  resetBuildResources(): void;
  /** Click a coal source for the first link in Network resource picker. */
  pickNetworkFirstCoal(source: CoalSource): void;
  /** Click a coal source for the second link in Network resource picker. */
  pickNetworkSecondCoal(source: CoalSource): void;
  /** Click a brewery for the second-rail beer in Network resource picker. */
  pickNetworkBeer(source: BreweryBeerSource): void;
  /** Clear all picks in the Network resource picker. */
  resetNetworkResources(): void;
  /** Click a beer source for a specific Sell order. */
  pickSellBeer(orderIndex: number, source: BeerSource): void;
  /** Clear all picks in the Sell resource picker. */
  resetSellResources(): void;
  /** Submit the current wizard (Scout: 3 cards; Develop: 1 industry;
   *  Build: all three fields once set). */
  endAction(): void;
  /** Cancel the current wizard back to IDLE without dispatching. */
  reset(): void;
}

const WizardContext = createContext<WizardApi | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const engine = useEngine();
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_WIZARD);

  // Card-first flow (§10.1) — when the user clicked a card before the
  // action verb, IDLE carries the stashed cardIndex; each start* method
  // picks it up so the wizard arrives pre-populated.
  const stashedCard =
    state.phase === "IDLE" ? state.stashedCardIndex : null;

  const startPass = useCallback(() => {
    if (stashedCard !== null) {
      const liveState = engine.getState();
      const playerId = liveState.turnOrder[liveState.currentPlayerIndex]!;
      const result = engine.dispatch({
        type: "PASS",
        playerId,
        cardIndex: stashedCard,
      });
      if (result.ok) dispatch({ type: "RESET" });
      else toast.error(reasonToText(result.reason));
      return;
    }
    dispatch({ type: "START_PASS" });
  }, [engine, stashedCard]);

  const startLoan = useCallback(() => {
    if (stashedCard !== null) {
      const liveState = engine.getState();
      const playerId = liveState.turnOrder[liveState.currentPlayerIndex]!;
      const result = engine.dispatch({
        type: "LOAN",
        playerId,
        cardIndex: stashedCard,
      });
      if (result.ok) dispatch({ type: "RESET" });
      else toast.error(reasonToText(result.reason));
      return;
    }
    dispatch({ type: "START_LOAN" });
  }, [engine, stashedCard]);

  const startScout = useCallback(() => {
    dispatch({ type: "START_SCOUT" });
    if (stashedCard !== null) {
      dispatch({ type: "TOGGLE_CARD", cardIndex: stashedCard });
    }
  }, [stashedCard]);

  const startDevelop = useCallback(() => {
    const liveState = engine.getState();
    const seatId = liveState.turnOrder[liveState.currentPlayerIndex];
    if (seatId === undefined) return;
    dispatch({ type: "START_DEVELOP", developSeatId: seatId });
    if (stashedCard !== null) {
      dispatch({ type: "DEVELOP_SET_CARD", cardIndex: stashedCard });
    }
  }, [engine, stashedCard]);

  const startBuild = useCallback(() => {
    dispatch({ type: "START_BUILD" });
    if (stashedCard !== null) {
      dispatch({ type: "BUILD_SET_CARD", cardIndex: stashedCard });
    }
  }, [stashedCard]);

  const startNetwork = useCallback(() => {
    dispatch({ type: "START_NETWORK" });
    if (stashedCard !== null) {
      dispatch({ type: "NETWORK_SET_CARD", cardIndex: stashedCard });
    }
  }, [stashedCard]);

  const startSell = useCallback(() => {
    dispatch({ type: "START_SELL" });
    if (stashedCard !== null) {
      dispatch({ type: "SELL_SET_CARD", cardIndex: stashedCard });
    }
  }, [stashedCard]);

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  const dispatchDevelopIntent = useCallback(
    (
      cardIndex: number,
      developSeatId: PlayerId,
      industries: readonly IndustryName[],
      ironSources: readonly IronSource[],
    ) => {
      const result = engine.dispatch({
        type: "DEVELOP",
        playerId: developSeatId,
        cardIndex,
        industries: [...industries],
        ironSources: ironSources.map((s) => [s]),
      });
      if (result.ok) {
        dispatch({ type: "RESET" });
      } else {
        toast.error(reasonToText(result.reason));
      }
    },
    [engine],
  );

  const submitDevelop = useCallback(
    (live: WizardState) => {
      if (live.phase !== "AWAITING_DEVELOP_INPUTS") return;
      if (live.cardIndex === null) {
        toast.error("Pick a card to authorise Develop.");
        return;
      }
      if (live.industries.length === 0) {
        toast.error("Pick at least one industry to develop.");
        return;
      }
      // Ambiguity test: if 2+ unflipped Iron Works tiles exist, ask the
      // user which tiles to drain. Otherwise auto-resolve (single tile
      // / no tiles + market fallback).
      const ironTiles = listUnflippedIronWorks(engine.getState());
      if (ironTiles.length > 1) {
        dispatch({
          type: "ENTER_DEVELOP_IRON_PICK",
          cardIndex: live.cardIndex,
          developSeatId: live.developSeatId,
          industries: live.industries,
        });
        return;
      }
      const sources = autoResolveIronSources(
        engine.getState(),
        live.industries.length,
      );
      dispatchDevelopIntent(
        live.cardIndex,
        live.developSeatId,
        live.industries,
        sources,
      );
    },
    [engine, dispatchDevelopIntent],
  );

  const submitDevelopIron = useCallback(
    (live: WizardState) => {
      if (live.phase !== "AWAITING_DEVELOP_IRON_PICK") return;
      if (live.picks.length !== live.industries.length) return;
      dispatchDevelopIntent(
        live.cardIndex,
        live.developSeatId,
        live.industries,
        live.picks,
      );
    },
    [dispatchDevelopIntent],
  );

  const pickIronSource = useCallback(
    (source: IronSource) => {
      const live = state;
      if (live.phase !== "AWAITING_DEVELOP_IRON_PICK") return;
      if (live.picks.length >= live.industries.length) return;
      dispatch({ type: "DEVELOP_IRON_ADD_PICK", source });
      const projected: WizardState = {
        ...live,
        picks: [...live.picks, source],
      };
      if (projected.picks.length === live.industries.length) {
        submitDevelopIron(projected);
      }
    },
    [state, submitDevelopIron],
  );

  const resetIronPicks = useCallback(() => {
    dispatch({ type: "DEVELOP_IRON_RESET_PICKS" });
  }, []);

  const dispatchBuildIntent = useCallback(
    (
      cardIndex: number,
      slot: BuildSlotPick,
      industry: IndustryName,
      coalSources: readonly CoalSource[],
      ironSources: readonly IronSource[],
    ) => {
      const liveState = engine.getState();
      const playerId = liveState.turnOrder[liveState.currentPlayerIndex]!;
      const result = engine.dispatch({
        type: "BUILD",
        playerId,
        cardIndex,
        cityName: slot.cityName,
        slotIndex: slot.slotIndex,
        industry,
        coalSources: [...coalSources],
        ironSources: [...ironSources],
      });
      if (result.ok) {
        dispatch({ type: "RESET" });
      } else {
        toast.error(reasonToText(result.reason));
      }
    },
    [engine],
  );

  const submitBuild = useCallback(
    (live: WizardState) => {
      if (live.phase !== "AWAITING_BUILD_INPUTS") return;
      if (
        live.cardIndex === null ||
        live.slot === null ||
        live.industry === null
      ) {
        toast.error("Pick a card, a city slot, and an industry to build.");
        return;
      }
      const liveState = engine.getState();
      const playerId = liveState.turnOrder[liveState.currentPlayerIndex]!;
      const player = liveState.players.find((p) => p.id === playerId);
      const topIdx = player?.mat.stacks[live.industry][0];
      const topSpec =
        topIdx === undefined ? undefined : liveState.tileCatalogue[topIdx];
      const coalNeed = topSpec?.coalCost ?? 0;
      const ironNeed = topSpec?.ironCost ?? 0;

      const closestMines =
        coalNeed > 0 ? listClosestCoalMines(liveState, [live.slot.cityName]) : [];
      const ironTiles = ironNeed > 0 ? listUnflippedIronWorks(liveState) : [];
      const coalAmbiguous = closestMines.length > 1;
      const ironAmbiguous = ironTiles.length > 1;

      if (!coalAmbiguous && !ironAmbiguous) {
        // Existing auto-resolve path: iron from first available tile
        // (no connectivity), coal from market.
        const ironSources = autoResolveIronSources(liveState, ironNeed);
        const coalSources: CoalSource[] = Array.from(
          { length: coalNeed },
          () => ({ kind: "MARKET" }),
        );
        dispatchBuildIntent(
          live.cardIndex,
          live.slot,
          live.industry,
          coalSources,
          ironSources,
        );
        return;
      }

      // Pre-fill the non-ambiguous side so the player only clicks for
      // what's actually under-determined.
      const prefillCoal: CoalSource[] = coalAmbiguous
        ? []
        : Array.from({ length: coalNeed }, (): CoalSource => {
            const single = closestMines[0];
            return single
              ? { kind: "TILE", tileId: single.tileId }
              : { kind: "MARKET" };
          });
      const prefillIron: IronSource[] = ironAmbiguous
        ? []
        : autoResolveIronSources(liveState, ironNeed);

      dispatch({
        type: "ENTER_BUILD_RESOURCES",
        cardIndex: live.cardIndex,
        slot: live.slot,
        industry: live.industry,
        coalNeed,
        ironNeed,
        coalPicks: prefillCoal,
        ironPicks: prefillIron,
      });
      // Suppress unused-var lint when we only consult player for the spec.
      void playerId;
    },
    [engine, dispatchBuildIntent],
  );

  const submitBuildResources = useCallback(
    (live: WizardState) => {
      if (live.phase !== "AWAITING_BUILD_RESOURCES") return;
      if (
        live.coalPicks.length !== live.coalNeed ||
        live.ironPicks.length !== live.ironNeed
      ) {
        return;
      }
      dispatchBuildIntent(
        live.cardIndex,
        live.slot,
        live.industry,
        live.coalPicks,
        live.ironPicks,
      );
    },
    [dispatchBuildIntent],
  );

  const pickBuildCoal = useCallback(
    (source: CoalSource) => {
      const live = state;
      if (live.phase !== "AWAITING_BUILD_RESOURCES") return;
      if (live.coalPicks.length >= live.coalNeed) return;
      const projected: WizardState = {
        ...live,
        coalPicks: [...live.coalPicks, source],
      };
      dispatch({ type: "BUILD_COAL_ADD_PICK", source });
      if (
        projected.coalPicks.length === live.coalNeed &&
        projected.ironPicks.length === live.ironNeed
      ) {
        submitBuildResources(projected);
      }
    },
    [state, submitBuildResources],
  );

  const pickBuildIron = useCallback(
    (source: IronSource) => {
      const live = state;
      if (live.phase !== "AWAITING_BUILD_RESOURCES") return;
      if (live.ironPicks.length >= live.ironNeed) return;
      const projected: WizardState = {
        ...live,
        ironPicks: [...live.ironPicks, source],
      };
      dispatch({ type: "BUILD_IRON_ADD_PICK", source });
      if (
        projected.coalPicks.length === live.coalNeed &&
        projected.ironPicks.length === live.ironNeed
      ) {
        submitBuildResources(projected);
      }
    },
    [state, submitBuildResources],
  );

  const resetBuildResources = useCallback(() => {
    dispatch({ type: "BUILD_RESOURCES_RESET" });
  }, []);

  const dispatchSellIntent = useCallback(
    (
      cardIndex: number,
      orders: readonly SellOrder[],
      gloucesterDevelops: readonly IndustryName[],
    ) => {
      const liveState = engine.getState();
      const playerId = liveState.turnOrder[liveState.currentPlayerIndex]!;
      const result = engine.dispatch({
        type: "SELL",
        playerId,
        cardIndex,
        orders,
        gloucesterDevelops,
      });
      if (result.ok) {
        dispatch({ type: "RESET" });
      } else {
        toast.error(reasonToText(result.reason));
      }
    },
    [engine],
  );

  const submitSell = useCallback(
    (live: WizardState) => {
      if (live.phase !== "AWAITING_SELL_INPUTS") return;
      if (live.cardIndex === null) {
        toast.error("Pick a card to authorise Sell.");
        return;
      }
      if (live.tileIds.length === 0) {
        toast.error("Pick at least one tile to sell.");
        return;
      }
      const liveState = engine.getState();
      const playerId = liveState.turnOrder[liveState.currentPlayerIndex]!;

      // Resolve merchants per order (auto: first matching slot).
      const merchantOrders = resolveSellMerchants(
        liveState,
        playerId,
        live.tileIds,
      );
      if (merchantOrders === null) return;

      // Per-order beer ambiguity: if every order has 0 or 1 distinct
      // beer source available, we can auto-resolve via the existing
      // priority walker. Otherwise enter the picker.
      const anyAmbiguous = merchantOrders.some(
        (o) =>
          listValidBeerSourcesForOrder(liveState, o, playerId).length > 1 &&
          o.beerNeed > 0,
      );

      if (!anyAmbiguous) {
        const orders = autoResolveSellOrders(liveState, playerId, live.tileIds);
        if (orders === null) return;
        const gloucesterBeers = countGloucesterBeers(orders);
        if (gloucesterBeers === 0) {
          dispatchSellIntent(live.cardIndex, orders, []);
          return;
        }
        dispatch({
          type: "ENTER_SELL_GLOUCESTER",
          cardIndex: live.cardIndex,
          orders,
          need: gloucesterBeers,
        });
        return;
      }

      dispatch({
        type: "ENTER_SELL_RESOURCES",
        cardIndex: live.cardIndex,
        orders: merchantOrders,
      });
    },
    [engine, dispatchSellIntent],
  );

  const submitSellResources = useCallback(
    (live: WizardState) => {
      if (live.phase !== "AWAITING_SELL_RESOURCES") return;
      const allFilled = live.orders.every(
        (o) => o.beerPicks.length === o.beerNeed,
      );
      if (!allFilled) return;
      const orders = live.orders.map((o) => ({
        tileId: o.tileId,
        merchantCityName: o.merchantCityName,
        merchantSlotIndex: o.merchantSlotIndex,
        beerSources: o.beerPicks,
      }));
      const gloucesterBeers = countGloucesterBeers(orders);
      if (gloucesterBeers === 0) {
        dispatchSellIntent(live.cardIndex, orders, []);
        return;
      }
      dispatch({
        type: "ENTER_SELL_GLOUCESTER",
        cardIndex: live.cardIndex,
        orders,
        need: gloucesterBeers,
      });
    },
    [dispatchSellIntent],
  );

  const pickSellBeer = useCallback(
    (orderIndex: number, source: BeerSource) => {
      const live = state;
      if (live.phase !== "AWAITING_SELL_RESOURCES") return;
      const order = live.orders[orderIndex];
      if (!order) return;
      if (order.beerPicks.length >= order.beerNeed) return;
      const updatedOrder = {
        ...order,
        beerPicks: [...order.beerPicks, source],
      };
      const projected: WizardState = {
        ...live,
        orders: live.orders.map((o, i) =>
          i === orderIndex ? updatedOrder : o,
        ),
      };
      dispatch({ type: "SELL_BEER_ADD_PICK", orderIndex, source });
      const allFilled = projected.orders.every(
        (o) => o.beerPicks.length === o.beerNeed,
      );
      if (allFilled) {
        submitSellResources(projected);
      }
    },
    [state, submitSellResources],
  );

  const resetSellResources = useCallback(() => {
    dispatch({ type: "SELL_RESOURCES_RESET" });
  }, []);

  const submitSellGloucester = useCallback(
    (live: WizardState) => {
      if (live.phase !== "AWAITING_SELL_GLOUCESTER") return;
      if (live.industries.length !== live.need) return;
      dispatchSellIntent(live.cardIndex, live.orders, [...live.industries]);
    },
    [dispatchSellIntent],
  );

  const dispatchNetworkIntent = useCallback(
    (
      cardIndex: number,
      lineIndex: number,
      coalSources: readonly CoalSource[],
      secondLink: NetworkSecondLink | null,
    ) => {
      const liveState = engine.getState();
      const playerId = liveState.turnOrder[liveState.currentPlayerIndex]!;
      const result = engine.dispatch({
        type: "NETWORK",
        playerId,
        cardIndex,
        lineIndex,
        coalSources: [...coalSources],
        secondLink,
      });
      if (result.ok) {
        dispatch({ type: "RESET" });
      } else {
        toast.error(reasonToText(result.reason));
      }
    },
    [engine],
  );

  const submitNetwork = useCallback(
    (live: WizardState) => {
      if (live.phase !== "AWAITING_NETWORK_INPUTS") return;
      if (live.cardIndex === null) {
        toast.error("Pick a card to authorise Network.");
        return;
      }
      if (live.lineIndex === null) {
        toast.error("Pick a canal or rail line.");
        return;
      }
      const liveState = engine.getState();
      // Canal era — no resources to pick.
      if (liveState.era === "CANAL") {
        dispatchNetworkIntent(live.cardIndex, live.lineIndex, [], null);
        return;
      }

      const firstLine = liveState.lines[live.lineIndex];
      const firstEndpoints = firstLine?.endpoints ?? [];
      const firstClosest = listClosestCoalMines(liveState, firstEndpoints);
      const firstCoalAmbiguous = firstClosest.length > 1;
      const firstCoalPrefill = autoResolveSingleCoal(firstClosest);

      let secondClosest: readonly AvailableCoalSource[] = [];
      let secondCoalAmbiguous = false;
      let secondCoalPrefill: CoalSource[] = [];
      let breweries: readonly AvailableBrewery[] = [];
      let beerAmbiguous = false;
      let beerPrefill: BreweryBeerSource[] = [];

      const secondEndpoints =
        live.secondLineIndex !== null
          ? (liveState.lines[live.secondLineIndex]?.endpoints ?? [])
          : [];

      if (live.secondLineIndex !== null) {
        secondClosest = listClosestCoalMines(liveState, secondEndpoints);
        secondCoalAmbiguous = secondClosest.length > 1;
        secondCoalPrefill = secondCoalAmbiguous
          ? []
          : autoResolveSingleCoal(secondClosest);

        const playerId = liveState.turnOrder[liveState.currentPlayerIndex]!;
        breweries = listValidBreweries(liveState, secondEndpoints, playerId);
        beerAmbiguous = breweries.length > 1;
        if (!beerAmbiguous) {
          if (breweries.length === 1) {
            beerPrefill = [
              { kind: "BREWERY", tileId: breweries[0]!.tileId },
            ];
          } else {
            // No valid brewery — engine will reject. Surface a toast and
            // bail out without entering the picker.
            toast.error(
              "Need an unflipped brewery reachable from the second rail line.",
            );
            return;
          }
        }
      }

      const anyAmbiguous =
        firstCoalAmbiguous || secondCoalAmbiguous || beerAmbiguous;

      if (!anyAmbiguous) {
        const secondLink: NetworkSecondLink | null =
          live.secondLineIndex !== null
            ? {
                lineIndex: live.secondLineIndex,
                coalSources: secondCoalPrefill,
                beerSource: beerPrefill[0]!,
              }
            : null;
        dispatchNetworkIntent(
          live.cardIndex,
          live.lineIndex,
          firstCoalPrefill,
          secondLink,
        );
        return;
      }

      dispatch({
        type: "ENTER_NETWORK_RESOURCES",
        cardIndex: live.cardIndex,
        lineIndex: live.lineIndex,
        secondLineIndex: live.secondLineIndex,
        firstCoalNeed: 1,
        secondCoalNeed: live.secondLineIndex !== null ? 1 : 0,
        beerNeed: live.secondLineIndex !== null ? 1 : 0,
        firstCoalPicks: firstCoalAmbiguous ? [] : firstCoalPrefill,
        secondCoalPicks: secondCoalAmbiguous ? [] : secondCoalPrefill,
        beerPicks: beerAmbiguous ? [] : beerPrefill,
      });
    },
    [engine, dispatchNetworkIntent],
  );

  const submitNetworkResources = useCallback(
    (live: WizardState) => {
      if (live.phase !== "AWAITING_NETWORK_RESOURCES") return;
      if (
        live.firstCoalPicks.length !== live.firstCoalNeed ||
        live.secondCoalPicks.length !== live.secondCoalNeed ||
        live.beerPicks.length !== live.beerNeed
      ) {
        return;
      }
      const secondLink: NetworkSecondLink | null =
        live.secondLineIndex !== null
          ? {
              lineIndex: live.secondLineIndex,
              coalSources: live.secondCoalPicks,
              beerSource: live.beerPicks[0]!,
            }
          : null;
      dispatchNetworkIntent(
        live.cardIndex,
        live.lineIndex,
        live.firstCoalPicks,
        secondLink,
      );
    },
    [dispatchNetworkIntent],
  );

  const pickNetworkFirstCoal = useCallback(
    (source: CoalSource) => {
      const live = state;
      if (live.phase !== "AWAITING_NETWORK_RESOURCES") return;
      if (live.firstCoalPicks.length >= live.firstCoalNeed) return;
      const projected: WizardState = {
        ...live,
        firstCoalPicks: [...live.firstCoalPicks, source],
      };
      dispatch({ type: "NETWORK_FIRST_COAL_ADD_PICK", source });
      if (allNetworkResourcePicksFull(projected)) {
        submitNetworkResources(projected);
      }
    },
    [state, submitNetworkResources],
  );

  const pickNetworkSecondCoal = useCallback(
    (source: CoalSource) => {
      const live = state;
      if (live.phase !== "AWAITING_NETWORK_RESOURCES") return;
      if (live.secondCoalPicks.length >= live.secondCoalNeed) return;
      const projected: WizardState = {
        ...live,
        secondCoalPicks: [...live.secondCoalPicks, source],
      };
      dispatch({ type: "NETWORK_SECOND_COAL_ADD_PICK", source });
      if (allNetworkResourcePicksFull(projected)) {
        submitNetworkResources(projected);
      }
    },
    [state, submitNetworkResources],
  );

  const pickNetworkBeer = useCallback(
    (source: BreweryBeerSource) => {
      const live = state;
      if (live.phase !== "AWAITING_NETWORK_RESOURCES") return;
      if (live.beerPicks.length >= live.beerNeed) return;
      const projected: WizardState = {
        ...live,
        beerPicks: [...live.beerPicks, source],
      };
      dispatch({ type: "NETWORK_BEER_ADD_PICK", source });
      if (allNetworkResourcePicksFull(projected)) {
        submitNetworkResources(projected);
      }
    },
    [state, submitNetworkResources],
  );

  const resetNetworkResources = useCallback(() => {
    dispatch({ type: "NETWORK_RESOURCES_RESET" });
  }, []);

  const pickCard = useCallback(
    (cardIndex: number) => {
      const live = state;
      if (live.phase === "IDLE") {
        // §10.1 card-first flow — toggle the stashed card so the player
        // can pick a card and then click an action verb. Clicking the
        // same card again unstashes; clicking a different card replaces.
        const next =
          live.stashedCardIndex === cardIndex ? null : cardIndex;
        dispatch({ type: "IDLE_STASH_CARD", cardIndex: next });
        return;
      }
      if (live.phase === "AWAITING_CARD") {
        const liveState = engine.getState();
        const playerId = liveState.turnOrder[liveState.currentPlayerIndex]!;
        const result = engine.dispatch(
          live.action === "PASS"
            ? { type: "PASS", playerId, cardIndex }
            : { type: "LOAN", playerId, cardIndex },
        );
        if (result.ok) {
          dispatch({ type: "RESET" });
        } else {
          toast.error(reasonToText(result.reason));
        }
        return;
      }
      if (live.phase === "AWAITING_CARDS_SCOUT") {
        dispatch({ type: "TOGGLE_CARD", cardIndex });
        return;
      }
      if (live.phase === "AWAITING_DEVELOP_INPUTS") {
        const projected: WizardState = { ...live, cardIndex };
        dispatch({ type: "DEVELOP_SET_CARD", cardIndex });
        // Auto-submit when card now joins 2-industry max.
        if (projected.industries.length === 2) {
          submitDevelop(projected);
        }
        return;
      }
      if (live.phase === "AWAITING_BUILD_INPUTS") {
        const projected: WizardState = { ...live, cardIndex };
        dispatch({ type: "BUILD_SET_CARD", cardIndex });
        if (
          projected.cardIndex !== null &&
          projected.slot !== null &&
          projected.industry !== null
        ) {
          submitBuild(projected);
        }
        return;
      }
      if (live.phase === "AWAITING_NETWORK_INPUTS") {
        const projected: WizardState = { ...live, cardIndex };
        dispatch({ type: "NETWORK_SET_CARD", cardIndex });
        if (shouldAutoSubmitNetwork(engine.getState().era, projected)) {
          submitNetwork(projected);
        }
        return;
      }
      if (live.phase === "AWAITING_SELL_INPUTS") {
        // Sell does NOT auto-submit on card pick — tile picks are
        // variable-arity and the player explicitly ends the action.
        dispatch({ type: "SELL_SET_CARD", cardIndex });
        return;
      }
    },
    [engine, state, submitBuild, submitDevelop, submitNetwork],
  );

  const pickIndustry = useCallback(
    (seatId: PlayerId, industry: IndustryName) => {
      const live = state;
      if (live.phase === "AWAITING_DEVELOP_INPUTS") {
        // Develop accepts two picks of the same industry (§5.3) — the
        // engine pops the stack in order between them. Each click here
        // ADDS one pick; never deselects. Reset Selection clears.
        if (live.developSeatId !== seatId) return;
        if (live.industries.length >= 2) return;

        const projected: WizardState = {
          ...live,
          industries: [...live.industries, industry],
        };
        dispatch({ type: "ADD_DEVELOP_INDUSTRY", industry });
        // Auto-submit when card + 2 industries are both set.
        if (projected.cardIndex !== null && projected.industries.length === 2) {
          submitDevelop(projected);
        }
        return;
      }
      if (live.phase === "AWAITING_BUILD_INPUTS") {
        // Only the acting seat can target their own mat; the engine
        // would reject a foreign-seat click anyway, but we keep the
        // wizard scoped to one seat for clarity.
        const liveState = engine.getState();
        const activeId = liveState.turnOrder[liveState.currentPlayerIndex];
        if (seatId !== activeId) return;
        const projected: WizardState = { ...live, industry };
        dispatch({ type: "BUILD_SET_INDUSTRY", industry });
        if (
          projected.cardIndex !== null &&
          projected.slot !== null &&
          projected.industry !== null
        ) {
          submitBuild(projected);
        }
        return;
      }
      if (live.phase === "AWAITING_SELL_GLOUCESTER") {
        const liveState = engine.getState();
        const activeId = liveState.turnOrder[liveState.currentPlayerIndex];
        if (seatId !== activeId) return;
        if (live.industries.length >= live.need) return;
        const projected: WizardState = {
          ...live,
          industries: [...live.industries, industry],
        };
        dispatch({ type: "ADD_SELL_GLOUCESTER_INDUSTRY", industry });
        if (projected.industries.length === live.need) {
          submitSellGloucester(projected);
        }
      }
    },
    [engine, state, submitBuild, submitDevelop, submitSellGloucester],
  );

  const pickSlot = useCallback(
    (slot: BuildSlotPick) => {
      const live = state;
      if (live.phase !== "AWAITING_BUILD_INPUTS") return;
      const projected: WizardState = { ...live, slot };
      dispatch({ type: "BUILD_SET_SLOT", slot });
      if (
        projected.cardIndex !== null &&
        projected.slot !== null &&
        projected.industry !== null
      ) {
        submitBuild(projected);
      }
    },
    [state, submitBuild],
  );

  const pickLine = useCallback(
    (lineIndex: number) => {
      const live = state;
      if (live.phase !== "AWAITING_NETWORK_INPUTS") return;
      const era = engine.getState().era;
      const allowSecond = era === "RAIL";
      // Project the next state to detect the auto-submit condition
      // without having to read post-dispatch state.
      const projected = projectNetworkAfterToggle(live, lineIndex, allowSecond);
      dispatch({ type: "NETWORK_TOGGLE_LINE", lineIndex, allowSecond });
      if (shouldAutoSubmitNetwork(era, projected)) {
        submitNetwork(projected);
      }
    },
    [engine, state, submitNetwork],
  );

  const pickTile = useCallback((tileId: string) => {
    // Sell tile picks are a distinct-id collection: clicking the same
    // tile toggles the selection. End Action submits.
    dispatch({ type: "SELL_TOGGLE_TILE", tileId });
  }, []);

  const endAction = useCallback(() => {
    const live = state;
    if (live.phase === "AWAITING_CARDS_SCOUT") {
      if (live.cardIndices.length !== 3) {
        toast.error("Pick three distinct cards before submitting.");
        return;
      }
      const liveState = engine.getState();
      const playerId = liveState.turnOrder[liveState.currentPlayerIndex]!;
      const [a, b, c] = live.cardIndices as [number, number, number];
      const result = engine.dispatch({
        type: "SCOUT",
        playerId,
        cardIndices: [a, b, c],
      });
      if (result.ok) {
        dispatch({ type: "RESET" });
      } else {
        toast.error(reasonToText(result.reason));
      }
      return;
    }
    if (live.phase === "AWAITING_DEVELOP_INPUTS") {
      submitDevelop(live);
      return;
    }
    if (live.phase === "AWAITING_BUILD_INPUTS") {
      submitBuild(live);
      return;
    }
    if (live.phase === "AWAITING_NETWORK_INPUTS") {
      submitNetwork(live);
      return;
    }
    if (live.phase === "AWAITING_SELL_INPUTS") {
      submitSell(live);
      return;
    }
    if (live.phase === "AWAITING_SELL_GLOUCESTER") {
      submitSellGloucester(live);
      return;
    }
    if (live.phase === "AWAITING_DEVELOP_IRON_PICK") {
      submitDevelopIron(live);
      return;
    }
    if (live.phase === "AWAITING_BUILD_RESOURCES") {
      submitBuildResources(live);
      return;
    }
    if (live.phase === "AWAITING_NETWORK_RESOURCES") {
      submitNetworkResources(live);
      return;
    }
    if (live.phase === "AWAITING_SELL_RESOURCES") {
      submitSellResources(live);
      return;
    }
  }, [
    engine,
    state,
    submitDevelop,
    submitBuild,
    submitNetwork,
    submitSell,
    submitSellGloucester,
    submitDevelopIron,
    submitBuildResources,
    submitNetworkResources,
    submitSellResources,
  ]);

  const api = useMemo<WizardApi>(
    () => ({
      state,
      picked: pickedCardIndices(state),
      startPass,
      startLoan,
      startScout,
      startDevelop,
      startBuild,
      startNetwork,
      startSell,
      pickCard,
      pickIndustry,
      pickSlot,
      pickLine,
      pickTile,
      pickIronSource,
      resetIronPicks,
      pickBuildCoal,
      pickBuildIron,
      resetBuildResources,
      pickNetworkFirstCoal,
      pickNetworkSecondCoal,
      pickNetworkBeer,
      resetNetworkResources,
      pickSellBeer,
      resetSellResources,
      endAction,
      reset,
    }),
    [
      state,
      startPass,
      startLoan,
      startScout,
      startDevelop,
      startBuild,
      startNetwork,
      startSell,
      pickCard,
      pickIndustry,
      pickSlot,
      pickLine,
      pickTile,
      pickIronSource,
      resetIronPicks,
      pickBuildCoal,
      pickBuildIron,
      resetBuildResources,
      pickNetworkFirstCoal,
      pickNetworkSecondCoal,
      pickNetworkBeer,
      resetNetworkResources,
      pickSellBeer,
      resetSellResources,
      endAction,
      reset,
    ],
  );

  return (
    <WizardContext.Provider value={api}>{children}</WizardContext.Provider>
  );
}

export function useWizard(): WizardApi {
  const ctx = useContext(WizardContext);
  if (!ctx) {
    throw new Error("useWizard must be used inside <WizardProvider>");
  }
  return ctx;
}

/**
 * Network auto-submit predicate. Canal era submits as soon as the
 * card + first line are set; rail era submits only when both links
 * are picked (the explicit-second-line gesture). Otherwise the user
 * hits End Action.
 */
function shouldAutoSubmitNetwork(era: Era, projected: WizardState): boolean {
  if (projected.phase !== "AWAITING_NETWORK_INPUTS") return false;
  if (projected.cardIndex === null || projected.lineIndex === null) {
    return false;
  }
  if (era === "CANAL") return true;
  return projected.secondLineIndex !== null;
}

/**
 * Project what wizardState will look like after a NETWORK_TOGGLE_LINE
 * action so callers can test the auto-submit predicate before the
 * dispatch lands. Mirrors the reducer's case "NETWORK_TOGGLE_LINE".
 */
function projectNetworkAfterToggle(
  state: WizardState,
  lineIndex: number,
  allowSecond: boolean,
): WizardState {
  if (state.phase !== "AWAITING_NETWORK_INPUTS") return state;
  if (lineIndex === state.lineIndex) {
    return {
      ...state,
      lineIndex: state.secondLineIndex,
      secondLineIndex: null,
    };
  }
  if (lineIndex === state.secondLineIndex) {
    return { ...state, secondLineIndex: null };
  }
  if (state.lineIndex === null) return { ...state, lineIndex };
  if (allowSecond && state.secondLineIndex === null) {
    return { ...state, secondLineIndex: lineIndex };
  }
  return { ...state, lineIndex };
}

/**
 * List unflipped breweries that are valid sources for the player given
 * the consumer cities (line endpoints for Network second rail, tile
 * city for Sell). Own breweries always qualify (no connectivity); other
 * players' breweries must be reachable through the any-player developed
 * link graph from one of the consumer cities (§5.6.3 priorities 1 & 2).
 */
export interface AvailableBrewery {
  readonly tileId: string;
  readonly remaining: number;
  readonly ownerId: PlayerId;
  readonly cityName: string;
}

export function listValidBreweries(
  state: GameState,
  consumerCities: readonly string[],
  playerId: PlayerId,
): readonly AvailableBrewery[] {
  const dist = buildDistanceMap(state, consumerCities);
  const out: AvailableBrewery[] = [];
  for (const t of state.builtTiles) {
    const spec = state.tileCatalogue[t.catalogueIndex];
    if (spec?.industry !== "BREWERY") continue;
    if (t.flipped) continue;
    if (t.resources <= 0) continue;
    if (t.owner === playerId) {
      out.push({
        tileId: t.id,
        remaining: t.resources,
        ownerId: t.owner,
        cityName: t.cityName,
      });
      continue;
    }
    if (!dist.has(t.cityName)) continue;
    out.push({
      tileId: t.id,
      remaining: t.resources,
      ownerId: t.owner,
      cityName: t.cityName,
    });
  }
  return out;
}

/** Build a 1-cube CoalSource[] from at most one closest mine. Returns
 *  [{tile}] when a single mine is available, [{market}] otherwise. */
function autoResolveSingleCoal(
  closest: readonly AvailableCoalSource[],
): CoalSource[] {
  if (closest.length === 1) {
    return [{ kind: "TILE", tileId: closest[0]!.tileId }];
  }
  return [{ kind: "MARKET" }];
}

function allNetworkResourcePicksFull(state: WizardState): boolean {
  if (state.phase !== "AWAITING_NETWORK_RESOURCES") return false;
  return (
    state.firstCoalPicks.length === state.firstCoalNeed &&
    state.secondCoalPicks.length === state.secondCoalNeed &&
    state.beerPicks.length === state.beerNeed
  );
}

/**
 * Resolve the merchant slot for each tile being sold (auto-pick first
 * non-blank slot that accepts the tile's industry). The picker doesn't
 * cover merchant ambiguity at this milestone — that's a roadmap polish.
 * Returns null after a toast when a tile can't be sold (no merchant
 * accepts it, tile not owned by player, etc).
 */
function resolveSellMerchants(
  state: GameState,
  playerId: PlayerId,
  tileIds: readonly string[],
): SellResourceOrder[] | null {
  const out: SellResourceOrder[] = [];
  for (const tileId of tileIds) {
    const tile = state.builtTiles.find((t) => t.id === tileId);
    if (!tile || tile.owner !== playerId || tile.flipped) {
      toast.error(`Tile not sellable.`);
      return null;
    }
    const spec = state.tileCatalogue[tile.catalogueIndex];
    if (!spec) {
      toast.error(`Tile spec missing.`);
      return null;
    }
    const merchantSlot = state.merchantSlots.find((ms) => {
      if (ms.accept === "BLANK") return false;
      if (ms.accept === "ANY") return true;
      return ms.accept === spec.industry;
    });
    if (!merchantSlot) {
      toast.error(`No merchant accepts ${spec.industry}.`);
      return null;
    }
    out.push({
      tileId,
      merchantCityName: merchantSlot.merchantCityName,
      merchantSlotIndex: merchantSlot.slotIndex,
      beerNeed: spec.beerToSell,
      beerPicks: [],
    });
  }
  return out;
}

/**
 * List every valid beer source for one Sell order — own breweries
 * (no-connectivity), merchant beer at THIS order's buying slot only
 * (§5.6.3 priority 3), and any opponent brewery reachable through
 * the any-player developed-link graph from the tile's city.
 */
export interface AvailableBeerSource {
  readonly kind: "BREWERY" | "MERCHANT";
  readonly tileId?: string;
  readonly remaining: number;
  readonly ownerId?: PlayerId;
  readonly cityName: string;
  readonly merchantSlotIndex?: number;
}

export function listValidBeerSourcesForOrder(
  state: GameState,
  order: { tileId: string; merchantCityName: string; merchantSlotIndex: number },
  playerId: PlayerId,
): readonly AvailableBeerSource[] {
  const tile = state.builtTiles.find((t) => t.id === order.tileId);
  if (!tile) return [];
  const consumerCities = [tile.cityName];
  const dist = buildDistanceMap(state, consumerCities);
  const out: AvailableBeerSource[] = [];

  for (const t of state.builtTiles) {
    const spec = state.tileCatalogue[t.catalogueIndex];
    if (spec?.industry !== "BREWERY") continue;
    if (t.flipped || t.resources <= 0) continue;
    if (t.owner !== playerId && !dist.has(t.cityName)) continue;
    out.push({
      kind: "BREWERY",
      tileId: t.id,
      remaining: t.resources,
      ownerId: t.owner,
      cityName: t.cityName,
    });
  }

  // Merchant beer is restricted to the buying merchant tile (§5.6.3 pri 3).
  const buyingSlot = state.merchantSlots.find(
    (ms) =>
      ms.merchantCityName === order.merchantCityName &&
      ms.slotIndex === order.merchantSlotIndex,
  );
  if (buyingSlot && buyingSlot.hasBeer) {
    out.push({
      kind: "MERCHANT",
      remaining: 1,
      cityName: order.merchantCityName,
      merchantSlotIndex: order.merchantSlotIndex,
    });
  }
  return out;
}

/**
 * Count how many Gloucester merchant beers are consumed across the
 * given orders. Each order's beerSources may include MERCHANT entries
 * — those always come from the order's own buying merchant slot per
 * §5.6.3 priority 3, so a MERCHANT entry on a Gloucester order is the
 * Gloucester barrel.
 */
function countGloucesterBeers(
  orders: readonly { merchantCityName: string; beerSources: readonly BeerSource[] }[],
): number {
  let n = 0;
  for (const o of orders) {
    if (o.merchantCityName !== "Gloucester") continue;
    for (const src of o.beerSources) {
      if (src.kind === "MERCHANT") n++;
    }
  }
  return n;
}

/**
 * Build SellOrder[] for the picked tiles. For each tile:
 *   - merchant: first non-blank merchant slot whose accept matches the
 *     tile's industry (or "ANY"). Connectivity isn't pre-validated here;
 *     the engine will reject and toast if the tile isn't connected.
 *   - beer sources: in priority order — own unflipped brewery cubes,
 *     then merchant beer at the buying merchant tile, then any
 *     unflipped brewery (opponent). Decrements local counts so two
 *     orders don't double-claim the same barrel.
 *
 * Returns null after firing a toast if any tile can't be resolved (no
 * matching merchant, no unflipped sellable tile under that id, etc).
 */
function autoResolveSellOrders(
  state: GameState,
  playerId: PlayerId,
  tileIds: readonly string[],
): SellOrder[] | null {
  // Track remaining beer-cube counts across the dispatch so we don't
  // double-claim a single barrel for two orders.
  const breweryRemaining = new Map<string, number>();
  for (const t of state.builtTiles) {
    const spec = state.tileCatalogue[t.catalogueIndex];
    if (spec?.industry !== "BREWERY") continue;
    if (t.flipped) continue;
    if (t.resources <= 0) continue;
    breweryRemaining.set(t.id, t.resources);
  }
  const merchantBeerRemaining = new Map<string, boolean>();
  for (const ms of state.merchantSlots) {
    merchantBeerRemaining.set(`${ms.merchantCityName}#${ms.slotIndex}`, ms.hasBeer);
  }

  const orders: SellOrder[] = [];
  for (const tileId of tileIds) {
    const tile = state.builtTiles.find((t) => t.id === tileId);
    if (!tile || tile.owner !== playerId || tile.flipped) {
      toast.error(`Tile not sellable.`);
      return null;
    }
    const spec = state.tileCatalogue[tile.catalogueIndex];
    if (!spec) {
      toast.error(`Tile spec missing.`);
      return null;
    }
    // Find a merchant slot accepting this industry.
    const merchantSlot = state.merchantSlots.find((ms) => {
      if (ms.accept === "BLANK") return false;
      if (ms.accept === "ANY") return true;
      return ms.accept === spec.industry;
    });
    if (!merchantSlot) {
      toast.error(`No merchant accepts ${spec.industry}.`);
      return null;
    }
    // Build beer source list.
    const beerSources: BeerSource[] = [];
    let needed = spec.beerToSell;
    // Priority 1: own brewery
    for (let i = 0; i < state.builtTiles.length && needed > 0; i++) {
      const b = state.builtTiles[i]!;
      if (b.owner !== playerId) continue;
      const bSpec = state.tileCatalogue[b.catalogueIndex];
      if (bSpec?.industry !== "BREWERY") continue;
      const left = breweryRemaining.get(b.id) ?? 0;
      while (left > 0 && needed > 0) {
        beerSources.push({ kind: "BREWERY", tileId: b.id });
        breweryRemaining.set(b.id, (breweryRemaining.get(b.id) ?? 0) - 1);
        needed--;
      }
    }
    // Priority 2: merchant beer at the BUYING merchant tile only (§5.6.3).
    if (
      needed > 0 &&
      merchantBeerRemaining.get(
        `${merchantSlot.merchantCityName}#${merchantSlot.slotIndex}`,
      )
    ) {
      beerSources.push({ kind: "MERCHANT" });
      merchantBeerRemaining.set(
        `${merchantSlot.merchantCityName}#${merchantSlot.slotIndex}`,
        false,
      );
      needed--;
    }
    // Priority 3: any opponent unflipped brewery
    for (let i = 0; i < state.builtTiles.length && needed > 0; i++) {
      const b = state.builtTiles[i]!;
      if (b.owner === playerId) continue;
      const bSpec = state.tileCatalogue[b.catalogueIndex];
      if (bSpec?.industry !== "BREWERY") continue;
      const left = breweryRemaining.get(b.id) ?? 0;
      while (left > 0 && needed > 0) {
        beerSources.push({ kind: "BREWERY", tileId: b.id });
        breweryRemaining.set(b.id, (breweryRemaining.get(b.id) ?? 0) - 1);
        needed--;
      }
    }
    if (needed > 0) {
      toast.error(`Not enough beer available for ${spec.industry}.`);
      return null;
    }
    orders.push({
      tileId,
      merchantCityName: merchantSlot.merchantCityName,
      merchantSlotIndex: merchantSlot.slotIndex,
      beerSources,
    });
  }
  return orders;
}

/**
 * Iron-works tile listing for the picker — every unflipped Iron Works
 * tile that still has cubes. Iron has no connectivity requirement
 * (§5.6.2) so any such tile is a valid free source.
 */
export interface AvailableIronTile {
  readonly tileId: string;
  readonly remaining: number;
  readonly ownerId: PlayerId;
  readonly cityName: string;
}

export function listUnflippedIronWorks(
  state: GameState,
): readonly AvailableIronTile[] {
  const out: AvailableIronTile[] = [];
  for (const t of state.builtTiles) {
    const spec = state.tileCatalogue[t.catalogueIndex];
    if (spec?.industry !== "IRON_WORKS") continue;
    if (t.flipped) continue;
    if (t.resources <= 0) continue;
    out.push({
      tileId: t.id,
      remaining: t.resources,
      ownerId: t.owner,
      cityName: t.cityName,
    });
  }
  return out;
}

/**
 * Closest unflipped coal mines from one or more consumer cities. Coal
 * priority (§5.6.1) is "closest mine first". The picker only matters
 * when 2+ mines are tied at the minimum hop distance — at that point
 * the player chooses which to drain. `marketReachable` reports whether
 * the consumer cities can reach any merchant city (governs whether
 * Coal Market is a valid fallback per §5.6.1 priority 2).
 */
export interface AvailableCoalSource {
  readonly tileId: string;
  readonly remaining: number;
  readonly ownerId: PlayerId;
  readonly cityName: string;
  readonly distance: number;
}

export function listClosestCoalMines(
  state: GameState,
  fromCities: readonly string[],
): readonly AvailableCoalSource[] {
  const dist = buildDistanceMap(state, fromCities);
  const mines: AvailableCoalSource[] = [];
  for (const t of state.builtTiles) {
    if (t.flipped || t.resources <= 0) continue;
    const spec = state.tileCatalogue[t.catalogueIndex];
    if (!spec || spec.industry !== "COAL_MINE") continue;
    const d = dist.get(t.cityName);
    if (d === undefined) continue;
    mines.push({
      tileId: t.id,
      remaining: t.resources,
      ownerId: t.owner,
      cityName: t.cityName,
      distance: d,
    });
  }
  if (mines.length === 0) return [];
  let minDist = mines[0]!.distance;
  for (const m of mines) if (m.distance < minDist) minDist = m.distance;
  return mines.filter((m) => m.distance === minDist);
}

export function isMarketReachable(
  state: GameState,
  fromCities: readonly string[],
): boolean {
  const dist = buildDistanceMap(state, fromCities);
  return state.merchantCities.some((m) => dist.has(m.name));
}

/**
 * Pick `count` iron sources, preferring free network iron (any unflipped
 * Iron Works tile with cubes, any owner) over the market. Walks `builtTiles`
 * deterministically (engine list order); decrements local counts so two
 * develops in one dispatch don't double-claim the same cube.
 */
function autoResolveIronSources(
  state: GameState,
  count: number,
): IronSource[] {
  const remaining = new Map<string, number>();
  for (const tile of state.builtTiles) {
    const spec = state.tileCatalogue[tile.catalogueIndex];
    if (spec?.industry !== "IRON_WORKS") continue;
    if (tile.flipped) continue;
    if (tile.resources <= 0) continue;
    remaining.set(tile.id, tile.resources);
  }
  const sources: IronSource[] = [];
  for (let i = 0; i < count; i++) {
    let pickedTile: string | null = null;
    for (const [id, n] of remaining) {
      if (n > 0) {
        pickedTile = id;
        break;
      }
    }
    if (pickedTile !== null) {
      sources.push({ kind: "TILE", tileId: pickedTile });
      remaining.set(pickedTile, (remaining.get(pickedTile) ?? 0) - 1);
    } else {
      sources.push({ kind: "MARKET" });
    }
  }
  return sources;
}
