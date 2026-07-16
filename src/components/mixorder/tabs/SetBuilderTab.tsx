import { useCallback, useMemo, useState } from "react";
import {
  Sparkles,
  Wand2,
  TrendingUp,
  TrendingDown,
  Flame,
  Snowflake,
  Zap,
  Music2,
  Sunrise,
  Moon,
  Shuffle,
  Compass,
  Star,
  GripVertical,
  X,
  Lock,
  Unlock,
  Check,
  ArrowLeft,
  CheckCircle2,
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
import { formatDuration, useWorkspace, type Track } from "@/lib/workspace-context";
import { useSetBuilder } from "@/lib/setbuilder/context";
import { getMode, type SetModeId } from "@/lib/setbuilder/modes";
import { transitionScore } from "@/lib/setbuilder/camelot-graph";
import { PlayPauseButton } from "../player/PlayPauseButton";

/**
 * AutoMix — assistant simple de création de playlist DJ.
 *
 * Flow: choisir un mode → générer → réorganiser/verrouiller/supprimer →
 * appliquer à la bibliothèque. La bibliothèque active est réorganisée
 * selon l'ordre du set ; les morceaux retirés restent dans la bibliothèque
 * mais ne comptent pas dans les stats du set.
 */

interface AutoMixMode {
  id: SetModeId;
  label: string;
  icon: typeof Wand2;
  hint?: string;
  recommended?: boolean;
}

const AUTOMIX_MODES: AutoMixMode[] = [
  { id: "intelligent", label: "Intelligent Mix", icon: Star, hint: "Recommandé", recommended: true },
  { id: "harmonic", label: "Harmonic Mix", icon: Sparkles },
  { id: "progressive", label: "Progressive", icon: TrendingUp },
  { id: "energy-build", label: "Energy Build", icon: Zap },
  { id: "energy-down", label: "Energy Drop", icon: TrendingDown },
  { id: "hot-cold", label: "Hot → Cold", icon: Flame },
  { id: "cold-hot", label: "Cold → Hot", icon: Snowflake },
  { id: "open-format", label: "Open Format", icon: Compass },
  { id: "peak-time", label: "Peak Time", icon: Flame },
  { id: "warm-up", label: "Warm Up", icon: Sunrise },
  { id: "closing-set", label: "Closing Set", icon: Moon },
  { id: "random", label: "Random", icon: Shuffle },
];

const AUTOMIX_SET_NAME = "AutoMix";

export function SetBuilderTab() {
  const { project, reorderTracks } = useWorkspace();
  const {
    activeSet,
    sets,
    createSet,
    deleteSet,
    setActive,
    updateActiveOrder,
    removeFromActive,
  } = useSetBuilder();

  const [pickedMode, setPickedMode] = useState<SetModeId>("intelligent");
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);

  const tracks = activeSet?.tracks ?? [];

  /* ─── stats ─── */
  const stats = useMemo(() => {
    if (!tracks.length) {
      return { count: 0, duration: 0, avgBpm: null as number | null };
    }
    let dur = 0;
    let bpmTot = 0;
    let bpmN = 0;
    for (const t of tracks) {
      dur += t.durationSec ?? 0;
      if (t.bpm != null) {
        bpmTot += t.bpm;
        bpmN++;
      }
    }
    return {
      count: tracks.length,
      duration: dur,
      avgBpm: bpmN ? bpmTot / bpmN : null,
    };
  }, [tracks]);

  const transitions = useMemo(() => {
    const out = [];
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

  const harmonyScore = useMemo(() => {
    const known = transitions.filter((t) => t.grade !== "unknown");
    if (!known.length) return null;
    return Math.round(known.reduce((s, t) => s + t.score, 0) / known.length);
  }, [transitions]);

  const excellentCount = transitions.filter(
    (t) => t.grade === "excellent" || t.grade === "very-good",
  ).length;
  const toFixCount = transitions.filter((t) => t.grade === "avoid").length;

  /* ─── DnD ─── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const ids = tracks.map((t) => t.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from < 0 || to < 0) return;
      // Prevent moving a locked track or dropping onto a locked slot.
      if (lockedIds.has(String(active.id)) || lockedIds.has(String(over.id))) return;
      updateActiveOrder(arrayMove(ids, from, to));
    },
    [tracks, updateActiveOrder, lockedIds],
  );

  /* ─── actions ─── */
  const generate = useCallback(() => {
    if (!project || project.tracks.length === 0) return;
    // Remove all previous AutoMix sets so state stays tidy.
    for (const s of sets) deleteSet(s.id);
    const ordered = getMode(pickedMode).build(project.tracks);
    const ids = ordered.length ? ordered : project.tracks.map((t) => t.id);
    createSet(AUTOMIX_SET_NAME, pickedMode, ids);
    setLockedIds(new Set());
    setApplied(false);
  }, [project, sets, deleteSet, pickedMode, createSet]);

  const restart = useCallback(() => {
    if (activeSet) deleteSet(activeSet.id);
    for (const s of sets) deleteSet(s.id);
    setActive(null);
    setLockedIds(new Set());
    setApplied(false);
  }, [activeSet, sets, deleteSet, setActive]);

  const applyToLibrary = useCallback(() => {
    if (!activeSet || !project) return;
    const setIds = tracks.map((t) => t.id);
    const rest = project.tracks
      .filter((t) => !setIds.includes(t.id))
      .map((t) => t.id);
    reorderTracks([...setIds, ...rest]);
    setApplied(true);
    try {
      navigator.vibrate?.(20);
    } catch { /* noop */ }
  }, [activeSet, project, tracks, reorderTracks]);

  const toggleLock = useCallback((id: string) => {
    setLockedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const removeTrack = useCallback(
    (id: string) => {
      if (lockedIds.has(id)) return;
      removeFromActive(id);
      setApplied(false);
    },
    [lockedIds, removeFromActive],
  );

  if (!project) return null;

  /* ─── STEP 1 : mode picker ─── */
  if (!activeSet) {
    const canGenerate = project.tracks.length > 0;
    return (
      <div className="mx-auto max-w-3xl pb-6">
        <header className="mb-6 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            AutoMix
          </p>
          <h1 className="mt-1 font-display text-[22px] font-bold leading-tight text-foreground">
            Générer une playlist automatique
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Choisis l'ambiance, MixOrder trouve le meilleur ordre.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {AUTOMIX_MODES.map((m) => {
            const Icon = m.icon;
            const active = m.id === pickedMode;
            return (
              <button
                key={m.id}
                onClick={() => setPickedMode(m.id)}
                className={`group relative flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.98] ${
                  active
                    ? "border-primary/60 bg-primary/8 shadow-[0_0_0_1px_var(--primary)_inset]"
                    : "border-border bg-surface hover:border-border-strong"
                }`}
              >
                {m.recommended && (
                  <span className="absolute right-3 top-3 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                    Reco
                  </span>
                )}
                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-elevated text-muted-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span
                  className={`text-[13px] font-semibold leading-tight ${
                    active ? "text-foreground" : "text-foreground/85"
                  }`}
                >
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="sticky bottom-4 mt-8">
          <button
            onClick={generate}
            disabled={!canGenerate}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 font-display text-[15px] font-bold text-primary-foreground shadow-elevated transition-all active:scale-[0.98] disabled:opacity-40"
          >
            <Wand2 className="h-4 w-4" strokeWidth={2.5} />
            Générer
          </button>
          {!canGenerate && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Importe une bibliothèque pour commencer.
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ─── STEP 2 : playlist result ─── */
  const modeLabel = getMode(activeSet.mode).label;

  return (
    <div className="mx-auto max-w-3xl pb-32">
      {/* header */}
      <header className="mb-5 flex items-center gap-3 px-1">
        <button
          onClick={restart}
          aria-label="Recommencer"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            AutoMix
          </p>
          <h1 className="truncate font-display text-lg font-bold leading-tight">
            {modeLabel}
          </h1>
        </div>
      </header>

      {/* stats row (single card, no repetition) */}
      <section className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-border bg-surface px-5 py-4">
        <Stat label="Morceaux" value={String(stats.count)} />
        <Stat label="Durée totale" value={formatDuration(stats.duration)} />
        <Stat
          label="BPM moyen"
          value={stats.avgBpm != null ? String(Math.round(stats.avgBpm)) : "—"}
        />
        <Stat
          label="Compatibilité"
          value={harmonyScore != null ? `${harmonyScore}%` : "—"}
        />
        <Stat label="Transitions ✓" value={String(excellentCount)} />
        <Stat
          label="À corriger"
          value={String(toFixCount)}
          danger={toFixCount > 0}
        />
      </section>

      {/* playlist */}
      {tracks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 px-4 py-12 text-center">
          <Music2 className="mx-auto mb-3 h-6 w-6 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            Aucun morceau. Recommence avec un autre mode.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={tracks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-surface">
              {tracks.map((t, i) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  index={i}
                  locked={lockedIds.has(t.id)}
                  onToggleLock={() => toggleLock(t.id)}
                  onRemove={() => removeTrack(t.id)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {/* sticky apply CTA */}
      <div
        className="fixed inset-x-0 z-30 border-t border-border bg-background/95 px-4 pt-3 backdrop-blur"
        style={{
          bottom:
            "calc(72px + env(safe-area-inset-bottom))" /* above MiniPlayer */,
          paddingBottom: "0.75rem",
        }}
      >
        <div className="mx-auto max-w-3xl">
          <button
            onClick={applyToLibrary}
            disabled={tracks.length === 0}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 font-display text-[14px] font-bold shadow-elevated transition-all active:scale-[0.98] disabled:opacity-40 ${
              applied
                ? "bg-surface-elevated text-foreground"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {applied ? (
              <>
                <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
                Bibliothèque réorganisée
              </>
            ) : (
              <>
                <Check className="h-4 w-4" strokeWidth={2.5} />
                Appliquer à la bibliothèque
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── stat cell ─── */
function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-0.5 font-display text-[17px] font-bold tabular-nums leading-tight ${
          danger ? "text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/* ─── sortable row ─── */
function TrackRow({
  track,
  index,
  locked,
  onToggleLock,
  onRemove,
}: {
  track: Track;
  index: number;
  locked: boolean;
  onToggleLock: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id, disabled: locked });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-2.5 ${
        locked ? "bg-surface-elevated/30" : "bg-transparent"
      }`}
    >
      <span className="grid w-7 shrink-0 place-items-center font-display text-[13px] font-semibold tabular-nums text-muted-foreground">
        {String(index + 1).padStart(2, "0")}
      </span>

      <PlayPauseButton trackId={track.id} size="sm" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
          {track.name}
        </p>
        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
          {track.bpm != null ? `${Math.round(track.bpm)} BPM` : "— BPM"}
          <span className="mx-1.5 opacity-40">·</span>
          {track.camelot ?? track.musicalKey ?? "—"}
          <span className="mx-1.5 opacity-40">·</span>
          {formatDuration(track.durationSec)}
        </p>
      </div>

      <button
        onClick={onToggleLock}
        aria-label={locked ? "Déverrouiller" : "Verrouiller"}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${
          locked
            ? "text-primary"
            : "text-muted-foreground/60 hover:text-foreground"
        }`}
      >
        {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
      </button>

      <button
        onClick={onRemove}
        disabled={locked}
        aria-label="Retirer du set"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground/60 transition-colors hover:text-foreground disabled:opacity-25"
      >
        <X className="h-4 w-4" />
      </button>

      <button
        {...attributes}
        {...listeners}
        disabled={locked}
        aria-label="Réordonner"
        className="grid h-10 w-7 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/50 hover:text-foreground active:cursor-grabbing disabled:opacity-25"
      >
        <GripVertical className="h-4 w-4" />
      </button>
    </li>
  );
}
