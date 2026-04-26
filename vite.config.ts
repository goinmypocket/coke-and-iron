import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

const EDITOR_FILES = {
  // Historical key name "cities" — the on-disk file moved to
  // config/board.json (which now also carries marketPlace and
  // roundTracker positions). The editor still talks to the same
  // /__editor/load?file=cities endpoint to avoid bundling a UI rev
  // with the rename.
  cities: "config/board.json",
  links: "config/links.json",
} as const;
type EditorFileKey = keyof typeof EDITOR_FILES;
const EDITOR_FILE_KEYS = Object.keys(EDITOR_FILES) as EditorFileKey[];

// Dev-only middleware: lets the editor page (editor.html) read and write
// the JSON config files on disk. Not registered in production builds.
function editorApiPlugin(): Plugin {
  return {
    name: "brass-editor-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__editor/load", (req, res) => {
        const url = new URL(req.url ?? "", "http://localhost");
        const file = url.searchParams.get("file");
        if (!file || !EDITOR_FILE_KEYS.includes(file as EditorFileKey)) {
          res.statusCode = 400;
          res.end("bad file");
          return;
        }
        try {
          const body = readFileSync(
            resolve(ROOT, EDITOR_FILES[file as EditorFileKey]),
            "utf8",
          );
          res.setHeader("Content-Type", "application/json");
          res.end(body);
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });

      server.middlewares.use("/__editor/save", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("method not allowed");
          return;
        }
        const url = new URL(req.url ?? "", "http://localhost");
        const file = url.searchParams.get("file");
        if (!file || !EDITOR_FILE_KEYS.includes(file as EditorFileKey)) {
          res.statusCode = 400;
          res.end("bad file");
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk as Buffer));
        req.on("end", () => {
          try {
            const body = Buffer.concat(chunks).toString("utf8");
            const parsed = JSON.parse(body);
            // Match existing files' tab indentation so diffs stay clean.
            const formatted = JSON.stringify(parsed, null, "\t") + "\n";
            writeFileSync(
              resolve(ROOT, EDITOR_FILES[file as EditorFileKey]),
              formatted,
              "utf8",
            );
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), editorApiPlugin()],
  server: {
    port: 5173,
    proxy: {
      // Forward the WebSocket endpoint to the host process running on
      // its own port (default 8787). In production the same client
      // bundle is served by the host directly, so location.host is the
      // host port and this proxy is bypassed.
      "/ws": {
        target: "ws://localhost:8787",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(ROOT, "index.html"),
        editor: resolve(ROOT, "editor.html"),
      },
    },
  },
});
