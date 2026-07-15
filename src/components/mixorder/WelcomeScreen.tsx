import { useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  Loader2,
  Clock,
  X,
  ArrowRight,
  Music4,
  Waves,
  KeyRound,
  ListMusic,
  Layers3,
  Copy,
  FileEdit,
  HardDrive,
  Bot,
  Sparkles,
  Zap,
  Shield,
  CheckCircle2,
  Play,
} from "lucide-react";
import { Logo } from "./Logo";
import { useWorkspace } from "@/lib/workspace-context";
import { isNativePlatform, pickFolderNative } from "@/lib/folder-import";

export function WelcomeScreen() {
  const { openProject, openImportedProject, recentLibraries, forgetLibrary } =
    useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [native, setNative] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNative(isNativePlatform());
  }, []);

  const handlePick = async () => {
    setError(null);
    if (!native) {
      inputRef.current?.click();
      return;
    }
    try {
      setPicking(true);
      const project = await pickFolderNative();
      if (project) openImportedProject(project);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(msg)) setError("Import impossible : " + msg);
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-background">
      {/* Ambient background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px]"
        style={{ background: "var(--gradient-radial-gold)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in oklab, var(--primary) 55%, transparent), transparent)",
        }}
      />

      {/* Top bar — compact brand */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-5 pt-safe pb-3 backdrop-blur-md bg-background/70 border-b border-border/60"
        style={{ ["--pt-safe-extra" as string]: "12px" }}
      >
        <div className="flex items-center gap-2">
          <Logo size={22} />
          <span className="font-display text-[13px] font-semibold tracking-wide">
            MixOrder
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border-strong px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Studio
          </span>
        </div>
      </header>

      {/* ===================== HERO ===================== */}
      <section className="px-5 pt-10 pb-14 sm:pt-16">
        <div className="mx-auto max-w-md text-center">
          <div
            className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface/60 px-3 py-1.5 text-[11px] uppercase tracking-widest text-muted-foreground backdrop-blur"
            style={{ animationDelay: "40ms" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-gold" />
            Local · Rapide · Fait pour DJs
          </div>

          <h1
            className="animate-fade-up mt-6 font-display text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[44px]"
            style={{ animationDelay: "120ms" }}
          >
            Ta bibliothèque DJ,
            <br />
            <span className="text-gradient-gold">analysée et prête à mixer.</span>
          </h1>

          <p
            className="animate-fade-up mt-4 mx-auto max-w-sm text-[15px] leading-relaxed text-muted-foreground"
            style={{ animationDelay: "200ms" }}
          >
            MixOrder transforme un dossier de morceaux en bibliothèque intelligente :
            BPM, tonalités, doublons, renommage et sets harmoniques — tout en local,
            sur ton appareil.
          </p>

          <div
            className="animate-fade-up mt-8 flex flex-col items-center gap-3"
            style={{ animationDelay: "280ms" }}
          >
            <button
              onClick={handlePick}
              disabled={picking}
              className="group relative inline-flex h-13 min-w-[240px] items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-gold px-7 py-3.5 text-[15px] font-semibold text-primary-foreground shadow-gold transition-transform active:scale-[0.98] disabled:opacity-70"
            >
              {picking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderOpen className="h-4 w-4" />
              )}
              {native ? "Importer un dossier" : "Ouvrir un dossier"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            {!native && (
              <input
                ref={inputRef}
                type="file"
                multiple
                // @ts-expect-error non-standard
                webkitdirectory=""
                directory=""
                accept="audio/*"
                className="hidden"
                onChange={(e) => e.target.files && openProject(e.target.files)}
              />
            )}
            <p className="text-[11px] text-muted-foreground/70">
              Aucun envoi cloud. Tes fichiers ne quittent jamais l'appareil.
            </p>
            {error && <p className="text-[11px] text-destructive">{error}</p>}
          </div>

          {/* Animated analysis preview */}
          <div
            className="animate-fade-up mt-10"
            style={{ animationDelay: "360ms" }}
          >
            <AnalysisPreview />
          </div>

          {/* Trust chips */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {[
              { icon: Zap, label: "Instantané" },
              { icon: Shield, label: "100% local" },
              { icon: Sparkles, label: "Pensé DJ" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface/70 px-3 py-1.5 text-[11px] font-medium text-muted-foreground backdrop-blur"
              >
                <Icon className="h-3 w-3 text-primary" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== RECENT LIBRARIES ===================== */}
      {recentLibraries.length > 0 && (
        <Section title="Reprendre où tu t'es arrêté" eyebrow="Bibliothèques récentes">
          <ul className="space-y-2.5">
            {recentLibraries.map((r) => (
              <li
                key={r.fingerprint}
                className="group relative flex items-center gap-3 rounded-2xl border border-border/70 bg-surface p-3.5 shadow-card transition-all hover:border-primary/40 hover:shadow-card-lg"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-gold/20 border border-border">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{r.name}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">{r.trackCount} pistes</span>
                    <span className="opacity-40">•</span>
                    <Clock className="h-3 w-3" />
                    <span className="tabular-nums">
                      {new Date(r.lastOpenedAt).toLocaleDateString()}
                    </span>
                  </p>
                </div>
                <button
                  onClick={handlePick}
                  disabled={picking}
                  aria-label={`Ouvrir ${r.name}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary/10 px-3 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Ouvrir
                </button>
                <button
                  onClick={() => forgetLibrary(r.fingerprint)}
                  aria-label="Oublier"
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-surface-elevated hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground/80">
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
            <span>
              À la réouverture, BPM, tonalités, renommages et sets sont restaurés
              automatiquement.
            </span>
          </p>
        </Section>
      )}

      {/* ===================== HOW IT WORKS ===================== */}
      <Section eyebrow="Workflow" title="Du dossier au dancefloor, en 4 étapes.">
        <div className="relative">
          {/* Connector line */}
          <div
            aria-hidden
            className="absolute left-[27px] top-6 bottom-6 w-px bg-gradient-to-b from-primary/60 via-primary/25 to-transparent"
          />
          <ol className="space-y-4">
            {WORKFLOW.map((step, i) => (
              <RevealItem key={step.title} delayMs={i * 80}>
                <div className="relative flex gap-4 rounded-2xl border border-border/60 bg-surface p-4 shadow-card">
                  <div className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-gold text-primary-foreground shadow-gold">
                    <step.icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-primary">
                        Étape {i + 1}
                      </span>
                    </div>
                    <h3 className="mt-1 font-display text-[16px] font-semibold">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {step.desc}
                    </p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </ol>
        </div>
      </Section>

      {/* ===================== FEATURES ===================== */}
      <Section
        eyebrow="Ce que fait MixOrder"
        title="Un vrai studio d'organisation musicale."
      >
        <div className="grid grid-cols-2 gap-3">
          {FEATURES.map((f, i) => (
            <RevealItem key={f.title} delayMs={i * 40}>
              <div className="group relative flex h-full flex-col gap-2 rounded-2xl border border-border/60 bg-surface p-3.5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-lg">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                  <f.icon className="h-4 w-4" />
                </div>
                <h3 className="font-display text-[13px] font-semibold leading-tight">
                  {f.title}
                </h3>
                <p className="text-[11.5px] leading-snug text-muted-foreground">
                  {f.desc}
                </p>
              </div>
            </RevealItem>
          ))}
        </div>
      </Section>

      {/* ===================== ROBOT DISCDJ ===================== */}
      <Section eyebrow="Fonction avancée" title="Robot DiscDJ.">
        <RevealItem>
          <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-surface p-6 shadow-card-lg">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-40 blur-3xl"
              style={{ background: "var(--gradient-primary)" }}
            />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
                <Bot className="h-3 w-3" />
                Optionnel
              </div>
              <h3 className="mt-4 font-display text-[22px] font-bold leading-tight">
                Laisse MixOrder{" "}
                <span className="text-gradient-gold">lire les BPM de DiscDJ</span>{" "}
                à ta place.
              </h3>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
                Si tu utilises déjà DiscDJ, MixOrder peut l'ouvrir automatiquement,
                lancer chaque morceau et récupérer les BPM natifs de l'app — sans
                réanalyse audio, sans intervention manuelle.
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "Compatible avec ta bibliothèque DiscDJ existante",
                  "Aucun ré-encodage, aucune copie de fichier",
                  "Activable/désactivable à tout moment",
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2 text-[12.5px] text-muted-foreground"
                  >
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </RevealItem>
      </Section>

      {/* ===================== FINAL CTA ===================== */}
      <section className="px-5 py-14">
        <RevealItem>
          <div className="mx-auto max-w-md text-center">
            <h2 className="font-display text-[26px] font-bold leading-tight">
              Ta prochaine session commence
              <br />
              <span className="text-gradient-gold">par un dossier.</span>
            </h2>
            <p className="mt-3 text-[13.5px] text-muted-foreground">
              Ouvre ta bibliothèque, laisse MixOrder faire l'analyse.
            </p>
            <button
              onClick={handlePick}
              disabled={picking}
              className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-gold px-6 text-[14px] font-semibold text-primary-foreground shadow-gold active:scale-[0.98] disabled:opacity-70"
            >
              {picking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderOpen className="h-4 w-4" />
              )}
              {native ? "Importer un dossier" : "Ouvrir un dossier"}
            </button>
          </div>
        </RevealItem>
      </section>

      <footer className="px-6 pb-8 pt-4 text-center text-[10px] uppercase tracking-[0.24em] text-muted-foreground/60">
        Crafted for DJs · v0.1
      </footer>
    </div>
  );
}

/* -------------------- Helpers -------------------- */

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-5 py-10">
      <div className="mx-auto max-w-md">
        <RevealItem>
          <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-primary">
            {eyebrow}
          </p>
          <h2 className="mt-2 font-display text-[24px] font-bold leading-tight tracking-tight">
            {title}
          </h2>
          <div className="mt-6">{children}</div>
        </RevealItem>
      </div>
    </section>
  );
}

function RevealItem({
  children,
  delayMs = 0,
}: {
  children: React.ReactNode;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "-40px 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        transitionDelay: `${delayMs}ms`,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        opacity: visible ? 1 : 0,
        transition:
          "transform 700ms cubic-bezier(0.22,1,0.36,1), opacity 700ms ease-out",
      }}
    >
      {children}
    </div>
  );
}

/* -------------------- Animated preview -------------------- */

function AnalysisPreview() {
  const tracks = [
    { name: "Midnight Drive", bpm: 124, key: "8A" },
    { name: "Neon Skyline", bpm: 126, key: "9A" },
    { name: "After Hours", bpm: 122, key: "7A" },
  ];
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1400);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-border/70 bg-surface/80 p-3 shadow-card-lg backdrop-blur">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          Analyse en cours
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {Math.min(100, 30 + (tick % 4) * 20)}%
        </span>
      </div>
      <ul className="space-y-1.5">
        {tracks.map((t, i) => {
          const analyzed = (tick + i) % 4 !== 0;
          return (
            <li
              key={t.name}
              className="flex items-center gap-2.5 rounded-xl bg-background/60 px-2.5 py-2"
            >
              <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
                <Music4 className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium">{t.name}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {analyzed ? (
                    <>
                      <span className="tabular-nums">{t.bpm} BPM</span>
                      <span className="opacity-40">·</span>
                      <span className="rounded bg-primary/15 px-1 py-px font-mono text-primary">
                        {t.key}
                      </span>
                    </>
                  ) : (
                    <span className="animate-pulse">Détection…</span>
                  )}
                </div>
              </div>
              {analyzed ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------- Content -------------------- */

const WORKFLOW = [
  {
    icon: FolderOpen,
    title: "Choisis un dossier",
    desc: "Sélectionne un dossier contenant tes fichiers audio. Rien n'est copié : MixOrder lit sur place.",
  },
  {
    icon: Waves,
    title: "Analyse automatique",
    desc: "BPM et tonalités sont détectés localement, avec des moteurs pensés pour la musique électronique.",
  },
  {
    icon: Layers3,
    title: "Bibliothèque intelligente",
    desc: "Tri, filtres, doublons, renommage : ta collection devient exploitable en un coup d'œil.",
  },
  {
    icon: ListMusic,
    title: "Prépare ton set",
    desc: "Set Builder + Harmonic Mixing te suggèrent des transitions cohérentes en BPM et tonalité.",
  },
];

const FEATURES = [
  {
    icon: Waves,
    title: "Analyse BPM & Tonalités",
    desc: "Détection locale, précise, sans cloud.",
  },
  {
    icon: Layers3,
    title: "Classement intelligent",
    desc: "Tri multicritères instantané.",
  },
  {
    icon: Sparkles,
    title: "Auto Mix Order",
    desc: "Ordre optimal en un tap.",
  },
  {
    icon: ListMusic,
    title: "Set Builder",
    desc: "Construis tes sets pas à pas.",
  },
  {
    icon: KeyRound,
    title: "Harmonic Mixing",
    desc: "Camelot Wheel intégrée.",
  },
  {
    icon: Copy,
    title: "Doublons",
    desc: "Détecte et nettoie proprement.",
  },
  {
    icon: FileEdit,
    title: "Renommage",
    desc: "Préfixes personnalisés, réversible.",
  },
  {
    icon: HardDrive,
    title: "100% local",
    desc: "Aucun envoi, aucun compte.",
  },
  {
    icon: Bot,
    title: "Robot DiscDJ",
    desc: "Récupère les BPM natifs de DiscDJ.",
  },
];
