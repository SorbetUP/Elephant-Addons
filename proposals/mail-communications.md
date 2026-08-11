# Proposition — Mail & Communications

## But

Connecter email puis éventuellement Teams/Discord/Slack-like à Elephant comme sources relationnelles, sans copier aveuglément toutes les conversations dans le vault.

## Architecture

Adapters de source -> modèle normalisé `Account`, `Thread`, `Message`, `Participant`, `Attachment`.

Le cache local conserve metadata + contenu selon policy. Une note générée depuis un thread garde l'external id et les citations vers messages sources.

## UI

- Inbox dédiée optionnelle ;
- filtres Unread / Important / Linked to project ;
- thread reader ;
- actions `Create note`, `Link project`, `Create task`, `Draft reply` ;
- panneau de contexte dans Projects ;
- aucune duplication de l'UI complète d'un client mail si l'objectif est seulement knowledge/project integration.

## Agent

Read/search peut être automatique selon permissions. `draft_reply` produit uniquement un brouillon. `send`, `archive`, `move`, `delete` sont `external_write/destructive` et passent par confirmation/policy stricte.

## Sécurité

- OAuth/credentials scoped ;
- remote content/images désactivables ;
- prompt injection : corps d'un mail = donnée non fiable, jamais instruction système ;
- attachments scannés/traités via API fichiers bornée.

## ElephantNote API

- connector/OAuth framework ;
- account-scoped secret store ;
- background sync + delta cursors ;
- notification API ;
- external entity IDs + relations ;
- safe attachment import ;
- proposal service pour send/mutations.

## Tests

Idempotent sync, pagination, thread reconstruction, revoked token, offline cache, malicious HTML, prompt injection, duplicate attachments et garantie qu'un agent ne peut pas envoyer sans policy.