# TODO — `elephant.google-keep-import`

## Direction

Conserver Google Keep comme adapter, mais extraire un **import framework** réutilisable : parse -> normalize -> preview -> plan -> apply -> provenance. Cela évitera que chaque futur importeur Notion/Apple Notes/Obsidian/web réimplémente conflits, attachments et dry-run.

## P0 — Idempotence

- external source id stocké en metadata d'import ;
- réimport du même Takeout ne duplique pas les notes ;
- détecter changed/unchanged/deleted lorsque la source le permet ;
- choix explicite pour conflit avec note modifiée localement.

## P0 — Preview/plan

Avant écriture : nombre de notes, attachments, labels, archives, erreurs, collisions de noms et espace disque estimé. Générer un plan déterministe que l'utilisateur peut appliquer ou annuler.

## P0 — Attachments

- checksum ;
- noms sûrs ;
- MIME/type vérifié ;
- liens relatifs corrects ;
- déduplication optionnelle ;
- path traversal interdit ;
- rollback/cleanup des fichiers partiellement importés.

## P1 — Fidelity

Mapper titres, body, checklists, labels, pinned/archived, dates, couleurs éventuelles et media avec provenance. Lorsqu'une propriété n'a pas d'équivalent Elephant, la préserver en frontmatter namespacé plutôt que la jeter silencieusement.

## P1 — Generic importer API

Proposer `importer.detect`, `importer.inspect`, `importer.plan`, `importer.apply`. Google Keep devient un provider de cette API. Futurs adapters : Notion, Apple Notes, generic Markdown, Evernote, web export.

## P1 — Web/RSS

Le support web/RSS actuel doit être clairement séparé d'un Takeout import : source réseau, refresh et sécurité sont différents. Envisager un addon Web Capture/Feeds dédié si le scope devient large.

## UI

Wizard court : Source -> Preview -> Conflicts/options -> Import -> Report. Le report liste erreurs actionnables et liens vers notes créées, sans HTML lourd généré dans le vault.

## ElephantNote API

- import transaction/batch write ;
- attachment handles ;
- safe path allocator ;
- rollback staging area ;
- generic importer contribution point.

## Tests

- même archive importée deux fois ;
- collisions ;
- malformed ZIP/path traversal ;
- attachments manquants/corrompus ;
- interruption et reprise ;
- Unicode ;
- note modifiée localement avant réimport ;
- rapport de provenance complet.