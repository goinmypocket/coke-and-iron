import { useGameState } from "../hooks/useGameState";
import { Panel } from "../layout/Panel";
import { useWizard } from "../wizards/WizardProvider";
import type { Card } from "../../engine";

/**
 * §11.7 Hand — active seat's hand as a 2x4 grid. Clicking a card during
 * a wizard either dispatches (Pass / Loan) or toggles selection (Scout);
 * picked cards render with a warm-gold border. Clicks on non-active
 * seats and clicks while no wizard is open are ignored — the
 * card-first IDLE flow (§10.1) is not yet implemented.
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
    };
  });

  const wizardOpen = wizard.state.phase !== "IDLE";

  return (
    <Panel id="hand" title={`Hand — ${view.name}`} maximizable>
      <div className="hand-grid">
        {view.hand.map((card, i) => (
          <CardFace
            key={i}
            card={card}
            picked={wizard.picked.has(i)}
            clickable={wizardOpen}
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
  clickable,
  onClick,
}: {
  card: Card;
  picked: boolean;
  clickable: boolean;
  onClick: () => void;
}) {
  const className = [
    "card-face",
    picked ? "card-face--picked" : "",
    clickable ? "card-face--clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleClick = clickable ? onClick : undefined;
  const role = clickable ? "button" : undefined;
  const tabIndex = clickable ? 0 : undefined;

  switch (card.kind) {
    case "LOCATION":
      return (
        <div
          className={className}
          onClick={handleClick}
          role={role}
          tabIndex={tabIndex}
        >
          {card.cityName}
        </div>
      );
    case "INDUSTRY":
      return (
        <div
          className={`${className} card-face--industry`}
          onClick={handleClick}
          role={role}
          tabIndex={tabIndex}
        >
          {card.industries.map((ind) => (
            <span key={ind} className="card-face__industry">
              {prettyIndustry(ind)}
            </span>
          ))}
        </div>
      );
    case "WILD_LOCATION":
      return (
        <div
          className={`${className} card-face--wild`}
          onClick={handleClick}
          role={role}
          tabIndex={tabIndex}
        >
          Wild Location
        </div>
      );
    case "WILD_INDUSTRY":
      return (
        <div
          className={`${className} card-face--wild`}
          onClick={handleClick}
          role={role}
          tabIndex={tabIndex}
        >
          Wild Industry
        </div>
      );
  }
}

function prettyIndustry(name: string): string {
  return name
    .split("_")
    .map((part) => part[0]! + part.slice(1).toLowerCase())
    .join(" ");
}
