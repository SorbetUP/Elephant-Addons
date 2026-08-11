# Proposition — GitHub / Dev Activity

## But

Relier repositories, issues, PR, reviews, commits, releases et CI aux projets/notes/decisions Elephant sans faire de GitHub un composant du core.

## Modèle

`Repository`, `Issue`, `PullRequest`, `Commit`, `Review`, `WorkflowRun`, `Release` avec external IDs stables. Relations : project↔repo, task↔issue, decision↔PR, note↔commit, incident↔workflow.

## UI

- page `Dev` : repos suivis + PR nécessitant attention + CI failing ;
- project tab `Development` ;
- PR card compacte avec status/review/CI ;
- deep link vers GitHub ;
- activité récente comme timeline, pas duplication complète de GitHub.

## Agent

Read tools : search repos/issues/PR, inspect diff/status.

Write tools : create issue/comment, review, merge, rerun workflow = external writes avec scopes et confirmation adaptés. Un merge ou une mutation de branche est high-risk.

## Sync

Webhook lorsqu'un backend server existe ; polling delta sinon. Cache cursor/idempotence obligatoires. Ne pas lancer un full repository scan à chaque ouverture.

## ElephantNote API

- connector/OAuth framework ;
- external entity store/relations ;
- background sync ;
- notification/action inbox ;
- proposal service ;
- optional webhook ingress pour déploiements Serie/server.

## Tests

Pagination, rate limits, revoked token, duplicate events, force-push/history changes, PR from fork, CI matrix, write permission scopes et absence de merge silencieux.