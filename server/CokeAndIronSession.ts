// =============================================================================
// CokeAndIronSession — the platform-facing GameSession for this game.
//
// Status: scaffold. The class implements the platform's GameSession
// interface so the registry can build it, but the bodies are stubs.
// Filling them in is the next milestone — most of the logic comes
// straight from host/HostGame.ts (the previous standalone host's
// session class), translated from `clientId` to `userId` and from
// the standalone WS broadcast loop to per-recipient `send` callbacks.
//
// Mapping from HostGame to this class (rough):
//   - HostGame.handleClientMessage(clientId, msg)
//       → handleGameMessage(userId, payload) for in-game intents
//       → claimSeat / releaseSeat / etc. for lobby ops
//   - HostGame.dispatch(intent) → handleGameMessage internals
//   - HostGame.broadcastState() → loops connections, projects per
//     userId, calls each user's send()
//   - HostGame.serialize() → serialize()
// =============================================================================

import type {
  CreateOpts,
  GameSession,
  LoadOpts,
  Result,
  SeatOptions,
  SessionDescription,
  UserId,
} from "../shared";

/** Persisted snapshot. Will be filled in to match the existing
 *  SaveFile shape (src/network/saveFile.ts) once HostGame is ported. */
export interface CokeAndIronSave {
  readonly schemaVersion: 1;
  readonly tableOptions: Record<string, unknown>;
  // TODO: bring across { seed, bundle, intentLog, lobby, seatTokens } etc.
}

export class CokeAndIronSession implements GameSession<CokeAndIronSave> {
  // ---- Connection bookkeeping ------------------------------------------
  /** userId → send callback for the active socket. Cleared on detach. */
  private readonly connections = new Map<UserId, (msg: unknown) => void>();

  // ---- Session config --------------------------------------------------
  private readonly tableOptions: Record<string, unknown>;
  private readonly hostUserId: UserId;

  // ---- Phase ------------------------------------------------------------
  private status: "lobby" | "playing" | "finished" = "lobby";
  private lastActivityAt = Date.now();

  constructor(opts: CreateOpts | LoadOpts) {
    this.tableOptions = opts.options;
    this.hostUserId = opts.hostUserId;
    // TODO: build LobbyState, Engine bundle, etc. — port from
    // host/HostGame.ts constructor.
  }

  // ---- Connection lifecycle --------------------------------------------

  attachConnection(userId: UserId, send: (msg: unknown) => void): void {
    this.connections.set(userId, send);
    // TODO: send the per-recipient snapshot. Today's HostGame produces
    // this via projectFor(state, viewerSeatId); plug that in once the
    // engine is wired up here.
  }

  detachConnection(userId: UserId): void {
    this.connections.delete(userId);
  }

  // ---- Lobby -----------------------------------------------------------

  claimSeat(_userId: UserId, _seatIndex: number, _options?: SeatOptions): Result {
    return { ok: false, reason: "not implemented" };
  }

  releaseSeat(_userId: UserId, _seatIndex: number): Result {
    return { ok: false, reason: "not implemented" };
  }

  kickSeat(callerUserId: UserId, _seatIndex: number): Result {
    if (callerUserId !== this.hostUserId) {
      return { ok: false, reason: "only the host can kick" };
    }
    return { ok: false, reason: "not implemented" };
  }

  startGame(callerUserId: UserId): Result {
    if (callerUserId !== this.hostUserId) {
      return { ok: false, reason: "only the host can start" };
    }
    return { ok: false, reason: "not implemented" };
  }

  // ---- Play ------------------------------------------------------------

  handleGameMessage(_userId: UserId, _payload: unknown): void {
    // TODO: route to intent dispatch via the engine. Validate the
    // payload, check seat ownership for the acting user, apply if
    // legal, then re-broadcast to every connection.
    this.lastActivityAt = Date.now();
  }

  // ---- Persistence -----------------------------------------------------

  serialize(): CokeAndIronSave {
    return {
      schemaVersion: 1,
      tableOptions: this.tableOptions,
    };
  }

  // ---- Telemetry -------------------------------------------------------

  describe(): SessionDescription {
    return {
      status: this.status,
      playerCount: 0, // TODO: real count from lobby/engine
      maxPlayers: 4,
      spectatorCount: 0,
      lastActivityAt: this.lastActivityAt,
    };
  }

  /** Internal helper: broadcast a per-recipient projection. To be used
   *  once the engine is wired up. */
  private broadcast(): void {
    for (const [userId, send] of this.connections) {
      // TODO: const view = projectFor(state, this.seatIdOf(userId));
      // send({ type: "STATE", ... view });
      void userId;
      void send;
    }
  }
}
