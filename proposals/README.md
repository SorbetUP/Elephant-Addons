# Propositions de nouveaux addons

Ces documents sont des architectures candidates, pas des engagements d'implémentation.

## Principe

Le core Elephant doit rester centré sur : vault/files/notes, identité des ressources, events, permissions, UI contribution points, settings, jobs et addon runtime. Les domaines métier restent dans des addons ou packs.

## Propositions

- `projects-tasks.md` — projets, tâches, milestones, relations avec notes/événements/commits.
- `ontology-data.md` — entités/relation/schema/query pour transformer le vault en base de connaissance structurée.
- `mail-communications.md` — mail + threads + conversion contrôlée en notes/tasks.
- `github-dev-activity.md` — repos, issues, PR, commits, CI et liens aux projets.
- `automation.md` — workflows event/condition/action, scripts et agents sous permissions.
- `analytics.md` — métriques, tableaux, notebooks/reports sur données locales/connecteurs.
- `investigation-graph.md` — graph avancé type analyst/investigation au-dessus de Knowledge.
- `web-media-inbox.md` — capture web/RSS/media et inbox de tri.
- `learning-spaced-repetition.md` — cards/Anki-like dérivées des notes avec provenance.
- `document-toolkit.md` — PDF/Office/images, extraction, conversion et annotations.
- `connectors-framework.md` — infrastructure commune OAuth/sync/webhook/polling pour services externes.
- `serie-pack.md` — assemblage organisationnel/enterprise des addons avec workspaces, rôles et templates.

Chaque proposition mentionne les extensions `ElephantNote API` nécessaires. Les besoins communs doivent être implémentés une seule fois dans le host plutôt que contournés différemment par chaque addon.