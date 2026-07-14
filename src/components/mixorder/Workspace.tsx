import { useState } from "react";
import { ChevronLeft, FolderOpen, Loader2, Library, Bot, Waves, Copy, Pencil, ListMusic } from "lucide-react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { formatDuration, useWorkspace } from "@/lib/workspace-context";
import { LibraryTab } from "./tabs/LibraryTab";
import { RobotTab } from "./tabs/RobotTab";
import { AnalysisTab } from "./tabs/AnalysisTab";
import { DuplicatesTab } from "./tabs/DuplicatesTab";
import { RenameTab } from "./tabs/RenameTab";
import { SetBuilderTab } from "./tabs/SetBuilderTab";
import { MiniPlayer } from "./player/MiniPlayer";
import { usePlayer } from "@/lib/player/player-context";
import { TabErrorBoundary } from "./TabErrorBoundary";


/**
 * The Workspace is the single shell every feature of MixOrder lives in.
 * Five tabs, one shared library, one source of truth — everything else
 * (Robot, key analysis, duplicates, renaming) reads from the same
 * `useWorkspace()` state and its persisted snapshot.
 */

type TabId = "library" | "robot" | "analysis" | "duplicates" | "setbuilder" | "rename";

const TABS: Array<{ id: TabId; label: string; icon: typeof Library }> = [
  { id: "library", label: "Bibliothèque", icon: Library },
  { id: "robot", label: "Robot", icon: Bot },
  { id: "analysis", label: "Analyse", icon: Waves },
  { id: "duplicates", label: "Doublons", icon: Copy },
  { id: "setbuilder", label: "Set Builder", icon: ListMusic },
  { id: "rename", label: "Renommage", icon: Pencil },
];

export function Workspace() {
  const { project, closeProject, isIndexing, lastImportDiff } = useWorkspace();
  const [tab, setTab] = useState<TabId>("library");
  const { trackId: playingId } = usePlayer();


  if (!project) return null;

  const totalDuration = project.tracks.reduce((acc, t) => acc + (t.durationSec ?? 0), 0);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="glass sticky top-0 z-30 border-b border-border/60">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <button
            onClick={closeProject}
            aria-label="Fermer la bibliothèque"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2.5">
            <Logo size={28} />
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold leading-tight">{project.name}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <FolderOpen className="h-3 w-3 shrink-0" />
                <span>{project.tracks.length} pistes</span>
                {totalDuration > 0 && (<><span aria-hidden>·</span><span className="tabular-nums">{formatDuration(totalDuration)}</span></>)}
                {isIndexing && (<><span aria-hidden>·</span><Loader2 className="h-3 w-3 animate-spin" /></>)}
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Tabs bar */}
        <nav className="scrollbar-none flex gap-1 overflow-x-auto border-t border-border/60 px-2 py-1.5">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      {lastImportDiff && (lastImportDiff.added > 0 || lastImportDiff.removed > 0) && (
        <div className="mx-4 mt-3 rounded-lg border border-primary/30 bg-accent/20 px-3 py-2 text-[11px] text-foreground">
          Synchronisé : +{lastImportDiff.added} nouveaux · {lastImportDiff.removed} retirés · {lastImportDiff.unchanged} conservés
        </div>
      )}

      <main className={`flex-1 px-4 py-5 ${playingId ? "pb-40" : "pb-24"}`}>
        <TabErrorBoundary resetKey={tab}>
          {tab === "library" && <LibraryTab />}
          {tab === "robot" && <RobotTab />}
          {tab === "analysis" && <AnalysisTab />}
          {tab === "duplicates" && <DuplicatesTab />}
          {tab === "setbuilder" && <SetBuilderTab />}
          {tab === "rename" && <RenameTab />}
        </TabErrorBoundary>
      </main>

      <MiniPlayer />

    </div>
  );
}
