// =============================================================================
// PlatformApp — the entry the In My Pocket platform shell mounts when
// `tableMeta.status === "playing"`. Wraps the rich Brass UI in the
// engine + viewer-seat contexts and routes the game protocol via the
// shell-supplied PlatformGameContext.
//
// The platform owns the lobby phase entirely; this component never
// renders a lobby screen. If the user is unseated (spectator) the
// existing UI already handles it via ViewerBanner / hidden hand.
// =============================================================================

import { useId, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { EngineProvider } from "./ui/hooks/EngineProvider";
import {
  type PlatformGameContext,
  usePlatformGameSession,
} from "./ui/hooks/usePlatformGameSession";
import { TurnSummary } from "./ui/affordances/TurnSummary";
import { ViewerBanner } from "./ui/affordances/ViewerBanner";
import { EndGameOverlay } from "./ui/overlays/EndGameOverlay";
import { EraRoundBanner } from "./ui/overlays/EraRoundBanner";
import { ResourcePickerOverlay } from "./ui/overlays/ResourcePickerOverlay";
import { SellMerchantPickerOverlay } from "./ui/overlays/SellMerchantPickerOverlay";
import { ShortfallOverlay } from "./ui/overlays/ShortfallOverlay";
import { ActionsPanel } from "./ui/panels/ActionsPanel";
import { BoardPanel } from "./ui/panels/BoardPanel";
import { PromptStrip } from "./ui/affordances/PromptStrip";
import { PlayersPanel } from "./ui/panels/PlayersPanel";
import { StatisticsPanel } from "./ui/panels/StatisticsPanel";
import { WizardProvider } from "./ui/wizards/WizardProvider";

import "./styles/reset.css";
import "./styles/app.css";
import "./styles/play.css";

export type { PlatformGameContext };

interface Props {
  readonly ctx: PlatformGameContext;
}

export default function PlatformApp({ ctx }: Props): ReactNode {
  return <div className="ci-game"><GameContent ctx={ctx} /></div>;
}

function GameContent({ ctx }: Props): ReactNode {
  const session = usePlatformGameSession(ctx);
  const regionId = useId();

  if (!session.engine) {
    return (
      <div className="ci-platform-loading">
        <p>Loading game state…</p>
      </div>
    );
  }

  return (
    <EngineProvider
      engine={session.engine}
      paused={session.paused}
      mySeatId={session.mySeatId}
      actualSeatId={session.actualSeatId}
      rejection={{
        text: session.lastRejection,
        dismiss: session.clearRejection,
      }}
    >
      <WizardProvider key={`${session.actualSeatId}:${session.mySeatId}`}>
        <div className="app-shell">
          <TurnSummary paused={session.paused} />
          <ShortfallOverlay />
          <ViewerBanner
            isSpectator={session.isSpectator}
            viewedSeatId={session.mySeatId}
            onPickSpectatorView={session.setSpectatorView}
          />
          <GameWorkspace regionId={regionId} />
        </div>
        <EndGameOverlay />
        <EraRoundBanner />
        <ResourcePickerOverlay />
        <SellMerchantPickerOverlay />
        <Toaster theme="light" position="bottom-center" duration={4000}
          toastOptions={{ className: "ci-toast", style: { background: "#fff", color: "#282b2a", borderColor: "#92512f", fontFamily: "system-ui, sans-serif" } }} />
      </WizardProvider>
    </EngineProvider>
  );
}

function GameWorkspace({ regionId }: { regionId: string }) {
  const [area, setArea] = useState("turn");
  const openArea = (next: string) => {
    setArea(next);
    requestAnimationFrame(() => {
      const target = document.getElementById(`${regionId}-${next}`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "start" });
    });
  };
  return <div className="ci-workspace" data-area={area}>
    <nav className="ci-area-nav" aria-label="Game areas">
      {[["turn", "Turn"], ["board", "Board"], ["details", "Player boards"]].map(([id, label]) =>
        <button key={id} type="button" aria-pressed={area === id} aria-controls={regionId + "-" + id} onClick={() => setArea(id!)}>{label}</button>)}
    </nav>
    <div className="game-stack">
      <section className="ci-board-column" id={regionId + "-board"} aria-label="Board area" tabIndex={-1}>
        <div className="ci-board-next"><PromptStrip /><button className="action-btn" onClick={() => openArea("turn")}>Your hand &amp; actions</button></div>
        <BoardPanel regionId={regionId + "-map"} />
      </section>
      <div className="ci-play-rail" id={regionId + "-turn"} role="region" aria-label="Turn area" tabIndex={-1}>
        <ActionsPanel onOpenBoard={() => openArea("board")} />
      </div>
      <section className="ci-table-details" id={regionId + "-details"} aria-label="Player boards" tabIndex={-1}>
        <header className="ci-detail-nav"><h2>Player boards</h2></header>
        <details className="ci-table-statistics">
          <summary>Table statistics</summary>
          <StatisticsPanel regionId={regionId + "-statistics"} />
        </details>
        <div id={regionId + "-industries"}><PlayersPanel /></div>
      </section>
    </div>
  </div>;
}
