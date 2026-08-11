# TODO — `elephant.graph`

## Direction

Le Graph doit devenir une vue interactive sur Knowledge, pas une reconstruction indépendante de toutes les notes dans le renderer.

## P0 — Scalabilité

- Pagination/stream des nœuds et edges depuis Knowledge.
- Aucun hard cap silencieux.
- Level-of-detail : cluster/communauté à zoom faible, nœuds individuels à zoom fort.
- Layout calculé hors thread UI ou incrémental.
- Budget frame time mesuré sur desktop et mobile.

## P0 — Identité

- Utiliser stable document ids.
- Rename ne doit pas créer un nouveau nœud.
- Distinguer note, Wiki, attachment, external entity et autres types via metadata, pas couleur implicite seulement.

## P1 — Graph sémantique

- Toggle edges : explicit links / semantic / tags / projects / external relations.
- Confiance et provenance visibles au détail.
- Les relations inférées doivent être visuellement distinguées des liens explicites.
- Filtrage par période, dossier, tag, type, communauté.

## P1 — Interaction

- Click : sélection + preview ; double click/open : navigation note.
- Multi-select et focus neighborhood N hops.
- Breadcrumb de navigation graph.
- Recherche qui centre le graphe sans perdre les filtres actifs.
- Back/forward de navigation.

## P1 — Investigation mode

Préparer un mode avancé inspiré des outils de graph analysis : pin nodes, expand neighbors, shortest path, group, annotate, save view. Ce mode peut devenir un addon avancé séparé si l'UI de base devient trop complexe.

## P1 — Mobile

- Gestes pinch/pan cohérents ;
- labels réduits ;
- pas de hover-only interactions ;
- limite dynamique basée sur performance, avec expansion explicite et non cap arbitraire.

## P2 — Export

- Export JSON/GraphML ou format documenté avec ids/types/edges/provenance.
- Saved graph views stockées comme config, pas comme copie du graph entier.

## ElephantNote API

- generic graph viewport contribution ;
- stable deep-links vers notes/entities ;
- worker/background compute API ;
- pointer/gesture primitives cohérentes desktop/mobile.

## Tests

- rename conserve nœud ;
- 10k/50k nodes benchmark sans freeze catastrophique ;
- filtres déterministes ;
- relation inférée conserve provenance ;
- navigation open/back correcte ;
- aucune limite silencieuse de 200 nœuds ou équivalent.