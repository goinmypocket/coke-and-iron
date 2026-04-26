// =============================================================================
// ViewerBanner — single thin row at the top of the play area showing the
// viewer's identity (name + pawn colour) and whose turn it currently is.
//
// Pulled out of HandPanel so the hand area itself can be chrome-less:
// "this is your hand" is conveyed by location on screen, not by a label.
// =============================================================================
import { useMySeatId } from "../hooks/EngineProvider";
import { shallowEqual, useGameState } from "../hooks/useGameState";

export function ViewerBanner() {
  const mySeatId = useMySeatId();
  const view = useGameState(
    (s) => {
      const me =
        mySeatId !== null ? s.players.find((p) => p.id === mySeatId) : null;
      const activeId = s.turnOrder[s.currentPlayerIndex] ?? null;
      const active =
        activeId !== null ? s.players.find((p) => p.id === activeId) : null;
      const isMyTurn = activeId !== null && activeId === mySeatId;
      return {
        myName: me?.displayName ?? null,
        myColor: me?.pawnColor ?? null,
        activeName: active?.displayName ?? null,
        activeColor: active?.pawnColor ?? null,
        isMyTurn,
      };
    },
    shallowEqual,
  );

  if (mySeatId === null || view.myName === null) {
    return (
      <div className="viewer-banner viewer-banner--unseated">
        <span>Spectating — no seat claimed</span>
      </div>
    );
  }

  return (
    <div className="viewer-banner">
      <span
        className="viewer-banner__chip"
        style={{ background: pawnSwatch(view.myColor) }}
      >
        {view.myName}
      </span>
      <span className="viewer-banner__status">
        {view.isMyTurn ? (
          <strong>Your turn</strong>
        ) : view.activeName ? (
          <>
            Waiting for{" "}
            <span
              className="viewer-banner__active"
              style={{ color: pawnSwatch(view.activeColor) }}
            >
              {view.activeName}
            </span>
          </>
        ) : (
          <em>Waiting…</em>
        )}
      </span>
    </div>
  );
}

function pawnSwatch(color: string | null): string {
  switch (color) {
    case "red":
      return "#c14040";
    case "yellow":
      return "#d8b444";
    case "green":
      return "#3f8f5a";
    case "blue":
      return "#3a6ea5";
    case "purple":
      return "#7a4a8d";
    case "teal":
      return "#3a8b9c";
    default:
      return "var(--muted)";
  }
}
