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

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { EngineProvider } from "./ui/hooks/EngineProvider";
import {
  type PlatformGameContext,
  usePlatformGameSession,
} from "./ui/hooks/usePlatformGameSession";
import { PromptStrip } from "./ui/affordances/PromptStrip";
import { ViewerBanner } from "./ui/affordances/ViewerBanner";
import { EndGameOverlay } from "./ui/overlays/EndGameOverlay";
import { EraRoundBanner } from "./ui/overlays/EraRoundBanner";
import { ResourcePickerOverlay } from "./ui/overlays/ResourcePickerOverlay";
import { SellMerchantPickerOverlay } from "./ui/overlays/SellMerchantPickerOverlay";
import { ShortfallOverlay } from "./ui/overlays/ShortfallOverlay";
import { ActionsPanel } from "./ui/panels/ActionsPanel";
import { BoardPanel } from "./ui/panels/BoardPanel";
import { HandPanel } from "./ui/panels/HandPanel";
import { PlayersPanel } from "./ui/panels/PlayersPanel";
import { WizardProvider } from "./ui/wizards/WizardProvider";

import "./styles/reset.css";
import "./styles/app.css";

export type { PlatformGameContext };

interface Props {
  readonly ctx: PlatformGameContext;
}

export default function PlatformApp({ ctx }: Props): ReactNode {
  return <div className="ci-game"><GameContent ctx={ctx} /></div>;
}

function GameContent({ ctx }: Props): ReactNode {
  const session = usePlatformGameSession(ctx);

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
      mySeatId={session.mySeatId}
      actualSeatId={session.actualSeatId}
      rejection={{
        text: session.lastRejection,
        dismiss: session.clearRejection,
      }}
    >
      <WizardProvider>
        <div className="app-shell">
          <ViewerBanner
            isSpectator={session.isSpectator}
            viewedSeatId={session.mySeatId}
            onPickSpectatorView={session.setSpectatorView}
          />
          <PromptStrip />
          <ActionsPanel />
          <HandPanel />
          <div className="game-stack">
            <BoardPanel />
            <PlayersPanel />
          </div>
        </div>
        <ShortfallOverlay />
        <EndGameOverlay />
        <EraRoundBanner />
        <ResourcePickerOverlay />
        <SellMerchantPickerOverlay />
        <Toaster theme="light" position="bottom-center" duration={2000} />
      </WizardProvider>
    </EngineProvider>
  );
}
