# TODO — `elephant.ai`

## État constaté

`elephant.ai` est déjà la frontière d'inférence commune : configuration provider/model, chat completion, embeddings, structured output, métadonnées de tools, retry, timeout et annulation. Cette frontière doit devenir le contrat unique des capacités IA, sans que les consommateurs connaissent OpenAI, OpenRouter, Codex, llama.cpp ou un backend local particulier.

## P0 — Contrat d'inférence unifié

- Remplacer la notion implicite de « provider de chat » par un registre de **model capabilities** : `text.generate`, `text.embed`, `tool_use`, `structured_output`, `vision`, `ocr`, `rerank`, `audio.transcribe`, `audio.synthesize`.
- Chaque modèle doit publier : modalities d'entrée/sortie, context window, max output, tool support, streaming support, embedding dimension, quantization/backend, coût éventuel, disponibilité offline et contraintes plateforme.
- Versionner le contrat (`ai.inference.vN`) et refuser explicitement une capability incompatible plutôt que de tenter un fallback silencieux.
- Standardiser les erreurs : authentication, quota/rate-limit, invalid request, unsupported capability, context overflow, timeout, cancelled, provider unavailable, model unavailable, malformed structured output.

## P0 — Vrai streaming

Le pseudo-streaming obtenu en découpant une réponse déjà complète doit être remplacé par un flux natif.

Événements proposés :

- `response.started`
- `text.delta`
- `reasoning.delta` lorsque le provider l'autorise
- `tool_call.started` / `tool_call.arguments.delta` / `tool_call.completed`
- `usage.updated`
- `response.completed`
- `response.failed`

Le flux doit respecter `AbortSignal`, backpressure et fermeture propre lors du changement de vault ou de conversation.

## P0 — Tools natifs

- Conserver `tools` et `tool_choice` comme primitives du transport.
- Normaliser les formats provider-specific vers un type Elephant unique.
- Accepter les messages `tool_result` dans l'historique afin de permettre une vraie boucle agentique côté `ai-chat`.
- Ne jamais exécuter les tools dans `elephant.ai` : ce module transporte l'intention, le runtime agent applique permissions et policies.

## P1 — Structured output fiable

- Validation JSON Schema après génération, avec erreur structurée et retry borné si le provider ne garantit pas le schéma.
- Distinguer `provider_enforced`, `prompt_enforced` et `postvalidated` dans la réponse.
- Ne pas masquer une sortie invalide en la « réparant » sans signaler que la réparation a eu lieu.

## P1 — Embeddings

- Batching adaptatif selon limites provider.
- Cache par `(model_id, content_hash, preprocessing_version)`.
- Détection de changement de dimension/version avant écriture dans Knowledge.
- Support des embeddings locaux via `open-models`.
- API de migration/rebuild lorsque le modèle d'embedding change.

## P1 — OCR / vision / audio

Décision d'architecture recommandée : **`elephant.ai` possède le contrat de capability, pas forcément l'implémentation**.

- `open-models` peut fournir localement `ocr`, `vision`, `embed`, `rerank`, etc.
- un provider cloud peut fournir les mêmes capabilities ;
- `ai-ocr` devient soit un provider spécialisé compatible, soit un shim de compatibilité temporaire.

Ainsi un consommateur appelle `ai.inference.ocr(...)` ou une capability équivalente sans savoir quel moteur est utilisé.

## P1 — Provider routing

- Routing explicite par capability et non par addon consommateur.
- Préférences globales + override par tâche/conversation.
- Fallback uniquement si la policy utilisateur l'autorise, avec signal visible du provider finalement utilisé.
- Possibilité de déclarer `local_only`, `cloud_allowed`, `no_data_retention_required`.

## P2 — Observabilité et UX

- Fournir latence TTFT, tokens/s, tokens input/output, retries, provider/model effectifs.
- UI de diagnostic modèle/capabilities sans afficher de secrets.
- Test de connexion/provider séparé de l'envoi d'un vrai message utilisateur.

## ElephantNote API

- API de secret storage native et scoped par addon/provider.
- Event stream/cancellation transport utilisable par les addons sans polling.
- API de background job pour téléchargement/rebuild embeddings.
- Capability registry introspectable par les addons.

## Tests obligatoires

1. streaming : premier delta reçu avant fin de réponse ; annulation stoppe réellement le transport ;
2. tools : round-trip `tool_call -> tool_result -> completion` sans perte de métadonnées ;
3. retry : respect de `Retry-After`, pas de retry sur erreurs non retryables ;
4. structured output : schéma invalide détecté et classifié ;
5. embeddings : dimensions et modèle/version vérifiés ;
6. capability mismatch : erreur explicite ;
7. secrets : aucun token dans logs, erreurs ou snapshots de tests ;
8. provider conformance suite commune exécutée contre mocks de chaque adaptateur.