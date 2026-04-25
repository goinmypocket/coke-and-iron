// =============================================================================
// §11.6 Remaining cards — two-column inventory of state.drawDeck.
//
// Groups entries by Location cards (by district tag), Industry cards (one
// row per distinct industries-tuple), then Wild cards. Header shows
// "N/total" where total = drawDeck + every player's hand + discards +
// removedCards (canal-setup face-down — surfaced separately so the count
// is visible without revealing identities).
//
// Polish deferred: alphabetical sort within district per spec, district
// colour swatches, full muted-zero list (today only counts what's in the
// live drawDeck — cards exhausted to discards / hands disappear from this
// panel until reshuffled).
// =============================================================================

import type { Card, GameState } from "../../engine";
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
    const total =
      s.drawDeck.length +
      s.removedCards.length +
      s.players.reduce(
        (acc, p) => acc + p.hand.length + p.discardPile.length,
        0,
      );
    return {
      drawDeck: s.drawDeck,
      removedCount: s.removedCards.length,
      cityToDistrict: cityDistrictMap(s),
      total,
    };
  }, shallowEqual);

  const groups = groupCards(view.drawDeck, view.cityToDistrict);

  return (
    <Panel
      id="remaining_cards"
      title={`Remaining cards — ${view.drawDeck.length}/${view.total}`}
      maximizable
    >
      <div className="remaining-cards__meta">
        Removed face-down (canal): {view.removedCount}
      </div>
      <div className="remaining-cards__grid">
        {DISTRICT_ORDER.map((tag) => (
          <Group
            key={tag}
            label={`${DISTRICT_LABEL[tag]} cities`}
            entries={groups.locations[tag] ?? []}
          />
        ))}
        <Group label="Industry" entries={groups.industries} />
        <Group label="Wild" entries={groups.wilds} />
      </div>
    </Panel>
  );
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

function cityDistrictMap(state: GameState): ReadonlyMap<string, string> {
  const m = new Map<string, string>();
  for (const c of state.districtCities) m.set(c.name, c.districtTag);
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
  wilds: Entry[];
} {
  const locByDistrict: Record<string, Map<string, number>> = {};
  const indByLabel = new Map<string, number>();
  const wildByLabel = new Map<string, number>();

  for (const card of deck) {
    if (card.kind === "LOCATION") {
      const tag = cityToDistrict.get(card.cityName) ?? "other";
      const map = locByDistrict[tag] ?? new Map<string, number>();
      map.set(card.cityName, (map.get(card.cityName) ?? 0) + 1);
      locByDistrict[tag] = map;
    } else if (card.kind === "INDUSTRY") {
      const label = card.industries.map(prettyIndustry).join(" / ");
      indByLabel.set(label, (indByLabel.get(label) ?? 0) + 1);
    } else if (card.kind === "WILD_LOCATION") {
      wildByLabel.set("Wild Location", (wildByLabel.get("Wild Location") ?? 0) + 1);
    } else {
      wildByLabel.set("Wild Industry", (wildByLabel.get("Wild Industry") ?? 0) + 1);
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
  const wilds = Array.from(wildByLabel.entries()).map(([name, count]) => ({
    name,
    count,
  }));

  return { locations, industries, wilds };
}

function prettyIndustry(name: string): string {
  return name
    .split("_")
    .map((part) => part[0]! + part.slice(1).toLowerCase())
    .join(" ");
}
