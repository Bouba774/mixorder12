import { useMemo } from "react";
import {
  Waves, Check, AlertCircle, Pause, Play, RefreshCw, Zap, Gauge, ListRestart,
} from "lucide-react";
import { PageHeader } from "../PageHeader";
import { useWorkspace } from "@/lib/workspace-context";
import { useKeyAnalysisEngine } from "@/hooks/useKeyAnalysisEngine";
import { keyAnalysisEngine } from "@/lib/key-analysis/engine";

function formatMs(ms: number): string {
  if (!ms || !isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} min` : `${m} min ${r}s`;
}

/**
 * Analyse tab — foundation for automatic key/tonality detection.
 *
 * The BPM field is filled exclusively by the DiscDJ Robot, per project
 * decision. Tonality analysis is not wired to an engine yet: this tab
 * exposes the persisted state (done / pending / error), the progress
 * across the whole library and the per-track breakdown so a future
 * engine (Essentia WASM, cloud, ...) can plug in without any UI change.
 */
export function AnalysisTab() {
  const { project } = useWorkspace();
  const engine = useKeyAnalysisEngine();

  const stats = useMemo(() => {
    const tracks = project?.tracks ?? [];
    const withKey = tracks.filter((t) => !!t.musicalKey).length;
    const withBpm = tracks.filter((t) => t.bpm != null).length;
    return {
      total: tracks.length,
      withKey,
      withBpm,
      pending: tracks.filter((t) => t.analysisStatus === "pending").length,
      errors: tracks.filter((t) => t.analysisStatus === "error").length,
    };
  }, [project]);

  if (!project) return null;

  const pct = stats.total === 0 ? 0 : Math.round((stats.withKey / stats.total) * 100);
  const speed = engine.avgMsPerTrack > 0
    ? `${(60000 / engine.avgMsPerTrack).toFixed(1)}/min`
    : "—";

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Waves}
        eyebrow="Analyse"
        title="Détection des tonalités"
        subtitle="Moteur hybride local. Priorité automatique quand le Robot est actif."
      />
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/40 text-primary">
            <Waves className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold">Analyse des tonalités</p>
            <p className="text-[11px] text-muted-foreground">
              {stats.withKey} / {stats.total} tonalités détectées
              {engine.slowMode && " · Mode ralenti (Robot prioritaire)"}
            </p>
          </div>
          <span className="text-lg font-semibold text-primary tabular-nums">{pct}%</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
          <div className="h-full bg-gradient-gold transition-all" style={{ width: `${pct}%` }} />
        </div>
        {engine.currentTrackName && (
          <p className="mt-2 truncate text-[11px] text-muted-foreground">
            En cours : <span className="text-foreground">{engine.currentTrackName}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Total" value={String(engine.total)} />
        <StatCard label="Restants" value={String(engine.pending)} />
        <StatCard label="Erreurs" value={String(engine.errors)} tone={engine.errors > 0 ? "warn" : undefined} />
        <StatCard label="Temps restant" value={formatMs(engine.etaMs)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Vitesse" value={speed} icon={<Gauge className="h-3 w-3" />} />
        <StatCard
          label="Dernier"
          value={engine.lastAnalyzed
            ? `${engine.lastAnalyzed.key}${engine.lastAnalyzed.camelot ? ` · ${engine.lastAnalyzed.camelot}` : ""}`
            : "—"}
          icon={<Zap className="h-3 w-3" />}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {engine.running && !engine.paused ? (
          <button
            onClick={() => keyAnalysisEngine.pause()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:border-border-strong"
          >
            <Pause className="h-3.5 w-3.5" /> Suspendre
          </button>
        ) : (
          <button
            onClick={() => (engine.paused ? keyAnalysisEngine.resume() : keyAnalysisEngine.start())}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
          >
            <Play className="h-3.5 w-3.5" /> {engine.paused ? "Reprendre" : "Démarrer"}
          </button>
        )}
        <button
          onClick={() => { keyAnalysisEngine.requeue("errors"); keyAnalysisEngine.start(); }}
          disabled={engine.errors === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Réanalyser erreurs
        </button>
        <button
          onClick={() => {
            if (window.confirm("Réanalyser toute la bibliothèque ?")) {
              keyAnalysisEngine.requeue("all");
              keyAnalysisEngine.start();
            }
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:border-border-strong"
        >
          <ListRestart className="h-3.5 w-3.5" /> Tout réanalyser
        </button>
      </div>

      <ul className="overflow-hidden rounded-xl border border-border bg-surface">
        {project.tracks.slice(0, 40).map((t) => (
          <li key={t.id} className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-sm last:border-b-0">
            <StatusDot trackId={t.id} hasKey={!!t.musicalKey} />
            <span className="flex-1 truncate">{t.name}</span>
            <span className="tabular-nums text-[11px] text-muted-foreground">
              {t.musicalKey ?? "—"} {t.camelot ? `· ${t.camelot}` : ""}
            </span>
          </li>
        ))}
        {project.tracks.length > 40 && (
          <li className="px-3 py-2 text-center text-[11px] text-muted-foreground">
            + {project.tracks.length - 40} pistes…
          </li>
        )}
      </ul>

      <section>
        <h3 className="mb-2 px-1 font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Journal des analyses
        </h3>
        <ul className="max-h-64 overflow-auto rounded-xl border border-border bg-surface">
          {engine.log.length === 0 && (
            <li className="px-3 py-3 text-center text-[11px] text-muted-foreground">
              Aucune activité pour le moment.
            </li>
          )}
          {engine.log.map((entry) => (
            <li
              key={entry.ts + entry.message}
              className="flex items-start gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] last:border-b-0"
            >
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                  entry.level === "error"
                    ? "bg-destructive"
                    : entry.level === "warn"
                      ? "bg-amber-400"
                      : "bg-primary"
                }`}
              />
              <span className="flex-1 text-foreground/90">{entry.message}</span>
              <span className="text-muted-foreground tabular-nums">
                {new Date(entry.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatCard({
  label, value, tone, icon,
}: {
  label: string; value: string; tone?: "warn"; icon?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border bg-surface px-3 py-2.5 ${tone === "warn" ? "border-amber-500/40" : "border-border"}`}>
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}{label}
      </p>
      <p className={`mt-1 font-display text-lg font-semibold tabular-nums ${tone === "warn" ? "text-amber-400" : ""}`}>{value}</p>
    </div>
  );
}

function StatusDot({ trackId, hasKey }: { trackId: string; hasKey: boolean }) {
  const engine = useKeyAnalysisEngine();
  const current = engine.currentTrackName;
  const isCurrent = current && engine.log[0]?.message.startsWith(current);
  // Fallback: highlight the current-name row.
  void isCurrent; void trackId;
  if (hasKey) return <Check className="h-3.5 w-3.5 text-primary" />;
  return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground/50" />;
}
