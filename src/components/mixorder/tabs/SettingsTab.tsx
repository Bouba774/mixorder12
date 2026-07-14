import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Settings as SettingsIcon,
  Palette,
  Bot,
  Library as LibraryIcon,
  PlayCircle,
  Pencil,
  Bell,
  HardDrive,
  Info,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
  Trash2,
  RotateCcw,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "../PageHeader";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme, type ThemeMode } from "@/lib/theme/theme-provider";
import {
  computeStorageUsage,
  formatBytes,
  useSettings,
  type HistoryRetention,
  type RenameTemplate,
  type TrackDisplayFormat,
} from "@/lib/settings/settings-context";
import { useWorkspace } from "@/lib/workspace-context";
import { useSetBuilder } from "@/lib/setbuilder/context";
import { cn } from "@/lib/utils";
import { Logo } from "../Logo";
import { toast } from "sonner";

const APP_VERSION = "1.4.0";

/**
 * SettingsTab — the single, premium settings surface for MixOrder.
 *
 * Every preference the app already tracks (theme, robot, library, player,
 * rename, notifications) is regrouped into large, well-spaced cards that
 * follow the Design System (surface + gold accent + display font).
 * Existing feature modules keep their runtime behaviour untouched — this
 * page is a reorganisation, not a rewrite.
 */
export function SettingsTab() {
  return (
    <div className="animate-fade-in space-y-6 pb-6">
      <PageHeader
        icon={SettingsIcon}
        eyebrow="Réglages"
        title="Paramètres"
        subtitle="Personnalisez chaque module de MixOrder — les changements s'appliquent immédiatement."
      />

      <AppearanceCard />
      <RobotCard />
      <LibraryCard />
      <PlayerCard />
      <RenameCard />
      <NotificationsCard />
      <StorageCard />
      <AboutCard />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Building blocks                                                   */
/* ------------------------------------------------------------------ */

interface SectionCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: ReactNode;
  headerRight?: ReactNode;
}

function SectionCard({ icon: Icon, title, description, children, headerRight }: SectionCardProps) {
  return (
    <section className="animate-fade-in rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <header className="mb-4 flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold leading-tight text-foreground">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {headerRight}
      </header>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

interface RowProps {
  label: string;
  hint?: string;
  children: ReactNode;
  stacked?: boolean;
}

function Row({ label, hint, children, stacked }: RowProps) {
  if (stacked) {
    return (
      <div className="border-b border-border/60 py-3 last:border-b-0">
        <div className="mb-2">
          <div className="text-sm font-medium text-foreground">{label}</div>
          {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-border bg-surface-elevated">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-primary/5"
      >
        <span>{title}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="animate-fade-in border-t border-border px-4 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Appearance                                                        */
/* ------------------------------------------------------------------ */

function AppearanceCard() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const options: { value: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
    { value: "light", label: "Clair", icon: Sun, hint: "Interface lumineuse" },
    { value: "dark", label: "Sombre", icon: Moon, hint: "Interface obsidienne" },
    { value: "system", label: "Système", icon: Monitor, hint: "Suit Android automatiquement" },
  ];

  return (
    <SectionCard
      icon={Palette}
      title="Apparence"
      description="MixOrder s'adapte à votre appareil. Le mode Système suit le thème Android en temps réel."
    >
      <div className="grid gap-2 py-2 sm:grid-cols-3">
        {options.map(({ value, label, icon: Icon, hint }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                "group flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all",
                active
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-surface-elevated hover:border-primary/40",
              )}
            >
              <div className={cn("grid h-9 w-9 place-items-center rounded-lg transition-colors", active ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground")}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">{label}</div>
              <div className="text-[11px] text-muted-foreground">{hint}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface-elevated p-3">
        <div className={cn("grid h-8 w-8 place-items-center rounded-lg", resolvedTheme === "dark" ? "bg-foreground text-background" : "bg-primary/15 text-primary")}>
          {resolvedTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Aperçu actuel</div>
          <div className="text-sm font-semibold text-foreground">
            Thème {resolvedTheme === "dark" ? "sombre" : "clair"}
            {theme === "system" && <span className="ml-1 text-muted-foreground">(via système)</span>}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Robot DiscDJ                                                       */
/* ------------------------------------------------------------------ */

function RobotCard() {
  const { settings, setSetting } = useSettings();
  return (
    <SectionCard
      icon={Bot}
      title="Robot DiscDJ"
      description="Réglages généraux du moteur d'acquisition. Les paramètres liés à une analyse en cours restent dans l'onglet Robot."
    >
      <Row
        label="Temps d'attente entre morceaux"
        hint={`${(settings.robotWaitMs / 1000).toFixed(1)} s — délai avant capture du BPM.`}
        stacked
      >
        <Slider
          value={[settings.robotWaitMs]}
          min={500}
          max={5000}
          step={100}
          onValueChange={(v) => setSetting("robotWaitMs", v[0])}
        />
      </Row>
      <Row label="Notifications du Robot" hint="Recevoir des alertes de progression et d'erreurs.">
        <Switch checked={settings.robotNotifications} onCheckedChange={(v) => setSetting("robotNotifications", v)} />
      </Row>
      <Row label="Reprise automatique" hint="Reprend la file d'attente là où elle s'est arrêtée.">
        <Switch checked={settings.robotAutoResume} onCheckedChange={(v) => setSetting("robotAutoResume", v)} />
      </Row>
      <Row label="Sauvegarde automatique" hint="Enregistre BPM et tonalité dans la bibliothèque après chaque morceau.">
        <Switch checked={settings.robotAutoSave} onCheckedChange={(v) => setSetting("robotAutoSave", v)} />
      </Row>
      <Row label="Comportement après analyse" hint="Que faire une fois toute la file traitée." stacked>
        <Select
          value={settings.robotPostAnalysis}
          onValueChange={(v) => setSetting("robotPostAnalysis", v as typeof settings.robotPostAnalysis)}
        >
          <SelectTrigger className="min-h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stay">Rester sur le Robot</SelectItem>
            <SelectItem value="close">Fermer le Robot</SelectItem>
            <SelectItem value="notify">Notifier et rester</SelectItem>
          </SelectContent>
        </Select>
      </Row>

      <Collapsible title="Options avancées">
        <Row label="OCR strict" hint="Rejette les valeurs de BPM ambiguës (ex. 121 vs 127).">
          <Switch
            checked={settings.robotAdvanced.ocrStrict}
            onCheckedChange={(v) => setSetting("robotAdvanced", { ...settings.robotAdvanced, ocrStrict: v })}
          />
        </Row>
        <Row label="Matching agressif" hint="Tolère les variations orthographiques des titres.">
          <Switch
            checked={settings.robotAdvanced.matchAggressive}
            onCheckedChange={(v) => setSetting("robotAdvanced", { ...settings.robotAdvanced, matchAggressive: v })}
          />
        </Row>
        <Row label="Écran allumé pendant l'analyse" hint="Empêche Android de couper l'écran.">
          <Switch
            checked={settings.robotAdvanced.keepScreenOn}
            onCheckedChange={(v) => setSetting("robotAdvanced", { ...settings.robotAdvanced, keepScreenOn: v })}
          />
        </Row>
      </Collapsible>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Library                                                            */
/* ------------------------------------------------------------------ */

function LibraryCard() {
  const { settings, setSetting } = useSettings();
  return (
    <SectionCard
      icon={LibraryIcon}
      title="Bibliothèque"
      description="Contrôle ce qui est chargé au démarrage et l'affichage des colonnes."
    >
      <Row label="Ouvrir une bibliothèque au démarrage" hint="Affiche l'écran d'accueil ou rouvre directement le dernier projet.">
        <Switch checked={settings.libraryOpenLastAtStartup} onCheckedChange={(v) => setSetting("libraryOpenLastAtStartup", v)} />
      </Row>
      <Row label="Reprise automatique" hint="Rouvre la dernière bibliothèque utilisée.">
        <Switch checked={settings.libraryAutoResume} onCheckedChange={(v) => setSetting("libraryAutoResume", v)} />
      </Row>
      <Row label="Afficher les BPM" hint="Colonne BPM dans la liste des morceaux.">
        <Switch checked={settings.libraryShowBpm} onCheckedChange={(v) => setSetting("libraryShowBpm", v)} />
      </Row>
      <Row label="Afficher les tonalités" hint="Colonne tonalité (Camelot / Key).">
        <Switch checked={settings.libraryShowKey} onCheckedChange={(v) => setSetting("libraryShowKey", v)} />
      </Row>
      <Row label="Afficher les doublons" hint="Badge sur les morceaux détectés comme doublons.">
        <Switch checked={settings.libraryShowDuplicates} onCheckedChange={(v) => setSetting("libraryShowDuplicates", v)} />
      </Row>
      <Row label="Format d'affichage des morceaux" stacked hint="Ordre du titre et de l'artiste.">
        <Select
          value={settings.libraryTrackFormat}
          onValueChange={(v) => setSetting("libraryTrackFormat", v as TrackDisplayFormat)}
        >
          <SelectTrigger className="min-h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="artist-title">Artiste — Titre</SelectItem>
            <SelectItem value="title-artist">Titre — Artiste</SelectItem>
            <SelectItem value="filename">Nom de fichier</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Player                                                             */
/* ------------------------------------------------------------------ */

function PlayerCard() {
  const { settings, setSetting } = useSettings();
  return (
    <SectionCard
      icon={PlayCircle}
      title="Lecteur audio"
      description="Comportement du lecteur intégré et du mini-lecteur flottant."
    >
      <Row label="Lecture automatique" hint="Démarre immédiatement lors du clic sur un morceau.">
        <Switch checked={settings.playerAutoplay} onCheckedChange={(v) => setSetting("playerAutoplay", v)} />
      </Row>
      <Row label="Volume de départ" hint={`${settings.playerStartVolume}% au chargement de l'app.`} stacked>
        <Slider
          value={[settings.playerStartVolume]}
          min={0}
          max={100}
          step={5}
          onValueChange={(v) => setSetting("playerStartVolume", v[0])}
        />
      </Row>
      <Row label="Mémoriser la position de lecture" hint="Reprend chaque morceau là où il s'est arrêté.">
        <Switch checked={settings.playerRememberPosition} onCheckedChange={(v) => setSetting("playerRememberPosition", v)} />
      </Row>
      <Row label="Afficher le mini-lecteur" hint="Barre flottante au-dessus de la navigation.">
        <Switch checked={settings.playerShowMini} onCheckedChange={(v) => setSetting("playerShowMini", v)} />
      </Row>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Rename                                                             */
/* ------------------------------------------------------------------ */

function RenameCard() {
  const { settings, setSetting } = useSettings();
  return (
    <SectionCard
      icon={Pencil}
      title="Renommage"
      description="Modèle par défaut, nettoyage et historique."
    >
      <Row label="Nettoyage automatique des préfixes" hint="Supprime les préfixes tels que « (Clean) », « [Radio Edit] » avant renommage.">
        <Switch checked={settings.renameAutoCleanPrefix} onCheckedChange={(v) => setSetting("renameAutoCleanPrefix", v)} />
      </Row>
      <Row label="Modèle de renommage préféré" stacked hint="Structure appliquée par défaut aux nouveaux batches.">
        <Select
          value={settings.renameTemplate}
          onValueChange={(v) => setSetting("renameTemplate", v as RenameTemplate)}
        >
          <SelectTrigger className="min-h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="artist-title">Artiste - Titre</SelectItem>
            <SelectItem value="artist-title-key-bpm">Artiste - Titre [Key BPM]</SelectItem>
            <SelectItem value="artist-title-bpm">Artiste - Titre (BPM)</SelectItem>
            <SelectItem value="custom">Personnalisé</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Historique des renommages" hint="Conserve chaque batch pour permettre l'annulation.">
        <Switch checked={settings.renameKeepHistory} onCheckedChange={(v) => setSetting("renameKeepHistory", v)} />
      </Row>
      <Row label="Durée de conservation" stacked hint="Au-delà, les batches sont supprimés automatiquement.">
        <Select
          value={settings.renameHistoryRetention}
          onValueChange={(v) => setSetting("renameHistoryRetention", v as HistoryRetention)}
        >
          <SelectTrigger className="min-h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 jours</SelectItem>
            <SelectItem value="30d">30 jours</SelectItem>
            <SelectItem value="90d">90 jours</SelectItem>
            <SelectItem value="forever">Toujours conserver</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Notifications                                                      */
/* ------------------------------------------------------------------ */

function NotificationsCard() {
  const { settings, setSetting } = useSettings();
  const items: { key: keyof typeof settings; label: string; hint: string }[] = [
    { key: "notifRobotProgress", label: "Progression du Robot", hint: "Alertes pas-à-pas pendant l'analyse." },
    { key: "notifAnalysisDone", label: "Analyse terminée", hint: "Signalée à la fin du batch." },
    { key: "notifErrors", label: "Erreurs", hint: "Fichier introuvable, échec OCR, etc." },
    { key: "notifRenameDone", label: "Renommage terminé", hint: "Confirmation après application d'un batch." },
    { key: "notifImportDone", label: "Import terminé", hint: "Après ajout de nouveaux morceaux." },
  ];
  return (
    <SectionCard
      icon={Bell}
      title="Notifications"
      description="Toutes les notifications utilisent le même style graphique premium."
    >
      {items.map((it) => (
        <Row key={it.key} label={it.label} hint={it.hint}>
          <Switch
            checked={settings[it.key] as boolean}
            onCheckedChange={(v) => setSetting(it.key, v as never)}
          />
        </Row>
      ))}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

function StorageCard() {
  const { project } = useWorkspace();
  const { sets } = useSetBuilder();
  const { clearCache, resetTemporaryData } = useSettings();
  const [usage, setUsage] = useState({ bytes: 0, keys: 0 });

  const refresh = () => setUsage(computeStorageUsage());
  useEffect(() => { refresh(); }, []);

  const totalTracks = project?.tracks.length ?? 0;
  const libraries = project ? 1 : 0;

  const stats = [
    { label: "Bibliothèques", value: libraries },
    { label: "Morceaux", value: totalTracks },
    { label: "Espace MixOrder", value: formatBytes(usage.bytes) },
    { label: "Clés stockées", value: usage.keys },
    { label: "Sets enregistrés", value: sets.length },
  ];

  return (
    <SectionCard
      icon={HardDrive}
      title="Stockage"
      description="MixOrder ne touche jamais à vos fichiers audio — seules les métadonnées sont enregistrées."
    >
      <div className="grid grid-cols-2 gap-2 py-2 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface-elevated p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
            <div className="mt-1 font-display text-lg font-semibold text-foreground">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          className="min-h-11 flex-1 gap-2"
          onClick={() => {
            clearCache();
            refresh();
            toast.success("Cache nettoyé");
          }}
        >
          <Trash2 className="h-4 w-4" />
          Nettoyer le cache
        </Button>
        <Button
          variant="outline"
          className="min-h-11 flex-1 gap-2"
          onClick={() => {
            resetTemporaryData();
            refresh();
            toast.success("Données temporaires réinitialisées");
          }}
        >
          <RotateCcw className="h-4 w-4" />
          Réinitialiser les temporaires
        </Button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-success" />
        Aucune action de cette section ne supprime vos fichiers audio.
      </p>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  About                                                              */
/* ------------------------------------------------------------------ */

function AboutCard() {
  const buildDate = useMemo(() => new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long" }), []);
  return (
    <SectionCard icon={Info} title="À propos" description="Informations sur cette version de MixOrder.">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface-elevated via-surface to-surface p-5">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/15 shadow-glow">
            <Logo className="h-9 w-9" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-xl font-bold text-foreground">MixOrder</div>
            <div className="text-xs text-muted-foreground">L'assistant DJ premium — analyse, tonalités, sets harmoniques.</div>
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              <Sparkles className="h-3 w-3" />
              Version {APP_VERSION}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-surface-elevated p-4">
        <div className="text-[11px] uppercase tracking-widest text-primary/80">Développé par</div>
        <div className="mt-1 font-display text-lg font-semibold text-foreground">DJ LAMBO Premier</div>
        <a
          href="mailto:djlambopremierofficiel@gmail.com"
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40"
        >
          <Mail className="h-3.5 w-3.5 text-primary" />
          djlambopremierofficiel@gmail.com
        </a>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border bg-surface-elevated p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Version</div>
          <div className="mt-1 font-display text-sm font-semibold text-foreground">{APP_VERSION}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-elevated p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Licence</div>
          <div className="mt-1 font-display text-sm font-semibold text-foreground">Propriétaire</div>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">Build {buildDate} · © DJ LAMBO Premier</p>
    </SectionCard>
  );
}