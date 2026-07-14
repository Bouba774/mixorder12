/**
 * Rename planning + validation.
 *
 * Given a list of tracks (already in the desired order), a template and
 * cleanup/numbering options, produce a `RenamePlan` that the UI can preview
 * and the executor can apply. All destination names are validated for:
 *   - forbidden filesystem characters (/, \, :, *, ?, ", <, >, |)
 *   - null / empty results
 *   - internal collisions (two tracks resolving to the same name)
 *
 * Nothing is written until the executor is called. The plan holds enough
 * information to render a full preview and to build the undo record.
 */

import type { Track } from "@/lib/workspace-context";
import {
  applyCleanup,
  cleanPrefixes,
  type CleanupOptions,
} from "./cleanup";
import {
  evaluateTemplate,
  type NumberingOptions,
} from "./templates";

const FORBIDDEN_RE = /[\\/:*?"<>|]/;

export interface RenamePlanEntry {
  trackId: string;
  before: string;
  after: string;
  changed: boolean;
  issues: string[];
}

export interface RenamePlan {
  entries: RenamePlanEntry[];
  totalChanged: number;
  totalConflicts: number;
  totalInvalid: number;
  /** True when the plan is safe to apply. */
  safe: boolean;
}

export interface BuildPlanArgs {
  tracks: Track[];
  pattern: string;
  numbering: NumberingOptions;
  cleanup: CleanupOptions;
  stripPrefixes: boolean;
  preserveCase: boolean;
}

function toBaseName(track: Track, args: BuildPlanArgs): string {
  let base = track.name || track.originalName;
  if (args.stripPrefixes) base = cleanPrefixes(base);
  base = applyCleanup(base, args.cleanup);
  if (!args.preserveCase) {
    // "Preserve casing" is default ON; when OFF we normalize to Title Case.
    base = base.replace(
      /\S+/g,
      (w) => w[0].toUpperCase() + w.slice(1).toLowerCase(),
    );
  }
  return base;
}

export function buildPlan(args: BuildPlanArgs): RenamePlan {
  const total = args.tracks.length;
  const seen = new Map<string, number>();
  const entries: RenamePlanEntry[] = args.tracks.map((track, index) => {
    const cleanedBaseName = toBaseName(track, args);
    let after = evaluateTemplate(args.pattern, {
      track,
      index,
      total,
      cleanedBaseName,
      numbering: args.numbering,
    });

    const issues: string[] = [];
    if (!after) {
      issues.push("Nom vide");
      after = track.name;
    }
    if (FORBIDDEN_RE.test(after)) {
      issues.push("Caractères interdits");
      after = after.replace(FORBIDDEN_RE, " ").replace(/\s+/g, " ").trim();
    }

    const key = after.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > 1) {
      issues.push("Conflit de nom");
    }

    return {
      trackId: track.id,
      before: track.name,
      after,
      changed: after !== track.name,
      issues,
    };
  });

  let totalChanged = 0;
  let totalInvalid = 0;
  let totalConflicts = 0;
  for (const e of entries) {
    if (e.changed) totalChanged += 1;
    if (e.issues.includes("Conflit de nom")) totalConflicts += 1;
    else if (e.issues.length > 0) totalInvalid += 1;
  }
  return {
    entries,
    totalChanged,
    totalInvalid,
    totalConflicts,
    safe: totalConflicts === 0 && totalInvalid === 0,
  };
}

/** Estimate how long applying `n` renames will take (ms). */
export function estimateDuration(nChanges: number): number {
  // Rough: ~4ms per rename (React state + snapshot write on localStorage).
  return Math.max(50, nChanges * 4);
}

/** Cleanup-only helper: build a plan that ONLY strips prefixes. */
export function buildCleanupOnlyPlan(
  tracks: Track[],
  cleanup: CleanupOptions,
): RenamePlan {
  return buildPlan({
    tracks,
    pattern: "{name}",
    numbering: { start: 1, padding: 1, separator: "", descending: false },
    cleanup,
    stripPrefixes: true,
    preserveCase: true,
  });
}
