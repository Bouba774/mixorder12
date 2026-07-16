/**
 * Recent libraries index + reopen manifest.
 *
 * Stores enough metadata about each imported library so the welcome screen
 * can offer a true one-tap reopen (no folder picker) on native. The
 * manifest keeps the SAF URIs handed back by the last `pickFolder()` call —
 * the app already holds a persistable permission on those URIs, so
 * `Capacitor.convertFileSrc()` can rebuild a playable URL without asking
 * the user to pick the folder again.
 *
 * On the web there is no persistent file handle, so a manifest without the
 * original File objects can only rehydrate metadata. The UI guards for
 * that (recent card is native-only).
 */

const KEY = "mixorder:libraries:recent";
const MANIFEST_PREFIX = "mixorder:library:manifest:";
const MAX_RECENT = 8;

export interface RecentLibrary {
  fingerprint: string;
  name: string;
  trackCount: number;
  lastOpenedAt: number;
  createdAt: number;
}

export interface LibraryManifestTrack {
  originalName: string;
  path: string;
  mimeType: string;
  size: number;
}

export interface LibraryManifest {
  v: 1;
  name: string;
  createdAt: number;
  tracks: LibraryManifestTrack[];
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
    s.removeItem(MANIFEST_PREFIX + fingerprint);
  } catch {
    /* ignore */
  }
}

export function saveLibraryManifest(fingerprint: string, manifest: LibraryManifest): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(MANIFEST_PREFIX + fingerprint, JSON.stringify(manifest));
  } catch {
    /* ignore */
  }
}

export function loadLibraryManifest(fingerprint: string): LibraryManifest | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(MANIFEST_PREFIX + fingerprint);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LibraryManifest;
    return parsed?.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}
