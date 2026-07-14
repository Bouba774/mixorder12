/**
 * MixOrder audio player — single source of truth.
 *
 * The player is a singleton React context that owns exactly ONE
 * `HTMLAudioElement` for the whole app. Every tab (Library, Analysis,
 * Duplicates, Rename, future Set Builder) uses the same instance, so
 * navigating between tabs never restarts playback and never spawns a
 * second player.
 *
 * The queue follows the current `LibraryView` (sort + filter + search) —
 * "next / previous" respects whatever order the user has active on the
 * Library tab.
 *
 * Persistence: on every state change we save `{ trackId, position, isPlaying }`
 * under the project fingerprint. On mount we restore the position, but never
 * autoplay (browsers require a user gesture).
 *
 * We deliberately keep the API small (`play`, `pause`, `toggle`, `seek`,
 * `next`, `previous`, `restart`, `stop`, `setVolume`) — this is a preview
 * player, not a full media library. All UI (row buttons, mini player) is
 * built on top of these primitives.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLibraryView } from "@/lib/library/view-context";
import { useSetBuilder } from "@/lib/setbuilder/context";
import { useWorkspace, type Track } from "@/lib/workspace-context";
import { projectFingerprint } from "@/lib/analysis/persistence";

interface PlayerState {
  trackId: string | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
}

interface PlayerContextValue extends PlayerState {
  currentTrack: Track | null;
  play: (trackId?: string) => void;
  pause: () => void;
  toggle: (trackId?: string) => void;
  stop: () => void;
  restart: () => void;
  next: () => void;
  previous: () => void;
  seek: (position: number) => void;
  setVolume: (v: number) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

const STATE_PREFIX = "mixorder:player:";

interface PersistedPlayer {
  v: 1;
  trackPath: string | null;
  position: number;
  wasPlaying: boolean;
  volume: number;
}

function loadPersisted(fp: string | null): PersistedPlayer | null {
  if (!fp || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STATE_PREFIX + fp);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPlayer;
    if (parsed?.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersisted(fp: string | null, data: PersistedPlayer) {
  if (!fp || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATE_PREFIX + fp, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { project } = useWorkspace();
  const { applyView } = useLibraryView();
  const { activeOrderedIds } = useSetBuilder();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (audioRef.current === null && typeof window !== "undefined") {
    const el = new Audio();
    el.preload = "metadata";
    audioRef.current = el;
  }

  const [state, setState] = useState<PlayerState>({
    trackId: null,
    isPlaying: false,
    position: 0,
    duration: 0,
    volume: 1,
  });

  const fingerprint = useMemo(
    () => (project ? projectFingerprint(project) : null),
    [project],
  );

  const trackById = useMemo(() => {
    const m = new Map<string, Track>();
    if (project) for (const t of project.tracks) m.set(t.id, t);
    return m;
  }, [project]);

  const currentTrack = state.trackId ? trackById.get(state.trackId) ?? null : null;

  /* ─── audio element event wiring ─── */
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setState((s) => ({ ...s, position: el.currentTime }));
    const onDur = () =>
      setState((s) => ({ ...s, duration: isFinite(el.duration) ? el.duration : 0 }));
    const onPlay = () => setState((s) => ({ ...s, isPlaying: true }));
    const onPause = () => setState((s) => ({ ...s, isPlaying: false }));
    const onEnded = () => {
      // Advance automatically to the next track in the current view.
      setState((s) => ({ ...s, isPlaying: false }));
      // Slight defer to let React commit before we mutate the audio element again.
      queueMicrotask(() => nextRef.current?.());
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("durationchange", onDur);
    el.addEventListener("loadedmetadata", onDur);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("durationchange", onDur);
      el.removeEventListener("loadedmetadata", onDur);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, []);

  /* ─── restore persisted state whenever a project mounts ─── */
  useEffect(() => {
    if (!project || !fingerprint) return;
    const data = loadPersisted(fingerprint);
    if (!data) return;
    // Match by `path` (stable across imports) not id (regenerated).
    const t = data.trackPath
      ? project.tracks.find((x) => x.path === data.trackPath)
      : null;
    if (!t) return;
    const el = audioRef.current;
    if (!el) return;
    el.src = t.url;
    el.volume = data.volume;
    // Wait for metadata before seeking to avoid a `readyState` warning.
    const seekOnce = () => {
      try {
        el.currentTime = Math.min(data.position, el.duration || data.position);
      } catch {
        /* ignore — some codecs reject seek before ready */
      }
      el.removeEventListener("loadedmetadata", seekOnce);
    };
    el.addEventListener("loadedmetadata", seekOnce);
    setState({
      trackId: t.id,
      isPlaying: false, // never autoplay — user gesture required
      position: data.position,
      duration: 0,
      volume: data.volume,
    });
  }, [fingerprint, project?.tracks.length]);

  /* ─── persist state ─── */
  useEffect(() => {
    if (!fingerprint) return;
    const t = state.trackId ? trackById.get(state.trackId) : null;
    savePersisted(fingerprint, {
      v: 1,
      trackPath: t?.path ?? null,
      position: state.position,
      wasPlaying: state.isPlaying,
      volume: state.volume,
    });
  }, [fingerprint, state, trackById]);

  /* ─── actions ─── */
  const play = useCallback<PlayerContextValue["play"]>(
    (trackId) => {
      const el = audioRef.current;
      if (!el) return;
      const targetId = trackId ?? state.trackId;
      if (!targetId) return;
      const t = trackById.get(targetId);
      if (!t) return;
      const alreadyLoaded =
        state.trackId === targetId && el.src && !el.error;
      if (!alreadyLoaded) {
        el.src = t.url;
        el.currentTime = 0;
      }
      el.volume = state.volume;
      void el.play().catch(() => {
        /* autoplay blocked / no gesture — silent, state stays paused */
      });
      setState((s) => ({ ...s, trackId: targetId }));
    },
    [state.trackId, state.volume, trackById],
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback<PlayerContextValue["toggle"]>(
    (trackId) => {
      const el = audioRef.current;
      if (!el) return;
      const target = trackId ?? state.trackId;
      if (trackId && trackId !== state.trackId) {
        play(trackId);
        return;
      }
      if (!target) return;
      if (el.paused) play(target);
      else el.pause();
    },
    [play, state.trackId],
  );

  const seek = useCallback((position: number) => {
    const el = audioRef.current;
    if (!el) return;
    try {
      el.currentTime = Math.max(0, position);
      setState((s) => ({ ...s, position: el.currentTime }));
    } catch {
      /* seek before ready */
    }
  }, []);

  const restart = useCallback(() => {
    seek(0);
  }, [seek]);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    try {
      el.currentTime = 0;
    } catch { /* ignore */ }
    el.removeAttribute("src");
    el.load();
    setState((s) => ({ ...s, trackId: null, isPlaying: false, position: 0, duration: 0 }));
  }, []);

  const setVolume = useCallback((v: number) => {
    const el = audioRef.current;
    const clamped = Math.max(0, Math.min(1, v));
    if (el) el.volume = clamped;
    setState((s) => ({ ...s, volume: clamped }));
  }, []);

  /* ─── queue navigation follows LibraryView ─── */
  const nextRef = useRef<() => void>(() => {});
  const previousRef = useRef<() => void>(() => {});

  const orderedIds = useMemo(() => {
    if (!project) return [] as string[];
    // When an active Set contains the current track, its order takes priority
    // over the library view — the player follows the Set Builder queue.
    if (
      activeOrderedIds.length &&
      state.trackId &&
      activeOrderedIds.includes(state.trackId)
    ) {
      return activeOrderedIds;
    }
    return applyView(project.tracks).map((t) => t.id);
  }, [project, applyView, activeOrderedIds, state.trackId]);

  const next = useCallback(() => {
    if (!state.trackId) {
      if (orderedIds[0]) play(orderedIds[0]);
      return;
    }
    const i = orderedIds.indexOf(state.trackId);
    // If current track isn't in the visible view, fall through to the first.
    const nextId = i < 0 ? orderedIds[0] : orderedIds[i + 1];
    if (nextId) play(nextId);
  }, [orderedIds, play, state.trackId]);

  const previous = useCallback(() => {
    if (!state.trackId) return;
    // Match common player behaviour: if we're > 3s in, restart instead of prev.
    if (state.position > 3) {
      seek(0);
      return;
    }
    const i = orderedIds.indexOf(state.trackId);
    const prevId = i > 0 ? orderedIds[i - 1] : orderedIds[0];
    if (prevId) play(prevId);
  }, [orderedIds, play, seek, state.position, state.trackId]);

  nextRef.current = next;
  previousRef.current = previous;

  const value = useMemo<PlayerContextValue>(
    () => ({
      ...state,
      currentTrack,
      play,
      pause,
      toggle,
      stop,
      restart,
      next,
      previous,
      seek,
      setVolume,
    }),
    [state, currentTrack, play, pause, toggle, stop, restart, next, previous, seek, setVolume],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within a PlayerProvider");
  return ctx;
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
