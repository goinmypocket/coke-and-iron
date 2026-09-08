// =============================================================================
// Session-level tests. Drives CokeAndIronSession through claim → start →
// intent dispatch → save/load round-trip without a real platform.
// =============================================================================
import { describe, expect, it } from "vitest";
import { asTableId, asUserId, type UserId } from "../../shared/ids";
import {
  CokeAndIronSession,
  createFromOpts,
  loadFromOpts,
  type CokeAndIronSave,
} from "../../server/CokeAndIronSession";
import type { ServerMessage as GameServerMessage } from "../../shared/protocol";

function makeSession(hostUserId: UserId): CokeAndIronSession {
  return createFromOpts({
    tableId: asTableId("table-1"),
    hostUserId,
    options: { seed: 42, autoEndTurn: false, allowUndo: true },
  });
}

interface Recorder {
  msgs: GameServerMessage[];
  send: (m: unknown) => void;
}
function makeRecorder(): Recorder {
  const msgs: GameServerMessage[] = [];
  return { msgs, send: (m) => msgs.push(m as GameServerMessage) };
}

describe("atomic inactive-seat transfer", () => {
  const playing = (rec: Recorder) => {
    const message = rec.msgs.filter(m => m.type === "SNAPSHOT").at(-1);
    if (!message || message.type !== "SNAPSHOT") throw new Error("Missing snapshot");
    return message.playing;
  };
  it("preserves the engine position and hand while only the new holder can act", () => {
    const host = asUserId("host"), old = asUserId("old"), next = asUserId("next");
    const s = makeSession(host);
    s.claimSeat(old, 0, { displayName: "Original" }); s.claimSeat(host, 1);
    s.startGame(host);
    const oldView = makeRecorder(), hostView = makeRecorder(), newView = makeRecorder();
    s.attachConnection(old, oldView.send); s.attachConnection(host, hostView.send); s.attachConnection(next, newView.send);
    const state = playing(oldView).view, active = state.turnOrder[state.currentPlayerIndex]!;
    const previous = active === 0 ? old : host, previousView = active === 0 ? oldView : hostView;
    const before = s.serialize(), hand = playing(previousView).view.myHand;
    expect(s.transferSeat(next, active, previous)).toEqual({ ok: true });
    expect(s.serialize()).toEqual(before);
    expect(playing(newView).actualSeatId).toBe(active);
    expect(playing(newView).view.myHand).toEqual(hand);
    expect(playing(previousView).actualSeatId).toBe(-1);
    s.handleGameMessage(previous, { type: "INTENT", intent: { type: "PASS", playerId: active, cardIndex: 0 } });
    expect(s.serialize().intentLog).toEqual(before.intentLog);
    s.handleGameMessage(next, { type: "INTENT", intent: { type: "PASS", playerId: active, cardIndex: 0 } });
    expect(s.serialize().intentLog.length).toBe(before.intentLog.length + 1);
  });
  it("leaves claims untouched on stale or unused targets and switches an existing holder atomically", () => {
    const host = asUserId("host"), other = asUserId("other");
    const s = makeSession(host); s.claimSeat(host, 0); s.claimSeat(other, 1); s.startGame(host);
    const a = makeRecorder(), b = makeRecorder(); s.attachConnection(host, a.send); s.attachConnection(other, b.send);
    const before = s.serialize(), otherHand = playing(b).view.myHand;
    expect(s.transferSeat(host, 1, asUserId("stale")).ok).toBe(false);
    expect(s.transferSeat(host, 2, null).ok).toBe(false);
    expect(playing(a).actualSeatId).toBe(0); expect(playing(b).actualSeatId).toBe(1);
    expect(s.transferSeat(host, 1, other).ok).toBe(true);
    expect(s.serialize()).toEqual(before);
    expect(playing(a).actualSeatId).toBe(1); expect(playing(a).view.myHand).toEqual(otherHand);
    expect(playing(b).actualSeatId).toBe(-1);
    expect(s.describe().playerCount).toBe(2); // Both engine positions still exist.
    expect(s.claimSeat(other, 0).ok).toBe(true); // The previous position is free.
  });
});

describe("CokeAndIronSession lobby", () => {
  it("only the host can start", () => {
    const host = asUserId("host");
    const other = asUserId("other");
    const s = makeSession(host);
    expect(s.startGame(other).ok).toBe(false);
  });

  it("requires 2-4 seats to start", () => {
    const host = asUserId("host");
    const s = makeSession(host);
    // No claims -> error
    const r0 = s.startGame(host);
    expect(r0.ok).toBe(false);
    if (!r0.ok) expect(r0.reason).toMatch(/2.4 players/);

    // Two claims with auto-assigned identity -> startable.
    s.claimSeat(host, 0, { displayName: "Host" });
    s.claimSeat(asUserId("p2"), 1, { displayName: "Bob" });
    const r1 = s.startGame(host);
    expect(r1.ok).toBe(true);
  });

  it("rejects duplicate names and colors", () => {
    const host = asUserId("host");
    const s = makeSession(host);
    s.claimSeat(host, 0);
    s.claimSeat(asUserId("p2"), 1);
    const rec = makeRecorder();
    s.attachConnection(asUserId("p2"), rec.send);
    s.handleGameMessage(host, {
      type: "SET_SEAT_IDENTITY",
      slotIndex: 0,
      displayName: "Alice",
      pawnColor: "red",
    });
    s.handleGameMessage(asUserId("p2"), {
      type: "SET_SEAT_IDENTITY",
      slotIndex: 1,
      displayName: "Alice",
      pawnColor: "blue",
    });
    const errors = rec.msgs.filter((m) => m.type === "ERROR");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("broadcasts LOBBY_STATE on attach + claim", () => {
    const host = asUserId("host");
    const s = makeSession(host);
    const rec = makeRecorder();
    s.attachConnection(host, rec.send);
    expect(rec.msgs[0]?.type).toBe("LOBBY_STATE");
    s.claimSeat(host, 0);
    expect(rec.msgs.length).toBeGreaterThanOrEqual(2);
    const last = rec.msgs[rec.msgs.length - 1]!;
    expect(last.type).toBe("LOBBY_STATE");
    if (last.type === "LOBBY_STATE") {
      expect(last.lobby.seats[0]?.claimedBy).toBe(host);
    }
  });
});

describe("CokeAndIronSession play", () => {
  it("sends SNAPSHOT on attach when game is in progress", () => {
    const host = asUserId("host");
    const p2 = asUserId("p2");
    const s = makeSession(host);
    s.claimSeat(host, 0);
    s.claimSeat(p2, 1);
    s.handleGameMessage(host, {
      type: "SET_SEAT_IDENTITY",
      slotIndex: 0,
      displayName: "Host",
      pawnColor: "red",
    });
    s.handleGameMessage(p2, {
      type: "SET_SEAT_IDENTITY",
      slotIndex: 1,
      displayName: "Bob",
      pawnColor: "blue",
    });
    expect(s.startGame(host).ok).toBe(true);
    const rec = makeRecorder();
    s.attachConnection(host, rec.send);
    expect(rec.msgs[0]?.type).toBe("SNAPSHOT");
  });

  it("rejects intents from a user who doesn't hold the seat", () => {
    const host = asUserId("host");
    const p2 = asUserId("p2");
    const s = makeSession(host);
    s.claimSeat(host, 0);
    s.claimSeat(p2, 1);
    s.handleGameMessage(host, {
      type: "SET_SEAT_IDENTITY",
      slotIndex: 0,
      displayName: "Host",
      pawnColor: "red",
    });
    s.handleGameMessage(p2, {
      type: "SET_SEAT_IDENTITY",
      slotIndex: 1,
      displayName: "Bob",
      pawnColor: "blue",
    });
    s.startGame(host);

    const rec = makeRecorder();
    s.attachConnection(p2, rec.send);
    rec.msgs.length = 0;
    // p2 holds PlayerId 1 (slot 1), but tries to dispatch as PlayerId 0.
    s.handleGameMessage(p2, {
      type: "INTENT",
      intent: { kind: "PASS", playerId: 0 } as unknown as never,
    });
    const err = rec.msgs.find((m) => m.type === "ERROR");
    expect(err).toBeTruthy();
  });
});

describe("CokeAndIronSession persistence", () => {
  it("serializes a lobby and loads it back into a lobby", () => {
    const host = asUserId("host");
    const s1 = makeSession(host);
    s1.claimSeat(host, 0);
    s1.claimSeat(asUserId("p2"), 1);
    s1.handleGameMessage(host, {
      type: "SET_SEAT_IDENTITY",
      slotIndex: 0,
      displayName: "Alice",
      pawnColor: "red",
    });
    const blob: CokeAndIronSave = s1.serialize();
    expect(blob.status).toBe("lobby");
    expect(blob.seatIdentities.find((s) => s.slotIndex === 0)?.displayName).toBe(
      "Alice",
    );

    const s2 = loadFromOpts(blob, {
      tableId: asTableId("table-2"),
      hostUserId: host,
      options: {},
    });
    const rec = makeRecorder();
    s2.attachConnection(host, rec.send);
    const lobby = rec.msgs[0];
    expect(lobby?.type).toBe("LOBBY_STATE");
    if (lobby?.type === "LOBBY_STATE") {
      // Identity preserved, claimedBy reset (users must re-claim).
      expect(lobby.lobby.seats[0]?.displayName).toBe("Alice");
      expect(lobby.lobby.seats[0]?.claimedBy).toBe(null);
      expect(lobby.lobby.fromSave).toBe(true);
    }
  });

  it("serialize → load → start replays cleanly", () => {
    const host = asUserId("host");
    const p2 = asUserId("p2");
    const s1 = makeSession(host);
    s1.claimSeat(host, 0);
    s1.claimSeat(p2, 1);
    s1.handleGameMessage(host, {
      type: "SET_SEAT_IDENTITY",
      slotIndex: 0,
      displayName: "Alice",
      pawnColor: "red",
    });
    s1.handleGameMessage(p2, {
      type: "SET_SEAT_IDENTITY",
      slotIndex: 1,
      displayName: "Bob",
      pawnColor: "blue",
    });
    expect(s1.startGame(host).ok).toBe(true);
    const blob = s1.serialize();
    expect(blob.status).toBe("playing");

    // Load into new session — players re-claim, host starts.
    const s2 = loadFromOpts(blob, {
      tableId: asTableId("table-3"),
      hostUserId: host,
      options: {},
    });
    s2.claimSeat(host, 0);
    s2.claimSeat(p2, 1);
    expect(s2.startGame(host).ok).toBe(true);
    // describe should report "playing" again
    expect(s2.describe().status).toBe("playing");
    expect(s2.describe().playerCount).toBe(2);
  });
});

describe("CokeAndIronSession kick + reclaim", () => {
  it("kicked seat can be reclaimed by another user", () => {
    const host = asUserId("host");
    const p2 = asUserId("p2");
    const p3 = asUserId("p3");
    const s = makeSession(host);
    s.claimSeat(host, 0);
    s.claimSeat(p2, 1);
    s.handleGameMessage(host, {
      type: "SET_SEAT_IDENTITY",
      slotIndex: 0,
      displayName: "Alice",
      pawnColor: "red",
    });
    s.handleGameMessage(p2, {
      type: "SET_SEAT_IDENTITY",
      slotIndex: 1,
      displayName: "Bob",
      pawnColor: "blue",
    });
    s.startGame(host);

    expect(s.kickSeat(host, 1).ok).toBe(true);
    // p3 reclaims slot 1
    expect(s.claimSeat(p3, 1).ok).toBe(true);
  });

  it("cannot create a new seat after game has started", () => {
    const host = asUserId("host");
    const p2 = asUserId("p2");
    const s = makeSession(host);
    s.claimSeat(host, 0);
    s.claimSeat(p2, 1);
    s.handleGameMessage(host, {
      type: "SET_SEAT_IDENTITY",
      slotIndex: 0,
      displayName: "Alice",
      pawnColor: "red",
    });
    s.handleGameMessage(p2, {
      type: "SET_SEAT_IDENTITY",
      slotIndex: 1,
      displayName: "Bob",
      pawnColor: "blue",
    });
    s.startGame(host);
    // slot 2 was never a player; rejecting a mid-game claim there is correct
    expect(s.claimSeat(asUserId("p3"), 2).ok).toBe(false);
  });
});
