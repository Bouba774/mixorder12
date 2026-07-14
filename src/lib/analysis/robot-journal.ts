/**
 * DiscDJ Robot — persistent BPM acquisition journal.
 *
 * The library is the single source of truth for track data (BPM, key,
 * favorites…). The journal only records the *history* of the robot's
 * acquisition attempts — heure, morceau, BPM trouvé, temps de lecture,
 * tentatives, résultat — so the user can audit runs even across app
 * restarts. Entries are keyed by project fingerprint so libraries stay
 * independent.
 */

const KEY_PREFIX = "mixorder:robot-journal:";
const MAX_ENTRIES = 500;

export type JournalOutcome = "success" | "retry" | "error" | "skipped";

export interface JournalEntry {
  ts: number;
  trackId: string;
  name: string;
  bpm: number | null;
  outcome: JournalOutcome;
  /** Milliseconds spent reading DiscDJ for this specific track. */
  durationMs: number;
  attempts: number;
  message?: string;
}

function safeStorage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; }
  catch { return null; }
}

export function loadJournal(fingerprint: string): JournalEntry[] {
  const s = safeStorage();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY_PREFIX + fingerprint);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JournalEntry[]) : [];
  } catch { return []; }
}

export function appendJournal(
  fingerprint: string,
  entry: JournalEntry,
): JournalEntry[] {
  const s = safeStorage();
  const list = loadJournal(fingerprint);
  list.unshift(entry);
  if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
  if (s) {
    try { s.setItem(KEY_PREFIX + fingerprint, JSON.stringify(list)); }
    catch { /* quota */ }
  }
  notifyListeners(fingerprint, list);
  return list;
}

export function clearJournal(fingerprint: string): void {
  const s = safeStorage();
  if (s) s.removeItem(KEY_PREFIX + fingerprint);
  notifyListeners(fingerprint, []);
}

// Simple pub/sub so React panels rerender without polling.
type Listener = (entries: JournalEntry[]) => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribeJournal(fingerprint: string, fn: Listener): () => void {
  let set = listeners.get(fingerprint);
  if (!set) { set = new Set(); listeners.set(fingerprint, set); }
  set.add(fn);
  fn(loadJournal(fingerprint));
  return () => { set!.delete(fn); };
}

function notifyListeners(fingerprint: string, entries: JournalEntry[]) {
  const set = listeners.get(fingerprint);
  if (!set) return;
  for (const l of set) l(entries);
}