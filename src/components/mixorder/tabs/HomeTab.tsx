import { useEffect, useMemo, useState } from "react";
import {
  FolderOpen,
  RefreshCw,
  Library,
  Bot,
  ListMusic,
  Copy,
  Pencil,
  Music2,
  KeyRound,
  Clock3,
  Activity,
  Lightbulb,
  PlayCircle,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Waves,
} from "lucide-react";
import { formatDuration, useWorkspace } from "@/lib/workspace-context";
import { useSetBuilder } from "@/lib/setbuilder/context";
import { useDuplicates } from "@/hooks/useDuplicates";
import { useRobotJournal } from "@/hooks/useRobotJournal";
import { projectFingerprint } from "@/lib/analysis/persistence";
import { loadHistory, type RenameBatch } from "@/lib/rename/history";

type TabId =
  | "home"
  | "library"
  | "robot"
  | "analysis"
  | "duplicates"
  | "setbuilder"
  | "rename";

interface HomeTabProps {
  onNavigate: (tab: TabId) => void;
  onChangeLibrary: () => void;
}

/**
 * MixOrder dashboard — the single landing surface once a library is open.
 *
 * Aggregates data from the workspace (tracks, BPM, key, timestamps), the
 * SetBuilder, the duplicate detector, the robot journal and the rename
 * history to power six always-visible sections: current library, quick
 * actions, progress, recent activity, resume-work, smart tips. No business
 * logic is reimplemented here — every stat is derived from the same
 * sources the underlying tabs already trust.
 */
export function HomeTab({ onNavigate, onChangeLibrary }: HomeTabProps) {
  const { project } = useWorkspace();
  const { sets, activeSet } = useSetBuilder();
  const { groups: dupGroups } = useDuplicates();
  const fingerprint = useMemo(
    () => (project ? projectFingerprint(project) : null),
    [project],
  );
  const journal = useRobotJournal(fingerprint);
  const [renameBatches, setRenameBatches] = useState<RenameBatch[]>([]);

  useEffect(() => {
    if (!fingerprint) return;
    setRenameBatches(loadHistory(fingerprint).batches);
  }, [fingerprint, project?.tracks.length]);

  if (!project) return null;

  const tracks = project.tracks;
  const totalDuration = tracks.reduce((a, t) => a + (t.durationSec ?? 0), 0);
  const withBpm = tracks.filter((t) => t.bpm != null).length;
  const withKey = tracks.filter((t) => t.musicalKey != null).length;
  const pendingBpm = tracks.length - withBpm;
  const pendingKey = tracks.length - withKey;
  const dupCount = dupGroups.reduce(
    (a, g) => a + Math.max(0, g.trackIds.length - 1),
    0,
  );

  const lastOpenedLabel = new Date(project.createdAt).toLocaleDateString(
    "fr-FR",
    { day: "2-digit", month: "long", year: "numeric" },
  );

  return (
    <div className="space-y-6">
      {/* 1 — Bibliothèque actuelle */}
      <section
        className="animate-fade-up rounded-2xl border border-border bg-card p-5 shadow-md"
        style={{ animationDelay: "20ms" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Bibliothèque actuelle
              </p>
              <h1 className="mt-0.5 truncate font-display text-lg font-semibold leading-tight">
                {project.name}
              </h1>
            </div>
          </div>
          <button
            onClick={onChangeLibrary}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            aria-label="Changer de bibliothèque"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Changer
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatPill label="Pistes" value={tracks.length.toString()} />
          <StatPill label="BPM détectés" value={withBpm.toString()} />
          <StatPill label="Tonalités" value={withKey.toString()} />
          <StatPill
            label="Durée totale"
            value={totalDuration > 0 ? formatDuration(totalDuration) : "—"}
          />
          <StatPill
            label="Doublons"
            value={dupCount > 0 ? dupCount.toString() : "0"}
          />
          <StatPill label="Ouverte le" value={lastOpenedLabel} />
        </div>
      </section>

      {/* 2 — Actions rapides */}
      <section
        className="animate-fade-up space-y-3"
        style={{ animationDelay: "80ms" }}
      >
        <SectionHeader
          icon={Sparkles}
          title="Actions rapides"
          subtitle="Sauter directement dans un module"
        />
        <div className="grid grid-cols-2 gap-3">
          <ActionCard
            icon={Library}
            label="Bibliothèque"
            desc="Trier, rechercher, écouter"
            onClick={() => onNavigate("library")}
          />
          <ActionCard
            icon={Bot}
            label="Robot DiscDJ"
            desc="Détection BPM automatisée"
            accent
            onClick={() => onNavigate("robot")}
          />
          <ActionCard
            icon={ListMusic}
            label="Set Builder"
            desc="Playlists harmoniques"
            onClick={() => onNavigate("setbuilder")}
          />
          <ActionCard
            icon={Copy}
            label="Doublons"
            desc="Nettoyer la bibliothèque"
            onClick={() => onNavigate("duplicates")}
          />
          <ActionCard
            icon={Pencil}
            label="Renommage"
            desc="Templates batch + Undo"
            onClick={() => onNavigate("rename")}
            className="col-span-2"
          />
        </div>
      </section>

      {/* 3 — Progression */}
      <section
        className="animate-fade-up space-y-3"
        style={{ animationDelay: "140ms" }}
      >
        <SectionHeader
          icon={Waves}
          title="Progression de la bibliothèque"
          subtitle="Ce qu'il reste à analyser"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <ProgressCard
            icon={Music2}
            label="BPM détectés"
            done={withBpm}
            total={tracks.length}
            tone="primary"
          />
          <ProgressCard
            icon={KeyRound}
            label="Tonalités détectées"
            done={withKey}
            total={tracks.length}
            tone="action"
          />
          <ProgressCard
            icon={Copy}
            label="Doublons trouvés"
            done={dupCount}
            total={tracks.length}
            tone="bronze"
            invertMeaning
          />
          <ProgressCard
            icon={Clock3}
            label="Restants à analyser"
            done={pendingBpm}
            total={tracks.length}
            tone="muted"
            invertMeaning
          />
        </div>
      </section>

      {/* 4 — Activité récente */}
      <section
        className="animate-fade-up space-y-3"
        style={{ animationDelay: "200ms" }}
      >
        <SectionHeader
          icon={Activity}
          title="Activité récente"
          subtitle="Où vous vous êtes arrêté"
        />
        <RecentActivity
          journal={journal}
          renameBatches={renameBatches}
          projectCreatedAt={project.createdAt}
          sets={sets}
        />
      </section>

      {/* 5 — Reprendre le travail */}
      <ResumeSection
        onNavigate={onNavigate}
        pendingBpm={pendingBpm}
        renameBatches={renameBatches}
        activeSetName={activeSet?.name ?? null}
      />

      {/* 6 — Conseils intelligents */}
      <SmartTips
        pendingBpm={pendingBpm}
        pendingKey={pendingKey}
        dupCount={dupCount}
        setsCount={sets.length}
        onNavigate={onNavigate}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Library;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-2 px-0.5">
      <Icon className="h-3.5 w-3.5 text-primary" />
      <h2 className="font-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      <span className="text-[11px] text-muted-foreground/60">· {subtitle}</span>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-surface px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate font-display text-base font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  label,
  desc,
  onClick,
  accent,
  className,
}: {
  icon: typeof Library;
  label: string;
  desc: string;
  onClick: () => void;
  accent?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all active:scale-[0.98] ${
        accent
          ? "border-primary/40 bg-gradient-to-br from-primary/15 via-card to-card shadow-md hover:shadow-glow"
          : "border-border bg-card hover:border-border-strong hover:bg-surface-elevated"
      } ${className ?? ""}`}
    >
      <div className="flex items-center justify-between">
        <div
          className={`grid h-10 w-10 place-items-center rounded-xl ${
            accent ? "bg-primary/20 text-primary" : "bg-surface-elevated text-foreground"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <p className="mt-3 font-display text-sm font-semibold">{label}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>
    </button>
  );
}

function ProgressCard({
  icon: Icon,
  label,
  done,
  total,
  tone,
  invertMeaning,
}: {
  icon: typeof Library;
  label: string;
  done: number;
  total: number;
  tone: "primary" | "action" | "bronze" | "muted";
  invertMeaning?: boolean;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const barColor =
    tone === "primary"
      ? "bg-primary"
      : tone === "action"
        ? "bg-action"
        : tone === "bronze"
          ? "bg-bronze"
          : "bg-muted-foreground/60";
  const iconTone =
    tone === "primary"
      ? "text-primary"
      : tone === "action"
        ? "text-action"
        : tone === "bronze"
          ? "text-bronze"
          : "text-muted-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`grid h-8 w-8 place-items-center rounded-lg bg-surface-elevated ${iconTone}`}>
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-xs font-medium text-foreground">{label}</p>
        </div>
        <p className="font-display text-sm font-semibold tabular-nums">
          {done}
          <span className="text-muted-foreground">/{total}</span>
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700`}
          style={{ width: `${invertMeaning ? Math.min(pct, 100) : pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-right text-[10px] text-muted-foreground tabular-nums">
        {pct}%
      </p>
    </div>
  );
}

// ---------- Recent activity ----------

type ActivityItem = {
  ts: number;
  icon: typeof Library;
  label: string;
  desc: string;
  tone: "primary" | "action" | "bronze" | "success" | "muted";
};

function RecentActivity({
  journal,
  renameBatches,
  projectCreatedAt,
  sets,
}: {
  journal: ReturnType<typeof useRobotJournal>;
  renameBatches: RenameBatch[];
  projectCreatedAt: number;
  sets: ReturnType<typeof useSetBuilder>["sets"];
}) {
  const items: ActivityItem[] = [];
  items.push({
    ts: projectCreatedAt,
    icon: FolderOpen,
    label: "Bibliothèque importée",
    desc: "Import initial du dossier",
    tone: "primary",
  });
  for (const j of journal.slice(0, 6)) {
    items.push({
      ts: j.ts,
      icon: Bot,
      label: `Robot · ${j.name}`,
      desc:
        j.outcome === "success" && j.bpm != null
          ? `BPM ${j.bpm} détecté`
          : j.outcome === "error"
            ? "Erreur lors de l'analyse"
            : j.outcome === "retry"
              ? "Nouvelle tentative"
              : "Analyse",
      tone: j.outcome === "success" ? "success" : j.outcome === "error" ? "bronze" : "action",
    });
  }
  for (const b of renameBatches.slice(0, 3)) {
    items.push({
      ts: b.at,
      icon: Pencil,
      label: `Renommage · ${b.count} pistes`,
      desc: b.reverted ? "Annulé" : `Modèle : ${b.template}`,
      tone: "action",
    });
  }
  for (const s of sets.slice(0, 3)) {
    items.push({
      ts: s.updatedAt,
      icon: ListMusic,
      label: `Set · ${s.name}`,
      desc: `${s.paths.length} pistes`,
      tone: "primary",
    });
  }

  items.sort((a, b) => b.ts - a.ts);
  const top = items.slice(0, 6);

  if (top.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center text-xs text-muted-foreground">
        Aucune activité récente pour l'instant.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {top.map((it, i) => (
        <li
          key={`${it.ts}-${i}`}
          className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-xs"
        >
          <div
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-elevated ${
              it.tone === "primary"
                ? "text-primary"
                : it.tone === "action"
                  ? "text-action"
                  : it.tone === "success"
                    ? "text-success"
                    : it.tone === "bronze"
                      ? "text-bronze"
                      : "text-muted-foreground"
            }`}
          >
            <it.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{it.label}</p>
            <p className="truncate text-[11px] text-muted-foreground">{it.desc}</p>
          </div>
          <p className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
            {relativeTime(it.ts)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

// ---------- Resume work ----------

function ResumeSection({
  onNavigate,
  pendingBpm,
  renameBatches,
  activeSetName,
}: {
  onNavigate: (t: TabId) => void;
  pendingBpm: number;
  renameBatches: RenameBatch[];
  activeSetName: string | null;
}) {
  // Priority: Robot pending > active set > recent rename batch < 24h
  let target: {
    tab: TabId;
    title: string;
    desc: string;
    icon: typeof Library;
  } | null = null;

  if (pendingBpm > 0) {
    target = {
      tab: "robot",
      title: "Reprendre l'analyse BPM",
      desc: `${pendingBpm} morceau${pendingBpm > 1 ? "x" : ""} sans BPM détecté`,
      icon: Bot,
    };
  } else if (activeSetName) {
    target = {
      tab: "setbuilder",
      title: `Continuer le set « ${activeSetName} »`,
      desc: "Ton set en cours d'édition",
      icon: ListMusic,
    };
  } else {
    const last = renameBatches[0];
    if (last && Date.now() - last.at < 24 * 3600_000) {
      target = {
        tab: "rename",
        title: "Revoir le dernier renommage",
        desc: `${last.count} pistes · ${last.template}`,
        icon: Pencil,
      };
    }
  }

  if (!target) return null;

  return (
    <section
      className="animate-fade-up space-y-3"
      style={{ animationDelay: "260ms" }}
    >
      <SectionHeader
        icon={PlayCircle}
        title="Reprendre le travail"
        subtitle="Là où vous vous êtes arrêté"
      />
      <button
        onClick={() => onNavigate(target!.tab)}
        className="group flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-4 text-left shadow-md transition-all active:scale-[0.99] hover:shadow-glow"
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary">
          <target.icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold">{target.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">{target.desc}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" />
      </button>
    </section>
  );
}

// ---------- Smart tips ----------

function SmartTips({
  pendingBpm,
  pendingKey,
  dupCount,
  setsCount,
  onNavigate,
}: {
  pendingBpm: number;
  pendingKey: number;
  dupCount: number;
  setsCount: number;
  onNavigate: (t: TabId) => void;
}) {
  const tips: Array<{
    icon: typeof Library;
    text: string;
    action: { label: string; tab: TabId };
  }> = [];

  if (pendingBpm > 0)
    tips.push({
      icon: Music2,
      text: `Il reste ${pendingBpm} morceau${pendingBpm > 1 ? "x" : ""} sans BPM.`,
      action: { label: "Lancer le robot", tab: "robot" },
    });
  if (pendingKey > 0 && pendingKey !== pendingBpm)
    tips.push({
      icon: KeyRound,
      text: `${pendingKey} morceau${pendingKey > 1 ? "x sont" : " est"} sans tonalité.`,
      action: { label: "Analyser", tab: "analysis" },
    });
  if (dupCount > 0)
    tips.push({
      icon: Copy,
      text: `${dupCount} doublon${dupCount > 1 ? "s ont" : " a"} été détecté${dupCount > 1 ? "s" : ""}.`,
      action: { label: "Nettoyer", tab: "duplicates" },
    });
  if (setsCount === 0)
    tips.push({
      icon: ListMusic,
      text: "Aucun set n'a encore été créé.",
      action: { label: "Créer un set", tab: "setbuilder" },
    });

  if (tips.length === 0) {
    return (
      <section
        className="animate-fade-up space-y-3"
        style={{ animationDelay: "320ms" }}
      >
        <SectionHeader
          icon={Lightbulb}
          title="Conseils intelligents"
          subtitle="Recommandations personnalisées"
        />
        <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success/10 p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <p className="text-xs text-foreground">
            Ta bibliothèque est à jour. Rien à signaler.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="animate-fade-up space-y-3"
      style={{ animationDelay: "320ms" }}
    >
      <SectionHeader
        icon={Lightbulb}
        title="Conseils intelligents"
        subtitle="Recommandations personnalisées"
      />
      <ul className="space-y-2">
        {tips.map((tip, i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xs"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
              <tip.icon className="h-4 w-4" />
            </div>
            <p className="min-w-0 flex-1 text-xs text-foreground">{tip.text}</p>
            <button
              onClick={() => onNavigate(tip.action.tab)}
              className="shrink-0 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
            >
              {tip.action.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
