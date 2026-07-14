import { Play, Pause } from "lucide-react";
import { usePlayer } from "@/lib/player/player-context";

/**
 * Row-level Play / Pause button. Shows Pause when the row's track is the
 * one currently playing, Play otherwise. Tapping toggles the SAME shared
 * audio element — no per-row `<audio>` tags, no duplicate playback.
 */
export function PlayPauseButton({
  trackId,
  size = "sm",
  className = "",
}: {
  trackId: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { trackId: currentId, isPlaying, toggle } = usePlayer();
  const isCurrent = currentId === trackId;
  const showPause = isCurrent && isPlaying;
  const dim = size === "md" ? "h-10 w-10" : "h-8 w-8";
  const icon = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggle(trackId);
      }}
      aria-label={showPause ? "Pause" : "Lecture"}
      className={`grid ${dim} shrink-0 place-items-center rounded-full transition-colors ${
        isCurrent
          ? "bg-gradient-gold text-primary-foreground shadow-gold"
          : "bg-primary/15 text-primary hover:bg-primary/25"
      } ${className}`}
    >
      {showPause ? (
        <Pause className={icon} strokeWidth={2.5} />
      ) : (
        <Play className={`${icon} translate-x-[1px]`} strokeWidth={2.5} />
      )}
    </button>
  );
}
