# Proposition — Ontology / Data Layer

## But

Fournir le socle structuré nécessaire à Serie et aux usages complexes : entités typées, relations, propriétés, requêtes et vues calculées, tout en gardant les fichiers/notes comme sources lisibles et exportables.

## Architecture

- `Entity { id, type, properties, provenance }`
- `Relation { from, type, to, properties, provenance }`
- schemas versionnés mais extensibles par addon ;
- external IDs namespacés ;
- materialized views/cache reconstruisibles ;
- Knowledge consomme/produit certaines relations mais ne devient pas l'unique base métier.

## Requêtes

Trois niveaux :

1. filtres UI no-code ;
2. query DSL stable ;
3. SQL-like/graph query pour utilisateurs avancés.

Une requête doit pouvoir mélanger projets, notes, calendar, GitHub, contacts, etc. sans exposer directement les tables internes des addons.

## UI

- `Data` explorer : types, properties, relations ;
- table, cards et graph views ;
- saved queries utilisables comme Dashboard widgets ;
- schema inspector avancé masqué par défaut ;
- provenance drawer pour comprendre d'où vient chaque valeur.

## Sécurité

ACL/workspace filters appliqués au niveau query, pas uniquement UI. Les agents reçoivent des résultats déjà filtrés selon l'identité/policy courante.

## ElephantNote API

- entity/relation registry ;
- schema namespace par addon ;
- query engine ;
- transaction/precondition API ;
- workspace/identity-aware authorization ;
- change stream des entités.

## Pourquoi addon et non core complet

Le core doit fournir les primitives d'identité/relation/query nécessaires aux addons ; l'UI Data avancée, les schemas métiers et vues analytiques peuvent rester dans cet addon. Cela évite de rendre chaque installation Elephant dépendante d'une ontologie enterprise.