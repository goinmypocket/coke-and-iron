// =============================================================================
// HostGame — the authoritative engine + lobby for one running game session.
//
// Owns:
//   - LobbyState (pre-game) + Engine (during game)
//   - The set of connected clients and their assigned clientIds
//   - The autosave path; debounced disk writes after every accepted intent
//
// Every mutation that should reach the wire goes through `broadcast()` — the
// caller owns no transport-specific logic. Connection bookkeeping is the
// only thing the surrounding server file deals with.
// =============================================================================
import {
  Engine,
  type EngineConfigBundle,
  type SeatIdentity,
} from "../src/engine";
import type { Intent, PlayerCount } from "../src/engine/types";
import {
  LOBBY_COLORS,
  PROTOCOL_VERSION,
  type LobbyState,
  type ServerMessage,
} from "../src/network/protocol";
import { resolveBundle, type ResolvedBundle, type SaveFile } from "../src/network/saveFile";
import {
  claimSeat,
  emptyLobby,
  isStartable,
  lobbyFromSave,
  releaseAllForClient,
  releaseSeat,
  setLocked,
  snapshotSeats,
} from "./lobby";
import { autosavePath, writeSaveToDisk } from "./saves";

export interface HostGameOptions {
  readonly seed: number;
  readonly playerCount: PlayerCount;
  readonly autoEndTurn: boolean;
  readonly allowUndo: boolean;
  readonly bundle: EngineConfigBundle;
  /** When set, hydrate from this save (lobby comes up pre-filled and the
   *  engine is reconstructed by replaying the intent log). */
  readonly loadFrom?: SaveFile;
  /** Override autosave file path. Defaults to ./saves/current.json. */
  readonly autosavePath?: string;
  readonly debounceMs?: number;
}

interface ConnectionMeta {
  readonly clientId: string;
  send(msg: ServerMessage): void;
}

type SaveResult =
  | { ok: true }
  | { ok: false; reason: string };

export class HostGame {
  private lobby: LobbyState;
  private engine: Engine | null = null;
  private bundle: ResolvedBundle | null = null;
  private readonly seed: number;
  private readonly playerCount: PlayerCount;
  private readonly autoEndTurn: boolean;
  private readonly allowUndo: boolean;
  private readonly initialBundle: EngineConfigBundle;
  private readonly createdAt: string;
  private paused = false;
  private readonly connections = new Map<string, ConnectionMeta>();
  private readonly autosaveFile: string;
  private readonly debounceMs: number;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly loadedIntents: readonly Intent[] | null;

  constructor(opts: HostGameOptions) {
    this.seed = opts.loadFrom?.seed ?? opts.seed;
    this.playerCount = opts.loadFrom?.playerCount ?? opts.playerCount;
    this.autoEndTurn = opts.loadFrom?.autoEndTurn ?? opts.autoEndTurn;
    this.allowUndo = opts.loadFrom?.allowUndo ?? opts.allowUndo;
    this.initialBundle = opts.loadFrom?.bundle ?? opts.bundle;
    this.createdAt = opts.loadFrom?.createdAt ?? new Date().toISOString();
    this.autosaveFile = opts.autosavePath ?? autosavePath();
    this.debounceMs = opts.debounceMs ?? 1000;
    this.loadedIntents = opts.loadFrom?.intentLog ?? null;

    // Lobby seed: the first connecting client becomes the host. We use a
    // temporary placeholder until then.
    if (opts.loadFrom) {
      this.lobby = lobbyFromSave(
        "<unassigned>",
        this.playerCount,
        opts.loadFrom.bundle.seats,
      );
    } else {
      this.lobby = emptyLobby("<unassigned>", this.playerCount);
    }
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  attachConnection(clientId: string, send: ConnectionMeta["send"]): void {
    this.connections.set(clientId, { clientId, send });
    if (this.lobby.hostId === "<unassigned>") {
      this.lobby = { ...this.lobby, hostId: clientId };
    }
    const inLobby = this.engine === null;
    send({
      type: "WELCOME",
      protocolVersion: PROTOCOL_VERSION,
      clientId,
      inLobby,
    });
    if (inLobby) {
      send({ type: "LOBBY_STATE", lobby: this.lobby });
    } else {
      // Mid-game join — push a snapshot so the client can rebuild its
      // mirror engine from scratch.
      send(this.makeSnapshotMessage());
      if (this.paused) send({ type: "PAUSED", paused: true });
    }
  }

  detachConnection(clientId: string): void {
    this.connections.delete(clientId);
    // Pre-game: free any seat they held so others can claim it.
    if (this.engine === null) {
      this.lobby = releaseAllForClient(this.lobby, clientId);
      // If the host disconnected, transfer to whoever is left (or reset
      // to placeholder if nobody is connected).
      if (this.lobby.hostId === clientId) {
        const next = this.connections.keys().next();
        const newHost = next.done ? "<unassigned>" : next.value;
        this.lobby = { ...this.lobby, hostId: newHost };
      }
      this.broadcastLobby();
    }
    // In-game: keep their seat assignment so they can rejoin into it.
  }

  // ---------------------------------------------------------------------------
  // Lobby ops
  // ---------------------------------------------------------------------------

  handleClaimSeat(
    clientId: string,
    seatId: number,
    displayName: string,
    pawnColor: string,
  ): void {
    if (this.engine !== null) {
      this.errorTo(clientId, "cannot claim seats — game already started");
      return;
    }
    if (!(LOBBY_COLORS as readonly string[]).includes(pawnColor)) {
      this.errorTo(clientId, `unknown colour ${pawnColor}`);
      return;
    }
    const result = claimSeat(
      this.lobby,
      clientId,
      seatId,
      displayName,
      pawnColor as (typeof LOBBY_COLORS)[number],
    );
    if (!result.ok) {
      this.errorTo(clientId, result.reason);
      return;
    }
    this.lobby = result.lobby;
    this.broadcastLobby();
  }

  handleReleaseSeat(clientId: string, seatId: number): void {
    if (this.engine !== null) {
      this.errorTo(clientId, "cannot release seats — game already started");
      return;
    }
    const result = releaseSeat(this.lobby, clientId, seatId);
    if (!result.ok) {
      this.errorTo(clientId, result.reason);
      return;
    }
    this.lobby = result.lobby;
    this.broadcastLobby();
  }

  handleLockLobby(clientId: string, locked: boolean): void {
    if (this.engine !== null) {
      this.errorTo(clientId, "cannot lock — game already started");
      return;
    }
    const result = setLocked(this.lobby, clientId, locked);
    if (!result.ok) {
      this.errorTo(clientId, result.reason);
      return;
    }
    this.lobby = result.lobby;
    this.broadcastLobby();
  }

  handleStartGame(clientId: string): SaveResult {
    if (clientId !== this.lobby.hostId) {
      this.errorTo(clientId, "only the host can start the game");
      return { ok: false, reason: "not host" };
    }
    if (this.engine !== null) {
      this.errorTo(clientId, "game already started");
      return { ok: false, reason: "already started" };
    }
    if (!isStartable(this.lobby)) {
      this.errorTo(clientId, "all seats must be claimed before starting");
      return { ok: false, reason: "not all seats claimed" };
    }
    const seats = snapshotSeats(this.lobby);
    this.bundle = resolveBundle({ ...this.initialBundle, seats }, seats);
    this.engine = new Engine(
      {
        seed: this.seed,
        playerCount: this.playerCount,
        autoEndTurn: this.autoEndTurn,
        allowUndo: this.allowUndo,
      },
      this.bundle,
    );
    if (this.loadedIntents) {
      for (const intent of this.loadedIntents) {
        const r = this.engine.dispatch(intent);
        if (!r.ok) {
          throw new Error(
            `replay diverged on intent ${JSON.stringify(intent)}: ${r.reason}`,
          );
        }
      }
    }
    const snap = this.makeSnapshotMessage();
    for (const c of this.connections.values()) c.send(snap);
    this.scheduleAutosave();
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // In-game ops
  // ---------------------------------------------------------------------------

  handleIntent(clientId: string, intent: Intent): void {
    if (this.engine === null) {
      this.errorTo(clientId, "game not started yet");
      return;
    }
    if (this.paused) {
      this.errorTo(clientId, "game is paused");
      return;
    }
    // Only the seat-holder may dispatch intents that carry a playerId.
    const carriedPlayerId = (intent as { playerId?: number }).playerId;
    if (typeof carriedPlayerId === "number") {
      const seat = this.lobby.seats.find((s) => s.id === carriedPlayerId);
      if (!seat) {
        this.errorTo(clientId, `intent for unknown seat ${carriedPlayerId}`);
        return;
      }
      if (seat.claimedBy !== clientId) {
        this.errorTo(
          clientId,
          `seat ${carriedPlayerId} is not held by you`,
        );
        return;
      }
    }
    const result = this.engine.dispatch(intent);
    if (!result.ok) {
      const sender = this.connections.get(clientId);
      sender?.send({ type: "INTENT_REJECTED", reason: result.reason, intent });
      return;
    }
    const broadcast: ServerMessage = {
      type: "INTENT_ACCEPTED",
      intent,
      originator: clientId,
    };
    for (const c of this.connections.values()) c.send(broadcast);
    this.scheduleAutosave();
  }

  handleSetPaused(clientId: string, paused: boolean): void {
    if (clientId !== this.lobby.hostId) {
      this.errorTo(clientId, "only the host can pause/resume");
      return;
    }
    if (this.engine === null) {
      this.errorTo(clientId, "no game in progress");
      return;
    }
    this.paused = paused;
    for (const c of this.connections.values())
      c.send({ type: "PAUSED", paused });
  }

  // ---------------------------------------------------------------------------
  // Save / shutdown
  // ---------------------------------------------------------------------------

  /** Synchronously flush the current state to disk. Call before exit. */
  flushSave(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    if (!this.engine || !this.bundle) return;
    writeSaveToDisk(this.autosaveFile, {
      createdAt: this.createdAt,
      seed: this.seed,
      playerCount: this.playerCount,
      autoEndTurn: this.autoEndTurn,
      allowUndo: this.allowUndo,
      bundle: this.bundle,
      intentLog: this.engine.getIntentLog(),
    });
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private scheduleAutosave(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      try {
        this.flushSave();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[host] autosave failed:", err);
      }
    }, this.debounceMs);
  }

  private broadcastLobby(): void {
    for (const c of this.connections.values())
      c.send({ type: "LOBBY_STATE", lobby: this.lobby });
  }

  private makeSnapshotMessage(): ServerMessage {
    if (!this.engine || !this.bundle) {
      throw new Error("snapshot requested before game start");
    }
    return {
      type: "SNAPSHOT",
      playing: {
        seed: this.seed,
        playerCount: this.playerCount,
        autoEndTurn: this.autoEndTurn,
        allowUndo: this.allowUndo,
        bundle: this.bundle,
        intentLog: this.engine.getIntentLog(),
        paused: this.paused,
      },
      seats: this.lobby.seats,
    };
  }

  private errorTo(clientId: string, message: string): void {
    const c = this.connections.get(clientId);
    c?.send({ type: "ERROR", message });
  }
}

export type { SaveFile } from "../src/network/saveFile";
