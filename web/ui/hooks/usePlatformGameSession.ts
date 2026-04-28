// =============================================================================
// usePlatformGameSession — drives the rich UI when mounted inside the
// In My Pocket platform shell. Replaces useNetworkClient on the platform
// path: it doesn't open a WebSocket; instead it consumes a
// PlatformGameContext provided by the shell and reads / writes
// game-protocol messages through it.
// =============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Engine } from "../../../engine/Engine";
import type { Intent } from "../../../engine/types";
import { ClientEngine } from "../../network/ClientEngine";
import type { ServerMessage as GameServerMessage } from "../../../shared/protocol";

export interface PlatformGameContext {
  readonly userId: string;
  readonly tableId: string;
  readonly hostUserId: string;
  send(payload: unknown): void;
  subscribe(cb: (payload: unknown) => void): () => void;
}

export interface PlatformGameSession {
  readonly engine: Engine | null;
  readonly mySeatId: number | null;
  readonly paused: boolean;
  readonly isHost: boolean;
}

function describeIntent(intent: Intent): string {
  const t = (intent as { type?: string }).type ?? "?";
  return t.toLowerCase().replace(/_/g, " ");
}

export function usePlatformGameSession(
  ctx: PlatformGameContext,
): PlatformGameSession {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [mySeatId, setMySeatId] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const engineRef = useRef<ClientEngine | null>(null);

  useEffect(() => {
    const send = (payload: unknown): void => ctx.send(payload);
    const deps = {
      sendIntent: (intent: Intent) =>
        send({ type: "INTENT", intent }),
      sendUndo: () => send({ type: "UNDO" }),
    };

    const unsub = ctx.subscribe((payload) => {
      const msg = payload as GameServerMessage;
      switch (msg.type) {
        case "SNAPSHOT": {
          // The session sends a SNAPSHOT carrying a fresh per-recipient
          // PlayerView. Build / refresh the ClientEngine.
          const env = msg.playing;
          const viewer = env.viewerPlayerId >= 0 ? env.viewerPlayerId : null;
          if (!engineRef.current) {
            engineRef.current = new ClientEngine(
              env.view,
              env.canUndoNow,
              deps,
            );
            setEngine(engineRef.current as unknown as Engine);
          } else {
            engineRef.current.applyView(env.view, env.canUndoNow, {
              kind: "snapshot",
            });
          }
          setMySeatId(viewer);
          setPaused(env.paused);
          return;
        }
        case "STATE": {
          const env = msg.playing;
          const viewer = env.viewerPlayerId >= 0 ? env.viewerPlayerId : null;
          if (!engineRef.current) {
            engineRef.current = new ClientEngine(
              env.view,
              env.canUndoNow,
              deps,
            );
            setEngine(engineRef.current as unknown as Engine);
          } else {
            engineRef.current.applyView(env.view, env.canUndoNow, msg.cause);
          }
          setMySeatId(viewer);
          setPaused(env.paused);
          return;
        }
        case "PAUSED":
          setPaused(msg.paused);
          return;
        case "INTENT_REJECTED":
          toast.error(`Action rejected: ${describeIntent(msg.intent)}`);
          return;
        case "ERROR":
          toast.error(msg.message);
          return;
      }
    });
    return () => {
      unsub();
      engineRef.current = null;
    };
  }, [ctx]);

  const isHost = ctx.userId === ctx.hostUserId;

  return useMemo(
    () => ({ engine, mySeatId, paused, isHost }),
    [engine, mySeatId, paused, isHost],
  );
}
