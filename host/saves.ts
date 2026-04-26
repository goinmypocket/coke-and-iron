// =============================================================================
// Save-file I/O for the host process. Wraps `src/network/saveFile` with
// fs read/write. Saves live under ./saves/ relative to the project root.
// =============================================================================
import { mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSaveFile,
  parseSaveFile,
  serializeSave,
  type BuildSaveArgs,
  type SaveFile,
} from "../src/network/saveFile";

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
}

export function listSaves(dir: string = DEFAULT_SAVES_DIR): SaveSummary[] {
  ensureSavesDir(dir);
  const entries = readdirSync(dir).filter((n) => n.endsWith(".json"));
  return entries.map((name) => {
    const full = join(dir, name);
    const st = statSync(full);
    return {
      path: full,
      name,
      bytes: st.size,
      mtime: st.mtime.toISOString(),
    };
  });
}

export function autosavePath(dir: string = DEFAULT_SAVES_DIR): string {
  return join(dir, AUTOSAVE_NAME);
}
