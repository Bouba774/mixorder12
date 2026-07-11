import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Waves,
  Music2,
  ArrowRight,
  SkipForward,
  Check,
  RefreshCw,
  Pencil,
  Info,
} from "lucide-react";
import { useWorkspace, type Track } from "@/lib/workspace-context";
import { BPM_SOURCES, getSource } from "@/lib/analysis/sources";
import type { BpmSourceId } from "@/lib/analysis/types";
import { DiscDJRobotPanel } from "./DiscDJRobotPanel";

interface Props {
  onBack: () => void;
}

const MIN_BPM = 40;
const MAX_BPM = 240;

export function AnalysisWorkspace({ onBack }: Props) {
  const { project, setTrackAnalysis } = useWorkspace();
  const [sourceId, setSourceId] = useState<BpmSourceId>("manual-discdj");
  // Snapshot the queue when the run starts so newly-imported tracks don't jump in.
  const [queueIds, setQueueIds] = useState<string[] | null>(null);
  const [bpmDraft, setBpmDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const source = getSource(sourceId)!;

  // Derived: pending vs done based on live library state — single source of truth.
  const tracksById = useMemo(() => {
    const m = new Map<string, Track>();
    if (project) for (const t of project.tracks) m.set(t.id, t);
    return m;
  }, [project]);

  const pendingTracks = useMemo<Track[]>(() => {
    if (!project) return [];
    return project.tracks.filter((t) => t.bpm === null);
  }, [project]);

  const analysedTracks = useMemo<Track[]>(() => {
    if (!project) return [];
    return project.tracks.filter((t) => t.bpm !== null);
  }, [project]);

  const activeQueue = useMemo<Track[]>(() => {
    if (!project) return [];
    if (queueIds) {
      // Follow the snapshotted queue but drop items that are gone / already done.
      return queueIds
        .map((id) => tracksById.get(id))
        .filter((t): t is Track => !!t && t.bpm === null);
    }
    return pendingTracks;
  }, [project, queueIds, tracksById, pendingTracks]);

  const totalRun = queueIds?.length ?? pendingTracks.length;
  const doneInRun = totalRun - activeQueue.length;
  const isRunning = queueIds !== null;
  const currentTrack = isRunning ? activeQueue[0] ?? null : null;

  useEffect(() => {
    // Reset draft when moving to a new track.
    setBpmDraft("");
    // Focus the BPM input on mobile after a small delay so the sheet is ready.
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [currentTrack?.id]);

  const startRun = useCallback(() => {
    if (!project) return;
    setQueueIds(pendingTracks.map((t) => t.id));
  }, [project, pendingTracks]);

  const stopRun = useCallback(() => {
    setQueueIds(null);
    setBpmDraft("");
  }, []);

  const parseBpm = (raw: string): number | null => {
    const n = parseFloat(raw.replace(",", "."));
    if (!isFinite(n)) return null;
    if (n < MIN_BPM || n > MAX_BPM) return null;
    // Store one decimal max — DiscDJ typically shows .0 / .5 etc.
    return Math.round(n * 10) / 10;
  };

  const confirmBpm = useCallback(() => {
    if (!currentTrack) return;
    const bpm = parseBpm(bpmDraft);
    if (bpm === null) return;
    setTrackAnalysis(currentTrack.id, { bpm }, sourceId);
  }, [currentTrack, bpmDraft, setTrackAnalysis, sourceId]);

  const skipCurrent = useCallback(() => {
    if (!currentTrack || !queueIds) return;
    // Move the current id to the end of the queue.
    setQueueIds((q) => {
      if (!q) return q;
      const idx = q.indexOf(currentTrack.id);
      if (idx < 0) return q;
      const next = q.slice();
      const [id] = next.splice(idx, 1);
      next.push(id);
      return next;
    });
  }, [currentTrack, queueIds]);

  const clearBpm = useCallback(
    (id: string) => {
      setTrackAnalysis(id, { bpm: null }, sourceId);
    },
    [setTrackAnalysis, sourceId],
  );

  const commitEdit = useCallback(() => {
    if (!editing) return;
    const bpm = parseBpm(editingValue);
    if (bpm !== null) setTrackAnalysis(editing, { bpm }, sourceId);
    setEditing(null);
    setEditingValue("");
  }, [editing, editingValue, setTrackAnalysis, sourceId]);

  if (!project) return null;

  const progressPct =
    totalRun > 0 ? Math.min(100, Math.round((doneInRun / totalRun) * 100)) : 0;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="glass sticky top-0 z-30 border-b border-border/60">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            aria-label="Retour à la bibliothèque"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent/40 text-primary">
              <Waves className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold leading-tight">
                Analyse — {project.name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {analysedTracks.length} / {project.tracks.length} morceaux analysés
              </p>
            </div>
          </div>
          <div className="w-9" />
        </div>
        {isRunning && (
          <div className="px-4 pb-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>
                {doneInRun} / {totalRun}
              </span>
              <span>{Math.max(0, totalRun - doneInRun)} restants</span>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 space-y-5 px-4 py-5 pb-32">
        {/* Source picker */}
        <section className="animate-fade-up space-y-2">
          <h2 className="px-1 font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Source des BPM
          </h2>
          <div className="space-y-2">
            {BPM_SOURCES.map((s) => {
              const active = s.id === sourceId;
              return (
                <button
                  key={s.id}
                  disabled={!s.available}
                  onClick={() => s.available && setSourceId(s.id)}
                  className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? "border-primary/50 bg-accent/40"
                      : "border-border bg-surface hover:border-border-strong"
                  } ${!s.available ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <div
                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                      active ? "border-primary bg-primary" : "border-border-strong"
                    }`}
                  >
                    {active && (
                      <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {s.label}
                      {!s.available && (
                        <span className="ml-2 rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          Bientôt
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {s.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Auto robot mode */}
        {sourceId === "discdj-auto" && (
          <>
            <section
              className="animate-fade-up"
              style={{ animationDelay: "40ms" }}
            >
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="mb-2 flex items-center gap-2 text-primary">
                  <Info className="h-4 w-4" />
                  <h3 className="font-display text-sm font-semibold text-foreground">
                    Avant de lancer le robot
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {source.instructions}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground/80">
                  {pendingTracks.length === 0
                    ? "Tous les morceaux ont déjà un BPM."
                    : `${pendingTracks.length} morceau${pendingTracks.length > 1 ? "x" : ""} sans BPM à traiter.`}
                </p>
              </div>
            </section>
            <DiscDJRobotPanel />
          </>
        )}

        {/* Manual (guided) mode — instructions + current track */}
        {sourceId === "manual-discdj" && (!isRunning ? (
          <section className="animate-fade-up space-y-3" style={{ animationDelay: "60ms" }}>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-2 flex items-center gap-2 text-primary">
                <Info className="h-4 w-4" />
                <h3 className="font-display text-sm font-semibold text-foreground">
                  Avant de commencer
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {source.instructions}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm font-medium">
                {pendingTracks.length === 0
                  ? "Tous les morceaux ont déjà un BPM."
                  : `${pendingTracks.length} morceau${
                      pendingTracks.length > 1 ? "x" : ""
                    } sans BPM.`}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Les BPM déjà enregistrés sont conservés — l'analyse ne traite que
                les morceaux manquants.
              </p>
              <button
                disabled={pendingTracks.length === 0}
                onClick={startRun}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Waves className="h-4 w-4" />
                {analysedTracks.length > 0 ? "Reprendre l'analyse" : "Démarrer l'analyse"}
              </button>
            </div>
          </section>
        ) : currentTrack ? (
          <section
            className="animate-fade-up space-y-3"
            style={{ animationDelay: "60ms" }}
          >
            <div className="rounded-2xl border border-primary/30 bg-accent/20 p-4">
              <p className="text-[11px] font-medium uppercase tracking-widest text-primary">
                Morceau courant
              </p>
              <div className="mt-2 flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Music2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-semibold leading-tight">
                    {currentTrack.name}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {currentTrack.originalName}
                  </p>
                </div>
              </div>

              <label className="mt-4 block text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                BPM lu dans DiscDJ
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={MIN_BPM}
                  max={MAX_BPM}
                  value={bpmDraft}
                  onChange={(e) => setBpmDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmBpm();
                  }}
                  placeholder="128"
                  className="h-14 flex-1 rounded-xl border border-border-strong bg-surface px-4 text-center font-display text-2xl font-semibold tabular-nums focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={confirmBpm}
                  disabled={parseBpm(bpmDraft) === null}
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Valider et passer au suivant"
                >
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={skipCurrent}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  Passer
                </button>
                <button
                  onClick={stopRun}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                >
                  Pause
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="animate-fade-up rounded-xl border border-border bg-surface p-6 text-center">
            <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
              <Check className="h-5 w-5" />
            </div>
            <p className="font-display text-sm font-semibold">Analyse terminée</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Tous les morceaux de cette session ont un BPM.
            </p>
            <button
              onClick={stopRun}
              className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-xs font-medium text-foreground hover:border-border-strong"
            >
              Retour
            </button>
          </section>
        ))}

        {/* Analysed list */}
        {analysedTracks.length > 0 && (
          <section
            className="animate-fade-up space-y-2"
            style={{ animationDelay: "120ms" }}
          >
            <div className="flex items-baseline justify-between px-1">
              <h2 className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                BPM récupérés
              </h2>
              <span className="text-[11px] text-muted-foreground">
                {analysedTracks.length}
              </span>
            </div>
            <ul className="overflow-hidden rounded-xl border border-border bg-surface">
              {analysedTracks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight">
                      {t.name}
                    </p>
                  </div>
                  {editing === t.id ? (
                    <>
                      <input
                        autoFocus
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") {
                            setEditing(null);
                            setEditingValue("");
                          }
                        }}
                        className="h-8 w-20 rounded-md border border-primary/50 bg-background px-2 text-center text-sm tabular-nums focus:outline-none"
                      />
                      <button
                        onClick={commitEdit}
                        className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground"
                        aria-label="Valider"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-xs font-semibold tabular-nums text-primary">
                        {t.bpm !== null ? t.bpm.toFixed(1) : "—"}
                        <span className="text-[9px] font-medium uppercase opacity-70">
                          bpm
                        </span>
                      </span>
                      <button
                        onClick={() => {
                          setEditing(t.id);
                          setEditingValue(String(t.bpm ?? ""));
                        }}
                        className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                        aria-label="Modifier"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => clearBpm(t.id)}
                        className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                        aria-label="Effacer et re-analyser"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
