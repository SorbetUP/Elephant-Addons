# Proposition — MCP Bridge

## But

Permettre à Elephant d'exposer une partie de son vault à des assistants externes et, inversement, d'utiliser des serveurs MCP comme sources/tools, sans créer une seconde permission model parallèle.

## Deux addons/sous-capabilities

### MCP Server

Expose resources/tools Elephant sélectionnés : search/read notes, knowledge graph, éventuellement proposals. Chaque session a principal, workspace, scopes et expiration. Les tools sensibles passent toujours par la policy Elephant.

### MCP Client

Connecte un serveur externe et traduit ses tools/resources vers le registry Elephant avec provenance `external:mcp`. L'utilisateur voit le serveur, les permissions annoncées, risk mapping et les données envoyées.

## Sécurité

- aucun accès vault entier par défaut ;
- allowlist resources/tools ;
- secrets dans host secret store ;
- remote server content marqué untrusted ;
- external tool ne peut déclarer `read` si la mapping policy le classe plus risqué ;
- rate/size/time limits ;
- audit de chaque appel.

## UI

Page Connections : serveurs locaux/distants, status, scopes, tools/resources, last calls et revoke. Dans Chat Agent, timeline indique clairement lorsqu'un tool vient d'un MCP externe et quelles données lui sont envoyées.

## ElephantNote API

- principals/scopes ;
- capability/tool registry et risk policy ;
- secrets/network broker ;
- provenance ;
- jobs/cancellation ;
- audit log.

## Tests

Serveur malveillant avec description prompt-injection, tool schema invalide, disconnect/reconnect, huge result, scope revoked pendant run, external write mapping, duplicate tool names et garantie qu'un MCP ne contourne pas Proposal Service.