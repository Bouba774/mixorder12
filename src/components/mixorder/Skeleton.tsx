import { cn } from "@/lib/utils";

/**
 * Skeleton — placeholder block used during initial loads.
 *
 * Backed by the global `.skeleton` utility (surface color + primary tint
 * sweep). Matches the app's radius and typography rhythm so the loading
 * state never looks like a different app.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

export function TrackRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-8 w-14 rounded-full" />
    </div>
  );
}

export function TrackListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-fade-in space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ animationDelay: `${i * 40}ms` }} className="animate-list-enter">
          <TrackRowSkeleton />
        </div>
      ))}
    </div>
  );
}