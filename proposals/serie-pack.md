# Proposition — Serie Pack

## But

Serie peut être construit comme **pack organisationnel Elephant** plutôt que fork de l'application : même core/addon runtime, mais ensemble cohérent de modules, permissions, vues, schemas et connecteurs destiné aux organisations.

## Composition candidate

- Projects & Tasks ;
- Ontology/Data ;
- Calendar ;
- Mail/Communications ;
- GitHub/Dev Activity ;
- Automation ;
- Analytics ;
- Advanced Investigation Graph ;
- AI/Agent ;
- Sync/workspace backend adapté multi-user ;
- Dashboard organisationnel.

## Workspaces

Séparer explicitement :

- espace personnel privé ;
- workspace équipe/entreprise ;
- éventuellement espaces externes/clients.

Les mêmes notes/entities peuvent être reliées mais les permissions doivent être évaluées à chaque query/tool call. Ne jamais supposer qu'être connecté à une organisation rend le vault personnel visible.

## Identity / permissions

Rôles + permissions fines par workspace/resource/capability. L'agent agit avec un principal identifiable et ne peut voir/exécuter que ce que ce principal peut voir/exécuter.

## Deployment

Le modèle doit permettre local, cloud ou P2P comme choix de déploiement sans changer les APIs métier. Les services server-only (webhooks, collaboration temps réel, admin) sont des providers de capabilities, pas des branches conditionnelles dans chaque addon.

## UI

- workspace switcher clair ;
- home organisation avec Projects/Activity/Tasks ;
- search scope visible ;
- badges Personal/Team lorsque nécessaire ;
- admin/settings séparés des settings personnels ;
- templates/policies poussables par pack mais modifiables selon droits.

## Pack semantics

Un pack installe une liste versionnée d'addons + configuration initiale + schemas/templates + permission defaults. Désinstaller le pack ne doit pas supprimer silencieusement les données produites par les addons.

## ElephantNote API

- first-class workspace identity ;
- principals/membership/ACL ;
- addon pack install/config transactions ;
- policy inheritance ;
- audit log ;
- server capability providers ;
- tenant-aware query/Knowledge/agent boundaries.

## Tests

Isolation personnel/entreprise, cross-workspace links sans fuite, role changes, revoked member, agent permissions, pack upgrade/migration, offline client, multi-device sync et export d'un workspace.