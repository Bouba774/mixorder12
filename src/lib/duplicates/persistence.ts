/**
 * Persist user decisions on duplicate groups: ignored pairs, custom keepers.
 * Keyed by project fingerprint (same as analysis snapshots).
 */

const PREFIX = "mixorder:dedup:";

export interface DedupState {
  v: 1;
  /** Set of "a::b" pair keys (a < b) the user chose to ignore. */
  ignoredPairs: string[];
  /** Group signature → user-chosen keeper track id. */
  keeperOverrides: Record<string, string>;
  updatedAt: number;
}

function empty(): DedupState {
  return { v: 1, ignoredPairs: [], keeperOverrides: {}, updatedAt: Date.now() };
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function loadDedupState(fingerprint: string): DedupState {
  const s = storage();
  if (!s) return empty();
  try {
    const raw = s.getItem(PREFIX + fingerprint);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as DedupState;
    if (parsed?.v !== 1) return empty();
    return parsed;
  } catch {
    return empty();
  }
}

export function saveDedupState(fingerprint: string, state: DedupState): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(
      PREFIX + fingerprint,
      JSON.stringify({ ...state, updatedAt: Date.now() }),
    );
  } catch {
    /* quota etc. — ignore */
  }
}
