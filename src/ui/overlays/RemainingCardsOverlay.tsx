// =============================================================================
// §11.6 Remaining cards — modal overlay listing every non-wild card that is
// still UNPLAYED from the active player's perspective.
//
// Replaces the old always-visible RemainingCardsPanel. The deck button in
// the hand banner toggles this overlay; clicking the backdrop or the close
// button dismisses it.
//
// "Remaining" means every non-wild card that has not yet been played and
// shuffled into a discard pile. The pool therefore includes:
//
//   - state.drawDeck             (unseen)
//   - state.removedCards         (canal-era face-down, unseen)
//   - every player's current hand (own hand visible to the active
//                                  player; other hands hidden — but the
//                                  aggregate counts are public, just
//                                  like physical cards face-down on the
//                                  table)
//
// Discards are excluded — those have been played and are publicly known.
//
// Header ratio: remaining-non-wild / total-non-wild universe. The
// denominator is constant for the duration of the game.
//
// Rows for cards that exist in the universe but currently total 0
// (all copies in discards) render muted at 0/N rather than vanishing,
// so players can scan for "where did all the Birminghams go?".
// =============================================================================

import { useEffect, useMemo } from "react";
import {
  buildDeck,
  DEFAULT_CARDS_CONFIG,
  type Card,
  type DistrictCity,
  type DistrictTag,
} from "../../engine";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { DISTRICT_FILL, DISTRICT_LABEL } from "../industryIcons";

const DISTRICT_ORDER: readonly DistrictTag[] = [
  "purple",
  "brown",
  "red",
  "blue",
  "teal",
];

export function RemainingCardsOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // ESC closes the modal — standard affordance for any overlay opened
  // by a discrete trigger.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="overlay-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="remaining-cards-overlay" role="dialog" aria-modal="true">
        <RemainingCardsBody onClose={onClose} />
      </div>
    </div>
  );
}

function RemainingCardsBody({ onClose }: { onClose: () => void }) {
  const view = useGameState(
    (s) => ({
      // discardPiles are public, so we can derive remaining-by-type
      // counts as `universe - sum(discards)`. The redacted draw deck
      // and other players' hands never need to be enumerated by
      // identity — that's the whole point of the privacy split.
      players: s.players,
      districtCities: s.districtCities,
      playerCount: s.playerCount,
    }),
    shallowEqual,
  );

  const cityToDistrict = useMemo(
    () => cityDistrictMap(view.districtCities),
    [view.districtCities],
  );

  const universe = useMemo(
    () =>
      groupCanonicalCards(
        buildDeck(DEFAULT_CARDS_CONFIG, view.playerCount),
        cityToDistrict,
      ),
    [view.playerCount, cityToDistrict],
  );

  const universeTotal = useMemo(() => {
    let n = 0;
    for (const list of Object.values(universe.locations)) {
      for (const e of list) n += e.total;
    }
    for (const e of universe.industries) n += e.total;
    return n;
  }, [universe]);

  // Cards still "in play" (deck + removed pile + every hand) have
  // identity = universe minus what's already been discarded. Discard
  // piles are open on the table so this computation uses zero
  // private information about other seats.
  const discardCounts = useMemo(
    () =>
      countByKey(
        view.players.flatMap((p) => p.discardPile),
        cityToDistrict,
      ),
    [view.players, cityToDistrict],
  );

  const counts = useMemo(() => {
    const locations = new Map<string, number>();
    const industries = new Map<string, number>();
    for (const list of Object.values(universe.locations)) {
      for (const e of list) {
        locations.set(e.name, e.total - (discardCounts.locations.get(e.name) ?? 0));
      }
    }
    for (const e of universe.industries) {
      industries.set(e.name, e.total - (discardCounts.industries.get(e.name) ?? 0));
    }
    return { locations, industries };
  }, [universe, discardCounts]);

  const remainingNonWild = useMemo(() => {
    let n = 0;
    for (const v of counts.locations.values()) n += v;
    for (const v of counts.industries.values()) n += v;
    return n;
  }, [counts]);

  return (
    <>
      <div className="remaining-cards-overlay__head">
        <div className="remaining-cards-overlay__title">
          Remaining cards — {remainingNonWild}/{universeTotal}
        </div>
        <button
          type="button"
          className="action-btn"
          onClick={onClose}
          aria-label="Close remaining cards"
        >
          Close
        </button>
      </div>
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
    </>
  );
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
