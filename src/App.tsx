import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { Engine } from "./engine/Engine";
import { LoopbackTransport } from "./network/LoopbackTransport";
import { NetworkAdapter } from "./network/NetworkAdapter";
import { EngineProvider } from "./ui/hooks/EngineProvider";

export function App() {
  const [engine, setEngine] = useState<Engine | null>(null);

  useEffect(() => {
    const e = new Engine({ seed: Date.now(), playerCount: 2 });
    const transport = new LoopbackTransport();
    new NetworkAdapter(e, transport);
    setEngine(e);
  }, []);

  if (!engine) return <div>Game loading…</div>;

  return (
    <EngineProvider engine={engine}>
      <div>Game running — UI not yet implemented.</div>
      <Toaster position="bottom-center" duration={2000} />
    </EngineProvider>
  );
}
