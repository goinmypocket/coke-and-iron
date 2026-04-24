import { createContext, type ReactNode } from "react";
import type { Engine } from "../../engine/Engine";

export const EngineContext = createContext<Engine | null>(null);

export function EngineProvider({
  engine,
  children,
}: {
  engine: Engine;
  children: ReactNode;
}) {
  return (
    <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>
  );
}
