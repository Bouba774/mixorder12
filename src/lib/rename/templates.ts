/**
 * Rename templates.
 *
 * Placeholders:
 *   {name}     current display name (post-cleanup if enabled)
 *   {bpm}      BPM as integer, empty if unknown
 *   {key}      musical key
 *   {cam}      Camelot notation
 *   {n}        1-based index in the visible library, zero-padded to `padding`
 *   {ext}      file extension (with leading dot) — normally handled separately
 *
 * The template engine leaves the file extension out of the template itself
 * and reattaches it after evaluation, so the user never has to think about
 * it. Empty tokens collapse cleanly (no dangling separators).
 */

import type { Track } from "@/lib/workspace-context";

export interface TemplateDef {
  id: string;
  label: string;
  /** Pattern string using the placeholders described above. */
  pattern: string;
}

export const TEMPLATES: TemplateDef[] = [
  { id: "num-name",       label: "N° - Nom",           pattern: "{n} - {name}" },
  { id: "name",           label: "Nom seul",           pattern: "{name}" },
  { id: "bpm-name",       label: "BPM - Nom",          pattern: "{bpm} BPM - {name}" },
  { id: "key-name",       label: "Tonalité - Nom",     pattern: "{key} - {name}" },
  { id: "cam-name",       label: "Camelot - Nom",      pattern: "{cam} - {name}" },
  { id: "bpm-key-name",   label: "BPM - Tonalité - Nom", pattern: "{bpm} - {key} - {name}" },
  { id: "key-bpm-name",   label: "Tonalité - BPM - Nom", pattern: "{key} - {bpm} - {name}" },
  { id: "name-bpm",       label: "Nom - BPM",          pattern: "{name} - {bpm} BPM" },
  { id: "name-key",       label: "Nom - Tonalité",     pattern: "{name} - {key}" },
  { id: "num-bpm-name",   label: "N° - BPM - Nom",     pattern: "{n} - {bpm} BPM - {name}" },
  { id: "num-cam-name",   label: "N° - Camelot - Nom", pattern: "{n} - {cam} - {name}" },
];

/**
 * Pick the recommended numbering padding based on library size.
 * < 10 → 1, < 100 → 2, < 1000 → 3, else 4.
 */
export function recommendedPadding(size: number): number {
  if (size < 10) return 1;
  if (size < 100) return 2;
  if (size < 1000) return 3;
  return 4;
}

/**
 * Pick the recommended template based on library size — always the
 * "N° - Nom" variant with the right padding.
 */
export function recommendedTemplateId(size: number): string {
  return "num-name";
}
void recommendedTemplateId;

export interface NumberingOptions {
  start: number;
  padding: number;
  separator: string;
  descending: boolean;
}

export const DEFAULT_NUMBERING: NumberingOptions = {
  start: 1,
  padding: 3,
  separator: " - ",
  descending: false,
};

export interface ApplyTemplateArgs {
  track: Track;
  index: number;
  total: number;
  cleanedBaseName: string;
  numbering: NumberingOptions;
}

function padNumber(n: number, padding: number): string {
  const s = String(n);
  return s.length >= padding ? s : "0".repeat(padding - s.length) + s;
}

export function evaluateTemplate(
  pattern: string,
  args: ApplyTemplateArgs,
): string {
  const { track, index, total, cleanedBaseName, numbering } = args;
  const num = numbering.descending
    ? numbering.start + (total - 1 - index)
    : numbering.start + index;
  const numStr = padNumber(num, numbering.padding);

  const tokens: Record<string, string> = {
    "{n}": numStr,
    "{name}": cleanedBaseName,
    "{bpm}": track.bpm != null ? String(Math.round(track.bpm)) : "",
    "{key}": track.musicalKey ?? "",
    "{cam}": track.camelot ?? "",
  };

  let out = pattern;
  for (const [k, v] of Object.entries(tokens)) {
    out = out.split(k).join(v);
  }
  // Collapse "  " left by empty tokens, normalize " -  - " kinds of runs.
  out = out
    .replace(/\s{2,}/g, " ")
    .replace(/(^|\s)[-·|]\s*(?=[-·|]\s)/g, "")
    .replace(/^[\s\-·|]+/, "")
    .replace(/[\s\-·|]+$/, "")
    .trim();
  return out;
}
