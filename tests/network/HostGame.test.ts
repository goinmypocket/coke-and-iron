// Integration test: drive HostGame through a lobby + a few intents and
// verify two simulated clients converge on the same engine state.
//
// We don't open a real WebSocket — we just connect the HostGame's
// per-client send callback to a list of received messages, then feed
// outbound C2S messages through the host's handlers directly. This
// covers the host-side state machine end-to-end without spinning up a
// network.
import { describe, expect, it } from "vitest";
import { Engine } from "../../src/engine/Engine";
import { HostGame } from "../../host/HostGame";
import type { ServerMessage } from "../../src/network/protocol";

interface FakeClient {
  readonly id: string;
  readonly inbox: ServerMessage[];
}

function attach(host: HostGame, id: string): FakeClient {
  const inbox: ServerMessage[] = [];
  host.attachConnection(id, (msg) => inbox.push(msg));
  return { id, inbox };
}

function lastOfType<T extends ServerMessage["type"]>(
  c: FakeClient,
  t: T,
): Extract<ServerMessage, { type: T }> | undefined {
  for (let i = c.inbox.length - 1; i >= 0; i--) {
    const m = c.inbox[i]!;
    if (m.type === t) return m as Extract<ServerMessage, { type: T }>;
  }
  return undefined;
}

describe("HostGame — lobby + game flow", () => {
  it("two clients claim seats, host starts, intents broadcast", () => {
    const host = new HostGame({
      seed: 5,
      playerCount: 2,
      autoEndTurn: false,
      allowUndo: true,
      bundle: {},
      // Use a temp autosave path so the test never touches ./saves/current.json.
      autosavePath: `${process.cwd()}/saves/__test__.json`,
      debounceMs: 50_000,
    });

    const a = attach(host, "client-a");
    const b = attach(host, "client-b");

    host.handleClaimSeat("client-a", 0, "Alice", "red");
    host.handleClaimSeat("client-b", 1, "Bob", "yellow");

    const lobbyA = lastOfType(a, "LOBBY_STATE");
    expect(lobbyA?.lobby.seats[0]?.displayName).toBe("Alice");
    expect(lobbyA?.lobby.seats[1]?.displayName).toBe("Bob");
    expect(lobbyA?.lobby.hostId).toBe("client-a");

    const startResult = host.handleStartGame("client-a");
    expect(startResult.ok).toBe(true);

    const snapA = lastOfType(a, "SNAPSHOT");
    const snapB = lastOfType(b, "SNAPSHOT");
    expect(snapA).toBeTruthy();
    expect(snapB).toBeTruthy();
    expect(snapA?.playing.seed).toBe(5);
    expect(snapA?.seats[0]?.displayName).toBe("Alice");

    // Active player is whoever's at turnOrder[0] — derive from a fresh
    // engine reproduction.
    const mirror = new Engine(
      {
        seed: snapA!.playing.seed,
        playerCount: snapA!.playing.playerCount,
      },
      snapA!.playing.bundle,
    );
    const activeSeat =
      mirror.getState().turnOrder[mirror.getState().currentPlayerIndex]!;
    const activeClient = activeSeat === 0 ? "client-a" : "client-b";

    host.handleIntent(activeClient, {
      type: "PASS",
      playerId: activeSeat,
      cardIndex: 0,
    });

    // Both clients should see the broadcast.
    const acceptedA = lastOfType(a, "INTENT_ACCEPTED");
    const acceptedB = lastOfType(b, "INTENT_ACCEPTED");
    expect(acceptedA?.originator).toBe(activeClient);
    expect(acceptedB?.originator).toBe(activeClient);
    expect(acceptedA?.intent).toEqual({
      type: "PASS",
      playerId: activeSeat,
      cardIndex: 0,
    });
  });

  it("host can change player count from the lobby and seats resize", () => {
    const host = new HostGame({
      seed: 5,
      playerCount: 2,
      autoEndTurn: false,
      allowUndo: true,
      bundle: {},
      autosavePath: `${process.cwd()}/saves/__test__.json`,
      debounceMs: 50_000,
    });
    const a = attach(host, "client-a");
    attach(host, "client-b");

    // Host is the first attached client (a).
    host.handleSetPlayerCount("client-a", 4);
    const lobby = lastOfType(a, "LOBBY_STATE");
    expect(lobby?.lobby.playerCount).toBe(4);
    expect(lobby?.lobby.seats).toHaveLength(4);
    // All seats unclaimed after a resize.
    expect(lobby?.lobby.seats.every((s) => s.claimedBy === null)).toBe(true);
  });

  it("non-host attempting setPlayerCount gets an ERROR", () => {
    const host = new HostGame({
      seed: 5,
      playerCount: 2,
      autoEndTurn: false,
      allowUndo: true,
      bundle: {},
      autosavePath: `${process.cwd()}/saves/__test__.json`,
      debounceMs: 50_000,
    });
    attach(host, "client-a"); // host
    const b = attach(host, "client-b");
    host.handleSetPlayerCount("client-b", 4);
    const err = lastOfType(b, "ERROR");
    expect(err?.message).toMatch(/only the host/i);
  });

  it("rejects intents from non-seat-holders", () => {
    const host = new HostGame({
      seed: 5,
      playerCount: 2,
      autoEndTurn: false,
      allowUndo: true,
      bundle: {},
      autosavePath: `${process.cwd()}/saves/__test__.json`,
      debounceMs: 50_000,
    });
    const a = attach(host, "client-a");
    const b = attach(host, "client-b");
    host.handleClaimSeat("client-a", 0, "Alice", "red");
    host.handleClaimSeat("client-b", 1, "Bob", "yellow");
    host.handleStartGame("client-a");

    // Have client-b try to act as seat 0 (Alice's seat).
    host.handleIntent("client-b", { type: "PASS", playerId: 0, cardIndex: 0 });
    const rejected = lastOfType(b, "ERROR");
    expect(rejected?.message).toMatch(/seat 0 is not held by you/);
    // No INTENT_ACCEPTED should have been broadcast.
    expect(lastOfType(a, "INTENT_ACCEPTED")).toBeUndefined();
  });
});
