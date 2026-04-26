# Network how-to

Two parts: **Host** (you, running the game) and **Player** (your friends,
joining from anywhere). Read your half.

---

## For the host

### One-time setup

1. **Install Node 20 or newer.** Check with `node -v`.
2. **Install dependencies.**
   ```bash
   npm install
   ```
3. **Build the client once.** This produces the bundle the host will
   serve to every browser.
   ```bash
   npm run build
   ```
   Re-run after pulling code changes.

### Starting the host

```bash
npm run host
```

The host has no idea what kind of game you want to play yet — it just
opens a port and waits. Everything else (player count, fresh start vs.
resume from a save) happens **in your browser** once you connect.

You'll see a banner like this; the `players:` line reflects the
current lobby size and updates only when the process restarts (the
in-browser controls don't re-print it):

```
─────────────────────────────────────────────
 brass-birmingham host
   client:    http://localhost:8787
   websocket: ws://localhost:8787/ws
   players:   2
   autosave:  ./saves/current.json
─────────────────────────────────────────────
```

Open `http://localhost:8787` in your browser. The first client to
connect is automatically the **lobby host** and sees a configuration
row at the top of the lobby card:

- **Players: 2 / 3 / 4** — click to resize the seat list. Every
  connected browser updates immediately.
- **Load save** — dropdown of files in `./saves/`. Each entry shows
  player count, intent count, and modification time. Pick one and
  click **Load** to swap the lobby in for the save's identities (the
  seats arrive pre-filled but unclaimed; players reclaim by picking
  their seat and clicking Claim). **Refresh** re-reads the directory.
  **New game** appears once a save is loaded — click it to drop the
  save and return to a blank lobby.

When everyone has claimed a seat, the host clicks **Start game** (or
**Resume game** if a save is loaded). The board appears for everyone
simultaneously.

### Pre-seeding from the CLI (optional)

You can pre-pick the player count or auto-load a save without
opening the browser:

```bash
npm run host -- --player-count 3
npm run host -- --load saves/current.json
```

The in-browser controls still work after that — the CLI flags just
set the initial values.

> **Heads up:** in `npm run` you need the `--` separator before script
> args, otherwise npm consumes the flag itself
> (`npm run host --player-count 3` would forward only `3`). The host
> detects this case, recovers with a one-line warning, and tells you
> to use `--` next time. Both `--player-count 3` (space) and
> `--player-count=3` (equals) are accepted.

| Flag                       | Default       | What it does                                           |
| -------------------------- | ------------- | ------------------------------------------------------ |
| `--port <n>`               | `8787`        | TCP port the host listens on.                          |
| `--player-count 2\|3\|4`   | `2`           | Initial lobby size (the host can change it from the browser). |
| `--seed <int>`             | random        | RNG seed for a fresh game (deterministic setup if you reuse it). |
| `--auto-end-turn`          | off           | Auto-advance when actions hit zero.                    |
| `--no-undo`                | undo enabled  | Disable the in-turn undo button.                       |
| `--load <path>`            | none          | Auto-load a save on boot (same effect as picking it from the dropdown). |
| `-h`, `--help`             | —             | Print usage.                                           |

### Letting friends in over the internet

Your laptop only listens on `localhost` by default. To make it
reachable, start a Cloudflare Tunnel — no router config, free, gives
you a stable HTTPS URL.

**Install once:**

- Windows (winget): `winget install --id Cloudflare.cloudflared`
- macOS (brew):    `brew install cloudflared`
- Linux:           see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

**Every game, in a second terminal while the host is running:**

```bash
cloudflared tunnel --url http://localhost:8787
```

Cloudflared prints a line like:

```
+-----------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at:         |
|  https://random-words-here.trycloudflare.com              |
+-----------------------------------------------------------+
```

That URL is what your friends paste into their browsers. WebSockets
work over the tunnel automatically; no extra config.

When the game's over, Ctrl-C the tunnel terminal and the URL stops
working immediately.

> Alternative: if everyone's on the same Tailscale network, just share
> `http://<your-tailscale-name>:8787` instead.

### Playing on the same machine you're hosting from

The host process is just a backend. A browser on the same machine is
treated like any other client. Three common shapes:

**Host + remote friends (the usual case).**
You run `npm run host`, open `http://localhost:8787` in your browser,
your friends open the Cloudflare URL. You become the lobby host (only
your tab sees the **Players 2/3/4**, **Load save**, **Lock lobby**,
and **Start game** controls). Pick the player count, claim your seat,
and wait for everyone to fill in.

**Solo, all seats from one browser (testing or learning the rules).**
Run `npm run host`. Open `http://localhost:8787`, click **4** in the
Players row (or pick whatever count you want), then claim each seat
in turn — the host doesn't care that all seats trace back to one
connection. Click **Start game** and play hot-seat style; whichever
seat is active is the one whose Hand and action buttons are
interactive.

**Solo, one seat per browser tab (testing the multiplayer flow without
friends).**
Run the host. Open `http://localhost:8787` in **two separate browser
windows or two profiles** (incognito works — each window gets its own
connection and its own client id). The first window picks the player
count; each window claims its own seat. Now you're playing both sides
as if you were two people. The window that opened first is the lobby
host.

> Same machine = same network = no Cloudflare Tunnel needed.

### In the lobby

As the host:

1. (Optional) Click **Players 2 / 3 / 4** to set the seat count.
2. (Optional) Pick a save from the **Load save** dropdown and click
   **Load** to resume. Click **New game** if you change your mind.
3. Pick your own seat, type your name, pick a colour, click **Claim**.
4. Watch your friends fill in the other seats.
5. (Optional) Click **Lock lobby** once everyone's settled — prevents
   further name/colour changes and freezes the host controls.
6. Click **Start game** (or **Resume game** if a save is loaded) when
   every seat is claimed.

The host controls are disabled while the lobby is locked, so flip the
lock back off if you need to change something.

### During the game

- **You only see your own hand.** Other seats' cards never appear in
  your interface, even when it's their turn — the Hand banner stays
  on your cards and goes inert (non-clickable) on others' turns.
  (Public information like the discard pile and remaining-card counts
  *is* shown to everyone.)
- The action verbs, End Turn, and Undo are only enabled on your turn.
  On someone else's turn the buttons are greyed out.
- The autosave updates `./saves/current.json` ~1 second after each
  action. You don't need to do anything.
- Only the host can pause. (Pause UI control TBD; for now, just close
  the browser tabs and Ctrl-C the host — see below.)

### Pausing for the night

1. Hit **Ctrl-C** in the host terminal.
2. The host flushes `./saves/current.json` to disk and exits.
3. Stop the Cloudflare Tunnel too (Ctrl-C in its terminal).

Everyone disconnects. The save is intact.

### Resuming the next day

Easy path — no special CLI flags required:

1. `npm run host` (plain start).
2. Open `http://localhost:8787` in your browser.
3. In the host setup row, the **Load save** dropdown lists every
   `*.json` in `./saves/`, newest first. Pick `current.json` and
   click **Load**.
4. The lobby populates with the original names and colours
   **unclaimed**. Each player rejoins the URL and clicks **Claim**
   on their seat — they can't pick a different name or colour, the
   seat identity is locked to the save.
5. When everyone's reclaimed, click **Resume game**. The engine
   replays every prior action and you're back where you stopped.

If you'd rather skip the dropdown click, the CLI flag still works:

```bash
npm run host -- --load saves/current.json
```

### Saving snapshots / starting a "named" save

The autosave is a single rolling file. To preserve a particular
position (e.g. the end of game one of a series), copy it before
starting a new game:

```bash
cp saves/current.json saves/2026-04-26-game-with-bob.json
```

Once it's in `./saves/`, it'll show up in the **Load save** dropdown
on next browser refresh — or click **Refresh** in the host setup row
to re-read the directory without restarting.

### Troubleshooting

| Symptom                                        | Likely cause / fix                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Browser shows "Connecting to host…" forever    | Host process isn't running, OR you're on the wrong URL (use the Cloudflare URL, not localhost). |
| You started with `--player-count 3` but the lobby has 2 seats | You forgot the `--` separator (`npm run host --player-count 3` makes npm eat the flag). The host now auto-recovers and prints a warning, but the canonical form is `npm run host -- --player-count 3`. You can also just leave the CLI alone and click **3** in the in-browser host setup row. |
| Host setup row missing in your browser         | Only the **first** client to connect is the lobby host. If you're not it, refresh after the actual host disconnects (host id transfers to whoever's still connected) or have the current host close their tab. |
| Lobby controls greyed out                      | Lobby is locked. Click **Unlock lobby** before changing player count or loading a save.     |
| **Load save** dropdown is empty                | Either `./saves/` has no parseable `*.json` files yet (autosave only writes after the first accepted action), or you need to click **Refresh**. |
| "save file not found" when using `--load`      | Path is relative to where you run npm; try the absolute path. The in-browser dropdown sidesteps this — it always reads from the host's `./saves/` directory. |
| Friends see lobby but can't claim a seat       | Lobby is locked — host clicks **Unlock lobby**                                              |
| Your friend disconnected mid-turn              | They can refresh the URL and reclaim their seat — game state is on the host.                |
| Colour is grayed out in the dropdown           | Another seat already took it; pick a different one.                                         |

---

## For someone joining a game

1. **Get the URL from the host.** It's an HTTPS address ending in
   `.trycloudflare.com` (or a Tailscale / direct IP if they set one up).
2. **Open it in any modern browser** — Chrome, Firefox, Safari, Edge.
   No app or login needed.
3. **You'll see the lobby.** It shows numbered seats, each with a name
   field and a colour dropdown.

### First-time game (the host hasn't started a save)

1. Pick any **unclaimed** seat (one with the name field empty).
2. Type your **name**.
3. Pick a **colour** from the dropdown. Greyed-out colours are taken.
4. Click **Claim**.

If you change your mind, click **Release** and try a different seat.
Until the host clicks **Lock lobby**, you can keep adjusting.

When all seats are claimed and the host clicks **Start game**, the
board appears for everyone simultaneously. You're in.

### Resuming a saved game

Same flow, except seats arrive **pre-filled** with names and colours.
You can only claim the seat that matches your original identity:
- The seat where the name says "you" — click in, click **Claim**, you're back in.
- Trying to type a different name or pick a different colour into a
  pre-filled seat is blocked.

When everyone has reclaimed their original seat, the host clicks
**Resume game**. The previous game state appears.

### During the game

- **You only ever see your own hand.** When it's someone else's turn,
  the Hand banner keeps showing your cards but goes inert — clicking
  them does nothing. The label switches to `Hand — your name (waiting)`
  so you know it's not your move yet.
- It's your turn when the **prompt strip** at the top says it is and
  the action buttons (Build / Network / Develop / Sell / Loan / Scout
  / Pass) are no longer greyed out.
- The discard pile, remaining-card counts, and other public info are
  the same for everyone — that's faithful to the physical game.
- If your connection drops (laptop sleeps, wifi blip), just reopen the
  URL. The host kept your seat reserved; you'll reconnect into it.

### What if I'm disconnected when the host pauses?

Nothing — the save was written on the host's machine, not yours. When
the host restarts the game, just open the URL again, find the seat
with your name, click **Claim**, and wait for the host to **Resume**.

### Common things that look wrong but aren't

| What you see                                   | What's actually happening                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Action buttons are greyed out                  | It's not your turn. They re-enable when it is.                         |
| Cards in the Hand banner don't respond to clicks | Same — Hand goes inert on other players' turns. Your cards stay visible so you can plan ahead. |
| You can't see anyone else's hand               | By design. Each browser only renders its own seat's cards.             |
| You clicked an action and nothing happened     | Network round-trip — usually <1s. If it stays stuck, check the toast.  |
| The page reloaded and you're back at the lobby | The host restarted. Reclaim your seat and wait for **Resume game**.    |
