# Elephant Addons

Dépôt officiel des addons physiques et des addon packs d’Elephant.

- `catalog.json` : catalogue officiel.
- `official/<slug>/` : paquets addons autonomes.
- `packs/` : addon packs protégés et versionnés.
- `tests/` : tests JavaScript et contrats de catalogue liés aux addons.
- `build/` : empaquetage des addons physiques et mobiles, exécuté depuis ce dépôt.

Le contrat de compatibilité de la première version publiée est `minAppVersion: 0.1.0`.

Validation locale : `npm run check:js && npm run test:js && npm run test:catalog`.

Le dépôt ElephantNote conserve uniquement le runtime générique, l’installateur, les permissions et les points d’extension.
