import { useGameState } from "../hooks/useGameState";
import { Panel } from "../layout/Panel";
import type { Card } from "../../engine";

/**
 * §11.7 Hand — active seat's hand as a 2x4 grid. Click handlers will be
 * wired in the wizard milestone; for now this is a read-only display.
 */
export function HandPanel() {
  const view = useGameState((s) => {
    const activeId = s.turnOrder[s.currentPlayerIndex] ?? null;
    const active =
      activeId !== null ? s.players.find((p) => p.id === activeId) : null;
    return {
      name: active?.displayName ?? "—",
      hand: active?.hand ?? [],
    };
  });

  return (
    <Panel id="hand" title={`Hand — ${view.name}`} maximizable>
      <div className="hand-grid">
        {view.hand.map((card, i) => (
          <CardFace key={i} card={card} />
        ))}
      </div>
    </Panel>
  );
}

function CardFace({ card }: { card: Card }) {
  switch (card.kind) {
    case "LOCATION":
      return <div className="card-face">{card.cityName}</div>;
    case "INDUSTRY":
      return (
        <div className="card-face card-face--industry">
          {card.industries.map((ind) => (
            <span key={ind} className="card-face__industry">
              {prettyIndustry(ind)}
            </span>
          ))}
        </div>
      );
    case "WILD_LOCATION":
      return <div className="card-face card-face--wild">Wild Location</div>;
    case "WILD_INDUSTRY":
      return <div className="card-face card-face--wild">Wild Industry</div>;
  }
}

function prettyIndustry(name: string): string {
  return name
    .split("_")
    .map((part) => part[0]! + part.slice(1).toLowerCase())
    .join(" ");
}
