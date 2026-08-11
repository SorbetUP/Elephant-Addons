# Proposition — Document Toolkit

## But

Fournir une couche commune pour PDF, Office, images et autres formats : preview, extraction, annotations, conversion et liens vers notes. Si aucun addon ne revendique un format, Elephant continue d'ouvrir avec l'application système.

## Architecture

- registry de handlers par MIME/extension/capability ;
- priorité explicite et conflits de handlers résolus dans Settings ;
- `preview`, `extract_text`, `thumbnail`, `annotate`, `convert`, `open_external` comme capabilities séparées ;
- un addon ne doit pas devenir handler global d'un format qu'il ne sait que partiellement traiter.

## UI

- viewer intégré seulement si handler disponible ;
- bouton Open with system app toujours accessible ;
- annotations/links vers notes ;
- drag d'un document dans une note crée attachment + lien ;
- extraction/OCR optionnelle via `elephant.ai`.

## PDF

Pages, text ranges, annotations, thumbnails et OCR fallback. Les citations Knowledge doivent pouvoir cibler page/range.

## Office/autres formats

Preview/convert via adapters package-owned lorsque licence/runtime le permet. Ne pas dépendre silencieusement d'une application installée sur le PC.

## ElephantNote API

- file handler registry ;
- MIME sniffing sûr ;
- native/open-system application API ;
- document range/page deep-links ;
- attachment handles ;
- viewer contribution surface.

## Tests

Extension trompeuse vs MIME, handler absent, plusieurs handlers, fichiers énormes/corrompus, open-system fallback, drag/drop, path traversal et citations PDF stables.