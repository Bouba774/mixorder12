import { useEffect, useRef, useState } from "react";
import { FolderOpen, Sparkles, Zap, Shield, Loader2, Clock, X } from "lucide-react";
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
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "var(--gradient-radial-gold)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in oklab, var(--primary) 50%, transparent), transparent)",
        }}
      />

      <header className="flex items-center justify-between px-6 pt-8">
        <div className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="font-display text-sm font-semibold tracking-wide">MixOrder</span>
        </div>
        <span className="rounded-full border border-border-strong px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          v0.1
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="animate-fade-up" style={{ animationDelay: "40ms" }}>
          <Logo size={112} glow />
        </div>

        <h1
          className="animate-fade-up mt-8 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl"
          style={{ animationDelay: "120ms" }}
        >
          Ton studio,
          <br />
          <span className="text-gradient-gold">dans ta poche.</span>
        </h1>

        <p
          className="animate-fade-up mt-4 max-w-sm text-balance text-sm text-muted-foreground sm:text-base"
          style={{ animationDelay: "200ms" }}
        >
          Ouvre un dossier de tracks et transforme-le en espace de travail DJ.
          Local. Rapide. Sans compromis.
        </p>

        <div
          className="animate-fade-up mt-10 flex w-full max-w-xs flex-col gap-3"
          style={{ animationDelay: "280ms" }}
        >
          <button
            onClick={handlePick}
            disabled={picking}
            className="group relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-gold px-6 text-sm font-semibold text-primary-foreground shadow-gold transition-transform active:scale-[0.98] disabled:opacity-70"
          >
            {picking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="h-4 w-4" />
            )}
            {native ? "Importer mes tracks" : "Ouvrir un dossier"}
          </button>

          {!native && (
            <input
              ref={inputRef}
              type="file"
              multiple
              // @ts-expect-error non-standard but widely supported
              webkitdirectory=""
              directory=""
              accept="audio/*"
              className="hidden"
              onChange={(e) => e.target.files && openProject(e.target.files)}
            />
          )}

          <p className="text-[11px] text-muted-foreground/70">
            {native
              ? "Astuce : dans le sélecteur, appuie longuement sur un fichier puis « Tout sélectionner » pour importer tout le dossier."
              : "Tes fichiers restent sur ton appareil."}
          </p>
          {error && (
            <p className="text-[11px] text-destructive">{error}</p>
          )}
        </div>

        <div
          className="animate-fade-up mt-14 grid w-full max-w-md grid-cols-3 gap-3"
          style={{ animationDelay: "360ms" }}
        >
          {[
            { icon: Zap, label: "Instantané" },
            { icon: Shield, label: "100% local" },
            { icon: Sparkles, label: "Pensé DJ" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="glass flex flex-col items-center gap-2 rounded-xl px-2 py-4"
            >
              <Icon className="h-4 w-4 text-primary" />
              <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>

        {recentLibraries.length > 0 && (
          <div
            className="animate-fade-up mt-10 w-full max-w-md text-left"
            style={{ animationDelay: "440ms" }}
          >
            <div className="mb-2 flex items-center gap-2 px-1">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="font-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Bibliothèques récentes
              </h2>
            </div>
            <ul className="space-y-2">
              {recentLibraries.map((r) => (
                <li
                  key={r.fingerprint}
                  className="glass flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5"
                >
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/40 text-primary">
                    <FolderOpen className="h-4 w-4" />
                  </div>
                  <button
                    onClick={handlePick}
                    className="min-w-0 flex-1 text-left"
                    title="Ré-importer ce dossier pour restaurer BPM, tonalités, favoris et renommages"
                  >
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.trackCount} pistes · {new Date(r.lastOpenedAt).toLocaleDateString()}
                    </p>
                  </button>
                  <button
                    onClick={() => forgetLibrary(r.fingerprint)}
                    aria-label="Oublier"
                    className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground/60 hover:bg-surface-elevated hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 px-1 text-[10px] text-muted-foreground/70">
              Ré-importe le même dossier : BPM, tonalités, favoris et renommages sont
              restaurés automatiquement.
            </p>
          </div>
        )}
      </main>

      <footer className="px-6 pb-6 pt-8 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
        Crafted for DJs
      </footer>
    </div>
  );
}
