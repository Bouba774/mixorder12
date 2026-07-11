# Plan — Refonte AutoSync + moteur de calibration DiscDJ

## Objectif

Rendre le mode AutoSync réellement fiable en calquant la logique du robot sur le comportement réel de DiscDJ (la ligne bleue = 1re position = morceau chargé sur le deck), en supprimant la calibration inutile, en corrigeant le décalage des clics et en imposant à chaque calibration le bon contexte d'écran.

## 1. Suppression de la calibration « ligne sélectionnée »

- Retirer `playlistSelectedRow` de `CalibrationTarget`, `DiscDJCalibration`, `DEFAULT_DISCDJ_SETTINGS`, normalisation et UI (`DiscDJRobotPanel`, `AUTOSYNC_TARGETS`).
- Retirer toute exigence de cette calibration dans `discdj-robot.ts` (bloc `autosync-name`).
- Ne pas casser les settings existants : la normalisation ignore silencieusement l'ancien champ.

## 2. Nouvelle sémantique AutoSync

Dans `discdj-robot.ts`, mode `autosync-name`, boucle simplifiée :

```text
1. Écran principal → lire BPM du deck (vote existant) → mémoriser
2. Vérifier écran principal (assertScreen('main'))
3. Tap Playlist
4. Attendre écran playlist stable (assertScreen('playlist'))
5. OCR de la 1re ligne visible (toujours en haut, toujours bleue) → nom brut
6. fuzzy match sur bibliothèque (name-normalize) — si score < seuil → « À vérifier »
7. Sinon : setTrackAnalysis(track.id, {bpm: memorizedBpm})
8. Tap Retour → attendre écran principal stable
9. Tap Next → waitForTrackReady
10. Recommencer
```

La zone OCR de la 1re ligne est **calculée automatiquement** à partir des dimensions écran (bande haute de la moitié gauche = deck 1, moitié droite = deck 2, hauteur ~10% écran juste sous le bouton Retour). Aucun calibration manuelle.

Ajout d'une nouvelle méthode `readFirstPlaylistRow(deck)` côté bridge qui utilise cette zone auto (pas de rect stocké dans settings).

## 3. Détection d'écran (`main` vs `playlist`)

Nouveau helper `detectScreen(bridge)` :
- Prend un screenshot via le pipeline OCR existant (réutilise `readBpm` sans zone → renvoie tout le texte visible).
- Heuristique : présence de mots-clés `SAMPLER`, `SYNC`, `TEMPO`, `CUE`, `KEY LOCK` → `main` ; présence de `Rechercher` ou plusieurs lignes préfixées par `N.` → `playlist`.
- Renvoie `'main' | 'playlist' | 'unknown'`.

Nouveau helper `waitForScreen(bridge, expected, timeoutMs)` : boucle 200 ms jusqu'à obtenir la bonne détection ou timeout. Utilisé avant chaque action AutoSync. Si mismatch persistant :
- attendu `main` → tap Retour de secours puis retry
- attendu `playlist` → tap Playlist de secours puis retry
- après 2 tentatives : abandon de l'étape, log erreur, l'itération est marquée « à vérifier ».

## 4. Calibration contextuelle

Nouveau champ optionnel `requires: 'main' | 'playlist'` par target :

```ts
{ id: 'nextDeck1',    requires: 'main' }
{ id: 'bpmDeck1',     requires: 'main' }
{ id: 'playlistButton', requires: 'main' }
{ id: 'backButton',   requires: 'playlist' }  // ← corrigé
```

Nouvelle fonction `captureCalibration(target)` refondue dans `discdj-robot.ts` :

```text
1. Ouvrir DiscDJ
2. Si requires === 'playlist' :
   - vérifier que playlistButton est calibré ; sinon message d'erreur clair
   - taper playlistButton
   - waitForScreen('playlist')
3. Si requires === 'main' :
   - si écran actuel = playlist ET backButton calibré → taper backButton
   - waitForScreen('main')
4. bridge.captureCalibration(target)
5. Enregistrer coordonnées **brutes** (voir §5)
6. Contrôle automatique : bridge.testTapAt(point) → log
```

Cela règle le cas « recalibrage Retour » demandé par l'utilisateur.

## 5. Moteur de calibration sans décalage

Le décalage vient de l'utilisation d'une « canonical landscape » où la capture native normalise en `[0,1]` selon les dimensions au moment de la capture, puis le tap re-multiplie par les dimensions au moment du clic. Si l'orientation ou la barre système diffère entre capture et clic → décalage.

Correctifs :

- Côté natif Android (`DiscDJAccessibilityService.java`) :
  - `captureCalibration` renvoie `{ xPx, yPx, displayW, displayH, orientation }` en **pixels réels** (pas juste normalisés).
  - `tapAt` accepte `{ xPx, yPx, refW, refH }` : si `refW/refH` correspondent aux dimensions actuelles, tape en pixels absolus sans mise à l'échelle ; sinon rescale proportionnellement.
- Côté TS (`discdj-settings.ts` `CalibrationPoint`) : étendre en `{ x, y, refWidth, refHeight, orientation }` en gardant `x,y` normalisés pour rétro-compat mais en préférant les pixels si présents.
- Nouveau plugin call `discdj.testTap({point})` qui rejoue exactement la même transformation → l'utilisateur voit un flash à l'endroit tapé (overlay natif).
- Après chaque capture, appeler `testTap` et logger « ✅ clic de contrôle effectué à (x,y) ».

## 6. UI (`DiscDJRobotPanel`)

- Retirer la ligne « Ligne sélectionnée » de `AUTOSYNC_TARGETS`.
- Regrouper les targets par écran (`Écran principal` / `Écran playlist`) avec un badge indiquant le contexte.
- Chaque bouton « Calibrer » lance le nouveau flow contextuel automatique (ouverture DiscDJ + navigation).
- Après capture : afficher « Vérification… » puis « ✓ Position validée » ou « ✗ Position incorrecte — recommencer ».

## Fichiers modifiés

- `src/lib/analysis/discdj-settings.ts` — suppression `playlistSelectedRow`, `CalibrationPoint` étendu, targets par écran.
- `src/lib/analysis/discdj-bridge.ts` — nouvelles méthodes `detectScreen`, `readFirstPlaylistRow`, `testTapAt`, signature `tapNext` étendue.
- `src/lib/analysis/discdj-robot.ts` — boucle AutoSync réécrite, `captureCalibration` contextuel, helpers `waitForScreen`.
- `src/components/mixorder/DiscDJRobotPanel.tsx` — UI targets par contexte, retour de validation.
- Plugins natifs Android (`DiscDJAccessibilityService.java`, `DiscDJRobotPlugin.java`) — capture en pixels + testTap + detectScreen + readFirstPlaylistRow.
- `.lovable/plan.md` — mise à jour.

## Hors périmètre

- La partie native Android est modifiée dans le code source des plugins mais **ne peut pas être compilée dans la sandbox web** (Android Studio requis). Le comportement dans le navigateur reste simulé.
- Le mode AutoSync (name-checked) reste distinct du mode Auto (ordre aligné) — les deux coexistent.
