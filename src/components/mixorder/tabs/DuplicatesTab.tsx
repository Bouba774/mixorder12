import { useCallback, useMemo, useState } from "react";
import {
  Copy,
  Check,
  Star,
  Trash2,
  X,
  AlertTriangle,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import {
  useWorkspace,
  formatDuration,
  type Track,
} from "@/lib/workspace-context";
import { useDuplicates, type DupGroup } from "@/hooks/useDuplicates";

/**
 * Doublons — détection stricte à 3 critères (nom, durée, tonalité).
 *
 * L'utilisateur voit uniquement des doublons confirmés. Deux modes de
 * suppression sont proposés :
 *   1. Retirer de la bibliothèque MixOrder (le fichier reste sur l'appareil)
 *   2. Supprimer le fichier de l'appareil (destructif, avec confirmation)
 */

const nativeDelete: null | ((uri: string) => Promise<void>) = (() => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    // Chargement dynamique — le plugin n'est présent que sur build native.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("mixorder-folder-picker") as {
      FolderPicker?: { deleteFile?: (opts: { uri: string }) => Promise<void> };
    };
    const fn = mod?.FolderPicker?.deleteFile;
    return fn ? (uri: string) => fn({ uri }) : null;
  } catch {
    return null;
  }
})();

function shortenPath(path: string): string {
  if (!path) return "";
  // SAF URIs et chemins classiques : on garde les 2 derniers segments.
  const decoded = decodeURIComponent(path);
  const parts = decoded.split(/[/\\]/).filter(Boolean);
  if (parts.length <= 2) return parts.join("/");
  return "…/" + parts.slice(-2).join("/");
}

export function DuplicatesTab() {
  const { project, removeTracks } = useWorkspace();
  const { groups, setKeeper } = useDuplicates();

  // Sélection : par défaut = toutes les versions sauf le "keeper" du groupe.
  const [selection, setSelection] = useState<Record<string, Set<string>>>({});
  const [confirmDeviceDelete, setConfirmDeviceDelete] = useState(false);

  const trackById = useMemo(() => {
    const m = new Map<string, Track>();
    if (project) for (const t of project.tracks) m.set(t.id, t);
    return m;
  }, [project]);

  const getSel = useCallback(
    (g: DupGroup): Set<string> => {
      const cur = selection[g.id];
      if (cur) return cur;
      // Défaut : tout sauf le keeper.
      return new Set(g.trackIds.filter((id) => id !== g.keeperId));
    },
    [selection],
  );

  const setSel = (gid: string, next: Set<string>) => {
    setSelection((prev) => ({ ...prev, [gid]: next }));
  };

  const toggle = (gid: string, tid: string) => {
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    const cur = new Set(getSel(g));
    if (cur.has(tid)) cur.delete(tid);
    else cur.add(tid);
    setSel(gid, cur);
  };

  const selectAll = () => {
    const next: Record<string, Set<string>> = {};
    for (const g of groups) {
      next[g.id] = new Set(g.trackIds.filter((id) => id !== g.keeperId));
    }
    setSelection(next);
  };

  const clearAll = () => {
    const next: Record<string, Set<string>> = {};
    for (const g of groups) next[g.id] = new Set();
    setSelection(next);
  };

  const invertAll = () => {
    const next: Record<string, Set<string>> = {};
    for (const g of groups) {
      const cur = getSel(g);
      next[g.id] = new Set(g.trackIds.filter((id) => !cur.has(id)));
    }
    setSelection(next);
  };

  const allSelectedIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of groups) for (const id of getSel(g)) ids.push(id);
    return ids;
  }, [groups, getSel]);

  const selectedCount = allSelectedIds.length;
  const totalDupTracks = groups.reduce((n, g) => n + g.trackIds.length, 0);

  const removeFromLibrary = () => {
    if (selectedCount === 0) return;
    removeTracks(allSelectedIds);
    setSelection({});
  };

  const deleteFromDevice = async () => {
    if (selectedCount === 0) return;
    setConfirmDeviceDelete(false);
    if (nativeDelete) {
      // Suppression native SAF, best-effort.
      const failures: string[] = [];
      for (const id of allSelectedIds) {
        const t = trackById.get(id);
        if (!t) continue;
        try {
          await nativeDelete(t.path);
        } catch {
          failures.push(t.name);
        }
      }
      if (failures.length) {
        alert(
          `Impossible de supprimer ${failures.length} fichier${
            failures.length > 1 ? "s" : ""
          } sur l'appareil.`,
        );
      }
    }
    // Dans tous les cas on retire de la bibliothèque.
    removeTracks(allSelectedIds);
    setSelection({});
  };

  if (!project) return null;

  return (
    <div className="mx-auto max-w-3xl pb-24">
      {/* En-tête simple */}
      <header className="mb-6 px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Doublons
        </p>
        <h1 className="mt-1 font-display text-[22px] font-bold leading-tight text-foreground">
          Doublons détectés
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {groups.length} groupe{groups.length > 1 ? "s" : ""} ·{" "}
          {totalDupTracks} morceau{totalDupTracks > 1 ? "x" : ""}
        </p>
      </header>

      {/* Barre de sélection */}
      {groups.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SelBtn onClick={selectAll}>Tout sélectionner</SelBtn>
          <SelBtn onClick={clearAll}>Tout désélectionner</SelBtn>
          <SelBtn onClick={invertAll}>Inverser</SelBtn>
        </div>
      )}

      {/* Liste */}
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 px-4 py-14 text-center">
          <Copy className="mx-auto mb-3 h-6 w-6 text-muted-foreground/50" />
          <p className="text-sm font-medium">Aucun doublon détecté</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Détection stricte : cœur du nom + durée + tonalité identiques.
          </p>
        </div>
      ) : (
        <ul className="space-y-5">
          {groups.map((g) => {
            const keeper = trackById.get(g.keeperId);
            const sel = getSel(g);
            const others = g.trackIds.filter((id) => id !== g.keeperId);
            return (
              <li key={g.id}>
                {/* Titre retenu */}
                {keeper && (
                  <p className="mb-2 truncate px-1 font-display text-[15px] font-semibold text-foreground">
                    {keeper.name}
                  </p>
                )}
                <ol className="overflow-hidden rounded-2xl border border-border bg-surface">
                  {/* Keeper en premier */}
                  {keeper && (
                    <TrackLine
                      track={keeper}
                      isKeeper
                      selected={sel.has(keeper.id)}
                      onToggle={() => toggle(g.id, keeper.id)}
                      onMakeKeeper={() => {}}
                    />
                  )}
                  {others.map((id) => {
                    const t = trackById.get(id);
                    if (!t) return null;
                    return (
                      <TrackLine
                        key={id}
                        track={t}
                        isKeeper={false}
                        selected={sel.has(id)}
                        onToggle={() => toggle(g.id, id)}
                        onMakeKeeper={() => setKeeper(g, id)}
                      />
                    );
                  })}
                </ol>
              </li>
            );
          })}
        </ul>
      )}

      {/* Actions de suppression collées en bas */}
      {selectedCount > 0 && (
        <div
          className="fixed inset-x-0 z-30 border-t border-border bg-background/95 px-4 pt-3 backdrop-blur"
          style={{
            bottom: "calc(72px + env(safe-area-inset-bottom))",
            paddingBottom: "0.75rem",
          }}
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            <p className="text-center text-[11px] text-muted-foreground">
              {selectedCount} morceau{selectedCount > 1 ? "x" : ""} sélectionné
              {selectedCount > 1 ? "s" : ""}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={removeFromLibrary}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 font-display text-[13px] font-bold text-primary-foreground shadow-elevated active:scale-[0.98]"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
                Retirer de la bibliothèque
              </button>
              <button
                onClick={() => setConfirmDeviceDelete(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-transparent px-4 py-3 font-display text-[13px] font-bold text-red-400 active:scale-[0.98] hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2.5} />
                Supprimer de l'appareil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation destructive */}
      {confirmDeviceDelete && (
        <ConfirmDeviceDelete
          count={selectedCount}
          onCancel={() => setConfirmDeviceDelete(false)}
          onConfirm={deleteFromDevice}
        />
      )}
    </div>
  );
}

/* ─── ligne d'un morceau ─── */

function TrackLine({
  track,
  isKeeper,
  selected,
  onToggle,
  onMakeKeeper,
}: {
  track: Track;
  isKeeper: boolean;
  selected: boolean;
  onToggle: () => void;
  onMakeKeeper: () => void;
}) {
  return (
    <li
      className={`flex items-start gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 ${
        isKeeper ? "bg-primary/[0.04]" : "bg-transparent"
      }`}
    >
      <button
        onClick={onToggle}
        aria-label={selected ? "Désélectionner" : "Sélectionner"}
        className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md"
      >
        {selected ? (
          <span className="grid h-[18px] w-[18px] place-items-center rounded-sm bg-primary text-primary-foreground">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        ) : (
          <span className="h-[18px] w-[18px] rounded-sm border border-border-strong" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {isKeeper ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              <Star className="h-2.5 w-2.5" strokeWidth={2.5} /> Garder
            </span>
          ) : (
            <button
              onClick={onMakeKeeper}
              className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              Choisir
            </button>
          )}
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
            {track.name}
          </p>
        </div>
        <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
          {formatDuration(track.durationSec)}
          <span className="mx-1.5 opacity-40">·</span>
          {track.bpm != null ? `${Math.round(track.bpm)} BPM` : "— BPM"}
          <span className="mx-1.5 opacity-40">·</span>
          {track.camelot ?? track.musicalKey ?? "—"}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
          {shortenPath(track.path)}
        </p>
      </div>
    </li>
  );
}

function SelBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
    >
      {children}
    </button>
  );
}

/* ─── confirmation destructive ─── */

function ConfirmDeviceDelete({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-background/70 p-0 backdrop-blur sm:place-items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-5 shadow-elevated sm:rounded-2xl">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-500/15 text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-base font-semibold text-foreground">
              Supprimer de l'appareil ?
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Cette action supprimera définitivement{" "}
              <span className="font-semibold text-foreground">
                {count} fichier{count > 1 ? "s" : ""}
              </span>{" "}
              de votre appareil. Cette opération est irréversible.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-[13px] font-semibold text-foreground/80 hover:text-foreground"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-[13px] font-bold text-white shadow-elevated hover:bg-red-500/90"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
