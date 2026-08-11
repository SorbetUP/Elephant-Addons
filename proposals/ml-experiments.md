# Proposition — ML Experiments & Model Registry

## But

Relier les expérimentations ML à Elephant sans copier les datasets/checkpoints massifs dans le vault. Le plugin conserve **métadonnées, provenance, comparaisons et petits artifacts**, tandis que les fichiers lourds restent référencés vers leur stockage réel.

## Modèle

- Experiment/Run : command/config, timestamps, status, code commit/dirty state ;
- DatasetRef : path/URI, fingerprint, split/version, licence ;
- Environment : machine, OS, Python/libs, GPU/VRAM, seed ;
- Metrics : scalars/series/tables avec phase train/valid/test ;
- ArtifactRef : logs, CSV/JSON/images/checkpoint refs ;
- Model : parent run, checkpoint hash, evaluation et deployment/export status.

## Capture

SDK/CLI léger ou watcher de dossier de résultats. Un run reçoit un ID stable et écrit un manifest atomique. Importer un historique doit être idempotent via run ID/hash.

## UI

- table de runs filtrable ;
- comparaison multi-run des configs/metrics ;
- courbes séparées et tables d'erreurs ;
- liens vers notes de décision et code commit ;
- galerie de worst cases/images artifacts ;
- vue lineage dataset -> run -> model -> evaluation.

Les visualisations restent des vues calculées ; les données sources exportables restent CSV/JSON/Parquet selon taille.

## Agent

Read-only par défaut : rechercher meilleur run, comparer configs, résumer erreurs. Lancer un entraînement passe par Code Execution/Automation avec risk `execute`, preview de command/resources et approval.

## ElephantNote API

- generic objects/relations/provenance ;
- large external file handles ;
- artifact API ;
- computed views/chart contributions ;
- code execution/jobs ;
- Git/repo connector ;
- storage quotas et optional local database for metrics.

## Tests

Deux runs même config mais seeds différents, interrupted run, dataset fingerprint changé, dirty git tree, huge metric series, artifact manquant, moved experiment folder, cross-machine paths, et garantie qu'un checkpoint multi-Go n'est jamais chargé/copied intégralement dans le vault par défaut.