import { describe, it, expect } from "vitest";
import { Engine } from "../../engine/Engine";
import {
  projectFor,
  projectForSpectator,
} from "../../engine/view";

describe("PlayerView — projection", () => {
  it("intact for own seat, redacted for everyone else", () => {
    const engine = new Engine({ seed: 42, playerCount: 4 });
    const state = engine.getState();
    const view = projectFor(state, 1);

    // viewerSeatId is recorded.
    expect(view.viewerSeatId).toBe(1);
    // myHand is the viewer's actual hand.
    expect(view.myHand).toHaveLength(state.players[1]!.hand.length);
    expect(view.myHand).toEqual(state.players[1]!.hand);
    // Per-seat: viewer carries hand; everyone else has HIDDEN-card
    // placeholders so .length still works but no identity leaks.
    for (const p of view.players) {
      expect(p.handSize).toBe(state.players[p.id]!.hand.length);
      expect(p.hand).toHaveLength(state.players[p.id]!.hand.length);
      if (p.id === 1) {
        expect(p.hand).toEqual(state.players[1]!.hand);
      } else {
        for (const c of p.hand) {
          expect(c.kind).toBe("HIDDEN");
        }
      }
    }
  });

  it("hides the draw deck and removed cards as HIDDEN-padded arrays", () => {
    const engine = new Engine({ seed: 7, playerCount: 3 });
    const state = engine.getState();
    const view = projectFor(state, 0);

    expect(view.drawDeckCount).toBe(state.drawDeck.length);
    expect(view.removedCardsCount).toBe(state.removedCards.length);
    expect(view.drawDeck).toHaveLength(state.drawDeck.length);
    expect(view.removedCards).toHaveLength(state.removedCards.length);
    for (const c of view.drawDeck) expect(c.kind).toBe("HIDDEN");
    for (const c of view.removedCards) expect(c.kind).toBe("HIDDEN");
  });

  it("preserves public fields verbatim", () => {
    const engine = new Engine({ seed: 99, playerCount: 4 });
    const state = engine.getState();
    const view = projectFor(state, 2);

    expect(view.era).toBe(state.era);
    expect(view.round).toBe(state.round);
    expect(view.phase).toBe(state.phase);
    expect(view.turnOrder).toEqual(state.turnOrder);
    expect(view.currentPlayerIndex).toBe(state.currentPlayerIndex);
    expect(view.actionsRemaining).toBe(state.actionsRemaining);
    expect(view.builtTiles).toBe(state.builtTiles);
    expect(view.developedLinks).toBe(state.developedLinks);
    expect(view.coalMarket).toBe(state.coalMarket);
    expect(view.ironMarket).toBe(state.ironMarket);
    expect(view.merchantSlots).toBe(state.merchantSlots);
    expect(view.wildReserve).toEqual(state.wildReserve);
  });

  it("spectator views redact every hand", () => {
    const engine = new Engine({ seed: 5, playerCount: 4 });
    const view = projectForSpectator(engine.getState());

    expect(view.viewerSeatId).toBe(-1);
    expect(view.myHand).toEqual([]);
    for (const p of view.players) {
      expect(p.handSize).toBeGreaterThan(0); // they DO have cards, just hidden
      expect(p.hand).toHaveLength(p.handSize);
      for (const c of p.hand) expect(c.kind).toBe("HIDDEN");
    }
  });

  it("does not alias the viewer's hand array (defence-in-depth)", () => {
    const engine = new Engine({ seed: 1, playerCount: 2 });
    const state = engine.getState();
    const view = projectFor(state, 0);

    expect(view.myHand).toEqual(state.players[0]!.hand);
    // Mutating the projected hand must not bleed back into the engine.
    (view.players[0]!.hand as unknown as { push: (c: unknown) => void }).push(
      { kind: "WILD_LOCATION" } as never,
    );
    expect(state.players[0]!.hand.length).toBe(8);
  });

  it("doesn't expose drawDeck contents even via JSON.stringify", () => {
    // The wire format is JSON, so any field the projection forgot to
    // strip would leak. Walk the serialised view and assert no card
    // entry references a hidden zone.
    const engine = new Engine({ seed: 13, playerCount: 4 });
    const state = engine.getState();
    const view = projectFor(state, 0);

    const wire = JSON.stringify(view);
    // Pick a card that ends up in the draw deck — its city/industry
    // string would appear in `wire` if drawDeck leaked. Use the first
    // card in the deck, which is some Card variant.
    const sampleDeckCard = state.drawDeck[0]!;
    const fingerprint =
      sampleDeckCard.kind === "LOCATION"
        ? sampleDeckCard.cityName
        : sampleDeckCard.kind === "INDUSTRY"
          ? sampleDeckCard.industries.join("/")
          : null;
    if (fingerprint !== null) {
      // The same fingerprint may appear in OUR hand or in some other
      // public surface (a built tile's city, etc.) — so we can't just
      // assert "string not present". Instead, count occurrences of the
      // city name and assert it's bounded by what's in our hand +
      // what's on the public board, never the deck.
      const ownHand = state.players[0]!.hand;
      const inOwnHand = ownHand.filter((c) => {
        if (sampleDeckCard.kind === "LOCATION" && c.kind === "LOCATION")
          return c.cityName === sampleDeckCard.cityName;
        if (sampleDeckCard.kind === "INDUSTRY" && c.kind === "INDUSTRY")
          return c.industries.join("/") === sampleDeckCard.industries.join("/");
        return false;
      }).length;
      const inDeck = state.drawDeck.filter((c) => {
        if (sampleDeckCard.kind === "LOCATION" && c.kind === "LOCATION")
          return c.cityName === sampleDeckCard.cityName;
        if (sampleDeckCard.kind === "INDUSTRY" && c.kind === "INDUSTRY")
          return c.industries.join("/") === sampleDeckCard.industries.join("/");
        return false;
      }).length;
      // The wire DOES carry a `drawDeck` array, but every entry is a
      // HIDDEN placeholder (`{"kind":"HIDDEN"}`). Verify none of them
      // carry the sample deck card's identifying fingerprint.
      const deckSection = wire.match(/"drawDeck":\[(.*?)\]/);
      const removedSection = wire.match(/"removedCards":\[(.*?)\]/);
      expect(deckSection).not.toBeNull();
      expect(removedSection).not.toBeNull();
      // No real card identity appears inside the redacted arrays.
      expect(deckSection?.[1]?.includes(fingerprint)).toBe(false);
      expect(removedSection?.[1]?.includes(fingerprint)).toBe(false);
      void inOwnHand;
      void inDeck;
    }
  });
});
