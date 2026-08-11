# TODO — `elephant.ai-search`

## Direction

Faire de `ai-search` l'orchestrateur de retrieval, pas un second moteur de stockage. `knowledge` reste propriétaire de l'index/chunks/vecteurs ; `ai-search` choisit les stratégies de recherche et utilise `ai` pour embeddings/reranking.

## P0

- Pipeline hybride explicite : lexical BM25 + vector + graph neighborhood + metadata filters, avec fusion de scores documentée (RRF ou calibration mesurée).
- Conserver le fallback lexical, mais signaler `retrieval_mode` dans le résultat afin qu'une UI/agent sache si la sémantique était disponible.
- Rendre l'indexation incrémentale : queue des chunks dirty, content hash, suppression des embeddings orphelins, reprise après crash.
- Utiliser `(model_id, embedding_dimension, preprocessing_version)` comme identité de l'espace vectoriel ; ne jamais mélanger deux espaces incompatibles.
- Supporter les embeddings fournis par `open-models` via `ai.inference`, sans chemin spécifique local/cloud.

## P1 — Reranking

- Ajouter une capability `rerank` optionnelle après retrieval large.
- Permettre un reranker local installé via Open Models.
- Mesurer recall@k avant rerank, nDCG/MRR après rerank, latence et mémoire ; ne pas activer un reranker par défaut sans bénéfice mesuré.

## P1 — Query planning

- Recherche par champs : titre, path, tags/frontmatter, body, links, dates, types.
- Filters structurés séparés du texte libre.
- Support d'une requête multi-hop côté agent : search -> inspect -> related.
- Dédupliquer les chunks adjacents et reconstruire une fenêtre source cohérente avant citation.

## P1 — Qualité embeddings

- Batch adaptatif, cache et retry borné.
- Commande de migration d'un modèle d'embedding vers un autre avec progression et reprise.
- Index dual temporaire pendant migration pour éviter une période de recherche vide.
- Détecter les chunks trop courts/boilerplate et éviter de gaspiller des embeddings inutiles.

## P1 — Confidentialité

- Respecter une policy `local_only` par vault/dossier/tag si configurée.
- Avant provider cloud, connaître explicitement quels chunks sortent de la machine.
- Ne jamais uploader contenu caché/exclu de l'index.

## P2 — Évaluation

Créer un petit benchmark retrieval reproductible avec queries + passages attendus, et suivre recall@5/@20, MRR, latence p50/p95, taille index et coût embeddings. Inclure hard negatives avec mots-clés proches mais sens différent.

## UI

- Recherche unifiée avec filtres rapides et badges lexical/semantic/graph.
- Afficher pourquoi un résultat est remonté uniquement dans un panneau de détails, pas en surcharge permanente.
- Action « résultats liés » et ouverture au passage exact.
- État d'indexation discret : à jour / migration / partiel / erreur.

## ElephantNote API

- file/vault change feed fiable avec create/modify/move/delete et version de contenu ;
- background jobs reprenables ;
- exclusion API commune (`.elephantignore` ou policy équivalente) ;
- deep-link vers note + range/heading.

## Tests

- aucune duplication de vecteurs après restart ;
- move/rename conserve l'identité logique ou migre proprement ;
- delete retire lexical + vector ;
- changement de modèle ne mélange jamais les dimensions ;
- fallback BM25 exact lorsque provider embeddings indisponible ;
- annulation d'un rebuild ;
- ranking benchmark avec seuils de non-régression.