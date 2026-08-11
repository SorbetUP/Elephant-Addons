# Proposition — Web / Media Inbox

## But

Capturer pages web, RSS/Atom, vidéos/podcasts et fichiers entrants dans une inbox locale avant classement dans le vault. Séparer ingestion récurrente de l'import ponctuel Google Keep.

## Modèle

`Source`, `FeedItem`, `Capture`, `MediaRef`, `ProcessingState`, avec canonical URL/external id, dates, author/source et provenance.

## Pipeline

fetch -> sanitize/extract -> deduplicate -> optional OCR/transcript -> inbox -> user/agent proposes destination/tags/project -> apply.

## UI

- Inbox chronologique ;
- source filters ;
- reader propre ;
- actions Save as note / Link project / Archive / Ignore ;
- batch tri ;
- source management ;
- mobile share target pour envoyer URL/image/fichier à Elephant.

## IA

Résumé/tagging facultatif. Contenu web = untrusted data ; aucune instruction trouvée dans la page ne peut changer les droits d'un agent. Transcription/OCR via `elephant.ai` capability routing.

## ElephantNote API

- share-target/deep-link ingestion mobile/desktop ;
- network permission scopes ;
- background fetch scheduler ;
- safe HTML extraction/sanitization ;
- attachment import ;
- notification/inbox badge contribution.

## Tests

Canonical URL, duplicate feeds, malicious HTML, huge page, offline, redirects, cancelled download, prompt injection et idempotent refresh.