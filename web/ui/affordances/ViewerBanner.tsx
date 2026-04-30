// =============================================================================
// ViewerBanner — slim spectator-only picker that lets unseated viewers
// pick which player's perspective to render (their hand becomes visible
// in the HandPanel below).
//
// For SEATED players this component renders nothing — whose-turn is now
// surfaced by PromptStrip, and the platform top-nav already shows the
// signed-in user's identity, so an in-game "name holder" row is just
// noise that drifts out of date when seats swap mid-game.
// =============================================================================
import { useEffect, useState } from "react";
import { shallowEqual, useGameState } from "../hooks/useGameState";

interface Props {
  /** True when this user has no real seat. Drives the picker UI. */
  readonly isSpectator?: boolean;
  /** Currently-viewed seat id for spectators (null = no override). The
   *  highlight tracks this *plus* any pending click that hasn't yet
   *  round-tripped through the host — so the chip lights up instantly
   *  on the first click instead of waiting for a SNAPSHOT. */
  readonly viewedSeatId?: number | null;
  readonly onPickSpectatorView?: (seatId: number | null) => void;
}

export function ViewerBanner({
  isSpectator = false,
  viewedSeatId = null,
  onPickSpectatorView,
}: Props) {
  // Optimistic "I just clicked this chip" state. Reset whenever the
  // server-confirmed view catches up, so a stale pending value can't
  // hide the real selection if the host overrules the request.
  const [pendingSeat, setPendingSeat] = useState<number | null>(null);
  useEffect(() => {
    if (pendingSeat !== null && viewedSeatId === pendingSeat) {
      setPendingSeat(null);
    }
  }, [viewedSeatId, pendingSeat]);

  const players = useGameState(
    (s) =>
      s.players.map((p) => ({
        id: p.id,
        name: p.displayName,
        color: p.pawnColor,
      })),
    shallowEqual,
  );

  if (!isSpectator) return null;

  const visualSeat = pendingSeat !== null ? pendingSeat : viewedSeatId;
  return (
    <div className="viewer-banner viewer-banner--unseated">
      <span className="viewer-banner__spectator-picker">
        <span className="viewer-banner__label">Spectating —</span>
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            className={
              "viewer-banner__chip" +
              (visualSeat === p.id ? " viewer-banner__chip--active" : "")
            }
            style={{ background: pawnSwatch(p.color) }}
            onClick={() => {
              setPendingSeat(p.id);
              onPickSpectatorView?.(p.id);
            }}
            title={`View ${p.name}'s hand`}
          >
            {p.name}
          </button>
        ))}
        {visualSeat !== null && (
          <button
            type="button"
            className="viewer-banner__clear"
            onClick={() => {
              setPendingSeat(null);
              onPickSpectatorView?.(null);
            }}
            title="Stop viewing as a specific player"
          >
            clear
          </button>
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
