// =============================================================================
// PlatformApp — the entry point the In My Pocket platform mounts when
// `tableMeta.status === "playing"`.
//
// Minimal v1: shows the viewer their seat, money, VPs, hand, and exposes
// the two action buttons that don't need a wizard (Pass and End turn).
// The full board / panels / wizard UI will land in a follow-up; this is
// a vertical slice that proves the platform→game seam works.
// =============================================================================

import { useEffect, useState, type ReactNode } from "react";
import type { PlayerView } from "../engine";
import type {
  PlayingEnvelope,
  ServerMessage as GameServerMessage,
} from "../shared/protocol";

// ---------------------------------------------------------------------------
// The context the platform shell hands to the game.
// ---------------------------------------------------------------------------

export interface PlatformGameContext {
  readonly userId: string;
  readonly tableId: string;
  readonly hostUserId: string;
  /** Send a game-protocol payload. The shell wraps it in GAME_MSG. */
  send(payload: unknown): void;
  /** Subscribe to game-protocol payloads (the inside of GAME_MSG_OUT). */
  subscribe(cb: (payload: unknown) => void): () => void;
}

interface Props {
  readonly ctx: PlatformGameContext;
}

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

export default function PlatformApp({ ctx }: Props): ReactNode {
  const [envelope, setEnvelope] = useState<PlayingEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return ctx.subscribe((payload) => {
      const msg = payload as GameServerMessage;
      switch (msg.type) {
        case "SNAPSHOT":
        case "STATE":
          setEnvelope(msg.playing);
          setError(null);
          break;
        case "INTENT_REJECTED":
          setError(`Rejected: ${msg.reason}`);
          break;
        case "ERROR":
          setError(msg.message);
          break;
        case "PAUSED":
          setEnvelope((prev) =>
            prev ? { ...prev, paused: msg.paused } : prev,
          );
          break;
      }
    });
  }, [ctx]);

  if (!envelope) {
    return (
      <div className="ci-platform">
        <p>Waiting for the first snapshot…</p>
      </div>
    );
  }

  const { view, viewerPlayerId, paused, canUndoNow } = envelope;
  const myPlayer = viewerPlayerId >= 0 ? view.players[viewerPlayerId] : null;
  const activePlayerId = view.turnOrder[view.currentPlayerIndex];
  const isMyTurn = activePlayerId !== undefined && activePlayerId === viewerPlayerId;

  const sendIntent = (intent: { type: string; playerId: number; [k: string]: unknown }): void => {
    ctx.send({ type: "INTENT", intent });
  };

  return (
    <div className="ci-platform">
      <header className="ci-platform__head">
        <strong>Era {view.era}</strong>
        <span> · Round {view.round}</span>
        <span> · Phase {view.phase}</span>
        {paused && <span className="ci-platform__paused"> · PAUSED</span>}
      </header>

      <section>
        <h3>You</h3>
        {myPlayer ? (
          <PlayerSummary view={view} playerId={viewerPlayerId} isActive={isMyTurn} />
        ) : (
          <p>You're spectating.</p>
        )}
      </section>

      <section>
        <h3>Other players</h3>
        <ul className="ci-platform__opponents">
          {view.players.map((p, i) => {
            if (i === viewerPlayerId) return null;
            return (
              <li key={i}>
                <PlayerSummary view={view} playerId={i} isActive={i === activePlayerId} />
              </li>
            );
          })}
        </ul>
      </section>

      {myPlayer && (
        <section>
          <h3>Your hand ({myPlayer.hand.length})</h3>
          <ul className="ci-platform__hand">
            {myPlayer.hand.map((card, i) => (
              <li key={i}>
                {card.kind === "HIDDEN" ? "(hidden)" : describeCard(card as { kind: string } & Record<string, unknown>)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isMyTurn && myPlayer && (
        <section className="ci-platform__actions">
          <h3>Your turn — actions left: {view.actionsRemaining}</h3>
          {myPlayer.hand.length > 0 && (
            <button
              onClick={() =>
                sendIntent({ type: "PASS", playerId: viewerPlayerId, cardIndex: 0 })
              }
            >
              Pass (discard hand[0])
            </button>
          )}
          <button
            onClick={() =>
              sendIntent({ type: "END_TURN", playerId: viewerPlayerId })
            }
          >
            End turn
          </button>
          {canUndoNow && (
            <button onClick={() => ctx.send({ type: "UNDO" })}>Undo</button>
          )}
        </section>
      )}

      {error && <div className="ci-platform__error">{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function PlayerSummary({
  view,
  playerId,
  isActive,
}: {
  view: PlayerView;
  playerId: number;
  isActive: boolean;
}): ReactNode {
  const p = view.players[playerId];
  if (!p) return null;
  return (
    <div>
      <strong>
        {p.displayName} ({p.pawnColor})
      </strong>
      {isActive && <span className="ci-platform__active"> · ACTIVE</span>}
      <div>£{p.money} · VP {p.vp} · Income step {p.incomeStep}</div>
    </div>
  );
}

function describeCard(card: { kind: string } & Record<string, unknown>): string {
  if (card.kind === "LOCATION") return `Loc: ${String(card["city"])}`;
  if (card.kind === "INDUSTRY") return `Ind: ${String(card["industry"])}`;
  if (card.kind === "WILD_LOCATION") return "Wild Loc";
  if (card.kind === "WILD_INDUSTRY") return "Wild Ind";
  return card.kind;
}
