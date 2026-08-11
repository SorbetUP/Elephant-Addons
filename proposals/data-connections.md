# Proposition — Data Connections & Computed Views

## But

Connecter SQLite/Postgres/CSV/Parquet/API tabulaires à Elephant pour explorer et produire des vues calculées sans transformer le core en BI tool et sans recopier systématiquement les bases dans le vault.

## Connections

Chaque source publie schema, tables/datasets, capabilities read/write, freshness et provenance. Credentials restent dans Secret Store. Read-only est le défaut ; write nécessite permission et proposal dédiée.

## Query

Queries sauvegardées comme objets/config textuelle versionnée. Paramètres typés, limites de rows/bytes/time, cancellation et streaming. Aucune query générée par IA n'obtient automatiquement des droits write.

## UI

Data browser : sources à gauche, schema/query au centre, table/chart/result à droite. Une `Computed View` peut être intégrée dans Dashboard/note via référence vers la query, avec état loading/stale/error visible.

Charts/tables sont des renderers de résultat et non un format de données propriétaire. Export CSV/JSON/Parquet selon capability.

## IA

L'agent peut inspecter schema puis exécuter queries read-only bornées. Toute proposition SQL write est affichée comme diff/intention et requiert approval ; idéalement exécution transactionnelle avec rollback possible.

## ElephantNote API

- Secret Store ;
- external connection handles ;
- tool risk classes ;
- jobs/streaming/backpressure ;
- generic table/chart widget contributions ;
- provenance/ACL ;
- sandbox pour drivers natifs.

## Tests

Huge result limit, cancel slow query, malformed CSV, schema change, connection lost, SQL injection dans paramètres, read-only enforcement, transaction rollback et absence de credentials dans logs/export.