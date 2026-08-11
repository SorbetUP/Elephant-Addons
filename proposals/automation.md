# Proposition — Automation

## But

Créer un moteur type Make/n8n léger et local-first : déclencheur -> conditions -> actions, fondé uniquement sur des capabilities d'addons autorisées.

## Modèle

`Workflow`, `Trigger`, `Step`, `Condition`, `Run`, `RunEvent`, `SecretRef`.

Un step référence une capability versionnée avec input mapping. Le workflow ne stocke jamais directement le secret.

## Triggers

- file/note created or changed ;
- schedule ;
- calendar event ;
- project/task change ;
- connector event ;
- manual ;
- agent proposal accepted ;
- sync completed.

## Actions

Utiliser le même tool/capability registry que l'agent. Ainsi permissions, schemas et risk classes ne sont pas dupliqués.

## UI

- liste workflows + enable/disable ;
- builder nodes/steps simple ;
- inspector de chaque step ;
- dry-run ;
- run history avec inputs/outputs redacted ;
- retry depuis step idempotent ;
- mobile : édition simplifiée, surtout run/status.

## Sécurité

- workflow possède une identité/principal et des grants explicites ;
- un workflow importé arrive disabled ;
- aucune escalation si un addon gagne de nouvelles methods ;
- external writes/execute nécessitent une policy dédiée ;
- secrets référencés par handles.

## Agents

Un step `agent.run` est possible mais doit avoir budget, tools allowlist et sortie typée. Ne pas autoriser un agent général à modifier dynamiquement sa propre policy.

## ElephantNote API

- durable event bus ;
- scheduler/background jobs ;
- capability registry ;
- permission grants attachables à un workflow ;
- secret store ;
- idempotency keys + run transaction metadata.

## Tests

At-least-once events sans double mutation grâce aux idempotency keys, crash/restart, disabled workflow, cycle detection, permission revoked, timeout, concurrency et secrets absents des logs.