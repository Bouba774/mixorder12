/**
 * Live duplicate detection hook.
 *
 * Runs the detector against the current library, applies persisted user
 * decisions (ignored pairs, custom keepers), and exposes actions to mutate
 * those decisions. Detection is memoized by track-signature (id + name +
 * size + durationSec) so it only recomputes when the library actually
 * changes — new tracks trigger a fresh, cheap pass.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import {
  detectDuplicates,
  type DupConfidence,
  type DupGroup,
} from "@/lib/duplicates/engine";
import { projectFingerprint } from "@/lib/analysis/persistence";
import {
  loadDedupState,
  pairKey,
  saveDedupState,
  type DedupState,
} from "@/lib/duplicates/persistence";

export interface UseDuplicatesResult {
  groups: DupGroup[];
  state: DedupState;
  isReady: boolean;
  /** Ignore an entire group (adds ignored pairs between all members). */
  ignoreGroup: (group: DupGroup) => void;
  /** Restore all ignored groups. */
  restoreIgnored: () => void;
  /** Override the recommended keeper for a group. */
  setKeeper: (group: DupGroup, trackId: string) => void;
}

function groupSignature(group: DupGroup): string {
  return group.trackIds.slice().sort().join("|");
}

export function useDuplicates(): UseDuplicatesResult {
  const { project } = useWorkspace();
  const fingerprint = useMemo(
    () => (project ? projectFingerprint(project) : null),
    [project],
  );
  const [state, setState] = useState<DedupState>(() =>
    fingerprint ? loadDedupState(fingerprint) : { v: 1, ignoredPairs: [], keeperOverrides: {}, updatedAt: 0 },
  );

  useEffect(() => {
    if (!fingerprint) return;
    setState(loadDedupState(fingerprint));
  }, [fingerprint]);

  const persist = useCallback(
    (next: DedupState) => {
      setState(next);
      if (fingerprint) saveDedupState(fingerprint, next);
    },
    [fingerprint],
  );

  const groups = useMemo(() => {
    if (!project) return [];
    const ignored = new Set(state.ignoredPairs);
    const raw = detectDuplicates(project.tracks, ignored);
    // Apply keeper overrides.
    return raw.map((g) => {
      const sig = groupSignature(g);
      const override = state.keeperOverrides[sig];
      if (override && g.trackIds.includes(override)) {
        return { ...g, keeperId: override };
      }
      return g;
    });
  }, [project, state]);

  const ignoreGroup = useCallback(
    (group: DupGroup) => {
      const next = new Set(state.ignoredPairs);
      const ids = group.trackIds;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          next.add(pairKey(ids[i], ids[j]));
        }
      }
      persist({ ...state, ignoredPairs: Array.from(next) });
    },
    [state, persist],
  );

  const restoreIgnored = useCallback(() => {
    persist({ ...state, ignoredPairs: [] });
  }, [state, persist]);

  const setKeeper = useCallback(
    (group: DupGroup, trackId: string) => {
      const sig = groupSignature(group);
      persist({
        ...state,
        keeperOverrides: { ...state.keeperOverrides, [sig]: trackId },
      });
    },
    [state, persist],
  );

  return {
    groups,
    state,
    isReady: !!project,
    ignoreGroup,
    restoreIgnored,
    setKeeper,
  };
}

export type { DupConfidence, DupGroup };
