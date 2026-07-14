import { useCallback, useMemo, useState } from "react";
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, GripVertical,
  CheckSquare, Square, X, Trash2, Check, Star, Settings2,
} from "lucide-react";
import {
  DndContext, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable,
  verticalListSortingStrategy, sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { formatDuration, useWorkspace, type Track, type TrackId } from "@/lib/workspace-context";
import { useLibraryView } from "@/lib/library/view-context";
import { SORT_OPTIONS, type SortField, type SortDir } from "@/lib/library/sort";
import { PlayPauseButton } from "../player/PlayPauseButton";



export interface ColumnPrefs {
  duration: boolean;
  bpm: boolean;
  key: boolean;
  camelot: boolean;
  type: boolean;
  size: boolean;
  extension: boolean;
  date: boolean;
  path: boolean;
}
const DEFAULT_COLS: ColumnPrefs = {
  duration: true, bpm: true, key: true, camelot: true,
  type: false, size: false, extension: true, date: false, path: false,
};

function formatSize(bytes: number): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}
function formatDate(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export function LibraryTab() {
  const { project, reorderTracks, removeTracks, toggleFavorite, isIndexing } =
    useWorkspace();
  const {
    query, setQuery,
    sortField, setSortField,
    sortDir, setSortDir,
    favOnly, setFavOnly,
    applyView,
  } = useLibraryView();
  const [selection, setSelection] = useState<Set<TrackId>>(new Set());
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [cols, setCols] = useState<ColumnPrefs>(DEFAULT_COLS);


  const clearSelection = useCallback(() => setSelection(new Set()), []);
  const toggleSelect = useCallback((id: TrackId, additive: boolean) => {
    setSelection((prev) => {
      const next = additive ? new Set(prev) : new Set<TrackId>();
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const isSelectionMode = selection.size > 0;

  const tracks = project?.tracks ?? [];
  const filtered = useMemo<Track[]>(() => applyView(tracks), [tracks, applyView]);


  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const canReorder = sortField === "manual" && !query.trim() && !favOnly;

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    if (!project) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = project.tracks.map((t) => t.id);
    const from = ids.indexOf(active.id as TrackId);
    const to = ids.indexOf(over.id as TrackId);
    if (from < 0 || to < 0) return;
    reorderTracks(arrayMove(ids, from, to));
  }, [project, reorderTracks]);

  const selectAllVisible = useCallback(() => {
    setSelection(new Set(filtered.map((t) => t.id)));
  }, [filtered]);
  const invertSelection = useCallback(() => {
    setSelection((prev) => {
      const next = new Set<TrackId>();
      for (const t of filtered) if (!prev.has(t.id)) next.add(t.id);
      return next;
    });
  }, [filtered]);
  const deleteSelection = useCallback(() => {
    if (selection.size === 0) return;
    removeTracks(Array.from(selection));
    clearSelection();
  }, [selection, removeTracks, clearSelection]);

  if (!project) return null;

  const activeSortLabel = SORT_OPTIONS.find((s) => s.id === sortField)?.label ?? "Perso";

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher titre, BPM, tonalité, extension…"
            className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-9 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Effacer"
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSortSheetOpen(true)}
            className="inline-flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground hover:border-border-strong"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <ArrowUpDown className="h-3.5 w-3.5" /> Trier
            </span>
            <span className="flex items-center gap-1 text-foreground truncate">
              {activeSortLabel}
              {sortField !== "manual" && sortField !== "import" && (
                sortDir === "asc"
                  ? <ArrowUp className="h-3 w-3 text-primary" />
                  : <ArrowDown className="h-3 w-3 text-primary" />
              )}
            </span>
          </button>
          <button
            onClick={() => setFavOnly(!favOnly)}
            aria-pressed={favOnly}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${
              favOnly ? "border-primary/40 bg-accent/40 text-primary" : "border-border bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${favOnly ? "fill-current" : ""}`} />
          </button>
          <button
            onClick={() => setColsOpen(true)}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={isSelectionMode ? clearSelection : selectAllVisible}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${
              isSelectionMode ? "border-primary/40 bg-accent/40 text-primary" : "border-border bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            {isSelectionMode ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            {isSelectionMode ? selection.size : "Sélect."}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Bibliothèque
          </h2>
          <span className="text-[11px] text-muted-foreground">
            {filtered.length} / {project.tracks.length}
            {isIndexing && " · indexation…"}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center text-sm text-muted-foreground">
            {query || favOnly ? "Aucun résultat." : "Aucun fichier audio."}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={filtered.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <ul className="overflow-hidden rounded-xl border border-border bg-surface">
                {filtered.map((t) => (
                  <Row
                    key={t.id}
                    track={t}
                    cols={cols}
                    selected={selection.has(t.id)}
                    selectionMode={isSelectionMode}
                    onToggle={(add) => toggleSelect(t.id, add)}
                    onFav={() => toggleFavorite(t.id)}
                    canDrag={canReorder}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {isSelectionMode && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-surface/95 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-md items-center gap-2">
            <button onClick={clearSelection} className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-surface-elevated" aria-label="Annuler">
              <X className="h-4 w-4" />
            </button>
            <div className="flex-1 text-sm font-medium">{selection.size} sélectionné{selection.size > 1 ? "s" : ""}</div>
            <button onClick={invertSelection} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground">
              Inverser
            </button>
            <button onClick={selectAllVisible} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground">
              Tout
            </button>
            <button onClick={deleteSelection} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground">
              <Trash2 className="h-3.5 w-3.5" /> Retirer
            </button>
          </div>
        </div>
      )}

      {sortSheetOpen && (
        <BottomSheet onClose={() => setSortSheetOpen(false)} title="Trier la bibliothèque">
          <ul className="space-y-1">
            {SORT_OPTIONS.map((opt) => {
              const active = opt.id === sortField;
              const fixed = opt.id === "manual" || opt.id === "import";
              return (
                <li key={opt.id}>
                  <button
                    onClick={() => {
                      if (fixed) { setSortField(opt.id); setSortDir("asc"); setSortSheetOpen(false); return; }
                      if (active) setSortDir(sortDir === "asc" ? "desc" : "asc");
                      else { setSortField(opt.id); setSortDir("asc"); }
                    }}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm ${
                      active ? "border-primary/40 bg-accent/40 text-foreground" : "border-border bg-background hover:border-border-strong"
                    }`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    {active && !fixed && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-primary">
                        {sortDir === "asc" ? <><ArrowUp className="h-3.5 w-3.5" />Asc</> : <><ArrowDown className="h-3.5 w-3.5" />Desc</>}
                      </span>
                    )}
                    {active && fixed && <Check className="h-4 w-4 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </BottomSheet>
      )}

      {colsOpen && (
        <BottomSheet onClose={() => setColsOpen(false)} title="Colonnes affichées">
          <ul className="grid grid-cols-2 gap-2">
            {(Object.keys(cols) as Array<keyof ColumnPrefs>).map((k) => (
              <li key={k}>
                <label className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm ${cols[k] ? "border-primary/40 bg-accent/30" : "border-border"}`}>
                  <span className="capitalize">{k}</span>
                  <input type="checkbox" checked={cols[k]} onChange={(e) => setCols({ ...cols, [k]: e.target.checked })} className="accent-primary" />
                </label>
              </li>
            ))}
          </ul>
        </BottomSheet>
      )}
    </div>
  );
}

function Row({
  track, cols, selected, selectionMode, onToggle, onFav, canDrag,
}: {
  track: Track;
  cols: ColumnPrefs;
  selected: boolean;
  selectionMode: boolean;
  onToggle: (additive: boolean) => void;
  onFav: () => void;
  canDrag: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: track.id, disabled: !canDrag });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 border-b border-border/60 px-2 py-2.5 last:border-b-0 ${
        selected ? "bg-accent/30" : "hover:bg-surface-elevated"
      } ${isDragging ? "z-10 shadow-gold" : ""}`}
    >
      {canDrag && (
        <button {...attributes} {...listeners} aria-label="Réordonner" className="grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/60 hover:text-foreground active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {selectionMode ? (
        <button
          onClick={(e) => onToggle(e.shiftKey || e.metaKey || e.ctrlKey || selectionMode)}
          aria-label={selected ? "Désélectionner" : "Sélectionner"}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface-elevated"
        >
          {selected ? (
            <div className="grid h-4 w-4 place-items-center rounded-sm bg-primary text-primary-foreground">
              <Check className="h-3 w-3" strokeWidth={3} />
            </div>
          ) : (
            <div className="h-4 w-4 rounded-sm border border-border-strong" />
          )}
        </button>
      ) : (
        <PlayPauseButton trackId={track.id} size="md" />
      )}


      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium leading-tight">{track.name}</p>
          {track.favorite && <Star className="h-3 w-3 shrink-0 fill-primary text-primary" />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {cols.duration && <span className="tabular-nums">{formatDuration(track.durationSec)}</span>}
          {cols.bpm && <Chip label="BPM" value={track.bpm != null ? Math.round(track.bpm).toString() : null} />}
          {cols.key && <Chip label="Key" value={track.musicalKey} />}
          {cols.camelot && <Chip label="Cam" value={track.camelot} />}
          {cols.size && <span className="tabular-nums">{formatSize(track.size)}</span>}
          {cols.date && <span className="tabular-nums">{formatDate(track.addedAt)}</span>}
          {cols.type && <span className="opacity-70">{track.mimeType.split("/")[1] ?? track.mimeType}</span>}
          {cols.path && <span className="truncate opacity-60">{track.path}</span>}
        </div>
      </div>

      <button
        onClick={onFav}
        aria-label={track.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-primary"
      >
        <Star className={`h-4 w-4 ${track.favorite ? "fill-primary text-primary" : ""}`} />
      </button>
      {cols.extension && (
        <span className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground/70">
          {track.extension}
        </span>
      )}
    </li>
  );
}

function Chip({ label, value }: { label: string; value: string | null }) {
  const filled = value !== null && value !== "";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
      filled ? "bg-primary/15 text-primary" : "bg-surface-elevated text-muted-foreground/60"
    }`}>
      <span className="uppercase tracking-wider opacity-70">{label}</span>
      <span className="tabular-nums">{filled ? value : "—"}</span>
    </span>
  );
}

function BottomSheet({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="animate-fade-up rounded-t-2xl border-t border-border bg-surface px-4 pb-8 pt-4 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-elevated" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
