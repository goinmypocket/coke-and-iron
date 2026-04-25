import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { Engine } from "./engine/Engine";
import { LoopbackTransport } from "./network/LoopbackTransport";
import { NetworkAdapter } from "./network/NetworkAdapter";
import { EngineProvider } from "./ui/hooks/EngineProvider";
import { PanelGrid } from "./ui/layout/PanelGrid";
import { PromptStrip } from "./ui/affordances/PromptStrip";
import { EndGameOverlay } from "./ui/overlays/EndGameOverlay";
import { EraRoundBanner } from "./ui/overlays/EraRoundBanner";
import { ResourcePickerOverlay } from "./ui/overlays/ResourcePickerOverlay";
import { ShortfallOverlay } from "./ui/overlays/ShortfallOverlay";
import { ActionsPanel } from "./ui/panels/ActionsPanel";
import { BoardPanel } from "./ui/panels/BoardPanel";
import { GameStatePanel } from "./ui/panels/GameStatePanel";
import { HandPanel } from "./ui/panels/HandPanel";
import { IncomeTrackerPanel } from "./ui/panels/IncomeTrackerPanel";
import { PlayersPanel } from "./ui/panels/PlayersPanel";
import { PlayerStatePanel } from "./ui/panels/PlayerStatePanel";
import { RecentActionsPanel } from "./ui/panels/RecentActionsPanel";
import { RemainingCardsPanel } from "./ui/panels/RemainingCardsPanel";
import { WizardProvider } from "./ui/wizards/WizardProvider";

export function App() {
  const [engine, setEngine] = useState<Engine | null>(null);

  useEffect(() => {
    const e = new Engine({ seed: 1, playerCount: 2 });
    const transport = new LoopbackTransport();
    new NetworkAdapter(e, transport);
    setEngine(e);
  }, []);

  if (!engine) return <div>Game loading…</div>;

  return (
    <EngineProvider engine={engine}>
      <WizardProvider>
        <div className="app-shell">
          <PromptStrip />
          <PanelGrid>
            {{
              game_state: <GameStatePanel />,
              player_state: <PlayerStatePanel />,
              players: <PlayersPanel />,
              board: <BoardPanel />,
              income: <IncomeTrackerPanel />,
              hand: <HandPanel />,
              actions: <ActionsPanel />,
              recent_actions: <RecentActionsPanel />,
              remaining_cards: <RemainingCardsPanel />,
            }}
          </PanelGrid>
        </div>
        <ShortfallOverlay />
        <EndGameOverlay />
        <EraRoundBanner />
        <ResourcePickerOverlay />
        <Toaster position="bottom-center" duration={2000} />
      </WizardProvider>
    </EngineProvider>
  );
}
