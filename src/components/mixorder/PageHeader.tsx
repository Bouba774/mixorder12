import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * PageHeader — the single, non-transparent header card mounted at the top of
 * every workspace tab. Replaces the former sticky app-bar. Content scrolls
 * naturally beneath it; there is no fixed positioning and no backdrop blur.
 *
 * The visual language matches the premium Design System: solid surface,
 * generous 8px-grid spacing, gold accent for the icon, clear hierarchy
 * (title → subtitle → actions).
 */
export interface PageHeaderProps {
  icon?: LucideIcon;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
  children,
}: PageHeaderProps) {
  return (
    <section
      aria-label={title}
      className="mb-4 rounded-2xl border border-border bg-surface p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="font-display text-[10px] font-semibold uppercase tracking-widest text-primary/80">
              {eyebrow}
            </div>
          )}
          <h1 className="font-display text-lg font-semibold leading-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>

      {meta && (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-muted-foreground">
          {meta}
        </div>
      )}

      {actions && (
        <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>
      )}

      {children}
    </section>
  );
}

export interface HeaderStatProps {
  label: string;
  value: ReactNode;
}

/** Small pill used inside PageHeader `meta` to display a quick stat. */
export function HeaderStat({ label, value }: HeaderStatProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-2.5 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}
