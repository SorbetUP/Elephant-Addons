# Proposition — Research Hub

## But

Créer une surface de recherche multi-source qui relie articles scientifiques, web, repositories et documentation aux projets/notes, en conservant provenance et versions au lieu de simples copier-coller dans le vault.

## Sources candidates

- arXiv ;
- Crossref/OpenAlex/Semantic Scholar selon licences/APIs ;
- web search/provider ;
- GitHub repositories/issues/code metadata ;
- documentation explicitement ajoutée ;
- RSS/newsletters ;
- fichiers PDF locaux.

Chaque adapter reste séparé. Le hub normalise `title/authors/date/doi/url/source/license/contentRef` et ne prétend pas posséder les contenus non copiables.

## Pipeline

`query -> federated search -> dedup -> preview -> capture/reference -> Knowledge indexing -> citations`.

Dédupliquer DOI, canonical URL et hashes. Une capture web/PDF garde `capturedAt`, source URL et content hash afin qu'une citation ne pointe pas silencieusement vers une version différente.

## UI

Recherche avec tabs/facettes source/date/type, panneau preview, raisons de ranking et actions `Open`, `Save reference`, `Archive snapshot`, `Add to project`, `Cite in note`. Une collection/projet peut afficher bibliography, reading queue et relations aux notes/experiments.

## IA

L'agent peut rechercher et comparer des sources read-only. Toute synthèse doit conserver citations vers passages exacts. Rerank/embeddings sont capabilities optionnelles, pas prérequis à la recherche lexicale.

## ElephantNote API

- external object/provenance handles ;
- network connector framework ;
- stable citation anchors pour PDF/web snapshots ;
- file handler PDF ;
- Knowledge indexing de sources externes ;
- jobs/download manager ;
- secrets pour providers éventuels.

## Tests

DOI duplicates, URL canonicalization, source supprimée après capture, article sans full text, PDF très gros, rate limit, provider offline, contenu HTML hostile/prompt injection, et synthèse qui ne cite que les sources réellement récupérées.