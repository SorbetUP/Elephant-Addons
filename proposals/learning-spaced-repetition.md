# Proposition — Learning / Spaced Repetition

## But

Ajouter une couche Anki-like reliée aux notes : les cartes restent traçables vers leurs sources et peuvent être générées/proposées par IA sans devenir du contenu opaque détaché du vault.

## Modèle

`Card`, `Deck`, `Review`, `SourceRef`, `GenerationProposal`. Scheduler séparé du texte Markdown ; source link vers note/heading/range.

## UI

- Today reviews ;
- deck browser ;
- card editor ;
- source preview ;
- stats simples ;
- quick action depuis sélection de texte ;
- mobile review pensée pour gestes et clavier.

## IA

`propose_cards(source)` génère une proposal avec question/réponse + citations. L'utilisateur accepte/édite. L'IA ne modifie pas l'historique de review.

## Interop

Import/export Anki avec mapping stable lorsque possible ; CSV/Markdown export lisible. Relation possible avec Projects/Learning goals.

## ElephantNote API

- stable source ranges ;
- notification/scheduling ;
- typed entity store ;
- proposal service ;
- mobile gesture/UI contribution.

## Tests

Scheduler déterministe, timezone, source rename, stale source, duplicate generation, import/export round-trip et aucun review history perdu lors d'une édition de note.