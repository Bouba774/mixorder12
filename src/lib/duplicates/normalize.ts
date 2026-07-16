/**
 * Extract the "core" name of a track for duplicate detection.
 *
 * Objectif : deux fichiers du même morceau, quelle que soit leur
 * décoration (numéro en tête, tags qualité, "Official Audio", etc.),
 * doivent produire exactement la même chaîne canonique.
 *
 * Aucun score, aucune distance : la comparaison finale est une égalité
 * stricte de la chaîne renvoyée par `coreName()`.
 */

const EXTENSION_RE =
  /\.(mp3|wav|flac|m4a|aac|ogg|opus|wma|aiff|aif)$/i;

/** Mots parasites à supprimer du nom, où qu'ils apparaissent. */
const NOISE_WORDS = [
  "official", "audio", "video", "music", "clip", "lyrics", "lyric",
  "visualizer", "visualiser", "mv", "hd", "hq", "4k", "8k",
  "remaster", "remastered", "remasterized", "version",
  "explicit", "clean", "radio edit", "radio", "edit",
  "prod", "prodby", "feat", "ft", "featuring",
];

/** Tags qualité entre parenthèses / crochets — retirés en bloc. */
const TAG_PARENS_RE =
  /[\(\[][^)\]]*?(?:\d{2,4}\s*k(?:bps)?|kbps|official|audio|video|lyrics?|clip|visualizer|visualiser|mv|hd|hq|4k|8k|remaster(?:ed)?|version|explicit|clean|radio\s*edit|feat|ft|prod)[^)\]]*[\)\]]/gi;

/** Segment "125bpm", "125 bpm" n'importe où. */
const BPM_ANY_RE = /\b\d{2,3}\s*bpm\b/gi;

/** Notation Camelot n'importe où (8A, 12b, ...). */
const CAMELOT_ANY_RE = /\b\d{1,2}[ab]\b/gi;

/** Préfixes de piste : "01 -", "01_", "1.", "01 – ", etc. */
const TRACK_NUMBER_PREFIX_RE =
  /^[\s\-_.]*\d{1,4}(?:\s*[-_.–—]+\s*|\s+)/;

export function stripExtension(name: string): string {
  return name.replace(EXTENSION_RE, "");
}

export function getExtension(name: string): string {
  const m = EXTENSION_RE.exec(name);
  return m ? m[1].toLowerCase() : "";
}

/**
 * Retourne le "cœur" du nom (chaîne canonique) — vide si rien
 * d'exploitable ne subsiste.
 */
export function coreName(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);

  // 1. Extension
  s = stripExtension(s);

  // 2. Tags entre parenthèses / crochets (avant de casser la ponctuation)
  s = s.replace(TAG_PARENS_RE, " ");

  // 3. Préfixes de piste "01 - ", répétés (peut s'accumuler)
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(TRACK_NUMBER_PREFIX_RE, "");
    if (s === before) break;
  }

  // 4. Camelot / BPM n'importe où
  s = s.replace(BPM_ANY_RE, " ");
  s = s.replace(CAMELOT_ANY_RE, " ");

  // 5. Tirets multiples, underscores, points → espace
  s = s.replace(/[_\-–—.·|/\\]+/g, " ");

  // 6. Diacritiques
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 7. Ponctuation restante
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");

  // 8. Mots parasites (en tokens entiers)
  s = s.toLowerCase();
  const noise = new Set(NOISE_WORDS.map((w) => w.replace(/\s+/g, "")));
  s = s
    .split(/\s+/)
    .filter((tok) => tok && !noise.has(tok))
    .join(" ");

  // 9. Espaces multiples
  s = s.replace(/\s+/g, " ").trim();

  return s;
}
