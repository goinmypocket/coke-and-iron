// =============================================================================
// useNetworkClient — owns the WebSocket lifecycle for a browser session.
//
// Responsibilities:
//   - Open / reconnect a single WebSocketClient to the host.
//   - Maintain LobbyState during the lobby phase; expose claim/release/lock/
//     start methods.
//   - On SNAPSHOT, build a mirror Engine from the snapshot's seed + bundle +
//     intentLog. Patch its dispatch via networkifyEngine so UI dispatches
//     also send to the host.
//   - On INTENT_ACCEPTED from another client, apply via applyRemote so the
//     mirror stays in sync without re-forwarding.
//   - On INTENT_REJECTED of our own optimistic dispatch, undo the local
//     apply and surface a toast.
//
// The hook returns one of three "modes": 'connecting' | 'lobby' | 'playing'.
// Callers render different React trees per mode.
// =============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Engine } from "../../engine/Engine";
import type { Intent } from "../../engine/types";
import {
  type ConnectionStatus,
  WebSocketClient,
} from "../../network/WebSocketClient";
import {
  networkifyEngine,
  type NetworkedEngineHandle,
} from "../../network/NetworkedEngine";
import type {
  LobbyColor,
  LobbyState,
  ServerMessage,
} from "../../network/protocol";

export type ClientMode = "connecting" | "lobby" | "playing";

export interface UseNetworkClient {
  readonly mode: ClientMode;
  readonly status: ConnectionStatus;
  readonly clientId: string | null;
  readonly lobby: LobbyState | null;
  readonly engine: Engine | null;
  /** Seat metadata captured at game start so the playing UI can render
   *  names / colours independently of the lobby state. */
  readonly seats: LobbyState["seats"] | null;
  /** PlayerId of the seat this connection has claimed (in the lobby or
   * snapshot's seats list). null if the viewer is unseated — UI must
   * hide private info (own hand, etc.) in that case. */
  readonly mySeatId: number | null;
  readonly paused: boolean;
  readonly claimSeat: (
    seatId: number,
    displayName: string,
    pawnColor: LobbyColor,
  ) => void;
  readonly releaseSeat: (seatId: number) => void;
  readonly lockLobby: (locked: boolean) => void;
  readonly startGame: () => void;
  readonly setPaused: (paused: boolean) => void;
}

function defaultUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8787/ws";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

export function useNetworkClient(url: string = defaultUrl()): UseNetworkClient {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [clientId, setClientId] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [seats, setSeats] = useState<LobbyState["seats"] | null>(null);
  const [paused, setPausedState] = useState(false);

  const handleRef = useRef<NetworkedEngineHandle | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocketClient | null>(null);

  useEffect(() => {
    const ws = new WebSocketClient(url, {
      onStatus: setStatus,
      onWelcome: (id, _inLobby) => {
        clientIdRef.current = id;
        setClientId(id);
      },
      onLobbyState: (next) => {
        setLobby(next);
      },
      onSnapshot: (msg) => onSnapshot(msg),
      onIntentAccepted: (intent, originator) => {
        // Originator already applied locally — skip to avoid double-apply.
        if (originator === clientIdRef.current) return;
        const handle = handleRef.current;
        if (!handle) return;
        const r = handle.applyRemote(intent);
        if (!r.ok) {
          // Divergence — host accepted but mirror rejected. Surface so we
          // notice rather than silently drift.
          toast.error(`mirror rejected accepted intent: ${r.reason}`);
        }
      },
      onIntentRejected: (reason, intent) => {
        const handle = handleRef.current;
        if (handle) handle.rollbackLastDispatch();
        toast.error(`Action rejected: ${reason}`, {
          description: describeIntent(intent),
        });
      },
      onPaused: setPausedState,
      onError: (msg) => toast.error(msg),
    });
    wsRef.current = ws;

    function onSnapshot(msg: Extract<ServerMessage, { type: "SNAPSHOT" }>) {
      const { playing, seats: snapshotSeats } = msg;
      const fresh = new Engine(
        {
          seed: playing.seed,
          playerCount: playing.playerCount,
          autoEndTurn: playing.autoEndTurn,
          allowUndo: playing.allowUndo,
        },
        playing.bundle,
      );
      // Replay first, THEN patch dispatch — replays should not echo back
      // to the host.
      for (const intent of playing.intentLog) {
        const r = fresh.dispatch(intent);
        if (!r.ok) {
          toast.error(`replay diverged: ${r.reason}`);
          break;
        }
      }
      handleRef.current = networkifyEngine(fresh, (intent) =>
        ws.sendIntent(intent),
      );
      setEngine(fresh);
      setSeats(snapshotSeats);
      setPausedState(playing.paused);
    }

    return () => {
      ws.destroy();
      wsRef.current = null;
      handleRef.current = null;
    };
  }, [url]);

  const api = useMemo<
    Pick<
      UseNetworkClient,
      "claimSeat" | "releaseSeat" | "lockLobby" | "startGame" | "setPaused"
    >
  >(
    () => ({
      claimSeat: (seatId, displayName, pawnColor) =>
        wsRef.current?.claimSeat(seatId, displayName, pawnColor),
      releaseSeat: (seatId) => wsRef.current?.releaseSeat(seatId),
      lockLobby: (locked) => wsRef.current?.lockLobby(locked),
      startGame: () => wsRef.current?.startGame(),
      setPaused: (p) => wsRef.current?.setPaused(p),
    }),
    [],
  );

  const mode: ClientMode = engine
    ? "playing"
    : lobby
      ? "lobby"
      : "connecting";

  // Resolve the viewer's seat from whichever seat list is currently
  // authoritative — lobby phase reads lobby.seats (live updates as
  // others claim/release); playing phase reads the snapshot-captured
  // seats (claimedBy was frozen at game start).
  const mySeatId = useMemo(() => {
    if (!clientId) return null;
    const list = lobby?.seats ?? seats ?? null;
    if (!list) return null;
    const mine = list.find((s) => s.claimedBy === clientId);
    return mine ? mine.id : null;
  }, [clientId, lobby, seats]);

  return {
    mode,
    status,
    clientId,
    lobby,
    engine,
    seats,
    mySeatId,
    paused,
    ...api,
  };
}

function describeIntent(intent: Intent): string {
  // Best-effort short label so toast tells the user which action failed
  // without dumping the whole JSON.
  const t = (intent as { type?: string }).type ?? "?";
  return t.toLowerCase().replace(/_/g, " ");
}
