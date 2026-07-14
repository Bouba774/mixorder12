/**
 * Hybrid arbitration between Essentia and LibKeyFinder.
 *
 * Rules (per product spec):
 *   • Essentia is the primary engine.
 *   • If Essentia's confidence is high, accept it directly.
 *   • Otherwise run LibKeyFinder for verification:
 *       - engines agree  → high confidence (final = Essentia's key).
 *       - engines differ → low confidence, mark "à vérifier".
 *       - relative-key match (e.g. C vs Am) → medium confidence, keep primary.
 */

import { ENGINE_VERSION } from "./types";
import type { EngineInput, EngineOutput, HybridOutput } from "./types";
import { essentiaEngine } from "./engines/essentia";
import { libKeyFinderEngine } from "./engines/libkeyfinder";

const HIGH_CONFIDENCE = 0.55;

function parseKey(k: string): { root: string; minor: boolean } {
  const minor = /m$/.test(k);
  return { root: k.replace(/m$/, ""), minor };
}

/** Relative key of C major = A minor, of Am = C major, etc. */
function isRelativeKey(a: string, b: string): boolean {
  if (a === b) return false;
  const A = parseKey(a);
  const B = parseKey(b);
  if (A.minor === B.minor) return false;
  const noteIdx: Record<string, number> = {
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
    G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
  };
  const ai = noteIdx[A.root];
  const bi = noteIdx[B.root];
  if (ai == null || bi == null) return false;
  // Major → its relative minor is (root - 3) semitones. Minor → +3.
  return A.minor
    ? ((ai + 3) % 12) === bi
    : ((bi + 3) % 12) === ai;
}

export async function detectKeyHybrid(
  input: EngineInput,
  signal?: AbortSignal,
): Promise<HybridOutput> {
  const t0 = performance.now();

  const primary: EngineOutput = await essentiaEngine.detect(input, signal);
  let verifier: EngineOutput | undefined;
  let key = primary.key;
  let camelot = primary.camelot;
  let confidence: HybridOutput["confidence"] = "high";
  let confidenceScore = primary.score;
  let needsReview = false;

  if (primary.score < HIGH_CONFIDENCE) {
    verifier = await libKeyFinderEngine.detect(input, signal);
    if (verifier.key === primary.key) {
      confidence = "high";
      confidenceScore = Math.min(1, (primary.score + verifier.score) / 2 + 0.15);
    } else if (isRelativeKey(primary.key, verifier.key)) {
      confidence = "medium";
      confidenceScore = (primary.score + verifier.score) / 2;
    } else {
      // Real disagreement — take the higher-scoring one but flag review.
      if (verifier.score > primary.score) {
        key = verifier.key;
        camelot = verifier.camelot;
      }
      confidence = "review";
      confidenceScore = Math.min(primary.score, verifier.score);
      needsReview = true;
    }
  } else {
    // Primary confident — still promote low raw scores to "medium".
    if (primary.score < 0.7) confidence = "medium";
  }

  return {
    primary,
    verifier,
    key,
    camelot,
    confidence,
    confidenceScore,
    needsReview,
    totalDurationMs: performance.now() - t0,
    engineVersion: ENGINE_VERSION,
    analyzedAt: Date.now(),
  };
}