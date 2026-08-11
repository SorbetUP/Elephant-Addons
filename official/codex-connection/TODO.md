# TODO — `elephant.codex-connection`

## Direction

Codex Connection doit devenir principalement un **provider adapter** pour `elephant.ai` et, si nécessaire, une capability de coding-agent distincte. Le reste de l'écosystème ne doit pas dépendre directement de Codex pour le chat générique.

## P0 — Provider conformance

- Publier capabilities exactes : chat/streaming/tools/reasoning/usage selon ce que le backend expose réellement.
- Mapper modèles vers l'identité de `elephant.ai`.
- Reprendre le même error model, cancellation et streaming contract.
- Aucun chemin spécial dans `ai-chat` pour « ChatGPT subscription ».

## P0 — Auth lifecycle

- états : signed-out / authorizing / ready / expired / revoked / error ;
- refresh/re-auth sans perdre conversations ;
- secrets stockés via host secure store ;
- logout purge credentials package-owned ;
- aucune auth donnée dans logs.

## P1 — Usage

Exposer usage/quota comme metadata provider structurée : window, used/remaining lorsque connu, reset timestamp et source. L'UI de settings peut afficher hourly/weekly sans parser du texte.

## P1 — Coding-agent vs inference

Si Codex possède des opérations agentiques spécifiques (workspace, patch, command execution), ne pas les faire passer pour de simples completions. Publier une capability distincte, avec permissions filesystem/execute explicites et proposal/diff avant mutation.

## P1 — Fallback

Si Codex indisponible, `elephant.ai` peut router vers un autre provider seulement si policy autorise fallback. Une conversation ne doit pas changer de provider silencieusement.

## UI

- carte provider avec compte, état, modèles, usage, reset ;
- bouton reconnect/logout ;
- erreurs actionnables ;
- détails techniques repliables.

## ElephantNote API

- secure credential store ;
- OAuth/device-flow helpers si approprié ;
- provider health events ;
- workspace permission handles pour coding-agent.

## Tests

- auth expiry/recovery ;
- logout purge ;
- provider conformance ;
- usage reset date correcte ;
- streaming cancellation ;
- capability coding-agent ne reçoit jamais des droits filesystem sans grant.