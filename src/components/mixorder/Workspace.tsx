import { useEffect, useState } from "react";
import {
  Home,
  Library,
  Bot,
  Waves,
  Copy,
  Pencil,
  ListMusic,
} from "lucide-react";
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
import { BottomNav } from "./BottomNav";

/**
 * Workspace shell — dashboard-driven surface with a fixed bottom navigation.
 *
 * The former sticky top app-bar is gone: no glass, no transparency, no
 * elements floating over scrollable content. Every screen embeds its own
 * PageHeader card with just the info and actions relevant to that page,
 * and the bottom nav owns cross-page navigation the Android-native way.
 */

type TabId =
  | "home"
  | "library"
  | "robot"
  | "analysis"
  | "duplicates"
  | "setbuilder"
  | "rename";

const TABS = [
  { id: "home", label: "Accueil", icon: Home },
  { id: "library", label: "Bibli.", icon: Library },
  { id: "robot", label: "Robot", icon: Bot },
  { id: "setbuilder", label: "Sets", icon: ListMusic },
  { id: "analysis", label: "Analyse", icon: Waves },
  { id: "duplicates", label: "Doublons", icon: Copy },
  { id: "rename", label: "Renom.", icon: Pencil },
] as const satisfies ReadonlyArray<{ id: TabId; label: string; icon: typeof Library }>;

export function Workspace() {
  const { project, closeProject } = useWorkspace();
  const [tab, setTab] = useState<TabId>("home");
  const [transitionKey, setTransitionKey] = useState(0);
  const { trackId: playingId } = usePlayer();

  // Bump animation key on tab change so the entering page fades in.
  useEffect(() => {
    setTransitionKey((k) => k + 1);
    // Reset scroll when jumping between top-level pages.
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [tab]);

  if (!project) return null;

  const navHeight = 68; // must match BottomNav visual height (+ safe-area)
  const miniPlayerHeight = 72;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <main
        className="flex-1 px-4 pt-4"
        style={{
          paddingBottom: `calc(${navHeight}px + ${playingId ? miniPlayerHeight : 0}px + env(safe-area-inset-bottom))`,
        }}
      >
        <TabErrorBoundary resetKey={tab}>
          <div key={transitionKey} className="animate-fade-in">
            {tab === "home" && (
              <HomeTab onNavigate={setTab} onChangeLibrary={closeProject} />
            )}
            {tab === "library" && <LibraryTab />}
            {tab === "robot" && <RobotTab />}
            {tab === "analysis" && <AnalysisTab />}
            {tab === "duplicates" && <DuplicatesTab />}
            {tab === "setbuilder" && <SetBuilderTab />}
            {tab === "rename" && <RenameTab />}
          </div>
        </TabErrorBoundary>
      </main>

      <MiniPlayer bottomOffset={navHeight} />

      <BottomNav<TabId>
        items={TABS}
        active={tab}
        onSelect={setTab}
      />
    </div>
  );
}
