/**
 * Set generation modes for the Set Builder.
 *
 * Every mode takes the tracks the user selected as candidates and returns
 * an ordering. All modes work purely on the metadata already stored in the
 * library (bpm / musicalKey / camelot / durationSec) — no file access.
 *
 * Modes are declared once in `SET_MODES` so adding a new one is a single
 * entry: id, label, description and `build(tracks) -> ids[]`.
 */

import type { Track } from "@/lib/workspace-context";
import { transitionScore } from "./camelot-graph";

export type SetModeId =
  | "harmonic"
  | "progressive"
  | "energy-build"
  | "energy-down"
  | "hot-cold"
  | "cold-hot"
  | "bpm-asc"
  | "bpm-desc"
  | "key-asc"
  | "key-desc"
  | "manual"
  | "intelligent"
  | "open-format"
  | "peak-time"
  | "warm-up"
  | "closing-set"
  | "random";

export interface SetMode {
  id: SetModeId;
  label: string;
  description: string;
  build: (tracks: Track[]) => string[];
}

/* ───── helpers ───── */

function camelotNumber(cam: string | null): number {
  if (!cam) return 99;
  const m = /^(\d{1,2})([AB])$/i.exec(cam);
  if (!m) return 99;
  return parseInt(m[1], 10);
}
function camelotLetter(cam: string | null): 0 | 1 {
  return cam && cam.endsWith("A") ? 0 : 1;
}

/** Energy proxy: normalised BPM (60-200) + slight major boost. */
export function energyOf(t: Track): number {
  const bpm = t.bpm ?? 100;
  const normalized = Math.max(0, Math.min(1, (bpm - 60) / 140));
  const majorBoost = t.camelot?.endsWith("B") ? 0.08 : 0;
  return normalized + majorBoost;
}

/* ───── generators ───── */

/**
 * Greedy harmonic path: pick the seed (lowest BPM in the candidates so we
 * open on a warm-up), then repeatedly pick the unused track with the best
 * transition score from the previous one.
 */
function buildHarmonic(tracks: Track[]): string[] {
  if (tracks.length <= 1) return tracks.map((t) => t.id);
  const remaining = [...tracks];
  remaining.sort((a, b) => (a.bpm ?? 999) - (b.bpm ?? 999));
  const path: Track[] = [remaining.shift()!];
  while (remaining.length) {
    const last = path[path.length - 1];
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < remaining.length; i++) {
      const s = transitionScore(
        { bpm: last.bpm, camelot: last.camelot },
        { bpm: remaining[i].bpm, camelot: remaining[i].camelot },
      ).score;
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    path.push(remaining.splice(bestIdx, 1)[0]);
  }
  return path.map((t) => t.id);
}

function buildProgressive(tracks: Track[]): string[] {
  // Sort by Camelot number then letter to walk the wheel smoothly.
  const arr = [...tracks].sort((a, b) => {
    const nA = camelotNumber(a.camelot);
    const nB = camelotNumber(b.camelot);
    if (nA !== nB) return nA - nB;
    const lA = camelotLetter(a.camelot);
    const lB = camelotLetter(b.camelot);
    if (lA !== lB) return lA - lB;
    return (a.bpm ?? 0) - (b.bpm ?? 0);
  });
  return arr.map((t) => t.id);
}

function buildEnergy(tracks: Track[], dir: "asc" | "desc"): string[] {
  const arr = [...tracks].sort((a, b) =>
    dir === "asc" ? energyOf(a) - energyOf(b) : energyOf(b) - energyOf(a),
  );
  return arr.map((t) => t.id);
}

/** Peak → wind-down: highest energy first, decays smoothly. */
function buildHotCold(tracks: Track[]): string[] {
  return buildEnergy(tracks, "desc");
}
function buildColdHot(tracks: Track[]): string[] {
  return buildEnergy(tracks, "asc");
}

function buildByBpm(tracks: Track[], dir: "asc" | "desc"): string[] {
  const arr = [...tracks].sort((a, b) => {
    const av = a.bpm ?? (dir === "asc" ? 1e9 : -1);
    const bv = b.bpm ?? (dir === "asc" ? 1e9 : -1);
    return dir === "asc" ? av - bv : bv - av;
  });
  return arr.map((t) => t.id);
}

function buildByKey(tracks: Track[], dir: "asc" | "desc"): string[] {
  const arr = [...tracks].sort((a, b) => {
    const nA = camelotNumber(a.camelot);
    const nB = camelotNumber(b.camelot);
    if (nA !== nB) return dir === "asc" ? nA - nB : nB - nA;
    return camelotLetter(a.camelot) - camelotLetter(b.camelot);
  });
  return arr.map((t) => t.id);
}

/* ───── registry ───── */

export const SET_MODES: SetMode[] = [
  {
    id: "harmonic",
    label: "Harmonic Mix",
    description: "Transitions Camelot classiques, chemin optimal.",
    build: buildHarmonic,
  },
  {
    id: "progressive",
    label: "Progressive",
    description: "Progression harmonique douce autour de la roue.",
    build: buildProgressive,
  },
  {
    id: "energy-build",
    label: "Energy Build",
    description: "L'énergie monte progressivement.",
    build: (t) => buildEnergy(t, "asc"),
  },
  {
    id: "energy-down",
    label: "Energy Down",
    description: "L'énergie descend progressivement.",
    build: (t) => buildEnergy(t, "desc"),
  },
  { id: "hot-cold", label: "Hot → Cold", description: "Commencer fort, finir calme.", build: buildHotCold },
  { id: "cold-hot", label: "Cold → Hot", description: "Monter en intensité.", build: buildColdHot },
  { id: "bpm-asc", label: "BPM croissant", description: "Trie par BPM ascendant.", build: (t) => buildByBpm(t, "asc") },
  { id: "bpm-desc", label: "BPM décroissant", description: "Trie par BPM descendant.", build: (t) => buildByBpm(t, "desc") },
  { id: "key-asc", label: "Tonalité croissante", description: "Trie par Camelot ascendant.", build: (t) => buildByKey(t, "asc") },
  { id: "key-desc", label: "Tonalité décroissante", description: "Trie par Camelot descendant.", build: (t) => buildByKey(t, "desc") },
  {
    id: "manual",
    label: "Ordre personnalisé",
    description: "Ordre libre, à réorganiser manuellement.",
    build: (t) => t.map((x) => x.id),
  },
];

export function getMode(id: SetModeId): SetMode {
  return SET_MODES.find((m) => m.id === id) ?? SET_MODES[0];
}
