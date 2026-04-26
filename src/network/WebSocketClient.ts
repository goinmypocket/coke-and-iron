// =============================================================================
// Browser-side WebSocket client.
//
// Single durable WebSocket to the host. Auto-reconnects with exponential
// backoff up to a cap. Buffers outgoing messages while disconnected and
// flushes on (re)connect. Decodes incoming server messages and dispatches
// them via typed callbacks.
//
// Higher-level concerns (lobby state, mirror engine, optimistic dispatch
// + rollback) live in `useNetworkClient` — this file is pure transport.
// =============================================================================
import {
  encode,
  parseServerMessage,
  type ClientMessage,
  type LobbyColor,
  type LobbyState,
  type ServerMessage,
} from "./protocol";
import type { Intent } from "../engine/types";

export type ConnectionStatus =
  | "connecting"
  | "open"
  | "closed"
  | "reconnecting";

export interface WebSocketClientHandlers {
  onStatus?: (status: ConnectionStatus) => void;
  onWelcome?: (clientId: string, inLobby: boolean) => void;
  onLobbyState?: (lobby: LobbyState) => void;
  onSnapshot?: (msg: Extract<ServerMessage, { type: "SNAPSHOT" }>) => void;
  onIntentAccepted?: (intent: Intent, originator: string) => void;
  onIntentRejected?: (reason: string, intent: Intent) => void;
  onPaused?: (paused: boolean) => void;
  onError?: (message: string) => void;
}

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 10_000;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "connecting";
  private reconnectDelay = RECONNECT_MIN_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private outbox: string[] = [];
  private destroyed = false;

  constructor(
    private readonly url: string,
    private readonly handlers: WebSocketClientHandlers,
  ) {
    this.connect();
  }

  destroy = (): void => {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
    this.ws = null;
  };

  // ---------------------------------------------------------------------------
  // Outbound messages
  // ---------------------------------------------------------------------------

  claimSeat = (
    seatId: number,
    displayName: string,
    pawnColor: LobbyColor,
  ): void => {
    this.send({ type: "CLAIM_SEAT", seatId, displayName, pawnColor });
  };

  releaseSeat = (seatId: number): void => {
    this.send({ type: "RELEASE_SEAT", seatId });
  };

  lockLobby = (locked: boolean): void => {
    this.send({ type: "LOCK_LOBBY", locked });
  };

  startGame = (): void => {
    this.send({ type: "START_GAME" });
  };

  sendIntent = (intent: Intent): void => {
    this.send({ type: "INTENT", intent });
  };

  setPaused = (paused: boolean): void => {
    this.send({ type: "SET_PAUSED", paused });
  };

  private send(msg: ClientMessage): void {
    const wire = encode(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(wire);
    } else {
      this.outbox.push(wire);
    }
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  private connect(): void {
    if (this.destroyed) return;
    this.setStatus("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this.handlers.onError?.(`websocket construct failed: ${String(err)}`);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.setStatus("open");
      this.reconnectDelay = RECONNECT_MIN_MS;
      // Flush buffered messages.
      const pending = this.outbox.splice(0);
      for (const m of pending) ws.send(m);
    };

    ws.onmessage = (ev) => {
      const raw = typeof ev.data === "string" ? ev.data : "";
      const msg = parseServerMessage(raw);
      if (!msg) {
        this.handlers.onError?.(`unparseable server message: ${raw}`);
        return;
      }
      this.dispatchIncoming(msg);
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.destroyed) return;
      this.setStatus("reconnecting");
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire next; rely on it for the reconnect path.
    };
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(delay * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.handlers.onStatus?.(status);
  }

  private dispatchIncoming(msg: ServerMessage): void {
    switch (msg.type) {
      case "WELCOME":
        this.handlers.onWelcome?.(msg.clientId, msg.inLobby);
        return;
      case "LOBBY_STATE":
        this.handlers.onLobbyState?.(msg.lobby);
        return;
      case "SNAPSHOT":
        this.handlers.onSnapshot?.(msg);
        return;
      case "INTENT_ACCEPTED":
        this.handlers.onIntentAccepted?.(msg.intent, msg.originator);
        return;
      case "INTENT_REJECTED":
        this.handlers.onIntentRejected?.(msg.reason, msg.intent);
        return;
      case "PAUSED":
        this.handlers.onPaused?.(msg.paused);
        return;
      case "ERROR":
        this.handlers.onError?.(msg.message);
        return;
    }
  }
}
