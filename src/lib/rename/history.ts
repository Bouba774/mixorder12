/**
 * Rename batch history + undo.
 *
 * Every batch rename produces one `RenameBatch` persisted to localStorage
 * under the project fingerprint. Each entry stores the track id, its name
 * BEFORE the rename and AFTER — enough to fully restore the previous state
 * even after the app has been closed.
 *
 * Undo is per-batch. Applying undo simply calls `renameTrack` back to the
 * "before" value for each entry that is still resolvable in the library.
 */

const PREFIX = "mixorder:renamehist:";
const MAX_BATCHES = 50;

export interface RenameBatchEntry {
  trackId: string;
  before: string;
  after: string;
}

export interface RenameBatch {
  id: string;
  at: number;
  template: string;
  count: number;
  entries: RenameBatchEntry[];
  reverted?: boolean;
}

export interface RenameHistory {
  v: 1;
  batches: RenameBatch[];
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadHistory(fingerprint: string): RenameHistory {
  const s = storage();
  if (!s) return { v: 1, batches: [] };
  try {
    const raw = s.getItem(PREFIX + fingerprint);
    if (!raw) return { v: 1, batches: [] };
    const parsed = JSON.parse(raw) as RenameHistory;
    if (parsed?.v !== 1) return { v: 1, batches: [] };
    return parsed;
  } catch {
    return { v: 1, batches: [] };
  }
}

export function saveHistory(fingerprint: string, hist: RenameHistory): void {
  const s = storage();
  if (!s) return;
  try {
    // Cap the number of batches — most recent first.
    const capped: RenameHistory = {
      v: 1,
      batches: hist.batches.slice(0, MAX_BATCHES),
    };
    s.setItem(PREFIX + fingerprint, JSON.stringify(capped));
  } catch {
    /* quota etc. */
  }
}

export function pushBatch(
  fingerprint: string,
  batch: Omit<RenameBatch, "id" | "at">,
): RenameBatch {
  const hist = loadHistory(fingerprint);
  const full: RenameBatch = {
    ...batch,
    id: `b_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`,
    at: Date.now(),
  };
  hist.batches = [full, ...hist.batches];
  saveHistory(fingerprint, hist);
  return full;
}

export function markBatchReverted(fingerprint: string, batchId: string) {
  const hist = loadHistory(fingerprint);
  const idx = hist.batches.findIndex((b) => b.id === batchId);
  if (idx < 0) return;
  hist.batches[idx] = { ...hist.batches[idx], reverted: true };
  saveHistory(fingerprint, hist);
}

export function clearHistory(fingerprint: string) {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(PREFIX + fingerprint);
  } catch {
    /* ignore */
  }
}
