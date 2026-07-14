/**
 * Convert a musical key notation (e.g. "C", "Am", "F#m") into the Camelot
 * wheel notation used by DJs (e.g. "8B", "8A", "11A"). Returns null when
 * the input can't be parsed.
 */

const CAMELOT_MAJOR: Record<string, string> = {
  "B": "1B", "F#": "2B", "Gb": "2B", "Db": "3B", "C#": "3B",
  "Ab": "4B", "G#": "4B", "Eb": "5B", "D#": "5B", "Bb": "6B", "A#": "6B",
  "F": "7B", "C": "8B", "G": "9B", "D": "10B", "A": "11B", "E": "12B",
};
const CAMELOT_MINOR: Record<string, string> = {
  "G#": "1A", "Ab": "1A", "D#": "2A", "Eb": "2A", "A#": "3A", "Bb": "3A",
  "F": "4A", "C": "5A", "G": "6A", "D": "7A", "A": "8A", "E": "9A",
  "B": "10A", "F#": "11A", "Gb": "11A", "C#": "12A", "Db": "12A",
};

export function toCamelot(key: string | null | undefined): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  const minor = /m$/i.test(trimmed);
  const root = trimmed.replace(/m$/i, "").replace(/\s+/g, "");
  const map = minor ? CAMELOT_MINOR : CAMELOT_MAJOR;
  return map[root] ?? null;
}