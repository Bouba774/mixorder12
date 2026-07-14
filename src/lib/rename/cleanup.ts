/**
 * Prefix cleanup — strips known leading decorations from a track name.
 *
 * Handles the common formats seen in DJ libraries:
 *   001 - Nom          001_Nom           001. Nom
 *   01 Nom             001 | Nom         001___Nom
 *   125 BPM Nom        128BPM_Gazo       125bpm - Nom
 *   8A - Nom           12B_Nom
 * And ANY combination stacked together:
 *   001_125 BPM - 8A - Nom → Nom
 *
 * The engine is applied iteratively so stacked prefixes are all removed
 * in a single pass. Extension is preserved.
 */

const CAMELOT_RE = /^\s*\d{1,2}[ab]\b\s*[-_.|·\s]*/i;
const BPM_RE = /^\s*\d{2,3}\s*bpm\b\s*[-_.|·\s]*/i;
const NUMERIC_RE = /^\s*\d{1,4}\s*[-_.|·\s]+/;

const EXT_RE = /\.(mp3|wav|flac|m4a|aac|ogg|opus|wma|aiff|aif)$/i;

export function cleanPrefixes(input: string): string {
  if (!input) return input;
  // Preserve extension if any.
  const extMatch = EXT_RE.exec(input);
  const ext = extMatch ? extMatch[0] : "";
  let s = ext ? input.slice(0, -ext.length) : input;

  for (let i = 0; i < 8; i++) {
    const before = s;
    s = s.replace(CAMELOT_RE, "");
    s = s.replace(BPM_RE, "");
    s = s.replace(NUMERIC_RE, "");
    if (s === before) break;
  }
  s = s.replace(/^\s*[-_.|·]+\s*/, "").trim();
  // If cleanup ate everything, keep the original — safer than an empty name.
  if (!s) return ext ? input.slice(0, -ext.length) : input;
  return s + ext;
}

/**
 * Normalize whitespace / punctuation according to the caller's options.
 */
export interface CleanupOptions {
  replaceUnderscores: boolean;
  replaceHyphens: boolean;
  collapseSpaces: boolean;
  stripInvisibles: boolean;
}

export const DEFAULT_CLEANUP: CleanupOptions = {
  replaceUnderscores: true,
  replaceHyphens: false,
  collapseSpaces: true,
  stripInvisibles: true,
};

export function applyCleanup(name: string, opts: CleanupOptions): string {
  let s = name;
  if (opts.stripInvisibles) {
    // Zero-width, BOM, control chars.
    s = s.replace(/[\u0000-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g, "");
  }
  if (opts.replaceUnderscores) s = s.replace(/_+/g, " ");
  if (opts.replaceHyphens) s = s.replace(/-+/g, " ");
  if (opts.collapseSpaces) s = s.replace(/\s+/g, " ");
  return s.trim();
}
