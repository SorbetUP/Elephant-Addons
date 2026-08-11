# Proposition — Analytics

## But

Construire des analyses reproductibles sur les données Elephant/connecteurs : métriques, tableaux, charts, rapports, sans transformer chaque Dashboard widget en mini moteur analytique différent.

## Sources

Saved queries de l'Ontology/Data layer, project/task data, GitHub, calendar, note metadata, imports et éventuellement fichiers CSV/JSON/Parquet.

## Architecture

- `DatasetRef` versionné ;
- transformations déclaratives ;
- metric definitions ;
- cached result avec source versions ;
- chart spec indépendant du renderer ;
- provenance complète jusqu'aux lignes/entities sources.

## UI

- Analytics home ;
- table preview ;
- metric cards ;
- chart builder simple ;
- advanced query/editor optionnel ;
- saved report -> Dashboard widget ;
- export CSV/image/document.

## IA

L'IA peut proposer une query/visualisation, mais l'exécution passe par le moteur déterministe. Une conclusion générée doit citer les datasets/filters/time windows utilisés.

## Performance

Pour gros volumes, envisager DuckDB/Arrow-like comme moteur package-owned, sans exposer les tables internes du host comme API publique. Lazy scans et limits par défaut.

## ElephantNote API

- typed dataset/query provider ;
- entity query API ;
- package data/temp storage ;
- worker/background compute ;
- chart UI contribution ;
- export file handles.

## Tests

Résultats déterministes, timezone/date filters, nulls, dataset version invalidation, gros CSV, cancellation, query resource limits et provenance.