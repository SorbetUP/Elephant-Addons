# TODO — `elephant.knowledge`

## Rôle cible

Knowledge doit rester la couche de connaissance canonique indépendante du provider IA : identité des documents, chunks, relations, provenance, embeddings, communautés et état d'indexation. Les addons de recherche/agent consomment cette couche ; ils ne reconstruisent pas leur propre base parallèle.

## P0 — Identité et index incrémental

- Introduire un `document_id` stable indépendant du path lorsque possible.
- Content hash + version monotone pour détecter modification réelle, rename et stale writes.
- Journaliser create/modify/move/delete pour permettre un index incrémental reprenable.
- Purger chunks/vectors/edges orphelins transactionnellement.
- État explicite : `ready`, `partial`, `rebuilding`, `degraded`, `error`.

## P0 — Provenance

Chaque chunk/relation/claim généré doit pouvoir référencer : source document, version, range/heading/page, méthode d'extraction, timestamp et éventuellement modèle. Une citation ne doit pas être reconstruite à partir d'un texte copié sans lien vers la source.

## P0 — Schéma versionné

- Version de schéma persistée.
- Migrations testées, reprenables et rollback ou rebuild propre lorsque nécessaire.
- Aucun changement de format silencieux lors d'une mise à jour addon.

## P1 — Hybrid graph

- Distinguer liens explicites `[[wiki]]`, liens de fichiers, relations frontmatter et relations inférées.
- Poids/confiance/provenance par edge.
- API de voisinage bornée et paginée.
- Communautés recalculées incrémentalement ou en background job.
- Ne pas présenter une relation inférée comme un fait utilisateur.

## P1 — Embedding spaces

- Namespace par model/revision/dimension/preprocessing.
- Statut de couverture (% chunks vectorisés).
- Migration dual-index contrôlée.
- API pending/save idempotente et batchée.

## P1 — Extraction structurée

Ajouter progressivement un modèle de metadata commun : headings, tags, frontmatter, tasks, dates, attachments, external ids et typed relations. Conserver le Markdown comme source de vérité ; l'index est reconstruisible.

## P1 — Exclusions et confidentialité

- Règles explicites par dossier/glob/tag.
- Les exclusions s'appliquent à lexical, embeddings, graph et agents.
- Indiquer pourquoi un document n'est pas indexé.

## P1 — Inspection

Une API `inspect(document_id)` doit permettre de diagnostiquer chunks, edges, embedding status, dernière indexation et erreurs sans ouvrir les fichiers internes de la base.

## P2 — Qualité

- Détecter duplicate/near-duplicate notes.
- Mesurer couverture de liens cassés.
- Détecter index drift via vérification périodique échantillonnée.
- Benchmark rebuild et incremental update sur petits/gros vaults.

## ElephantNote API

- stable file identity ou mécanisme de rename events ;
- file change feed ordonné ;
- background jobs ;
- transaction/precondition primitives ;
- deep-link vers heading/range/page ;
- shared exclusion policy.

## Tests

- rename sans duplication ;
- crash au milieu d'un rebuild puis reprise ;
- delete retire toutes les références ;
- migration schema reproductible ;
- source version change rend les citations/proposals stale ;
- vector spaces incompatibles jamais fusionnés ;
- exclusion absolue des documents configurés ;
- index entièrement reconstruisible à partir du vault.