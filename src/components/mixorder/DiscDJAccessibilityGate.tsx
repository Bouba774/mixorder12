import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Accessibility, ShieldCheck, Loader2, ExternalLink, X } from "lucide-react";
import { useDiscDJRobot } from "@/lib/analysis/discdj-robot";

interface Props {
  children: ReactNode;
  /** Called with `true` once accessibility is verified enabled, `false` otherwise. */
  onStatusChange?: (enabled: boolean) => void;
}

/**
 * Wraps the DiscDJ robot UI and guarantees the Android Accessibility
 * service is enabled BEFORE any calibration / start button is reachable.
 *
 * - Instant check on mount + on every window focus / visibility change.
 * - When the service is off, a premium modal blocks interaction with a
 *   single "Activer maintenant" CTA that opens the exact Android settings
 *   page. A background poll (every 900 ms) detects activation and
 *   auto-dismisses the modal — no manual "I'm back" tap required.
 * - When enabled, the wrapped children render normally and the modal
 *   never appears.
 * - If the user disables accessibility from the settings later, the
 *   next focus event re-blocks the UI.
 */
export function DiscDJAccessibilityGate({ children, onStatusChange }: Props) {
  const { checkAccessibility, openAccessibilitySettings } = useDiscDJRobot();
  const [checked, setChecked] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [native, setNative] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notifyRef = useRef(onStatusChange);
  notifyRef.current = onStatusChange;

  const refresh = useCallback(async () => {
    const s = await checkAccessibility();
    setNative(s.native);
    setEnabled(s.enabled);
    setChecked(true);
    notifyRef.current?.(s.enabled || !s.native);
    return s.enabled;
  }, [checkAccessibility]);

  // Initial + focus/visibility re-checks.
  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  // Poll while the modal is showing so activation is picked up without
  // the user tapping anything.
  const blocking = native && !enabled && !dismissed;
  useEffect(() => {
    if (!blocking) return;
    const id = window.setInterval(() => { void refresh(); }, 900);
    return () => window.clearInterval(id);
  }, [blocking, refresh]);

  // Reset "dismissed" if enabled flips (so future disables re-block).
  useEffect(() => {
    if (enabled) setDismissed(false);
  }, [enabled]);

  const handleActivate = useCallback(async () => {
    setError(null);
    setOpening(true);
    try {
      await openAccessibilitySettings();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Impossible d'ouvrir les paramètres d'accessibilité.",
      );
    } finally {
      setOpening(false);
    }
  }, [openAccessibilitySettings]);

  // On web / simulator: never block.
  if (!native || (enabled && checked)) return <>{children}</>;

  return (
    <div className="relative">
      {/* Dimmed children so context is preserved. */}
      <div aria-hidden className="pointer-events-none select-none opacity-40 blur-[1px]">
        {children}
      </div>

      {!dismissed ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 px-4 backdrop-blur-md animate-fade-up">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-primary/40 bg-surface shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
            <div className="relative bg-gradient-to-br from-primary/25 via-primary/10 to-transparent px-5 pt-5 pb-4">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-primary/20 text-primary ring-1 ring-primary/40">
                <Accessibility className="h-6 w-6" />
              </div>
              <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
                Activation requise
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                Le Robot DiscDJ utilise le service d'accessibilité Android pour
                piloter DiscDJ automatiquement (lecture du BPM, ouverture de la
                playlist, clic sur Next, retour, etc.).
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                Avant de continuer, active le service d'accessibilité de
                <span className="font-semibold text-foreground"> MixOrder</span>.
              </p>
            </div>

            <div className="space-y-2 px-5 pb-3">
              <div className="flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Détection automatique en cours — reviens dans MixOrder après l'activation.</span>
              </div>
              {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-border/60 bg-background/40 px-4 py-3">
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-transparent px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-elevated"
              >
                <X className="h-3.5 w-3.5" /> Annuler
              </button>
              <button
                type="button"
                onClick={handleActivate}
                disabled={opening}
                className="inline-flex h-10 flex-[1.6] items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:brightness-110 active:scale-[0.98] disabled:opacity-70"
              >
                {opening ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Activer maintenant
                <ExternalLink className="h-3.5 w-3.5 opacity-80" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="pointer-events-auto sticky top-16 z-40 mx-4 mt-4 flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 shadow-sm animate-fade-up">
          <Accessibility className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-foreground">
              Service d'accessibilité inactif
            </p>
            <p className="text-[10.5px] text-muted-foreground">
              Le Robot DiscDJ ne peut pas démarrer tant qu'il n'est pas activé.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(false)}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground"
          >
            <ShieldCheck className="h-3 w-3" /> Activer
          </button>
        </div>
      )}
    </div>
  );
}
