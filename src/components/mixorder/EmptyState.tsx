import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * EmptyState — the single shared empty surface used across every tab.
 *
 * A hollow gold-ringed icon medallion, a display-font title, a short
 * explanation and up to two calls-to-action. Every screen shows the same
 * visual grammar so the app never looks half-empty or inconsistent.
 */
export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void; icon?: LucideIcon };
  secondaryAction?: { label: string; onClick: () => void };
  children?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  children,
  className,
  compact = false,
}: EmptyStateProps) {
  const ActionIcon = action?.icon;
  return (
    <div
      className={cn(
        "animate-fade-up flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface text-center",
        compact ? "px-4 py-8" : "px-6 py-12",
        className,
      )}
    >
      <div className="relative">
        <div className="absolute inset-0 -m-3 rounded-full bg-primary/10 blur-xl" aria-hidden />
        <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-primary/30 bg-primary/5 text-primary shadow-glow">
          <Icon className="h-7 w-7" strokeWidth={1.5} />
        </div>
      </div>
      <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
      {children}
      {(action || secondaryAction) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action && (
            <Button onClick={action.onClick} size="lg" className="min-h-11 gap-2">
              {ActionIcon && <ActionIcon className="h-4 w-4" />}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button onClick={secondaryAction.onClick} size="lg" variant="ghost" className="min-h-11">
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}