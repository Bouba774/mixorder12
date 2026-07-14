import { useMemo, useState } from "react";
import {
  Copy,
  Trash2,
  Check,
  Star,
  ShieldCheck,
  ShieldAlert,
  Shield,
  EyeOff,
  RotateCcw,
  Merge,
  Filter,
} from "lucide-react";
import { useWorkspace, formatDuration, type Track } from "@/lib/workspace-context";
import { useDuplicates, type DupConfidence, type DupGroup } from "@/hooks/useDuplicates";
import { PageHeader } from "../PageHeader";

/**
 * Duplicates tab — full-featured local duplicate detection UI.
 *
 * Groups are produced by the pure detector in `src/lib/duplicates/engine.ts`
 * and combined with persisted user decisions (ignored groups, custom keeper
 * choice). The tab never touches disk: "supprimer de l'appareil" is exposed
 * but flagged as a future action pending the native storage bridge.
 */

const CONF_META: Record<
  DupConfidence,
  { label: string; icon: typeof ShieldCheck; className: string }
> = {
  certain: {
    label: "Doublon certain",
    icon: ShieldCheck,
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  probable: {
    label: "Doublon probable",
    icon: ShieldAlert,
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  check: {
    label: "À vérifier",
    icon: Shield,
    className: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
};

type FilterKind = "all" | DupConfidence | "ignored";

export function DuplicatesTab() {
  const { project, mergeAndRemoveDuplicates, toggleFavorite } = useWorkspace();
  const { groups, state, ignoreGroup, restoreIgnored, setKeeper } = useDuplicates();
  const [filter, setFilter] = useState<FilterKind>("all");
  const [extFilter, setExtFilter] = useState<string>("all");
  const [selection, setSelection] = useState<Record<string, Set<string>>>({});

  const trackById = useMemo(() => {
    const m = new Map<string, Track>();
    if (project) for (const t of project.tracks) m.set(t.id, t);
    return m;
  }, [project]);

  const allExtensions = useMemo(() => {
    const s = new Set<string>();
    for (const g of groups) for (const id of g.trackIds) {
      const t = trackById.get(id);
      if (t?.extension) s.add(t.extension);
    }
    return Array.from(s).sort();
  }, [groups, trackById]);

  const visibleGroups = useMemo(() => {
    return groups.filter((g) => {
      if (filter !== "all" && filter !== "ignored" && g.confidence !== filter) return false;
      if (extFilter !== "all") {
        const hasExt = g.trackIds.some((id) => trackById.get(id)?.extension === extFilter);
        if (!hasExt) return false;
      }
      return true;
    });
  }, [groups, filter, extFilter, trackById]);

  if (!project) return null;

  const toggleSel = (groupId: string, trackId: string) => {
    setSelection((prev) => {
      const cur = new Set(prev[groupId] ?? []);
      if (cur.has(trackId)) cur.delete(trackId);
      else cur.add(trackId);
      return { ...prev, [groupId]: cur };
    });
  };

  const selectAllExceptKeeper = (g: DupGroup) => {
    setSelection((prev) => ({
      ...prev,
      [g.id]: new Set(g.trackIds.filter((id) => id !== g.keeperId)),
    }));
  };

  const invertSelection = (g: DupGroup) => {
    setSelection((prev) => {
      const cur = prev[g.id] ?? new Set<string>();
      const next = new Set(g.trackIds.filter((id) => !cur.has(id)));
      return { ...prev, [g.id]: next };
    });
  };

  const autoSelectAll = () => {
    const next: Record<string, Set<string>> = {};
    for (const g of visibleGroups) {
      next[g.id] = new Set(g.trackIds.filter((id) => id !== g.keeperId));
    }
    setSelection(next);
  };

  const mergeGroup = (g: DupGroup) => {
    const sel = selection[g.id] ?? new Set(g.trackIds.filter((id) => id !== g.keeperId));
    const sources = Array.from(sel).filter((id) => id !== g.keeperId);
    if (sources.length === 0) return;
    mergeAndRemoveDuplicates(g.keeperId, sources);
    setSelection((prev) => {
      const next = { ...prev };
      delete next[g.id];
      return next;
    });
  };

  const totalDupTracks = groups.reduce((n, g) => n + g.trackIds.length, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Copy}
        eyebrow="Doublons"
        title="Détection intelligente"
        subtitle="Empreinte + durée + nom normalisé. Aucun fichier n'est modifié sans confirmation."
      />
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm font-semibold">
            {groups.length} groupes de doublons
          </p>
          <p className="text-[11px] text-muted-foreground">
            {totalDupTracks} morceaux · {project.tracks.length} au total
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state.ignoredPairs.length > 0 && (
            <button
              onClick={restoreIgnored}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[11px] font-medium hover:bg-accent/20"
              title="Restaurer les groupes ignorés"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restaurer
            </button>
          )}
          <button
            onClick={autoSelectAll}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[11px] font-medium hover:bg-accent/20"
            title="Sélectionner tous les doublons sauf le morceau recommandé"
          >
            <Check className="h-3.5 w-3.5" /> Sélection auto
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {(["all", "certain", "probable", "check"] as FilterKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
              filter === k
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            {k === "all"
              ? "Tous"
              : k === "certain"
                ? "Certains"
                : k === "probable"
                  ? "Probables"
                  : "À vérifier"}
          </button>
        ))}
        {allExtensions.length > 0 && (
          <select
            value={extFilter}
            onChange={(e) => setExtFilter(e.target.value)}
            className="ml-1 h-7 shrink-0 rounded-full border border-border bg-surface px-2 text-[11px] text-foreground"
          >
            <option value="all">Toutes extensions</option>
            {allExtensions.map((e) => (
              <option key={e} value={e}>
                .{e}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Groups */}
      {visibleGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center">
          <Copy className="mx-auto h-6 w-6 text-muted-foreground/70" />
          <p className="mt-2 text-sm font-medium">Aucun doublon détecté</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {project.tracks.length} morceaux analysés localement.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleGroups.map((g) => {
            const meta = CONF_META[g.confidence];
            const Icon = meta.icon;
            const sel = selection[g.id] ?? new Set<string>();
            const pct = Math.round(g.score * 100);
            return (
              <li
                key={g.id}
                className="overflow-hidden rounded-xl border border-border bg-surface"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-accent/10 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.className}`}
                    >
                      <Icon className="h-3 w-3" /> {meta.label}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {pct}% · {g.trackIds.length} versions
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => selectAllExceptKeeper(g)}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-medium hover:bg-accent/20"
                      title="Sélectionner tous sauf recommandé"
                    >
                      Tout
                    </button>
                    <button
                      onClick={() => invertSelection(g)}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-medium hover:bg-accent/20"
                    >
                      Inverser
                    </button>
                    <button
                      onClick={() => ignoreGroup(g)}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-medium hover:bg-accent/20"
                      title="Ignorer ce groupe"
                    >
                      <EyeOff className="h-3 w-3" /> Ignorer
                    </button>
                  </div>
                </div>

                <ul>
                  {g.trackIds.map((id) => {
                    const t = trackById.get(id);
                    if (!t) return null;
                    const isKeeper = g.keeperId === id;
                    const isSelected = sel.has(id);
                    return (
                      <li
                        key={id}
                        className={`flex items-start gap-2 border-b border-border/60 px-3 py-2 last:border-b-0 ${
                          isKeeper ? "bg-primary/[0.04]" : ""
                        }`}
                      >
                        <button
                          onClick={() => toggleSel(g.id, id)}
                          aria-label="Marquer pour suppression"
                          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md"
                        >
                          {isSelected ? (
                            <div className="grid h-4 w-4 place-items-center rounded-sm bg-destructive text-destructive-foreground">
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="h-4 w-4 rounded-sm border border-border-strong" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {isKeeper && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                                <Star className="h-2.5 w-2.5" /> Garder
                              </span>
                            )}
                            <p className="truncate text-sm font-medium">{t.name}</p>
                          </div>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {t.path}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
                            {t.bpm != null && <span>{t.bpm} BPM</span>}
                            {t.camelot && <span>· {t.camelot}</span>}
                            {t.musicalKey && !t.camelot && <span>· {t.musicalKey}</span>}
                            <span>· {formatDuration(t.durationSec)}</span>
                            <span>· {(t.size / (1024 * 1024)).toFixed(1)} MB</span>
                            <span>· .{t.extension}</span>
                            <span>· {new Date(t.addedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {!isKeeper && (
                            <button
                              onClick={() => setKeeper(g, id)}
                              className="rounded border border-border bg-surface px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground hover:text-foreground"
                              title="Choisir ce morceau comme celui à conserver"
                            >
                              Garder
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-surface/60 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">
                    La fusion transfère BPM · tonalité · favori · historique au
                    morceau conservé avant suppression.
                  </p>
                  <button
                    onClick={() => mergeGroup(g)}
                    disabled={
                      (selection[g.id]?.size ?? 0) === 0 &&
                      g.trackIds.length <= 1
                    }
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-destructive px-3 text-[11px] font-semibold text-destructive-foreground disabled:opacity-40"
                  >
                    <Merge className="h-3.5 w-3.5" />
                    Fusionner &amp; retirer
                    {sel.size > 0 && <span className="tabular-nums">({sel.size})</span>}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="pt-1 text-center text-[10px] text-muted-foreground/70">
        Détection 100% locale · noms normalisés · durée · taille · artiste ·
        extension. Aucun fichier n'est copié ni modifié sans confirmation.
      </p>
    </div>
  );
}

// Silence unused-import warning: Trash2 kept for future "delete from device" action.
void Trash2;
