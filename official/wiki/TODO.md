# TODO — `elephant.wiki`

## Rôle cible

Le Wiki doit transformer la couche Knowledge en synthèses durables **traçables**, sans confondre suggestion IA et connaissance acceptée par l'utilisateur.

## P0 — Lifecycle explicite

Standardiser : `candidate -> proposed -> accepted/rejected -> stale -> refreshed/archived`.

Une proposition conserve : id, titre, objectif, sources exactes, versions des sources, modèle/méthode, date, confidence éventuelle et diff avec une version précédente.

## P0 — Staleness

- Une source modifiée après génération rend la proposition potentiellement stale.
- Calculer le stale state depuis versions/content hashes, pas seulement timestamps.
- Afficher quelles sources ont changé avant de proposer une régénération.
- Ne jamais écraser une page Wiki éditée manuellement sans proposal/diff.

## P0 — Evidence-first

- Chaque affirmation synthétique importante doit pouvoir remonter à une ou plusieurs citations.
- Les citations pointent vers document/version/range.
- Ne pas accepter de « citation » inventée uniquement depuis le texte du modèle.
- Permettre d'inspecter les extraits sources avant acceptation.

## P1 — Fusion avec édition utilisateur

- Séparer section generated et modifications humaines seulement si nécessaire ; préférer un vrai three-way merge.
- Precondition sur version cible avant apply.
- Diff sémantique lisible : added/removed claims et sources.

## P1 — Détection de sujets

- Communities Knowledge comme signal, pas vérité unique.
- Critères : cohésion, nombre de sources, diversité, stabilité dans le temps.
- Éviter de proposer des Wikis sur des clusters trop petits ou purement structurels.
- Permettre Refuser et ne pas reproposer immédiatement le même sujet.

## P1 — UI

- Inbox de suggestions Wiki compacte.
- Preview sources + synthèse + diff.
- Accept / Reject / Later.
- État `Outdated` avec source ayant changé.
- Page Wiki ouvrable comme note normale, avec panneau provenance repliable.

## P2 — Agent integration

- Tools read-only : list suggestions, inspect evidence.
- Tools mutation : create/update/reject uniquement comme proposal soumise à policy.
- L'agent ne peut jamais auto-accepter une synthèse comme vérité si la policy exige review.

## ElephantNote API

- typed proposal/diff service ;
- stable document ids + versions ;
- deep-links vers ranges ;
- UI contribution point pour inbox/provenance panel.

## Tests

- source modifiée => stale ;
- accept applique exactement la version previewée ;
- cible modifiée entre preview/apply => conflit, pas overwrite ;
- citations survivant au rename ;
- rejected topic non reproposé avant condition explicite ;
- aucun Wiki accepté sans provenance vérifiable.