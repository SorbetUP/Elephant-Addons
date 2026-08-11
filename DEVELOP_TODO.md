# Elephant Addons — develop_todo

Cette branche est une branche de conception. Elle ne doit pas servir à annoncer qu'une fonctionnalité est implémentée : les fichiers `TODO.md` décrivent des évolutions à réaliser, leurs raisons, leurs dépendances vis-à-vis d'ElephantNote et les tests nécessaires pour considérer le travail terminé.

## Principes transverses

1. **Capabilities avant couplage direct.** Un addon consomme une ressource versionnée (`notes.*`, `knowledge.*`, `ai.*`, etc.) et ne dépend pas du code interne d'un autre addon.
2. **Lecture automatique, mutation contrôlée.** Une capacité read-only peut être appelée automatiquement ; toute mutation sensible doit passer par une policy explicite, une proposition inspectable et, selon le niveau de risque, une confirmation utilisateur.
3. **Contrats versionnés et introspectables.** Chaque ressource doit publier sa version, ses méthodes, ses capacités et ses limites opérationnelles.
4. **Parité desktop/mobile mesurée.** Une capability absente d'une plateforme doit être déclarée absente, jamais remplacée silencieusement par un comportement différent.
5. **Tests comportementaux.** Le smoke test d'import d'un addon est nécessaire mais insuffisant. Les invariants fonctionnels, sécurité, reprise, annulation et compatibilité doivent être testés.
6. **Observabilité sans fuite de secrets.** Chaque addon doit fournir des erreurs typées, des métriques utiles et des journaux corrélables sans exposer tokens, contenus privés ou credentials.
7. **Dégradation explicite.** Les fallbacks (BM25, CPU, mode offline, provider secondaire, etc.) doivent être visibles dans l'état retourné et dans l'UI.

## TODO associés aux addons officiels

- `official/ai/TODO.md`
- `official/ai-chat/TODO.md`
- `official/ai-search/TODO.md`
- `official/ai-ocr/TODO.md`
- `official/open-models/TODO.md`
- `official/knowledge/TODO.md`
- `official/wiki/TODO.md`
- `official/graph/TODO.md`
- `official/sync/TODO.md`
- `official/calendar/TODO.md`
- `official/code-execution/TODO.md`
- `official/codex-connection/TODO.md`
- `official/dashboard/TODO.md`
- `official/google-keep-import/TODO.md`
- `official/recently-edited/TODO.md`
- `official/sites/TODO.md`

## Nouvelles familles d'addons proposées

Voir `proposals/README.md`. Les propositions importantes sont notamment : projects/tasks, ontology/data layer, mail/communications, GitHub/dev activity, automation, analytics, advanced graph investigations, learning/spaced repetition et un pack Serie organisationnel.

## Règle pour les dépendances ElephantNote

Lorsqu'un TODO requiert une modification du host, il doit la nommer sous la forme `ElephantNote API:`. Ces demandes sont reprises et rationalisées dans `SorbetUP/ElephantNote` branche `develop_todo`, sous `docs/develop-todo/`.