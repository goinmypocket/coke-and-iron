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

### Starting a brand-new game

```bash
npm run host
```

The lobby comes up empty with the default 2 seats. The first browser
to connect becomes the **lobby host** and gets an in-page setup row:

- **Players**: pick 2 / 3 / 4 — the seat list resizes immediately for
  every connected client.
- **Load save**: pick one of the host's `saves/*.json` files from the
  dropdown and click **Load** to replace the lobby with that save's
  pre-filled identities. **Refresh** re-reads the saves directory;
  **New game** discards the loaded save and returns to a fresh empty
  lobby.

You can also pre-seed any of these from the CLI:

```bash
npm run host -- --player-count 3
npm run host -- --load saves/current.json
```

> If you forget the `--` separator (e.g. `npm run host --player-count 3`),
> the host detects it and auto-recovers with a one-line warning. The
> separator is still recommended.

Common flags:

| Flag                       | Default       | What it does                                           |
| -------------------------- | ------------- | ------------------------------------------------------ |
| `--port <n>`               | `8787`        | TCP port the host listens on.                          |
| `--player-count 2\|3\|4`   | `2`           | How many seats the lobby exposes.                      |
| `--seed <int>`             | random        | RNG seed (deterministic setup if you reuse it).        |
| `--auto-end-turn`          | off           | Auto-advance when actions hit zero.                    |
| `--no-undo`                | undo enabled  | Disable the in-turn undo button.                       |
| `--load <path>`            | none          | Resume from a save (see "Pause & resume" below).       |
| `-h`, `--help`             | —             | Print usage.                                           |

You'll see:

```
─────────────────────────────────────────────
 brass-birmingham host
   client:    http://localhost:8787
   websocket: ws://localhost:8787/ws
   autosave:  ./saves/current.json
─────────────────────────────────────────────
```

Open `http://localhost:8787` in your browser. You're now the first
client and automatically the **lobby host** (you can lock + start the
game).

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
You run `npm run host`, you open `http://localhost:8787` in your own
browser, your friends open the Cloudflare URL. You get one seat just
like they do. The first client to connect (you) is automatically the
**lobby host** — only you see the **Lock lobby** and **Start game**
buttons.

**Solo, all seats from one browser (testing or learning the rules).**
Run `npm run host -- --player-count 4`. Open
`http://localhost:8787`. Claim seat 1 with one name/colour, then in
the same tab click another unclaimed seat and claim it too — the
host doesn't care that all seats trace back to one connection. Click
**Start game** and play hot-seat style; whichever seat is active is
the one whose buttons appear.

**Solo, one seat per browser tab (testing the multiplayer flow without
friends).**
Run the host as usual, then open `http://localhost:8787` in **two
separate browser windows or two profiles** (incognito works — each
window gets its own connection and its own client id). Claim a seat
in each. Now you're playing both sides as if you were two people. The
window that opened first is the lobby host.

> Same machine = same network = no Cloudflare Tunnel needed.

### In the lobby

1. Pick your seat from the list. Type your name, choose a colour.
2. Click **Claim**. Your name + colour are now reserved.
3. Watch friends fill in the other seats.
4. (Optional) Click **Lock lobby** once everyone's settled — prevents
   further name/colour changes.
5. Click **Start game** when every seat is claimed.

### During the game

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

```bash
npm run host -- --load saves/current.json
```

You'll see the lobby come back up with the same names + colours
**pre-filled** but **unclaimed**. Each player rejoins the URL,
selects their original seat, and clicks **Claim** (they can't pick a
different name or colour — the seat identity is locked).

Once everyone's reclaimed, click **Resume game**. The engine replays
every prior action and you're back where you stopped.

### Saving snapshots / starting a "named" save

The autosave is a single rolling file. To preserve a particular
position (e.g. the end of game one of a series), copy it before
starting a new game:

```bash
cp saves/current.json saves/2026-04-26-game-with-bob.json
```

Load it later with `--load saves/2026-04-26-game-with-bob.json`.

### Troubleshooting

| Symptom                                        | Likely cause / fix                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Browser shows "Connecting to host…" forever    | Host process isn't running, OR you're on the wrong URL (use the Cloudflare URL, not localhost) |
| Friends see lobby but can't claim a seat       | Lobby is locked — host clicks **Unlock lobby**                                              |
| "save file not found" when using `--load`      | Path is relative to where you run npm; try the absolute path                                |
| You restart and the lobby is empty / seats blank | You started without `--load`. Ctrl-C and re-run with `--load saves/current.json`.           |
| Your friend disconnected mid-turn              | They can refresh the URL and reclaim their seat — game state is on the host                 |
| Colour is grayed out in the dropdown           | Another seat already took it; pick a different one                                          |

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

- It's only your turn when the **prompt strip** at the top says it is.
- Click around freely on other turns — the UI will refuse to dispatch
  actions that aren't yours, with a small toast at the bottom.
- If your connection drops (laptop sleeps, wifi blip), just reopen the
  URL. The host kept your seat reserved; you'll reconnect into it.

### What if I'm disconnected when the host pauses?

Nothing — the save was written on the host's machine, not yours. When
the host restarts the game, just open the URL again, find the seat
with your name, click **Claim**, and wait for the host to **Resume**.

### Common things that look wrong but aren't

| What you see                                   | What's actually happening                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Buttons are missing on the action panel        | It's not your turn. They appear when it is.                            |
| You clicked an action and nothing happened     | Network round-trip — usually <1s. If it stays stuck, check the toast.  |
| The page reloaded and you're back at the lobby | The host restarted. Reclaim your seat and wait for **Resume**.         |
