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
  /** Spectator-only — pick which player's perspective to render. The
   *  engine view will then expose that player's hand to the spectator.
   *  Pass null to drop the override and fall back to the redacted
   *  spectator view. Sealed-off for users who hold a real seat. */
  setSpectatorView(seatId: number | null): void;
  /** True when this user has no seat AND the host has put a viewer
   *  override in place — i.e. mySeatId points at someone else's seat. */
  readonly isSpectator: boolean;
}

function describeIntent(intent: Intent): string {
  const t = (intent as { type?: string }).type ?? "?";
  return t.toLowerCase().replace(/_/g, " ");
}

export function usePlatformGameSession(
  ctx: PlatformGameContext,
): PlatformGameSession & {
  readonly actualSeatId: number | null;
} {
  const [engine, setEngine] = useState<Engine | null>(null);
  /** Seat the projection rendered from. For seated players this equals
   *  actualSeatId; for spectators with a chosen view, it points at the
   *  picked player so HandPanel can render their hand. */
  const [mySeatId, setMySeatId] = useState<number | null>(null);
  /** Seat this user owns on the server. The host computes it without
   *  consulting the spectator-view override and ships it on every
   *  envelope, so this stays accurate when seat ownership changes
   *  (claim / release / kick) mid-game. Gates dispatch eligibility. */
  const [actualSeatId, setActualSeatId] = useState<number | null>(null);
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
          // PlayerView and the authoritative public-history log. Build
          // / refresh the ClientEngine and adopt the events verbatim so
          // a page refresh rehydrates the recent-actions overlay.
          const env = msg.playing;
          const viewer = env.viewerPlayerId >= 0 ? env.viewerPlayerId : null;
          const actual = env.actualSeatId >= 0 ? env.actualSeatId : null;
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
          engineRef.current.replaceEvents(msg.events);
          setMySeatId(viewer);
          setActualSeatId(actual);
          setPaused(env.paused);
          return;
        }
        case "STATE": {
          const env = msg.playing;
          const viewer = env.viewerPlayerId >= 0 ? env.viewerPlayerId : null;
          const actual = env.actualSeatId >= 0 ? env.actualSeatId : null;
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
          setActualSeatId(actual);
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
  const isSpectator = actualSeatId === null;

  return useMemo(
    () => ({
      engine,
      mySeatId,
      actualSeatId,
      paused,
      isHost,
      lastRejection,
      clearRejection: () => setLastRejection(null),
      setSpectatorView: (seatId: number | null) =>
        ctx.send({ type: "SET_SPECTATOR_VIEW", seatId }),
      isSpectator,
    }),
    [engine, mySeatId, actualSeatId, paused, isHost, lastRejection, isSpectator, ctx],
  );
}
