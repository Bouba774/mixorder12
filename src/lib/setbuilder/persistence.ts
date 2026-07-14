/**
 * Set Builder persistence — saves all named Sets under the current project
 * fingerprint so they survive reloads. Tracks are referenced by their
 * stable `path` (not the volatile in-memory id) so a re-import keeps the
 * Set intact.
 */

import type { Project } from "@/lib/workspace-context";
import { projectFingerprint } from "@/lib/analysis/persistence";
import type { SetModeId } from "./modes";

const KEY_PREFIX = "mixorder:setbuilder:";
const ACTIVE_PREFIX = "mixorder:setbuilder-active:";

export interface StoredSet {
  id: string;
  name: string;
  mode: SetModeId;
  /** Track paths in order — stable across imports. */
  paths: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SetsSnapshot {
  v: 1;
  sets: StoredSet[];
}

function fpKey(fp: string) { return KEY_PREFIX + fp; }
function activeKey(fp: string) { return ACTIVE_PREFIX + fp; }

export function loadSets(project: Project | null): SetsSnapshot {
  if (!project || typeof window === "undefined") return { v: 1, sets: [] };
  try {
    const raw = window.localStorage.getItem(fpKey(projectFingerprint(project)));
    if (!raw) return { v: 1, sets: [] };
    const parsed = JSON.parse(raw) as SetsSnapshot;
    if (parsed?.v !== 1) return { v: 1, sets: [] };
    return parsed;
  } catch {
    return { v: 1, sets: [] };
  }
}

export function saveSets(project: Project, snap: SetsSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(fpKey(projectFingerprint(project)), JSON.stringify(snap));
  } catch { /* quota */ }
}

export function loadActiveSetId(project: Project | null): string | null {
  if (!project || typeof window === "undefined") return null;
  return window.localStorage.getItem(activeKey(projectFingerprint(project)));
}

export function saveActiveSetId(project: Project, id: string | null): void {
  if (typeof window === "undefined") return;
  const k = activeKey(projectFingerprint(project));
  if (id) window.localStorage.setItem(k, id);
  else window.localStorage.removeItem(k);
}

export function makeSetId(): string {
  return `set_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}
