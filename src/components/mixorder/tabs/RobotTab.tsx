import { useMemo } from "react";
import { Music2, Loader2, Check, AlertTriangle, Trash2 } from "lucide-react";
import { DiscDJAccessibilityGate } from "../DiscDJAccessibilityGate";
import { DiscDJRobotPanel } from "../DiscDJRobotPanel";
import { useWorkspace } from "@/lib/workspace-context";
import { useRobotJournal } from "@/hooks/useRobotJournal";

/**
 * Robot tab — pure BPM acquisition surface.
 *
 * The main library is the single source of truth. This tab shows:
 *  • the 4-state overview derived directly from `project.tracks` (à
 *    analyser / en cours / analysé / erreur), never from an internal
 *    robot list;
 *  • the calibration + settings + progress panel;
 *  • the persistent journal (survives app closures).
 */
export function RobotTab() {
  return (
    <div className="space-y-4">
      <LibraryStates />
      <DiscDJAccessibilityGate>
        <DiscDJRobotPanel />
      </DiscDJAccessibilityGate>
      <RobotJournal />
    </div>
  );
}

function LibraryStates() {
  const { project } = useWorkspace();
  const stats = useMemo(() => {
    const tracks = project?.tracks ?? [];
    let toAnalyse = 0, analysing = 0, done = 0, error = 0;
    for (const t of tracks) {
      if (t.analysisStatus === "analyzing") analysing++;
      else if (t.analysisStatus === "error") error++;
      else if (t.bpm != null) done++;
      else toAnalyse++;
    }
    return { total: tracks.length, toAnalyse, analysing, done, error };
  }, [project]);
  if (!project) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StateCard tone="neutral" icon={<Music2 className="h-3.5 w-3.5" />} label="À analyser" value={stats.toAnalyse} />
      <StateCard tone="primary" icon={<Loader2 className="h-3.5 w-3.5" />} label="En cours" value={stats.analysing} />
      <StateCard tone="success" icon={<Check className="h-3.5 w-3.5" />} label="Analysés" value={stats.done} />
      <StateCard tone={stats.error > 0 ? "warn" : "neutral"} icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Erreurs" value={stats.error} />
    </div>
  );
}

function StateCard({
  label, value, icon, tone,
}: {
  label: string; value: number; icon: React.ReactNode;
  tone: "neutral" | "primary" | "success" | "warn";
}) {
  const toneClass =
    tone === "primary" ? "border-primary/40 text-primary"
    : tone === "success" ? "border-emerald-500/40 text-emerald-500"
    : tone === "warn" ? "border-amber-500/50 text-amber-400"
    : "border-border text-muted-foreground";
  return (
    <div className={`rounded-xl border bg-surface px-3 py-2.5 ${toneClass}`}>
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider">
        {icon}{label}
      </p>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function RobotJournal() {
  const { entries, clear } = useRobotJournal();
  if (entries.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border/70 bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Journal du Robot
        </h3>
        <button
          onClick={clear}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] font-semibold text-muted-foreground hover:border-border-strong hover:text-foreground"
        >
          <Trash2 className="h-3 w-3" /> Vider
        </button>
      </div>
      <ul className="max-h-72 overflow-auto rounded-lg border border-border/60 bg-background/60">
        {entries.map((e) => (
          <li
            key={`${e.ts}-${e.trackId}`}
            className="flex items-start gap-2 border-b border-border/40 px-3 py-1.5 text-[11px] last:border-b-0"
          >
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
              e.outcome === "success" ? "bg-emerald-500"
              : e.outcome === "retry" ? "bg-amber-400"
              : e.outcome === "error" ? "bg-destructive"
              : "bg-muted-foreground/40"
            }`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-foreground">{e.name}</p>
              {e.message && (
                <p className="truncate text-[10px] text-muted-foreground">{e.message}</p>
              )}
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <p className="font-display text-xs font-semibold text-foreground">
                {e.bpm != null ? `${e.bpm} BPM` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {new Date(e.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                {e.attempts > 1 ? ` · ${e.attempts} essais` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
