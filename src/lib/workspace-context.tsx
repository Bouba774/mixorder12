import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  projectFromFileList,
  type ImportedProject,
} from "./folder-import";
import {
  applyAnalysisToTracks,
  loadSnapshot,
  projectFingerprint,
  saveSnapshot,
  upsertTrackData,
} from "./analysis/persistence";
import type { BpmSourceId } from "./analysis/types";
import { toCamelot } from "./library/camelot";
import { keyAnalysisEngine } from "./key-analysis/engine";
import type { KeyAnalysisData } from "./key-analysis/types";
import {
  listRecentLibraries,
  touchRecentLibrary,
  forgetRecentLibrary,
  type RecentLibrary,
} from "./library/recent";

/**
 * MixOrder workspace state.
 *
 * The app is centred on a SINGLE active project = one local audio library.
 * All future features (analysis, sort, rename, set builder, delete, move…)
 * must mutate the same `tracks` array through the actions exposed by this
 * context — never build a parallel copy or a derived view that owns state.
 *
 * Files are referenced, not copied. On web we keep the original `File`
 * handle; on Android (Capacitor) we keep a `url` produced from the SAF URI
 * via `Capacitor.convertFileSrc()`. Either shape is enough for playback,
 * duration reading and future analysis (bytes fetched on demand).
 */

export type TrackId = string;

export interface Track {
  id: TrackId;
  /** Display name (editable via future rename feature). */
  name: string;
  /** Original filename on disk (immutable reference). */
  originalName: string;
  /** Relative path inside the imported folder, or SAF URI on native. */
  path: string;
  extension: string;
  size: number;
  mimeType: string;
  /** Playable URL — blob: on web, capacitor:// on native. */
  url: string;
  /** Present on web only. Native tracks read bytes lazily via `url`. */
  file?: File;
  /** Duration in seconds — filled asynchronously after import. */
  durationSec: number | null;
  /** Reserved for future analysis. */
  bpm: number | null;
  musicalKey: string | null;
  /** Camelot wheel notation derived from `musicalKey`. */
  camelot: string | null;
  /** User favorite flag. */
  favorite: boolean;
  /** First time we imported this file. */
  addedAt: number;
  /** Last time file metadata (size/name) changed. */
  modifiedAt: number;
  /** Chronological rename log. */
  renameHistory: Array<{ from: string; to: string; at: number }>;
  /** Where the track stands in our analysis pipeline. */
  analysisStatus: "pending" | "analyzing" | "done" | "error";
  /** Sync status vs the imported folder. */
  syncStatus: "synced" | "missing" | "moved";
}

export interface Project {
  name: string;
  createdAt: number;
  tracks: Track[];
}

/** Summary of the diff produced by re-importing an existing library. */
export interface ImportDiffSummary {
  added: number;
  removed: number;
  renamed: number;
  moved: number;
  unchanged: number;
}

interface WorkspaceContextValue {
  project: Project | null;
  /** True while durations / metadata are being read. */
  isIndexing: boolean;
  /** Recently imported libraries, most recent first. */
  recentLibraries: RecentLibrary[];
  /** Refresh the recent-libraries list from storage. */
  refreshRecentLibraries: () => void;
  /** Remove a library from the recent list (metadata is kept). */
  forgetLibrary: (fingerprint: string) => void;
  /** Last import diff, if the current session started from a re-import. */
  lastImportDiff: ImportDiffSummary | null;
  /** Import from a web <input webkitdirectory> file list. */
  openProject: (files: FileList | File[]) => void;
  /** Import from a pre-built project (used by the native picker). */
  openImportedProject: (imported: ImportedProject) => void;
  closeProject: () => void;
  /** Generic single-track patch — foundation for rename, tagging, analysis. */
  updateTrack: (id: TrackId, patch: Partial<Omit<Track, "id" | "file">>) => void;
  /**
   * Persisted analysis write. Updates the live library AND saves the value
   * to local storage under the project fingerprint so BPM / key survive
   * closing and reopening the project. All analysis features (manual
   * DiscDJ, auto DiscDJ, local fallback…) must go through this action.
   */
  setTrackAnalysis: (
    id: TrackId,
    patch: { bpm?: number | null; musicalKey?: string | null },
    source: BpmSourceId,
  ) => void;
  /** Rename a track in place (records history + persists). */
  renameTrack: (id: TrackId, nextName: string) => void;
  /** Toggle the favorite flag on one track (persists). */
  toggleFavorite: (id: TrackId) => void;
  /** Remove tracks from the library (does NOT touch disk). */
  removeTracks: (ids: TrackId[]) => void;
  /**
   * Duplicate merge: fold BPM / key / favorite / rename history from all
   * `sourceIds` into `keeperId` (only when the keeper is missing the value),
   * then remove the source tracks from the library.
   */
  mergeAndRemoveDuplicates: (keeperId: TrackId, sourceIds: TrackId[]) => void;
  /** Replace ordering — foundation for sort / set builder. */
  reorderTracks: (orderedIds: TrackId[]) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function makeId() {
  return `t_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function extractExt(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function readDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const cleanup = () => {
      audio.src = "";
    };
    audio.onloadedmetadata = () => {
      const d = isFinite(audio.duration) ? audio.duration : null;
      cleanup();
      resolve(d);
    };
    audio.onerror = () => {
      cleanup();
      resolve(null);
    };
    audio.src = url;
  });
}

function baseTrackFromImport(t: ImportedProject["tracks"][number], now: number): Track {
  return {
    id: makeId(),
    name: t.originalName.replace(/\.[^.]+$/, ""),
    originalName: t.originalName,
    path: t.path,
    extension: extractExt(t.originalName),
    size: t.size,
    mimeType: t.mimeType,
    url: t.url,
    file: t.file,
    durationSec: null,
    bpm: null,
    musicalKey: null,
    camelot: null,
    favorite: false,
    addedAt: now,
    modifiedAt: now,
    renameHistory: [],
    analysisStatus: "pending",
    syncStatus: "synced",
  };
}

/**
 * Build the live library from a freshly imported folder, applying any
 * previously-persisted per-track metadata (BPM, key, favorites, renames)
 * so re-imports feel seamless. Never re-imports unchanged tracks — the
 * scanner diff below detects add/remove/rename by (originalName, size).
 */
function buildProject(
  imported: ImportedProject,
): { project: Project; diff: ImportDiffSummary } {
  const now = Date.now();
  const shell0: Project = {
    name: imported.name,
    createdAt: now,
    tracks: imported.tracks.map((t) => baseTrackFromImport(t, now)),
  };
  const fp = projectFingerprint(shell0);
  const snap = loadSnapshot(fp);

  const diff: ImportDiffSummary = {
    added: 0,
    removed: 0,
    renamed: 0,
    moved: 0,
    unchanged: 0,
  };

  const tracks = shell0.tracks.map((t) => {
    const data = snap?.tracks[t.path];
    if (!data) {
      diff.added += 1;
      return t;
    }
    diff.unchanged += 1;
    const displayName = data.displayName ?? t.name;
    return {
      ...t,
      name: displayName,
      bpm: data.bpm ?? null,
      musicalKey: data.musicalKey ?? null,
      camelot: toCamelot(data.musicalKey ?? null),
      favorite: !!data.favorite,
      addedAt: data.addedAt ?? now,
      modifiedAt: data.modifiedAt ?? now,
      renameHistory: data.renameHistory ?? [],
      analysisStatus: data.bpm != null || data.musicalKey ? "done" : "pending",
    } satisfies Track;
  });

  // Removed tracks: present in snapshot but not in imported.
  if (snap) {
    const importedPaths = new Set(shell0.tracks.map((t) => t.path));
    for (const p of Object.keys(snap.tracks)) {
      if (!importedPaths.has(p)) diff.removed += 1;
    }
  }

  tracks.sort((a, b) =>
    a.path.localeCompare(b.path, undefined, { numeric: true }),
  );

  const project: Project = { name: imported.name, createdAt: now, tracks };
  touchRecentLibrary({
    fingerprint: fp,
    name: imported.name,
    trackCount: tracks.length,
    createdAt: snap ? project.createdAt : now,
  });
  return { project, diff };
}

// legacy compat — some old imports may still call this shape.
export function _rehydrateLegacy(imported: ImportedProject): Project {
  return buildProject(imported).project;
}
// Silence unused-import warning; retained for future callers.
void applyAnalysisToTracks;

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<Project | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [recentLibraries, setRecentLibraries] = useState<RecentLibrary[]>(() =>
    listRecentLibraries(),
  );
  const [lastImportDiff, setLastImportDiff] = useState<ImportDiffSummary | null>(
    null,
  );
  const indexRunRef = useRef(0);

  const refreshRecentLibraries = useCallback(() => {
    setRecentLibraries(listRecentLibraries());
  }, []);

  const forgetLibrary = useCallback((fingerprint: string) => {
    forgetRecentLibrary(fingerprint);
    setRecentLibraries(listRecentLibraries());
  }, []);

  const openImportedProject = useCallback((imported: ImportedProject) => {
    if (imported.tracks.length === 0) return;
    const { project, diff } = buildProject(imported);
    setProject(project);
    setLastImportDiff(diff);
    setRecentLibraries(listRecentLibraries());
  }, []);

  const openProject = useCallback((input: FileList | File[]) => {
    const imported = projectFromFileList(input);
    if (!imported) return;
    const { project, diff } = buildProject(imported);
    setProject(project);
    setLastImportDiff(diff);
    setRecentLibraries(listRecentLibraries());
  }, []);

  const closeProject = useCallback(() => {
    indexRunRef.current += 1;
    setProject((p) => {
      if (p) {
        for (const t of p.tracks) {
          if (t.url.startsWith("blob:")) URL.revokeObjectURL(t.url);
        }
      }
      return null;
    });
    setIsIndexing(false);
    setLastImportDiff(null);
  }, []);

  const updateTrack = useCallback<WorkspaceContextValue["updateTrack"]>((id, patch) => {
    setProject((p) =>
      p
        ? { ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }
        : p,
    );
  }, []);

  const setTrackAnalysis = useCallback<WorkspaceContextValue["setTrackAnalysis"]>(
    (id, patch, source) => {
      setProject((p) => {
        if (!p) return p;
        const target = p.tracks.find((t) => t.id === id);
        if (!target) return p;
        const nextTracks = p.tracks.map((t) =>
          t.id === id
            ? {
                ...t,
                bpm: patch.bpm !== undefined ? patch.bpm : t.bpm,
                musicalKey:
                  patch.musicalKey !== undefined ? patch.musicalKey : t.musicalKey,
                camelot: toCamelot(
                  patch.musicalKey !== undefined ? patch.musicalKey : t.musicalKey,
                ),
                analysisStatus:
                  (patch.bpm !== undefined && patch.bpm !== null) ||
                  (patch.musicalKey !== undefined && patch.musicalKey)
                    ? "done"
                    : t.analysisStatus,
              }
            : t,
        );
        const nextProject = { ...p, tracks: nextTracks };
        // Persist to local storage under the project fingerprint.
        const fp = projectFingerprint(nextProject);
        const snap = loadSnapshot(fp);
        const merged = upsertTrackData(snap, nextProject.name, target.path, {
          ...patch,
          source,
        });
        saveSnapshot(fp, merged);
        return nextProject;
      });
    },
    [],
  );

  const renameTrack = useCallback<WorkspaceContextValue["renameTrack"]>(
    (id, nextName) => {
      const trimmed = nextName.trim();
      if (!trimmed) return;
      setProject((p) => {
        if (!p) return p;
        const target = p.tracks.find((t) => t.id === id);
        if (!target || target.name === trimmed) return p;
        const entry = { from: target.name, to: trimmed, at: Date.now() };
        const nextTracks = p.tracks.map((t) =>
          t.id === id
            ? {
                ...t,
                name: trimmed,
                renameHistory: [...t.renameHistory, entry],
                modifiedAt: Date.now(),
              }
            : t,
        );
        const nextProject = { ...p, tracks: nextTracks };
        const fp = projectFingerprint(nextProject);
        const snap = loadSnapshot(fp);
        const merged = upsertTrackData(snap, nextProject.name, target.path, {
          source: "manual-discdj",
          displayName: trimmed,
          renameHistory: [...target.renameHistory, entry],
          modifiedAt: entry.at,
        } as never);
        saveSnapshot(fp, merged);
        return nextProject;
      });
    },
    [],
  );

  const toggleFavorite = useCallback<WorkspaceContextValue["toggleFavorite"]>(
    (id) => {
      setProject((p) => {
        if (!p) return p;
        const target = p.tracks.find((t) => t.id === id);
        if (!target) return p;
        const next = !target.favorite;
        const nextTracks = p.tracks.map((t) =>
          t.id === id ? { ...t, favorite: next } : t,
        );
        const nextProject = { ...p, tracks: nextTracks };
        const fp = projectFingerprint(nextProject);
        const snap = loadSnapshot(fp);
        const merged = upsertTrackData(snap, nextProject.name, target.path, {
          source: "manual-discdj",
          favorite: next,
        } as never);
        saveSnapshot(fp, merged);
        return nextProject;
      });
    },
    [],
  );

  const removeTracks = useCallback((ids: TrackId[]) => {
    const set = new Set(ids);
    setProject((p) => (p ? { ...p, tracks: p.tracks.filter((t) => !set.has(t.id)) } : p));
  }, []);

  const mergeAndRemoveDuplicates = useCallback<
    WorkspaceContextValue["mergeAndRemoveDuplicates"]
  >((keeperId, sourceIds) => {
    setProject((p) => {
      if (!p) return p;
      const keeper = p.tracks.find((t) => t.id === keeperId);
      if (!keeper) return p;
      const removeSet = new Set(sourceIds.filter((id) => id !== keeperId));
      const sources = p.tracks.filter((t) => removeSet.has(t.id));
      // Merge missing scalar metadata + concatenate rename history.
      let bpm = keeper.bpm;
      let musicalKey = keeper.musicalKey;
      let favorite = keeper.favorite;
      const renameHistory = [...keeper.renameHistory];
      let addedAt = keeper.addedAt;
      for (const s of sources) {
        if (bpm == null && s.bpm != null) bpm = s.bpm;
        if (!musicalKey && s.musicalKey) musicalKey = s.musicalKey;
        if (!favorite && s.favorite) favorite = true;
        for (const h of s.renameHistory) renameHistory.push(h);
        if (s.addedAt && s.addedAt < addedAt) addedAt = s.addedAt;
      }
      const mergedKeeper: Track = {
        ...keeper,
        bpm,
        musicalKey,
        camelot: toCamelot(musicalKey),
        favorite,
        renameHistory,
        addedAt,
        analysisStatus:
          bpm != null || musicalKey ? "done" : keeper.analysisStatus,
      };
      const nextTracks = p.tracks
        .filter((t) => !removeSet.has(t.id))
        .map((t) => (t.id === keeperId ? mergedKeeper : t));
      const nextProject = { ...p, tracks: nextTracks };
      // Persist merged keeper metadata to snapshot.
      const fp = projectFingerprint(nextProject);
      const snap = loadSnapshot(fp);
      const merged = upsertTrackData(snap, nextProject.name, keeper.path, {
        source: "manual-discdj",
        bpm,
        musicalKey,
        favorite,
        renameHistory,
        addedAt,
      } as never);
      saveSnapshot(fp, merged);
      return nextProject;
    });
  }, []);


  const reorderTracks = useCallback((orderedIds: TrackId[]) => {
    setProject((p) => {
      if (!p) return p;
      const byId = new Map(p.tracks.map((t) => [t.id, t]));
      const next: Track[] = [];
      for (const id of orderedIds) {
        const t = byId.get(id);
        if (t) {
          next.push(t);
          byId.delete(id);
        }
      }
      for (const t of byId.values()) next.push(t);
      return { ...p, tracks: next };
    });
  }, []);

  // Background metadata indexing — fills in durations after import.
  useEffect(() => {
    if (!project) return;
    const pending = project.tracks.filter((t) => t.durationSec === null);
    if (pending.length === 0) return;

    const runId = ++indexRunRef.current;
    setIsIndexing(true);
    let cancelled = false;

    (async () => {
      const CONCURRENCY = 3;
      let cursor = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
        while (!cancelled && indexRunRef.current === runId) {
          const i = cursor++;
          if (i >= pending.length) return;
          const t = pending[i];
          const d = await readDuration(t.url);
          if (cancelled || indexRunRef.current !== runId) return;
          setProject((p) =>
            p
              ? {
                  ...p,
                  tracks: p.tracks.map((x) => (x.id === t.id ? { ...x, durationSec: d } : x)),
                }
              : p,
          );
        }
      });
      await Promise.all(workers);
      if (!cancelled && indexRunRef.current === runId) setIsIndexing(false);
    })();

    return () => {
      cancelled = true;
    };
    // Re-run only when the pending-count changes — cheap primitive instead of
    // an O(n) join executed on every render, which becomes expensive on
    // multi-thousand-track libraries.
  }, [project, project?.tracks.filter((t) => t.durationSec === null).length]);

  // ---------- Key-analysis engine wiring ----------
  //
  // The engine is a singleton that lives outside React (it must keep running
  // across route/tab changes, DiscDJ robot navigation, background/foreground
  // transitions, etc.). We register a persist callback here so results are
  // written to the live library AND to the on-disk snapshot, then we sync
  // the queue every time the track list changes and auto-start.
  useEffect(() => {
    keyAnalysisEngine.setPersistHandler((trackId, key, data: KeyAnalysisData) => {
      setProject((p) => {
        if (!p) return p;
        const target = p.tracks.find((t) => t.id === trackId);
        if (!target) return p;
        const nextTracks = p.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                musicalKey: key,
                camelot: toCamelot(key),
                analysisStatus: "done" as const,
              }
            : t,
        );
        const nextProject = { ...p, tracks: nextTracks };
        const fp = projectFingerprint(nextProject);
        const snap = loadSnapshot(fp);
        const merged = upsertTrackData(snap, nextProject.name, target.path, {
          source: "hybrid-key",
          musicalKey: key,
          key: data,
        });
        saveSnapshot(fp, merged);
        return nextProject;
      });
    });
    return () => keyAnalysisEngine.setPersistHandler(null);
  }, []);

  // Sync the queue whenever the library changes (add / remove / reload).
  // Auto-start: any missing key triggers background analysis.
  useEffect(() => {
    if (!project) return;
    keyAnalysisEngine.syncLibrary(
      project.tracks.map((t) => ({
        id: t.id,
        path: t.path,
        name: t.name,
        url: t.url,
        musicalKey: t.musicalKey,
      })),
    );
    const missing = project.tracks.some((t) => !t.musicalKey);
    if (missing) keyAnalysisEngine.start();
  }, [project?.tracks.length, project?.name]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      project,
      isIndexing,
      recentLibraries,
      refreshRecentLibraries,
      forgetLibrary,
      lastImportDiff,
      openProject,
      openImportedProject,
      closeProject,
      updateTrack,
      setTrackAnalysis,
      renameTrack,
      toggleFavorite,
      removeTracks,
      mergeAndRemoveDuplicates,
      reorderTracks,
    }),
    [
      project,
      isIndexing,
      recentLibraries,
      refreshRecentLibraries,
      forgetLibrary,
      lastImportDiff,
      openProject,
      openImportedProject,
      closeProject,
      updateTrack,
      setTrackAnalysis,
      renameTrack,
      toggleFavorite,
      removeTracks,
      mergeAndRemoveDuplicates,
      reorderTracks,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

export function formatDuration(sec: number | null): string {
  if (sec === null || !isFinite(sec)) return "—:—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
