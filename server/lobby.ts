// =============================================================================
// Authoritative lobby state machine for the host. Owns:
//   - The list of seats (claimable identities) and which clientId holds each
//   - The locked / startable flag
//   - Whether the lobby was hydrated from a save (seats pre-filled, players
//     reclaim by selecting their seat)
//
// Pure-ish: every mutation returns either ok with a new state, or an error
// reason. The host wraps these and broadcasts the new LobbyState on success.
// =============================================================================
import {
  LOBBY_COLORS,
  type LobbyColor,
  type LobbyState,
} from "../shared/protocol";
import type { PlayerCount } from "../engine/types";
import type { SeatIdentity } from "../engine";

export type LobbyResult =
  | { readonly ok: true; readonly lobby: LobbyState }
  | { readonly ok: false; readonly reason: string };

export function emptyLobby(
  hostId: string,
  playerCount: PlayerCount,
): LobbyState {
  return {
    playerCount,
    seats: Array.from({ length: playerCount }, (_, id) => ({
      id,
      displayName: null,
      pawnColor: null,
      claimedBy: null,
    })),
    locked: false,
    fromSave: false,
    hostId,
  };
}

export function lobbyFromSave(
  hostId: string,
  playerCount: PlayerCount,
  seats: readonly SeatIdentity[],
): LobbyState {
  return {
    playerCount,
    seats: seats.map((s, id) => ({
      id,
      displayName: s.displayName,
      pawnColor: isLobbyColor(s.pawnColor) ? s.pawnColor : null,
      // Save-loaded seats are unclaimed at lobby reopen; players reclaim
      // by selecting them. Names + colours are preserved as the seat
      // identity for matching.
      claimedBy: null,
    })),
    locked: false,
    fromSave: true,
    hostId,
  };
}

export function claimSeat(
  state: LobbyState,
  clientId: string,
  seatId: number,
  displayName: string,
  pawnColor: LobbyColor,
): LobbyResult {
  if (state.locked) return fail("lobby is locked");
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return fail("name cannot be empty");
  if (trimmed.length > 40) return fail("name too long");
  if (!isLobbyColor(pawnColor)) return fail(`unknown colour ${pawnColor}`);

  const seat = state.seats[seatId];
  if (!seat) return fail(`no such seat ${seatId}`);
  if (seat.claimedBy && seat.claimedBy !== clientId) {
    return fail(`seat ${seatId} already claimed`);
  }
  if (state.fromSave) {
    if (seat.displayName !== null && seat.displayName !== trimmed) {
      return fail(
        `seat ${seatId} reserved for "${seat.displayName}" — pick that seat or another`,
      );
    }
    if (seat.pawnColor !== null && seat.pawnColor !== pawnColor) {
      return fail(`seat ${seatId} colour locked to ${seat.pawnColor}`);
    }
  }
  // Disallow duplicate colour or duplicate name across other seats.
  for (const s of state.seats) {
    if (s.id === seatId) continue;
    if (s.pawnColor === pawnColor)
      return fail(`colour ${pawnColor} already taken`);
    if (s.displayName !== null && s.displayName === trimmed)
      return fail(`name "${trimmed}" already taken`);
  }
  // Release any other seat this client may currently hold.
  const seats = state.seats.map((s) => {
    if (s.id === seatId) {
      return {
        ...s,
        displayName: trimmed,
        pawnColor,
        claimedBy: clientId,
      };
    }
    if (s.claimedBy === clientId) {
      return { ...s, claimedBy: null };
    }
    return s;
  });
  return { ok: true, lobby: { ...state, seats } };
}

export function releaseSeat(
  state: LobbyState,
  clientId: string,
  seatId: number,
): LobbyResult {
  if (state.locked) return fail("lobby is locked");
  const seat = state.seats[seatId];
  if (!seat) return fail(`no such seat ${seatId}`);
  if (seat.claimedBy !== clientId) {
    return fail(`seat ${seatId} not held by you`);
  }
  const seats = state.seats.map((s) => {
    if (s.id !== seatId) return s;
    if (state.fromSave) {
      // Keep the save-supplied identity so another player can reclaim it.
      return { ...s, claimedBy: null };
    }
    return { ...s, displayName: null, pawnColor: null, claimedBy: null };
  });
  return { ok: true, lobby: { ...state, seats } };
}

/** Called when a connection drops. Releases any seat the client held. */
export function releaseAllForClient(
  state: LobbyState,
  clientId: string,
): LobbyState {
  const seats = state.seats.map((s) => {
    if (s.claimedBy !== clientId) return s;
    if (state.fromSave) {
      return { ...s, claimedBy: null };
    }
    return { ...s, displayName: null, pawnColor: null, claimedBy: null };
  });
  return { ...state, seats };
}

export function setLocked(
  state: LobbyState,
  clientId: string,
  locked: boolean,
): LobbyResult {
  if (clientId !== state.hostId) return fail("only the host can lock");
  return { ok: true, lobby: { ...state, locked } };
}

export function isStartable(state: LobbyState): boolean {
  return state.seats.every(
    (s) => s.claimedBy !== null && s.displayName !== null && s.pawnColor !== null,
  );
}

export function snapshotSeats(state: LobbyState): readonly SeatIdentity[] {
  return state.seats.map((s) => ({
    displayName: s.displayName ?? `Player ${s.id + 1}`,
    pawnColor: s.pawnColor ?? "red",
  }));
}

function fail(reason: string): LobbyResult {
  return { ok: false, reason };
}

function isLobbyColor(c: unknown): c is LobbyColor {
  return typeof c === "string" && (LOBBY_COLORS as readonly string[]).includes(c);
}
