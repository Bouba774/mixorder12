import { useState } from "react";
import {
  Home,
  Library,
  Bot,
  Waves,
  Copy,
  Pencil,
  ListMusic,
} from "lucide-react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { useWorkspace } from "@/lib/workspace-context";
import { HomeTab } from "./tabs/HomeTab";
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
 * Workspace shell — six-tab surface anchored by a dashboard home.
 *
 * The header is intentionally simple (logo + theme toggle) and scrolls
 * with the page: every meaningful stat about the current library now
 * lives in the Home dashboard, so there is no need for a sticky/glass
 * bar duplicating the same information.
 */

type TabId =
  | "home"
  | "library"
  | "robot"
  | "analysis"
  | "duplicates"
  | "setbuilder"
  | "rename";

const TABS: Array<{ id: TabId; label: string; icon: typeof Library }> = [
  { id: "home", label: "Accueil", icon: Home },
  { id: "library", label: "Bibliothèque", icon: Library },
  { id: "robot", label: "Robot", icon: Bot },
  { id: "analysis", label: "Analyse", icon: Waves },
  { id: "duplicates", label: "Doublons", icon: Copy },
  { id: "setbuilder", label: "Set Builder", icon: ListMusic },
  { id: "rename", label: "Renommage", icon: Pencil },
];

export function Workspace() {
  const { project, closeProject } = useWorkspace();
  const [tab, setTab] = useState<TabId>("home");
  const { trackId: playingId } = usePlayer();

  if (!project) return null;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="border-b border-border/60 bg-background">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="font-display text-sm font-semibold tracking-wide">
              MixOrder
            </span>
          </div>
          <ThemeToggle />
        </div>

        <nav className="scrollbar-none flex gap-1 overflow-x-auto px-2 pb-2">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
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

      <main className={`flex-1 px-4 py-5 ${playingId ? "pb-40" : "pb-24"}`}>
        <TabErrorBoundary resetKey={tab}>
          {tab === "home" && (
            <HomeTab onNavigate={setTab} onChangeLibrary={closeProject} />
          )}
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
