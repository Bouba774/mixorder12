/**
 * Camelot transition scoring — the core of the Harmonic Mix logic.
 *
 * Rules (DJ classical Camelot wheel):
 *   • Same key            → perfect        (100)
 *   • +1 / −1 (same letter, adjacent slot) → energy shift, seamless (95)
 *   • Relative maj/min (same number, A↔B)  → mood switch, seamless (92)
 *   • +7 (dominant / "energy boost")       → strong lift (80)
 *   • +2                  → gentle progression (72)
 *   • +3 / −2             → acceptable, feels short jump (60)
 *   • Diagonal (±1 with letter switch)     → risky but common (55)
 *   • +6 / opposite       → clash, avoid (25)
 *   • Anything else       → 40 baseline
 *
 * BPM difference contributes to the transition too — a perfect key with a
 * 40 BPM gap is still a poor transition. Weights: 65 % key, 35 % BPM.
 *
 * When either track has no key / BPM data we degrade gracefully so the
 * feature keeps working on unanalysed libraries.
 */

export interface TransitionScore {
  score: number; // 0..100 combined
  keyScore: number;
  bpmScore: number;
  grade: "excellent" | "very-good" | "good" | "fair" | "avoid" | "unknown";
  reason: string;
}

function parseCamelot(cam: string | null | undefined): { n: number; letter: "A" | "B" } | null {
  if (!cam) return null;
  const m = /^(\d{1,2})([AB])$/i.exec(cam.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > 12) return null;
  return { n, letter: m[2].toUpperCase() as "A" | "B" };
}

function wheelDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 12;
  return Math.min(d, 12 - d);
}

export function keyTransitionScore(
  fromCam: string | null | undefined,
  toCam: string | null | undefined,
): { score: number; reason: string } {
  const a = parseCamelot(fromCam);
  const b = parseCamelot(toCam);
  if (!a || !b) return { score: 60, reason: "Tonalité inconnue" };

  const dist = wheelDistance(a.n, b.n);
  const sameLetter = a.letter === b.letter;

  if (a.n === b.n && sameLetter) return { score: 100, reason: "Même tonalité" };
  if (a.n === b.n && !sameLetter)
    return { score: 92, reason: "Relative majeure / mineure" };
  if (dist === 1 && sameLetter)
    return { score: 95, reason: `Voisin sur la roue (${a.letter === "B" ? "+1" : "−1"})` };
  if (dist === 7 && sameLetter)
    return { score: 80, reason: "Boost d'énergie (+7)" };
  if (dist === 2 && sameLetter)
    return { score: 72, reason: "Progression douce (+2)" };
  if (dist === 3 && sameLetter)
    return { score: 60, reason: "Saut modéré (+3)" };
  if (dist === 1 && !sameLetter)
    return { score: 55, reason: "Diagonale (±1, changement mode)" };
  if (dist === 6)
    return { score: 25, reason: "Opposition harmonique — à éviter" };
  return { score: 40, reason: `Écart ${dist} sur la roue` };
}

export function bpmTransitionScore(
  fromBpm: number | null | undefined,
  toBpm: number | null | undefined,
): { score: number; reason: string } {
  if (fromBpm == null || toBpm == null)
    return { score: 60, reason: "BPM inconnu" };
  const diff = Math.abs(fromBpm - toBpm);
  if (diff <= 1) return { score: 100, reason: "BPM identique" };
  if (diff <= 3) return { score: 95, reason: `Δ ${diff.toFixed(1)} BPM` };
  if (diff <= 6) return { score: 82, reason: `Δ ${diff.toFixed(1)} BPM` };
  if (diff <= 10) return { score: 68, reason: `Δ ${diff.toFixed(1)} BPM` };
  if (diff <= 16) return { score: 48, reason: `Δ ${diff.toFixed(1)} BPM` };
  return { score: 25, reason: `Écart BPM trop grand (${diff.toFixed(1)})` };
}

export function transitionScore(
  from: { bpm: number | null; camelot: string | null },
  to: { bpm: number | null; camelot: string | null },
): TransitionScore {
  const k = keyTransitionScore(from.camelot, to.camelot);
  const b = bpmTransitionScore(from.bpm, to.bpm);
  const score = Math.round(k.score * 0.65 + b.score * 0.35);
  let grade: TransitionScore["grade"];
  if (from.camelot == null && from.bpm == null) grade = "unknown";
  else if (score >= 90) grade = "excellent";
  else if (score >= 78) grade = "very-good";
  else if (score >= 65) grade = "good";
  else if (score >= 50) grade = "fair";
  else grade = "avoid";
  const reason = `${k.reason} · ${b.reason}`;
  return { score, keyScore: k.score, bpmScore: b.score, grade, reason };
}

export const GRADE_LABEL: Record<TransitionScore["grade"], string> = {
  excellent: "Excellent",
  "very-good": "Très bon",
  good: "Bon",
  fair: "Correct",
  avoid: "À éviter",
  unknown: "Inconnu",
};

export const GRADE_COLOR: Record<TransitionScore["grade"], string> = {
  excellent: "text-emerald-400",
  "very-good": "text-lime-400",
  good: "text-yellow-400",
  fair: "text-orange-400",
  avoid: "text-red-400",
  unknown: "text-muted-foreground",
};
