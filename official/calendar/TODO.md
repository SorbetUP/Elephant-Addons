# TODO — `elephant.calendar`

## Direction

Passer d'un lecteur/importeur ICS package-owned à une capability calendrier générique, où les sources Apple/Google/CalDAV/ICS éventuelles sont des adapters et non des APIs différentes pour les consommateurs.

## P0 — Modèle événement

- ID stable source + local id ;
- timezone explicite ;
- all-day ;
- recurrence RRULE + exceptions ;
- attendees/organizer ;
- reminders ;
- location/url ;
- source account/calendar ;
- read-only vs writable.

Ne pas aplatir les récurrences en copies sans conserver la série d'origine.

## P0 — Timezone/DST

Tests systématiques Europe/Madrid, UTC, changement DST, événements traversant minuit, all-day et timezone flottante. L'UI doit toujours savoir si elle affiche heure locale ou heure de la source.

## P1 — Adapters

Contrat : `calendar.sources`, `calendar.events.search`, `calendar.event.get`, `calendar.propose.create/update/delete`.

Les adapters peuvent être des addons séparés (Apple Calendar, Google Calendar, CalDAV). Le core Calendar agrège et normalise.

## P1 — Liens avec notes

- Lier événement à une note/meeting note via stable relation.
- Template optionnel de note de réunion.
- Backlinks depuis note vers événement.
- Ne pas modifier le calendrier externe lors d'une simple édition Markdown.

## P1 — Agent

- recherche d'événements read-only automatique ;
- création/déplacement/invitation = external write proposal ;
- preview date/time/timezone/attendees avant apply ;
- aucun envoi d'invitation sans confirmation policy adéquate.

## P1 — UI

- day/week/month + agenda ;
- panneau événement compact ;
- filtres calendriers ;
- mobile touch/drag avec fallback accessible ;
- timezone visible lorsqu'ambiguë ;
- offline cache avec état sync.

## P2 — Tasks interop

Éviter de transformer Calendar en task manager. Exposer relations événement↔task, mais garder tâches dans un addon Projects/Tasks dédié.

## ElephantNote API

- credential/OAuth scoped API ;
- external-account connector lifecycle ;
- notification/reminder API ;
- typed relation between external entity and note ;
- background sync jobs.

## Tests

- RRULE/exceptions ;
- DST ;
- duplicate import idempotent ;
- source read-only refuse mutation ;
- proposal externe jamais auto-appliquée sans policy ;
- offline/reconnect ;
- account revoked.