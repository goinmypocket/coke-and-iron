// Integration test: drive HostGame through a lobby + a few intents and
// verify two simulated clients converge on the same engine state.
//
// We don't open a real WebSocket — we just connect the HostGame's
// per-client send callback to a list of received messages, then feed
// outbound C2S messages through the host's handlers directly. This
// covers the host-side state machine end-to-end without spinning up a
// network.
import { describe, expect, it } from "vitest";
import { HostGame } from "../../server/HostGame";
import type { ServerMessage } from "../../shared/protocol";

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
    expect(snapA?.playing.view.playerCount).toBe(2);
    expect(snapA?.seats[0]?.displayName).toBe("Alice");

    // Read the active seat directly from the snapshot view — no need
    // to rebuild a mirror since the view already carries turn order.
    const aView = snapA!.playing.view;
    const activeSeat = aView.turnOrder[aView.currentPlayerIndex]!;
    const activeClient = activeSeat === 0 ? "client-a" : "client-b";

    host.handleIntent(activeClient, {
      type: "PASS",
      playerId: activeSeat,
      cardIndex: 0,
    });

    // Both clients should see a STATE update with the intent as cause.
    const stateA = lastOfType(a, "STATE");
    const stateB = lastOfType(b, "STATE");
    expect(stateA?.cause.kind).toBe("intent");
    expect(stateB?.cause.kind).toBe("intent");
    if (stateA?.cause.kind === "intent") {
      expect(stateA.cause.originator).toBe(activeClient);
      expect(stateA.cause.intent).toEqual({
        type: "PASS",
        playerId: activeSeat,
        cardIndex: 0,
      });
    }
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

  it("issues seat tokens at game start and allows reclaim via RESUME", () => {
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
    host.handleClaimSeat("client-a", 0, "Alice", "red");
    host.handleClaimSeat("client-b", 1, "Bob", "yellow");
    host.handleStartGame("client-a");

    const snap = lastOfType(a, "SNAPSHOT");
    expect(snap?.seatToken).toBeTruthy();
    const tokenForA = snap!.seatToken!;
    // The token also lives on the host so a fresh connection can
    // resume by presenting it.
    expect(host.getSeatToken(0)).toBe(tokenForA);

    // Simulate Alice's connection dropping and a brand-new connection
    // ("client-a2") arriving with her token. The seat should transfer.
    host.detachConnection("client-a");
    const a2 = attach(host, "client-a2");
    host.handleResume("client-a2", tokenForA);

    const resumed = lastOfType(a2, "RESUMED");
    expect(resumed?.seatId).toBe(0);
    // Now client-a2 can act on seat 0.
    const activeSeat =
      host["engine"]?.getState().turnOrder[
        host["engine"]?.getState().currentPlayerIndex ?? 0
      ];
    if (activeSeat === 0) {
      host.handleIntent("client-a2", {
        type: "PASS",
        playerId: 0,
        cardIndex: 0,
      });
      expect(lastOfType(a2, "INTENT_REJECTED")).toBeUndefined();
    }
  });

  it("rejects RESUME when the token doesn't match any seat", () => {
    const host = new HostGame({
      seed: 1,
      playerCount: 2,
      autoEndTurn: false,
      allowUndo: true,
      bundle: {},
      autosavePath: `${process.cwd()}/saves/__test__.json`,
      debounceMs: 50_000,
    });
    const a = attach(host, "client-a");
    host.handleResume("client-a", "garbage-token");
    expect(lastOfType(a, "ERROR")?.message).toMatch(/not recognised/);
  });

  it("emits a per-recipient redacted STATE on accepted intents", () => {
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

    // Game-start emits SNAPSHOT (not STATE). After dispatching an
    // intent, every client gets a STATE update. Verify both surfaces
    // carry per-recipient redacted views.
    const snapA = lastOfType(a, "SNAPSHOT");
    const snapB = lastOfType(b, "SNAPSHOT");
    expect(snapA).toBeTruthy();
    expect(snapB).toBeTruthy();

    const aView = snapA!.playing.view;
    const bView = snapB!.playing.view;
    expect(aView.viewerSeatId).toBe(0);
    expect(bView.viewerSeatId).toBe(1);
    // Each viewer's own seat carries real cards.
    expect(aView.players[0]?.hand[0]?.kind).not.toBe("HIDDEN");
    expect(bView.players[1]?.hand[0]?.kind).not.toBe("HIDDEN");
    // The other seat's cards are HIDDEN placeholders.
    for (const c of aView.players[1]?.hand ?? []) expect(c.kind).toBe("HIDDEN");
    for (const c of bView.players[0]?.hand ?? []) expect(c.kind).toBe("HIDDEN");
    // drawDeck arrives as an array of HIDDEN placeholders — count
    // matches reality, contents reveal nothing.
    expect(aView.drawDeckCount).toBeGreaterThan(0);
    for (const c of aView.drawDeck) expect(c.kind).toBe("HIDDEN");
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
    // No state-update broadcast should have happened (only the
    // initial post-START snapshot).
    const aStates = a.inbox.filter(
      (m): m is Extract<ServerMessage, { type: "STATE" }> => m.type === "STATE",
    );
    // Exactly the START_GAME's snapshot STATE — nothing more.
    expect(aStates.length).toBeLessThanOrEqual(1);
  });
});
