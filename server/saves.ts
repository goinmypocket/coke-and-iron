// =============================================================================
// Save-file I/O for the host process. Wraps `src/network/saveFile` with
// fs read/write. Saves live under ./saves/ relative to the project root.
// =============================================================================
import { mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSaveFile,
  parseSaveFile,
  serializeSave,
  type BuildSaveArgs,
  type SaveFile,
} from "../shared/saveFile";

const HOST_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HOST_DIR, "..");
export const DEFAULT_SAVES_DIR = resolve(PROJECT_ROOT, "saves");
export const AUTOSAVE_NAME = "current.json";

export function ensureSavesDir(dir: string = DEFAULT_SAVES_DIR): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readSaveFromDisk(path: string): SaveFile {
  const abs = resolve(path);
  const json = readFileSync(abs, "utf8");
  return parseSaveFile(json);
}

export function writeSaveToDisk(path: string, args: BuildSaveArgs): void {
  ensureSavesDir(dirname(path));
  const save = buildSaveFile(args);
  writeFileSync(path, serializeSave(save), "utf8");
}

export interface SaveSummary {
  readonly path: string;
  readonly name: string;
  readonly bytes: number;
  readonly mtime: string;
  readonly playerCount: number;
  readonly seed: number;
  readonly createdAt: string;
  readonly intentCount: number;
}

/** List every parseable save file in `dir`, sorted by mtime descending
 * (most recently modified first). Files that can't be parsed are
 * skipped — the host UI surfaces what it can rather than blowing up
 * the whole list because of one corrupt file. */
export function listSaves(dir: string = DEFAULT_SAVES_DIR): SaveSummary[] {
  ensureSavesDir(dir);
  const entries = readdirSync(dir).filter((n) => n.endsWith(".json"));
  const summaries: SaveSummary[] = [];
  for (const name of entries) {
    const full = join(dir, name);
    try {
      const st = statSync(full);
      const save = parseSaveFile(readFileSync(full, "utf8"));
      summaries.push({
        path: full,
        name,
        bytes: st.size,
        mtime: st.mtime.toISOString(),
        playerCount: save.playerCount,
        seed: save.seed,
        createdAt: save.createdAt,
        intentCount: save.intentLog.length,
      });
    } catch {
      // Skip unparseable files silently — they're not load candidates.
    }
  }
  summaries.sort((a, b) => (a.mtime < b.mtime ? 1 : a.mtime > b.mtime ? -1 : 0));
  return summaries;
}

export function autosavePath(dir: string = DEFAULT_SAVES_DIR): string {
  return join(dir, AUTOSAVE_NAME);
}

/** Resolve a user-supplied filename to a path inside `dir`. Returns
 * null if the filename is unsafe (path traversal, absolute path, or
 * resolves outside the saves directory). */
export function resolveSavePath(
  filename: string,
  dir: string = DEFAULT_SAVES_DIR,
): string | null {
  // Reject anything that isn't a plain "name.json": no slashes, no
  // backslashes, no parent refs.
  if (
    filename.length === 0 ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("..") ||
    filename.startsWith(".")
  ) {
    return null;
  }
  if (!filename.endsWith(".json")) return null;
  const full = resolve(dir, filename);
  // Defensive: ensure the resolved path is still inside the saves dir.
  const dirAbs = resolve(dir);
  if (!full.startsWith(dirAbs + sep) && full !== dirAbs) return null;
  return full;
}
