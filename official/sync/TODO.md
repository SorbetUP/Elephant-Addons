# TODO — `elephant.sync`

## Direction

Conserver Iroh/P2P comme transport possible, mais définir le sync autour d'un protocole de vault et d'un journal d'opérations indépendant du transport. Le transport ne doit pas dicter le modèle de conflits.

## P0 — Invariants

- Create/modify/rename/delete synchronisés de manière déterministe.
- Tombstones versionnés pour éviter la résurrection de fichiers supprimés.
- Content hash avant transfert et après réception.
- Écriture atomique via temp + fsync/rename lorsque la plateforme le permet.
- Reprise après coupure sans retransférer tout le vault.
- Baseline par pair/device avec version explicite.

## P0 — Conflits

- Aucun last-write-wins silencieux sur modifications concurrentes de notes.
- Conflit détecté => préserver les deux contenus + metadata expliquant origine/version.
- Pour Markdown, proposer ensuite un three-way merge si base commune connue.
- Les fichiers binaires restent side-by-side si merge impossible.
- Policy de nettoyage des `.conflit` seulement après état résolu/expiration sûre.

## P0 — Sécurité

- Pairing authentifié ;
- identité device stable et révocable ;
- chiffrement transport vérifié ;
- secrets jamais dans le vault synchronisé ;
- permission explicite sur vault partagé ;
- possibilité de voir et révoquer chaque device.

## P1 — Protocol abstraction

Définir interfaces `SyncInventory`, `SyncDelta`, `SyncTransfer`, `SyncApply` afin qu'un futur backend cloud/LAN soit interchangeable sans réécrire la logique de conflit.

## P1 — Performance

- Chunking/content-addressing pour gros fichiers si bénéfice mesuré.
- Concurrence bornée et priorité aux petites notes interactives.
- Backpressure.
- Compression seulement quand rentable.
- Battery/network policy mobile.

## P1 — UI

Topbar : idle / syncing / success récent / warning / error. Détails : files uploaded/downloaded/deleted/conflicted, peer, débit, dernière sync. L'utilisateur doit pouvoir relancer ou inspecter un conflit sans lire les logs.

## P1 — Agent/automation

Expose uniquement des tools read-only (`sync.status`, `sync.conflicts.list`) par défaut. Toute résolution automatique de conflit doit être une proposal inspectable.

## P2 — Multi-user/Serie

Séparer à terme device sync et workspace collaboration : identity, membership, ACL, audit log et shared workspace ne doivent pas être bricolés au-dessus du simple pairing P2P.

## ElephantNote API

- file change journal avec ids/versions ;
- atomic file operations ;
- credential/device identity store ;
- background service lifecycle ;
- network/battery hints mobile ;
- transaction/precondition API.

## Tests

- matrice create/modify/delete/rename dans les deux directions ;
- modifications concurrentes ;
- coupure réseau au milieu d'un transfert ;
- restart pendant apply ;
- corruption hash ;
- device révoqué ;
- gros binaire ;
- 10k petits fichiers ;
- aucun config/secret exclu ne traverse le protocole.