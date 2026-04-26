import { useMemo, useState } from "react";
import type { Card, DistrictCity, IndustryName } from "../../engine";
import { useMySeatId } from "../hooks/EngineProvider";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { HandSizeIcon } from "../icons/HandSizeIcon";
import { DISTRICT_FILL, INDUSTRY_ICON } from "../industryIcons";
import { RemainingCardsOverlay } from "../overlays/RemainingCardsOverlay";
import { useWizard } from "../wizards/WizardProvider";

/**
 * §11.7 Hand — viewer's own hand as a chrome-less centred banner that
 * sits at the BOTTOM of the app shell, mirroring the actions banner
 * at the top. Cards lay out in a single horizontal row, centred.
 * Location cards show the city name coloured by its district. Industry
 * cards show the industry icon (single or stacked for the
 * Cotton/Manufacturer dual). Wild cards show a compact "WL" or "WI"
 * label.
 *
 * One client never sees another seat's hand — even when it's another
 * player's turn the local viewer keeps seeing their own cards. Card
 * clicks only feed the wizard when it's the viewer's turn; otherwise
 * cards render but are non-interactive.
 */
export function HandPanel() {
  const wizard = useWizard();
  const mySeatId = useMySeatId();
  const [deckOpen, setDeckOpen] = useState(false);
  const view = useGameState((s) => {
    const activeId = s.turnOrder[s.currentPlayerIndex] ?? null;
    const me =
      mySeatId !== null ? s.players.find((p) => p.id === mySeatId) : null;
    // Remaining-deck count is public information (the draw pile is shared
    // and visible). Drives the count badge on the deck button beside the
    // hand cards.
    return {
      name: me?.displayName ?? "—",
      hand: me?.hand ?? [],
      isMyTurn: activeId !== null && activeId === mySeatId,
      drawDeckCount: s.drawDeck.length,
      districtCities: s.districtCities,
    };
  }, shallowEqual);

  const cityToDistrict = useMemo(
    () => indexCityDistricts(view.districtCities),
    [view.districtCities],
  );

  return (
    <div className="hand-banner">
      <div className="hand-banner__label">
        {mySeatId === null
          ? "No seat claimed"
          : `Hand — ${view.name}${view.isMyTurn ? "" : " (waiting)"}`}
      </div>
      <div className="hand-banner__cards">
        <DeckButton
          remaining={view.drawDeckCount}
          onClick={() => setDeckOpen(true)}
        />
        {view.hand.map((card, i) => (
          <CardFace
            key={i}
            card={card}
            picked={wizard.picked.has(i)}
            interactive={view.isMyTurn}
            cityToDistrict={cityToDistrict}
            onClick={view.isMyTurn ? () => wizard.pickCard(i) : undefined}
          />
        ))}
      </div>
      <RemainingCardsOverlay
        open={deckOpen}
        onClose={() => setDeckOpen(false)}
      />
    </div>
  );
}

/**
 * Square card-face-styled trigger that sits beside the hand cards.
 * Clicking opens the RemainingCardsOverlay; the badge underneath shows
 * the draw-deck count (a public, always-visible signal of how close the
 * round is to a reshuffle / era-flip).
 */
function DeckButton({
  remaining,
  onClick,
}: {
  remaining: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="card-face card-face--deck"
      onClick={onClick}
      aria-label={`Show remaining cards — draw deck: ${remaining}`}
      title={`Remaining cards (draw deck: ${remaining})`}
    >
      <HandSizeIcon amount={remaining} size={18} />
    </button>
  );
}

function CardFace({
  card,
  picked,
  interactive,
  cityToDistrict,
  onClick,
}: {
  card: Card;
  picked: boolean;
  interactive: boolean;
  cityToDistrict: ReadonlyMap<string, string>;
  onClick?: (() => void) | undefined;
}) {
  const baseCls = [
    "card-face",
    picked ? "card-face--picked" : "",
    interactive ? "card-face--clickable" : "card-face--inert",
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
          onClick={interactive ? onClick : undefined}
          role={interactive ? "button" : undefined}
          tabIndex={interactive ? 0 : -1}
          aria-disabled={interactive ? undefined : true}
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
          onClick={interactive ? onClick : undefined}
          role={interactive ? "button" : undefined}
          tabIndex={interactive ? 0 : -1}
          aria-disabled={interactive ? undefined : true}
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
          onClick={interactive ? onClick : undefined}
          role={interactive ? "button" : undefined}
          tabIndex={interactive ? 0 : -1}
          aria-disabled={interactive ? undefined : true}
          title="Wild Location"
        >
          WL
        </div>
      );
    case "WILD_INDUSTRY":
      return (
        <div
          className={`${baseCls} card-face--wild`}
          onClick={interactive ? onClick : undefined}
          role={interactive ? "button" : undefined}
          tabIndex={interactive ? 0 : -1}
          aria-disabled={interactive ? undefined : true}
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
