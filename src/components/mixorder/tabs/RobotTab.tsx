import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bot,
  Check,
  AlertTriangle,
  CircleCheck,
  CircleX,
  Crosshair,
  Loader2,
  Play,
  Pause,
  Square,
  RefreshCw,
  ChevronDown,
  Sparkles,
  Music2,
  Library,
  ShieldCheck,
  BellRing,
  MousePointer2,
  ScanLine,
  ListChecks,
  ArrowLeft,
  Wand2,
  Zap,
  ClipboardList,
  Eye,
} from "lucide-react";
import { PageHeader } from "../PageHeader";
import { useWorkspace } from "@/lib/workspace-context";
import { useRobotJournal } from "@/hooks/useRobotJournal";
import { useDiscDJRobot, type RobotPhase } from "@/lib/analysis/discdj-robot";
import type { DeckId } from "@/lib/analysis/discdj-bridge";
import {
  DEFAULT_DISCDJ_SETTINGS,
  isDiscDJCalibrationComplete,
  isElementCalibrated,
  getElementTimestamp,
  type CalibrationTarget,
  type DiscDJRobotSettings,
} from "@/lib/analysis/discdj-settings";

/**
 * Robot DiscDJ — guided assistant.
 *
 * The whole flow is presented as sequential steps so a beginner cannot
 * forget a prerequisite. The underlying robot logic (in `useDiscDJRobot`
 * and `DiscDJRobotPanel`) is unchanged; only the presentation is new.
 */
export function RobotTab() {
  const robot = useDiscDJRobot();
  const { project } = useWorkspace();
  const { state } = robot;
  const phase = state.phase;
  const running = !["idle", "paused", "done", "error"].includes(phase);
  const inProgressUi = running || phase === "paused" || phase === "awaiting-user";
  const [deck, setDeck] = useState<DeckId>(1);

  if (phase === "done" && state.recap) {
    return <ResultsView robot={robot} deck={deck} />;
  }
  if (inProgressUi) {
    return <ProgressView robot={robot} deck={deck} />;
  }

  const hasLibrary = (project?.tracks?.length ?? 0) > 0;
  const calibrationDone = isDiscDJCalibrationComplete(state.settings);

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        icon={Bot}
        eyebrow="Robot DiscDJ"
        title="Assistant guidé"
        subtitle="Suis les 4 étapes pour lancer l'analyse BPM sans risque d'oubli."
      />

      <StepVerification robot={robot} hasLibrary={hasLibrary} calibrationDone={calibrationDone} />
      <StepCalibration robot={robot} />
      <StepSettings robot={robot} deck={deck} onDeckChange={setDeck} />
      <StepLaunch robot={robot} deck={deck} disabled={!hasLibrary || !calibrationDone} />

      <JournalSection />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Shared UI                                                              */
/* ────────────────────────────────────────────────────────────────────── */

function StepCard({
  step, title, subtitle, children, delay = 0,
}: {
  step: number; title: string; subtitle?: string; children: ReactNode; delay?: number;
}) {
  return (
    <section
      className="animate-fade-up rounded-2xl border border-border/70 bg-surface p-4 shadow-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      <header className="mb-3 flex items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-base font-semibold leading-tight">{title}</h2>
          {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

type RowState = "ok" | "todo" | "error";

function StatusPill({ state }: { state: RowState }) {
  const cls =
    state === "ok" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : state === "error" ? "bg-destructive/15 text-destructive"
    : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  const label = state === "ok" ? "Prêt" : state === "error" ? "Erreur" : "À configurer";
  const Icon = state === "ok" ? CircleCheck : state === "error" ? AlertTriangle : Crosshair;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function CheckRow({
  icon, label, sublabel, state, action,
}: {
  icon: ReactNode; label: string; sublabel?: string;
  state: RowState; action?: { label: string; onClick: () => void; busy?: boolean } | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2.5 transition-colors">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-elevated text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{label}</p>
        {sublabel && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sublabel}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusPill state={state} />
        {action && state !== "ok" && (
          <button
            onClick={action.onClick}
            disabled={action.busy}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[10px] font-semibold text-primary-foreground shadow-sm transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            {action.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Step 1 — Verification                                                  */
/* ────────────────────────────────────────────────────────────────────── */

function StepVerification({
  robot, hasLibrary, calibrationDone,
}: {
  robot: ReturnType<typeof useDiscDJRobot>;
  hasLibrary: boolean;
  calibrationDone: boolean;
}) {
  const [accessibility, setAccessibility] = useState<{ enabled: boolean; native: boolean } | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = async () => {
    setChecking(true);
    try {
      const r = await robot.checkAccessibility();
      setAccessibility({ enabled: !!r.enabled, native: !!r.native });
    } finally {
      setChecking(false);
    }
  };
  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, 2500);
    return () => window.clearInterval(id);
     
  }, []);

  const isNative = accessibility?.native ?? false;
  const accessibilityState: RowState =
    !isNative ? "todo" : accessibility?.enabled ? "ok" : "error";

  const libraryState: RowState = hasLibrary ? "ok" : "todo";
  const calibrationState: RowState = calibrationDone ? "ok" : "todo";

  return (
    <StepCard step={1} title="Vérification" subtitle="Prérequis avant de lancer le robot" delay={0}>
      <div className="space-y-2">
        <CheckRow
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Service d'accessibilité"
          sublabel={
            !isNative
              ? "Disponible uniquement sur l'app Android"
              : accessibility?.enabled
                ? "Actif — le robot peut piloter DiscDJ"
                : "Requis pour piloter DiscDJ"
          }
          state={accessibilityState}
          action={isNative && !accessibility?.enabled
            ? { label: "Activer", onClick: () => { void robot.openAccessibilitySettings(); }, busy: checking }
            : null}
        />
        <CheckRow
          icon={<BellRing className="h-4 w-4" />}
          label="Autorisation des notifications"
          sublabel={isNative ? "Nécessaire pour le mode arrière-plan" : "Non requis sur le web"}
          state={isNative ? "ok" : "todo"}
          action={null}
        />
        <CheckRow
          icon={<Library className="h-4 w-4" />}
          label="Bibliothèque importée"
          sublabel={hasLibrary ? "Prête à être analysée" : "Importe des morceaux depuis la Bibliothèque"}
          state={libraryState}
          action={null}
        />
        <CheckRow
          icon={<Crosshair className="h-4 w-4" />}
          label="Calibration effectuée"
          sublabel={calibrationDone ? "Tous les éléments requis sont calibrés" : "Étape 2 ci-dessous"}
          state={calibrationState}
          action={null}
        />
      </div>
    </StepCard>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Step 2 — Calibration                                                   */
/* ────────────────────────────────────────────────────────────────────── */

interface CalibElement {
  id: CalibrationTarget;
  label: string;
  icon: "point" | "zone";
  autosyncOnly?: boolean;
}

const CALIB_ELEMENTS: CalibElement[] = [
  { id: "nextDeck1", label: "Bouton Next · platine 1", icon: "point" },
  { id: "nextDeck2", label: "Bouton Next · platine 2", icon: "point" },
  { id: "bpmDeck1", label: "Zone BPM · platine 1", icon: "zone" },
  { id: "bpmDeck2", label: "Zone BPM · platine 2", icon: "zone" },
  { id: "playlistButton", label: "Bouton Playlist", icon: "point", autosyncOnly: true },
  { id: "backButton", label: "Bouton Retour", icon: "point", autosyncOnly: true },
  { id: "nameZoneDeck1", label: "Zone Nom du morceau · platine 1", icon: "zone", autosyncOnly: true },
  { id: "nameZoneDeck2", label: "Zone Nom du morceau · platine 2", icon: "zone", autosyncOnly: true },
];

function StepCalibration({ robot }: { robot: ReturnType<typeof useDiscDJRobot> }) {
  const { state, captureCalibration, testRead, testClick, testPlaylistButton, testBackButton, testNameZone, updateSettings, supportsDirectCapture } = robot;
  const settings = state.settings;
  const autoSync = settings.analysisMode === "autosync-name" || settings.analysisMode === "auto-sync";
  const showAutoSyncItems = settings.analysisMode === "autosync-name";
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const elements = CALIB_ELEMENTS.filter((el) => !el.autosyncOnly || showAutoSyncItems);

  const handleRecalibrate = async (id: CalibrationTarget) => {
    if (!supportsDirectCapture) {
      setFeedback({ id, ok: false, text: "Calibration directe indisponible — utilise le panneau technique (Options avancées)." });
      return;
    }
    setBusyId(`recal:${id}`);
    const ok = await captureCalibration(id);
    setBusyId(null);
    setFeedback({ id, ok, text: ok ? "Calibration enregistrée." : "Capture annulée." });
  };

  const handleTest = async (id: CalibrationTarget) => {
    setBusyId(`test:${id}`);
    try {
      if (id === "nextDeck1" || id === "nextDeck2") {
        const deck: DeckId = id === "nextDeck1" ? 1 : 2;
        const r = await testClick(deck);
        setFeedback({ id, ok: r.changed, text: r.message });
      } else if (id === "bpmDeck1" || id === "bpmDeck2") {
        const deck: DeckId = id === "bpmDeck1" ? 1 : 2;
        const r = await testRead(deck);
        if (r && r.bpm != null) setFeedback({ id, ok: true, text: `BPM lu : ${r.bpm}` });
        else setFeedback({ id, ok: false, text: r?.parseReason ?? "Lecture impossible." });
      } else if (id === "playlistButton") {
        const r = await testPlaylistButton();
        setFeedback({ id, ok: r.ok, text: r.message });
      } else if (id === "backButton") {
        const r = await testBackButton();
        setFeedback({ id, ok: r.ok, text: r.message });
      } else if (id === "nameZoneDeck1" || id === "nameZoneDeck2") {
        const deck: DeckId = id === "nameZoneDeck1" ? 1 : 2;
        const r = await testNameZone(deck);
        setFeedback({ id, ok: r.ok, text: `${r.message}${r.cleaned ? ` · « ${r.cleaned} »` : ""}` });
      }
    } finally {
      setBusyId(null);
    }
  };

  const resetAll = () => {
    if (!confirm("Réinitialiser toute la calibration ?")) return;
    updateSettings({ calibration: DEFAULT_DISCDJ_SETTINGS.calibration });
  };

  const complete = isDiscDJCalibrationComplete(settings);

  return (
    <StepCard step={2} title="Calibration" subtitle="Indique au robot où toucher et où lire" delay={60}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {complete ? "Calibration complète ✓" : "Éléments à calibrer avant démarrage"}
        </p>
        <button
          onClick={resetAll}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Recalibrer tout
        </button>
      </div>

      <div className="space-y-2">
        {elements.map((el) => {
          const valid = isElementCalibrated(settings, el.id);
          const ts = getElementTimestamp(settings, el.id);
          const testBusy = busyId === `test:${el.id}`;
          const recalBusy = busyId === `recal:${el.id}`;
          const rowFeedback = feedback?.id === el.id ? feedback : null;
          return (
            <div key={el.id} className="animate-fade-in rounded-xl border border-border/60 bg-background/60 p-2.5">
              <div className="flex items-center gap-2.5">
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${valid ? "bg-primary/15 text-primary" : "bg-surface-elevated text-muted-foreground"}`}>
                  {el.icon === "point" ? <MousePointer2 className="h-4 w-4" /> : <ScanLine className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold leading-tight">{el.label}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {valid ? (ts ? `Calibré · ${formatRelative(ts)}` : "Calibré") : "Non calibré"}
                  </p>
                </div>
                <StatusPill state={valid ? "ok" : "todo"} />
              </div>
              <div className="mt-2 flex gap-1.5">
                <button
                  onClick={() => handleTest(el.id)}
                  disabled={!valid || busyId !== null}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-background text-[11px] font-semibold text-foreground transition-transform active:scale-[0.98] disabled:opacity-40"
                >
                  {testBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                  Tester
                </button>
                <button
                  onClick={() => handleRecalibrate(el.id)}
                  disabled={busyId !== null}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-primary text-[11px] font-semibold text-primary-foreground shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  {recalBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
                  {valid ? "Recalibrer" : "Calibrer"}
                </button>
              </div>
              {rowFeedback && (
                <p className={`mt-2 rounded-md px-2 py-1 text-[10px] ${rowFeedback.ok ? "bg-primary/10 text-foreground" : "bg-destructive/10 text-destructive"}`}>
                  {rowFeedback.ok ? "✓ " : "✗ "}{rowFeedback.text}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {!autoSync && (
        <p className="mt-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-[10px] text-muted-foreground">
          Astuce : passe en mode AutoSync (Étape 3) pour associer automatiquement chaque BPM au bon morceau.
        </p>
      )}
    </StepCard>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Step 3 — Settings                                                      */
/* ────────────────────────────────────────────────────────────────────── */

function StepSettings({ robot, deck, onDeckChange }: { robot: ReturnType<typeof useDiscDJRobot>; deck: DeckId; onDeckChange: (d: DeckId) => void }) {
  const { state, updateSettings } = robot;
  const s = state.settings;

  return (
    <StepCard step={3} title="Paramètres du Robot" subtitle="Simple par défaut. Options avancées repliées." delay={120}>
      {/* Deck selector */}
      <div className="mb-3">
        <p className="mb-1.5 text-[11px] font-semibold text-foreground">Platine utilisée</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[1, 2].map((d) => {
            const id = d as DeckId;
            const active = deck === id;
            return (
              <button
                key={id}
                onClick={() => onDeckChange(id)}
                className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border font-semibold text-[13px] transition-colors ${active ? "border-primary/50 bg-accent/40 text-foreground" : "border-border bg-background text-muted-foreground"}`}
              >
                Platine {id}
              </button>
            );
          })}
        </div>
      </div>


      {/* Mode selector */}
      <div className="mb-3">
        <p className="mb-1.5 text-[11px] font-semibold text-foreground">Mode d'analyse</p>
        <div className="grid grid-cols-3 gap-1.5">
          <ModeCard active={s.analysisMode === "auto-sync"} onClick={() => updateSettings({ analysisMode: "auto-sync" })} title="Auto" subtitle="Ordre aligné" />
          <ModeCard active={s.analysisMode === "autosync-name"} onClick={() => updateSettings({ analysisMode: "autosync-name" })} title="AutoSync" subtitle="Nom vérifié" />
          <ModeCard active={s.analysisMode === "verification"} onClick={() => updateSettings({ analysisMode: "verification" })} title="Vérif." subtitle="Manuel" />
        </div>
      </div>

      {/* Start index */}
      <div className="mb-3">
        <StartIndexField value={s.startAtIndex} onCommit={(v) => updateSettings({ startAtIndex: v })} />
      </div>

      {/* Simple toggles */}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <Toggle label="Remplacer les BPM existants" checked={s.replaceExisting} onChange={(v) => updateSettings({ replaceExisting: v })} />
        <Toggle label="Ignorer les BPM déjà présents" checked={s.skipAlreadyBpm} onChange={(v) => updateSettings({ skipAlreadyBpm: v })} />
        <Toggle label="Sauvegarde automatique" checked={s.autosaveEachStep} onChange={(v) => updateSettings({ autosaveEachStep: v })} />
        <Toggle label="Reprise automatique" checked={s.autoResume} onChange={(v) => updateSettings({ autoResume: v })} />
      </div>

      {/* Advanced options */}
      <details className="group mt-3 rounded-xl border border-border/60 bg-background/60">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[11px] font-semibold text-foreground">
          <span className="flex items-center gap-1.5">
            <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
            Options avancées
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-border/60 p-3">
          <Toggle label="Continuer en arrière-plan (mode Auto)" checked={s.runInBackground} onChange={(v) => updateSettings({ runInBackground: v })} />
          <AdvancedSlider label="Attente à l'ouverture" unit="ms" min={0} max={10000} step={100} value={s.waitOnOpenMs} onChange={(v) => updateSettings({ waitOnOpenMs: v })} />
          <AdvancedSlider label="Attente avant lecture BPM" unit="ms" min={150} max={5000} step={50} value={s.waitBeforeReadMs} onChange={(v) => updateSettings({ waitBeforeReadMs: v })} />
          <AdvancedSlider label="Attente après clic Next" unit="ms" min={250} max={7000} step={50} value={s.waitAfterClickMs} onChange={(v) => updateSettings({ waitAfterClickMs: v })} />
          <AdvancedSlider label="Tentatives max" unit="" min={1} max={8} step={1} value={s.maxAttempts} onChange={(v) => updateSettings({ maxAttempts: v })} />
          <AdvancedSlider label="Durée de pression" unit="ms" min={45} max={900} step={5} value={s.pressDurationMs} onChange={(v) => updateSettings({ pressDurationMs: v })} />
        </div>
      </details>
    </StepCard>
  );
}

function ModeCard({ active, onClick, title, subtitle }: { active: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-colors ${active ? "border-primary/60 bg-accent/40" : "border-border bg-background/70"}`}
    >
      <span className="text-[12px] font-semibold text-foreground">{title}</span>
      <span className="text-[10px] text-muted-foreground">{subtitle}</span>
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-[11px] text-foreground transition-colors hover:border-border-strong">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
      <span className="min-w-0 flex-1 leading-tight">{label}</span>
    </label>
  );
}

function AdvancedSlider({ label, unit, min, max, step, value, onChange }: { label: string; unit: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block rounded-lg bg-background/60 p-2">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-primary">{value}{unit}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </label>
  );
}

function StartIndexField({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n) && n >= 1) { if (n !== value) onCommit(n); setDraft(String(n)); }
    else setDraft(String(value));
  };
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-[11px]">
      <span className="font-semibold text-foreground">Commencer au morceau n°</span>
      <input
        type="number" inputMode="numeric" min={1} value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); } }}
        className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right text-[12px] font-semibold tabular-nums text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Step 4 — Launch                                                        */
/* ────────────────────────────────────────────────────────────────────── */

function StepLaunch({ robot, deck, disabled }: { robot: ReturnType<typeof useDiscDJRobot>; deck: DeckId; disabled: boolean }) {
  const { state, start, openAccessibilitySettings, checkAccessibility } = robot;
  
  const [busy, setBusy] = useState(false);

  const handleStart = async () => {
    setBusy(true);
    try {
      const acc = await checkAccessibility();
      if (acc.native && !acc.enabled) {
        try { await openAccessibilitySettings(); } catch { /* ignore */ }
        alert("Active le service d'accessibilité MixOrder puis reviens pour démarrer le robot.");
        return;
      }
      await start(deck as DeckId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepCard step={4} title="Lancer l'analyse" subtitle="Tout est prêt, il ne reste qu'à démarrer." delay={180}>
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-[11px] leading-snug text-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <p>
          Le robot va ouvrir DiscDJ sur la <strong>platine {deck}</strong>, lire le BPM de chaque
          morceau et remplir automatiquement ta bibliothèque. Tu pourras mettre en pause ou arrêter
          à tout moment.
        </p>
      </div>
      <button
        onClick={handleStart}
        disabled={disabled || busy}
        className="inline-flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Play className="h-6 w-6" />}
        Lancer AutoSync
      </button>
      {disabled && (
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Complète les étapes précédentes pour activer le bouton.
        </p>
      )}
    </StepCard>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Progress view                                                          */
/* ────────────────────────────────────────────────────────────────────── */

function ProgressView({ robot, deck }: { robot: ReturnType<typeof useDiscDJRobot>; deck: DeckId }) {
  const { state, pause, resume, stop, resolvePending, skipPending } = robot;
  const phase = state.phase;
  const running = !["idle", "paused", "done", "error"].includes(phase);
  const paused = phase === "paused";
  const progressPct = state.totalRun > 0 ? Math.min(100, Math.round((state.doneInRun / state.totalRun) * 100)) : 0;
  const remaining = Math.max(0, state.totalRun - state.doneInRun);

  return (
    <div className="animate-fade-in space-y-4 pb-8">
      <PageHeader
        icon={Bot}
        eyebrow="Robot DiscDJ"
        title={paused ? "En pause" : "Analyse en cours"}
        subtitle={phaseLabel(phase)}
      />

      {/* Main progress card */}
      <section className="animate-fade-up rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 via-surface to-surface p-5 shadow-lg">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
            {running ? <Loader2 className="h-6 w-6 animate-spin" /> : paused ? <Pause className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
            {running && <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/20" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-bold leading-tight">
              {state.currentTrack?.name ?? state.currentReading?.title ?? "En attente…"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              Morceau {state.currentIndex}/{state.totalIndex || state.totalRun} · Platine {state.deck ?? deck}
            </p>
          </div>
        </div>

        <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-surface-elevated">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="mb-4 flex justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>{state.doneInRun} / {state.totalRun}</span>
          <span>{progressPct}%</span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="BPM détecté" value={state.currentReading?.bpm != null ? state.currentReading.bpm.toFixed(1) : "—"} />
          <Metric label="Nom reconnu" value={state.currentReading?.title ?? "—"} truncate />
          <Metric label="Restants" value={String(remaining)} />
          <Metric label="Temps estimé" value={state.etaMsRemaining != null ? formatEta(state.etaMsRemaining) : "—"} />
        </div>
      </section>

      {/* Pending choice (verification mode) */}
      {state.pending && phase === "awaiting-user" && (
        <section className="animate-fade-up rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="mb-2 text-[12px] font-semibold text-foreground">
            Plusieurs correspondances pour « {state.pending.reading.title ?? "?"} »
          </p>
          <div className="space-y-1.5">
            {state.pending.candidates.map((c) => (
              <button
                key={c.track.id}
                onClick={() => resolvePending(c.track.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-accent/30"
              >
                <Music2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{c.track.name}</p>
                  <p className="text-[10px] text-muted-foreground">Similarité {Math.round(c.combined * 100)}%</p>
                </div>
              </button>
            ))}
            <button
              onClick={skipPending}
              className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 py-2 text-[11px] font-semibold text-muted-foreground"
            >
              Aucun ne correspond — ignorer
            </button>
          </div>
        </section>
      )}

      {/* Controls */}
      <section className="sticky bottom-24 z-10 grid grid-cols-3 gap-2 rounded-2xl border border-border/70 bg-surface/95 p-3 shadow-lg backdrop-blur">
        {paused ? (
          <button
            onClick={resume}
            className="col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-[0.98]"
          >
            <Play className="h-4 w-4" />
            Reprendre
          </button>
        ) : (
          <button
            onClick={pause}
            className="col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-semibold text-foreground transition-transform active:scale-[0.98]"
          >
            <Pause className="h-4 w-4" />
            Pause
          </button>
        )}
        <button
          onClick={stop}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-destructive text-sm font-bold text-destructive-foreground shadow-sm transition-transform active:scale-[0.98]"
        >
          <Square className="h-4 w-4" />
          Arrêter
        </button>
      </section>

      {state.errorMessage && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-[12px] text-destructive">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{state.errorMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-display text-sm font-bold tabular-nums text-foreground ${truncate ? "truncate" : ""}`}>{value}</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Results view                                                           */
/* ────────────────────────────────────────────────────────────────────── */

function ResultsView({ robot, deck }: { robot: ReturnType<typeof useDiscDJRobot>; deck: DeckId }) {
  const { state, start } = robot;
  const recap = state.recap!;
  const total = recap.analyzedCount + recap.needsRetryCount;
  const elapsedMs: number | null = null;

  const rerunErrors = async () => {
    // Restart, keeping "skip already BPM" so only unanalyzed/errored tracks are re-processed.
    await start(deck);
  };

  return (
    <div className="animate-fade-in space-y-4 pb-8">
      <PageHeader
        icon={CircleCheck}
        eyebrow="Robot DiscDJ"
        title="Analyse terminée"
        subtitle="Récapitulatif de la session"
      />

      <section className="animate-fade-up rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 via-surface to-surface p-5 text-center shadow-lg">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Check className="h-7 w-7" />
        </div>
        <p className="mt-3 font-display text-2xl font-bold">{total} morceau{total > 1 ? "x" : ""} analysé{total > 1 ? "s" : ""}</p>
        <p className="text-[12px] text-muted-foreground">
          {elapsedMs != null ? `en ${formatEta(elapsedMs)}` : ""}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <BigMetric tone="success" label="BPM trouvés" value={recap.analyzedCount} />
        <BigMetric tone={recap.needsRetryCount > 0 ? "warn" : "neutral"} label="À réanalyser" value={recap.needsRetryCount} />
        <BigMetric tone="neutral" label="Total" value={total} />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {recap.needsRetryCount > 0 && (
          <ActionCard
            icon={<RefreshCw className="h-4 w-4" />}
            title="Réanalyser les erreurs"
            subtitle={`${recap.needsRetryCount} morceau${recap.needsRetryCount > 1 ? "x" : ""}`}
            onClick={rerunErrors}
            primary
          />
        )}
        <ActionCard
          icon={<Library className="h-4 w-4" />}
          title="Retour à la bibliothèque"
          subtitle="Consulter les résultats"
          onClick={() => { window.dispatchEvent(new CustomEvent("mixorder:navigate", { detail: "library" })); }}
        />
        <ActionCard
          icon={<ClipboardList className="h-4 w-4" />}
          title="Voir le journal"
          subtitle="Historique détaillé"
          onClick={() => { document.getElementById("robot-journal")?.scrollIntoView({ behavior: "smooth" }); }}
        />
      </div>

      {recap.needsRetryCount > 0 && recap.missing.length > 0 && (
        <details className="rounded-xl border border-border/60 bg-surface p-3 text-[11px]">
          <summary className="cursor-pointer font-semibold">Morceaux à réanalyser ({recap.missing.length})</summary>
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto pl-3 text-[10px] text-muted-foreground">
            {recap.missing.map((m) => (
              <li key={m.index} className="truncate">#{m.index} — {m.name}</li>
            ))}
          </ul>
        </details>
      )}

      <JournalSection />
    </div>
  );
}

function BigMetric({ label, value, tone }: { label: string; value: number; tone: "success" | "warn" | "neutral" }) {
  const cls =
    tone === "success" ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
    : tone === "warn" ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
    : "border-border text-foreground";
  return (
    <div className={`rounded-2xl border bg-surface px-4 py-3 ${cls}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function ActionCard({ icon, title, subtitle, onClick, primary }: { icon: ReactNode; title: string; subtitle: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.98] ${primary ? "border-primary/50 bg-primary/10 hover:bg-primary/15" : "border-border bg-surface hover:border-border-strong"}`}
    >
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${primary ? "bg-primary/15 text-primary" : "bg-surface-elevated text-muted-foreground"}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold">{title}</p>
        <p className="truncate text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Journal                                                                */
/* ────────────────────────────────────────────────────────────────────── */

function JournalSection() {
  const { entries, clear } = useRobotJournal();
  const [showDetails, setShowDetails] = useState(false);
  if (entries.length === 0) return null;

  return (
    <section id="robot-journal" className="animate-fade-up rounded-2xl border border-border/70 bg-surface p-4" style={{ animationDelay: "240ms" }}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold">Journal</h3>
          <p className="text-[10px] text-muted-foreground">Historique des analyses récentes</p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-[10px] font-semibold text-muted-foreground hover:border-border-strong hover:text-foreground"
          >
            {showDetails ? "Masquer" : "Afficher"} les détails techniques
          </button>
          <button
            onClick={clear}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-[10px] font-semibold text-muted-foreground hover:border-destructive/60 hover:text-destructive"
          >
            Vider
          </button>
        </div>
      </header>
      <ul className="max-h-72 space-y-1 overflow-auto pr-1">
        {entries.map((e) => (
          <li
            key={`${e.ts}-${e.trackId}`}
            className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1.5 text-[11px]"
          >
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
              e.outcome === "success" ? "bg-emerald-500"
              : e.outcome === "retry" ? "bg-amber-400"
              : e.outcome === "error" ? "bg-destructive"
              : "bg-muted-foreground/40"
            }`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-foreground">{e.name}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {friendlyMessage(e.outcome, e.bpm, e.message)}
              </p>
              {showDetails && e.message && (
                <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground/80">{e.message}</p>
              )}
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <p className="font-display text-xs font-semibold text-foreground">
                {e.bpm != null ? `${e.bpm}` : "—"}
              </p>
              <p className="text-[9px] text-muted-foreground">
                {new Date(e.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                {showDetails && e.attempts > 1 ? ` · ${e.attempts} essais` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function friendlyMessage(outcome: string, bpm: number | null, _message?: string): string {
  if (outcome === "success") return bpm != null ? `BPM ${bpm} associé avec succès` : "Analysé";
  if (outcome === "retry") return "À réanalyser";
  if (outcome === "error") return "Analyse impossible";
  return "Ignoré";
}

/* ────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                */
/* ────────────────────────────────────────────────────────────────────── */

function formatEta(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}m ${r.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `il y a ${Math.round(diff / 60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.round(diff / 3_600_000)} h`;
  return new Date(ts).toLocaleDateString();
}

function phaseLabel(phase: RobotPhase): string {
  switch (phase) {
    case "opening": return "Ouverture de DiscDJ…";
    case "reading": return "Lecture du BPM…";
    case "advancing": return "Passage au morceau suivant…";
    case "testing": return "Test de calibration en cours…";
    case "awaiting-user": return "Choix manuel requis";
    case "paused": return "En pause — tu peux reprendre à tout moment";
    case "done": return "Toutes les pistes ont été traitées";
    case "error": return "Blocage détecté";
    default: return "Prêt à démarrer";
  }
}

// Suppress unused-import lint warnings for icons kept for future use.
void ArrowLeft; void Zap; void ListChecks;
