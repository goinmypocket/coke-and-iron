// =============================================================================
// CokeAndIronSession — the platform-facing GameSession for this game.
//
// Translates the platform's seat / userId / GAME_MSG model into the engine's
// intent dispatch + per-recipient projection model. Replaces the old
// HostGame.ts (which targeted the standalone host's clientId / seat-token
// model). Most logic is the same; the differences are:
//   - identity is `userId` (table participant), not `clientId` (socket).
//   - seat tokens are gone — the platform's JWT cookie is the reconnect.
//   - autosave-to-disk is gone — the platform owns persistence.
//   - lobby ops dispatched by the platform: claimSeat / releaseSeat / kick /
//     startGame. Game-specific ops (intent, undo, pause, identity) ride
//     inside GAME_MSG via handleGameMessage.
//
// See ../in-my-pocket/docs/in-my-pocket-game-author-guide.md for the
// platform contract.
// =============================================================================

import {
  Engine,
  buildEvent,
  projectFor,
  projectForSpectator,
  type EngineConfigBundle,
  type ObservableEvent,
  type PlayerView,
  type SeatIdentity,
} from "../engine";
import type { Intent, PlayerCount, PlayerId } from "../engine/types";
import {
  LOBBY_COLORS,
  PROTOCOL_VERSION,
  type LobbyColor,
  type LobbyState,
  type PlayingEnvelope,
  type ServerMessage as GameServerMessage,
} from "../shared/protocol";
import { resolveBundle, type ResolvedBundle } from "../shared/saveFile";
import type {
  CreateOpts,
  GameSession,
  LoadOpts,
  Result,
  SeatOptions,
  SessionDescription,
  UserId,
} from "../shared";

// ---------------------------------------------------------------------------
// Persisted shape
// ---------------------------------------------------------------------------

export const SAVE_SCHEMA_VERSION = 2 as const;

export interface CokeAndIronSave {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION;
  readonly status: "lobby" | "playing" | "finished";
  readonly seed: number;
  readonly playerCount: PlayerCount | null;
  readonly autoEndTurn: boolean;
  readonly allowUndo: boolean;
  readonly bundle: ResolvedBundle | null;
  readonly intentLog: readonly Intent[];
  readonly seatIdentities: readonly SavedSeatIdentity[];
  readonly paused: boolean;
  readonly createdAt: string;
}

interface SavedSeatIdentity {
  /** Platform slot index this identity was claimed under. */
  readonly slotIndex: number;
  readonly displayName: string | null;
  readonly pawnColor: LobbyColor | null;
}

// ---------------------------------------------------------------------------
// Game protocol carried inside GAME_MSG
// ---------------------------------------------------------------------------

type C2SGameMessage =
  | { type: "INTENT"; intent: Intent }
  | { type: "UNDO" }
  | { type: "SET_PAUSED"; paused: boolean }
  | {
      type: "SET_SEAT_IDENTITY";
      slotIndex: number;
      displayName: string;
      pawnColor: LobbyColor;
    }
  /** Re-request the current per-recipient snapshot. The platform's
   *  game lazy-mount can finish loading after the session has already
   *  broadcast SNAPSHOT, so the freshly-mounted UI sends this on
   *  startup to pull state on demand. */
  | { type: "REQUEST_SNAPSHOT" }
  /** Spectator-only. Pick which player's perspective to render — i.e.
   *  whose hand the spectator sees. Pass null to drop the override and
   *  fall back to the redacted spectator view. Ignored for users who
   *  hold a real seat; the host validates this. */
  | { type: "SET_SPECTATOR_VIEW"; seatId: PlayerId | null };

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

interface SessionOpts {
  readonly hostUserId: UserId;
  readonly options: Record<string, unknown>;
  readonly maxSlots: number;
}

interface ConstructorOpts extends SessionOpts {
  readonly load?: CokeAndIronSave;
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

export class CokeAndIronSession implements GameSession<CokeAndIronSave> {
  // ---- Identity -------------------------------------------------------
  private readonly hostUserId: UserId;
  private readonly maxSlots: number;
  private readonly seed: number;
  private readonly autoEndTurn: boolean;
  private readonly allowUndo: boolean;
  private initialBundle: EngineConfigBundle;
  private readonly createdAt: string;

  // ---- Lobby ----------------------------------------------------------
  /** Per-platform-slot identity. Slots that aren't claimed have an
   *  entry only if they came from a save (preserved name/color for
   *  reclaiming). */
  private slotIdentities: Map<
    number,
    { displayName: string | null; pawnColor: LobbyColor | null }
  > = new Map();
  /** Which user holds which slot, pre- and post-start. */
  private slotToUser: Map<number, UserId> = new Map();

  // ---- Playing -------------------------------------------------------
  private engine: Engine | null = null;
  private bundle: ResolvedBundle | null = null;
  private status: "lobby" | "playing" | "finished" = "lobby";
  private paused = false;
  /** Built at startGame. PlayerId k corresponds to platform slot
   *  `playerSlotOrder[k]`. Empty when not started. */
  private playerSlotOrder: number[] = [];
  /** Frozen at startGame for replay. */
  private loadedIntents: readonly Intent[] | null = null;
  /** Authoritative public history of dispatched intents, in order.
   *  Computed from spectator-view diffs as each intent dispatches and
   *  shipped verbatim to every client on snapshot — so a page refresh
   *  rebuilds the recent-actions log from the wire instead of starting
   *  empty. Popped on undo to mirror the engine's intent log. */
  private recentEvents: ObservableEvent[] = [];

  // ---- Connections ---------------------------------------------------
  private readonly connections = new Map<UserId, (msg: unknown) => void>();
  /** Spectators may opt into seeing the game from a specific player's
   *  perspective (hand visible). Maps userId → chosen PlayerId. Users
   *  who actually hold a seat ignore this map; their playerIdForUser
   *  always returns their real seat. Cleared when the seated user
   *  later releases their seat (so a returning spectator gets the
   *  default redacted view). */
  private readonly spectatorViewSeat = new Map<UserId, PlayerId>();

  private lastActivityAt: number = Date.now();

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  constructor(opts: ConstructorOpts) {
    this.hostUserId = opts.hostUserId;
    this.maxSlots = opts.maxSlots;

    if (opts.load) {
      // Hydrating from save — seats are unclaimed; identities are pre-filled.
      this.seed = opts.load.seed;
      this.autoEndTurn = opts.load.autoEndTurn;
      this.allowUndo = opts.load.allowUndo;
      this.initialBundle = opts.load.bundle ?? {};
      this.createdAt = opts.load.createdAt;
      this.loadedIntents = opts.load.intentLog;
      this.paused = opts.load.paused;
      for (const seat of opts.load.seatIdentities) {
        this.slotIdentities.set(seat.slotIndex, {
          displayName: seat.displayName,
          pawnColor: seat.pawnColor,
        });
      }
      // Even if the save was in `playing` status, we come back up in
      // lobby so users can re-claim their seats. Replay happens on
      // startGame.
      this.status = "lobby";
    } else {
      this.seed = readNumber(opts.options, "seed", 0);
      this.autoEndTurn = readBoolean(opts.options, "autoEndTurn", false);
      this.allowUndo = readBoolean(opts.options, "allowUndo", true);
      this.initialBundle = {};
      this.createdAt = new Date().toISOString();
    }
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  attachConnection(userId: UserId, send: (msg: unknown) => void): void {
    this.connections.set(userId, send);
    if (this.status === "lobby") {
      send(this.lobbyMessage());
    } else if (this.engine) {
      send(this.snapshotFor(userId));
      if (this.paused) send({ type: "PAUSED", paused: true });
    }
  }

  detachConnection(userId: UserId): void {
    this.connections.delete(userId);
  }

  // ---------------------------------------------------------------------------
  // Lobby — driven by the platform
  // ---------------------------------------------------------------------------

  claimSeat(userId: UserId, seatIndex: number, opts?: SeatOptions): Result {
    if (seatIndex < 0 || seatIndex >= this.maxSlots) {
      return { ok: false, reason: "invalid seat" };
    }
    if (this.status === "playing" || this.status === "finished") {
      // Mid-game claim is only legal for a slot that was a player at
      // game start (kick → reclaim) and that's currently empty.
      if (!this.playerSlotOrder.includes(seatIndex)) {
        return {
          ok: false,
          reason: "cannot add new seats once the game has started",
        };
      }
      const current = this.slotToUser.get(seatIndex);
      if (current && current !== userId) {
        return { ok: false, reason: "seat is taken" };
      }
      this.slotToUser.set(seatIndex, userId);
      this.spectatorViewSeat.delete(userId);
      this.lastActivityAt = Date.now();
      this.broadcastSnapshot();
      return { ok: true };
    }

    // Lobby phase.
    const existing = this.slotToUser.get(seatIndex);
    if (existing && existing !== userId) {
      return { ok: false, reason: "seat is taken" };
    }
    // Release any other slot this user currently holds.
    for (const [k, u] of this.slotToUser) {
      if (u === userId && k !== seatIndex) this.slotToUser.delete(k);
    }
    this.slotToUser.set(seatIndex, userId);
    // A spectator who claims a seat shouldn't have a leftover view
    // override hanging around — they own a seat now and project from
    // it directly.
    this.spectatorViewSeat.delete(userId);
    if (!this.slotIdentities.has(seatIndex)) {
      // Auto-fill identity from the platform's hint (username) so the
      // host can start without forcing every player through a manual
      // identity picker. Players can override later via
      // SET_SEAT_IDENTITY.
      const hint = opts?.displayName?.trim();
      const fallback = `Player ${seatIndex + 1}`;
      this.slotIdentities.set(seatIndex, {
        displayName: this.uniqueDisplayName(hint && hint.length > 0 ? hint : fallback, seatIndex),
        pawnColor: this.suggestPawnColor(seatIndex),
      });
    }
    this.lastActivityAt = Date.now();
    this.broadcastLobby();
    return { ok: true };
  }

  /** The platform has checked inactivity; validate the expected assignment and
   * swap only seat owners. No engine intent, identity, hand or turn is changed. */
  transferSeat(userId: UserId, seatIndex: number, expectedOwner: UserId | null, persist: () => void = () => {}): Result {
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= this.maxSlots)
      return { ok: false, reason: "invalid seat" };
    if (this.status !== "lobby" && !this.playerSlotOrder.includes(seatIndex))
      return { ok: false, reason: "seat not in this game" };
    if ((this.slotToUser.get(seatIndex) ?? null) !== expectedOwner)
      return { ok: false, reason: "seat owner changed" };
    const nextClaims = new Map(this.slotToUser);
    for (const [index, owner] of nextClaims) if (owner === userId && index !== seatIndex) nextClaims.delete(index);
    nextClaims.set(seatIndex, userId);
    // No session mutation or projection may precede the durable ownership write.
    try { persist(); }
    catch { return { ok: false, reason: "Could not save the seat change. Please try again." }; }
    this.slotToUser = nextClaims;
    if (expectedOwner) this.spectatorViewSeat.delete(expectedOwner);
    this.spectatorViewSeat.delete(userId);
    this.lastActivityAt = Date.now();
    if (this.status === "lobby") this.broadcastLobby();
    else this.broadcastSnapshot();
    return { ok: true };
  }

  releaseSeat(userId: UserId, seatIndex: number): Result {
    if (this.status === "playing" || this.status === "finished") {
      // Mid-game leaving doesn't free the seat from the engine — the
      // user just walks away. The slot stays empty until reclaimed.
      const holder = this.slotToUser.get(seatIndex);
      if (holder !== userId) return { ok: false, reason: "not your seat" };
      this.slotToUser.delete(seatIndex);
      this.lastActivityAt = Date.now();
      this.broadcastSnapshot();
      return { ok: true };
    }
    const holder = this.slotToUser.get(seatIndex);
    if (!holder) return { ok: false, reason: "seat already empty" };
    if (holder !== userId) return { ok: false, reason: "not your seat" };
    this.slotToUser.delete(seatIndex);
    // On a fresh lobby (no save) drop the identity too. On a save-
    // hydrated lobby keep it so the next player can reclaim.
    if (this.loadedIntents === null) {
      this.slotIdentities.delete(seatIndex);
    }
    this.lastActivityAt = Date.now();
    this.broadcastLobby();
    return { ok: true };
  }

  kickSeat(callerUserId: UserId, seatIndex: number): Result {
    if (callerUserId !== this.hostUserId) {
      return { ok: false, reason: "only the host can kick" };
    }
    if (!this.slotToUser.has(seatIndex)) {
      return { ok: false, reason: "seat already empty" };
    }
    this.slotToUser.delete(seatIndex);
    this.lastActivityAt = Date.now();
    if (this.status === "lobby") this.broadcastLobby();
    else this.broadcastSnapshot();
    return { ok: true };
  }

  startGame(callerUserId: UserId): Result {
    if (callerUserId !== this.hostUserId) {
      return { ok: false, reason: "only the host can start" };
    }
    if (this.status !== "lobby") {
      return { ok: false, reason: "already started" };
    }
    const claimed = [...this.slotToUser.keys()].sort((a, b) => a - b);
    if (claimed.length < 2 || claimed.length > 4) {
      return {
        ok: false,
        reason: `coke and iron requires 2–4 players (have ${claimed.length})`,
      };
    }
    // Every claimed slot must have a fully-set identity.
    for (const slotIndex of claimed) {
      const id = this.slotIdentities.get(slotIndex);
      if (!id || id.displayName === null || id.pawnColor === null) {
        return {
          ok: false,
          reason: `slot ${slotIndex + 1} needs a name and pawn color before starting`,
        };
      }
    }
    // Disallow duplicate names / colors.
    const seenName = new Set<string>();
    const seenColor = new Set<LobbyColor>();
    for (const slotIndex of claimed) {
      const id = this.slotIdentities.get(slotIndex)!;
      if (seenName.has(id.displayName!))
        return { ok: false, reason: `name "${id.displayName}" used twice` };
      if (seenColor.has(id.pawnColor!))
        return { ok: false, reason: `color "${id.pawnColor}" used twice` };
      seenName.add(id.displayName!);
      seenColor.add(id.pawnColor!);
    }

    const playerCount = claimed.length as PlayerCount;
    const seats: SeatIdentity[] = claimed.map((slotIndex) => {
      const id = this.slotIdentities.get(slotIndex)!;
      return { displayName: id.displayName!, pawnColor: id.pawnColor! };
    });
    this.bundle = resolveBundle({ ...this.initialBundle, seats }, seats);
    this.engine = new Engine(
      {
        seed: this.seed,
        playerCount,
        autoEndTurn: this.autoEndTurn,
        allowUndo: this.allowUndo,
      },
      this.bundle,
    );
    if (this.loadedIntents) {
      let preView: PlayerView = projectForSpectator(this.engine.getState());
      for (const intent of this.loadedIntents) {
        const r = this.engine.dispatch(intent);
        if (!r.ok) {
          this.engine = null;
          this.bundle = null;
          this.recentEvents = [];
          return {
            ok: false,
            reason: `replay diverged: ${r.reason}`,
          };
        }
        const postView = projectForSpectator(this.engine.getState());
        this.recentEvents.push(buildEvent(preView, postView, intent));
        preView = postView;
      }
      this.loadedIntents = null;
    }
    this.playerSlotOrder = claimed;
    this.status = "playing";
    this.lastActivityAt = Date.now();
    this.broadcastSnapshot();
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Game-specific intents
  // ---------------------------------------------------------------------------

  handleGameMessage(userId: UserId, payload: unknown): void {
    const msg = parseGameMessage(payload);
    if (!msg) {
      this.errorTo(userId, "bad message");
      return;
    }
    switch (msg.type) {
      case "INTENT":
        return this.handleIntent(userId, msg.intent);
      case "UNDO":
        return this.handleUndo(userId);
      case "SET_PAUSED":
        return this.handleSetPaused(userId, msg.paused);
      case "SET_SEAT_IDENTITY":
        return this.handleSetSeatIdentity(
          userId,
          msg.slotIndex,
          msg.displayName,
          msg.pawnColor,
        );
      case "REQUEST_SNAPSHOT": {
        if (this.status === "lobby") {
          this.sendTo(userId, this.lobbyMessage());
        } else if (this.engine) {
          this.sendTo(userId, this.snapshotFor(userId));
          if (this.paused) this.sendTo(userId, { type: "PAUSED", paused: true });
        }
        return;
      }
      case "SET_SPECTATOR_VIEW":
        return this.handleSetSpectatorView(userId, msg.seatId);
    }
  }

  private handleSetSpectatorView(
    userId: UserId,
    seatId: PlayerId | null,
  ): void {
    if (this.status !== "playing" || !this.engine) {
      return this.errorTo(userId, "game not started");
    }
    // Anyone holding a real seat ignores this — they already see their
    // own hand and can't use this to peek at someone else's.
    for (const slot of this.slotToUser.keys()) {
      if (this.slotToUser.get(slot) === userId) {
        return this.errorTo(userId, "seated players see their own hand");
      }
    }
    if (seatId === null) {
      this.spectatorViewSeat.delete(userId);
    } else {
      if (seatId < 0 || seatId >= this.playerSlotOrder.length) {
        return this.errorTo(userId, "invalid spectator view seat");
      }
      this.spectatorViewSeat.set(userId, seatId);
    }
    // Push a fresh snapshot to just this user — projectFor will now
    // populate (or hide) their requested player's hand.
    this.sendTo(userId, this.snapshotFor(userId));
  }

  private handleIntent(userId: UserId, intent: Intent): void {
    if (this.status !== "playing" || !this.engine) {
      return this.errorTo(userId, "game not started");
    }
    if (this.paused) return this.errorTo(userId, "game is paused");
    const carriedPlayerId = (intent as { playerId?: number }).playerId;
    if (typeof carriedPlayerId === "number") {
      const expectedSlot = this.playerSlotOrder[carriedPlayerId];
      if (expectedSlot === undefined) {
        return this.errorTo(userId, `invalid playerId ${carriedPlayerId}`);
      }
      if (this.slotToUser.get(expectedSlot) !== userId) {
        return this.errorTo(
          userId,
          `seat ${carriedPlayerId} is not held by you`,
        );
      }
    }
    const preView = projectForSpectator(this.engine.getState());
    const result = this.engine.dispatch(intent);
    if (!result.ok) {
      this.sendTo(userId, {
        type: "INTENT_REJECTED",
        reason: result.reason,
        intent,
      });
      return;
    }
    const postView = projectForSpectator(this.engine.getState());
    const event = buildEvent(preView, postView, intent);
    this.recentEvents.push(event);
    this.lastActivityAt = Date.now();
    this.broadcastState({
      kind: "intent",
      intent,
      originator: userId,
      event,
    });
  }

  private handleUndo(userId: UserId): void {
    if (this.status !== "playing" || !this.engine) {
      return this.errorTo(userId, "game not started");
    }
    if (this.paused) return this.errorTo(userId, "game is paused");
    const state = this.engine.getState();
    const activePlayerId = state.turnOrder[state.currentPlayerIndex];
    if (activePlayerId === undefined) {
      return this.errorTo(userId, "no active seat");
    }
    const expectedSlot = this.playerSlotOrder[activePlayerId];
    if (expectedSlot === undefined || this.slotToUser.get(expectedSlot) !== userId) {
      return this.errorTo(userId, "only the active seat may undo");
    }
    if (!this.engine.undo()) {
      return this.errorTo(userId, "nothing to undo");
    }
    this.recentEvents.pop();
    this.lastActivityAt = Date.now();
    this.broadcastState({ kind: "undo" });
  }

  private handleSetPaused(userId: UserId, paused: boolean): void {
    if (userId !== this.hostUserId) {
      return this.errorTo(userId, "only the host can pause / resume");
    }
    if (this.status !== "playing") {
      return this.errorTo(userId, "no game in progress");
    }
    this.paused = paused;
    for (const send of this.connections.values()) {
      send({ type: "PAUSED", paused });
    }
  }

  private handleSetSeatIdentity(
    userId: UserId,
    slotIndex: number,
    displayName: string,
    pawnColor: LobbyColor,
  ): void {
    if (this.status !== "lobby") {
      return this.errorTo(userId, "cannot rename seats once started");
    }
    if (this.slotToUser.get(slotIndex) !== userId) {
      return this.errorTo(userId, "not your seat");
    }
    if (!isLobbyColor(pawnColor)) {
      return this.errorTo(userId, `unknown color ${pawnColor}`);
    }
    const trimmed = displayName.trim();
    if (trimmed.length === 0) return this.errorTo(userId, "name cannot be empty");
    if (trimmed.length > 40) return this.errorTo(userId, "name too long");
    // Reject duplicate names/colors against other claimed slots.
    for (const [other, otherId] of this.slotIdentities) {
      if (other === slotIndex) continue;
      if (!this.slotToUser.has(other)) continue;
      if (otherId.displayName === trimmed)
        return this.errorTo(userId, `name "${trimmed}" already taken`);
      if (otherId.pawnColor === pawnColor)
        return this.errorTo(userId, `color "${pawnColor}" already taken`);
    }
    this.slotIdentities.set(slotIndex, {
      displayName: trimmed,
      pawnColor,
    });
    this.broadcastLobby();
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  serialize(): CokeAndIronSave {
    const playerCount =
      this.engine?.getInitialConfig().playerCount ?? null;
    const intentLog = this.engine?.getIntentLog() ?? this.loadedIntents ?? [];
    const seatIdentities: SavedSeatIdentity[] = [];
    for (const [slotIndex, id] of this.slotIdentities) {
      seatIdentities.push({
        slotIndex,
        displayName: id.displayName,
        pawnColor: id.pawnColor,
      });
    }
    seatIdentities.sort((a, b) => a.slotIndex - b.slotIndex);
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      status: this.status,
      seed: this.seed,
      playerCount,
      autoEndTurn: this.autoEndTurn,
      allowUndo: this.allowUndo,
      bundle: this.bundle,
      intentLog: [...intentLog],
      seatIdentities,
      paused: this.paused,
      createdAt: this.createdAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Telemetry
  // ---------------------------------------------------------------------------

  describe(): SessionDescription {
    const playerCount =
      this.status === "playing"
        ? this.playerSlotOrder.length
        : this.slotToUser.size;
    const headline = this.headline();
    // Lobby: every seat is playable. Playing: only the seats the
    // game actually started with (others can't be added retroactively
    // — the engine's playerCount is fixed).
    const playableSeatIndices =
      this.status === "lobby"
        ? Array.from({ length: this.maxSlots }, (_, i) => i)
        : [...this.playerSlotOrder];
    return {
      status: this.status,
      playerCount,
      maxPlayers: this.maxSlots,
      spectatorCount: 0,
      lastActivityAt: this.lastActivityAt,
      playableSeatIndices,
      ...(headline !== undefined ? { headline } : {}),
    };
  }

  private headline(): string | undefined {
    if (this.status === "lobby") return "Waiting in lobby";
    if (this.status === "finished") return "Game complete";
    if (!this.engine) return undefined;
    const s = this.engine.getState();
    return `Era ${s.era}, round ${s.round}`;
  }

  // ---------------------------------------------------------------------------
  // Broadcast helpers
  // ---------------------------------------------------------------------------

  private lobbyMessage(): GameServerMessage {
    return { type: "LOBBY_STATE", lobby: this.buildLobbyState() };
  }

  private broadcastLobby(): void {
    const msg = this.lobbyMessage();
    for (const send of this.connections.values()) send(msg);
  }

  private snapshotFor(userId: UserId): GameServerMessage {
    if (!this.engine) {
      throw new Error("snapshot requested before engine built");
    }
    return {
      type: "SNAPSHOT",
      playing: this.envelopeFor(
        this.playerIdForUser(userId),
        this.actualSeatFor(userId),
      ),
      seats: this.buildLobbyState().seats,
      seatToken: null,
      events: this.recentEvents,
    };
  }

  private broadcastSnapshot(): void {
    if (!this.engine) {
      // We're in a transitional state (mid-start, or post-kick before
      // any subsequent message). Re-emit lobby state instead.
      this.broadcastLobby();
      return;
    }
    for (const [userId, send] of this.connections) {
      send(this.snapshotFor(userId));
    }
  }

  private broadcastState(
    cause:
      | {
          kind: "intent";
          intent: Intent;
          originator: UserId;
          event: ObservableEvent;
        }
      | { kind: "undo" }
      | { kind: "snapshot" },
  ): void {
    if (!this.engine) return;
    for (const [userId, send] of this.connections) {
      send({
        type: "STATE",
        playing: this.envelopeFor(
          this.playerIdForUser(userId),
          this.actualSeatFor(userId),
        ),
        cause,
      } satisfies GameServerMessage);
    }
  }

  private envelopeFor(
    viewerSeatId: PlayerId | -1,
    actualSeatId: PlayerId | -1,
  ): PlayingEnvelope {
    if (!this.engine) {
      throw new Error("envelopeFor called before engine built");
    }
    const state = this.engine.getState();
    const activeSeatId = state.turnOrder[state.currentPlayerIndex] ?? null;
    // canUndo is gated on the user OWNING the active seat — a spectator
    // peeking through someone's perspective must not be able to roll
    // back that player's turn.
    const isOwnerActive = actualSeatId !== -1 && activeSeatId === actualSeatId;
    return {
      view: projectFor(state, viewerSeatId),
      paused: this.paused,
      allowUndo: this.allowUndo,
      canUndoNow: isOwnerActive && this.engine.canUndo(),
      viewerPlayerId: viewerSeatId,
      actualSeatId,
    };
  }

  /** Seat the user ACTUALLY owns. -1 for spectators / unseated. Never
   *  consults the spectator-view override. */
  private actualSeatFor(userId: UserId): PlayerId | -1 {
    for (let i = 0; i < this.playerSlotOrder.length; i++) {
      const slot = this.playerSlotOrder[i]!;
      if (this.slotToUser.get(slot) === userId) return i as PlayerId;
    }
    return -1;
  }

  /** Seat to PROJECT FROM when rendering a view for this user. Falls
   *  back to the spectator-view override when the user is unseated, so
   *  the chosen player's hand appears in their UI. Stale overrides
   *  (e.g. seat index past the active player count) are ignored. */
  private playerIdForUser(userId: UserId): PlayerId | -1 {
    const actual = this.actualSeatFor(userId);
    if (actual !== -1) return actual;
    const override = this.spectatorViewSeat.get(userId);
    if (override !== undefined && override < this.playerSlotOrder.length) {
      return override;
    }
    return -1;
  }

  private buildLobbyState(): LobbyState {
    const seats = [];
    for (let i = 0; i < this.maxSlots; i++) {
      const id = this.slotIdentities.get(i);
      const claimedBy = this.slotToUser.get(i) ?? null;
      seats.push({
        id: i,
        displayName: id?.displayName ?? null,
        pawnColor: id?.pawnColor ?? null,
        claimedBy,
      });
    }
    // The engine treats playerCount as 2|3|4. In lobby phase before the
    // host hits start, just report the maxSlots — the wire shape's
    // playerCount field is informational.
    const claimedCount = this.slotToUser.size;
    const lobbyPlayerCount =
      claimedCount >= 2 && claimedCount <= 4
        ? (claimedCount as PlayerCount)
        : (this.maxSlots as PlayerCount);
    return {
      playerCount: lobbyPlayerCount,
      seats,
      locked: false,
      fromSave: this.loadedIntents !== null,
      hostId: this.hostUserId,
    };
  }

  private suggestPawnColor(slotIndex: number): LobbyColor {
    const used = new Set<LobbyColor>();
    for (const [, id] of this.slotIdentities) {
      if (id.pawnColor) used.add(id.pawnColor);
    }
    for (const c of LOBBY_COLORS) if (!used.has(c)) return c;
    return LOBBY_COLORS[slotIndex % LOBBY_COLORS.length]!;
  }

  private uniqueDisplayName(candidate: string, ownSlotIndex: number): string {
    const used = new Set<string>();
    for (const [k, id] of this.slotIdentities) {
      if (k !== ownSlotIndex && id.displayName) used.add(id.displayName);
    }
    if (!used.has(candidate)) return candidate;
    let n = 2;
    while (used.has(`${candidate} (${n})`)) n++;
    return `${candidate} (${n})`;
  }

  private sendTo(userId: UserId, msg: GameServerMessage): void {
    this.connections.get(userId)?.(msg);
  }

  private errorTo(userId: UserId, message: string): void {
    this.sendTo(userId, { type: "ERROR", message });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

void PROTOCOL_VERSION; // re-exported elsewhere; kept in import for visibility

function readNumber(
  obj: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function readBoolean(
  obj: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const v = obj[key];
  return typeof v === "boolean" ? v : fallback;
}

function isLobbyColor(s: unknown): s is LobbyColor {
  return typeof s === "string" && (LOBBY_COLORS as readonly string[]).includes(s);
}

function parseGameMessage(payload: unknown): C2SGameMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  switch (obj["type"]) {
    case "INTENT":
      if (obj["intent"] && typeof obj["intent"] === "object") {
        return { type: "INTENT", intent: obj["intent"] as Intent };
      }
      return null;
    case "UNDO":
      return { type: "UNDO" };
    case "REQUEST_SNAPSHOT":
      return { type: "REQUEST_SNAPSHOT" };
    case "SET_PAUSED":
      if (typeof obj["paused"] === "boolean") {
        return { type: "SET_PAUSED", paused: obj["paused"] };
      }
      return null;
    case "SET_SEAT_IDENTITY":
      if (
        typeof obj["slotIndex"] === "number" &&
        typeof obj["displayName"] === "string" &&
        typeof obj["pawnColor"] === "string" &&
        isLobbyColor(obj["pawnColor"])
      ) {
        return {
          type: "SET_SEAT_IDENTITY",
          slotIndex: obj["slotIndex"],
          displayName: obj["displayName"],
          pawnColor: obj["pawnColor"] as LobbyColor,
        };
      }
      return null;
    case "SET_SPECTATOR_VIEW": {
      const v = obj["seatId"];
      if (v === null) return { type: "SET_SPECTATOR_VIEW", seatId: null };
      if (typeof v === "number" && Number.isInteger(v) && v >= 0) {
        return { type: "SET_SPECTATOR_VIEW", seatId: v as PlayerId };
      }
      return null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Entry points used by definition.ts
// ---------------------------------------------------------------------------

export function buildSession(
  opts: SessionOpts & { load?: CokeAndIronSave },
): CokeAndIronSession {
  return new CokeAndIronSession(opts);
}

export function createFromOpts(opts: CreateOpts): CokeAndIronSession {
  return new CokeAndIronSession({
    hostUserId: opts.hostUserId,
    options: opts.options,
    maxSlots: 4,
  });
}

export function loadFromOpts(
  blob: CokeAndIronSave,
  opts: LoadOpts,
): CokeAndIronSession {
  return new CokeAndIronSession({
    hostUserId: opts.hostUserId,
    options: opts.options,
    maxSlots: 4,
    load: blob,
  });
}
