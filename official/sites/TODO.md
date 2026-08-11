# TODO — `elephant.sites`

## Direction

Sites doit fournir une preview/publication de sites depuis un dossier de vault sans transformer un site en origine privilégiée ayant accès à Elephant.

## P0 — Risque d'ownership / suppression de source à vérifier et corriger

Le code actuel mérite un test destructif négatif immédiat : `openPreview()` place le dossier autorisé dans `this.site.relativePath`, puis `stopPreview()` appelle une suppression Tauri sur `this.site.relativePath`. Si ce chemin représente le dossier source et non un output temporaire owned par Sites, fermer un preview pourrait supprimer des données utilisateur.

Invariant cible : **arrêter/fermer un preview ne modifie jamais le dossier source**. Le cleanup ne peut supprimer que des ressources créées explicitement par Sites avec un ownership `transient/generated` enregistré par le host.

Actions :

- séparer `sourceHandle` de `generatedOutputHandle` ;
- associer un flag/handle d'ownership à tout temp output ;
- refuser tout cleanup sur une ressource non owned par le lifecycle courant ;
- rendre la suppression de source impossible au niveau API, pas seulement par convention JS ;
- ajouter un test qui hash un dossier source avant/après `open -> stop` et exige identité byte-for-byte ;
- tester aussi symlinks, changement de vault et crash/restart pendant preview.

## P0 — Isolation

- WebView/origin distinct par site ;
- CSP stricte par défaut ;
- aucune API Elephant exposée au JavaScript du site sauf bridge explicitement accordé ;
- navigation externe contrôlée ;
- file:// direct évité lorsque cela contourne les permissions ;
- directory traversal interdit.

Le couple `allow-scripts` + `allow-same-origin` doit faire l'objet d'une threat review : selon l'origine et le bridge disponible, il peut réduire fortement l'isolation promise par `sandbox`.

## P0 — Preview lifecycle

- start/stop/health explicites ;
- port/origin gérés par le host, pas hardcodés ;
- restart propre après changement de vault ;
- watcher borné et cleanup des watchers/services ;
- source immutable du point de vue lifecycle preview ;
- outputs temporaires gérés via handles host et cleanup idempotent.

## P1 — Live reload

- refresh ciblé sur fichiers du site ;
- debounce ;
- conserver scroll lorsque possible ;
- erreurs build/serve affichées dans un panneau, pas uniquement logs ;
- conserver le last-good build si le nouveau build échoue.

## P1 — Build adapters

Séparer static serve et build systems. Futurs adapters peuvent gérer Astro/Hugo/Vite/etc. via Code Execution ou package service, avec sandbox et versions déclarées. Ne pas donner automatiquement accès au shell système.

## P1 — Content sources

Permettre de publier une sélection de notes via une étape de rendu/export, sans donner au site runtime un accès arbitraire au vault. La liste des sources doit être explicite et les liens/assets transformés dans un workspace de build séparé.

## P1 — Deploy providers

Si ajoutés plus tard (GitHub Pages, Cloudflare, etc.), publication = `external_write` avec preview du build et confirmation. Credentials via secure store.

## UI

- liste des sites ;
- preview intégrée ;
- status build/serve ;
- open external ;
- config source/output ;
- distinction visible `source` / `generated output` ;
- logs erreurs repliables ;
- responsive/device preview optionnelle.

## ElephantNote API

- secure webview/origin creation ;
- scoped local HTTP service ;
- file watcher handles ;
- **temp/generated workspace handles avec ownership et cleanup safe** ;
- credential store pour deploy ;
- open-external URL policy.

## Tests

- **fermer un preview ne change aucun byte du dossier source** ;
- cleanup refuse une ressource non owned ;
- site ne lit pas un fichier hors scope ;
- JS site ne peut pas appeler addon APIs non accordées ;
- watcher nettoyé ;
- changement vault stoppe ancien serveur sans toucher la source ;
- navigation externe ;
- path/symlink traversal ;
- build failure ne casse pas l'app et ne détruit pas le last-good output.