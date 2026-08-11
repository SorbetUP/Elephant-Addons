# Proposition — Investigation Graph

## But

Offrir une surface avancée de graph analysis inspirée des outils Linkurious/i2/Bloom/Graphistry/Maltego, séparée du Graph simple destiné à la navigation quotidienne.

## Architecture

Consommer Knowledge + Ontology/Data. Ne pas posséder une troisième copie du graphe. Les positions, groupes, annotations et filtres d'une investigation sont stockés comme `SavedInvestigation` ; les entités restent référencées par ID.

## UI

Canvas dédié avec : expand neighbors, shortest path, path constraints, group/ungroup, pin, timeline, filters, entity inspector, evidence/provenance, notes d'analyste, saved views et export.

## Queries

- N-hop expansion bornée ;
- shortest paths ;
- type/edge filters ;
- temporal window ;
- community detection ;
- centrality comme analyse explicite, jamais comme vérité implicite.

## IA

Agent peut proposer une expansion ou expliquer un sous-graphe, mais chaque relation citée doit avoir provenance. Toute relation générée par IA est `inferred`, distincte d'une relation source.

## Performance

Server/worker-side graph operations pour gros graphes ; renderer ne reçoit que le viewport/subgraph utile. Layouts cancellables.

## ElephantNote API

- graph query primitives ;
- entity/relation provenance ;
- large-result streaming/pagination ;
- canvas contribution primitives ;
- saved-view storage.

## Tests

Subgraph determinism, permissions filtrées avant query, provenance, 100k+ entity backend benchmark, cancellation et export/import saved investigation.