/**
 * SetBuilder context — owns all named Sets for the current project.
 *
 * The context stores each Set as an ordered list of track paths (stable
 * across re-imports). Consumers get a resolved `SetView` where each entry
 * is a live Track from the workspace, so drag-and-drop, playback and
 * rename all read from a single source of truth.
 *
 * The "active" Set is the one currently open in the Set Builder UI. When
 * an active Set exists, the Rename module uses its order automatically
 * (see RenameTab).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useWorkspace, type Track } from "@/lib/workspace-context";
import {
  loadActiveSetId,
  loadSets,
  makeSetId,
  saveActiveSetId,
  saveSets,
  type StoredSet,
} from "./persistence";
import { getMode, type SetModeId } from "./modes";

export interface ResolvedSet extends StoredSet {
  tracks: Track[]; // resolved and filtered to existing tracks only
}

interface SetBuilderContextValue {
  sets: StoredSet[];
  activeSetId: string | null;
  activeSet: ResolvedSet | null;
  /** Ordered track IDs of the active set (empty when none). */
  activeOrderedIds: string[];
  createSet: (name: string, mode: SetModeId, trackIds: string[]) => string;
  duplicateSet: (id: string) => string | null;
  renameSet: (id: string, name: string) => void;
  deleteSet: (id: string) => void;
  setActive: (id: string | null) => void;
  updateActiveOrder: (orderedIds: string[]) => void;
  updateActiveMode: (mode: SetModeId) => void;
  removeFromActive: (trackId: string) => void;
  addToActive: (trackIds: string[]) => void;
}

const SetBuilderContext = createContext<SetBuilderContextValue | null>(null);

export function SetBuilderProvider({ children }: { children: ReactNode }) {
  const { project } = useWorkspace();

  const [sets, setSets] = useState<StoredSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);

  // Load on project change
  useEffect(() => {
    if (!project) {
      setSets([]);
      setActiveSetId(null);
      return;
    }
    setSets(loadSets(project).sets);
    setActiveSetId(loadActiveSetId(project));
  }, [project?.name, project?.createdAt]);

  // Persist on change
  useEffect(() => {
    if (!project) return;
    saveSets(project, { v: 1, sets });
  }, [project, sets]);
  useEffect(() => {
    if (!project) return;
    saveActiveSetId(project, activeSetId);
  }, [project, activeSetId]);

  const trackByPath = useMemo(() => {
    const m = new Map<string, Track>();
    if (project) for (const t of project.tracks) m.set(t.path, t);
    return m;
  }, [project]);

  const trackById = useMemo(() => {
    const m = new Map<string, Track>();
    if (project) for (const t of project.tracks) m.set(t.id, t);
    return m;
  }, [project]);

  const activeSet: ResolvedSet | null = useMemo(() => {
    if (!activeSetId) return null;
    const s = sets.find((x) => x.id === activeSetId);
    if (!s) return null;
    const tracks: Track[] = [];
    for (const p of s.paths) {
      const t = trackByPath.get(p);
      if (t) tracks.push(t);
    }
    return { ...s, tracks };
  }, [activeSetId, sets, trackByPath]);

  const activeOrderedIds = useMemo(
    () => activeSet?.tracks.map((t) => t.id) ?? [],
    [activeSet],
  );

  const patchSet = useCallback((id: string, patch: Partial<StoredSet>) => {
    setSets((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s,
      ),
    );
  }, []);

  const createSet: SetBuilderContextValue["createSet"] = useCallback(
    (name, mode, trackIds) => {
      const now = Date.now();
      const paths: string[] = [];
      for (const id of trackIds) {
        const t = trackById.get(id);
        if (t) paths.push(t.path);
      }
      const id = makeSetId();
      const s: StoredSet = {
        id,
        name: name.trim() || "Nouveau set",
        mode,
        paths,
        createdAt: now,
        updatedAt: now,
      };
      setSets((prev) => [s, ...prev]);
      setActiveSetId(id);
      return id;
    },
    [trackById],
  );

  const duplicateSet: SetBuilderContextValue["duplicateSet"] = useCallback(
    (id) => {
      const src = sets.find((s) => s.id === id);
      if (!src) return null;
      const now = Date.now();
      const copy: StoredSet = {
        ...src,
        id: makeSetId(),
        name: `${src.name} (copie)`,
        createdAt: now,
        updatedAt: now,
      };
      setSets((prev) => [copy, ...prev]);
      return copy.id;
    },
    [sets],
  );

  const renameSet: SetBuilderContextValue["renameSet"] = useCallback(
    (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      patchSet(id, { name: trimmed });
    },
    [patchSet],
  );

  const deleteSet: SetBuilderContextValue["deleteSet"] = useCallback(
    (id) => {
      setSets((prev) => prev.filter((s) => s.id !== id));
      setActiveSetId((cur) => (cur === id ? null : cur));
    },
    [],
  );

  const setActive: SetBuilderContextValue["setActive"] = useCallback((id) => {
    setActiveSetId(id);
  }, []);

  const updateActiveOrder: SetBuilderContextValue["updateActiveOrder"] =
    useCallback(
      (orderedIds) => {
        if (!activeSetId) return;
        const paths: string[] = [];
        for (const id of orderedIds) {
          const t = trackById.get(id);
          if (t) paths.push(t.path);
        }
        patchSet(activeSetId, { paths });
      },
      [activeSetId, patchSet, trackById],
    );

  const updateActiveMode: SetBuilderContextValue["updateActiveMode"] =
    useCallback(
      (mode) => {
        if (!activeSetId) return;
        const s = sets.find((x) => x.id === activeSetId);
        if (!s) return;
        // Regenerate the order from the current tracks with the new mode.
        const currentTracks: Track[] = [];
        for (const p of s.paths) {
          const t = trackByPath.get(p);
          if (t) currentTracks.push(t);
        }
        const orderedIds = getMode(mode).build(currentTracks);
        const orderedPaths: string[] = [];
        for (const id of orderedIds) {
          const t = trackById.get(id);
          if (t) orderedPaths.push(t.path);
        }
        patchSet(activeSetId, { mode, paths: orderedPaths });
      },
      [activeSetId, patchSet, sets, trackById, trackByPath],
    );

  const removeFromActive: SetBuilderContextValue["removeFromActive"] =
    useCallback(
      (trackId) => {
        if (!activeSetId) return;
        const t = trackById.get(trackId);
        if (!t) return;
        const s = sets.find((x) => x.id === activeSetId);
        if (!s) return;
        patchSet(activeSetId, { paths: s.paths.filter((p) => p !== t.path) });
      },
      [activeSetId, patchSet, sets, trackById],
    );

  const addToActive: SetBuilderContextValue["addToActive"] = useCallback(
    (trackIds) => {
      if (!activeSetId) return;
      const s = sets.find((x) => x.id === activeSetId);
      if (!s) return;
      const existing = new Set(s.paths);
      const additions: string[] = [];
      for (const id of trackIds) {
        const t = trackById.get(id);
        if (t && !existing.has(t.path)) additions.push(t.path);
      }
      if (!additions.length) return;
      patchSet(activeSetId, { paths: [...s.paths, ...additions] });
    },
    [activeSetId, patchSet, sets, trackById],
  );

  const value = useMemo<SetBuilderContextValue>(
    () => ({
      sets,
      activeSetId,
      activeSet,
      activeOrderedIds,
      createSet,
      duplicateSet,
      renameSet,
      deleteSet,
      setActive,
      updateActiveOrder,
      updateActiveMode,
      removeFromActive,
      addToActive,
    }),
    [
      sets,
      activeSetId,
      activeSet,
      activeOrderedIds,
      createSet,
      duplicateSet,
      renameSet,
      deleteSet,
      setActive,
      updateActiveOrder,
      updateActiveMode,
      removeFromActive,
      addToActive,
    ],
  );

  return (
    <SetBuilderContext.Provider value={value}>
      {children}
    </SetBuilderContext.Provider>
  );
}

export function useSetBuilder(): SetBuilderContextValue {
  const ctx = useContext(SetBuilderContext);
  if (!ctx)
    throw new Error("useSetBuilder must be used within a SetBuilderProvider");
  return ctx;
}
