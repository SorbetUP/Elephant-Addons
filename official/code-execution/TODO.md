# TODO — `elephant.code-execution`

## Direction

Le code execution doit rester une capability explicitement risquée. L'objectif n'est pas seulement « Run » dans un code block, mais un runtime borné, observable et utilisable par l'utilisateur ou un agent sous policy.

## P0 — Sandbox profiles

Définir des profiles :

- `pure-compute`: stdin + CPU/RAM/time, aucun fichier/réseau ;
- `vault-read`: lecture scoped ;
- `vault-workspace`: lecture/écriture dans dossier explicitement accordé ;
- `network`: accès réseau explicitement accordé ;
- `full-rights`: uniquement choix utilisateur explicite.

Un langage/runtime ne doit pas obtenir plus de droits simplement parce qu'il est installé.

## P0 — Resource limits

- timeout hard ;
- CPU/memory/process count ;
- output bytes/lines ;
- file size/quota ;
- cancellation process-tree ;
- kill fiable des enfants ;
- état `running/stopped/timed_out/failed`.

## P0 — Agent integration

`code.execute` = risk class `execute`. Le tool schema indique runtime, code, inputs et sandbox profile. Par défaut l'agent propose l'exécution et montre code + droits. Une règle utilisateur peut autoriser automatiquement `pure-compute`, mais pas transformer cela implicitement en full-rights.

## P1 — Runtimes

- package-owned runtimes versionnés ;
- version exacte dans résultat ;
- détecter absence du runtime avant exécution ;
- installation/update séparée ;
- éviter dépendance au PATH système comme comportement principal.

## P1 — Notebook/session

Optionnellement supporter session stateful par note, mais garder un mode stateless déterministe par défaut. Afficher clairement quand un kernel/session conserve de l'état.

## P1 — UI code blocks

Toolbar stable : language / Run / Stop / Copy / sandbox details. Output intégré : stdout/stderr séparables, scroll, truncation explicitement signalée, durée et exit code. Le rendu de sortie ne doit pas provoquer divergence DOM/editor.

## P1 — Artefacts

Permettre à un run de déclarer des outputs (image/csv/file) dans un workspace temporaire, puis proposer explicitement leur import dans le vault.

## P1 — Reproductibilité

Capturer runtime version, args, env allowlisted et input hashes. Un « rerun » doit pouvoir reproduire les mêmes paramètres sans conserver tous les secrets.

## P2 — Remote/accelerated runners

Ne pas inclure cela dans le contrat local initial. Si ajouté, utiliser un provider de execution séparé derrière la même capability, avec provenance et permissions visibles.

## ElephantNote API

- sandbox/process API package-scoped ;
- temp/workspace handles ;
- permission grants granulaires ;
- streamed stdout/stderr ;
- binary artifact attachment API.

## Tests

- infinite loop timeout ;
- fork/child process killed ;
- output flood bounded ;
- path traversal ;
- réseau interdit dans profile pure ;
- vault write interdit en read-only ;
- Stop libère processus ;
- renderer reste stable après outputs volumineux ;
- agent ne peut escalader le sandbox demandé.