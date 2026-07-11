# Mode AutoSync — Vérification du nom avant association BPM

## Objectif

Ajouter un troisième mode d'analyse (`autosync`) au robot DiscDJ, en plus des modes existants (`auto` et `manuel`). Contrairement au mode auto qui suppose que l'ordre de la playlist DiscDJ correspond à l'ordre de la bibliothèque MixOrder, AutoSync lit le **nom** du morceau affiché dans DiscDJ à chaque étape et l'associe au bon fichier via un matching flou. Le BPM n'est jamais enregistré tant que le nom n'a pas été validé.

## Nouveau workflow du robot

Pour chaque itération :

```text
1. Écran principal DiscDJ visible
2. Lire BPM du deck (readBpmWithVote existant)   → BPM mémorisé
3. Tap "Playlist"                                 → attendre écran playlist stable
4. OCR de la ligne sélectionnée (bleue)           → nom brut
5. Nettoyage + fuzzy match sur la bibliothèque   → track candidat + score
6. Si score < seuil → 2 nouvelles lectures OCR   → revote
7. Si toujours < seuil → ajouter à "À vérifier",
   NE PAS écrire de BPM, continuer
8. Sinon → setTrackAnalysis(track.id, { bpm })    → journal
9. Tap "Retour"                                    → attendre écran principal stable
10. Tap "Next"                                     → waitForTrackReady existant
11. Recommencer jusqu'à N morceaux traités (ou fin détectée)
```

## Calibration étendue

Deux nouveaux points de calibration (en plus de `next` et `bpmZone`) :

- `playlistButton` : point normalisé (x, y) — bouton Playlist depuis l'écran principal.
- `backButton` : point normalisé (x, y) — bouton flèche haut/retour depuis l'écran playlist.
- `playlistSelectedRow` : zone normalisée (x, y, w, h) — la ligne bleue sélectionnée où lire le nom.

UI : nouvelle étape « Calibration AutoSync » dans `DiscDJRobotPanel.tsx`, activée uniquement quand le mode AutoSync est sélectionné. Réutilise le même composant de picker que la calibration Next existante.

## Nouveaux fichiers

- `src/lib/analysis/name-normalize.ts` — normalisation + fuzzy match.
  - `normalizeTrackName(s)` : lowercase, retire les préfixes numériques (`^\d+[\s._-]*`), suffixes qualité (`\(?\d+k\)?`, `\[320\]`, `HD`, `Official.*Video`), extensions, ponctuation, underscores/tirets → espaces, collapse whitespace, retire diacritiques.
  - `similarity(a, b)` : ratio Dice sur bigrammes + bonus si un est préfixe de l'autre. Retourne 0..1.
  - `findBestMatch(ocrName, tracks, threshold)` : renvoie `{ track, score, runnerUp }`. Rejette si le meilleur < threshold ou si l'écart avec le runner-up < 0.05 (ambigu).

## Fichiers modifiés

**`src/lib/analysis/discdj-settings.ts`**
- Ajouter `mode: 'auto' | 'manual' | 'autosync'` (par défaut `auto`).
- Ajouter `autosync: { nameMatchThreshold: number (0.72), maxOcrRetries: number (3), waitAfterPlaylistOpenMs: 800, waitAfterBackMs: 600 }`.
- Ajouter `playlistButton`, `backButton`, `playlistSelectedRow` à la structure calibration.

**`src/lib/analysis/discdj-bridge.ts`**
- Nouvelle méthode `readSelectedPlaylistName(deck, opts)` — équivalent OCR de `readBpm` mais retourne du texte libre. Utilise la zone `playlistSelectedRow`.
- Le canal natif appelle le même `TextRecognizer` MLKit mais sans filtre digits.

**`capacitor-plugins/mixorder-discdj-robot/android/src/main/java/app/mixorder/discdjrobot/DiscDJAccessibilityService.java`**
- Nouvelle méthode `readTextFromScreenshot(Rect crop, ...)` — variante de `readBpmFromScreenshot` sans le filtre `[0-9]`, retourne le texte concaténé de tous les blocs dans le crop.
- Réutilise le même pipeline (screenshot → crop → MLKit).

**`capacitor-plugins/mixorder-discdj-robot/android/src/main/java/app/mixorder/discdjrobot/DiscDJRobotPlugin.java`**
- Nouvelle action JS `readSelectedPlaylistName`.

**`src/lib/analysis/discdj-robot.ts`**
- Nouvelle branche `if (settings.mode === 'autosync')` avec boucle décrite ci-dessus.
- Nouvelle helper `readNameWithRetries()` : jusqu'à `maxOcrRetries` lectures, garde celle avec le meilleur score après matching.
- État `RunRecap` étendu avec `toVerify: Array<{ index, ocrName, bestGuess?, score }>`.
- Reprise : `lastValidatedIndex` sauvegardé après chaque association réussie.

**`src/components/mixorder/DiscDJRobotPanel.tsx`**
- Sélecteur de mode `auto | manuel | autosync` (radio group).
- Section calibration AutoSync (3 sondes) visible seulement en mode autosync.
- Recap enrichi : colonne « Nom DiscDJ », « Nom MixOrder », « Score », « État ».
- Liste séparée « À vérifier » avec bouton pour rouvrir chaque item.

**`.lovable/plan.md`** — mise à jour du plan projet.

## Attentes intelligentes

- `waitForScreenStable(zone, timeoutMs, sampleIntervalMs=150)` déjà présent conceptuellement dans `waitForTrackReady`. On extrait une version générique côté service Android qui hash la zone d'écran et considère l'écran stable après 3 samples identiques consécutifs.
- Utilisé après tap Playlist (zone = `playlistSelectedRow`), après tap Retour (zone = `bpmZone`), après tap Next (waitForTrackReady existant).

## Journalisation

Chaque itération émet un `discdjLog` structuré :

```text
[i/N] BPM=134 | OCR="01 - Himra Le temps (256k)" → "Himra Le temps"
     match: track#42 "Himra - Le temps.mp3" score=0.91 ✓ enregistré
```

Cas rejet :

```text
[i/N] BPM=128 | OCR="???KOUMGBA" score=0.51 < 0.72 → À vérifier (BPM non enregistré)
```

## Sécurité de l'invariant

Le BPM mémorisé à l'étape 2 est stocké dans une variable locale de la boucle. `setTrackAnalysis` n'est appelé qu'après validation du nom à l'étape 8. Impossible d'écrire un BPM sur un mauvais fichier si le matching échoue — c'est structurellement garanti par l'ordre des étapes.

## Non couvert (hors périmètre)

- Détection automatique de la fin de playlist (Next qui ne change rien) — on garde la limite `total` de la boucle existante.
- Réordonnancement de la bibliothèque MixOrder pour matcher DiscDJ — AutoSync met à jour uniquement les BPM.
