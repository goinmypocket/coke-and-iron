import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { Engine } from "./engine/Engine";
import { LoopbackTransport } from "./network/LoopbackTransport";
import { NetworkAdapter } from "./network/NetworkAdapter";
import { EngineProvider } from "./ui/hooks/EngineProvider";
import { PanelGrid } from "./ui/layout/PanelGrid";
import { GameStatePanel } from "./ui/panels/GameStatePanel";
import { HandPanel } from "./ui/panels/HandPanel";
import { PlayerStatePanel } from "./ui/panels/PlayerStatePanel";

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
      <PanelGrid>
        {{
          game_state: <GameStatePanel />,
          player_state: <PlayerStatePanel />,
          hand: <HandPanel />,
        }}
      </PanelGrid>
      <Toaster position="bottom-center" duration={2000} />
    </EngineProvider>
  );
}
