# Propositions de nouveaux addons

Ces documents sont des architectures candidates, pas des engagements d'implémentation.

## Principe

Le core Elephant doit rester centré sur : vault/files/notes, identité des ressources, events, permissions, UI contribution points, settings, jobs et addon runtime. Les domaines métier restent dans des addons ou packs.

## Travail, organisation et Serie

- `projects-tasks.md` — projets, tâches, milestones, relations avec notes/événements/commits.
- `ontology-data.md` — entités/relation/schema/query pour transformer le vault en base de connaissance structurée.
- `mail-communications.md` — mail + threads + conversion contrôlée en notes/tasks.
- `github-dev-activity.md` — repos, issues, PR, commits, CI et liens aux projets.
- `serie-pack.md` — assemblage organisationnel/enterprise avec workspaces, rôles, policies et templates.
- `serie-meetings-requirements.md` — réunions/transcripts -> décisions/besoins -> SRS/requirements -> tasks/issues -> commits/tests/releases avec evidence.

## Automatisation et données

- `automation.md` — workflows event/condition/action, scripts et agents sous permissions.
- `analytics.md` — métriques, tableaux, notebooks/reports sur données locales/connecteurs.
- `data-connections.md` — SQLite/Postgres/CSV/Parquet/APIs + queries et computed views read-only par défaut.
- `ml-experiments.md` — runs ML, datasets fingerprints, configs, metrics, artifacts et model lineage.
- `connectors-framework.md` — infrastructure commune OAuth/sync/webhook/polling pour services externes.
- `mcp-bridge.md` — MCP server/client sous les mêmes scopes, risk policies et proposals qu'Elephant.

## Recherche, connaissance et apprentissage

- `research-hub.md` — recherche scientifique/web/GitHub, déduplication, snapshots et citations exactes.
- `investigation-graph.md` — graph avancé type analyst/investigation au-dessus de Knowledge.
- `learning-spaced-repetition.md` — cards/Anki-like dérivées des notes avec provenance.

## Documents, web et médias

- `web-media-inbox.md` — capture web/RSS/media et inbox de tri.
- `document-toolkit.md` — PDF/Office/images, extraction, conversion et annotations.
- `media-workspace.md` — audio/vidéo/images, transcript, timecoded/spatial annotations et AI media capabilities.

Chaque proposition mentionne les extensions `ElephantNote API` nécessaires. Les besoins communs doivent être implémentés une seule fois dans le host plutôt que contournés différemment par chaque addon.