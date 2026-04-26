// =============================================================================
// Host process entry point. Starts an HTTP + WebSocket server. The HTTP
// side serves the built client (./dist) when present so a single port
// hosts everything in production. The WebSocket side, mounted at /ws,
// carries the protocol defined in src/network/protocol.ts.
//
// CLI:
//   npm run host -- [--port <n>] [--load <save.json>]
//                   [--player-count 2|3|4] [--seed <int>] [--auto-end-turn]
//                   [--no-undo]
// =============================================================================
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { HostGame } from "./HostGame";
import { ensureSavesDir, readSaveFromDisk } from "./saves";
import { parseClientMessage, encode } from "../src/network/protocol";
import type { PlayerCount } from "../src/engine/types";
import type { SaveFile } from "../src/network/saveFile";

const HOST_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HOST_DIR, "..");
const DIST_DIR = resolve(PROJECT_ROOT, "dist");

interface CliArgs {
  port: number;
  load: string | null;
  /** null = caller did not pass --player-count; resolves to 2 for fresh
   * games, or the save's value when --load is used. */
  playerCount: PlayerCount | null;
  seed: number;
  autoEndTurn: boolean;
  allowUndo: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    port: 8787,
    load: null,
    playerCount: null,
    seed: Math.floor(Math.random() * 0x7fffffff),
    autoEndTurn: false,
    allowUndo: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--port": {
        const v = argv[++i];
        if (!v) throw new Error("--port needs a value");
        args.port = Number(v);
        break;
      }
      case "--load": {
        const v = argv[++i];
        if (!v) throw new Error("--load needs a path");
        args.load = v;
        break;
      }
      case "--player-count": {
        const v = Number(argv[++i]);
        if (v !== 2 && v !== 3 && v !== 4) {
          throw new Error("--player-count must be 2, 3, or 4");
        }
        args.playerCount = v;
        break;
      }
      case "--seed": {
        const v = argv[++i];
        if (!v) throw new Error("--seed needs a value");
        args.seed = Number(v);
        break;
      }
      case "--auto-end-turn":
        args.autoEndTurn = true;
        break;
      case "--no-undo":
        args.allowUndo = false;
        break;
      case "--help":
      case "-h":
        printHelpAndExit();
        break;
      default:
        // Skip unknown args silently so npm script flags pass through.
        if (a?.startsWith("--")) {
          // eslint-disable-next-line no-console
          console.warn(`[host] unknown arg ignored: ${a}`);
        }
    }
  }
  return args;
}

function printHelpAndExit(): never {
  // eslint-disable-next-line no-console
  console.log(`brass-birmingham host

Usage: npm run host -- [options]

Options:
  --port <n>             Listen port (default 8787)
  --load <path>          Hydrate from a save file
  --player-count 2|3|4   Player count for a fresh game (default 2)
  --seed <int>           RNG seed for a fresh game (default random)
  --auto-end-turn        Enable engine.autoEndTurn (default off)
  --no-undo              Disable in-turn undo (default enabled)
  -h, --help             Show this help
`);
  process.exit(0);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  ensureSavesDir();

  let loadedSave: SaveFile | null = null;
  if (args.load) {
    const path = resolve(args.load);
    if (!existsSync(path)) {
      console.error(`[host] save file not found: ${path}`);
      process.exit(1);
    }
    loadedSave = readSaveFromDisk(path);
    console.log(
      `[host] loaded save: seed=${loadedSave.seed} playerCount=${loadedSave.playerCount} intents=${loadedSave.intentLog.length}`,
    );
  }

  const game = new HostGame({
    seed: args.seed,
    playerCount: args.playerCount ?? 2,
    autoEndTurn: args.autoEndTurn,
    allowUndo: args.allowUndo,
    bundle: {},
    ...(loadedSave ? { loadFrom: loadedSave } : {}),
  });

  const httpServer = createServer((req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end("bad request");
      return;
    }
    serveStatic(req.url, res);
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (ws) => attachClient(ws, game));

  httpServer.listen(args.port, () => {
    const resolvedPlayers = loadedSave?.playerCount ?? args.playerCount ?? 2;
    const banner = `
─────────────────────────────────────────────
 brass-birmingham host
   client:    http://localhost:${args.port}
   websocket: ws://localhost:${args.port}/ws
   players:   ${resolvedPlayers}${loadedSave ? " (from save)" : ""}
   autosave:  ./saves/current.json
─────────────────────────────────────────────`;
    console.log(banner);
    if (
      loadedSave &&
      args.playerCount !== null &&
      args.playerCount !== loadedSave.playerCount
    ) {
      console.warn(
        `[host] --player-count ${args.playerCount} ignored — save file is ${loadedSave.playerCount}-player`,
      );
    }
    if (!existsSync(DIST_DIR)) {
      console.log(
        "[host] no dist/ found — run `npm run build` first, or use Vite at",
        "http://localhost:5173 (vite proxies /ws to this port).",
      );
    }
  });

  const shutdown = (signal: string) => {
    console.log(`\n[host] caught ${signal}, flushing autosave…`);
    try {
      game.flushSave();
    } catch (err) {
      console.error("[host] flush failed:", err);
    }
    wss.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function attachClient(ws: WebSocket, game: HostGame): void {
  const clientId = randomUUID();
  game.attachConnection(clientId, (msg) => {
    if (ws.readyState === ws.OPEN) ws.send(encode(msg));
  });
  ws.on("message", (raw) => {
    const text = typeof raw === "string" ? raw : raw.toString("utf8");
    const msg = parseClientMessage(text);
    if (!msg) {
      ws.send(encode({ type: "ERROR", message: `unparseable message` }));
      return;
    }
    routeMessage(game, clientId, msg);
  });
  ws.on("close", () => game.detachConnection(clientId));
  ws.on("error", (err) => {
    console.warn(`[host] ws error from ${clientId}:`, err);
  });
}

function routeMessage(
  game: HostGame,
  clientId: string,
  msg: ReturnType<typeof parseClientMessage>,
): void {
  if (!msg) return;
  switch (msg.type) {
    case "CLAIM_SEAT":
      game.handleClaimSeat(clientId, msg.seatId, msg.displayName, msg.pawnColor);
      return;
    case "RELEASE_SEAT":
      game.handleReleaseSeat(clientId, msg.seatId);
      return;
    case "LOCK_LOBBY":
      game.handleLockLobby(clientId, msg.locked);
      return;
    case "START_GAME":
      game.handleStartGame(clientId);
      return;
    case "INTENT":
      game.handleIntent(clientId, msg.intent);
      return;
    case "SET_PAUSED":
      game.handleSetPaused(clientId, msg.paused);
      return;
  }
}

const STATIC_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function serveStatic(
  url: string,
  res: import("node:http").ServerResponse,
): void {
  if (!existsSync(DIST_DIR)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(
      "no client build yet — run `npm run build`, or open Vite dev server (port 5173).",
    );
    return;
  }
  const cleanUrl = url.split("?")[0] ?? "/";
  const target = cleanUrl === "/" ? "/index.html" : cleanUrl;
  const resolved = resolve(DIST_DIR, "." + target);
  if (!resolved.startsWith(DIST_DIR)) {
    res.statusCode = 403;
    res.end("forbidden");
    return;
  }
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    // SPA fallback for client routes.
    const fallback = join(DIST_DIR, "index.html");
    if (existsSync(fallback)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(readFileSync(fallback));
    } else {
      res.statusCode = 404;
      res.end("not found");
    }
    return;
  }
  const type = STATIC_TYPES[extname(resolved)] ?? "application/octet-stream";
  res.setHeader("Content-Type", type);
  res.end(readFileSync(resolved));
}

main();
