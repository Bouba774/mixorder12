/**
 * Recent libraries index — used by the welcome screen to let the user
 * jump back into the last folders they imported. Metadata only: the OS
 * still needs to hand back file handles for playback, so "reopening" a
 * recent library triggers the normal folder picker (on native, users
 * pick the same folder; the persisted metadata is merged in via the
 * scanner diff so BPM / key / favorites / renames all survive).
 */

const KEY = "mixorder:libraries:recent";
const MAX_RECENT = 8;

export interface RecentLibrary {
  fingerprint: string;
  name: string;
  trackCount: number;
  lastOpenedAt: number;
  createdAt: number;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function listRecentLibraries(): RecentLibrary[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as RecentLibrary[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function touchRecentLibrary(entry: Omit<RecentLibrary, "lastOpenedAt"> & { lastOpenedAt?: number }): void {
  const s = storage();
  if (!s) return;
  const list = listRecentLibraries().filter((r) => r.fingerprint !== entry.fingerprint);
  list.unshift({ ...entry, lastOpenedAt: entry.lastOpenedAt ?? Date.now() });
  try {
    s.setItem(KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    /* quota — ignore */
  }
}

export function forgetRecentLibrary(fingerprint: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(
      KEY,
      JSON.stringify(listRecentLibraries().filter((r) => r.fingerprint !== fingerprint)),
    );
  } catch {
    /* ignore */
  }
}