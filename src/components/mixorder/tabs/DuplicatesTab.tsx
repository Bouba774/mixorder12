import { useMemo, useState } from "react";
import { Copy, Trash2, Check } from "lucide-react";
import { useWorkspace, type Track } from "@/lib/workspace-context";

/**
 * Duplicates tab — groups tracks that likely refer to the same audio.
 * Detection is deliberately simple and fast: normalize the name (lowercase,
 * strip extension / feat / remix noise) then group by (normalized name,
 * rounded size). Works well for downloaded folders that keep several
 * copies under different remix suffixes.
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/\(feat[^)]*\)/g, "")
    .replace(/\(prod[^)]*\)/g, "")
    .replace(/[\[\](){}]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function DuplicatesTab() {
  const { project, removeTracks } = useWorkspace();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const tracks = project?.tracks ?? [];
    const map = new Map<string, Track[]>();
    for (const t of tracks) {
      const key = normalize(t.name || t.originalName);
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .filter(([, list]) => list.length > 1)
      .map(([key, list]) => ({ key, tracks: list }))
      .sort((a, b) => b.tracks.length - a.tracks.length);
  }, [project]);

  if (!project) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeSelected = () => {
    if (selected.size === 0) return;
    removeTracks(Array.from(selected));
    setSelected(new Set());
  };

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center">
        <Copy className="mx-auto h-6 w-6 text-muted-foreground/70" />
        <p className="mt-2 text-sm font-medium">Aucun doublon détecté</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {project.tracks.length} morceaux scannés.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-sm font-semibold">{groups.length} groupes de doublons</p>
          <p className="text-[11px] text-muted-foreground">
            {groups.reduce((n, g) => n + g.tracks.length, 0)} morceaux concernés
          </p>
        </div>
        <button
          onClick={removeSelected}
          disabled={selected.size === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-semibold text-destructive-foreground disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" /> Retirer ({selected.size})
        </button>
      </div>

      <ul className="space-y-3">
        {groups.map((g) => (
          <li key={g.key} className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="border-b border-border/60 bg-accent/20 px-3 py-2 text-xs font-medium text-muted-foreground">
              {g.tracks.length} versions · <span className="text-foreground">{g.key}</span>
            </div>
            <ul>
              {g.tracks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-b-0">
                  <button
                    onClick={() => toggle(t.id)}
                    aria-label="Marquer pour suppression"
                    className="grid h-6 w-6 place-items-center rounded-md"
                  >
                    {selected.has(t.id) ? (
                      <div className="grid h-4 w-4 place-items-center rounded-sm bg-destructive text-destructive-foreground">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="h-4 w-4 rounded-sm border border-border-strong" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{t.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{t.originalName}</p>
                  </div>
                  <span className="tabular-nums text-[10px] text-muted-foreground">
                    {(t.size / (1024 * 1024)).toFixed(1)} MB
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
