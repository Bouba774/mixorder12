/**
 * Persistance des décisions utilisateur sur les groupes de doublons.
 * Un seul état conservé : le morceau à garder par groupe (override).
 * Aucun mécanisme "d'ignore" — un groupe est soit un doublon confirmé,
 * soit il n'apparaît pas.
 */

const PREFIX = "mixorder:dedup:";

export interface DedupState {
  v: 2;
  /** Signature du groupe → id du morceau choisi comme "à garder". */
  keeperOverrides: Record<string, string>;
  updatedAt: number;
}

function empty(): DedupState {
  return { v: 2, keeperOverrides: {}, updatedAt: Date.now() };
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadDedupState(fingerprint: string): DedupState {
  const s = storage();
  if (!s) return empty();
  try {
    const raw = s.getItem(PREFIX + fingerprint);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<DedupState>;
    return {
      v: 2,
      keeperOverrides: parsed.keeperOverrides ?? {},
      updatedAt: parsed.updatedAt ?? Date.now(),
    };
  } catch {
    return empty();
  }
}

export function saveDedupState(fingerprint: string, state: DedupState): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(
      PREFIX + fingerprint,
      JSON.stringify({ ...state, updatedAt: Date.now() }),
    );
  } catch {
    /* quota etc. — ignore */
  }
}
