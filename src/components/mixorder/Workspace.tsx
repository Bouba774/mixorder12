import { useCallback, useMemo, useState } from "react";
import {
  ChevronLeft,
  Music2,
  Search,
  MoreHorizontal,
  ListMusic,
  Disc3,
  Waves,
  FolderOpen,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  GripVertical,
  CheckSquare,
  Square,
  X,
  Trash2,
  Check,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { Logo } from "./Logo";
import { AnalysisWorkspace } from "./AnalysisWorkspace";
import { formatDuration, useWorkspace, type Track, type TrackId } from "@/lib/workspace-context";

type SortField = "manual" | "name" | "duration" | "bpm" | "key";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: Array<{ id: SortField; label: string; short: string }> = [
  { id: "manual", label: "Ordre manuel", short: "Manuel" },
  { id: "name", label: "Nom", short: "Nom" },
  { id: "duration", label: "Durée", short: "Durée" },
  { id: "bpm", label: "BPM", short: "BPM" },
  { id: "key", label: "Tonalité", short: "Key" },
];

// Musical key ordering along the Circle of Fifths for smart sorting.
const KEY_ORDER: Record<string, number> = (() => {
  const order = [
    "C",
    "G",
    "D",
    "A",
    "E",
    "B",
    "F#",
    "C#",
    "F",
    "Bb",
    "Eb",
    "Ab",
    "Db",
    "Gb",
    "Cb",
  ];
  const map: Record<string, number> = {};
  order.forEach((k, i) => {
    map[k] = i * 2;
    map[`${k}m`] = i * 2 + 1;
  });
  return map;
})();

function compareKeys(a: string | null, b: string | null): number {
  const av = a ? KEY_ORDER[a] ?? 999 : 1000;
  const bv = b ? KEY_ORDER[b] ?? 999 : 1000;
  return av - bv;
}

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

export function Workspace() {
  const { project, closeProject, isIndexing, reorderTracks, removeTracks } = useWorkspace();

  const [view, setView] = useState<"library" | "analysis">("library");
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("manual");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selection, setSelection] = useState<Set<TrackId>>(new Set());
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  const toggleSelect = useCallback((id: TrackId) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isSelectionMode = selection.size > 0;

  const sortedTracks = useMemo<Track[]>(() => {
    if (!project) return [];
    const arr = project.tracks.slice();
    if (sortField === "manual") return arr;

    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
          break;
        case "duration":
          cmp = compareNullableNumber(a.durationSec, b.durationSec);
          break;
        case "bpm":
          cmp = compareNullableNumber(a.bpm, b.bpm);
          break;
        case "key":
          cmp = compareKeys(a.musicalKey, b.musicalKey);
          break;
      }
      return cmp * dir;
    });
    return arr;
  }, [project, sortField, sortDir]);

  const filtered = useMemo<Track[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedTracks;
    return sortedTracks.filter(
      (t) => t.name.toLowerCase().includes(q) || t.originalName.toLowerCase().includes(q),
    );
  }, [sortedTracks, query]);

  const totalDuration = useMemo(() => {
    if (!project) return 0;
    return project.tracks.reduce((acc, t) => acc + (t.durationSec ?? 0), 0);
  }, [project]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const canReorder = sortField === "manual" && !query.trim();

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      if (!project) return;
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const ids = project.tracks.map((t) => t.id);
      const from = ids.indexOf(active.id as TrackId);
      const to = ids.indexOf(over.id as TrackId);
      if (from < 0 || to < 0) return;
      reorderTracks(arrayMove(ids, from, to));
    },
    [project, reorderTracks],
  );

  const selectAllVisible = useCallback(() => {
    setSelection(new Set(filtered.map((t) => t.id)));
  }, [filtered]);

  const deleteSelection = useCallback(() => {
    if (selection.size === 0) return;
    removeTracks(Array.from(selection));
    clearSelection();
  }, [selection, removeTracks, clearSelection]);

  if (!project) return null;

  if (view === "analysis") {
    return <AnalysisWorkspace onBack={() => setView("library")} />;
  }

  const activeSortLabel = SORT_OPTIONS.find((s) => s.id === sortField)?.short ?? "Manuel";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* Persistent context bar — the active folder is always visible */}
      <header className="glass sticky top-0 z-30 border-b border-border/60">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <button
            onClick={closeProject}
            aria-label="Fermer le projet"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex min-w-0 items-center gap-2.5">
            <Logo size={28} />
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold leading-tight">
                {project.name}
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <FolderOpen className="h-3 w-3 shrink-0" />
                <span className="shrink-0">{project.tracks.length} pistes</span>
                {totalDuration > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="shrink-0 tabular-nums">{formatDuration(totalDuration)}</span>
                  </>
                )}
                {isIndexing && (
                  <>
                    <span aria-hidden>·</span>
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            aria-label="Options"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Workspace hub */}
      <main className="flex-1 space-y-5 px-4 py-5 pb-32">
        <section className="animate-fade-up grid grid-cols-3 gap-3">
          {[
            { icon: ListMusic, label: "Bibliothèque", target: "library" as const },
            { icon: Disc3, label: "Setlist", target: null },
            { icon: Waves, label: "Analyse", target: "analysis" as const },
          ].map(({ icon: Icon, label, target }) => {
            const active = target === "library";
            const disabled = target === null;
            return (
              <button
                key={label}
                disabled={disabled}
                onClick={() => target && setView(target)}
                className={`group flex flex-col items-center gap-2 rounded-xl border p-3 transition-all ${
                  active
                    ? "border-primary/40 bg-accent/40 text-foreground"
                    : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground"
                } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
                <span className="text-[11px] font-medium">{label}</span>
              </button>
            );
          })}
        </section>

        {/* Search + sort controls */}
        <section
          className="animate-fade-up space-y-2.5"
          style={{ animationDelay: "60ms" }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un titre…"
              className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-9 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortSheetOpen(true)}
              className="inline-flex h-9 flex-1 items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:border-border-strong"
            >
              <span className="flex items-center gap-2 text-muted-foreground">
                <ArrowUpDown className="h-3.5 w-3.5" />
                Trier
              </span>
              <span className="flex items-center gap-1 text-foreground">
                {activeSortLabel}
                {sortField !== "manual" &&
                  (sortDir === "asc" ? (
                    <ArrowUp className="h-3 w-3 text-primary" />
                  ) : (
                    <ArrowDown className="h-3 w-3 text-primary" />
                  ))}
              </span>
            </button>

            <button
              onClick={isSelectionMode ? clearSelection : selectAllVisible}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                isSelectionMode
                  ? "border-primary/40 bg-accent/40 text-primary"
                  : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground"
              }`}
            >
              {isSelectionMode ? (
                <>
                  <CheckSquare className="h-3.5 w-3.5" />
                  {selection.size}
                </>
              ) : (
                <>
                  <Square className="h-3.5 w-3.5" />
                  Sélect.
                </>
              )}
            </button>
          </div>
        </section>

        {/* Library list */}
        <section
          className="animate-fade-up space-y-2"
          style={{ animationDelay: "120ms" }}
        >
          <div className="flex items-baseline justify-between px-1">
            <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Bibliothèque
            </h2>
            <span className="text-[11px] text-muted-foreground">
              {filtered.length} / {project.tracks.length}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center text-sm text-muted-foreground">
              {query ? "Aucun résultat pour cette recherche." : "Aucun fichier audio trouvé."}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={filtered.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="overflow-hidden rounded-xl border border-border bg-surface">
                  {filtered.map((t) => (
                    <SortableTrackRow
                      key={t.id}
                      track={t}
                      selected={selection.has(t.id)}
                      selectionMode={isSelectionMode}
                      onToggle={() => toggleSelect(t.id)}
                      canDrag={canReorder}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          {!canReorder && sortField !== "manual" && (
            <p className="px-1 text-[11px] text-muted-foreground/70">
              Le glisser-déposer est disponible en tri « Ordre manuel ».
            </p>
          )}
        </section>
      </main>

      {/* Selection action bar */}
      {isSelectionMode && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-surface/95 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-md items-center gap-2">
            <button
              onClick={clearSelection}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
              aria-label="Annuler la sélection"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex-1 text-sm font-medium">
              {selection.size} sélectionné{selection.size > 1 ? "s" : ""}
            </div>
            <button
              onClick={selectAllVisible}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:border-border-strong hover:text-foreground"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Tout
            </button>
            <button
              onClick={deleteSelection}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground shadow-sm transition-transform active:scale-[0.98]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Retirer
            </button>
          </div>
        </div>
      )}

      {/* Sort bottom sheet */}
      {sortSheetOpen && (
        <SortSheet
          field={sortField}
          dir={sortDir}
          onChange={(f, d) => {
            setSortField(f);
            setSortDir(d);
          }}
          onClose={() => setSortSheetOpen(false)}
        />
      )}
    </div>
  );
}

function SortableTrackRow({
  track,
  selected,
  selectionMode,
  onToggle,
  canDrag,
}: {
  track: Track;
  selected: boolean;
  selectionMode: boolean;
  onToggle: () => void;
  canDrag: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id, disabled: !canDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 border-b border-border/60 px-2 py-2.5 last:border-b-0 transition-colors ${
        selected ? "bg-accent/30" : "hover:bg-surface-elevated"
      } ${isDragging ? "z-10 shadow-gold" : ""}`}
    >
      {canDrag && (
        <button
          {...attributes}
          {...listeners}
          aria-label="Réordonner"
          className="grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      <button
        onClick={onToggle}
        aria-label={selected ? "Désélectionner" : "Sélectionner"}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
      >
        {selectionMode ? (
          selected ? (
            <div className="grid h-4 w-4 place-items-center rounded-sm bg-primary text-primary-foreground">
              <Check className="h-3 w-3" strokeWidth={3} />
            </div>
          ) : (
            <div className="h-4 w-4 rounded-sm border border-border-strong" />
          )
        ) : (
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent/40 text-primary">
            <Music2 className="h-4 w-4" />
          </div>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{track.name}</p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{formatDuration(track.durationSec)}</span>
          <span aria-hidden>·</span>
          <MetaChip
            label="BPM"
            value={track.bpm !== null ? Math.round(track.bpm).toString() : null}
          />
          <MetaChip label="Key" value={track.musicalKey} />
        </div>
      </div>

      <span className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground/70">
        {track.extension}
      </span>
    </li>
  );
}

function MetaChip({ label, value }: { label: string; value: string | null }) {
  const filled = value !== null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
        filled
          ? "bg-primary/15 text-primary"
          : "bg-surface-elevated text-muted-foreground/60"
      }`}
    >
      <span className="uppercase tracking-wider opacity-70">{label}</span>
      <span className="tabular-nums">{filled ? value : "—"}</span>
    </span>
  );
}

function SortSheet({
  field,
  dir,
  onChange,
  onClose,
}: {
  field: SortField;
  dir: SortDir;
  onChange: (f: SortField, d: SortDir) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-background/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-up rounded-t-2xl border-t border-border bg-surface px-4 pb-8 pt-4 shadow-2xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">Trier la bibliothèque</h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="space-y-1">
          {SORT_OPTIONS.map((opt) => {
            const active = opt.id === field;
            return (
              <li key={opt.id}>
                <button
                  onClick={() => {
                    if (opt.id === "manual") {
                      onChange("manual", "asc");
                      onClose();
                      return;
                    }
                    if (active) {
                      onChange(opt.id, dir === "asc" ? "desc" : "asc");
                    } else {
                      onChange(opt.id, "asc");
                    }
                  }}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? "border-primary/40 bg-accent/40 text-foreground"
                      : "border-border bg-background hover:border-border-strong"
                  }`}
                >
                  <span className="font-medium">{opt.label}</span>
                  {active && opt.id !== "manual" && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                      {dir === "asc" ? (
                        <>
                          <ArrowUp className="h-3.5 w-3.5" />
                          Croissant
                        </>
                      ) : (
                        <>
                          <ArrowDown className="h-3.5 w-3.5" />
                          Décroissant
                        </>
                      )}
                    </span>
                  )}
                  {active && opt.id === "manual" && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 px-1 text-[11px] text-muted-foreground/70">
          Le tri est une vue. L'ordre manuel du projet est conservé pour les setlists et
          futures fonctionnalités.
        </p>
      </div>
    </div>
  );
}
