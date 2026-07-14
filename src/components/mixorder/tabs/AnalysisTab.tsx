import { useMemo } from "react";
import { Waves, Check, AlertCircle } from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";

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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/40 text-primary">
            <Waves className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold">Analyse des tonalités</p>
            <p className="text-[11px] text-muted-foreground">
              {stats.withKey} / {stats.total} tonalités détectées
            </p>
          </div>
          <span className="text-lg font-semibold text-primary tabular-nums">{pct}%</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
          <div className="h-full bg-gradient-gold transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard label="BPM (via Robot)" value={`${stats.withBpm}/${stats.total}`} />
        <StatCard label="En attente" value={String(stats.pending)} />
      </div>

      <div className="rounded-xl border border-dashed border-border bg-surface/50 p-6 text-center">
        <AlertCircle className="mx-auto h-6 w-6 text-muted-foreground/70" />
        <p className="mt-2 text-sm font-medium">Moteur de détection à venir</p>
        <p className="mt-1 text-xs text-muted-foreground">
          L'architecture est prête : les tonalités détectées seront persistées avec la
          bibliothèque et disponibles dans tous les onglets.
        </p>
      </div>

      <ul className="overflow-hidden rounded-xl border border-border bg-surface">
        {project.tracks.slice(0, 40).map((t) => (
          <li key={t.id} className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-sm last:border-b-0">
            <span className="grid h-6 w-6 place-items-center rounded-md">
              {t.musicalKey ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />}
            </span>
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
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
