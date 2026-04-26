import { useMemo } from "react";
import type { Card, DistrictCity, IndustryName } from "../../engine";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { DISTRICT_FILL, INDUSTRY_ICON } from "../industryIcons";
import { Panel } from "../layout/Panel";
import { useWizard } from "../wizards/WizardProvider";

/**
 * §11.7 Hand — active seat's hand as a 2x4 grid of small cards.
 * Location cards show the city name coloured by its district.
 * Industry cards show the industry icon (single or vertically stacked
 * for the Cotton/Manufacturer dual). Wild cards show a compact "WL"
 * or "WI" label.
 */
export function HandPanel() {
  const wizard = useWizard();
  const view = useGameState((s) => {
    const activeId = s.turnOrder[s.currentPlayerIndex] ?? null;
    const active =
      activeId !== null ? s.players.find((p) => p.id === activeId) : null;
    return {
      name: active?.displayName ?? "—",
      hand: active?.hand ?? [],
      districtCities: s.districtCities,
    };
  }, shallowEqual);

  const cityToDistrict = useMemo(
    () => indexCityDistricts(view.districtCities),
    [view.districtCities],
  );

  return (
    <Panel id="hand" title={`Hand — ${view.name}`}>
      <div className="hand-grid">
        {view.hand.map((card, i) => (
          <CardFace
            key={i}
            card={card}
            picked={wizard.picked.has(i)}
            cityToDistrict={cityToDistrict}
            onClick={() => wizard.pickCard(i)}
          />
        ))}
      </div>
    </Panel>
  );
}

function CardFace({
  card,
  picked,
  cityToDistrict,
  onClick,
}: {
  card: Card;
  picked: boolean;
  cityToDistrict: ReadonlyMap<string, string>;
  onClick: () => void;
}) {
  const baseCls = [
    "card-face",
    picked ? "card-face--picked" : "",
    "card-face--clickable",
  ]
    .filter(Boolean)
    .join(" ");

  switch (card.kind) {
    case "LOCATION": {
      const tag = cityToDistrict.get(card.cityName);
      const color = tag ? DISTRICT_FILL[tag as keyof typeof DISTRICT_FILL] : undefined;
      return (
        <div
          className={`${baseCls} card-face--location`}
          onClick={onClick}
          role="button"
          tabIndex={0}
        >
          <span className="card-face__city" style={color ? { color } : undefined}>
            {card.cityName}
          </span>
        </div>
      );
    }
    case "INDUSTRY":
      return (
        <div
          className={`${baseCls} card-face--industry`}
          onClick={onClick}
          role="button"
          tabIndex={0}
          title={card.industries.join(" / ")}
        >
          {card.industries.map((ind) => (
            <img
              key={ind}
              src={INDUSTRY_ICON[ind as IndustryName]}
              className="card-face__industry-icon"
              alt={ind}
            />
          ))}
        </div>
      );
    case "WILD_LOCATION":
      return (
        <div
          className={`${baseCls} card-face--wild`}
          onClick={onClick}
          role="button"
          tabIndex={0}
          title="Wild Location"
        >
          WL
        </div>
      );
    case "WILD_INDUSTRY":
      return (
        <div
          className={`${baseCls} card-face--wild`}
          onClick={onClick}
          role="button"
          tabIndex={0}
          title="Wild Industry"
        >
          WI
        </div>
      );
  }
}

function indexCityDistricts(
  cities: readonly DistrictCity[],
): ReadonlyMap<string, string> {
  const m = new Map<string, string>();
  for (const c of cities) m.set(c.name, c.districtTag);
  return m;
}
