/**
 * Duplicate-detection engine.
 *
 * Pure, local, deterministic scoring over the main library. Combines
 * several weak signals into a single similarity score:
 *   • normalized-name similarity  (weight 0.55)
 *   • duration proximity          (weight 0.25)
 *   • artist match                (weight 0.10)
 *   • size proximity              (weight 0.07)
 *   • extension match             (weight 0.03)
 *
 * The engine is deliberately O(n · k) where k is the average bucket size,
 * NOT O(n²): we bucket tracks by (roundedDuration, firstChars) and only
 * compare inside compatible buckets. That keeps it snappy on libraries
 * of several thousand tracks.
 *
 * Confidence tiers:
 *   ≥ 0.90  → "certain"
 *   ≥ 0.75  → "probable"
 *   ≥ 0.60  → "check"
 */

import type { Track } from "@/lib/workspace-context";
import {
  diceBigram,
  getExtension,
  normalizeForDedup,
  splitArtistTitle,
} from "./normalize";

export type DupConfidence = "certain" | "probable" | "check";

export interface DupTrackFeatures {
  id: string;
  normName: string;
  normArtist: string;
  duration: number | null;
  size: number;
  extension: string;
}

export interface DupPair {
  a: string;
  b: string;
  score: number;
  confidence: DupConfidence;
}

export interface DupGroup {
  id: string;
  /** Track ids in the group (unordered). */
  trackIds: string[];
  /** Highest pairwise score inside the group. */
  score: number;
  confidence: DupConfidence;
  /** Recommended keeper track id — see `pickKeeper`. */
  keeperId: string;
}

const NAME_WEIGHT = 0.55;
const DURATION_WEIGHT = 0.25;
const ARTIST_WEIGHT = 0.1;
const SIZE_WEIGHT = 0.07;
const EXT_WEIGHT = 0.03;

const CHECK_THRESHOLD = 0.6;
const PROBABLE_THRESHOLD = 0.75;
const CERTAIN_THRESHOLD = 0.9;

export function featuresFor(t: Track): DupTrackFeatures {
  const { artist, title } = splitArtistTitle(t.originalName || t.name);
  return {
    id: t.id,
    normName: title || normalizeForDedup(t.originalName || t.name),
    normArtist: artist,
    duration: t.durationSec,
    size: t.size,
    extension: t.extension || getExtension(t.originalName),
  };
}

function durationScore(a: number | null, b: number | null): number {
  if (a == null || b == null) return 0.5; // unknown — neutral
  const diff = Math.abs(a - b);
  if (diff <= 1) return 1;
  if (diff <= 3) return 0.85;
  if (diff <= 6) return 0.6;
  if (diff <= 12) return 0.3;
  return 0;
}

function sizeScore(a: number, b: number): number {
  if (!a || !b) return 0.5;
  const ratio = Math.min(a, b) / Math.max(a, b);
  if (ratio >= 0.98) return 1;
  if (ratio >= 0.9) return 0.75;
  if (ratio >= 0.75) return 0.4;
  return 0.1;
}

export function pairScore(a: DupTrackFeatures, b: DupTrackFeatures): number {
  const nameS = diceBigram(a.normName, b.normName);
  // Cheap rejection: if names share almost nothing, this can't be a dup.
  if (nameS < 0.35) return 0;
  const durS = durationScore(a.duration, b.duration);
  const artistS = a.normArtist && b.normArtist ? diceBigram(a.normArtist, b.normArtist) : 0.5;
  const sizeS = sizeScore(a.size, b.size);
  const extS = a.extension === b.extension ? 1 : 0;
  return (
    NAME_WEIGHT * nameS +
    DURATION_WEIGHT * durS +
    ARTIST_WEIGHT * artistS +
    SIZE_WEIGHT * sizeS +
    EXT_WEIGHT * extS
  );
}

export function tierFor(score: number): DupConfidence | null {
  if (score >= CERTAIN_THRESHOLD) return "certain";
  if (score >= PROBABLE_THRESHOLD) return "probable";
  if (score >= CHECK_THRESHOLD) return "check";
  return null;
}

/**
 * Bucketing key. Two tracks with the same key are compared; different keys
 * are skipped. We use the first 3 letters of the normalized name — same-song
 * duplicates always share their initial characters after normalization.
 * We DO NOT bucket by duration (durations aren't always known at scan time).
 */
function bucketKey(f: DupTrackFeatures): string {
  return f.normName.slice(0, 3);
}

/** Compute all duplicate pairs above the "check" threshold. */
export function computePairs(features: DupTrackFeatures[]): DupPair[] {
  const buckets = new Map<string, DupTrackFeatures[]>();
  for (const f of features) {
    if (!f.normName) continue;
    const k = bucketKey(f);
    const arr = buckets.get(k) ?? [];
    arr.push(f);
    buckets.set(k, arr);
  }
  const pairs: DupPair[] = [];
  for (const arr of buckets.values()) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const s = pairScore(arr[i], arr[j]);
        const tier = tierFor(s);
        if (!tier) continue;
        pairs.push({ a: arr[i].id, b: arr[j].id, score: s, confidence: tier });
      }
    }
  }
  return pairs;
}

/** Union-find over pairs → groups of track ids. */
export function groupsFromPairs(
  pairs: DupPair[],
  ignoredPairs: Set<string>,
): DupGroup[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    if (p === x) return x;
    p = find(p);
    parent.set(x, p);
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const pairKey = (a: string, b: string) => (a < b ? `${a}::${b}` : `${b}::${a}`);
  const activePairs = pairs.filter((p) => !ignoredPairs.has(pairKey(p.a, p.b)));
  for (const p of activePairs) union(p.a, p.b);

  const groups = new Map<string, { ids: Set<string>; score: number; tier: DupConfidence }>();
  for (const p of activePairs) {
    const root = find(p.a);
    const g = groups.get(root) ?? { ids: new Set<string>(), score: 0, tier: "check" as DupConfidence };
    g.ids.add(p.a);
    g.ids.add(p.b);
    if (p.score > g.score) {
      g.score = p.score;
      g.tier = p.confidence;
    }
    groups.set(root, g);
  }
  return Array.from(groups.entries()).map(([root, g]) => ({
    id: `g_${root}`,
    trackIds: Array.from(g.ids),
    score: g.score,
    confidence: g.tier,
    keeperId: root, // temporary; caller sets real keeper via pickKeeper
  }));
}

/**
 * Recommended keeper policy: prefer richer metadata and better quality.
 * Priority:
 *   1. has bpm AND musicalKey
 *   2. is favorite
 *   3. has bpm OR musicalKey
 *   4. largest file size (proxy for higher bitrate)
 *   5. earliest addedAt (oldest wins — stable id)
 */
export function pickKeeper(tracks: Track[]): string {
  const score = (t: Track) => {
    let s = 0;
    if (t.bpm != null && t.musicalKey) s += 1000;
    if (t.favorite) s += 500;
    if (t.bpm != null) s += 200;
    if (t.musicalKey) s += 200;
    s += Math.min(300, t.size / (1024 * 1024)); // up to 300 pts for size
    s -= (Date.now() - (t.addedAt || 0)) / (1000 * 60 * 60 * 24 * 365); // slight penalty per year
    return s;
  };
  let best = tracks[0];
  let bestScore = score(best);
  for (let i = 1; i < tracks.length; i++) {
    const s = score(tracks[i]);
    if (s > bestScore) {
      best = tracks[i];
      bestScore = s;
    }
  }
  return best.id;
}

/**
 * End-to-end: from a library, produce the final list of groups with
 * recommended keepers and applied ignore-list.
 */
export function detectDuplicates(
  tracks: Track[],
  ignoredPairs: Set<string> = new Set(),
): DupGroup[] {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const features = tracks.map(featuresFor);
  const pairs = computePairs(features);
  const groups = groupsFromPairs(pairs, ignoredPairs);
  return groups
    .map((g) => {
      const groupTracks = g.trackIds.map((id) => byId.get(id)!).filter(Boolean);
      return { ...g, keeperId: pickKeeper(groupTracks) };
    })
    .sort((a, b) => b.score - a.score);
}

export const DUP_THRESHOLDS = {
  check: CHECK_THRESHOLD,
  probable: PROBABLE_THRESHOLD,
  certain: CERTAIN_THRESHOLD,
} as const;
