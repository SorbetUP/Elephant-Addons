# TODO — `elephant.recently-edited`

## Direction

Recently Edited est utile, mais sa logique peut devenir le premier cas d'un système plus général de **Smart Lists / saved queries** au lieu de multiplier les sections codées en dur dans la sidebar.

## P0

- Tri déterministe par dernière modification réelle, avec tie-break stable.
- Exclure fichiers internes/hidden selon policy commune.
- Mise à jour event-driven sur save/rename/delete ; pas de rescan complet à chaque rendu.
- Conserver l'item sélectionné lors du refresh pour éviter les sauts UI.

## P1 — Smart Lists

Extraire un contrat de requête : recently edited, created recently, pinned, tag/project, unfinished tasks, unread/imported, etc. Un addon peut contribuer une Smart List sans réimplémenter une sidebar complète.

## P1 — Scoring optionnel

Une liste « Recent & relevant » peut combiner récence, fréquence d'ouverture et pinning, mais doit rester distincte de la liste strictement chronologique. Ne pas cacher l'algorithme derrière le nom « Recently edited ».

## P1 — UX

- section repliable ;
- nombre configurable ;
- contexte menu cohérent avec file tree ;
- drag/drop si sémantiquement valide ;
- mobile touch target suffisante ;
- pas de duplication avec note déjà épinglée si option configurée.

## ElephantNote API

- metadata query API ;
- file change events ;
- sidebar contribution + saved query contract.

## Tests

- save/rename/delete ;
- modification externe via explorateur ;
- exclusion hidden/internal ;
- ordre stable ;
- gros vault sans rescan UI ;
- comportement mobile/sidebar collapsed.