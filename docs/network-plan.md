# Network layer — plan

How we get from today's loopback engine to "host on your laptop, friends
connect from anywhere, pause and resume across days." Designed so the
same code works unchanged when the host later moves to a real server.

---

## What you already have

The codebase is well-shaped for this; we are not starting from scratch.

- **`Engine`** is headless and event-sourced. Every accepted dispatch is
  appended to an internal `intentLog`. State at any moment is a pure
  function of `(seed, EngineConfigBundle, playerCount, intentLog)`.
  See `src/engine/Engine.ts:21`.
- **`Transport`** (`src/network/Transport.ts:3`) is a tiny interface —
  `send(intent)` + `onReceive(cb)`. Today only `LoopbackTransport`
  exists; a WebSocket implementation slots in with no engine changes.
- **`NetworkAdapter`** (`src/network/NetworkAdapter.ts:5`) already wires
  any transport into the engine.
- **`initialState`** is deterministic from `EngineConfigBundle` +
  `seed` + `playerCount` (`src/engine/initialState.ts:73`).

The work below is mostly *new modules around the engine*, not changes
to engine internals.

---

## Architecture in one paragraph

A small Node "host" process owns the authoritative `Engine` instance,
persists saves to disk, and exposes a WebSocket endpoint. Each browser
client (including yours) opens that WebSocket and talks via a thin
**`WebSocketTransport`** that satisfies the same `Transport` interface
as today. Clients send `Intent`s; the host validates by dispatching
them through its own engine and broadcasts the accepted intent (plus
state metadata) back to all clients. Clients keep a local read-only
mirror by re-dispatching the broadcast intents into their own engine,
so the React UI stays exactly as it is. Lobby concerns (seat claim,
name, color, save selection) live in a separate pre-game state machine
that runs on the host — they're not engine intents.

Server-authoritative, not peer-to-peer. Cleaner, debuggable, and the
same shape whether "host" is your laptop or a deployed server later.

---

## Decisions you need to make first

These are choices only you can make. Once these are settled I can
implement the rest in one pass.

1. **Remote-access mechanism.** Three viable options for "friends
   connecting to my local machine":
   - **Cloudflare Tunnel** (recommended): free, no port-forwarding,
     stable URL like `brass.<your>.trycloudflare.com`. Friends paste
     it into the browser. Easy to revoke.
   - **Tailscale**: zero-config VPN; friends install Tailscale and you
     share the machine. Highest privacy, requires friends to install.
   - **Router port-forward + DDNS**: classic, no extra software, but
     exposes a port on your home IP and needs router config.

   Default unless you say otherwise: **Cloudflare Tunnel**.

2. **How clients claim seats.** Two flavors:
   - **Open lobby** — first N to connect each pick name+color+seat,
     then host starts. Simple; assumes trust.
   - **Pre-assigned invite tokens** — host generates one token per
     seat, shares each link privately, only that token can claim that
     seat. Slightly more setup, prevents drive-bys.

   Default: **open lobby with a host "lock" button** before start.

3. **Reconnect policy.** When a client drops mid-game, do we (a) pause
   the game, (b) keep going and let them rejoin into the same seat
   when they come back, or (c) allow the host to take over their
   seat? Default: **(b)**, with the host able to manually pause from
   a button in the host UI.

4. **Save-file location.** A folder on the host machine, e.g.
   `./saves/<game-name>.json`. Anything else? (Cloud sync, etc. is
   out of scope.) Default: local folder.

5. **Player count UX.** Host picks player count *before* opening the
   lobby (lobby shows N seat slots). Or host opens an empty lobby and
   sets count once everyone is in. Default: **picks first**, simpler.

If any default is wrong, tell me and I'll adjust before we build.

---

## What gets built

### 1. Save file format
A single JSON document, versioned. Captures everything needed to rebuild
the engine deterministically plus the lobby identities.

```jsonc
{
  "version": 1,
  "createdAt": "2026-04-26T12:00:00Z",
  "savedAt":   "2026-04-26T13:42:11Z",
  "seed": 1,
  "playerCount": 3,
  "bundle": { /* EngineConfigBundle: tiles/cards/cities/links */ },
  "seats": [
    { "id": 0, "displayName": "Alice", "pawnColor": "red"    },
    { "id": 1, "displayName": "Bob",   "pawnColor": "yellow" },
    { "id": 2, "displayName": "Cara",  "pawnColor": "green"  }
  ],
  "intentLog": [ /* Intent[] */ ]
}
```

`bundle` is captured at game start so config edits later don't break
replay. `seats` carries the lobby identities (not in `EngineConfig`
today; see "Engine touch-ups" below).

### 2. Engine touch-ups (small)
- `Player.displayName` and `Player.pawnColor` already exist in
  `src/engine/initialState.ts:202`, but they're hard-coded `"Player N"`
  / fixed palette. We'll let `EngineConfigBundle` (or a new sibling
  arg) carry the per-seat identities and apply them in `initialState`.
- That's it. No reducer changes.

### 3. New modules

- `src/network/WebSocketTransport.ts` — implements `Transport` over a
  browser `WebSocket`. Sends `{type:"INTENT", intent}` frames; receives
  the same shape from the host.
- `src/network/protocol.ts` — message types shared by host and client:
  `INTENT`, `INTENT_ACCEPTED`, `INTENT_REJECTED`, `LOBBY_STATE`,
  `LOBBY_CLAIM_SEAT`, `LOBBY_START`, `SNAPSHOT` (sent on join so a
  late-arriving client can catch up without replaying from seed),
  `PAUSE`, `RESUME`.
- `host/server.ts` — Node entry point: loads optional save, owns the
  authoritative `Engine`, accepts WebSocket connections, runs the
  lobby state machine, persists saves on every accepted intent
  (debounced ~1s) and on graceful shutdown, exposes a tiny HTTP server
  for the static client bundle.
- `host/saves.ts` — read/write/list save files, schema validation.
- `host/lobby.ts` — pre-game state: list of seats, who has claimed
  what, host controls (lock, start, kick).
- `src/ui/lobby/LobbyScreen.tsx` — replaces today's hard-coded
  `new Engine({ seed: 1, playerCount: 2 })` in `App.tsx:23`. Three
  modes: **Host setup** (pick player count, optionally load a save,
  share connection URL), **Player join** (pick name + color + seat),
  **Waiting** (show who's joined, host hits Start).
- `src/ui/hooks/useNetworkClient.ts` — replaces the inline engine
  bootstrap in `App.tsx`. Owns the WebSocket lifecycle, exposes
  `{ phase: "lobby" | "playing" | "disconnected", engine, lobby,
  send }`.

### 4. App glue
- `App.tsx` switches on the network client's `phase`: lobby UI when
  joining, today's panels (`PromptStrip` / `ActionsPanel` / `BoardPanel`
  / `PlayersPanel`) once playing.
- The existing `LoopbackTransport` stays as-is for tests and for a
  "solo / hot-seat" mode (handy when you're testing the UI without
  starting the host).

### 5. Tests
- Roundtrip: write a save mid-game, kill the process, reload, replay
  intents, assert the resulting `GameState` deep-equals the pre-kill
  state.
- Protocol: client send → host accept → broadcast → second client
  applies and reaches the same state.
- Reject path: client sends a stale or invalid intent; host rejects
  with reason; client UI shows toast and stays in sync.

---

## Day-to-day workflow once it ships

**Starting a new game**

```bash
npm run host -- --port 8787
```
1. Host process prints two URLs:
   - `http://localhost:5173` — your local URL.
   - `https://<random>.trycloudflare.com` — share this with friends.
2. You open the local URL, hit **Host new game**, pick player count,
   pick your name/color, claim a seat.
3. Friends open the public URL, pick name/color, claim remaining seats.
4. You hit **Start**. Game begins. The host file `saves/current.json`
   is created and updated after every action.

**Pausing for the night**
1. Host hits **Save & shut down** in the host UI (or just `Ctrl+C`).
   The save is fsync'd on graceful exit.
2. Close everything.

**Resuming the next day**
```bash
npm run host -- --port 8787 --load saves/current.json
```
1. Host opens local URL, sees the saved seats list, claims their seat.
2. Friends open the URL, claim their original seats (matched by name).
3. Host hits **Resume**. The engine replays the intent log from the
   save, then play continues from exactly where it stopped.

**Sharing a save**
The save file is a single JSON. Copy it anywhere, send it over
Discord, commit it to a repo of "interesting positions" — anyone
running the host can load it.

---

## Why this is server-portable later

When you're ready to put this on a real server, the only things that
change are:

- `host/server.ts` runs on a VPS / Fly.io / Render instead of your
  laptop.
- The Cloudflare Tunnel URL becomes a real DNS name.
- `saves/` lives on the server's disk (or a mounted volume).
- Optionally, support multiple concurrent games (lobby per room id) —
  the per-game logic above doesn't need to change; `host/server.ts`
  grows a `Map<roomId, GameHost>`.

Nothing in `src/engine/` or `src/ui/` is server-coupled.

---

## Out of scope for this pass

- Authentication beyond the open/lock lobby. Cloudflare Tunnel + a
  tunnel password is a fine first cut.
- Spectator mode, replays-as-a-feature, in-game chat. All easy to add
  on top of the protocol above; deferring until requested.
- Multi-room hosting. Single game per host process for v1.
- Per-player chess clocks (already in `docs/roadmap.md`).
