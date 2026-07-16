/**
 * Hook de détection des doublons — version stricte (3 critères).
 *
 * La détection est purement dérivée de la bibliothèque active.
 * Aucune notion de score, de tier ou de "à vérifier". Un groupe est un
 * doublon confirmé, sinon il n'apparaît pas.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { detectDuplicates, type DupGroup } from "@/lib/duplicates/engine";
import { projectFingerprint } from "@/lib/analysis/persistence";
import {
  loadDedupState,
  saveDedupState,
  type DedupState,
} from "@/lib/duplicates/persistence";

export interface UseDuplicatesResult {
  groups: DupGroup[];
  isReady: boolean;
  /** Change le morceau à garder pour un groupe donné. */
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
    fingerprint
      ? loadDedupState(fingerprint)
      : { v: 2, keeperOverrides: {}, updatedAt: 0 },
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
    const raw = detectDuplicates(project.tracks);
    return raw.map((g) => {
      const sig = groupSignature(g);
      const override = state.keeperOverrides[sig];
      if (override && g.trackIds.includes(override)) {
        return { ...g, keeperId: override };
      }
      return g;
    });
  }, [project, state]);

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
    isReady: !!project,
    setKeeper,
  };
}

export type { DupGroup };
