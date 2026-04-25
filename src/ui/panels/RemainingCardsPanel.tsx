// =============================================================================
// §11.6 Remaining cards — inventory of cards still "in the deck" from a
// player's perspective.
//
// The canal-era face-down removed cards (state.removedCards, identities
// known to the engine but hidden from players) are FOLDED into the same
// pool as state.drawDeck for category counts. That way:
//
//   - Players can't tell which specific card was removed (the removed
//     identities mix in with the still-shuffled deck).
//   - The aggregate per-category counts are honest: "Birmingham × 3"
//     means there are 3 Birminghams nobody has seen yet, regardless of
//     whether they're in the draw pile or face-down.
//
// Header ratio: (drawDeck + removedCards) / total non-wild deck size.
// The denominator is constant for the duration of the game — every
// non-wild card just moves between draw pile / removed / hands / discards;
// none vanish or duplicate.
// =============================================================================

import { useMemo } from "react";
import type { Card, DistrictCity } from "../../engine";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { Panel } from "../layout/Panel";

const DISTRICT_ORDER = ["purple", "brown", "red", "blue", "teal"] as const;
const DISTRICT_LABEL: Readonly<Record<(typeof DISTRICT_ORDER)[number], string>> = {
  purple: "Purple",
  brown: "Brown",
  red: "Red",
  blue: "Blue",
  teal: "Teal",
};

export function RemainingCardsPanel() {
  const view = useGameState((s) => {
    const handsAndDiscards = s.players.reduce(
      (acc, p) => acc + countNonWild(p.hand) + countNonWild(p.discardPile),
      0,
    );
    const deckPoolSize = s.drawDeck.length + s.removedCards.length;
    const total = deckPoolSize + handsAndDiscards;
    return {
      drawDeck: s.drawDeck,
      removedCards: s.removedCards,
      districtCities: s.districtCities,
      deckPoolSize,
      total,
    };
  }, shallowEqual);

  // Built outside the selector so the snapshot stays referentially stable
  // (a fresh Map on every selector call would defeat shallowEqual and
  // trigger useSyncExternalStore's unstable-snapshot guard).
  const cityToDistrict = useMemo(
    () => cityDistrictMap(view.districtCities),
    [view.districtCities],
  );
  // Combine drawDeck + removedCards so face-down identities mix in with
  // the rest of the unseen pool — players see aggregate counts only.
  const deckPool = useMemo(
    () => [...view.drawDeck, ...view.removedCards],
    [view.drawDeck, view.removedCards],
  );
  const groups = groupCards(deckPool, cityToDistrict);

  return (
    <Panel
      id="remaining_cards"
      title={`Remaining cards — ${view.deckPoolSize}/${view.total}`}
      maximizable
    >
      <div className="remaining-cards__grid">
        {DISTRICT_ORDER.map((tag) => (
          <Group
            key={tag}
            label={`${DISTRICT_LABEL[tag]} cities`}
            entries={groups.locations[tag] ?? []}
          />
        ))}
        <Group label="Industry" entries={groups.industries} />
      </div>
    </Panel>
  );
}

function countNonWild(cards: readonly Card[]): number {
  let n = 0;
  for (const c of cards) {
    if (c.kind === "LOCATION" || c.kind === "INDUSTRY") n++;
  }
  return n;
}

function Group({
  label,
  entries,
}: {
  label: string;
  entries: readonly { name: string; count: number }[];
}) {
  if (entries.length === 0) return null;
  return (
    <div className="remaining-cards__group">
      <div className="remaining-cards__group-label">{label}</div>
      <ul className="remaining-cards__list">
        {entries.map((e) => (
          <li
            key={e.name}
            className={
              e.count === 0
                ? "remaining-cards__row remaining-cards__row--muted"
                : "remaining-cards__row"
            }
          >
            <span>{e.name}</span>
            <span>×{e.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function cityDistrictMap(
  cities: readonly DistrictCity[],
): ReadonlyMap<string, string> {
  const m = new Map<string, string>();
  for (const c of cities) m.set(c.name, c.districtTag);
  return m;
}

interface Entry {
  name: string;
  count: number;
}

function groupCards(
  deck: readonly Card[],
  cityToDistrict: ReadonlyMap<string, string>,
): {
  locations: Record<string, Entry[]>;
  industries: Entry[];
} {
  const locByDistrict: Record<string, Map<string, number>> = {};
  const indByLabel = new Map<string, number>();

  // Wild cards never enter the deck pool — they live in state.wildReserve
  // and return there on use (§2.13). Skip defensively in case that
  // invariant breaks.
  for (const card of deck) {
    if (card.kind === "LOCATION") {
      const tag = cityToDistrict.get(card.cityName) ?? "other";
      const map = locByDistrict[tag] ?? new Map<string, number>();
      map.set(card.cityName, (map.get(card.cityName) ?? 0) + 1);
      locByDistrict[tag] = map;
    } else if (card.kind === "INDUSTRY") {
      const label = card.industries.map(prettyIndustry).join(" / ");
      indByLabel.set(label, (indByLabel.get(label) ?? 0) + 1);
    }
  }

  const locations: Record<string, Entry[]> = {};
  for (const [tag, map] of Object.entries(locByDistrict)) {
    locations[tag] = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));
  }
  const industries = Array.from(indByLabel.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, count }));

  return { locations, industries };
}

function prettyIndustry(name: string): string {
  return name
    .split("_")
    .map((part) => part[0]! + part.slice(1).toLowerCase())
    .join(" ");
}
