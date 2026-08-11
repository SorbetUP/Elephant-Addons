# Proposition — Serie Meetings, Decisions & Requirements

## But

Transformer une réunion ou communication en **chaîne de preuve traçable**, sans laisser l'IA convertir ses inférences en faits : `source -> speaker -> claim/need/decision -> requirement -> task/issue -> implementation -> test -> release/result`.

## Objets

- Meeting/session avec participants et source audio/transcript ;
- Transcript segment timecodé + speaker identity/confidence ;
- Claim, question, decision, need/action item avec statut `fact/inference/proposal` ;
- Requirement/SRS item versionné, priorité, owner et acceptance criteria ;
- links vers project/task, GitHub/GitLab issue/PR/commit, test/run et release.

Chaque objet dérivé conserve les segments sources exacts et leur revision. Une correction du transcript peut marquer les inférences dépendantes `stale`.

## Pipeline

1. ingest meeting/audio/transcript ;
2. diarization/transcription via capability AI/media ;
3. extraction structurée sans mutation des systèmes externes ;
4. résolution vers clients/produits/personnes/projets existants avec confidence ;
5. review des ambiguïtés ;
6. proposal de création/mise à jour requirement/task ;
7. approval ;
8. connectors relient ensuite issue/commit/test/release au même requirement.

## UI

Vue réunion en trois zones adaptatives :

- timeline transcript/audio avec speakers ;
- panneau central summary/decisions/needs/actions ;
- inspecteur relations montrant client, produit, responsable, requirement et evidence.

Cliquer une décision ou exigence surligne les segments qui la justifient. Une relation inférée affiche confidence et alternatives, jamais le même style qu'un lien confirmé.

Vue Requirements : table + graph de traceabilité, filtres `unassigned`, `no acceptance criteria`, `no implementation`, `no test`, `stale evidence`, et diff de SRS entre revisions.

## Attribution des tâches

Le système peut proposer un owner à partir de responsabilité, expertise, charge et historique, mais doit afficher les facteurs utilisés. Une expertise déduite est une inference, pas un attribut RH certain.

## Séparation privé / organisation

Un transcript personnel ou note privée n'est jamais utilisé pour enrichir un workspace organisationnel sans grant explicite. Les queries de l'agent héritent du principal/workspace actif.

## ElephantNote API

- Spaces/ACL/principals ;
- provenance + `fact/inference/proposal` ;
- generic object IDs et typed relations ;
- block/time-range citation anchors ;
- proposal/preconditions/audit ;
- external connector object handles ;
- media/transcription capabilities ;
- jobs durables pour processing long.

## Tests

Speaker inconnu, transcript corrigé après extraction, personnes homonymes, client/produit ambigu, requirement déjà existant, double import idempotent, permission cross-workspace, stale proposal, issue/commit sans requirement et preuve qu'une extraction ne crée aucune task externe avant approval.