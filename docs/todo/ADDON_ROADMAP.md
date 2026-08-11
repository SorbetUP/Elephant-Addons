# Roadmap technique — Elephant Addons

Cette branche documente des chantiers, pas des features déjà livrées.

## Phase 0 — Corriger les frontières et risques

1. Étendre ElephantNote avec resource handles/revisions, events, secrets, jobs, tool registry/proposals et UI extension points.
2. Traiter les risques P0 indépendants : ownership/cleanup Sites, sandbox Code Execution, secrets providers/connectors.
3. Établir une conformance suite addon et des acceptance paths réels ; le smoke d'import reste seulement un guard statique.
4. Supprimer progressivement les accès `Pinia._s`, Tauri direct, DOM privé et polling lorsque l'API host équivalente existe.

## Phase 1 — IA locale et agent

1. `elephant.ai` devient le contrat unique de capabilities : generation, embed, tools, structured output, rerank, vision/OCR, speech.
2. Remplacer `buffered-stream` par streaming réel.
3. `open-models` devient runtime local multi-driver et fournit au minimum chat + embeddings ; ensuite rerank/vision/OCR selon backends réels.
4. `knowledge` possède identité/chunks/provenance/vector spaces et ingestion incrémentale.
5. `ai-search` orchestre lexical + semantic + rerank sans devenir une seconde base de vérité.
6. `ai-chat` implémente la vraie boucle model -> tool -> result -> model avec budgets/policy/proposals.
7. `ai-ocr` migre vers la capability `vision.ocr` et devient shim/provider spécialisé transitoire.

## Phase 2 — Une seule projection de connaissance

Graph et Wiki consomment Knowledge en régime normal au lieu de reparcourir/parser toutes les notes. Centraliser title/frontmatter/tags/wiki links/headings/block refs. Les fallbacks lexicaux restent explicites et marqués degraded.

## Phase 3 — Addons productifs

- Calendar : modèle correct + adapters Apple/Google/CalDAV séparés.
- Dashboard : host de widgets contribués, pas monolithe.
- Sync : classes de storage, conflits/tombstones, device management.
- Imports : framework scan/preview/plan/apply/idempotence.
- Sites : workspace generated owned, build adapters, publishers externes.
- Code Execution : sandbox profiles, streaming process, artifacts.
- Recently Edited : events, smart lists, aucun polling.

## Invariants transversaux

- lecture automatique possible ; mutation sensible inspectable ;
- external write/execute/destructive ne sont jamais implicitement autorisés par un modèle ;
- tout sidecar a lifecycle/status/logs/cancel/crash recovery ;
- données dérivées reconstructibles non synchronisées par défaut ;
- aucune limite silencieuse du nombre de notes ; pagination/backpressure ;
- provenance et revision accompagnent citations/proposals ;
- desktop/mobile partagent les contrats et annoncent les capabilities absentes ;
- les erreurs dégradées restent visibles et corrélables.

## Dépendances principales vers ElephantNote

Voir la branche `develop_todo` d'ElephantNote : Addon API v2, Document Resource API, tools/proposals, secrets/permissions, jobs, UI extensions, editor block lifecycle, file handlers/assets, sync storage classes et testing/release trust.