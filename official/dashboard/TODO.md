# TODO — `elephant.dashboard`

## Direction

Le Dashboard ne doit pas devenir un écran monolithique connaissant tous les addons. Il doit être un **surface host** où des addons contribuent des widgets/cards via une API versionnée.

## P0 — Widget contribution API

Un widget publie : id, title, preferred sizes, min/max size, refresh policy, settings schema, required resources et renderer contribution. Le Dashboard stocke layout/config ; l'addon reste propriétaire des données.

## P0 — Layout

- grille responsive desktop/mobile ;
- drag/resize sur desktop, mode edit adapté au tactile ;
- breakpoints persistés ;
- aucun widget hors écran après changement de device ;
- reset widget/layout individuel.

## P1 — Widgets officiels possibles

Recently edited, calendar agenda, tasks, project status, sync status, AI proposals, recent graph communities, downloads/jobs, quick capture, pinned notes.

## P1 — Performance

- widgets hors viewport suspendables ;
- refresh event-driven plutôt que polling global ;
- budget de rendu ;
- un widget crashé ne doit pas casser tout le dashboard.

## P1 — Dashboard note

Si la note cachée `.dashboard` reste utilisée, clarifier la frontière entre contenu Markdown éditable et metadata/layout. Ne pas sérialiser un gros état UI opaque dans le Markdown.

## P1 — UX

- add-widget palette ;
- preview ;
- edit mode explicite ;
- empty state utile ;
- keyboard navigation/accessibility ;
- thèmes hérités de l'app avec tokens, pas CSS hardcodé.

## ElephantNote API

- UI contribution points sandboxés ;
- theme/design tokens ;
- event subscriptions ;
- scoped persistent widget settings ;
- resize/container query support.

## Tests

- addon absent => widget placeholder/removal propre ;
- widget exception isolée ;
- layout desktop/mobile ;
- migration de config ;
- 20+ widgets sans polling storm ;
- thème/accessibilité.