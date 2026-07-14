/**
 * Krumhansl-Schmuckler and Temperley key profiles.
 *
 * These are the industry-standard weight vectors used by academic and
 * open-source key finders (including the underlying algorithms of
 * Essentia's `KeyExtractor` and LibKeyFinder). We rotate each 12-vector
 * to produce 24 candidate profiles (12 major + 12 minor) and correlate
 * with the chroma vector to find the best match.
 */

export const PITCH_NAMES_SHARP = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

/**
 * Prefer flat spellings for minor keys where DJs conventionally use flats
 * (e.g. Bbm vs A#m), so Camelot conversion is unambiguous.
 */
const PITCH_NAMES_MINOR = [
  "C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B",
];

export function noteName(pcIndex: number, minor: boolean): string {
  const idx = ((pcIndex % 12) + 12) % 12;
  const root = minor ? PITCH_NAMES_MINOR[idx] : PITCH_NAMES_SHARP[idx];
  return minor ? `${root}m` : root;
}

// Krumhansl-Schmuckler (1990) — probe-tone experiments.
export const KRUMHANSL_MAJOR = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
export const KRUMHANSL_MINOR = [
  6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

// Temperley (2007, Kostka-Payne corpus) — better on real corpus statistics.
export const TEMPERLEY_MAJOR = [
  5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0,
];
export const TEMPERLEY_MINOR = [
  5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0,
];

/** Pearson correlation between two equal-length vectors. */
export function pearson(a: number[] | Float32Array, b: number[] | Float32Array): number {
  const n = a.length;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : 0;
}

export interface KeyCandidate {
  key: string;
  score: number;
  pcIndex: number;
  minor: boolean;
}

/**
 * Correlate a 12-D chroma vector against the 24 rotations of the given
 * (major, minor) profile pair. Returns the best key and its runner-up
 * (used for confidence estimation).
 */
export function correlateProfiles(
  chroma: Float32Array,
  majorProfile: number[],
  minorProfile: number[],
): { best: KeyCandidate; second: KeyCandidate; all: KeyCandidate[] } {
  const candidates: KeyCandidate[] = [];
  const rotated = new Float32Array(12);
  for (let pc = 0; pc < 12; pc++) {
    for (let i = 0; i < 12; i++) rotated[i] = chroma[(i + pc) % 12];
    const maj = pearson(rotated, majorProfile);
    const min = pearson(rotated, minorProfile);
    candidates.push({ key: noteName(pc, false), score: maj, pcIndex: pc, minor: false });
    candidates.push({ key: noteName(pc, true), score: min, pcIndex: pc, minor: true });
  }
  candidates.sort((a, b) => b.score - a.score);
  return { best: candidates[0], second: candidates[1], all: candidates };
}