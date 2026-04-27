// =============================================================================
// useNetworkClient — owns the WebSocket lifecycle for a browser session.
//
// Responsibilities:
//   - Open / reconnect a single WebSocketClient to the host.
//   - Maintain LobbyState during the lobby phase; expose claim / release /
//     lock / start / setPlayerCount / loadSave / newGame methods.
//   - On the first SNAPSHOT or STATE, build a ClientEngine wrapping the
//     redacted PlayerView. From then on every STATE message just calls
//     `applyView` to swap the held view in place — there's no client-side
//     reducer; the host is the single source of truth.
//   - On INTENT_REJECTED, surface a toast (the local view is already
//     consistent because we never optimistically applied).
//   - Persist the per-seat reconnect token in localStorage and replay it
//     via RESUME on every fresh WebSocket open. Lets a player who
//     refreshed / migrated devices walk back into the same seat without
//     anyone clicking anything.
//
// The hook returns one of three "modes": 'connecting' | 'lobby' | 'playing'.
// Callers render different React trees per mode.
// =============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Engine } from "../../engine/Engine";
import type { Intent } from "../../engine/types";
import { ClientEngine } from "../../network/ClientEngine";
import {
  type ConnectionStatus,
  WebSocketClient,
} from "../../network/WebSocketClient";
import type {
  LobbyColor,
  LobbyState,
  PlayerCount,
  SaveSummary,
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
  /** Most recent save listing the host received from the server. null
   * until the host requests one (or auto-fetches on lobby connect). */
  readonly availableSaves: readonly SaveSummary[] | null;
  readonly claimSeat: (
    seatId: number,
    displayName: string,
    pawnColor: LobbyColor,
  ) => void;
  readonly releaseSeat: (seatId: number) => void;
  readonly lockLobby: (locked: boolean) => void;
  readonly startGame: () => void;
  readonly setPaused: (paused: boolean) => void;
  readonly setPlayerCount: (count: PlayerCount) => void;
  readonly loadSave: (filename: string) => void;
  readonly newGame: () => void;
  readonly listSaves: () => void;
}

function defaultUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8787/ws";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

/** localStorage key for the per-host seat token. Different host URLs
 * mean different games (and different tokens), so we key by host —
 * a player who hosts AND joins someone else's game from the same
 * browser keeps both tokens. */
function seatTokenKey(url: string): string {
  return `bb-seat-token:${url}`;
}

function readSavedToken(url: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(seatTokenKey(url));
  } catch {
    return null;
  }
}

function writeSavedToken(url: string, token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token === null) {
      window.localStorage.removeItem(seatTokenKey(url));
    } else {
      window.localStorage.setItem(seatTokenKey(url), token);
    }
  } catch {
    // localStorage can be disabled in private mode / strict cookie
    // settings — degrade silently to "no auto-resume".
  }
}

export function useNetworkClient(url: string = defaultUrl()): UseNetworkClient {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [clientId, setClientId] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [seats, setSeats] = useState<LobbyState["seats"] | null>(null);
  const [paused, setPausedState] = useState(false);
  const [availableSaves, setAvailableSaves] = useState<
    readonly SaveSummary[] | null
  >(null);

  const engineRef = useRef<ClientEngine | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocketClient | null>(null);

  useEffect(() => {
    const ws = new WebSocketClient(url, {
      onStatus: setStatus,
      onWelcome: (id, _inLobby) => {
        clientIdRef.current = id;
        setClientId(id);
        // If we have a saved seat token, ask the host to transfer the
        // seat to this fresh clientId. The host will reply with
        // RESUMED + a fresh snapshot on success or ERROR on a stale
        // token (in which case we drop the token and fall through to
        // the regular lobby flow).
        const saved = readSavedToken(url);
        if (saved) ws.resume(saved);
      },
      onLobbyState: (next) => {
        setLobby(next);
      },
      onSavesList: (list) => setAvailableSaves(list),
      onSnapshot: (msg) => onSnapshot(msg),
      onState: (view, paused, _allowUndo, canUndoNow, cause) => {
        // Per-recipient redacted state update. The engine is built
        // lazily on the first STATE so we don't need a separate
        // snapshot path — the host emits STATE { kind: "snapshot" }
        // alongside SNAPSHOT for exactly this reason.
        if (!engineRef.current) {
          engineRef.current = new ClientEngine(view, canUndoNow, {
            sendIntent: (intent) => ws.sendIntent(intent),
            sendUndo: () => ws.undo(),
          });
          setEngine(engineRef.current as unknown as Engine);
        } else {
          // The cause drives how the local recent-actions log evolves
          // (append on intent, pop on undo, reset on snapshot) — see
          // ClientEngine.applyView for the rules.
          engineRef.current.applyView(view, canUndoNow, cause);
        }
        setPausedState(paused);
      },
      onResumed: (seatId) => {
        // Quiet success — UI just gets a fresh LOBBY_STATE / SNAPSHOT
        // shortly after. We keep the seat id around so debugging tools
        // can read it; React state updates already flow via lobby/seats.
        void seatId;
      },
      onIntentRejected: (_reason, intent) => {
        // No optimistic apply to undo — server is authoritative — so
        // we just surface the rejection. The local view is already
        // correct because we never advanced it speculatively.
        toast.error(`Action rejected: ${describeIntent(intent)}`);
      },
      onPaused: setPausedState,
      onError: (msg) => {
        // A stale/garbage seat token ends up here. Drop it so we don't
        // keep retrying on every reconnect — the user can re-claim
        // their seat from the lobby like a fresh player.
        if (msg.includes("seat token")) {
          writeSavedToken(url, null);
        }
        toast.error(msg);
      },
    });
    wsRef.current = ws;

    function onSnapshot(msg: Extract<ServerMessage, { type: "SNAPSHOT" }>) {
      const { seats: snapshotSeats, seatToken } = msg;
      // Persist (or refresh) the seat token whenever the server
      // includes one — same-device refresh, host restart, mid-game
      // reconnect all flow through here.
      if (seatToken) writeSavedToken(url, seatToken);
      // The legacy SNAPSHOT carries seed + bundle for the
      // mirror-engine path that we just removed. We ignore those
      // fields; the per-recipient redacted PlayerView arrives via the
      // STATE { kind: "snapshot" } that the host emits alongside.
      // We do still consume the seats list (lobby identities) and
      // paused flag so the UI knows who's at the table.
      setSeats(snapshotSeats);
      setPausedState(msg.playing.paused);
    }

    return () => {
      ws.destroy();
      wsRef.current = null;
      engineRef.current = null;
    };
  }, [url]);

  const api = useMemo<
    Pick<
      UseNetworkClient,
      | "claimSeat"
      | "releaseSeat"
      | "lockLobby"
      | "startGame"
      | "setPaused"
      | "setPlayerCount"
      | "loadSave"
      | "newGame"
      | "listSaves"
    >
  >(
    () => ({
      claimSeat: (seatId, displayName, pawnColor) =>
        wsRef.current?.claimSeat(seatId, displayName, pawnColor),
      releaseSeat: (seatId) => wsRef.current?.releaseSeat(seatId),
      lockLobby: (locked) => wsRef.current?.lockLobby(locked),
      startGame: () => wsRef.current?.startGame(),
      setPaused: (p) => wsRef.current?.setPaused(p),
      setPlayerCount: (count) => wsRef.current?.setPlayerCount(count),
      loadSave: (filename) => wsRef.current?.loadSave(filename),
      newGame: () => wsRef.current?.newGame(),
      listSaves: () => wsRef.current?.listSaves(),
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
    availableSaves,
    ...api,
  };
}

function describeIntent(intent: Intent): string {
  // Best-effort short label so toast tells the user which action failed
  // without dumping the whole JSON.
  const t = (intent as { type?: string }).type ?? "?";
  return t.toLowerCase().replace(/_/g, " ");
}
