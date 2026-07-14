import type { LucideIcon } from "lucide-react";

/**
 * BottomNav — fixed bottom navigation, Android-premium style.
 *
 * Replaces the former sticky top app-bar. All tabs are reachable from a
 * single horizontal row; icons + labels are stacked so touch targets stay
 * generous (min-height 56px + safe-area). The nav is solid (no
 * transparency): content never scrolls behind it because Workspace reserves
 * matching padding.
 */
export interface BottomNavItem<TId extends string> {
  id: TId;
  label: string;
  icon: LucideIcon;
}

export interface BottomNavProps<TId extends string> {
  items: ReadonlyArray<BottomNavItem<TId>>;
  active: TId;
  onSelect: (id: TId) => void;
  offsetBottom?: number;
}

export function BottomNav<TId extends string>({
  items,
  active,
  onSelect,
  offsetBottom = 0,
}: BottomNavProps<TId>) {
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 z-50 border-t border-border bg-surface"
      style={{
        bottom: offsetBottom,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="scrollbar-none flex gap-1 overflow-x-auto px-2 py-1.5">
        {items.map(({ id, label, icon: Icon }) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={isActive ? "page" : undefined}
              className={`group flex min-w-[68px] flex-1 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className={`grid h-8 w-12 place-items-center rounded-full transition-colors ${
                  isActive ? "bg-primary/15" : "bg-transparent"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span
                className={`text-[10px] font-medium leading-tight ${
                  isActive ? "font-semibold" : ""
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
