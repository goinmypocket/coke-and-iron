// =============================================================================
// §11.10 Context bar — transient strip below the prompt that surfaces
// the active wizard's pick state and one-shot inline actions (e.g.
// "Lay one link only" during the second-rail offer, "Submit" during
// the Gloucester follow-up).
//
// Read-only derivation from wizard state. Buttons forward to the same
// wizard methods the ActionsPanel uses, so the bar is a lightweight
// reach for whatever the player would otherwise have to scan for in
// the actions panel.
// =============================================================================

import type { Card } from "../../engine";
import { useGameState } from "../hooks/useGameState";
import { useWizard } from "../wizards/WizardProvider";

interface ChipDef {
  readonly key: string;
  readonly label: string;
}

interface ButtonDef {
  readonly key: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly primary?: boolean;
  readonly disabled?: boolean;
}

export function ContextBar() {
  const wizard = useWizard();
  const activeHand = useGameState((s) => {
    const id = s.turnOrder[s.currentPlayerIndex];
    if (id === undefined) return null;
    return s.players.find((p) => p.id === id)?.hand ?? null;
  });

  const chips = describeChips(wizard, activeHand);
  const buttons = describeButtons(wizard);

  if (chips.length === 0 && buttons.length === 0) return null;

  return (
    <div className="context-bar">
      <div className="context-bar__chips">
        {chips.map((c) => (
          <span key={c.key} className="context-bar__chip">
            {c.label}
          </span>
        ))}
      </div>
      <div className="context-bar__buttons">
        {buttons.map((b) => (
          <button
            key={b.key}
            type="button"
            className={
              "context-bar__btn" +
              (b.primary ? " context-bar__btn--primary" : "")
            }
            onClick={b.onClick}
            disabled={b.disabled}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function describeChips(
  wizard: ReturnType<typeof useWizard>,
  hand: readonly Card[] | null,
): ChipDef[] {
  const out: ChipDef[] = [];
  const card = (idx: number | null): string =>
    idx === null
      ? ""
      : prettyCard(hand?.[idx] ?? null) ?? `Card #${idx + 1}`;

  switch (wizard.state.phase) {
    case "AWAITING_CARD":
      // Pass / Loan — only ask for a card. No chips beyond the prompt.
      break;
    case "AWAITING_CARDS_SCOUT":
      for (let i = 0; i < wizard.state.cardIndices.length; i++) {
        out.push({
          key: `scout-${i}`,
          label: `Card ${i + 1}: ${card(wizard.state.cardIndices[i]!)}`,
        });
      }
      break;
    case "AWAITING_DEVELOP_INPUTS":
      if (wizard.state.cardIndex !== null) {
        out.push({ key: "card", label: `Card: ${card(wizard.state.cardIndex)}` });
      }
      for (let i = 0; i < wizard.state.industries.length; i++) {
        out.push({
          key: `ind-${i}`,
          label: `Develop: ${prettyIndustry(wizard.state.industries[i]!)}`,
        });
      }
      break;
    case "AWAITING_BUILD_INPUTS":
      if (wizard.state.cardIndex !== null) {
        out.push({ key: "card", label: `Card: ${card(wizard.state.cardIndex)}` });
      }
      if (wizard.state.industry !== null) {
        out.push({
          key: "industry",
          label: `Industry: ${prettyIndustry(wizard.state.industry)}`,
        });
      }
      if (wizard.state.slot !== null) {
        out.push({
          key: "slot",
          label: `Slot: ${wizard.state.slot.cityName} #${wizard.state.slot.slotIndex + 1}`,
        });
      }
      break;
    case "AWAITING_NETWORK_INPUTS":
      if (wizard.state.cardIndex !== null) {
        out.push({ key: "card", label: `Card: ${card(wizard.state.cardIndex)}` });
      }
      if (wizard.state.lineIndex !== null) {
        out.push({ key: "line1", label: `Link 1 picked` });
      }
      if (wizard.state.secondLineIndex !== null) {
        out.push({ key: "line2", label: `Link 2 picked` });
      }
      break;
    case "AWAITING_SELL_INPUTS":
      if (wizard.state.cardIndex !== null) {
        out.push({ key: "card", label: `Card: ${card(wizard.state.cardIndex)}` });
      }
      if (wizard.state.tileIds.length > 0) {
        out.push({
          key: "tiles",
          label: `Tiles: ${wizard.state.tileIds.length}`,
        });
      }
      break;
    case "AWAITING_SELL_GLOUCESTER":
      out.push({
        key: "gloucester",
        label: `Gloucester: ${wizard.state.industries.length}/${wizard.state.need}`,
      });
      break;
    case "AWAITING_DEVELOP_IRON_PICK":
      out.push({
        key: "ironpick",
        label: `Iron: ${wizard.state.picks.length}/${wizard.state.industries.length}`,
      });
      break;
    case "AWAITING_BUILD_RESOURCES": {
      const c = wizard.state.coalPicks.length;
      const i = wizard.state.ironPicks.length;
      if (wizard.state.coalNeed > 0) {
        out.push({ key: "build-coal", label: `Coal: ${c}/${wizard.state.coalNeed}` });
      }
      if (wizard.state.ironNeed > 0) {
        out.push({ key: "build-iron", label: `Iron: ${i}/${wizard.state.ironNeed}` });
      }
      break;
    }
    case "AWAITING_NETWORK_RESOURCES": {
      const fc = wizard.state.firstCoalPicks.length;
      const sc = wizard.state.secondCoalPicks.length;
      const beer = wizard.state.beerPicks.length;
      if (wizard.state.firstCoalNeed > 0) {
        out.push({ key: "net-coal1", label: `Coal (link 1): ${fc}/${wizard.state.firstCoalNeed}` });
      }
      if (wizard.state.secondCoalNeed > 0) {
        out.push({ key: "net-coal2", label: `Coal (link 2): ${sc}/${wizard.state.secondCoalNeed}` });
      }
      if (wizard.state.beerNeed > 0) {
        out.push({ key: "net-beer", label: `Beer: ${beer}/${wizard.state.beerNeed}` });
      }
      break;
    }
    case "AWAITING_SELL_RESOURCES": {
      const totalBeer = wizard.state.orders.reduce(
        (a, o) => a + o.beerPicks.length,
        0,
      );
      const need = wizard.state.orders.reduce((a, o) => a + o.beerNeed, 0);
      if (need > 0) {
        out.push({ key: "sell-beer", label: `Beer: ${totalBeer}/${need}` });
      }
      break;
    }
    case "IDLE":
      if (wizard.state.stashedCardIndex !== null) {
        out.push({
          key: "stashed",
          label: `Stashed: ${card(wizard.state.stashedCardIndex)}`,
        });
      }
      break;
  }
  return out;
}

function describeButtons(wizard: ReturnType<typeof useWizard>): ButtonDef[] {
  const out: ButtonDef[] = [];
  const phase = wizard.state.phase;
  if (phase === "IDLE") {
    if (wizard.state.stashedCardIndex !== null) {
      out.push({
        key: "unstash",
        label: "Un-stash card",
        onClick: () => wizard.reset(),
      });
    }
    return out;
  }

  // Per-phase primary action shortcuts. Each mirrors the End Action
  // button in ActionsPanel but with phase-specific wording so the
  // player doesn't need to remember which gesture finalises which
  // sub-state.
  if (phase === "AWAITING_NETWORK_INPUTS") {
    const ready = wizard.state.cardIndex !== null && wizard.state.lineIndex !== null;
    if (ready && wizard.state.secondLineIndex === null) {
      out.push({
        key: "lay-one",
        label: "Lay one link only",
        primary: true,
        onClick: () => wizard.endAction(),
      });
    } else if (ready) {
      out.push({
        key: "lay-two",
        label: "Lay both links",
        primary: true,
        onClick: () => wizard.endAction(),
      });
    }
  } else if (phase === "AWAITING_SELL_INPUTS") {
    const ready = wizard.state.cardIndex !== null && wizard.state.tileIds.length >= 1;
    if (ready) {
      out.push({
        key: "sell-submit",
        label: `Sell ${wizard.state.tileIds.length} tile${wizard.state.tileIds.length === 1 ? "" : "s"}`,
        primary: true,
        onClick: () => wizard.endAction(),
      });
    }
  } else if (phase === "AWAITING_SELL_GLOUCESTER") {
    const ready = wizard.state.industries.length === wizard.state.need;
    if (ready) {
      out.push({
        key: "gloucester-submit",
        label: "Submit Gloucester picks",
        primary: true,
        onClick: () => wizard.endAction(),
      });
    }
  } else if (phase === "AWAITING_CARDS_SCOUT") {
    if (wizard.state.cardIndices.length === 3) {
      out.push({
        key: "scout-submit",
        label: "Dispatch Scout",
        primary: true,
        onClick: () => wizard.endAction(),
      });
    }
  } else if (phase === "AWAITING_DEVELOP_INPUTS") {
    const ready =
      wizard.state.cardIndex !== null && wizard.state.industries.length >= 1;
    if (ready) {
      out.push({
        key: "develop-submit",
        label: `Develop ${wizard.state.industries.length} tile${
          wizard.state.industries.length === 1 ? "" : "s"
        }`,
        primary: true,
        onClick: () => wizard.endAction(),
      });
    }
  } else if (phase === "AWAITING_BUILD_INPUTS") {
    const ready =
      wizard.state.cardIndex !== null &&
      wizard.state.slot !== null &&
      wizard.state.industry !== null;
    if (ready) {
      out.push({
        key: "build-submit",
        label: "Build",
        primary: true,
        onClick: () => wizard.endAction(),
      });
    }
  }

  out.push({
    key: "reset",
    label: "Reset",
    onClick: () => wizard.reset(),
  });
  return out;
}

function prettyCard(card: Card | null): string | null {
  if (!card) return null;
  switch (card.kind) {
    case "LOCATION":
      return card.cityName;
    case "INDUSTRY":
      return card.industries.map(prettyIndustry).join("/");
    case "WILD_LOCATION":
      return "Wild Location";
    case "WILD_INDUSTRY":
      return "Wild Industry";
  }
}

function prettyIndustry(name: string): string {
  return name
    .split("_")
    .map((p) => p[0]! + p.slice(1).toLowerCase())
    .join(" ");
}
