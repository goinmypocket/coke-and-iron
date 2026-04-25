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
//
// Rows for cards that *could* still be in the unseen pool but currently
// happen to be 0 (all copies in hands or discards) render muted at ×0
// rather than disappearing — so a player can scan for "where did all
// the Birminghams go?".
// =============================================================================

import { useMemo } from "react";
import {
  buildDeck,
  DEFAULT_CARDS_CONFIG,
  type Card,
  type DistrictCity,
  type DistrictTag,
} from "../../engine";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { DISTRICT_FILL, DISTRICT_LABEL } from "../industryIcons";
import { Panel } from "../layout/Panel";

const DISTRICT_ORDER: readonly DistrictTag[] = [
  "purple",
  "brown",
  "red",
  "blue",
  "teal",
];

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
      playerCount: s.playerCount,
      deckPoolSize,
      total,
    };
  }, shallowEqual);

  const cityToDistrict = useMemo(
    () => cityDistrictMap(view.districtCities),
    [view.districtCities],
  );

  // Canonical universe of non-wild cards for this player count — every
  // card type that could ever appear in the unseen pool. Built once per
  // playerCount; values never change mid-game.
  const universe = useMemo(
    () =>
      groupCanonicalCards(
        buildDeck(DEFAULT_CARDS_CONFIG, view.playerCount),
        cityToDistrict,
      ),
    [view.playerCount, cityToDistrict],
  );

  const deckPool = useMemo(
    () => [...view.drawDeck, ...view.removedCards],
    [view.drawDeck, view.removedCards],
  );

  const counts = useMemo(
    () => countByKey(deckPool, cityToDistrict),
    [deckPool, cityToDistrict],
  );

  return (
    <Panel
      id="remaining_cards"
      title={`Remaining cards — ${view.deckPoolSize}/${view.total}`}
      maximizable
    >
      <div className="remaining-cards__grid">
        {DISTRICT_ORDER.map((tag) => {
          const entries = (universe.locations[tag] ?? []).map((u) => ({
            name: u.name,
            count: counts.locations.get(u.name) ?? 0,
            total: u.total,
          }));
          return (
            <Group
              key={tag}
              tag={tag}
              label={`${DISTRICT_LABEL[tag]} cities`}
              entries={entries}
            />
          );
        })}
        <Group
          tag={null}
          label="Industry"
          entries={universe.industries.map((u) => ({
            name: u.name,
            count: counts.industries.get(u.name) ?? 0,
            total: u.total,
          }))}
        />
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
  tag,
  label,
  entries,
}: {
  tag: DistrictTag | null;
  label: string;
  entries: readonly { name: string; count: number; total: number }[];
}) {
  if (entries.length === 0) return null;
  const swatchColor = tag ? DISTRICT_FILL[tag] : undefined;
  return (
    <div className="remaining-cards__group">
      <div
        className="remaining-cards__group-label"
        style={swatchColor ? { borderLeft: `4px solid ${swatchColor}`, paddingLeft: 6 } : undefined}
      >
        {label}
      </div>
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
            <span>{e.count}/{e.total}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function cityDistrictMap(
  cities: readonly DistrictCity[],
): ReadonlyMap<string, DistrictTag> {
  const m = new Map<string, DistrictTag>();
  for (const c of cities) m.set(c.name, c.districtTag);
  return m;
}

function groupCanonicalCards(
  deck: readonly Card[],
  cityToDistrict: ReadonlyMap<string, DistrictTag>,
): {
  locations: Record<string, { name: string; total: number }[]>;
  industries: { name: string; total: number }[];
} {
  const locByDistrict: Record<string, Map<string, number>> = {};
  const industriesMap = new Map<string, number>();
  for (const card of deck) {
    if (card.kind === "LOCATION") {
      const tag = cityToDistrict.get(card.cityName) ?? "other";
      const m = locByDistrict[tag] ?? new Map<string, number>();
      m.set(card.cityName, (m.get(card.cityName) ?? 0) + 1);
      locByDistrict[tag] = m;
    } else if (card.kind === "INDUSTRY") {
      const label = card.industries.map(prettyIndustry).join(" / ");
      industriesMap.set(label, (industriesMap.get(label) ?? 0) + 1);
    }
  }
  const locations: Record<string, { name: string; total: number }[]> = {};
  for (const [tag, m] of Object.entries(locByDistrict)) {
    locations[tag] = [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, total]) => ({ name, total }));
  }
  return {
    locations,
    industries: [...industriesMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, total]) => ({ name, total })),
  };
}

function countByKey(
  deck: readonly Card[],
  cityToDistrict: ReadonlyMap<string, DistrictTag>,
): {
  locations: Map<string, number>;
  industries: Map<string, number>;
} {
  const locations = new Map<string, number>();
  const industries = new Map<string, number>();
  for (const card of deck) {
    if (card.kind === "LOCATION") {
      // Skip cities that aren't in the district map defensively — they
      // wouldn't show up in any group anyway.
      if (!cityToDistrict.has(card.cityName)) continue;
      locations.set(card.cityName, (locations.get(card.cityName) ?? 0) + 1);
    } else if (card.kind === "INDUSTRY") {
      const label = card.industries.map(prettyIndustry).join(" / ");
      industries.set(label, (industries.get(label) ?? 0) + 1);
    }
  }
  return { locations, industries };
}

function prettyIndustry(name: string): string {
  return name
    .split("_")
    .map((part) => part[0]! + part.slice(1).toLowerCase())
    .join(" ");
}
