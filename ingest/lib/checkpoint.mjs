import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_PATH = join(__dirname, "..", ".checkpoint.json");

const DEFAULT = {
  collectedUrls: [],
  completedUrls: [],
  phase: "collect", // "collect" | "extract" | "done"
};

/**
 * Load checkpoint from disk, or return defaults.
 */
export function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) return { ...DEFAULT };
  try {
    const data = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf-8"));
    return { ...DEFAULT, ...data };
  } catch {
    console.warn("[checkpoint] Corrupt checkpoint file, starting fresh.");
    return { ...DEFAULT };
  }
}

/**
 * Save checkpoint to disk.
 */
export function saveCheckpoint(state) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(state, null, 2));
}

/**
 * Clear checkpoint file after successful completion.
 */
export function clearCheckpoint() {
  if (existsSync(CHECKPOINT_PATH)) {
    writeFileSync(CHECKPOINT_PATH, JSON.stringify({ ...DEFAULT, phase: "done" }, null, 2));
  }
}
