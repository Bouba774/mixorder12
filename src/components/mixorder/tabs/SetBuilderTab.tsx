import { useCallback, useMemo, useState } from "react";
import {
  ListMusic,
  Sparkles,
  Plus,
  Copy as CopyIcon,
  Trash2,
  Pencil,
  Check,
  X,
  GripVertical,
  Wand2,
  Shuffle,
  ArrowUpDown,
  RotateCcw,
  Download,
  History,
  ChevronDown,
  Music2,
  Zap,
  Flame,
  Snowflake,
  TrendingUp,
  TrendingDown,
  Info,
  Gauge,
  KeyRound,
  Clock,
  Hash,
  AlertTriangle,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  DragOverlay,
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
import { formatDuration, useWorkspace, type Track } from "@/lib/workspace-context";
import { useSetBuilder } from "@/lib/setbuilder/context";
import { SET_MODES, getMode, energyOf, type SetModeId } from "@/lib/setbuilder/modes";
import {
  transitionScore,
  type TransitionScore,
} from "@/lib/setbuilder/camelot-graph";
import { PlayPauseButton } from "../player/PlayPauseButton";
import { PageHeader } from "../PageHeader";

/* ─────────────────────────────────────────────────────────────
 * SetBuilderTab — professional mobile-first mix preparation UI.
 *
 * Sections (top → bottom): Informations · Tools · Playlist ·
 * Harmony Mix · Résumé. The global MiniPlayer at the bottom of the
 * workspace already provides the sticky audio player.
 *
 * All business logic lives in the SetBuilder / Workspace contexts —
 * this file is pure UI / ergonomics.
 * ────────────────────────────────────────────────────────── */

/* ─── beginner-friendly grade taxonomy ─── */
type BeginnerGrade = "excellent" | "good" | "fair" | "avoid" | "unknown";

function beginnerGrade(g: TransitionScore["grade"]): BeginnerGrade {
  if (g === "excellent" || g === "very-good") return "excellent";
  if (g === "good") return "good";
  if (g === "fair") return "fair";
  if (g === "avoid") return "avoid";
  return "unknown";
}

const GRADE_UI: Record<
  BeginnerGrade,
  { label: string; badge: string; dot: string; ring: string }
> = {
  excellent: {
    label: "Excellent",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-400",
    ring: "ring-emerald-500/30",
  },
  good: {
    label: "Bon",
    badge: "bg-lime-500/15 text-lime-400 border-lime-500/30",
    dot: "bg-lime-400",
    ring: "ring-lime-500/30",
  },
  fair: {
    label: "Acceptable",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    dot: "bg-amber-400",
    ring: "ring-amber-500/30",
  },
  avoid: {
    label: "Déconseillé",
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    dot: "bg-red-400",
    ring: "ring-red-500/30",
  },
  unknown: {
    label: "Inconnu",
    badge: "bg-muted/40 text-muted-foreground border-border",
    dot: "bg-muted-foreground/50",
    ring: "ring-border",
  },
};

/* ─── mode → transition type presentation ─── */
interface TransitionTypeUI {
  id: SetModeId;
  label: string;
  icon: typeof Wand2;
}
const TRANSITION_TYPES: TransitionTypeUI[] = [
  { id: "progressive", label: "Progressive", icon: TrendingUp },
  { id: "energy-build", label: "Energy Build", icon: Zap },
  { id: "energy-down", label: "Energy Drop", icon: TrendingDown },
  { id: "hot-cold", label: "Hot → Cold", icon: Flame },
  { id: "cold-hot", label: "Cold → Hot", icon: Snowflake },
  { id: "harmonic", label: "Camelot", icon: Sparkles },
];

/* ═════════════════════════════════════════════════════════════
 * ROOT
 * ═══════════════════════════════════════════════════════════ */
export function SetBuilderTab() {
  const { project } = useWorkspace();
  const {
    sets,
    activeSet,
    activeSetId,
    createSet,
    duplicateSet,
    renameSet,
    deleteSet,
    setActive,
    updateActiveOrder,
    updateActiveMode,
    removeFromActive,
    addToActive,
  } = useSetBuilder();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  const tracks = activeSet?.tracks ?? [];

  /* ─── stats ─── */
  const stats = useMemo(() => {
    if (!tracks.length) {
      return {
        count: 0,
        duration: 0,
        avgBpm: null as number | null,
        minBpm: null as number | null,
        maxBpm: null as number | null,
        keyCount: 0,
        avgEnergy: 0,
      };
    }
    let total = 0;
    let n = 0;
    let min = Infinity;
    let max = -Infinity;
    let dur = 0;
    let energy = 0;
    const keys = new Set<string>();
    for (const t of tracks) {
      if (t.bpm != null) { total += t.bpm; n++; min = Math.min(min, t.bpm); max = Math.max(max, t.bpm); }
      dur += t.durationSec ?? 0;
      energy += energyOf(t);
      const k = t.camelot ?? t.musicalKey;
      if (k) keys.add(k);
    }
    return {
      count: tracks.length,
      duration: dur,
      avgBpm: n ? total / n : null,
      minBpm: n ? min : null,
      maxBpm: n ? max : null,
      keyCount: keys.size,
      avgEnergy: energy / tracks.length,
    };
  }, [tracks]);

  /* ─── transitions ─── */
  const transitions = useMemo<TransitionScore[]>(() => {
    const out: TransitionScore[] = [];
    for (let i = 0; i < tracks.length - 1; i++) {
      out.push(
        transitionScore(
          { bpm: tracks[i].bpm, camelot: tracks[i].camelot },
          { bpm: tracks[i + 1].bpm, camelot: tracks[i + 1].camelot },
        ),
      );
    }
    return out;
  }, [tracks]);

  const globalScore = useMemo(() => {
    if (!transitions.length) return null;
    const scored = transitions.filter((t) => t.grade !== "unknown");
    if (!scored.length) return null;
    return Math.round(scored.reduce((a, b) => a + b.score, 0) / scored.length);
  }, [transitions]);

  const gradeCounts = useMemo(() => {
    const c: Record<BeginnerGrade, number> = {
      excellent: 0, good: 0, fair: 0, avoid: 0, unknown: 0,
    };
    for (const t of transitions) c[beginnerGrade(t.grade)]++;
    return c;
  }, [transitions]);

  const problemIndices = useMemo(() => {
    const out: number[] = [];
    transitions.forEach((t, i) => {
      if (beginnerGrade(t.grade) === "avoid") out.push(i);
    });
    return out;
  }, [transitions]);

  /* ─── DnD ─── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setDragId(String(e.active.id));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate?.(15); } catch { /* noop */ }
    }
  }, []);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = tracks.map((t) => t.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    updateActiveOrder(arrayMove(ids, from, to));
  }, [tracks, updateActiveOrder]);

  /* ─── tool actions ─── */
  const autoHarmony = useCallback(() => {
    if (!activeSet) return;
    updateActiveMode("harmonic");
  }, [activeSet, updateActiveMode]);

  const shuffle = useCallback(() => {
    if (!activeSet || tracks.length < 2) return;
    const ids = tracks.map((t) => t.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    updateActiveOrder(ids);
  }, [activeSet, tracks, updateActiveOrder]);

  const reset = useCallback(() => {
    if (!activeSet) return;
    if (!confirm("Vider ce set de tous ses morceaux ?")) return;
    updateActiveOrder([]);
  }, [activeSet, updateActiveOrder]);

  const exportSet = useCallback(() => {
    if (!activeSet) return;
    const lines = tracks.map((t, i) => {
      const bits = [
        `${(i + 1).toString().padStart(2, "0")}.`,
        t.name,
        t.bpm != null ? `${Math.round(t.bpm)} BPM` : null,
        t.camelot ?? t.musicalKey ?? null,
        formatDuration(t.durationSec),
      ].filter(Boolean);
      return bits.join(" · ");
    });
    const text = `MixOrder — ${activeSet.name}\n\n${lines.join("\n")}\n`;
    try {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeSet.name.replace(/[^\w\-]+/g, "_")}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }, [activeSet, tracks]);

  /* ─── render ─── */
  if (!project) return null;
  const totalTracks = project.tracks.length;
  const dragTrack = dragId ? tracks.find((t) => t.id === dragId) ?? null : null;
  const dragIndex = dragId ? tracks.findIndex((t) => t.id === dragId) : -1;

  return (
    <div className="mx-auto max-w-3xl pb-6">
      <PageHeader
        icon={ListMusic}
        eyebrow="Set Builder"
        title="Préparation de mix"
        subtitle="Construis ton set, vérifie l'harmonie, exporte."
        actions={
          <>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/25"
            >
              <Plus className="h-4 w-4" /> Nouveau set
            </button>
            {sets.length > 0 && (
              <button
                onClick={() => setShowHistory(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs font-semibold text-foreground/80 hover:text-foreground"
              >
                <History className="h-4 w-4" /> Historique
              </button>
            )}
          </>
        }
      />

      {/* set tabs strip */}
      {sets.length > 0 && (
        <div className="scrollbar-none mb-6 -mx-1 flex gap-2 overflow-x-auto px-1">
          {sets.map((s) => {
            const active = s.id === activeSetId;
            const isEditing = editingNameId === s.id;
            return (
              <div
                key={s.id}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition-colors ${
                  active
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-surface-elevated text-muted-foreground hover:text-foreground"
                }`}
              >
                {isEditing ? (
                  <>
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { renameSet(s.id, editingName); setEditingNameId(null); }
                        if (e.key === "Escape") setEditingNameId(null);
                      }}
                      onBlur={() => { renameSet(s.id, editingName); setEditingNameId(null); }}
                      className="w-32 bg-transparent outline-none"
                    />
                  </>
                ) : (
                  <>
                    <button onClick={() => setActive(s.id)} className="font-semibold">
                      {s.name}
                    </button>
                    <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] tabular-nums opacity-80">
                      {s.paths.length}
                    </span>
                    {active && (
                      <>
                        <button
                          onClick={() => { setEditingNameId(s.id); setEditingName(s.name); }}
                          aria-label="Renommer"
                          className="ml-0.5 grid h-6 w-6 place-items-center rounded-md hover:bg-background/60"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => duplicateSet(s.id)}
                          aria-label="Dupliquer"
                          className="grid h-6 w-6 place-items-center rounded-md hover:bg-background/60"
                        >
                          <CopyIcon className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Supprimer "${s.name}" ?`)) deleteSet(s.id); }}
                          aria-label="Supprimer"
                          className="grid h-6 w-6 place-items-center rounded-md hover:bg-red-500/20 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* no active set — empty CTA */}
      {!activeSet && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <p className="mb-1 font-display text-base font-semibold">
            Créer votre premier set
          </p>
          <p className="mx-auto mb-5 max-w-xs text-xs text-muted-foreground">
            Un ordre de lecture harmonieux à partir de vos {totalTracks} pistes.
          </p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-gold px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-gold"
          >
            <Wand2 className="h-4 w-4" /> Créer un set
          </button>
        </div>
      )}

      {activeSet && (
        <div className="space-y-6">
          {/* ═══ 1. INFORMATIONS DU SET ═══ */}
          <SetInfoCard
            name={activeSet.name}
            modeLabel={getMode(activeSet.mode).label}
            stats={stats}
            globalScore={globalScore}
          />

          {/* ═══ 2. OUTILS DU SET BUILDER ═══ */}
          <ToolsBar
            onAutoHarmony={autoHarmony}
            onSort={() => setShowSortMenu((v) => !v)}
            sortOpen={showSortMenu}
            currentSortLabel={getMode(activeSet.mode).label}
            onPickSort={(id) => { updateActiveMode(id); setShowSortMenu(false); }}
            onShuffle={shuffle}
            onReset={reset}
            onExport={exportSet}
            onHistory={() => setShowHistory(true)}
            disabled={tracks.length === 0}
          />

          {/* ═══ 3. PLAYLIST ═══ */}
          <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <header className="mb-4 flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <ListMusic className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold leading-tight">
                  Playlist du set
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {tracks.length} morceau{tracks.length > 1 ? "x" : ""} · glisse pour réorganiser
                </p>
              </div>
              <button
                onClick={() => setShowAddDialog(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/25"
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </button>
            </header>

            {tracks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 px-4 py-10 text-center">
                <Music2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
                <p className="text-xs text-muted-foreground">
                  Aucun morceau. Ajoute des pistes depuis la bibliothèque.
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setDragId(null)}
              >
                <SortableContext
                  items={tracks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ol className="flex flex-col gap-3">
                    {tracks.map((t, i) => (
                      <TrackCard
                        key={t.id}
                        track={t}
                        index={i}
                        prev={i > 0 ? transitions[i - 1] : null}
                        next={i < transitions.length ? transitions[i] : null}
                        onRemove={() => removeFromActive(t.id)}
                      />
                    ))}
                  </ol>
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {dragTrack && (
                    <TrackCardVisual
                      track={dragTrack}
                      index={dragIndex}
                      prev={dragIndex > 0 ? transitions[dragIndex - 1] : null}
                      next={dragIndex < transitions.length ? transitions[dragIndex] : null}
                      dragging
                    />
                  )}
                </DragOverlay>
              </DndContext>
            )}
          </section>

          {/* ═══ 4. HARMONY MIX ═══ */}
          <HarmonyMixCard
            counts={gradeCounts}
            totalTransitions={transitions.length}
            currentMode={activeSet.mode}
            onPickMode={(id) => updateActiveMode(id)}
          />

          {/* ═══ 5. LECTEUR AUDIO (info card — global MiniPlayer is already sticky at the bottom) ═══ */}
          <PlayerHintCard hasTrack={tracks.length > 0} />

          {/* ═══ 6. RÉSUMÉ ═══ */}
          <SummaryCard
            stats={stats}
            globalScore={globalScore}
            problems={problemIndices.length}
            onOptimize={() => updateActiveMode(activeSet.mode)}
            onClose={() => setActive(null)}
          />
        </div>
      )}

      {/* dialogs */}
      {showCreateDialog && (
        <CreateSetDialog
          onCancel={() => setShowCreateDialog(false)}
          onCreate={(name, mode) => {
            const ordered = getMode(mode).build(project.tracks);
            const ids = project.tracks.map((t) => t.id);
            createSet(name, mode, ordered.length ? ordered : ids);
            setShowCreateDialog(false);
          }}
        />
      )}
      {showAddDialog && activeSet && (
        <AddTracksDialog
          onClose={() => setShowAddDialog(false)}
          onAdd={(ids) => { addToActive(ids); setShowAddDialog(false); }}
          excludePaths={new Set(activeSet.paths)}
        />
      )}
      {showHistory && (
        <HistoryDialog
          onClose={() => setShowHistory(false)}
          onOpen={(id) => { setActive(id); setShowHistory(false); }}
        />
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
 * 1 · Informations du set
 * ═══════════════════════════════════════════════════════════ */
function SetInfoCard({
  name,
  modeLabel,
  stats,
  globalScore,
}: {
  name: string;
  modeLabel: string;
  stats: {
    count: number;
    duration: number;
    avgBpm: number | null;
    minBpm: number | null;
    maxBpm: number | null;
    keyCount: number;
  };
  globalScore: number | null;
}) {
  return (
    <section className="animate-fade-in rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <header className="mb-4 flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-gold text-primary-foreground shadow-gold">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-primary/80">
            Informations du set
          </p>
          <h2 className="truncate font-display text-lg font-semibold leading-tight">
            {name}
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Mode · {modeLabel}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Harmonie
          </p>
          <p
            className={`font-display text-2xl font-bold tabular-nums leading-tight ${
              globalScore == null
                ? "text-muted-foreground"
                : globalScore >= 80
                ? "text-emerald-400"
                : globalScore >= 65
                ? "text-lime-400"
                : globalScore >= 50
                ? "text-amber-400"
                : "text-red-400"
            }`}
          >
            {globalScore != null ? `${globalScore}%` : "—"}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2.5">
        <InfoStat icon={Hash} label="Morceaux" value={stats.count} />
        <InfoStat icon={Clock} label="Durée" value={formatDuration(stats.duration)} />
        <InfoStat
          icon={Gauge}
          label="BPM moyen"
          value={stats.avgBpm != null ? stats.avgBpm.toFixed(1) : "—"}
        />
        <InfoStat
          icon={ArrowUpDown}
          label="Plage BPM"
          value={
            stats.minBpm != null && stats.maxBpm != null
              ? `${Math.round(stats.minBpm)} – ${Math.round(stats.maxBpm)}`
              : "—"
          }
        />
        <InfoStat icon={KeyRound} label="Tonalités" value={stats.keyCount || "—"} />
        <InfoStat
          icon={Sparkles}
          label="Score global"
          value={globalScore != null ? `${globalScore}%` : "—"}
        />
      </div>
    </section>
  );
}

function InfoStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wand2;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-surface-elevated/60 px-3 py-2.5">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-display text-sm font-semibold tabular-nums leading-tight">
          {value}
        </p>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
 * 2 · Outils du Set Builder
 * ═══════════════════════════════════════════════════════════ */
function ToolsBar({
  onAutoHarmony,
  onSort,
  sortOpen,
  currentSortLabel,
  onPickSort,
  onShuffle,
  onReset,
  onExport,
  onHistory,
  disabled,
}: {
  onAutoHarmony: () => void;
  onSort: () => void;
  sortOpen: boolean;
  currentSortLabel: string;
  onPickSort: (id: SetModeId) => void;
  onShuffle: () => void;
  onReset: () => void;
  onExport: () => void;
  onHistory: () => void;
  disabled: boolean;
}) {
  const sortModes: SetModeId[] = ["bpm-asc", "bpm-desc", "key-asc", "key-desc", "progressive"];
  return (
    <section className="animate-fade-in rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <header className="mb-3 flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Wand2 className="h-4 w-4" />
        </div>
        <div>
          <p className="font-display text-sm font-semibold leading-tight">
            Outils du Set Builder
          </p>
          <p className="text-[11px] text-muted-foreground">
            Actions rapides sur la playlist active.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <ToolBtn icon={Wand2} label="Auto Harmony" onClick={onAutoHarmony} disabled={disabled} primary />
        <ToolBtn icon={ArrowUpDown} label="Trier" onClick={onSort} disabled={disabled} active={sortOpen} />
        <ToolBtn icon={Shuffle} label="Mélanger" onClick={onShuffle} disabled={disabled} />
        <ToolBtn icon={RotateCcw} label="Réinitialiser" onClick={onReset} disabled={disabled} danger />
        <ToolBtn icon={Download} label="Exporter" onClick={onExport} disabled={disabled} />
        <ToolBtn icon={History} label="Historique" onClick={onHistory} />
      </div>

      {sortOpen && (
        <div className="animate-fade-in mt-3 rounded-xl border border-border/70 bg-surface-elevated/60 p-2">
          <p className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Trier par · actuel : {currentSortLabel}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {sortModes.map((id) => {
              const m = getMode(id);
              return (
                <button
                  key={id}
                  onClick={() => onPickSort(id)}
                  className="rounded-lg bg-background/60 px-2.5 py-2 text-left text-[11px] font-medium hover:bg-primary/15 hover:text-primary"
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function ToolBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  primary,
  danger,
  active,
}: {
  icon: typeof Wand2;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  active?: boolean;
}) {
  const base =
    "group flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-[11px] font-semibold transition-all active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none";
  const skin = primary
    ? "border-primary/40 bg-gradient-gold text-primary-foreground shadow-gold"
    : danger
    ? "border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20"
    : active
    ? "border-primary/40 bg-primary/15 text-primary"
    : "border-border bg-surface-elevated text-foreground/80 hover:text-foreground hover:border-border-strong";
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${skin}`}>
      <Icon className="h-5 w-5" strokeWidth={2.2} />
      <span className="leading-tight">{label}</span>
    </button>
  );
}

/* ═════════════════════════════════════════════════════════════
 * 3 · Playlist — sortable track card
 * ═══════════════════════════════════════════════════════════ */
function TrackCard({
  track,
  index,
  prev,
  next,
  onRemove,
}: {
  track: Track;
  index: number;
  prev: TransitionScore | null;
  next: TransitionScore | null;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="animate-fade-in">
      <TrackCardVisual
        track={track}
        index={index}
        prev={prev}
        next={next}
        onRemove={onRemove}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            aria-label="Réordonner"
            className="grid h-10 w-8 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/70 hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
      />
    </li>
  );
}

function TrackCardVisual({
  track,
  index,
  prev,
  next,
  onRemove,
  dragHandle,
  dragging,
}: {
  track: Track;
  index: number;
  prev: TransitionScore | null;
  next: TransitionScore | null;
  onRemove?: () => void;
  dragHandle?: React.ReactNode;
  dragging?: boolean;
}) {
  const energy = Math.round(energyOf(track) * 100);
  const prevG = prev ? beginnerGrade(prev.grade) : null;
  const nextG = next ? beginnerGrade(next.grade) : null;

  return (
    <div
      className={`rounded-2xl border bg-surface transition-all ${
        dragging
          ? "scale-[1.03] border-primary/50 shadow-2xl ring-2 ring-primary/25"
          : "border-border hover:border-border-strong"
      }`}
    >
      <div className="flex items-center gap-2 p-3">
        {dragHandle}
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 font-display text-xs font-bold tabular-nums text-primary">
          {index + 1}
        </span>
        <PlayPauseButton trackId={track.id} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">
            {track.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            {track.bpm != null && (
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-elevated px-1.5 py-0.5 tabular-nums">
                <Gauge className="h-3 w-3" /> {Math.round(track.bpm)}
              </span>
            )}
            {(track.camelot || track.musicalKey) && (
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                <KeyRound className="h-3 w-3" /> {track.camelot ?? track.musicalKey}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-elevated px-1.5 py-0.5 tabular-nums">
              <Clock className="h-3 w-3" /> {formatDuration(track.durationSec)}
            </span>
          </div>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            aria-label="Retirer"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground/70 hover:bg-red-500/15 hover:text-red-400"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Energy bar */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2">
          <Zap className="h-3 w-3 shrink-0 text-primary/70" />
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-elevated">
            <div
              className="h-full rounded-full bg-gradient-gold transition-[width] duration-300"
              style={{ width: `${energy}%` }}
            />
          </div>
          <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
            {energy}%
          </span>
        </div>
      </div>

      {/* Transition compat row */}
      <div className="grid grid-cols-2 gap-2 border-t border-border/50 px-3 py-2 text-[10px]">
        <CompatChip label="Précédent" grade={prevG} />
        <CompatChip label="Suivant" grade={nextG} />
      </div>
    </div>
  );
}

function CompatChip({
  label,
  grade,
}: {
  label: string;
  grade: BeginnerGrade | null;
}) {
  if (!grade) {
    return (
      <div className="flex items-center gap-1.5 rounded-md bg-surface-elevated/60 px-2 py-1 text-muted-foreground/60">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
        <span className="truncate">{label} — extrémité</span>
      </div>
    );
  }
  const ui = GRADE_UI[grade];
  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${ui.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ui.dot}`} />
      <span className="truncate">
        <span className="opacity-70">{label} · </span>
        <span className="font-semibold">{ui.label}</span>
      </span>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
 * 4 · Harmony Mix
 * ═══════════════════════════════════════════════════════════ */
function HarmonyMixCard({
  counts,
  totalTransitions,
  currentMode,
  onPickMode,
}: {
  counts: Record<BeginnerGrade, number>;
  totalTransitions: number;
  currentMode: SetModeId;
  onPickMode: (id: SetModeId) => void;
}) {
  const rows: BeginnerGrade[] = ["excellent", "good", "fair", "avoid"];
  return (
    <section className="animate-fade-in rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <header className="mb-4 flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="font-display text-sm font-semibold leading-tight">
            Compatibilité harmonique
          </p>
          <p className="text-[11px] text-muted-foreground">
            {totalTransitions} transition{totalTransitions > 1 ? "s" : ""} analysée{totalTransitions > 1 ? "s" : ""}
          </p>
        </div>
      </header>

      {totalTransitions === 0 ? (
        <p className="rounded-xl bg-surface-elevated/60 px-3 py-4 text-center text-xs text-muted-foreground">
          Ajoute au moins 2 morceaux pour analyser les transitions.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((g) => {
            const n = counts[g];
            const pct = totalTransitions ? (n / totalTransitions) * 100 : 0;
            const ui = GRADE_UI[g];
            return (
              <div key={g} className="flex items-center gap-2.5">
                <span
                  className={`inline-flex w-24 shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold ${ui.badge}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${ui.dot}`} />
                  {ui.label}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-elevated">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${ui.dot}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right text-[11px] font-semibold tabular-nums">
                  {n}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Transition type badges */}
      <div className="mt-5">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Type de transition
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TRANSITION_TYPES.map((tt) => {
            const active = tt.id === currentMode;
            const Icon = tt.icon;
            return (
              <button
                key={tt.id}
                onClick={() => onPickMode(tt.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  active
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-surface-elevated text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tt.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════
 * 5 · Player hint
 * ═══════════════════════════════════════════════════════════ */
function PlayerHintCard({ hasTrack }: { hasTrack: boolean }) {
  return (
    <section className="animate-fade-in rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/25 to-accent/40 text-primary">
          <Music2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold leading-tight">
            Lecteur audio
          </p>
          <p className="text-[11px] text-muted-foreground">
            {hasTrack
              ? "Touche ▶ sur un morceau — le lecteur reste visible en bas pendant tout ton travail."
              : "Ajoute un morceau pour prévisualiser depuis le lecteur global."}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════
 * 6 · Résumé
 * ═══════════════════════════════════════════════════════════ */
function SummaryCard({
  stats,
  globalScore,
  problems,
  onOptimize,
  onClose,
}: {
  stats: {
    duration: number;
    avgBpm: number | null;
    avgEnergy: number;
  };
  globalScore: number | null;
  problems: number;
  onOptimize: () => void;
  onClose: () => void;
}) {
  const energyPct = Math.round(stats.avgEnergy * 100);
  return (
    <section className="animate-fade-in rounded-2xl border border-border bg-gradient-to-br from-surface to-surface-elevated/40 p-5 shadow-sm">
      <header className="mb-4 flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Info className="h-4 w-4" />
        </div>
        <p className="font-display text-sm font-semibold leading-tight">Résumé</p>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <SummaryLine label="Durée totale" value={formatDuration(stats.duration)} />
        <SummaryLine
          label="BPM moyen"
          value={stats.avgBpm != null ? stats.avgBpm.toFixed(1) : "—"}
        />
        <SummaryLine label="Énergie globale" value={`${energyPct}%`} />
        <SummaryLine
          label="Harmonie"
          value={globalScore != null ? `${globalScore}%` : "—"}
        />
      </div>

      {problems > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">{problems}</span> transition{problems > 1 ? "s" : ""} déconseillée{problems > 1 ? "s" : ""} détectée{problems > 1 ? "s" : ""}. Lance <span className="font-semibold">Optimiser</span> pour corriger.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={onOptimize}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-gold px-4 py-3 text-sm font-semibold text-primary-foreground shadow-gold active:scale-[0.98]"
        >
          <Wand2 className="h-4 w-4" /> Optimiser automatiquement
        </button>
        <button
          onClick={onClose}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Fermer le set
        </button>
      </div>
    </section>
  );
}

function SummaryLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-display text-sm font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
 * Dialogs
 * ═══════════════════════════════════════════════════════════ */
function CreateSetDialog({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (name: string, mode: SetModeId) => void;
}) {
  const [name, setName] = useState("Nouveau set");
  const [mode, setMode] = useState<SetModeId>("harmonic");
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-background/70 p-0 backdrop-blur sm:place-items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Wand2 className="h-4 w-4" />
          </div>
          <p className="font-display text-base font-semibold">Créer un set</p>
        </div>
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          Nom
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          Mode
        </label>
        <div className="mb-5 grid grid-cols-2 gap-1.5">
          {SET_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium transition-colors ${
                mode === m.id
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border bg-surface-elevated text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg bg-surface-elevated px-4 py-2 text-xs font-medium hover:bg-background"
          >
            Annuler
          </button>
          <button
            onClick={() => onCreate(name, mode)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-gold px-4 py-2 text-xs font-semibold text-primary-foreground shadow-gold"
          >
            <Check className="h-3.5 w-3.5" /> Créer
          </button>
        </div>
      </div>
    </div>
  );
}

function AddTracksDialog({
  onClose,
  onAdd,
  excludePaths,
}: {
  onClose: () => void;
  onAdd: (ids: string[]) => void;
  excludePaths: Set<string>;
}) {
  const { project } = useWorkspace();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!project) return [] as Track[];
    const q = query.trim().toLowerCase();
    return project.tracks.filter((t) => {
      if (excludePaths.has(t.path)) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.camelot?.toLowerCase().includes(q) ?? false) ||
        (t.musicalKey?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [project, query, excludePaths]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-background/70 p-0 backdrop-blur sm:place-items-center sm:p-4">
      <div className="flex h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-surface p-4 shadow-xl sm:h-[70vh] sm:rounded-2xl">
        <div className="mb-3 flex items-center gap-2">
          <p className="flex-1 font-display text-base font-semibold">Ajouter des pistes</p>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-surface-elevated"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher…"
          className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <div className="scrollbar-none -mx-1 flex-1 overflow-y-auto px-1">
          {filtered.map((t) => {
            const on = selected.has(t.id);
            return (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2.5 text-xs ${
                  on ? "bg-primary/15" : "hover:bg-surface-elevated/60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(t.id)}
                  className="h-4 w-4 accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {t.bpm != null ? `${Math.round(t.bpm)} BPM · ` : ""}
                    {t.camelot ?? t.musicalKey ?? "—"} · {formatDuration(t.durationSec)}
                  </p>
                </div>
              </label>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Aucun morceau à ajouter.
            </p>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
          <p className="text-[11px] text-muted-foreground">
            {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
          </p>
          <button
            onClick={() => onAdd(Array.from(selected))}
            disabled={selected.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-gold px-4 py-2 text-xs font-semibold text-primary-foreground shadow-gold disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Ajouter au set
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryDialog({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const { sets, activeSetId, deleteSet, duplicateSet } = useSetBuilder();
  const sorted = useMemo(
    () => [...sets].sort((a, b) => b.updatedAt - a.updatedAt),
    [sets],
  );
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-background/70 p-0 backdrop-blur sm:place-items-center sm:p-4">
      <div className="flex h-[75vh] w-full max-w-md flex-col rounded-t-2xl border border-border bg-surface p-4 shadow-xl sm:h-[60vh] sm:rounded-2xl">
        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <History className="h-4 w-4" />
          </div>
          <p className="flex-1 font-display text-base font-semibold">Historique</p>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-surface-elevated"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scrollbar-none -mx-1 flex-1 space-y-2 overflow-y-auto px-1">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Aucun set enregistré pour l'instant.
            </p>
          ) : (
            sorted.map((s) => {
              const active = s.id === activeSetId;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 rounded-xl border p-3 ${
                    active
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-surface-elevated/60"
                  }`}
                >
                  <button
                    onClick={() => onOpen(s.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate font-display text-sm font-semibold">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {getMode(s.mode).label} · {s.paths.length} morceau{s.paths.length > 1 ? "x" : ""} ·{" "}
                      {new Date(s.updatedAt).toLocaleDateString()}
                    </p>
                  </button>
                  <button
                    onClick={() => duplicateSet(s.id)}
                    aria-label="Dupliquer"
                    className="grid h-8 w-8 place-items-center rounded-lg hover:bg-background/60"
                  >
                    <CopyIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Supprimer "${s.name}" ?`)) deleteSet(s.id); }}
                    aria-label="Supprimer"
                    className="grid h-8 w-8 place-items-center rounded-lg hover:bg-red-500/15 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* Silence unused warning for ChevronDown (reserved for future). */
void ChevronDown;