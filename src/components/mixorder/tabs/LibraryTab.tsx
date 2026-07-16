/**
 * LibraryTab — the main working surface of MixOrder.
 *
 * This screen is the "cœur" of the app: it lists every track in the
 * current project, exposes search / filters / sort / reorder / selection
 * and links out to every other module (Robot, Analysis, Duplicates,
 * Rename, Set Builder). The rendering here is purely presentational —
 * all business logic lives in workspace-context / library/view-context /
 * duplicates & analysis engines. Editing this file must not touch that
 * logic.
 *
 * Removed: favorites system (both the star toggle and the "favorites
 * only" filter). The `favorite` field on `Track` is kept for persisted
 * data compatibility but is no longer surfaced in the UI.
 */

import { useCallback, useMemo, useState } from "react";
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, GripVertical,
  X, Trash2, Check,
  FolderInput, Move, Music2, Copy,
  Clock, SlidersHorizontal, Info,
} from "lucide-react";
import {
  DndContext, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable,
  verticalListSortingStrategy, sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { formatDuration, useWorkspace, type Track, type TrackId } from "@/lib/workspace-context";
import { useLibraryView } from "@/lib/library/view-context";
import { SORT_OPTIONS } from "@/lib/library/sort";
import { useDuplicates } from "@/hooks/useDuplicates";
import { PlayPauseButton } from "../player/PlayPauseButton";
import { TrackInfoSheet } from "../TrackInfoSheet";

// ─────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Camelot palette — one dot color per key family (visual anchor for
// each track, exactly like TempoKey's colored bullet). Falls back to a
// neutral tone when the Camelot key hasn't been detected yet.
// ─────────────────────────────────────────────────────────────

function camelotPalette(camelot: string | null | undefined): {
  bg: string;
  fg: string;
  dot: string;
} {
  if (!camelot) {
    return { bg: "bg-muted", fg: "text-muted-foreground", dot: "bg-muted-foreground" };
  }
  const isMinor = /A$/.test(camelot);
  const n = parseInt(camelot, 10);
  // Warm hues for minor (A), cool hues for major (B).
  const swatches = isMinor
    ? [
        "#F87171", "#FB923C", "#F59E0B", "#FBBF24",
        "#A3E635", "#4ADE80", "#34D399", "#22D3EE",
        "#60A5FA", "#818CF8", "#A78BFA", "#F472B6",
      ]
    : [
        "#60A5FA", "#38BDF8", "#22D3EE", "#2DD4BF",
        "#34D399", "#A3E635", "#FACC15", "#FB923C",
        "#F87171", "#F472B6", "#C084FC", "#818CF8",
      ];
  const c = swatches[(n - 1) % swatches.length] ?? "#93C5FD";
  return { bg: "", fg: "", dot: "", ...({ __c: c } as any), };
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function LibraryTab() {
  const {
    project, reorderTracks, removeTracks,
    isIndexing,
  } = useWorkspace();
  const {
    query, setQuery,
    sortField, setSortField,
    sortDir, setSortDir,
    applyView,
  } = useLibraryView();
  const { groups: dupGroups } = useDuplicates();

  const [selection, setSelection] = useState<Set<TrackId>>(new Set());
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [infoTrackId, setInfoTrackId] = useState<TrackId | null>(null);

  const tracks = project?.tracks ?? [];

  // Set of track ids that live inside a duplicate group.
  const duplicateIds = useMemo(() => {
    const s = new Set<TrackId>();
    for (const g of dupGroups) for (const id of g.trackIds) s.add(id);
    return s;
  }, [dupGroups]);

  // Filtered + sorted view.
  const filtered = useMemo<Track[]>(() => {
    return applyView(tracks);
  }, [tracks, applyView]);

  // ── Selection helpers ──
  const clearSelection = useCallback(() => {
    setSelection(new Set());
    setSelectionMode(false);
  }, []);
  const toggleSelect = useCallback((id: TrackId) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const selectAllVisible = useCallback(() => {
    setSelection(new Set(filtered.map((t) => t.id)));
    setSelectionMode(true);
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

  // ── DnD ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const canReorder =
    reorderMode &&
    sortField === "manual" &&
    !query.trim();

  const handleDragStart = useCallback((_e: DragStartEvent) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate?.(15); } catch { /* noop */ }
    }
  }, []);
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

  if (!project) return null;

  const totalTracks = project.tracks.length;
  const activeSortLabel =
    SORT_OPTIONS.find((s) => s.id === sortField)?.label ?? "Perso";

  const isFiltering = query.trim().length > 0;

  return (
    <div className="space-y-3 pb-4 animate-fade-in">
      {/* ─────── Search + action buttons row (TempoKey layout) ─────── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Recherche : titre, BPM, tonalité…"
            className="h-12 w-full rounded-2xl border border-border bg-surface pl-11 pr-10 text-sm placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Effacer la recherche"
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setReorderMode((v) => !v);
            if (!reorderMode) setSelectionMode(false);
          }}
          disabled={sortField !== "manual" || isFiltering}
          aria-pressed={reorderMode}
          aria-label="Mode réorganisation"
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            reorderMode
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-surface text-foreground hover:border-border-strong"
          }`}
        >
          <Move className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setSortSheetOpen(true)}
          aria-label={`Trier · ${activeSortLabel}`}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-surface text-foreground transition-colors hover:border-border-strong"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>
      </div>

      {/* ─────── Count + active sort ─────── */}
      <div className="flex items-baseline justify-between px-1 text-[13px]">
        <span className="tabular-nums text-muted-foreground">
          {filtered.length} / {totalTracks} morceau{totalTracks > 1 ? "x" : ""}
          {isIndexing && " · indexation…"}
        </span>
        <button
          type="button"
          onClick={() => setSortSheetOpen(true)}
          className="inline-flex items-center gap-1 font-medium text-primary hover:opacity-85"
        >
          Ordre actif : {activeSortLabel}
          {sortField !== "manual" && sortField !== "import" && (
            sortDir === "asc"
              ? <ArrowUp className="h-3.5 w-3.5" />
              : <ArrowDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* ─────── Track list ─────── */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <EmptyState
            isFiltering={isFiltering}
            onClear={() => setQuery("")}
            onImport={() => { /* handled at shell level */ }}
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filtered.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-2">
                {filtered.map((t, i) => (
                  <TrackCard
                    key={t.id}
                    track={t}
                    selected={selection.has(t.id)}
                    selectionMode={selectionMode}
                    isDuplicate={duplicateIds.has(t.id)}
                    canDrag={canReorder}
                    onToggleSelect={() => toggleSelect(t.id)}
                    style={{
                      animationDelay: `${Math.min(i * 12, 240)}ms`,
                    }}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* ─────── Contextual selection bar ─────── */}
      {selectionMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 sm:bottom-28">
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-1.5 rounded-2xl border border-border/70 bg-surface/95 p-1.5 shadow-2xl backdrop-blur-md animate-fade-in">
            <button
              onClick={clearSelection}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-surface-elevated"
              aria-label="Quitter la sélection"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex-1 text-sm font-medium tabular-nums">
              {selection.size}{" "}
              <span className="text-muted-foreground">
                sélectionné{selection.size > 1 ? "s" : ""}
              </span>
            </div>
            <button
              onClick={invertSelection}
              className="hidden h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-muted-foreground hover:bg-surface-elevated hover:text-foreground sm:inline-flex"
            >
              Inverser
            </button>
            <button
              onClick={selectAllVisible}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            >
              Tout
            </button>
            <button
              onClick={deleteSelection}
              disabled={selection.size === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-destructive px-3 text-xs font-semibold text-destructive-foreground disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> Retirer
            </button>
          </div>
        </div>
      )}

      {/* ─────── Sort sheet ─────── */}
      {sortSheetOpen && (
        <BottomSheet
          onClose={() => setSortSheetOpen(false)}
          title="Trier la bibliothèque"
        >
          <ul className="space-y-1.5">
            {SORT_OPTIONS.map((opt) => {
              const active = opt.id === sortField;
              const fixed = opt.id === "manual" || opt.id === "import";
              return (
                <li key={opt.id}>
                  <button
                    onClick={() => {
                      if (fixed) {
                        setSortField(opt.id);
                        setSortDir("asc");
                        setSortSheetOpen(false);
                        return;
                      }
                      if (active) {
                        setSortDir(sortDir === "asc" ? "desc" : "asc");
                      } else {
                        setSortField(opt.id);
                        setSortDir("asc");
                      }
                    }}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors ${
                      active
                        ? "border-primary/40 bg-accent/40 text-foreground"
                        : "border-border bg-background hover:border-border-strong"
                    }`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    {active && !fixed && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-primary">
                        {sortDir === "asc" ? (
                          <><ArrowUp className="h-3.5 w-3.5" />Asc</>
                        ) : (
                          <><ArrowDown className="h-3.5 w-3.5" />Desc</>
                        )}
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────

function EmptyState({
  isFiltering, onClear, onImport,
}: {
  isFiltering: boolean;
  onClear: () => void;
  onImport: () => void;
}) {
  if (isFiltering) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center animate-fade-in">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-surface-elevated text-muted-foreground">
          <Search className="h-5 w-5" />
        </div>
        <h3 className="font-display text-sm font-semibold text-foreground">
          Aucun résultat
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Essaie d'autres mots-clés ou désactive un filtre pour voir plus de morceaux.
        </p>
        <button
          onClick={onClear}
          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground hover:border-border-strong"
        >
          Réinitialiser
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-8 text-center animate-fade-in">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-primary/10 text-primary">
        <Music2 className="h-7 w-7" />
      </div>
      <h3 className="font-display text-base font-semibold text-foreground">
        Aucun morceau importé
      </h3>
      <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
        Importe un dossier contenant tes morceaux audio pour commencer à
        analyser, ranger et mixer.
      </p>
      <button
        onClick={onImport}
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-gold hover:opacity-90"
      >
        <FolderInput className="h-4 w-4" />
        Importer une bibliothèque
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Track card
// ─────────────────────────────────────────────────────────────

function TrackCard({
  track, selected, selectionMode, isDuplicate, canDrag,
  onToggleSelect, style,
}: {
  track: Track;
  selected: boolean;
  selectionMode: boolean;
  isDuplicate: boolean;
  canDrag: boolean;
  onToggleSelect: () => void;
  style?: React.CSSProperties;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: track.id, disabled: !canDrag });

  const missingBpm = track.bpm == null;
  const missingKey = !track.musicalKey;
  const hasMissing = missingBpm || missingKey;

  const pad = "p-3";
  const gap = "gap-3";

  const dndStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...style,
  };

  // Energy: derived from BPM (0..4 bars). Higher BPM → more energy.
  const energy = track.bpm == null
    ? 0
    : track.bpm < 90 ? 1
    : track.bpm < 110 ? 2
    : track.bpm < 130 ? 3
    : 4;
  const energyColor =
    energy >= 4 ? "bg-rose-500"
    : energy === 3 ? "bg-orange-400"
    : energy === 2 ? "bg-emerald-400"
    : energy === 1 ? "bg-sky-400"
    : "bg-muted-foreground/30";

  return (
    <li
      ref={setNodeRef}
      style={dndStyle}
      className={`animate-fade-in rounded-2xl border transition-[background-color,border-color,box-shadow] ${pad} ${gap} ${
        selected
          ? "border-primary/50 bg-primary/10 shadow-[0_0_0_1px_var(--color-primary)/30]"
          : isDragging
          ? "z-10 border-primary/40 bg-surface-elevated shadow-2xl"
          : "border-border bg-surface hover:border-border-strong hover:bg-surface-elevated"
      } flex items-center`}
      onClick={selectionMode ? onToggleSelect : undefined}
      role={selectionMode ? "button" : undefined}
    >
      {/* Left: drag handle / play / checkbox */}
      {canDrag ? (
        <button
          {...attributes}
          {...listeners}
          aria-label="Réordonner"
          className="grid h-10 w-8 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/70 hover:text-foreground active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : selectionMode ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          aria-label={selected ? "Désélectionner" : "Sélectionner"}
          className="grid h-10 w-10 shrink-0 place-items-center"
        >
          {selected ? (
            <div className="grid h-5 w-5 place-items-center rounded-md bg-primary text-primary-foreground">
              <Check className="h-3 w-3" strokeWidth={3} />
            </div>
          ) : (
            <div className="h-5 w-5 rounded-md border-2 border-border-strong" />
          )}
        </button>
      ) : (
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <PlayPauseButton trackId={track.id} size="md" />
        </div>
      )}

      {/* Middle: name + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight text-foreground">
            {track.name}
          </h3>
          {hasMissing && (
            <span
              title={
                missingBpm && missingKey
                  ? "BPM et tonalité manquants"
                  : missingBpm
                  ? "BPM manquant"
                  : "Tonalité manquante"
              }
              className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-500"
              aria-label="Métadonnées manquantes"
            >
              <span className="block h-1.5 w-1.5 rounded-full bg-amber-500" />
            </span>
          )}
          {isDuplicate && (
            <span
              title="Présent dans un groupe de doublons"
              className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-orange-500/15 text-orange-500"
              aria-label="Doublon"
            >
              <Copy className="h-2.5 w-2.5" />
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-2 text-[12px]">
          <CamelotPill camelot={track.camelot} />
          <span className="tabular-nums font-medium text-muted-foreground">
            {missingBpm ? "— BPM" : `${Math.round(track.bpm!)} BPM`}
          </span>
          <EnergyBars level={energy} color={energyColor} />
          <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDuration(track.durationSec)}
          </span>
        </div>

      </div>

      {/* Right: info button */}
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        aria-label="Informations du morceau"
        className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground/70 hover:bg-surface-elevated hover:text-foreground"
      >
        <Info className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
    </li>
  );
}

/**
 * CamelotPill — colored pill showing ONLY the Camelot notation
 * (e.g. "8A", "12B"). Classic musical-key notation is intentionally
 * omitted from the main list — TempoKey parity.
 */
function CamelotPill({ camelot }: { camelot: string | null | undefined }) {
  if (!camelot) {
    return (
      <span className="inline-flex h-5 min-w-[28px] items-center justify-center rounded-md border border-border bg-surface-elevated px-1.5 text-[11px] font-semibold text-muted-foreground/70 tabular-nums">
        —
      </span>
    );
  }
  const isMinor = /A$/.test(camelot);
  // Warm hues for minor (A), cool hues for major (B); mirrors TempoKey.
  const n = parseInt(camelot, 10);
  const swatchesA = [
    "#F87171","#FB923C","#F59E0B","#FBBF24","#A3E635","#4ADE80",
    "#34D399","#22D3EE","#60A5FA","#818CF8","#A78BFA","#F472B6",
  ];
  const swatchesB = [
    "#60A5FA","#38BDF8","#22D3EE","#2DD4BF","#34D399","#A3E635",
    "#FACC15","#FB923C","#F87171","#F472B6","#C084FC","#818CF8",
  ];
  const c = (isMinor ? swatchesA : swatchesB)[(n - 1) % 12] ?? "#93C5FD";
  return (
    <span
      className="inline-flex h-5 min-w-[28px] items-center justify-center rounded-md px-1.5 text-[11px] font-bold tabular-nums"
      style={{
        backgroundColor: `${c}22`,
        color: c,
        border: `1px solid ${c}55`,
      }}
    >
      {camelot}
    </span>
  );
}

function EnergyBars({ level, color }: { level: 0 | 1 | 2 | 3 | 4; color: string }) {
  return (
    <span aria-label={`Énergie ${level}/4`} className="inline-flex items-end gap-[2px]">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm ${
            i < level ? color : "bg-border-strong/50"
          }`}
          style={{ height: `${5 + i * 3}px` }}
        />
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Bottom sheet
// ─────────────────────────────────────────────────────────────

function BottomSheet({
  children, onClose, title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-background/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-up max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-border bg-surface px-4 pb-8 pt-4 shadow-2xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-elevated"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Legacy re-export kept for compatibility with older code paths.
export type ColumnPrefs = {
  duration: boolean;
  bpm: boolean;
  key: boolean;
  camelot: boolean;
  type: boolean;
  size: boolean;
  extension: boolean;
  date: boolean;
  path: boolean;
};
