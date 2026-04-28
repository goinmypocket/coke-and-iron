import { describe, expect, it } from "vitest";
import { Engine } from "../../engine/Engine";
import {
  buildSaveFile,
  parseSaveFile,
  resolveBundle,
  serializeSave,
  SaveFileError,
  SAVE_VERSION,
} from "../../shared/saveFile";

describe("save file roundtrip", () => {
  function snapshotState(engine: Engine): unknown {
    const { rng: _rng, ...rest } = engine.getState() as unknown as Record<
      string,
      unknown
    >;
    return JSON.parse(JSON.stringify(rest));
  }

  it("replays an unmodified game from a save", () => {
    const seats = [
      { displayName: "A", pawnColor: "red" },
      { displayName: "B", pawnColor: "yellow" },
      { displayName: "C", pawnColor: "green" },
    ];
    const bundle = resolveBundle({}, seats);
    const original = new Engine({ seed: 7, playerCount: 3 }, bundle);
    const seat = original.getState().turnOrder[original.getState().currentPlayerIndex]!;
    original.dispatch({ type: "PASS", playerId: seat, cardIndex: 0 });
    const save = buildSaveFile({
      createdAt: "2026-04-26T00:00:00Z",
      seed: 7,
      playerCount: 3,
      autoEndTurn: false,
      allowUndo: true,
      bundle,
      intentLog: original.getIntentLog(),
      seatTokens: ["t-a", "t-b", "t-c"],
    });

    const json = serializeSave(save);
    const parsed = parseSaveFile(json);
    expect(parsed.version).toBe(SAVE_VERSION);
    expect(parsed.intentLog).toHaveLength(original.getIntentLog().length);

    const replayed = new Engine(
      {
        seed: parsed.seed,
        playerCount: parsed.playerCount,
        autoEndTurn: parsed.autoEndTurn,
        allowUndo: parsed.allowUndo,
      },
      parsed.bundle,
    );
    for (const intent of parsed.intentLog) {
      const r = replayed.dispatch(intent);
      expect(r.ok).toBe(true);
    }
    expect(snapshotState(replayed)).toEqual(snapshotState(original));
  });

  it("preserves per-seat displayName + pawnColor through save → load", () => {
    const seats = [
      { displayName: "Alice", pawnColor: "purple" },
      { displayName: "Bob", pawnColor: "teal" },
    ];
    const bundle = resolveBundle({}, seats);
    const save = buildSaveFile({
      createdAt: new Date().toISOString(),
      seed: 1,
      playerCount: 2,
      autoEndTurn: false,
      allowUndo: true,
      bundle,
      intentLog: [],
      seatTokens: ["t-alice", "t-bob"],
    });
    const parsed = parseSaveFile(serializeSave(save));
    const engine = new Engine(
      { seed: parsed.seed, playerCount: parsed.playerCount },
      parsed.bundle,
    );
    expect(engine.getState().players[0]!.displayName).toBe("Alice");
    expect(engine.getState().players[0]!.pawnColor).toBe("purple");
    expect(engine.getState().players[1]!.displayName).toBe("Bob");
    expect(engine.getState().players[1]!.pawnColor).toBe("teal");
  });

  it("rejects malformed JSON with SaveFileError", () => {
    expect(() => parseSaveFile("{not json")).toThrow(SaveFileError);
  });

  it("rejects schema-invalid saves with SaveFileError", () => {
    expect(() => parseSaveFile(JSON.stringify({ version: 99 }))).toThrow(
      SaveFileError,
    );
  });
});
