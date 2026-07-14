import { useMemo, useState } from "react";
import {
  ListMusic,
  Sparkles,
  Plus,
  Copy as CopyIcon,
  Trash2,
  Pencil,
  Check,
  X,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Save,
  Info,
  Wand2,
} from "lucide-react";
import { formatDuration, useWorkspace, type Track } from "@/lib/workspace-context";
import { useSetBuilder } from "@/lib/setbuilder/context";
import { SET_MODES, getMode, type SetModeId } from "@/lib/setbuilder/modes";
import {
  transitionScore,
  GRADE_LABEL,
  GRADE_COLOR,
  type TransitionScore,
} from "@/lib/setbuilder/camelot-graph";
import { PlayPauseButton } from "../player/PlayPauseButton";
import { PageHeader } from "../PageHeader";

/**
 * Set Builder — professional local playlist builder.
 *
 * Left panel: current Set (ordered list of tracks, drag to reorder).
 * Right panel: mode picker, global stats, transition analysis for the
 * selected row. Everything reads from the main library — no copies, no
 * side databases.
 */
export function SetBuilderTab() {
  const { project, reorderTracks } = useWorkspace();
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const tracks = activeSet?.tracks ?? [];

  /* ─── stats ─── */
  const stats = useMemo(() => {
    if (!tracks.length)
      return { count: 0, duration: 0, avgBpm: null as number | null, keys: {} as Record<string, number> };
    let totalBpm = 0;
    let bpmCount = 0;
    let totalDur = 0;
    const keys: Record<string, number> = {};
    for (const t of tracks) {
      if (t.bpm != null) { totalBpm += t.bpm; bpmCount++; }
      totalDur += t.durationSec ?? 0;
      const k = t.camelot ?? t.musicalKey ?? "—";
      keys[k] = (keys[k] ?? 0) + 1;
    }
    return {
      count: tracks.length,
      duration: totalDur,
      avgBpm: bpmCount ? totalBpm / bpmCount : null,
      keys,
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

  const selectedIndex = selectedId
    ? tracks.findIndex((t) => t.id === selectedId)
    : -1;
  const selectedTrack: Track | undefined =
    selectedIndex >= 0 ? tracks[selectedIndex] : undefined;
  const incomingTransition =
    selectedIndex > 0 ? transitions[selectedIndex - 1] : null;
  const outgoingTransition =
    selectedIndex >= 0 && selectedIndex < transitions.length
      ? transitions[selectedIndex]
      : null;

  /* ─── actions ─── */
  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= tracks.length) return;
    const ids = tracks.map((t) => t.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    updateActiveOrder(ids);
  };

  const applyToLibrary = () => {
    if (!activeSet || !project) return;
    // Reorder the tracks in the active set to the top of the library.
    const setIds = activeSet.tracks.map((t) => t.id);
    const setIdSet = new Set(setIds);
    const rest = project.tracks.map((t) => t.id).filter((id) => !setIdSet.has(id));
    reorderTracks([...setIds, ...rest]);
  };

  /* ─── empty state / no set open ─── */
  if (!project) return null;

  const totalTracks = project.tracks.length;

  return (
    <div className="mx-auto max-w-6xl">
      {/* ─────── header / set switcher ─────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ListMusic className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-semibold">Set Builder</h2>
        <span className="ml-2 rounded-md bg-surface-elevated px-2 py-0.5 text-[11px] text-muted-foreground">
          {sets.length} set{sets.length > 1 ? "s" : ""}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25"
          >
            <Plus className="h-3.5 w-3.5" /> Nouveau set
          </button>
        </div>
      </div>

      {/* ─────── sets tabs ─────── */}
      {sets.length > 0 && (
        <div className="scrollbar-none mb-4 flex gap-1.5 overflow-x-auto">
          {sets.map((s) => {
            const active = s.id === activeSetId;
            const isEditing = editingNameId === s.id;
            return (
              <div
                key={s.id}
                className={`group inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "bg-surface-elevated text-muted-foreground hover:text-foreground"
                }`}
              >
                {isEditing ? (
                  <>
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          renameSet(s.id, editingName);
                          setEditingNameId(null);
                        }
                        if (e.key === "Escape") setEditingNameId(null);
                      }}
                      className="w-32 bg-transparent outline-none"
                    />
                    <button
                      onClick={() => { renameSet(s.id, editingName); setEditingNameId(null); }}
                      aria-label="Valider"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setActive(s.id)} className="font-medium">
                      {s.name}
                    </button>
                    <span className="opacity-60">· {s.paths.length}</span>
                    <button
                      onClick={() => { setEditingNameId(s.id); setEditingName(s.name); }}
                      className="ml-1 opacity-0 group-hover:opacity-100"
                      aria-label="Renommer"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => duplicateSet(s.id)}
                      className="opacity-0 group-hover:opacity-100"
                      aria-label="Dupliquer"
                    >
                      <CopyIcon className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Supprimer "${s.name}" ?`)) deleteSet(s.id); }}
                      className="opacity-0 group-hover:opacity-100"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─────── no active set ─────── */}
      {!activeSet && (
        <div className="rounded-xl border border-border/60 bg-surface-elevated/40 p-8 text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary/70" />
          <p className="mb-1 font-display text-base font-semibold">
            Créer votre premier set
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            Générez un ordre de lecture harmonieux à partir de vos {totalTracks} pistes.
          </p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-gold px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold"
          >
            <Wand2 className="h-4 w-4" /> Créer un set
          </button>
        </div>
      )}

      {/* ─────── active set: two-panel layout ─────── */}
      {activeSet && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* left: track list */}
          <div className="rounded-xl border border-border/60 bg-surface-elevated/30 p-3">
            <div className="mb-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-semibold">
                  {activeSet.name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {getMode(activeSet.mode).label} · {tracks.length} pistes
                </p>
              </div>
              <button
                onClick={() => setShowAddDialog(true)}
                className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-[11px] text-primary hover:bg-primary/25"
              >
                <Plus className="h-3 w-3" /> Ajouter
              </button>
            </div>

            {tracks.length === 0 && (
              <p className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
                Aucun morceau. Ajoutez des pistes depuis la bibliothèque.
              </p>
            )}

            <ol className="flex flex-col gap-1.5">
              {tracks.map((t, i) => {
                const trans = i < transitions.length ? transitions[i] : null;
                const selected = t.id === selectedId;
                return (
                  <li key={t.id}>
                    <div
                      onClick={() => setSelectedId(t.id)}
                      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
                        selected
                          ? "border-primary/50 bg-primary/10"
                          : "border-transparent hover:bg-surface-elevated/60"
                      }`}
                    >
                      <span className="tabular-nums w-6 text-right text-[11px] text-muted-foreground">
                        {i + 1}
                      </span>
                      <PlayPauseButton trackId={t.id} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{t.name}</p>
                        <p className="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
                          {t.bpm != null && <span>{Math.round(t.bpm)} BPM</span>}
                          {t.camelot && <span className="text-primary">{t.camelot}</span>}
                          {t.musicalKey && <span>{t.musicalKey}</span>}
                          <span>{formatDuration(t.durationSec)}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); move(i, i - 1); }}
                          disabled={i === 0}
                          className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground disabled:opacity-30"
                          aria-label="Monter"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); move(i, i + 1); }}
                          disabled={i === tracks.length - 1}
                          className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground disabled:opacity-30"
                          aria-label="Descendre"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFromActive(t.id); }}
                          className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-red-500/20 hover:text-red-400"
                          aria-label="Retirer du set"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <GripVertical className="h-3 w-3 text-muted-foreground/50" />
                      </div>
                    </div>
                    {trans && (
                      <div className={`ml-8 mt-0.5 mb-0.5 flex items-center gap-1.5 text-[10px] ${GRADE_COLOR[trans.grade]}`}>
                        <span className="font-semibold">{GRADE_LABEL[trans.grade]}</span>
                        <span className="opacity-70 tabular-nums">{trans.score}%</span>
                        <span className="opacity-60 truncate">— {trans.reason}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {/* right: mode / stats / transition details */}
          <div className="space-y-3">
            {/* global score */}
            <div className="rounded-xl border border-border/60 bg-surface-elevated/30 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Score global
              </p>
              <p className="font-display text-3xl font-bold tabular-nums">
                {globalScore != null ? `${globalScore}%` : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Basé sur {transitions.length} transition{transitions.length > 1 ? "s" : ""}
              </p>
            </div>

            {/* stats */}
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/60 bg-surface-elevated/30 p-3 text-xs">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Pistes</p>
                <p className="font-semibold tabular-nums">{stats.count}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Durée</p>
                <p className="font-semibold tabular-nums">{formatDuration(stats.duration)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">BPM moyen</p>
                <p className="font-semibold tabular-nums">
                  {stats.avgBpm != null ? stats.avgBpm.toFixed(1) : "—"}
                </p>
              </div>
            </div>

            {/* keys distribution */}
            {Object.keys(stats.keys).length > 0 && (
              <div className="rounded-xl border border-border/60 bg-surface-elevated/30 p-3">
                <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Tonalités
                </p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(stats.keys)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, n]) => (
                      <span key={k} className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary tabular-nums">
                        {k} · {n}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* mode picker */}
            <div className="rounded-xl border border-border/60 bg-surface-elevated/30 p-3">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Mode de génération
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {SET_MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => updateActiveMode(m.id)}
                    className={`rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
                      activeSet.mode === m.id
                        ? "bg-primary/20 text-primary"
                        : "bg-surface-elevated hover:bg-surface-elevated/80"
                    }`}
                  >
                    <p className="font-medium">{m.label}</p>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {getMode(activeSet.mode).description}
              </p>
            </div>

            {/* transition inspector */}
            {selectedTrack && (
              <div className="rounded-xl border border-border/60 bg-surface-elevated/30 p-3 text-xs">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Info className="h-3 w-3" /> Transitions autour de la piste
                </p>
                <p className="mb-2 truncate font-medium">{selectedTrack.name}</p>
                {incomingTransition && (
                  <div className={`mb-1 rounded-md bg-background/40 p-2 ${GRADE_COLOR[incomingTransition.grade]}`}>
                    <p className="font-semibold">← Entrée · {GRADE_LABEL[incomingTransition.grade]} ({incomingTransition.score}%)</p>
                    <p className="text-[11px] opacity-80">{incomingTransition.reason}</p>
                  </div>
                )}
                {outgoingTransition && (
                  <div className={`rounded-md bg-background/40 p-2 ${GRADE_COLOR[outgoingTransition.grade]}`}>
                    <p className="font-semibold">Sortie → · {GRADE_LABEL[outgoingTransition.grade]} ({outgoingTransition.score}%)</p>
                    <p className="text-[11px] opacity-80">{outgoingTransition.reason}</p>
                  </div>
                )}
                {!incomingTransition && !outgoingTransition && (
                  <p className="text-[11px] text-muted-foreground">Piste isolée.</p>
                )}
              </div>
            )}

            {/* apply actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={applyToLibrary}
                disabled={tracks.length === 0}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-gold px-3 py-2 text-xs font-semibold text-primary-foreground shadow-gold disabled:opacity-40"
              >
                <Save className="h-3.5 w-3.5" /> Appliquer à la bibliothèque
              </button>
              <button
                onClick={() => setActive(null)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-surface-elevated px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Fermer le set
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────── create dialog ─────── */}
      {showCreateDialog && (
        <CreateSetDialog
          onCancel={() => setShowCreateDialog(false)}
          onCreate={(name, mode) => {
            if (!project) return;
            const ids = project.tracks.map((t) => t.id);
            const ordered = getMode(mode).build(project.tracks);
            createSet(name, mode, ordered.length ? ordered : ids);
            setShowCreateDialog(false);
          }}
        />
      )}

      {/* ─────── add-tracks dialog ─────── */}
      {showAddDialog && activeSet && (
        <AddTracksDialog
          onClose={() => setShowAddDialog(false)}
          onAdd={(ids) => { addToActive(ids); setShowAddDialog(false); }}
          excludePaths={new Set(activeSet.paths)}
        />
      )}
    </div>
  );
}

/* ────────────────────── sub-components ────────────────────── */

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
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur">
      <div className="w-full max-w-md rounded-xl border border-border/60 bg-surface-elevated p-4 shadow-xl">
        <p className="mb-3 font-display text-base font-semibold">Créer un set</p>
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          Nom
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-3 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        />
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          Mode
        </label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as SetModeId)}
          className="mb-4 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        >
          {SET_MODES.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md bg-surface-elevated px-3 py-1.5 text-xs font-medium hover:bg-background"
          >
            Annuler
          </button>
          <button
            onClick={() => onCreate(name, mode)}
            className="rounded-md bg-gradient-gold px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold"
          >
            Créer
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur">
      <div className="flex h-[70vh] w-full max-w-lg flex-col rounded-xl border border-border/60 bg-surface-elevated p-4 shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <p className="flex-1 font-display text-base font-semibold">Ajouter des pistes</p>
          <button onClick={onClose} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-md hover:bg-background">
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher…"
          className="mb-3 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        />
        <div className="scrollbar-none flex-1 overflow-y-auto">
          {filtered.map((t) => {
            const on = selected.has(t.id);
            return (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs ${on ? "bg-primary/15" : "hover:bg-background/60"}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(t.id)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {t.bpm != null ? `${Math.round(t.bpm)} BPM · ` : ""}
                    {t.camelot ?? t.musicalKey ?? "—"}
                  </p>
                </div>
              </label>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Aucun morceau à ajouter.
            </p>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">{selected.size} sélectionné(s)</p>
          <button
            onClick={() => onAdd(Array.from(selected))}
            disabled={selected.size === 0}
            className="rounded-md bg-gradient-gold px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold disabled:opacity-40"
          >
            Ajouter au set
          </button>
        </div>
      </div>
    </div>
  );
}
