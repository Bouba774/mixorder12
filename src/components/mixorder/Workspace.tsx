import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Library as LibraryIcon,
  Settings as SettingsIcon,
  FolderInput,
  CheckCircle2,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";
import { LibraryTab } from "./tabs/LibraryTab";
import { RobotTab } from "./tabs/RobotTab";
import { AnalysisTab } from "./tabs/AnalysisTab";
import { DuplicatesTab } from "./tabs/DuplicatesTab";
import { RenameTab } from "./tabs/RenameTab";
import { SetBuilderTab } from "./tabs/SetBuilderTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { MiniPlayer } from "./player/MiniPlayer";
import { usePlayer } from "@/lib/player/player-context";
import { TabErrorBoundary } from "./TabErrorBoundary";
import { Logo } from "./Logo";

/**
 * Workspace shell — TempoKey-inspired architecture:
 *   1. Fixed top header (logo + settings)
 *   2. Active library card (below header)
 *   3. Horizontal scrollable tab bar with animated underline
 *   4. Tab content
 *
 * The former bottom navigation is gone. Cross-page navigation now lives in
 * the horizontal tab strip directly under the active library card.
 */

type MainTabId = "library" | "robot" | "analysis" | "duplicates" | "rename" | "setbuilder";
type TabId = MainTabId | "settings";

const TABS: ReadonlyArray<{ id: MainTabId; label: string }> = [
  { id: "library", label: "Bibliothèque" },
  { id: "robot", label: "Robot" },
  { id: "analysis", label: "Analyse" },
  { id: "duplicates", label: "Doublons" },
  { id: "rename", label: "Renommage" },
  { id: "setbuilder", label: "AutoMix" },
];

function formatImportedRelative(ts: number): string {
  const now = Date.now();
  const days = Math.floor((now - ts) / 86_400_000);
  if (days < 1) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  return new Date(ts).toLocaleDateString("fr-FR");
}

export function Workspace() {
  const { project, closeProject } = useWorkspace();
  const [tab, setTab] = useState<TabId>("library");
  const [transitionKey, setTransitionKey] = useState(0);
  const { trackId: playingId } = usePlayer();
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(0);

  useEffect(() => {
    setTransitionKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [tab]);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  if (!project) return null;

  const miniPlayerHeight = 72;
  const isSettings = tab === "settings";

  // Analysis progress derived from live track state.
  const total = project.tracks.length;
  const done = project.tracks.filter((t) => t.analysisStatus === "done").length;
  const analysisLabel =
    total === 0
      ? "Bibliothèque vide"
      : done === total
      ? "Analyse terminée"
      : done === 0
      ? "En attente d'analyse"
      : `Analyse ${done}/${total}`;
  const analysisDone = total > 0 && done === total;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* ─── Sticky header (always visible) ─── */}
      <header
        ref={headerRef}
        className="sticky top-0 z-50 flex items-center justify-between bg-background/95 px-4 pb-2.5 pt-2.5 backdrop-blur"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.625rem)" }}
      >
        <button
          type="button"
          onClick={() => setTab("library")}
          className="flex items-center gap-2.5 rounded-xl px-1 py-1 transition-opacity hover:opacity-85"
          aria-label="Retour à la bibliothèque"
        >
          <Logo size={30} />
          <span className="font-display text-[17px] font-bold tracking-tight text-foreground">
            MixOrder
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab(isSettings ? "library" : "settings")}
          aria-label={isSettings ? "Fermer les paramètres" : "Ouvrir les paramètres"}
          className={`grid h-10 w-10 place-items-center rounded-lg transition-colors ${
            isSettings ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {isSettings ? <ArrowLeft className="h-5 w-5" /> : <SettingsIcon className="h-5 w-5" strokeWidth={1.75} />}
        </button>
      </header>

      {!isSettings && (
        <>
          {/* ─── Active library card — scrolls away with page ─── */}
          <section
            aria-label="Bibliothèque active"
            className="mx-4 mb-4 mt-1 rounded-2xl border border-border bg-surface p-4 shadow-card"
          >
            <div className="flex items-center gap-3.5">
              <div
                className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-primary-foreground shadow-gold"
                style={{ background: "var(--gradient-primary)" }}
              >
                <LibraryIcon className="h-6 w-6" strokeWidth={2.25} />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h1 className="truncate font-display text-[17px] font-bold leading-tight text-foreground">
                  {project.name || "Sans nom"}
                </h1>
                <div className="text-[12.5px] tabular-nums text-muted-foreground">
                  {total} morceau{total > 1 ? "x" : ""}
                </div>
                <div
                  className={`inline-flex items-center gap-1 text-[12.5px] ${
                    analysisDone ? "text-success" : "text-primary"
                  }`}
                >
                  {analysisDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Loader2 className={total === 0 ? "h-3.5 w-3.5" : "h-3.5 w-3.5 animate-spin"} />
                  )}
                  {analysisLabel}
                </div>
                <div className="text-[11.5px] text-muted-foreground/80">
                  Importée {formatImportedRelative(project.createdAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={closeProject}
                aria-label="Changer de bibliothèque"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-surface-elevated text-muted-foreground transition-colors hover:text-foreground hover:border-border-strong active:scale-95"
              >
                <FolderInput className="h-4 w-4" />
              </button>
            </div>
          </section>

          {/* ─── Sticky tab strip (pins under header when scrolling) ─── */}
          <div
            className="sticky z-40 border-b border-border bg-background/95 backdrop-blur"
            style={{ top: headerH }}
          >
            <TabStrip active={tab as MainTabId} onSelect={(id) => setTab(id)} />
          </div>
        </>
      )}

      <main
        className={isSettings ? "flex-1 px-4 pt-4" : "flex-1 px-4 pt-4"}
        style={{
          paddingBottom: `calc(${playingId ? miniPlayerHeight : 0}px + env(safe-area-inset-bottom) + 1rem)`,
        }}
      >
        <TabErrorBoundary resetKey={tab}>
          <div key={transitionKey} className="animate-fade-in">
            {tab === "library" && <LibraryTab />}
            {tab === "robot" && <RobotTab />}
            {tab === "analysis" && <AnalysisTab />}
            {tab === "duplicates" && <DuplicatesTab />}
            {tab === "rename" && <RenameTab />}
            {tab === "setbuilder" && <SetBuilderTab />}
            {tab === "settings" && <SettingsTab />}
          </div>
        </TabErrorBoundary>
      </main>

      <MiniPlayer bottomOffset={0} />
    </div>
  );
}

/**
 * TabStrip — horizontal scroll navigation with an animated underline
 * indicator that tracks the active tab and auto-scrolls it into view.
 */
function TabStrip({
  active,
  onSelect,
}: {
  active: MainTabId;
  onSelect: (id: MainTabId) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Partial<Record<MainTabId, HTMLButtonElement | null>>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const btn = btnRefs.current[active];
    const scroller = scrollerRef.current;
    if (!btn || !scroller) return;
    setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    // Auto-scroll the active pill toward the center.
    const target = btn.offsetLeft - scroller.clientWidth / 2 + btn.offsetWidth / 2;
    scroller.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [active]);

  return (
    <nav
      aria-label="Sections MixOrder"
      className=""
    >
      <div
        ref={scrollerRef}
        className="relative overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="relative flex min-w-max items-end gap-2 px-4">
          {TABS.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  btnRefs.current[t.id] = el;
                }}
                type="button"
                onClick={() => onSelect(t.id)}
                aria-current={isActive ? "page" : undefined}
                className={`relative shrink-0 whitespace-nowrap px-2 pb-2.5 pt-1 text-[15px] transition-colors ${
                  isActive
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            );
          })}
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-[3px] rounded-full bg-primary shadow-[0_0_10px_var(--primary-glow)] transition-[left,width] duration-300 ease-out"
            style={{ left: indicator.left, width: indicator.width }}
          />
        </div>
      </div>
    </nav>
  );
}
