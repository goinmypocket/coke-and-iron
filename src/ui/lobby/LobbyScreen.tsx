// =============================================================================
// LobbyScreen — pre-game UI. Shows connection status and the seat list;
// lets each connected client claim a seat (name + colour) and the host
// lock + start the game.
// =============================================================================
import { useMemo, useState } from "react";
import {
  LOBBY_COLORS,
  type LobbyColor,
  type LobbyState,
} from "../../network/protocol";
import type { ConnectionStatus } from "../../network/WebSocketClient";

export interface LobbyScreenProps {
  readonly status: ConnectionStatus;
  readonly clientId: string | null;
  readonly lobby: LobbyState | null;
  readonly onClaim: (
    seatId: number,
    displayName: string,
    pawnColor: LobbyColor,
  ) => void;
  readonly onRelease: (seatId: number) => void;
  readonly onLock: (locked: boolean) => void;
  readonly onStart: () => void;
}

export function LobbyScreen({
  status,
  clientId,
  lobby,
  onClaim,
  onRelease,
  onLock,
  onStart,
}: LobbyScreenProps) {
  if (!lobby || !clientId) {
    return (
      <div className="lobby-shell">
        <div className="lobby-card">
          <h2 className="lobby-title">Brass Birmingham</h2>
          <p className="lobby-status">Connecting to host… ({status})</p>
        </div>
      </div>
    );
  }

  const isHost = clientId === lobby.hostId;
  const allClaimed = lobby.seats.every((s) => s.claimedBy !== null);
  const mySeat = lobby.seats.find((s) => s.claimedBy === clientId) ?? null;

  return (
    <div className="lobby-shell">
      <div className="lobby-card">
        <h2 className="lobby-title">Brass Birmingham</h2>
        <p className="lobby-status">
          {status === "open" ? "Connected" : `Connection: ${status}`}
          {lobby.fromSave ? " · save loaded" : ""}
          {lobby.locked ? " · locked" : ""}
        </p>
        <ShareUrl />
        <ol className="lobby-seats">
          {lobby.seats.map((seat) => (
            <SeatRow
              key={seat.id}
              seat={seat}
              clientId={clientId}
              lockedColors={lobby.seats
                .filter((s) => s.id !== seat.id && s.pawnColor)
                .map((s) => s.pawnColor as LobbyColor)}
              fromSave={lobby.fromSave}
              locked={lobby.locked}
              onClaim={onClaim}
              onRelease={onRelease}
            />
          ))}
        </ol>
        {isHost ? (
          <div className="lobby-host-controls">
            <button
              type="button"
              className="action-btn"
              onClick={() => onLock(!lobby.locked)}
              disabled={!mySeat}
              title={lobby.locked ? "Unlock to allow more changes" : "Lock further changes before starting"}
            >
              {lobby.locked ? "Unlock lobby" : "Lock lobby"}
            </button>
            <button
              type="button"
              className="action-btn action-btn--active"
              onClick={onStart}
              disabled={!allClaimed}
              title={
                allClaimed
                  ? lobby.fromSave
                    ? "Resume the loaded game"
                    : "Begin the game"
                  : "Every seat must be claimed first"
              }
            >
              {lobby.fromSave ? "Resume game" : "Start game"}
            </button>
          </div>
        ) : (
          <p className="lobby-status">
            Waiting for the host to start the game…
          </p>
        )}
      </div>
    </div>
  );
}

function SeatRow({
  seat,
  clientId,
  lockedColors,
  fromSave,
  locked,
  onClaim,
  onRelease,
}: {
  seat: LobbyState["seats"][number];
  clientId: string;
  lockedColors: readonly LobbyColor[];
  fromSave: boolean;
  locked: boolean;
  onClaim: (id: number, name: string, color: LobbyColor) => void;
  onRelease: (id: number) => void;
}) {
  const claimed = seat.claimedBy !== null;
  const mine = seat.claimedBy === clientId;
  const initialName = mine ? seat.displayName ?? "" : seat.displayName ?? "";
  const [name, setName] = useState(initialName);
  const initialColor: LobbyColor = useMemo(() => {
    if (seat.pawnColor) return seat.pawnColor;
    const free = LOBBY_COLORS.find((c) => !lockedColors.includes(c));
    return free ?? "red";
  }, [seat.pawnColor, lockedColors]);
  const [color, setColor] = useState<LobbyColor>(initialColor);

  const canClaim = !claimed && !locked;
  const canRelease = mine && !locked;
  const colorIsForced = fromSave && seat.pawnColor !== null;
  const nameIsForced = fromSave && seat.displayName !== null;

  return (
    <li className="lobby-seat">
      <div className="lobby-seat__index">{seat.id + 1}</div>
      <div className="lobby-seat__body">
        <input
          className="lobby-seat__name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Player ${seat.id + 1}`}
          disabled={!canClaim || nameIsForced}
          maxLength={40}
        />
        <select
          className="lobby-seat__color"
          value={color}
          onChange={(e) => setColor(e.target.value as LobbyColor)}
          disabled={!canClaim || colorIsForced}
          aria-label="Pawn colour"
        >
          {LOBBY_COLORS.map((c) => {
            const taken = c !== seat.pawnColor && lockedColors.includes(c);
            return (
              <option key={c} value={c} disabled={taken}>
                {c}
                {taken ? " (taken)" : ""}
              </option>
            );
          })}
        </select>
        <span
          className="lobby-seat__swatch"
          style={{ background: colorToCss(color) }}
          aria-hidden
        />
        <div className="lobby-seat__actions">
          {canClaim ? (
            <button
              type="button"
              className="action-btn"
              onClick={() => {
                const trimmed = name.trim();
                if (!trimmed) return;
                onClaim(seat.id, trimmed, color);
              }}
              disabled={!name.trim()}
            >
              Claim
            </button>
          ) : null}
          {canRelease ? (
            <button
              type="button"
              className="action-btn action-btn--neutral"
              onClick={() => onRelease(seat.id)}
            >
              Release
            </button>
          ) : null}
          {claimed && !mine ? (
            <span className="lobby-seat__claimed">claimed</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function ShareUrl() {
  if (typeof window === "undefined") return null;
  const url = window.location.href;
  return (
    <p className="lobby-share">
      Share this URL with friends:&nbsp;
      <code>{url}</code>
    </p>
  );
}

function colorToCss(c: LobbyColor): string {
  switch (c) {
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
  }
}
