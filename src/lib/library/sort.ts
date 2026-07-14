/**
 * Shared library sorting logic — used by the library grid AND by the rename
 * module so the batch rename output follows exactly the order the user sees.
 */

import type { Track } from "@/lib/workspace-context";

export type SortField =
  | "manual"
  | "import"
  | "name"
  | "duration"
  | "bpm"
  | "key"
  | "camelot"
  | "added"
  | "size";

export type SortDir = "asc" | "desc";

export const SORT_OPTIONS: Array<{ id: SortField; label: string }> = [
  { id: "manual", label: "Ordre personnalisé" },
  { id: "import", label: "Ordre d'importation" },
  { id: "name", label: "Nom (A→Z)" },
  { id: "bpm", label: "BPM" },
  { id: "key", label: "Tonalité" },
  { id: "camelot", label: "Camelot" },
  { id: "duration", label: "Durée" },
  { id: "added", label: "Date d'ajout" },
  { id: "size", label: "Taille" },
];

const KEY_ORDER: Record<string, number> = (() => {
  const order = ["C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"];
  const map: Record<string, number> = {};
  order.forEach((k, i) => {
    map[k] = i * 2;
    map[`${k}m`] = i * 2 + 1;
  });
  return map;
})();

export function cmpKey(a: string | null, b: string | null) {
  const av = a ? (KEY_ORDER[a] ?? 999) : 1000;
  const bv = b ? (KEY_ORDER[b] ?? 999) : 1000;
  return av - bv;
}
export function cmpNum(a: number | null, b: number | null) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}
export function cmpStr(a: string | null, b: string | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function sortTracks(
  tracks: Track[],
  field: SortField,
  dir: SortDir,
): Track[] {
  if (field === "manual" || field === "import") return tracks.slice();
  const arr = tracks.slice();
  const mul = dir === "asc" ? 1 : -1;
  arr.sort((a, b) => {
    let c = 0;
    switch (field) {
      case "name":     c = cmpStr(a.name, b.name); break;
      case "duration": c = cmpNum(a.durationSec, b.durationSec); break;
      case "bpm":      c = cmpNum(a.bpm, b.bpm); break;
      case "key":      c = cmpKey(a.musicalKey, b.musicalKey); break;
      case "camelot":  c = cmpStr(a.camelot, b.camelot); break;
      case "added":    c = a.addedAt - b.addedAt; break;
      case "size":     c = a.size - b.size; break;
    }
    return c * mul;
  });
  return arr;
}
