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
import type { FailureReason, Intent } from "../../../engine/types";
import { ClientEngine } from "../../network/ClientEngine";
import type { ServerMessage as GameServerMessage } from "../../../shared/protocol";
import { reasonToText } from "../affordances/toast";

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
  /** The most recent server rejection of one of MY intents, formatted
   *  for inline display. Null when there's nothing to show — set on
   *  INTENT_REJECTED, cleared the next time my own intent succeeds. */
  readonly lastRejection: string | null;
  clearRejection(): void;
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
  const [lastRejection, setLastRejection] = useState<string | null>(null);
  const engineRef = useRef<ClientEngine | null>(null);

  useEffect(() => {
    const send = (payload: unknown): void => ctx.send(payload);
    const deps = {
      sendIntent: (intent: Intent) =>
        send({ type: "INTENT", intent }),
      sendUndo: () => send({ type: "UNDO" }),
    };

    // The lazy-loaded UI may have missed the SNAPSHOT the session
    // broadcast at start-game time. Ask for a fresh one as soon as
    // we're subscribed.
    send({ type: "REQUEST_SNAPSHOT" });

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
          // My own intent landed — clear any stale rejection chip.
          if (
            msg.cause.kind === "intent" &&
            msg.cause.originator === ctx.userId
          ) {
            setLastRejection(null);
          }
          return;
        }
        case "PAUSED":
          setPaused(msg.paused);
          return;
        case "INTENT_REJECTED": {
          const verb = describeIntent(msg.intent);
          const detail = reasonToText(msg.reason as FailureReason);
          const text = `${verb}: ${detail}`;
          setLastRejection(text);
          toast.error(text);
          return;
        }
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
    () => ({
      engine,
      mySeatId,
      paused,
      isHost,
      lastRejection,
      clearRejection: () => setLastRejection(null),
    }),
    [engine, mySeatId, paused, isHost, lastRejection],
  );
}
