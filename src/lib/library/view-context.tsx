/**
 * LibraryView context — shared display state (sort + search) between
 * the library grid and any module that needs to know the "visible order"
 * of tracks. The rename module reads from here so batch renames always
 * follow the exact order the user currently sees.
 *
 * The favorites feature was removed from the UI; this context therefore
 * no longer exposes any `favOnly` filter. The `favorite` field still
 * exists on `Track` for backward compatibility with persisted data.
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { formatDuration, type Track } from "@/lib/workspace-context";
import { sortTracks, type SortDir, type SortField } from "./sort";

interface LibraryViewValue {
  sortField: SortField;
  sortDir: SortDir;
  query: string;
  setSortField: (f: SortField) => void;
  setSortDir: (d: SortDir) => void;
  setQuery: (q: string) => void;
  /** Apply current sort + text search to a track list. */
  applyView: (tracks: Track[]) => Track[];
}

const LibraryViewContext = createContext<LibraryViewValue | null>(null);

function matchTrack(t: Track, q: string): boolean {
  if (t.name.toLowerCase().includes(q)) return true;
  if (t.originalName.toLowerCase().includes(q)) return true;
  if (t.musicalKey && t.musicalKey.toLowerCase().includes(q)) return true;
  if (t.camelot && t.camelot.toLowerCase().includes(q)) return true;
  if (t.bpm != null && String(Math.round(t.bpm)).includes(q)) return true;
  if (t.extension.includes(q)) return true;
  if (t.durationSec != null) {
    if (formatDuration(t.durationSec).includes(q)) return true;
  }
  return false;
}

export function LibraryViewProvider({ children }: { children: ReactNode }) {
  const [sortField, setSortField] = useState<SortField>("manual");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [query, setQuery] = useState("");

  const value = useMemo<LibraryViewValue>(() => {
    const applyView = (tracks: Track[]) => {
      let arr = sortTracks(tracks, sortField, sortDir);
      const q = query.trim().toLowerCase();
      if (q) arr = arr.filter((t) => matchTrack(t, q));
      return arr;
    };
    return {
      sortField,
      sortDir,
      query,
      setSortField,
      setSortDir,
      setQuery,
      applyView,
    };
  }, [sortField, sortDir, query]);

  return (
    <LibraryViewContext.Provider value={value}>
      {children}
    </LibraryViewContext.Provider>
  );
}

export function useLibraryView(): LibraryViewValue {
  const ctx = useContext(LibraryViewContext);
  if (!ctx)
    throw new Error(
      "useLibraryView must be used within a LibraryViewProvider",
    );
  return ctx;
}
