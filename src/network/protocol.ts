// =============================================================================
// Wire protocol — host ↔ client messages.
//
// Both sides exchange JSON-encoded messages of the discriminated unions
// declared here. The protocol is split into two phases:
//
//   - LOBBY phase: server authoritative for seat claims; clients can claim,
//     release, set ready. Host can lock + start.
//   - PLAYING phase: clients SEND { type:"INTENT", ... }; server replies
//     with { type:"INTENT_ACCEPTED", intent } (broadcast to everyone) or
//     { type:"INTENT_REJECTED", reason } (only to the sender).
//
// Joining mid-game receives a single { type:"SNAPSHOT", ... } that lets the
// client reconstruct its mirror engine deterministically. Subsequent
// INTENT_ACCEPTED messages keep it in sync.
// =============================================================================
import type { Intent, PlayerCount } from "../engine/types";
import type { ResolvedBundle } from "./saveFile";

export type { PlayerCount };

export const PROTOCOL_VERSION = 1 as const;

/** Pawn colours the lobby offers. The engine accepts any string for
 * `pawnColor`, but the lobby restricts to this palette so the UI knows
 * how to render them. */
export const LOBBY_COLORS = [
  "red",
  "yellow",
  "green",
  "blue",
  "purple",
  "teal",
] as const;
export type LobbyColor = (typeof LOBBY_COLORS)[number];

export interface LobbySeat {
  /** PlayerId — stable for the entire game (and across reload). */
  readonly id: number;
  /** Set when claimed; null otherwise. */
  readonly displayName: string | null;
  readonly pawnColor: LobbyColor | null;
  /** Connection id of the claiming client; null when unclaimed. */
  readonly claimedBy: string | null;
}

export interface LobbyState {
  readonly playerCount: PlayerCount;
  readonly seats: readonly LobbySeat[];
  /** Once locked, no claim/release allowed; only start. */
  readonly locked: boolean;
  /** True if the host loaded a save — names + colours pre-filled, players
   * claim by selecting their seat (matched by name/colour). */
  readonly fromSave: boolean;
  /** Connection id of the host (always seat 0 by convention is NOT
   * required — host can pick any seat). */
  readonly hostId: string;
}

/** Subset of lobby info pushed to every client on connect, plus updates. */
export interface PlayingState {
  readonly seed: number;
  readonly playerCount: PlayerCount;
  readonly autoEndTurn: boolean;
  readonly allowUndo: boolean;
  readonly bundle: ResolvedBundle;
  readonly intentLog: readonly Intent[];
  readonly paused: boolean;
}

// -----------------------------------------------------------------------------
// Server → Client
// -----------------------------------------------------------------------------

export interface S2CWelcome {
  readonly type: "WELCOME";
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  /** This connection's id. Used to identify own claims in LobbyState. */
  readonly clientId: string;
  /** True if this client connected before LOBBY_START. */
  readonly inLobby: boolean;
}

export interface S2CLobbyState {
  readonly type: "LOBBY_STATE";
  readonly lobby: LobbyState;
}

export interface S2CSnapshot {
  readonly type: "SNAPSHOT";
  readonly playing: PlayingState;
  /** Echo of the lobby's resolved seat identities for the UI to render
   * names + colours during play. */
  readonly seats: LobbyState["seats"];
}

export interface S2CIntentAccepted {
  readonly type: "INTENT_ACCEPTED";
  readonly intent: Intent;
  /** Client that originated this intent. The originating client has
   * already applied this optimistically and must NOT re-apply on receipt
   * — every other connected client uses this broadcast to advance their
   * mirror. */
  readonly originator: string;
}

export interface S2CIntentRejected {
  readonly type: "INTENT_REJECTED";
  readonly reason: string;
  /** Echo of the intent the sender tried to dispatch, for client logging. */
  readonly intent: Intent;
}

export interface S2CPaused {
  readonly type: "PAUSED";
  readonly paused: boolean;
}

export interface S2CError {
  readonly type: "ERROR";
  readonly message: string;
}

/** Summary of a save file the host has on disk; sent to the lobby host
 * so they can pick one to load before starting. Times are ISO strings. */
export interface SaveSummary {
  readonly name: string;
  readonly playerCount: PlayerCount;
  readonly seed: number;
  readonly createdAt: string;
  readonly mtime: string;
  readonly intentCount: number;
  readonly bytes: number;
}

export interface S2CSavesList {
  readonly type: "SAVES_LIST";
  readonly saves: readonly SaveSummary[];
}

export type ServerMessage =
  | S2CWelcome
  | S2CLobbyState
  | S2CSnapshot
  | S2CIntentAccepted
  | S2CIntentRejected
  | S2CPaused
  | S2CSavesList
  | S2CError;

// -----------------------------------------------------------------------------
// Client → Server
// -----------------------------------------------------------------------------

export interface C2SClaimSeat {
  readonly type: "CLAIM_SEAT";
  readonly seatId: number;
  readonly displayName: string;
  readonly pawnColor: LobbyColor;
}

export interface C2SReleaseSeat {
  readonly type: "RELEASE_SEAT";
  readonly seatId: number;
}

/** Host-only: lock further claim/release. */
export interface C2SLockLobby {
  readonly type: "LOCK_LOBBY";
  readonly locked: boolean;
}

/** Host-only: begin the game from current lobby state. Server replies with
 * a SNAPSHOT broadcast. */
export interface C2SStartGame {
  readonly type: "START_GAME";
}

export interface C2SIntent {
  readonly type: "INTENT";
  readonly intent: Intent;
}

/** Host-only. */
export interface C2SSetPaused {
  readonly type: "SET_PAUSED";
  readonly paused: boolean;
}

/** Host-only, lobby phase. Resize the lobby seat list. Discards any
 * loaded-save state. */
export interface C2SSetPlayerCount {
  readonly type: "SET_PLAYER_COUNT";
  readonly count: PlayerCount;
}

/** Host-only, lobby phase. Replace the current lobby with one
 * pre-filled from the named save file (must be in the host's saves
 * directory). */
export interface C2SLoadSave {
  readonly type: "LOAD_SAVE";
  readonly filename: string;
}

/** Host-only, lobby phase. Discard any loaded save and reset to an
 * empty lobby with the current player count. */
export interface C2SNewGame {
  readonly type: "NEW_GAME";
}

/** Host-only, lobby phase. Request the list of save files the host
 * has on disk. Server replies with S2CSavesList. */
export interface C2SListSaves {
  readonly type: "LIST_SAVES";
}

export type ClientMessage =
  | C2SClaimSeat
  | C2SReleaseSeat
  | C2SLockLobby
  | C2SStartGame
  | C2SIntent
  | C2SSetPaused
  | C2SSetPlayerCount
  | C2SLoadSave
  | C2SNewGame
  | C2SListSaves;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

export function encode(msg: ServerMessage | ClientMessage): string {
  return JSON.stringify(msg);
}

/** Parse and narrow to ServerMessage. Returns null on malformed input. */
export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const obj = JSON.parse(raw) as { type?: string };
    if (typeof obj?.type !== "string") return null;
    switch (obj.type) {
      case "WELCOME":
      case "LOBBY_STATE":
      case "SNAPSHOT":
      case "INTENT_ACCEPTED":
      case "INTENT_REJECTED":
      case "PAUSED":
      case "SAVES_LIST":
      case "ERROR":
        return obj as ServerMessage;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const obj = JSON.parse(raw) as { type?: string };
    if (typeof obj?.type !== "string") return null;
    switch (obj.type) {
      case "CLAIM_SEAT":
      case "RELEASE_SEAT":
      case "LOCK_LOBBY":
      case "START_GAME":
      case "INTENT":
      case "SET_PAUSED":
      case "SET_PLAYER_COUNT":
      case "LOAD_SAVE":
      case "NEW_GAME":
      case "LIST_SAVES":
        return obj as ClientMessage;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function isLobbyColor(s: unknown): s is LobbyColor {
  return typeof s === "string" && (LOBBY_COLORS as readonly string[]).includes(s);
}
