# TODO — `elephant.ai-ocr`

## Décision d'architecture proposée

Ne pas conserver durablement OCR comme silo IA séparé.

Le meilleur découpage est :

- **`elephant.ai` possède le contrat `ocr`/`vision`** ;
- **`open-models` fournit les implémentations locales** lorsqu'un moteur/modèle installé le permet ;
- un provider cloud peut fournir la même capability ;
- `elephant.ai-ocr` reste temporairement un provider spécialisé/compatibility shim pour le moteur natif actuel.

Cette organisation évite que Chat, import, PDF ou notes aient à choisir eux-mêmes entre `ai-ocr`, Open Models et un provider cloud.

## P0 — Compatibility migration

- Exposer l'implémentation actuelle derrière le contrat commun `ai.ocr`.
- Marquer les anciennes resources `ocr.*` comme compatibility API versionnée et documenter la dépréciation, sans casse brutale.
- Ne supprimer l'addon que lorsque les consommateurs officiels n'appellent plus l'ancien contrat.

## P0 — Modèle de résultat

Standardiser un résultat capable de représenter :

- texte global ;
- pages ;
- blocs/lines/words ;
- bounding boxes ;
- confidence lorsque connue ;
- langue détectée/configurée ;
- orientation/rotation ;
- source engine/model ;
- warnings (page ignorée, faible confiance, format partiellement supporté).

Le texte Markdown est une **projection**, pas le format source unique.

## P1 — Prétraitement

- rotation/orientation ;
- deskew ;
- contraste/binarisation lorsque le moteur en bénéficie ;
- downscale/upscale borné ;
- pages PDF rasterisées avec DPI explicite ;
- conserver la transformation géométrique pour reporter les boxes dans les coordonnées source.

## P1 — Langues

- détection automatique optionnelle ;
- packs langues installables sans gonfler tous les packages ;
- fallback explicite si une langue manque ;
- tests français/anglais, accents, ligatures, chiffres et ponctuation.

## P1 — Document intelligence

Lorsque `open-models` dispose d'un modèle vision/document :

- tables structurées ;
- titres/paragraphes/listes ;
- formulaires ;
- lecture order ;
- captions ;
- extraction sémantique.

Ne pas prétendre que le moteur classique fournit ces capacités : le metadata de capability doit faire la différence.

## P1 — UX

- action « OCR » sur image/PDF/import ;
- preview avant insertion dans une note ;
- choix `Plain text / Markdown / Structured` ;
- montrer engine/model uniquement dans détails ;
- progression et annulation pour documents multi-pages ;
- possibilité de corriger avant apply.

## Sécurité

- local par défaut lorsque demandé ;
- un OCR cloud doit passer par la même policy de confidentialité que les autres providers IA ;
- les fichiers temporaires doivent être placés dans un répertoire package-scoped et supprimés après succès/échec.

## ElephantNote API

- document/page rendering API bornée pour PDF/image ;
- temp-file API package-scoped ;
- background job progress ;
- typed attachment handles ;
- capability routing via `elephant.ai`.

## Tests

- compatibilité ancien `ocr.recognize` pendant migration ;
- Unicode et multi-langue ;
- rotation 90/180/270 ;
- multi-page + annulation ;
- temp files supprimés en erreur ;
- bounding boxes cohérentes après preprocessing ;
- provider cloud interdit sous policy `local_only` ;
- résultat classique et VLM respectent le même envelope tout en déclarant des capabilities différentes.