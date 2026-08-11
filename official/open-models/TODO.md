# TODO — `elephant.open-models`

## Direction

`open-models` doit évoluer d'un gestionnaire GGUF/chat vers le **runtime de modèles locaux** d'Elephant. `elephant.ai` garde le contrat abstrait ; Open Models fournit une ou plusieurs implémentations locales de ces capabilities.

## P0 — Capabilities locales

Ajouter progressivement :

- `text.generate`
- `text.embed`
- `rerank`
- `vision`
- `ocr`
- `audio.transcribe`

Un modèle installé doit déclarer ses capabilities réelles. Le Chat, Search ou OCR ne doivent jamais déduire une capability depuis le nom du fichier.

## P0 — Embeddings

- Support de modèles d'embeddings locaux avec endpoint batch.
- Dimension, pooling, normalization et preprocessing déclarés dans le metadata model.
- Conformance avec `ai.inference.embed` afin que `ai-search` n'ait aucun branchement spécial.
- Bench CPU/Metal/CUDA avec latence batch, throughput et RAM/VRAM.

## P0 — OCR

Intégrer l'OCR comme capability locale, sans obliger l'utilisateur à installer un addon conceptuellement séparé lorsqu'un modèle/engine local sait déjà le faire.

Deux familles doivent rester distinguées :

1. OCR classique rapide (ex. Tesseract-like) ;
2. vision-language/document models capables de layout, tableaux et compréhension.

Le contrat commun doit pouvoir renvoyer texte simple **et** blocs structurés avec bounding boxes/pages/confidence lorsque disponibles.

`ai-ocr` peut devenir un compatibility provider pendant la migration.

## P0 — Model manifest

Pour chaque artefact :

- stable model id + revision ;
- source et licence ;
- format (GGUF/ONNX/autre backend supporté) ;
- checksum ;
- taille disque ;
- RAM/VRAM estimées ;
- context length ;
- modalities/capabilities ;
- architecture/quantization ;
- runtime compatible ;
- minimum app/runtime version.

Ne pas faire reposer l'identité du modèle sur le filename.

## P1 — Backends

Conserver llama.cpp pour les modèles compatibles, mais rendre le runtime extensible : un backend ne doit pas devenir l'API publique.

Étudier/benchmarker seulement lorsqu'utile : llama.cpp, ONNX Runtime, MLX sur Apple, backend GPU approprié sur Linux/Windows, mobile NNAPI/CoreML si viable. L'UI expose capacité/performance, pas le détail technique par défaut.

## P1 — Gestion ressources

- Admission control avant chargement d'un modèle.
- Budget RAM/VRAM configurable.
- LRU/unload des modèles inactifs.
- Warm model optionnel.
- Nombre de requêtes concurrentes borné.
- Cancellation jusqu'au backend.
- Éviter deux processus runtime identiques par addon lorsque le même service peut multiplexer proprement.

## P1 — Download manager

- téléchargements resumables ;
- checksum obligatoire avant activation ;
- espace disque vérifié avant download ;
- pause/reprise/annulation ;
- nettoyage des `.partial` ;
- mirror/source fallback explicite ;
- progression observable via background jobs.

## P1 — Sélection automatique assistée

L'UI peut recommander un modèle selon : capability demandée, RAM/VRAM disponible, plateforme, qualité/vitesse voulue et confidentialité. La recommandation doit rester explicable et l'utilisateur peut toujours choisir manuellement.

## P1 — UI Model Manager

Une page unique :

- Installed / Available / Downloads ;
- filtre par capability ;
- taille + mémoire estimée ;
- état `downloaded/loaded/active/error` ;
- benchmark local optionnel ;
- provider routing (`Chat local`, `Embeddings local`, etc.) ;
- suppression avec indication des usages dépendants.

## P2 — Performance profiles

Profiles `battery`, `balanced`, `performance` appliquant threads/context/batch/GPU layers, plutôt que multiplier des réglages bas niveau dans toutes les UI.

## ElephantNote API

- background download/job API ;
- hardware capability API stable (RAM, GPU/Metal/CUDA/architecture, stockage libre) sans donner des droits système arbitraires à l'addon ;
- package data directory avec quota/usage ;
- service lifecycle + health events ;
- streaming binary/text events efficace.

## Tests

- download interrompu puis repris sans corruption ;
- checksum invalide interdit activation ;
- modèle chat ne peut pas être utilisé comme embedding sans capability ;
- embedding local conformance suite identique aux providers cloud ;
- cancellation libère la génération ;
- OOM prévisible refusé avant crash lorsque l'estimation est disponible ;
- unload/reload sans zombie process ;
- OCR multi-page et Unicode ;
- suppression refuse ou avertit si un modèle est actuellement routé comme provider actif.