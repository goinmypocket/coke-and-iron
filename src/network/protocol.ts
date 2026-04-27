// =============================================================================
// Wire protocol — host ↔ client messages.
//
// Both sides exchange JSON-encoded messages of the discriminated unions
// declared here. The protocol is split into two phases:
//
//   - LOBBY phase: server authoritative for seat claims; clients can claim,
//     release, set ready. Host can lock + start.
//   - PLAYING phase: clients SEND { type:"INTENT", ... }; server applies it
//     and broadcasts a per-recipient { type:"STATE", view } (each socket
//     receives the PlayerView projected for *its* seat). Failed dispatches
//     come back as { type:"INTENT_REJECTED", reason } to the sender only.
//
// Privacy boundary: the wire never carries another seat's hand contents
// or the deck. Each STATE message is filtered through `projectFor` so
// that other players' hands appear as length-only `handSize` fields and
// the deck/removed pile collapse to plain integer counts. Every
// connected client gets the version of the view it's allowed to see.
//
// Reconnect: on game start the host issues one `seatToken` per seat
// (random UUID, persisted in the save). Clients store it in
// localStorage; on a fresh WebSocket they send `RESUME { seatToken }`
// and the server transfers seat ownership to the new connection. Lose
// the token (or move devices) and the lobby host can hand it back from
// their setup row.
// =============================================================================
import type { Intent, PlayerCount } from "../engine/types";
import type { PlayerView } from "../engine/view";
import type { ResolvedBundle } from "./saveFile";

export type { PlayerCount };
export type { PlayerView };

export const PROTOCOL_VERSION = 2 as const;

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

/** Subset of lobby info pushed to every client on connect, plus updates.
 *  Legacy v1 envelope — still used by SNAPSHOT during the cutover so
 *  current clients keep working. v2 (PlayingEnvelope, below) ships the
 *  same information as a redacted PlayerView and is what the new
 *  STATE / RESUMED paths use. Both will coexist until the client-side
 *  switch lands; then this can be deleted. */
export interface PlayingState {
  readonly seed: number;
  readonly playerCount: PlayerCount;
  readonly autoEndTurn: boolean;
  readonly allowUndo: boolean;
  readonly bundle: ResolvedBundle;
  readonly intentLog: readonly Intent[];
  readonly paused: boolean;
}

/** Per-recipient game-state envelope. The view itself is the entire
 * snapshot — no seed, no intent log. paused / allowUndo travel
 * alongside because they're session-level (not per-state) settings. */
export interface PlayingEnvelope {
  readonly view: PlayerView;
  readonly paused: boolean;
  readonly allowUndo: boolean;
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
  /** Legacy: the full PlayingState (seed + intentLog + bundle). Kept
   *  during the cutover; will be removed once the client switches to
   *  the redacted view path. */
  readonly playing: PlayingState;
  /** Echo of the lobby's resolved seat identities for the UI to render
   * names + colours during play. */
  readonly seats: LobbyState["seats"];
  /** The reconnect token for this client's seat, if they hold one.
   * The client persists this to localStorage and replays it via RESUME
   * on the next WebSocket open. null for spectators. */
  readonly seatToken: string | null;
}

/** Legacy intent broadcast — kept during the cutover so the existing
 *  mirror-engine clients still advance. Will be replaced by S2CState
 *  once the client adopts the view-only path. */
export interface S2CIntentAccepted {
  readonly type: "INTENT_ACCEPTED";
  readonly intent: Intent;
  readonly originator: string;
}

/** Sent to every connected client after each accepted intent (or
 * undo). Each recipient gets the view filtered for their own seat. */
export interface S2CState {
  readonly type: "STATE";
  readonly playing: PlayingEnvelope;
  /** The intent that produced this state, observable form. Today this
   * carries the raw intent for ergonomics; selectively redacting
   * intent payloads is a future concern. */
  readonly cause:
    | { readonly kind: "intent"; readonly intent: Intent; readonly originator: string }
    | { readonly kind: "undo" }
    | { readonly kind: "snapshot" };
}

export interface S2CIntentRejected {
  readonly type: "INTENT_REJECTED";
  readonly reason: string;
  /** Echo of the intent the sender tried to dispatch, for client logging. */
  readonly intent: Intent;
}

/** Confirmation that a RESUME request matched a seat. Sent only to the
 * client that initiated the resume; everyone else gets a fresh
 * LOBBY_STATE/STATE that reflects the reassigned `claimedBy`. */
export interface S2CResumed {
  readonly type: "RESUMED";
  readonly seatId: number;
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
  | S2CState
  | S2CIntentAccepted
  | S2CIntentRejected
  | S2CResumed
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

/** Active-seat-only. Roll back the most recent intent in the current
 * turn. The client cannot do this locally any more (no mirror engine
 * + no seed), so the request round-trips and the resulting STATE
 * broadcast restores everyone's view. */
export interface C2SUndo {
  readonly type: "UNDO";
}

/** Sent immediately after WELCOME, before any other interaction, when
 * the client has a saved seat token. The server matches the token to
 * a seat (set at game start, persisted in saves) and transfers seat
 * ownership to the new clientId. Replies with S2CResumed + a fresh
 * SNAPSHOT or LOBBY_STATE; on a mismatch, replies with S2CError and
 * the client falls back to the regular lobby flow. */
export interface C2SResume {
  readonly type: "RESUME";
  readonly seatToken: string;
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
  | C2SListSaves
  | C2SUndo
  | C2SResume;

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
      case "STATE":
      case "INTENT_ACCEPTED":
      case "INTENT_REJECTED":
      case "RESUMED":
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
      case "UNDO":
      case "RESUME":
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
