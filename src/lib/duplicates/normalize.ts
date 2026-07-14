/**
 * Aggressive title normalization for duplicate detection.
 *
 * This is intentionally more aggressive than the OCR-matching normalization
 * in `src/lib/analysis/name-normalize.ts`. Duplicates often come from the
 * same track saved with wildly different filename decorations:
 *
 *   "01 - Gazo.mp3"
 *   "125 BPM - Gazo.mp3"
 *   "5A - Gazo (Official Video).mp3"
 *   "Gazo.mp3"
 *
 * We strip every known prefix (numeric, BPM, Camelot key), quality tags,
 * feat/prod parentheses, brackets, punctuation, diacritics, and collapse
 * whitespace. The result is a canonical comparable string.
 */

// Camelot codes are 1..12 followed by A or B (e.g. "8A", "12B").
const CAMELOT_PREFIX_RE = /^\s*(?:\d{1,2}[ab])[\s._\-–—]+/i;
const BPM_PREFIX_RE = /^\s*\d{2,3}\s*bpm[\s._\-–—]+/i;
const BPM_ANYWHERE_RE = /\b\d{2,3}\s*bpm\b/gi;
const NUMERIC_PREFIX_RE = /^[\s\W_]*(?:\d{1,4}[\s._\-–—]+)+/;
const EXTENSION_RE = /\.(mp3|wav|flac|m4a|aac|ogg|opus|wma|aiff|aif)$/i;
const QUALITY_RE = /\((?:\d{2,4}\s*k(?:bps)?|hd|hq|remaster(?:ed)?|clean|explicit|official|audio|video|lyrics?|mv|4k)\)/gi;
const BRACKET_QUALITY_RE = /\[(?:\d{2,4}\s*k(?:bps)?|hd|hq|remaster(?:ed)?|clean|explicit|official|audio|video|lyrics?|mv|4k)\]/gi;
const OFFICIAL_WORDS_RE = /\b(?:official|music|video|audio|lyrics?|clip|mv|hd|hq|4k)\b/gi;
const FEAT_RE = /\((?:feat|ft|featuring|prod|prod by|with)\.?[^)]*\)/gi;
const FEAT_INLINE_RE = /\b(?:feat|ft|featuring|prod)\.?\s*/gi;

export function stripExtension(name: string): string {
  return name.replace(EXTENSION_RE, "");
}

export function getExtension(name: string): string {
  const m = EXTENSION_RE.exec(name);
  return m ? m[1].toLowerCase() : "";
}

/** Full canonical normalization for duplicate grouping. */
export function normalizeForDedup(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);
  s = stripExtension(s);

  // Iteratively strip known prefixes (they can stack: "01 - 125 BPM - 5A - Title")
  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s.replace(CAMELOT_PREFIX_RE, "");
    s = s.replace(BPM_PREFIX_RE, "");
    s = s.replace(NUMERIC_PREFIX_RE, "");
    if (s === before) break;
  }

  s = s.replace(BPM_ANYWHERE_RE, " ");
  s = s.replace(FEAT_RE, " ");
  s = s.replace(QUALITY_RE, " ").replace(BRACKET_QUALITY_RE, " ");
  s = s.replace(OFFICIAL_WORDS_RE, " ");
  s = s.replace(FEAT_INLINE_RE, " ");
  s = s.replace(/[_\-–—.·|/\\]+/g, " ");
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}

/** Try to split a canonical string into `{ artist, title }` if a dash is present in the ORIGINAL. */
export function splitArtistTitle(originalName: string): { artist: string; title: string } {
  const cleaned = stripExtension(originalName);
  // Prefer " - " over "-" (a lone hyphen is often part of a word).
  const idx = cleaned.indexOf(" - ");
  if (idx > 0) {
    return {
      artist: normalizeForDedup(cleaned.slice(0, idx)),
      title: normalizeForDedup(cleaned.slice(idx + 3)),
    };
  }
  return { artist: "", title: normalizeForDedup(cleaned) };
}

/** Dice coefficient on character bigrams, order-tolerant. */
export function diceBigram(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let totalA = 0;
  let totalB = 0;
  for (const v of A.values()) totalA += v;
  for (const v of B.values()) totalB += v;
  for (const [g, ca] of A) {
    const cb = B.get(g);
    if (cb) inter += Math.min(ca, cb);
  }
  return (2 * inter) / (totalA + totalB);
}
