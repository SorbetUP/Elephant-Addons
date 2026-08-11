# Proposition — Projects & Tasks

## But

Donner à Elephant une couche de travail structurée reliant projets, tâches, notes, réunions, documents, commits/PR, décisions et échéances sans convertir le Markdown editor en logiciel de gestion de projet monolithique.

## Modèle

Entités : `Project`, `Task`, `Milestone`, `Decision`, `Requirement`, `MeetingRef`.

Chaque entité possède un ID stable, des relations vers documents/external entities et une provenance. Les descriptions longues peuvent rester des notes Markdown liées plutôt qu'être dupliquées dans une base opaque.

## UI

- rail icon `Projects` ;
- home : projets actifs, échéances, blocked, recent activity ;
- project page : Overview / Tasks / Timeline / Notes / Links / Activity ;
- task list + kanban optionnel ;
- quick capture depuis n'importe quelle note ;
- panneau contextuel montrant les relations du document courant ;
- mobile : liste prioritaire, gestures simples, pas de board obligatoire.

## Capabilities

Read : `projects.list/get`, `tasks.search/get`, `project.context`.

Mutations : `task.propose.create/update/complete`, `project.propose.update`, `relation.propose.link`.

L'agent peut lire automatiquement selon policy ; création/repriorisation sensible reste une proposal.

## Automations utiles

- réunion terminée -> proposer tâches/decisions ;
- PR merged -> mettre à jour milestone lié ;
- deadline proche -> dashboard/reminder ;
- note contenant un requirement -> proposer liaison au projet.

## ElephantNote API

- stable entity/resource IDs ;
- typed relation store ;
- UI routes/contribution points ;
- notification/reminder API ;
- background/event triggers ;
- proposal service ;
- query API sur metadata/relations.

## Tests

Relations conservées après rename, offline edits, idempotent connector imports, proposal stale protection, filtrage par workspace et performances sur plusieurs milliers de tasks.