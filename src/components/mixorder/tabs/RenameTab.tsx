import { useMemo, useState } from "react";
import { Pencil, Check, Undo2, Wand2 } from "lucide-react";
import { useWorkspace, type Track } from "@/lib/workspace-context";

/**
 * Renommage tab — inline single-track rename plus a batch pattern rename.
 *
 * Supported tokens in the pattern input:
 *   {name}   → current track name
 *   {bpm}    → BPM if present
 *   {key}    → musical key if present
 *   {cam}    → Camelot notation if present
 *   {n}      → 1-based index in the library (zero-padded to 3 digits)
 *
 * Every rename is stored in the track's `renameHistory`, so users can
 * always audit or revert what was changed.
 */
function applyPattern(pattern: string, t: Track, idx: number): string {
  return pattern
    .replace(/\{name\}/g, t.name)
    .replace(/\{bpm\}/g, t.bpm != null ? String(Math.round(t.bpm)) : "")
    .replace(/\{key\}/g, t.musicalKey ?? "")
    .replace(/\{cam\}/g, t.camelot ?? "")
    .replace(/\{n\}/g, String(idx + 1).padStart(3, "0"))
    .replace(/\s+/g, " ")
    .trim();
}

export function RenameTab() {
  const { project, renameTrack } = useWorkspace();
  const [pattern, setPattern] = useState("{cam} · {bpm} · {name}");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const preview = useMemo(() => {
    const tracks = project?.tracks ?? [];
    return tracks.map((t, i) => ({ track: t, next: applyPattern(pattern, t, i) }));
  }, [project, pattern]);

  if (!project) return null;

  const applyAll = () => {
    for (const { track, next } of preview) {
      if (next && next !== track.name) renameTrack(track.id, next);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <p className="font-display text-sm font-semibold">Renommage par motif</p>
        </div>
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="{cam} · {bpm} · {name}"
          className="mt-3 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-primary/50 focus:outline-none"
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Jetons : {"{name}"} {"{bpm}"} {"{key}"} {"{cam}"} {"{n}"}
        </p>
        <button
          onClick={applyAll}
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-gold text-sm font-semibold text-primary-foreground shadow-gold active:scale-[0.98]"
        >
          <Check className="h-4 w-4" /> Appliquer à toute la bibliothèque
        </button>
      </div>

      <ul className="space-y-2">
        {preview.map(({ track, next }) => {
          const editing = editingId === track.id;
          const changed = next && next !== track.name;
          return (
            <li key={track.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      autoFocus
                      className="h-9 w-full rounded-md border border-primary/40 bg-background px-2 text-sm"
                    />
                  ) : (
                    <p className="truncate text-sm font-medium">{track.name}</p>
                  )}
                  {changed && !editing && (
                    <p className="mt-1 truncate text-[11px] text-primary">→ {next}</p>
                  )}
                  {track.renameHistory.length > 0 && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {track.renameHistory.length} renommage{track.renameHistory.length > 1 ? "s" : ""} historique
                    </p>
                  )}
                </div>
                {editing ? (
                  <>
                    <button
                      onClick={() => { renameTrack(track.id, draft); setEditingId(null); }}
                      className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground"
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setEditingId(track.id); setDraft(track.name); }}
                    aria-label="Renommer"
                    className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
