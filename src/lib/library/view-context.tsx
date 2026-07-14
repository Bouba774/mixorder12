/**
 * LibraryView context — shared display state (sort, filter, search) between
 * the library grid and any module that needs to know the "visible order"
 * of tracks. The rename module reads from here so batch renames always
 * follow the exact order the user currently sees.
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Track } from "@/lib/workspace-context";
import { sortTracks, type SortDir, type SortField } from "./sort";

interface LibraryViewValue {
  sortField: SortField;
  sortDir: SortDir;
  favOnly: boolean;
  query: string;
  setSortField: (f: SortField) => void;
  setSortDir: (d: SortDir) => void;
  setFavOnly: (v: boolean) => void;
  setQuery: (q: string) => void;
  /** Apply current sort + filters to a track list. */
  applyView: (tracks: Track[]) => Track[];
}

const LibraryViewContext = createContext<LibraryViewValue | null>(null);

export function LibraryViewProvider({ children }: { children: ReactNode }) {
  const [sortField, setSortField] = useState<SortField>("manual");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [favOnly, setFavOnly] = useState(false);
  const [query, setQuery] = useState("");

  const value = useMemo<LibraryViewValue>(() => {
    const applyView = (tracks: Track[]) => {
      let arr = sortTracks(tracks, sortField, sortDir);
      if (favOnly) arr = arr.filter((t) => t.favorite);
      const q = query.trim().toLowerCase();
      if (q) {
        arr = arr.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.originalName.toLowerCase().includes(q) ||
            (t.musicalKey?.toLowerCase().includes(q) ?? false) ||
            (t.camelot?.toLowerCase().includes(q) ?? false) ||
            (t.bpm != null && String(Math.round(t.bpm)).includes(q)) ||
            t.extension.includes(q),
        );
      }
      return arr;
    };
    return {
      sortField,
      sortDir,
      favOnly,
      query,
      setSortField,
      setSortDir,
      setFavOnly,
      setQuery,
      applyView,
    };
  }, [sortField, sortDir, favOnly, query]);

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
