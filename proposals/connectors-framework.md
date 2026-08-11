# Proposition — Connectors Framework

## But

Éviter que Google Calendar, GitHub, mail, Notion, Teams, etc. réimplémentent chacun OAuth, tokens, cursors, rate limits, retries, background sync, revocation et diagnostics.

## Primitives host/addon

- `ConnectorDefinition`
- `Account`
- `CredentialRef`
- `SyncCursor`
- `RateLimitState`
- `WebhookSubscription` lorsque disponible
- `ConnectorHealth`

Le framework ne normalise pas toutes les données métier ; chaque addon garde son modèle domaine. Il normalise uniquement le lifecycle de connexion.

## UI commune

Settings > Connections : provider icon/name, accounts, scopes, status, last sync, reconnect, disconnect, diagnostics. Un addon peut ajouter ses settings métier sous son compte.

## OAuth / secrets

- PKCE/device flow selon plateforme ;
- callback/deep link géré par host ;
- credentials dans secure store ;
- scopes affichés avant consentement ;
- revocation et logout fiables.

## Sync

- scheduler ;
- exponential backoff + Retry-After ;
- cursor persisted atomically ;
- per-account concurrency ;
- offline detection ;
- manual refresh ;
- progress/status events.

## Webhooks

Seulement sur deployments disposant d'un endpoint server fiable. Desktop local doit pouvoir fonctionner avec polling/delta sync. Les deux chemins alimentent le même pipeline idempotent.

## ElephantNote API

Ce framework nécessite principalement des primitives host : secure secrets, deep links, background jobs, network permissions, notification/events et éventuellement webhook ingress dans la déclinaison Serie/server.

## Tests

Token expired, revoke, rate limit, offline, duplicate webhook, cursor corruption, account deletion, multi-account et absence de credentials dans logs.