import { useCallback, useRef } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  Volume2,
  VolumeX,
  Music2,
} from "lucide-react";
import { formatTime, usePlayer } from "@/lib/player/player-context";
import { formatDuration } from "@/lib/workspace-context";

/**
 * MiniPlayer — the ONE player UI mounted globally at the bottom of the
 * Workspace. Visible whenever a track is loaded (playing or paused).
 *
 * Shows: title, BPM, Camelot/key, format, size, progress bar with
 * scrubbing, transport controls (previous / play-pause / next), volume,
 * and a close button that fully unloads the audio element.
 */
export interface MiniPlayerProps {
  /** Pixels to lift the player above the viewport bottom (e.g. BottomNav height). */
  bottomOffset?: number;
}

export function MiniPlayer({ bottomOffset = 0 }: MiniPlayerProps = {}) {
  const {
    currentTrack,
    trackId,
    isPlaying,
    position,
    duration,
    volume,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    stop,
  } = usePlayer();

  const barRef = useRef<HTMLDivElement | null>(null);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const el = barRef.current;
      if (!el || !duration) return;
      const rect = el.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      seek(pct * duration);
    },
    [duration, seek],
  );

  if (!currentTrack || !trackId) return null;

  const pct = duration ? (position / duration) * 100 : 0;
  const t = currentTrack;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      role="region"
      aria-label="Lecteur audio"
    >
      {/* Progress bar — full width, generous touch target */}
      <div
        ref={barRef}
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          seekFromEvent(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 0) return;
          seekFromEvent(e.clientX);
        }}
        className="group relative h-2 cursor-pointer touch-none bg-accent/20"
      >
        <div
          className="h-full bg-gradient-gold transition-[width] duration-75"
          style={{ width: `${pct}%` }}
        />
        <div
          className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow-gold transition-opacity group-hover:opacity-100"
          style={{ left: `${pct}%` }}
        />
      </div>

      <div className="mx-auto flex max-w-xl items-center gap-2 px-3 py-2.5">
        {/* Artwork placeholder */}
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary/25 to-accent/40 text-primary">
          <Music2 className="h-5 w-5" />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight">
            {t.name}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[10px] text-muted-foreground">
            <span className="tabular-nums">
              {formatTime(position)} / {formatDuration(duration || t.durationSec) || "—:—"}
            </span>
            {t.bpm != null && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{Math.round(t.bpm)} BPM</span>
              </>
            )}
            {t.camelot && (
              <>
                <span aria-hidden>·</span>
                <span>{t.camelot}</span>
              </>
            )}
            {!t.camelot && t.musicalKey && (
              <>
                <span aria-hidden>·</span>
                <span>{t.musicalKey}</span>
              </>
            )}
            {t.extension && (
              <>
                <span aria-hidden>·</span>
                <span className="uppercase">.{t.extension}</span>
              </>
            )}
            {t.size > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{(t.size / (1024 * 1024)).toFixed(1)} MB</span>
              </>
            )}
          </div>
        </div>

        {/* Transport */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={previous}
            aria-label="Précédent"
            className="grid h-10 w-10 place-items-center rounded-full text-foreground/80 hover:bg-accent/20 hover:text-foreground"
          >
            <SkipBack className="h-4 w-4" strokeWidth={2.4} />
          </button>
          <button
            onClick={() => toggle()}
            aria-label={isPlaying ? "Pause" : "Lecture"}
            className="grid h-11 w-11 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-gold active:scale-95"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" strokeWidth={2.5} />
            ) : (
              <Play className="h-5 w-5 translate-x-[1px]" strokeWidth={2.5} />
            )}
          </button>
          <button
            onClick={next}
            aria-label="Suivant"
            className="grid h-10 w-10 place-items-center rounded-full text-foreground/80 hover:bg-accent/20 hover:text-foreground"
          >
            <SkipForward className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </div>

        {/* Volume + close */}
        <div className="hidden items-center gap-1 sm:flex">
          <button
            onClick={() => setVolume(volume > 0 ? 0 : 1)}
            aria-label={volume > 0 ? "Muet" : "Rétablir le son"}
            className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:text-foreground"
          >
            {volume > 0 ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Volume"
            className="h-1 w-16 accent-primary"
          />
        </div>

        <button
          onClick={stop}
          aria-label="Fermer le lecteur"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent/20 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
