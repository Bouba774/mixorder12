/**
 * Détection de doublons — stricte, locale, explicable.
 *
 * Un groupe de doublons est formé UNIQUEMENT lorsque les trois critères
 * suivants sont réunis :
 *
 *   1. Même cœur de nom (voir `coreName`) — égalité stricte.
 *   2. Même durée (à ±2s près pour tolérer les variations d'encodage).
 *   3. Même tonalité Camelot (chaîne exacte, non nulle).
 *
 * Si l'un des trois est manquant ou différent, la paire n'est jamais
 * un doublon. Pas de BPM, pas d'empreinte, pas de score.
 */

import type { Track } from "@/lib/workspace-context";
import { coreName } from "./normalize";

export interface DupGroup {
  id: string;
  /** Ids des morceaux du groupe (au moins 2). */
  trackIds: string[];
  /** Morceau recommandé — voir `pickKeeper`. */
  keeperId: string;
}

const DURATION_TOLERANCE_SEC = 2;

function bucketDuration(sec: number): number {
  // Regroupement grossier (fenêtre 2s) — la tolérance fine est appliquée
  // ensuite lors de l'appariement à l'intérieur du bucket.
  return Math.round(sec / DURATION_TOLERANCE_SEC);
}

/**
 * Score de "propreté" du nom d'affichage — plus la chaîne est proche du
 * cœur (peu de bruit), plus le score est élevé.
 */
function nameCleanliness(t: Track): number {
  const display = t.name || t.originalName;
  const core = coreName(display);
  if (!core) return 0;
  // Ratio du cœur sur la longueur d'affichage : plus il est proche de 1,
  // plus le nom est déjà propre.
  return core.length / Math.max(1, display.length);
}

/**
 * Politique du "meilleur" morceau à conserver.
 * Ordre demandé :
 *   1. Nom le plus propre
 *   2. Tonalité détectée
 *   3. BPM détecté
 *   4. Durée la plus complète (la plus longue)
 *   5. Fichier le plus récent en cas d'égalité
 */
export function pickKeeper(tracks: Track[]): string {
  const scored = tracks.map((t) => ({
    t,
    clean: nameCleanliness(t),
    hasKey: t.camelot != null || t.musicalKey != null ? 1 : 0,
    hasBpm: t.bpm != null ? 1 : 0,
    dur: t.durationSec ?? 0,
    when: t.modifiedAt ?? t.addedAt ?? 0,
  }));
  scored.sort((a, b) => {
    if (b.clean !== a.clean) return b.clean - a.clean;
    if (b.hasKey !== a.hasKey) return b.hasKey - a.hasKey;
    if (b.hasBpm !== a.hasBpm) return b.hasBpm - a.hasBpm;
    if (b.dur !== a.dur) return b.dur - a.dur;
    return b.when - a.when;
  });
  return scored[0].t.id;
}

/**
 * Renvoie tous les groupes de doublons confirmés (au moins 2 morceaux).
 * Tri : plus grands groupes d'abord, puis nom alphabétique.
 */
export function detectDuplicates(tracks: Track[]): DupGroup[] {
  // Bucket par (cœur, durée arrondie, camelot). Camelot NULL ⇒ ignoré.
  const buckets = new Map<string, Track[]>();

  for (const t of tracks) {
    if (!t.camelot) continue; // critère 3 : tonalité obligatoire
    if (t.durationSec == null || t.durationSec <= 0) continue; // critère 2
    const core = coreName(t.name || t.originalName);
    if (!core) continue; // critère 1
    const key = `${core}|${bucketDuration(t.durationSec)}|${t.camelot}`;
    const arr = buckets.get(key) ?? [];
    arr.push(t);
    buckets.set(key, arr);
  }

  const groups: DupGroup[] = [];
  for (const arr of buckets.values()) {
    if (arr.length < 2) continue;

    // Vérification fine de la durée à l'intérieur du bucket
    // (±DURATION_TOLERANCE_SEC autour du min).
    const sorted = [...arr].sort(
      (a, b) => (a.durationSec ?? 0) - (b.durationSec ?? 0),
    );
    const first = sorted[0];
    const kept = sorted.filter(
      (t) =>
        Math.abs((t.durationSec ?? 0) - (first.durationSec ?? 0)) <=
        DURATION_TOLERANCE_SEC,
    );
    if (kept.length < 2) continue;

    const keeperId = pickKeeper(kept);
    // Id stable = ids triés + jointure — survit aux re-renders.
    const gid = "g_" + kept.map((t) => t.id).sort().join("_").slice(0, 60);
    groups.push({
      id: gid,
      trackIds: kept.map((t) => t.id),
      keeperId,
    });
  }

  groups.sort((a, b) => b.trackIds.length - a.trackIds.length);
  return groups;
}
