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
}

export interface Project {
  name: string;
  createdAt: number;
  tracks: Track[];
}

interface WorkspaceContextValue {
  project: Project | null;
  /** True while durations / metadata are being read. */
  isIndexing: boolean;
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
  /** Remove tracks from the library (does NOT touch disk). */
  removeTracks: (ids: TrackId[]) => void;
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

function buildProject(imported: ImportedProject): Project {
  const tracks: Track[] = imported.tracks
    .map((t) => ({
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
    }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  const shell: Project = {
    name: imported.name,
    createdAt: Date.now(),
    tracks,
  };
  // Rehydrate any previously analysed BPM / key so the library reopens ready.
  const fp = projectFingerprint(shell);
  const snap = loadSnapshot(fp);
  return { ...shell, tracks: applyAnalysisToTracks(tracks, snap) };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<Project | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const indexRunRef = useRef(0);

  const openImportedProject = useCallback((imported: ImportedProject) => {
    if (imported.tracks.length === 0) return;
    setProject(buildProject(imported));
  }, []);

  const openProject = useCallback((input: FileList | File[]) => {
    const imported = projectFromFileList(input);
    if (imported) setProject(buildProject(imported));
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

  const removeTracks = useCallback((ids: TrackId[]) => {
    const set = new Set(ids);
    setProject((p) => (p ? { ...p, tracks: p.tracks.filter((t) => !set.has(t.id)) } : p));
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
  }, [project?.tracks.map((t) => (t.durationSec === null ? t.id : "")).join("|")]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      project,
      isIndexing,
      openProject,
      openImportedProject,
      closeProject,
      updateTrack,
      setTrackAnalysis,
      removeTracks,
      reorderTracks,
    }),
    [
      project,
      isIndexing,
      openProject,
      openImportedProject,
      closeProject,
      updateTrack,
      setTrackAnalysis,
      removeTracks,
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
