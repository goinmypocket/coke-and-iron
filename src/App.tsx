import { Toaster } from "sonner";
import { EngineProvider } from "./ui/hooks/EngineProvider";
import { useNetworkClient } from "./ui/hooks/useNetworkClient";
import { LobbyScreen } from "./ui/lobby/LobbyScreen";
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

export function App() {
  const net = useNetworkClient();

  if (net.mode !== "playing" || !net.engine) {
    return (
      <>
        <LobbyScreen
          status={net.status}
          clientId={net.clientId}
          lobby={net.lobby}
          availableSaves={net.availableSaves}
          onClaim={net.claimSeat}
          onRelease={net.releaseSeat}
          onLock={net.lockLobby}
          onStart={net.startGame}
          onSetPlayerCount={net.setPlayerCount}
          onLoadSave={net.loadSave}
          onNewGame={net.newGame}
          onListSaves={net.listSaves}
        />
        <Toaster position="bottom-center" duration={3000} />
      </>
    );
  }

  return (
    <EngineProvider engine={net.engine} mySeatId={net.mySeatId}>
      <WizardProvider>
        <div className="app-shell">
          <ViewerBanner />
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
        <Toaster position="bottom-center" duration={2000} />
      </WizardProvider>
    </EngineProvider>
  );
}
