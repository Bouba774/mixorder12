import { useEffect, useMemo, useState } from "react";
import {
  Wand2,
  Sparkles,
  Eye,
  Check,
  Undo2,
  ChevronRight,
  History,
  AlertTriangle,
  ListOrdered,
  Type,
  ArrowDownAZ,
  ArrowUpAZ,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";
import { useLibraryView } from "@/lib/library/view-context";
import { useSetBuilder } from "@/lib/setbuilder/context";
import { SORT_OPTIONS } from "@/lib/library/sort";
import {
  TEMPLATES,
  DEFAULT_NUMBERING,
  recommendedPadding,
  type NumberingOptions,
  type TemplateDef,
} from "@/lib/rename/templates";
import {
  DEFAULT_CLEANUP,
  type CleanupOptions,
} from "@/lib/rename/cleanup";
import {
  buildPlan,
  estimateDuration,
  type RenamePlan,
} from "@/lib/rename/engine";
import {
  loadHistory,
  markBatchReverted,
  pushBatch,
  type RenameBatch,
} from "@/lib/rename/history";
import { projectFingerprint } from "@/lib/analysis/persistence";

type Step = "template" | "preview" | "confirm";

/**
 * Renommage — professional local rename module.
 *
 * Three-step flow (Template → Preview → Confirmation), full cleanup engine,
 * numbering options, safety validation, batch history with per-batch undo.
 * The rename always follows the CURRENT visible order of the library
 * (shared `LibraryView` state), so sorting by BPM, key, Camelot or manual
 * drag-and-drop directly drives the output numbering.
 */

export function RenameTab() {
  const { project, renameTrack } = useWorkspace();
  const {
    sortField, setSortField,
    sortDir, setSortDir,
    applyView,
  } = useLibraryView();

  // If an active Set is open, the rename module follows the Set order.
  // Otherwise it uses the visible order of the library.
  const { activeSet } = useSetBuilder();
  const orderedTracks = useMemo(
    () => {
      if (!project) return [];
      if (activeSet && activeSet.tracks.length) return activeSet.tracks;
      return applyView(project.tracks);
    },
    [project, applyView, activeSet],
  );

  // -------- fingerprint / persisted history --------
  const fingerprint = useMemo(
    () => (project ? projectFingerprint(project) : null),
    [project],
  );
  const [history, setHistory] = useState<RenameBatch[]>([]);
  useEffect(() => {
    if (!fingerprint) return;
    setHistory(loadHistory(fingerprint).batches);
  }, [fingerprint]);

  // -------- step state --------
  const [step, setStep] = useState<Step>("template");
  const [templateId, setTemplateId] = useState<string>("num-name");
  const [customPattern, setCustomPattern] = useState<string>("{n} - {name}");
  const [cleanupOnly, setCleanupOnly] = useState(false);
  const [stripPrefixes, setStripPrefixes] = useState(true);
  const [preserveCase, setPreserveCase] = useState(true);
  const [cleanup, setCleanup] = useState<CleanupOptions>(DEFAULT_CLEANUP);
  const [numbering, setNumbering] = useState<NumberingOptions>({
    ...DEFAULT_NUMBERING,
    padding: recommendedPadding(orderedTracks.length),
  });

  // Keep recommended padding in sync while user hasn't customized.
  useEffect(() => {
    setNumbering((n) => ({
      ...n,
      padding: recommendedPadding(orderedTracks.length),
    }));
  }, [orderedTracks.length]);

  const currentPattern = useMemo(() => {
    if (cleanupOnly) return "{name}";
    if (templateId === "custom") return customPattern;
    const t = TEMPLATES.find((x) => x.id === templateId);
    return t?.pattern ?? "{name}";
  }, [templateId, customPattern, cleanupOnly]);

  // -------- plan --------
  const plan: RenamePlan = useMemo(
    () =>
      buildPlan({
        tracks: orderedTracks,
        pattern: currentPattern,
        numbering,
        cleanup,
        stripPrefixes: cleanupOnly ? true : stripPrefixes,
        preserveCase,
      }),
    [orderedTracks, currentPattern, numbering, cleanup, stripPrefixes, preserveCase, cleanupOnly],
  );

  // -------- progress --------
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  if (!project) return null;

  const applyPlan = async () => {
    if (!plan.safe || plan.totalChanged === 0) return;
    setProgress({ done: 0, total: plan.totalChanged });
    const changed = plan.entries.filter((e) => e.changed);
    const batchEntries: Array<{ trackId: string; before: string; after: string }> = [];
    for (let i = 0; i < changed.length; i++) {
      const e = changed[i];
      renameTrack(e.trackId, e.after);
      batchEntries.push({ trackId: e.trackId, before: e.before, after: e.after });
      // Yield to the browser so the progress bar updates smoothly.
      if (i % 25 === 0) await new Promise((r) => setTimeout(r, 0));
      setProgress({ done: i + 1, total: changed.length });
    }
    if (fingerprint) {
      const batch = pushBatch(fingerprint, {
        template: cleanupOnly ? "Nettoyage préfixes" : currentPattern,
        count: batchEntries.length,
        entries: batchEntries,
      });
      setHistory((h) => [batch, ...h]);
    }
    setProgress(null);
    setStep("template");
  };

  const undoBatch = (batch: RenameBatch) => {
    for (const e of batch.entries) {
      renameTrack(e.trackId, e.before);
    }
    if (fingerprint) {
      markBatchReverted(fingerprint, batch.id);
      setHistory(loadHistory(fingerprint).batches);
    }
  };

  const eta = estimateDuration(plan.totalChanged);
  const activeSortLabel = SORT_OPTIONS.find((s) => s.id === sortField)?.label ?? "";

  return (
    <div className="space-y-4 pb-24">
      {/* Stepper */}
      <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-1">
        {(["template", "preview", "confirm"] as Step[]).map((s, i) => {
          const active = step === s;
          const label = s === "template" ? "Modèle" : s === "preview" ? "Aperçu" : "Confirmation";
          return (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                active
                  ? "bg-gradient-gold text-primary-foreground shadow-gold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {i + 1}. {label}
            </button>
          );
        })}
      </div>

      {/* Library-order chip */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-[11px]">
        <ListOrdered className="h-3.5 w-3.5 text-primary" />
        <span className="text-muted-foreground">Ordre suivi :</span>
        <span className="font-semibold">{activeSortLabel}</span>
        <span className="text-muted-foreground">
          {sortField !== "manual" && sortField !== "import" && (sortDir === "asc" ? "↑" : "↓")}
        </span>
        <button
          onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          className="ml-auto rounded-md border border-border px-2 py-0.5 text-[10px] hover:bg-accent/20"
        >
          {sortDir === "asc" ? <ArrowUpAZ className="inline h-3 w-3" /> : <ArrowDownAZ className="inline h-3 w-3" />}
        </button>
      </div>

      {step === "template" && (
        <StepTemplate
          templateId={templateId}
          setTemplateId={setTemplateId}
          customPattern={customPattern}
          setCustomPattern={setCustomPattern}
          cleanupOnly={cleanupOnly}
          setCleanupOnly={setCleanupOnly}
          stripPrefixes={stripPrefixes}
          setStripPrefixes={setStripPrefixes}
          preserveCase={preserveCase}
          setPreserveCase={setPreserveCase}
          cleanup={cleanup}
          setCleanup={setCleanup}
          numbering={numbering}
          setNumbering={setNumbering}
          sortField={sortField}
          setSortField={setSortField}
          librarySize={orderedTracks.length}
          onNext={() => setStep("preview")}
        />
      )}

      {step === "preview" && (
        <StepPreview plan={plan} onNext={() => setStep("confirm")} />
      )}

      {step === "confirm" && (
        <StepConfirm
          plan={plan}
          eta={eta}
          progress={progress}
          onApply={applyPlan}
          templateLabel={
            cleanupOnly ? "Nettoyage préfixes" : currentPattern
          }
        />
      )}

      {/* History */}
      {history.length > 0 && (
        <section className="rounded-xl border border-border bg-surface">
          <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <History className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-semibold">Historique</p>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {history.length} lot{history.length > 1 ? "s" : ""}
            </span>
          </header>
          <ul className="max-h-72 overflow-y-auto">
            {history.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{b.template}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {new Date(b.at).toLocaleString()} · {b.count} fichier{b.count > 1 ? "s" : ""}
                    {b.reverted && " · annulé"}
                  </p>
                </div>
                {!b.reverted && (
                  <button
                    onClick={() => undoBatch(b)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-[10px] font-medium hover:bg-accent/20"
                  >
                    <Undo2 className="h-3 w-3" /> Annuler
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ───────────────────────── Step 1: Template ───────────────────────── */

function StepTemplate(props: {
  templateId: string;
  setTemplateId: (v: string) => void;
  customPattern: string;
  setCustomPattern: (v: string) => void;
  cleanupOnly: boolean;
  setCleanupOnly: (v: boolean) => void;
  stripPrefixes: boolean;
  setStripPrefixes: (v: boolean) => void;
  preserveCase: boolean;
  setPreserveCase: (v: boolean) => void;
  cleanup: CleanupOptions;
  setCleanup: (v: CleanupOptions) => void;
  numbering: NumberingOptions;
  setNumbering: (v: NumberingOptions) => void;
  sortField: string;
  setSortField: (v: never) => void;
  librarySize: number;
  onNext: () => void;
}) {
  const {
    templateId, setTemplateId,
    customPattern, setCustomPattern,
    cleanupOnly, setCleanupOnly,
    stripPrefixes, setStripPrefixes,
    preserveCase, setPreserveCase,
    cleanup, setCleanup,
    numbering, setNumbering,
    librarySize,
    onNext,
  } = props;

  const recommendedId = "num-name";

  return (
    <div className="space-y-4">
      {/* Cleanup-only card */}
      <button
        onClick={() => setCleanupOnly(!cleanupOnly)}
        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
          cleanupOnly
            ? "border-primary/60 bg-primary/10"
            : "border-border bg-surface hover:bg-accent/10"
        }`}
      >
        <div className={`grid h-9 w-9 place-items-center rounded-lg ${cleanupOnly ? "bg-primary text-primary-foreground" : "bg-accent/20 text-primary"}`}>
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Nettoyer les préfixes uniquement</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Supprime 001, 01, 125 BPM, 8A… au début du nom. Aucune numérotation.
          </p>
        </div>
        <div className={`grid h-5 w-5 place-items-center rounded ${cleanupOnly ? "bg-primary text-primary-foreground" : "border border-border-strong"}`}>
          {cleanupOnly && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </div>
      </button>

      {!cleanupOnly && (
        <>
          {/* Templates */}
          <section className="rounded-xl border border-border bg-surface p-3">
            <div className="mb-2 flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Modèle</p>
              <span className="ml-auto text-[10px] text-muted-foreground">
                Recommandé pour {librarySize} pistes
              </span>
            </div>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {TEMPLATES.map((t: TemplateDef) => {
                const active = t.id === templateId;
                const recommended = t.id === recommendedId;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setTemplateId(t.id)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                        active
                          ? "border-primary/70 bg-primary/10"
                          : "border-border bg-background hover:bg-accent/10"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{t.label}</span>
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">
                          {t.pattern}
                        </span>
                      </span>
                      {recommended && (
                        <span className="rounded bg-primary/20 px-1 py-0.5 text-[9px] font-bold uppercase text-primary">
                          Reco
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
              <li className="sm:col-span-2">
                <div
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                    templateId === "custom"
                      ? "border-primary/70 bg-primary/10"
                      : "border-border bg-background"
                  }`}
                >
                  <button
                    onClick={() => setTemplateId("custom")}
                    className="shrink-0 text-xs font-medium"
                  >
                    Personnalisé
                  </button>
                  <input
                    value={customPattern}
                    onChange={(e) => {
                      setCustomPattern(e.target.value);
                      setTemplateId("custom");
                    }}
                    placeholder="{n} - {bpm} - {name}"
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-[11px]"
                  />
                </div>
              </li>
            </ul>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Jetons : {"{n}"} · {"{name}"} · {"{bpm}"} · {"{key}"} · {"{cam}"}
            </p>
          </section>

          {/* Numbering */}
          <section className="rounded-xl border border-border bg-surface p-3">
            <div className="mb-2 flex items-center gap-2">
              <ListOrdered className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Numérotation</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <NumberField
                label="Départ"
                value={numbering.start}
                min={0}
                onChange={(v) => setNumbering({ ...numbering, start: v })}
              />
              <NumberField
                label="Chiffres"
                value={numbering.padding}
                min={1}
                max={6}
                onChange={(v) => setNumbering({ ...numbering, padding: v })}
              />
              <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5">
                <span className="text-muted-foreground">Séparateur</span>
                <input
                  value={numbering.separator}
                  onChange={(e) => setNumbering({ ...numbering, separator: e.target.value })}
                  className="h-6 flex-1 rounded border border-border bg-surface px-1 text-[11px]"
                />
              </label>
              <ToggleField
                label="Ordre décroissant"
                value={numbering.descending}
                onChange={(v) => setNumbering({ ...numbering, descending: v })}
              />
            </div>
          </section>
        </>
      )}

      {/* Cleanup options */}
      <section className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-2 flex items-center gap-2">
          <Type className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Nettoyage</p>
        </div>
        <div className="grid grid-cols-1 gap-1.5 text-[11px]">
          <ToggleField label="Supprimer les préfixes (001, 125 BPM, 8A…)" value={stripPrefixes} onChange={setStripPrefixes} disabled={cleanupOnly} />
          <ToggleField label="Conserver la casse d'origine" value={preserveCase} onChange={setPreserveCase} />
          <ToggleField label="Remplacer les underscores par un espace" value={cleanup.replaceUnderscores} onChange={(v) => setCleanup({ ...cleanup, replaceUnderscores: v })} />
          <ToggleField label="Remplacer les tirets par un espace" value={cleanup.replaceHyphens} onChange={(v) => setCleanup({ ...cleanup, replaceHyphens: v })} />
          <ToggleField label="Normaliser les espaces" value={cleanup.collapseSpaces} onChange={(v) => setCleanup({ ...cleanup, collapseSpaces: v })} />
          <ToggleField label="Supprimer caractères invisibles" value={cleanup.stripInvisibles} onChange={(v) => setCleanup({ ...cleanup, stripInvisibles: v })} />
        </div>
      </section>

      <button
        onClick={onNext}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-gold text-sm font-semibold text-primary-foreground shadow-gold active:scale-[0.98]"
      >
        Voir l'aperçu <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ───────────────────────── Step 2: Preview ───────────────────────── */

function StepPreview({ plan, onNext }: { plan: RenamePlan; onNext: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-3">
        <Eye className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Aperçu</p>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {plan.totalChanged} modification{plan.totalChanged > 1 ? "s" : ""}
        </span>
      </div>

      {plan.totalConflicts > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-[11px] text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {plan.totalConflicts} conflit{plan.totalConflicts > 1 ? "s" : ""} de nom détecté{plan.totalConflicts > 1 ? "s" : ""}. Le renommage ne pourra pas être appliqué tant qu'ils ne sont pas résolus.
          </span>
        </div>
      )}

      <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto rounded-xl border border-border bg-surface p-2">
        {plan.entries.map((e) => (
          <li
            key={e.trackId}
            className={`rounded-lg border px-2.5 py-1.5 ${
              e.issues.includes("Conflit de nom")
                ? "border-destructive/40 bg-destructive/5"
                : e.issues.length
                  ? "border-amber-500/40 bg-amber-500/5"
                  : e.changed
                    ? "border-border bg-background"
                    : "border-transparent bg-transparent opacity-60"
            }`}
          >
            <p className="truncate text-[11px] text-muted-foreground line-through">
              {e.before}
            </p>
            <p className="mt-0.5 truncate text-xs font-medium">
              {e.changed ? e.after : "— aucun changement —"}
            </p>
            {e.issues.length > 0 && (
              <p className="mt-0.5 text-[10px] font-medium text-destructive">
                {e.issues.join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ul>

      <button
        onClick={onNext}
        disabled={!plan.safe || plan.totalChanged === 0}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-gold text-sm font-semibold text-primary-foreground shadow-gold disabled:opacity-40 active:scale-[0.98]"
      >
        Continuer <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ───────────────────────── Step 3: Confirm ───────────────────────── */

function StepConfirm({
  plan,
  eta,
  progress,
  onApply,
  templateLabel,
}: {
  plan: RenamePlan;
  eta: number;
  progress: { done: number; total: number } | null;
  onApply: () => void;
  templateLabel: string;
}) {
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Confirmation
        </p>
        <p className="mt-1 font-mono text-[13px]">{templateLabel}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <Stat label="Fichiers" value={String(plan.totalChanged)} />
          <Stat label="Temps estimé" value={eta < 1000 ? `${eta} ms` : `${(eta / 1000).toFixed(1)} s`} />
          <Stat label="Conflits" value={String(plan.totalConflicts)} tone={plan.totalConflicts ? "warn" : "ok"} />
        </div>
      </div>

      {progress && (
        <div className="space-y-1.5 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium">Renommage en cours…</span>
            <span className="tabular-nums text-muted-foreground">
              {progress.done} / {progress.total} · {pct}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent/30">
            <div
              className="h-full rounded-full bg-gradient-gold transition-[width] duration-100"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <button
        onClick={onApply}
        disabled={!plan.safe || plan.totalChanged === 0 || !!progress}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-gold text-sm font-semibold text-primary-foreground shadow-gold disabled:opacity-40 active:scale-[0.98]"
      >
        <Check className="h-4 w-4" />
        Appliquer le renommage
      </button>

      <p className="text-center text-[10px] text-muted-foreground">
        Chaque lot est enregistré dans l'historique. Vous pouvez annuler à tout moment, même après fermeture de MixOrder.
      </p>
    </div>
  );
}

/* ───────────────────────── small helpers ───────────────────────── */

function NumberField({
  label, value, onChange, min, max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="h-6 w-14 rounded border border-border bg-surface px-1 text-right text-[11px] tabular-nums"
      />
    </label>
  );
}

function ToggleField({
  label, value, onChange, disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-left transition-colors ${
        disabled ? "opacity-40" : "hover:bg-accent/10"
      }`}
    >
      <span className="text-foreground/90">{label}</span>
      <span
        className={`grid h-4 w-4 shrink-0 place-items-center rounded ${
          value ? "bg-primary text-primary-foreground" : "border border-border-strong"
        }`}
      >
        {value && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${
      tone === "warn" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-border bg-background"
    }`}>
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
