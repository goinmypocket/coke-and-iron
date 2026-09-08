import { useMemo, useState } from "react";
import type { Card, DistrictCity, IndustryName } from "../../../engine";
import { useActualSeatId, usePaused } from "../hooks/EngineProvider";
import { shallowEqual, useGameState } from "../hooks/useGameState";
import { HandSizeIcon } from "../icons/HandSizeIcon";
import { DISTRICT_FILL, INDUSTRY_ICON, INDUSTRY_LABEL } from "../industryIcons";
import { RemainingCardsOverlay } from "../overlays/RemainingCardsOverlay";
import { useWizard } from "../wizards/WizardProvider";

const EMPTY_HAND: readonly Card[] = [];

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
  const paused = usePaused();
  // Spectators viewing through a player see that player's hand, but must
  // not be able to act for them. The hand to render is whatever seat the
  // server projected this view from — read it straight off the view so
  // the selector stays pure on engine state and never goes stale on a
  // mid-snapshot mySeatId update.
  const actualSeatId = useActualSeatId();
  const [deckOpen, setDeckOpen] = useState(false);
  const view = useGameState((s) => {
    const activeId = s.turnOrder[s.currentPlayerIndex] ?? null;
    // ClientEngine's getState() returns a PlayerView typed as GameState
    // (see ClientEngine.ts header). PlayerView carries `viewerSeatId`
    // — the seat the host projected this view from — which is the most
    // authoritative answer to "whose hand should we render?".
    const projected = (s as unknown as { viewerSeatId?: number })
      .viewerSeatId;
    const viewerSeatId =
      projected !== undefined && projected >= 0 ? projected : null;
    const me =
      viewerSeatId !== null
        ? s.players.find((p) => p.id === viewerSeatId)
        : null;
    return {
      hand: me?.hand ?? EMPTY_HAND,
      name: me?.displayName ?? null,
      canAct: s.actionsRemaining > 0 && s.pendingShortfalls.length === 0 && s.phase === "PLAYER_TURNS",
      activeId,
      viewerSeatId,
      drawDeckCount: s.drawDeck.length,
      districtCities: s.districtCities,
    };
  }, shallowEqual);
  const isMyTurn =
    !paused && view.canAct &&
    view.activeId !== null &&
    actualSeatId !== null &&
    view.activeId === actualSeatId &&
    actualSeatId === view.viewerSeatId;

  const cityToDistrict = useMemo(
    () => indexCityDistricts(view.districtCities),
    [view.districtCities],
  );

  return (
    <section className="hand-banner" aria-label="Hand">
      <div className="ci-section-heading">
        <h2>{actualSeatId !== null && actualSeatId === view.viewerSeatId ? "Your hand" : view.name ? `${view.name}’s hand` : "Hand"} <span>({view.hand.length})</span></h2>
        <DeckButton
          remaining={view.drawDeckCount}
          onClick={() => setDeckOpen(true)}
        />
      </div>
      <div className="hand-banner__cards">
        {view.hand.map((card, i) => (
          <CardFace
            key={i}
            card={card}
            picked={wizard.picked.has(i)}
            interactive={isMyTurn}
            cityToDistrict={cityToDistrict}
            onClick={isMyTurn ? () => wizard.pickCard(i) : undefined}
          />
        ))}
      </div>
      {view.hand.length === 0 ? <p className="ci-empty-hand">{view.viewerSeatId === null ? "Choose a player view to inspect their hand." : "No cards left in hand."}</p> : null}
      <RemainingCardsOverlay
        open={deckOpen}
        onClose={() => setDeckOpen(false)}
      />
    </section>
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
      className="action-btn ci-deck-button"
      onClick={onClick}
      aria-label={`Show remaining cards — draw deck: ${remaining}`}
      title={`Remaining cards (draw deck: ${remaining})`}
    >
      <HandSizeIcon amount={remaining} size={20} /> Draw deck
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

  if (card.kind === "HIDDEN") return <div className="card-face card-face--inert">Hidden card</div>;
  const label = card.kind === "LOCATION" ? card.cityName
    : card.kind === "INDUSTRY" ? card.industries.map(ind => INDUSTRY_LABEL[ind]).join(" / ")
    : card.kind === "WILD_LOCATION" ? "Wild Location" : "Wild Industry";
  const district = card.kind === "LOCATION" ? cityToDistrict.get(card.cityName) : undefined;
  const swatch = district ? DISTRICT_FILL[district as keyof typeof DISTRICT_FILL] : undefined;
  return (
    <button type="button" className={baseCls} disabled={!interactive} aria-pressed={picked}
      aria-label={label} title={label} onClick={onClick}>
      {picked ? <span className="card-face__check" aria-hidden="true">✓</span> : null}
      {card.kind === "INDUSTRY" ? <span className="card-face__icons">{card.industries.map(ind =>
        <img key={ind} src={INDUSTRY_ICON[ind as IndustryName]} className="card-face__industry-icon" alt="" />
      )}</span> : <span className="card-face__mark" style={swatch ? { background: swatch } : undefined} aria-hidden="true">{card.kind === "LOCATION" ? "" : "✦"}</span>}
      <span className="card-face__name">{label}</span>
    </button>
  );
}

function indexCityDistricts(
  cities: readonly DistrictCity[],
): ReadonlyMap<string, string> {
  const m = new Map<string, string>();
  for (const c of cities) m.set(c.name, c.districtTag);
  return m;
}
