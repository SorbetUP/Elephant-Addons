# TODO — `elephant.sites`

## Direction

Sites doit fournir une preview/publication de sites depuis un dossier de vault sans transformer un site en origine privilégiée ayant accès à Elephant.

## P0 — Isolation

- WebView/origin distinct par site ;
- CSP stricte par défaut ;
- aucune API Elephant exposée au JavaScript du site sauf bridge explicitement accordé ;
- navigation externe contrôlée ;
- file:// direct évité lorsque cela contourne les permissions ;
- directory traversal interdit.

## P0 — Preview lifecycle

- start/stop/health explicites ;
- port/origin gérés par le host, pas hardcodés ;
- restart propre après changement de vault ;
- watcher borné et cleanup des watchers/services.

## P1 — Live reload

- refresh ciblé sur fichiers du site ;
- debounce ;
- conserver scroll lorsque possible ;
- erreurs build/serve affichées dans un panneau, pas uniquement logs.

## P1 — Build adapters

Séparer static serve et build systems. Futurs adapters peuvent gérer Astro/Hugo/Vite/etc. via Code Execution ou package service, avec sandbox et versions déclarées. Ne pas donner automatiquement accès au shell système.

## P1 — Content sources

Permettre de publier une sélection de notes via une étape de rendu/export, sans donner au site runtime un accès arbitraire au vault. La liste des sources doit être explicite.

## P1 — Deploy providers

Si ajoutés plus tard (GitHub Pages, Cloudflare, etc.), publication = `external_write` avec preview du build et confirmation. Credentials via secure store.

## UI

- liste des sites ;
- preview intégrée ;
- status build/serve ;
- open external ;
- config source/output ;
- logs erreurs repliables ;
- responsive/device preview optionnelle.

## ElephantNote API

- secure webview/origin creation ;
- scoped local HTTP service ;
- file watcher handles ;
- credential store pour deploy ;
- open-external URL policy.

## Tests

- site ne lit pas un fichier hors scope ;
- JS site ne peut pas appeler addon APIs non accordées ;
- watcher nettoyé ;
- changement vault stoppe ancien serveur ;
- navigation externe ;
- path traversal ;
- build failure ne casse pas l'app.