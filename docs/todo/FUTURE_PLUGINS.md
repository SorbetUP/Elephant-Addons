# Backlog d'idées — futurs addons Elephant

Le dossier `proposals/` contient les architectures déjà détaillées. Cette liste conserve aussi des idées à explorer plus tard sans forcer leur implémentation maintenant.

## P0/P1 utiles à beaucoup de projets

### Block References

Références stables vers heading/paragraphe/list item/code block, backlinks et transclusion. UI : copier un lien vers un bloc, panneau backlinks, highlight source. Nécessite BlockHandle/lifecycle côté ElephantNote ; ne pas bricoler des offsets DOM.

### Computed Views

Tables/listes/charts read-only alimentés par queries Knowledge/Data/Tasks/Experiments. UI : embed dans note/dashboard avec query visible, freshness/error et open-source. Les mutations restent séparées.

### Templates

Templates avec variables typées, preview et création atomique multi-fichiers. UI : picker/search, formulaire généré depuis schema, diff des fichiers qui seront créés.

### Generic Import/Export Hub

UI commune `scan -> preview -> conflicts -> apply -> report` pour Google Keep, Apple Notes, Notion, Obsidian, exports divers. Chaque adapter fournit parse/normalize, pas son propre système de conflits.

## Développement logiciel

### CI Observer

GitHub/GitLab/Jenkins-like providers : runs, jobs, logs, flaky tests, failure clusters. UI : timeline de pipeline, groupement des erreurs, lien issue/commit/requirement. Read-only par défaut ; rerun/cancel via external-write proposal.

### API Contracts

Importer OpenAPI/GraphQL/protobuf, explorer endpoints/types et produire diffs breaking/non-breaking. UI : schema tree + endpoint view + version diff. Génération de code via Code Execution séparée.

### Release Intelligence

Relier commits/PR/issues/tests/artifacts/releases, détecter changement non couvert ou requirement sans release. Très utile comme couche Serie au-dessus de GitHub + Requirements.

## Recherche et ML

### Dataset Catalog

Datasets, versions/splits, provenance, licences, hashes, QC et annotations. Les volumes restent hors vault ; Elephant conserve manifest/relations et visualisations. UI : cases browser, filtres, lineage et QC status.

### Model Registry

Checkpoint/model cards, parent run, metrics, quantization/export, deployment/evaluation. Peut partager le modèle d'objets de `ml-experiments`.

### Evaluation Lab

Suites d'évaluation, cas difficiles, reviewers, regressions et comparaison de modèles. UI : table case x model, worst cases, distributions, diff sorties et lien vers artefacts.

### Web Archive

Snapshot versionné d'une URL : canonical URL, date, hash, texte/assets metadata et diff entre captures. Sépare clairement « référence live » et « evidence capturée ».

## Productivité personnelle

### Tasks

Déjà couvert par Projects & Tasks mais peut avoir un mode léger standalone : recurrence, dependencies, due dates, backlinks et Calendar contribution. UI list/Kanban/timeline.

### Anki Bridge

Sync/export/import de cards avec source BlockHandle, deck et scheduling metadata. Eviter cards dupliquées sans lien vers leur texte source.

### Daily/Periodic Notes

Rules de nom/template/calendar, navigation jour/semaine/mois et queries. La création périodique doit être déterministe, pas un cron qui crée des doublons.

## Documents et médias

### PDF Workspace

Viewer, annotations, text extraction/OCR, citations page+region et liens vers notes. Handler `.pdf` normal ; sans addon, fallback app système.

### Office Export

Pipelines DOCX/PPTX/PDF via renderers/addons, templates, preview et assets. Le core n'embarque pas les moteurs de conversion.

### Image Annotation

Regions/labels/comments sur images, links vers notes/objects, vision/OCR optionnels. Utile pour ML datasets et documentation.

## Connecteurs

Apple Notes, Notion, Google Keep live si API viable, Google Drive, Dropbox, OneDrive/SharePoint, Jira/Linear, Slack/Teams/Discord, GitLab. Tous doivent utiliser Secret Store + connector framework + provenance + proposals pour writes.

## Automatisation

### Flow Builder

DAG type Make : document event/schedule/webhook -> conditions -> steps -> approval gates -> outputs. UI canvas + représentation textuelle versionnable. Runs durables/idempotents via host jobs.

### Python Automation

Steps Python au-dessus de Code Execution sandbox, inputs/outputs typés et artifacts. Aucun réseau/vault write implicite.

## Intégrations assistants

MCP Bridge est détaillé dans `proposals/mcp-bridge.md`. D'autres adapters Claude/Codex/local agents doivent tous converger vers les mêmes resources/tools/policies plutôt que créer un chemin privilégié.

## Priorité suggérée

1. Block References + File Handlers + Computed Views ;
2. Research Hub/Web Archive + PDF Workspace ;
3. ML Experiments/Dataset Catalog/Evaluation Lab ;
4. CI/API/Release Intelligence ;
5. Serie Meetings/Requirements + connectors enterprise ;
6. Flow Builder/Data Connections/MCP selon usages réels.