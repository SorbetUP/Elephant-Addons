# Proposition — Media Workspace

## But

Donner à audio/vidéo/images un vrai modèle de travail : playback, transcript, chapters, annotations timecodées, OCR/vision et liens vers notes, sans convertir les gros médias en blobs Markdown.

## Ressources

MediaHandle vers asset/external file, metadata codec/duration/dimensions, waveform/cache dérivé, Transcript avec segments time-range et speaker, Annotation avec range spatial ou temporel, Chapter et relation vers notes/objects.

## Capabilities

- speech transcription/diarization ;
- OCR/vision sur image/frame ;
- thumbnails/waveform ;
- optional transcoding via native service/job ;
- citations `media + time range` ou `image + region`.

Les moteurs sont providers. Le Media addon orchestre UX/ressources et ne bundle pas tous les modèles.

## UI

Player principal, timeline avec chapters/annotations, transcript synchronisé, side panel notes/relations. Cliquer une citation depuis une note ouvre exactement le timestamp/région. Mobile utilise player + sheet transcript plutôt qu'un layout desktop compressé.

## Storage

Original reste source ; waveform/thumbnails/transcript auto généré sont classified derived sauf si utilisateur édite/valide le transcript. Les gros fichiers utilisent range streaming et ne passent jamais entièrement par le renderer.

## ElephantNote API

- file handlers/large file streaming ;
- stable media range anchors ;
- jobs/artifacts/cache ;
- AI capabilities speech/vision/OCR ;
- editor embed/deep-link ;
- mobile media permissions.

## Tests

Longue vidéo, variable frame rate, audio sans metadata, fichier déplacé, transcript édité, cancel transcription, app background mobile, missing codec, cache rebuild et citation toujours résolvable après rename de l'asset.