# TODO — `elephant.ai-chat`

## Objectif

Faire passer le Chat actuel d'un **LLM avec RAG + liste d'actions structurées** à un **runtime agentique multi-step**, tout en conservant la propriété importante actuelle : les lectures peuvent être automatiques, les mutations sensibles restent inspectables et gouvernées.

## État constaté

Le Chat sait déjà gérer conversations persistantes, provider/model, contexte RAG, citations, annulation et actions structurées. Le point manquant est la boucle : aujourd'hui le modèle peut proposer `search_notes`, la recherche est exécutée, mais son résultat n'est pas réinjecté dans un nouveau tour du modèle avant la réponse finale. Il ne s'agit donc pas encore d'un agent avec tool loop réel.

## P0 — Boucle agentique réelle

Implémenter une state machine explicite :

1. construire le contexte initial ;
2. appeler `ai.inference` avec les tools disponibles ;
3. si réponse finale : terminer ;
4. si `tool_call` : valider schema + permission + budget ;
5. exécuter le tool ;
6. enregistrer un message `tool_result` ;
7. relancer le modèle avec ce résultat ;
8. répéter jusqu'à réponse finale ou limite.

Limiter par : `max_steps`, `max_tool_calls`, `max_wall_time`, `max_input_tokens`, `max_output_tokens`, budget coût éventuel et nombre d'erreurs outil. Une limite atteinte doit produire un état explicite, jamais une boucle silencieuse.

## P0 — Tool registry dynamique

Supprimer progressivement la liste hardcodée `search_notes/create_note/...` du Chat.

Le runtime doit découvrir les tools depuis les resources/capabilities installées, par exemple :

- `knowledge.search`
- `notes.read`
- `notes.propose_write`
- `wiki.propose`
- `calendar.search`
- `calendar.propose_event`
- `ocr.recognize`
- `code.execute`
- futurs mail/GitHub/tasks/projects.

Chaque tool publie : nom stable, version, JSON Schema input/output, description machine-readable, risk class, permissions requises, idempotency, timeout recommandé et disponibilité plateforme.

## P0 — Policy d'exécution

Classes proposées :

- `read`: exécution automatique autorisable ;
- `compute`: calcul local sans mutation, autorisable ;
- `draft`: crée un artefact non envoyé/non appliqué ;
- `write`: modifie le vault ou un service ;
- `external_write`: envoie/modifie hors d'Elephant ;
- `execute`: lance du code/processus ;
- `destructive`: suppression/overwrite irréversible.

La policy résulte de : risque tool + permissions addon + préférence utilisateur + contexte. Le modèle ne choisit jamais lui-même le niveau d'autorisation.

## P0 — Proposals de mutation

Conserver et généraliser le pattern de Clew : `intent -> proposal -> validation -> preview -> apply`.

Une proposal doit contenir :

- identifiant stable ;
- tool/action origine ;
- cible ;
- precondition/version de la cible ;
- diff ou payload ;
- justification courte ;
- sources utilisées ;
- risques ;
- état `pending/approved/applied/rejected/stale/failed`.

Avant apply, revérifier les preconditions pour éviter d'écraser une note modifiée depuis la génération.

## P0 — Tests strictement liés au passage en vrai agent

Ajouter/remettre des tests comportementaux couvrant au minimum :

1. **1 tool call** : le résultat outil est réinjecté et la seconde réponse l'utilise ;
2. **2+ tools séquentiels** : le modèle peut rechercher puis inspecter une note avant de conclure ;
3. **parallel reads** si le provider demande plusieurs tools read-only indépendants ;
4. **write proposal** : aucune mutation avant approval ;
5. **stale proposal** : refus d'appliquer si la version cible a changé ;
6. **unknown tool** : erreur contrôlée, aucune exécution ;
7. **malformed arguments** : validation JSON Schema avant handler ;
8. **tool timeout** : résultat d'erreur réinjecté, agent capable de décider de continuer ;
9. **max steps** : boucle infinie interrompue proprement ;
10. **cancel** : annulation stoppe génération et outil cancellable ;
11. **path traversal** : toujours rejeté ;
12. **prompt injection dans une note** : le contenu récupéré n'obtient aucun nouveau droit ;
13. **conversation resume** : les tool calls/results persistent correctement ;
14. **provider sans tools natifs** : fallback structured-output clairement identifié et testé, ou capability refusée ;
15. **streaming** : les deltas de texte/tool sont relayés sans attendre la fin.

Les anciens tests spécialisés de sécurité/retry/actions ne doivent pas être remplacés par le seul smoke test d'import.

## P1 — RAG comme outil et contexte initial borné

- Garder un petit retrieval initial seulement lorsque pertinent.
- Exposer `knowledge.search` comme tool pour que l'agent puisse raffiner une requête après un premier résultat.
- Supporter `search -> inspect -> search related`.
- Dédupliquer citations par source/chunk et conserver provenance exacte.
- Ne jamais injecter l'intégralité du vault dans le prompt.

## P1 — Gestion du contexte

- Compaction/summarization explicite des vieux tours avec pointeur vers messages originaux.
- Ne jamais résumer les tool results nécessaires à une proposal non résolue.
- Budget de tokens par classe : system/policy, conversation, retrieved context, tool results.
- Détection context overflow avant appel provider.

## P1 — Sécurité prompt/tool

- Distinguer instructions système, utilisateur et **données non fiables** récupérées depuis notes, web, mail, OCR, etc.
- Les données récupérées ne peuvent pas modifier les permissions ni la policy.
- Afficher à l'utilisateur la raison d'une confirmation sensible et la cible exacte.
- Aucun secret/API key dans le contexte modèle sauf contrat explicitement nécessaire et sécurisé.

## P1 — UX agent

Dans le panneau Chat :

- timeline compacte des étapes (`Recherche 3 notes`, `Lecture de X`, `Proposition de modification`) repliable ;
- indicateur du provider/model effectif ;
- bouton Stop réellement relié aux AbortSignals ;
- carte de proposal avec diff avant/après ;
- `Approve once`, éventuellement règles permanentes seulement pour classes non dangereuses ;
- bouton Retry à partir d'une étape sans dupliquer les écritures déjà appliquées ;
- citations ouvrables et surlignage du passage source.

## P2 — Agent sessions / jobs

Séparer à terme :

- **chat session** interactive ;
- **agent run** exécutable/reprenable ;
- **background job** planifié ou long ;
- **proposal queue** de mutations en attente.

Cela prépare les usages Serie, projets, mail, GitHub et automatisations sans transformer une conversation UI en ordonnanceur implicite.

## ElephantNote API

- capability/tool registry versionné ;
- typed proposal service + transaction/preconditions ;
- background jobs et cancellation ;
- event stream pour UI ;
- permission API avec risk classes ;
- resource handles stables pour notes/fichiers plutôt que chemins bruts quand possible ;
- provenance/citation contract.

## Critère de fin

Le Chat n'est considéré « vrai agent » que lorsqu'un test E2E prouve : **modèle -> tool call -> résultat outil -> nouveau tour modèle -> proposal ou réponse finale**, avec persistance, annulation et policy de mutation vérifiées.