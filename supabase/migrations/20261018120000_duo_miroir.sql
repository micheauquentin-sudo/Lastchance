-- ============================================================
-- DUO MIROIR — LE JEU DES DEUX CHOIX SCELLÉS (L17)
--
-- Premier jeu posé sur le socle des lobbies (L16, 20261017120000). Le cahier
-- (docs/lastchance-reserver.md, « Jeux retenus ») le dit en une phrase :
--
--   « Deux personnes présentes choisissent chacune, de façon scellée, un
--     produit ou une sélection réelle qu'elles offriraient ou recommanderaient
--     à l'autre. Les choix sont révélés simultanément, puis le commerce
--     présente sa propre proposition. »
--
-- Et ce qu'il EXCLUT, mot pour mot : « Il ne nécessite aucun gain, score,
-- classement, achat ou collecte de profil. » Rien dans ce fichier ne compte de
-- points, ne classe personne, ne touche à une récompense ni à un panier. La
-- seule chose que la base retienne d'une partie, c'est deux identifiants de
-- fiches — et la purge du lobby les emporte avec elle.
--
-- ── LES SEPT ARBITRAGES QUI GOUVERNENT CE FICHIER ──
--
-- Ils sont tranchés, et écrits ici pour qu'on n'ait pas à les rouvrir :
--
--   1. UNE SEULE MANCHE PAR LOBBY. Le « 3 à 6 » du cahier qualifie les OPTIONS
--      offertes au choix, pas un nombre de tours. Écrit en `unique (lobby_id)`
--      sur `duo_rounds` : ce n'est pas une convention d'appelant, c'est une
--      contrainte, et deux appels simultanés de `duo_start` ne peuvent pas la
--      contourner.
--   2. LES DEUX JOUEURS CHOISISSENT DANS LA MÊME LISTE. Il n'y a pas « ses
--      options à lui » et « ses options à elle » : une seule sélection par
--      commerce, donc `duo_options` est portée par l'ORGANISATION et non par la
--      manche. C'est aussi ce qui rend l'accord observable — deux listes
--      distinctes n'auraient pas eu d'intersection à nommer.
--   3. LA RÉVÉLATION MONTRE LES DEUX CHOIX CÔTE À CÔTE ET NOMME L'ACCORD, sans
--      le noter ni le récompenser. `accord` est un BOOLÉEN, pas un score : il
--      dit « vous avez pensé à la même chose », et le cahier interdit tout ce
--      qu'on pourrait vouloir en faire ensuite.
--   4. LE COMMERÇANT ÉPINGLE 3 À 6 FICHES + UNE SUGGESTION MAISON FACULTATIVE.
--      La suggestion est « la proposition du commerce » du cahier ; elle n'est
--      PAS une option jouable — personne ne peut la choisir, elle n'apparaît
--      qu'APRÈS la révélation.
--   5. LE CODE PARTAGÉ DE VIVE VOIX VAUT LA VALIDATION DE PRÉSENCE. Aucun geste
--      staff au MVP : le cahier admet « une session courte sur place OU le
--      staff », et le code à six caractères de L16 — qui se dicte à une table de
--      café et meurt en une heure — EST la session courte sur place.
--   6. APRÈS LA RÉVÉLATION, LA SALLE PASSE `closed`. Elle a fini son office. La
--      fermeture est AUTOMATIQUE et dans la MÊME TRANSACTION que la révélation
--      (le cahier : « fermeture automatique »).
--   7. L'ÉTAT DE PARTIE VIT DANS SES TABLES, ET LE `status` DU LOBBY NE GAGNE
--      AUCUNE VALEUR. Les quatre états de `player_lobbies` restent les quatre
--      états de L16. Un cinquième — « revelee » — aurait fait porter au socle
--      un vocabulaire de jeu que L18 n'a aucune raison de partager.
--
-- ── LE CŒUR : LA RPC FILTRE, JAMAIS L'ÉCRAN (motif `event_etat_partage`) ──
--
-- Tout ce fichier existe pour une seule propriété : AVANT LA RÉVÉLATION, LE
-- CHOIX DE L'AUTRE N'EST PAS DANS LE DOCUMENT. Pas caché par le client, pas
-- chiffré, pas rendu « en compte » : ABSENT. `duo_state` ne le LIT même pas
-- tant que la manche est `ouverte` — la lecture est enfermée dans un `if`, et
-- non écartée par un `case` qui aurait quand même cherché la valeur avant de la
-- jeter.
--
-- Pourquoi cette insistance : un document JSON qui transite est un document que
-- l'on peut ouvrir. Un `curl` sur la route, un onglet « réseau » ouvert dans le
-- navigateur, et le joueur qui triche voit ce que l'écran s'était engagé à ne
-- pas afficher. Le jeu tout entier repose sur le fait que les deux choix sont
-- scellés ; s'ils ne le sont que par politesse du client, il n'y a plus de jeu.
--
-- `autre_a_choisi` EST UN BOOLÉEN, ET C'EST TOUT CE QU'IL PEUT ÊTRE. L'écran a
-- besoin de dire « l'autre a scellé, on attend vous » — c'est un fait sur
-- L'EXISTENCE d'un choix, jamais sur son contenu. Un compteur, un indice de
-- longueur, une empreinte : tout cela aurait été une fuite graduée.
--
-- ── LE CHOIX EST SCELLÉ, DONC IMMUABLE ──
--
-- AUCUNE RPC DE CE FICHIER NE MODIFIE UN `duo_choices` DÉJÀ ÉCRIT. Il n'y a pas
-- d'`update` sur cette table, nulle part, et c'est délibéré : « scellé » n'a de
-- sens que si le sceau tient. Rejouer le MÊME item est idempotent (le
-- double-clic ne doit pas punir) ; en désigner un AUTRE reçoit `scelle` et rien
-- ne bouge. Sans cela, il suffirait d'attendre `autre_a_choisi` puis de changer
-- d'avis pour transformer le jeu en devinette à sens unique.
--
-- ── LES REFUS SONT INDISTINCTS (motif L16) ──
--
-- Non-membre, lobby inventé, lobby d'un autre commerce, manche inexistante,
-- item qui n'est pas dans les options : un seul `{"state":"unavailable"}`. Un
-- item hors options rend le MÊME document qu'un item inexistant — sinon la RPC
-- deviendrait un oracle sur le catalogue du commerce d'en face, une requête à
-- la fois.
--
-- `non_configure` EST LA SEULE EXCEPTION, et elle n'est pas un refus de
-- sécurité : c'est un message pour l'écran. Le commerçant n'a pas épinglé deux
-- fiches, donc le jeu ne PEUT pas se jouer. Le distinguer n'apprend rien à qui
-- sonde — il faut déjà être membre d'une salle verrouillée de ce commerce pour
-- le lire — et le confondre avec `unavailable` aurait envoyé les joueurs
-- chercher une panne là où il n'y a qu'une case à cocher.
--
-- ── AUCUNE POLICY SUR LES TABLES DE PARTIE (motif L16 / `vitrine_translations`)
--
-- `duo_rounds` et `duo_choices` portent la RLS et ZÉRO policy : `service_role`
-- seul, et seulement par les RPC de ce fichier. Une partie n'appartient à aucun
-- compte marchand — elle appartient à deux anonymes tenus par un cookie — donc
-- aucun prédicat marchand n'aurait de sens ici. Ouvrir la lecture à
-- `authenticated` aurait surtout donné au commerçant le moyen de lire les deux
-- choix AVANT les joueurs, ce que toute la §7 existe pour empêcher.
--
-- `duo_options` et `duo_settings` sont l'inverse : ce sont des tables de
-- CONFIGURATION du commerce, et elles suivent le motif `vitrine_contenus`
-- (20261015120000) — lecture aux membres, écriture aux éditeurs, grants colonne
-- par colonne.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 0. LA CLÉ CANDIDATE QUI MANQUAIT À `vitrine_items`
--
-- `vitrine_items` était jusqu'ici la FEUILLE de la chaîne Vitrine : cible de
-- personne, donc sans `unique (id, organization_id)`. Trois tables de ce
-- fichier ont besoin de la désigner par une FK COMPOSITE — c'est le motif du
-- dépôt (`fk_composites_couverture.test.sql`) : une FK simple entre deux tables
-- tenant-scopées laisse le locataire à la garde du code appelant, la composite
-- le fait tenir par la base.
--
-- Concrètement, sans cette clé, rien n'empêcherait `duo_options` de pointer une
-- fiche du commerce d'à côté : la colonne `organization_id` dirait « Café » et
-- `item_id` désignerait une fiche de « Boulangerie », et seule la bonne volonté
-- de la RPC aurait tenu les deux d'accord. Avec elle, la base refuse.
--
-- Idempotent et NOMMÉ, motif `reservation_queue_entries_id_org_unique`
-- (20261006120000) : la convention du dépôt pour cette contrainte est
-- `<table>_id_org_unique`.
-- ────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint con
     where con.conrelid = 'public.vitrine_items'::regclass
       and con.conname = 'vitrine_items_id_org_unique'
  ) then
    alter table public.vitrine_items
      add constraint vitrine_items_id_org_unique
      unique (id, organization_id);
  end if;
end;
$$;


-- ────────────────────────────────────────────────────────────
-- 1. `duo_options` — LA SÉLECTION DU COMMERÇANT
--
-- Trois à six fiches épinglées, et c'est le plateau de jeu. Portée par
-- l'ORGANISATION et non par la manche (arbitrage 2) : les deux joueurs
-- choisissent dans la MÊME liste, sans quoi il n'y aurait pas d'accord possible
-- à nommer.
--
-- ── `ordre` EST UNE PLACE, PAS UN TRI ──
--
-- 1 à 6, unique par organisation : c'est la position sur le plateau, décidée
-- par le commerçant, et deux fiches ne peuvent pas occuper la même. Motif
-- `vitrine_contenus.rang` (20261015120000), qui est la place et non l'ordre.
-- La borne haute est écrite DEUX FOIS — ici en `check`, et dans
-- `set_duo_options` en refus lisible. Le `check` est le filet : il tient même
-- si une écriture passe un jour à côté de la RPC.
--
-- La borne BASSE (« au moins deux fiches ») n'est PAS écrite ici, et ne peut
-- pas l'être : un `check` porte sur une ligne, jamais sur le cardinal d'une
-- table. Elle est tenue par `set_duo_options` à l'écriture, et CONSTATÉE par
-- `duo_start` à la lecture (`non_configure`) — deux gardes plutôt qu'une, parce
-- que la sélection peut aussi être vidée par la suppression d'une fiche.
-- ────────────────────────────────────────────────────────────

create table public.duo_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- PAS de `references public.vitrine_items(id)` simple : la seule FK vers la
  -- fiche est la COMPOSITE ci-dessous (voir §0).
  item_id uuid not null,
  ordre integer not null check (ordre between 1 and 6),
  created_at timestamptz not null default pg_catalog.now(),
  -- UNE FICHE, UNE FOIS. Épingler deux fois le même plat donnerait un plateau
  -- où choisir « le même » ne voudrait plus rien dire.
  constraint duo_options_org_item_unique unique (organization_id, item_id),
  -- UNE PLACE, UNE FICHE. C'est aussi l'index de tête de `organization_id`, que
  -- la FK vers `organizations` n'aurait pas eu autrement.
  constraint duo_options_org_ordre_unique unique (organization_id, ordre),
  -- CASCADE : le commerçant qui retire un plat de sa carte le retire du jeu. La
  -- sélection peut alors tomber sous deux fiches — c'est exactement le cas que
  -- `duo_start` constate en `non_configure`, plutôt que de laisser commencer une
  -- partie sans plateau.
  foreign key (item_id, organization_id)
    references public.vitrine_items(id, organization_id) on delete cascade
);

comment on table public.duo_options is
  'La sélection du commerçant pour Duo Miroir (L17) : 3 à 6 fiches Vitrine '
  'épinglées, qui forment le plateau de jeu. Portée par l''ORGANISATION et non '
  'par la manche — les deux joueurs choisissent dans la MÊME liste, sans quoi '
  'aucun accord ne serait observable. `ordre` est une PLACE (1..6, unique par '
  'organisation), motif vitrine_contenus.rang. La borne BASSE (au moins deux '
  'fiches) ne peut pas s''écrire en check — un check porte sur une ligne, pas '
  'sur un cardinal : elle est tenue par set_duo_options à l''écriture et '
  'CONSTATÉE par duo_start à la lecture (non_configure), parce que la '
  'suppression d''une fiche Vitrine peut la faire tomber en cascade. FK '
  'COMPOSITE vers vitrine_items : le locataire tient par la base, pas par le '
  'code appelant.';

alter table public.duo_options enable row level security;

-- Les privilèges par défaut ne servent plus `authenticated` depuis
-- 20260930120000 (00021 avait fait de même pour `anon`), donc la table naît
-- déjà nue. Le `revoke` explicite reste écrit parce qu'une garde qui dépend
-- d'une migration d'il y a trois semaines est une garde qu'on ne relit pas
-- (leçon SEC-4, wagon 7).
revoke all on table public.duo_options from public, anon, authenticated;

-- Motif `vitrine_contenus` (20261015120000) : la lecture va à TOUS les membres,
-- l'écriture aux seuls éditeurs. La sélection Duo est à la fois éditoriale et
-- consultable au comptoir — le caissier a une raison de savoir ce qui est
-- proposé au jeu quand un client lui pose la question, il n'a aucune raison de
-- le changer entre deux cafés.
create policy "duo_options: member select" on public.duo_options
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "duo_options: editor write" on public.duo_options
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- Grants COLONNE PAR COLONNE, motif des quatre tables de L11.
-- `organization_id` est écrivable à l'INSERT (c'est ainsi que la ligne se
-- rattache) et jamais à l'UPDATE : le locataire d'une ligne ne se corrige pas,
-- il se supprime et se ressaisit.
grant select on table public.duo_options to authenticated;
grant insert (organization_id, item_id, ordre)
  on public.duo_options to authenticated;
grant update (item_id, ordre)
  on public.duo_options to authenticated;
-- Suppression OUVERTE et NON GARDÉE, motif `vitrine_contenus` : il n'y a rien à
-- compter avant de retirer une option, et aucune cascade ne part d'ici.
grant delete on public.duo_options to authenticated;

-- Index de tête de la FK composite vers `vitrine_items`. Les deux contraintes
-- uniques ci-dessus mènent par `organization_id` ; aucune ne mène par
-- `item_id`, qui est pourtant le chemin de la CASCADE partant d'une fiche
-- supprimée (motif IDX-1, `index_fk_couverture.test.sql`).
create index duo_options_item_idx
  on public.duo_options (item_id, organization_id);


-- ────────────────────────────────────────────────────────────
-- 2. `duo_settings` — LA PROPOSITION DE LA MAISON
--
-- « Puis le commerce présente sa propre proposition » (cahier). Une fiche, au
-- plus, et FACULTATIVE.
--
-- ── POURQUOI UNE TABLE À PART, ET NON UNE COLONNE SUR `vitrine_settings` ──
--
-- C'était le geste le plus court, et c'est précisément pour cela qu'il fallait
-- l'écarter : `vitrine_settings` porte `touch_updated_at`, et son `updated_at`
-- est ce qui date la PÉREMPTION DES TRADUCTIONS (leçon L14). Ranger la
-- suggestion Duo là-bas aurait voulu dire qu'épingler un plat au jeu périme
-- toutes les traductions de la vitrine — une suggestion changée trois fois dans
-- la semaine aurait renvoyé le commerçant réviser un texte que personne n'a
-- touché. Une table séparée porte son propre `updated_at`, qui ne date que
-- lui-même.
--
-- ── LA SUGGESTION N'EST PAS UNE OPTION ──
--
-- Aucune contrainte ne l'oblige à figurer dans `duo_options`, et aucune ne le
-- lui interdit non plus. C'est voulu : le commerce peut proposer ce qu'aucun
-- des deux joueurs n'avait sur son plateau — c'est même le cas le plus
-- intéressant — comme il peut confirmer une des options. Ce qui est INTERDIT,
-- c'est de la CHOISIR : `duo_choose` ne valide que contre `duo_options`, donc
-- une suggestion qui n'y est pas ne peut être désignée par personne.
--
-- ── ELLE NE SORT QU'APRÈS LA RÉVÉLATION ──
--
-- `duo_state` ne la met dans le document que si la manche est `revelee`. La
-- donner plus tôt aurait soufflé la réponse : « le commerce recommande X »
-- affiché pendant que l'on choisit, c'est un plateau à cinq options dont une
-- est surlignée.
-- ────────────────────────────────────────────────────────────

create table public.duo_settings (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  -- NULLABLE, et c'est le sens de « facultative ». La FK composite est en
  -- MATCH SIMPLE (le défaut) : quand `suggestion_item_id` est nul, elle n'est
  -- pas vérifiée, ce qui est exactement le comportement voulu.
  suggestion_item_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  -- CASCADE, et NON `set null` : la ligne ne porte QUE la suggestion, donc
  -- l'effacer entière ou la vider revient au même, et `set_duo_suggestion` la
  -- recrée au prochain geste. `on delete set null (suggestion_item_id)` aurait
  -- été plus fin mais demande la syntaxe colonnaire de PG 15 ; sans elle,
  -- Postgres tenterait de mettre `organization_id` à nul — la clé primaire —
  -- et refuserait.
  foreign key (suggestion_item_id, organization_id)
    references public.vitrine_items(id, organization_id) on delete cascade
);

comment on table public.duo_settings is
  'La proposition de la maison pour Duo Miroir (L17) : au plus UNE fiche '
  'Vitrine, facultative, présentée APRÈS la révélation (« puis le commerce '
  'présente sa propre proposition »). Table SÉPARÉE de vitrine_settings, et '
  'c''est la leçon L14 : vitrine_settings porte touch_updated_at, dont '
  'l''updated_at date la PÉREMPTION DES TRADUCTIONS — y ranger la suggestion '
  'aurait fait périmer toute la vitrine à chaque plat épinglé au jeu. La '
  'suggestion n''est PAS une option jouable : duo_choose ne valide que contre '
  'duo_options, donc personne ne peut la désigner. Elle ne sort du document '
  'qu''une fois la manche révélée — plus tôt, elle surlignerait une réponse.';
comment on column public.duo_settings.suggestion_item_id is
  'Fiche proposée par le commerce, nullable (facultative). FK COMPOSITE en '
  'MATCH SIMPLE : non vérifiée quand elle est nulle. Cascade à la suppression '
  'de la fiche — la ligne ne porte que ça, donc la vider ou l''effacer revient '
  'au même, et set_duo_suggestion la recrée.';

alter table public.duo_settings enable row level security;

revoke all on table public.duo_settings from public, anon, authenticated;

create policy "duo_settings: member select" on public.duo_settings
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "duo_settings: editor write" on public.duo_settings
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- AUCUN `grant insert`, motif `vitrine_settings` (20261011120000) : la ligne
-- NAÎT de `set_duo_suggestion`, qui audite. Accorder l'insertion aurait laissé
-- poser la première suggestion sans qu'aucune trace n'existe — et la première
-- est celle qui compte. `organization_id` n'est écrivable nulle part : c'est le
-- locataire, il se pose une fois, par la RPC.
grant select on table public.duo_settings to authenticated;
grant update (suggestion_item_id)
  on public.duo_settings to authenticated;

-- L'index de tête de la FK composite vers `vitrine_items`. La colonne
-- `organization_id` est déjà la clé primaire, donc le chemin par
-- l'organisation est couvert ; celui-ci sert la cascade partant de la fiche.
create index duo_settings_suggestion_idx
  on public.duo_settings (suggestion_item_id, organization_id);

create trigger duo_settings_touch_updated_at
  before update on public.duo_settings
  for each row execute function public.touch_updated_at();


-- ────────────────────────────────────────────────────────────
-- 3. `duo_rounds` — LA MANCHE, ET IL N'Y EN A QU'UNE
--
-- ── `unique (lobby_id)` EST L'ARBITRAGE 1, ÉCRIT EN CONTRAINTE ──
--
-- Le cahier dit « 3 à 6 choix configurés par le commerçant » : ce sont les
-- OPTIONS, pas des manches. Une salle Duo Miroir joue UNE fois, révèle, et
-- ferme. La contrainte n'est pas une commodité — c'est elle qui rend
-- `duo_start` idempotent MÊME SI le verrou consultatif disparaissait un jour :
-- deux téléphones qui appellent à la même seconde ne peuvent pas fabriquer deux
-- plateaux pour la même table.
--
-- ── L'ÉQUIVALENCE, ET NON DEUX CHECKS QUI S'ACCORDENT ──
--
-- `(status = 'revelee') = (revealed_at is not null)` : un seul `check` qui dit
-- les DEUX SENS. Une manche `revelee` sans date, et une date de révélation sur
-- une manche encore ouverte, sont refusées par la même expression. Deux `check`
-- séparés auraient laissé passer le second cas le jour où l'un d'eux serait
-- réécrit. C'est le motif du dépôt pour les paires état/horodatage.
--
-- ── DEUX ÉTATS, ET PAS TROIS ──
--
-- `ouverte` → `revelee`, et rien d'autre. Pas d'« annulée », pas d'« expirée » :
-- une manche n'a pas de vie propre au-delà de sa salle. Quand le lobby meurt,
-- la purge de L16 (`purge_expired_lobbies`) emporte la manche et les choix en
-- cascade — c'est le sens de « session privée éphémère », et c'est aussi ce qui
-- garantit que les deux identifiants de fiches ne survivent pas à la partie.
-- ────────────────────────────────────────────────────────────

create table public.duo_rounds (
  id uuid primary key default gen_random_uuid(),
  -- PAS de `references public.player_lobbies(id)` simple : la seule FK vers le
  -- lobby est la COMPOSITE ci-dessous (motif L16, `player_lobby_members`).
  lobby_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  status text not null default 'ouverte'
    check (status in ('ouverte', 'revelee')),
  created_at timestamptz not null default pg_catalog.now(),
  revealed_at timestamptz,
  -- UNE SEULE MANCHE PAR LOBBY (arbitrage 1). C'est aussi l'index de tête de
  -- `lobby_id`, dont toutes les lectures de ce fichier partent.
  constraint duo_rounds_lobby_unique unique (lobby_id),
  -- Cible de la FK composite de `duo_choices`. Convention du dépôt :
  -- `<table>_id_org_unique`.
  constraint duo_rounds_id_org_unique unique (id, organization_id),
  -- L'ÉQUIVALENCE, dans les deux sens à la fois.
  constraint duo_rounds_revelation_coherente check (
    (status = 'revelee') = (revealed_at is not null)
  ),
  foreign key (lobby_id, organization_id)
    references public.player_lobbies(id, organization_id) on delete cascade
);

comment on table public.duo_rounds is
  'La manche de Duo Miroir (L17), et il n''y en a qu''UNE par salle — '
  'unique (lobby_id), qui est l''arbitrage « une manche » écrit en contrainte '
  'plutôt qu''en convention d''appelant : deux duo_start simultanés ne peuvent '
  'pas fabriquer deux plateaux pour la même table, même si le verrou '
  'consultatif disparaissait. Deux états seulement, ouverte → revelee, liés à '
  'revealed_at par une ÉQUIVALENCE (un seul check qui dit les deux sens). Aucun '
  'état « annulée » ni « expirée » : une manche n''a pas de vie propre au-delà '
  'de sa salle, et purge_expired_lobbies l''emporte en cascade avec les choix. '
  'RLS active et AUCUNE policy : service_role seul, par RPC (motif L16). '
  'Ouvrir la lecture à authenticated aurait donné au commerçant le moyen de '
  'lire les deux choix AVANT les joueurs.';
comment on column public.duo_rounds.revealed_at is
  'Instant de la révélation, posé par duo_choose DANS LA MÊME TRANSACTION que '
  'le second choix. clock_timestamp() et non now() : une manche créée et '
  'révélée dans une même transaction (un pgTAP, un seed) doit garder un ordre '
  'vrai — même écart, même raison que player_lobby_members.joined_at.';

alter table public.duo_rounds enable row level security;

revoke all on table public.duo_rounds from public, anon, authenticated;

-- Index de tête de `organization_id` (FK vers `organizations`). Le chemin par
-- `lobby_id` est déjà couvert par `duo_rounds_lobby_unique`.
create index duo_rounds_org_idx
  on public.duo_rounds (organization_id);


-- ────────────────────────────────────────────────────────────
-- 4. `duo_choices` — LE CHOIX SCELLÉ
--
-- ── AUCUN `update` NE VISE CETTE TABLE, NULLE PART ──
--
-- C'est la propriété centrale du lot, et elle se vérifie en lisant le fichier :
-- `duo_choose` fait un `insert` ou ne fait rien. Il n'existe aucune RPC ici qui
-- modifie un choix déjà écrit, et il n'y en aura pas — « scellé » n'a de sens
-- que si le sceau tient. Le `unique (round_id, member_token_hash)` est le filet
-- qui le rend vrai même hors des RPC.
--
-- La conséquence de jeu est celle qu'on veut : on ne peut pas attendre que
-- `autre_a_choisi` passe à vrai pour changer d'avis. Si c'était possible, le
-- second joueur jouerait à un autre jeu que le premier.
--
-- ── L'IDENTITÉ EST CELLE DU LOBBY, PAS CELLE DU JOUEUR ──
--
-- `member_token_hash` est le SHA-256 du cookie PAR LOBBY de L16 — jamais
-- l'identité globale `lc-player`. La base ne peut donc pas recoudre les parties
-- d'une même personne d'une salle à l'autre. C'est ce qui fait tenir la ligne
-- du cahier : « aucune collecte de profil ».
--
-- ── CE QUI N'EST PAS ICI ──
--
-- Pas de `score`, pas de `rang`, pas de `gagnant`, pas de `points`. L'accord se
-- CALCULE à la lecture (deux `item_id` égaux) et ne se STOCKE pas : une colonne
-- « accord » aurait été le premier pas vers un historique, puis vers un
-- classement, que le cahier exclut explicitement.
-- ────────────────────────────────────────────────────────────

create table public.duo_choices (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- SHA-256 du cookie PAR LOBBY (motif L16 / event_players).
  member_token_hash text not null
    check (member_token_hash ~ '^[0-9a-f]{64}$'),
  item_id uuid not null,
  -- `clock_timestamp()` et NON `now()`, même écart et même raison qu'en L16 :
  -- deux choix écrits dans la même transaction (un pgTAP) porteraient sinon le
  -- MÊME instant, et « qui a scellé le premier » deviendrait l'ordre arbitraire
  -- des uuid. Rien dans ce fichier ne s'en sert pour décider — la révélation ne
  -- dépend que du COMPTE — mais un horodatage faux est un horodatage à ne pas
  -- écrire.
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  -- UN CHOIX PAR PERSONNE, et c'est ce qui rend le sceau vrai hors des RPC.
  constraint duo_choices_round_membre_unique unique (round_id, member_token_hash),
  foreign key (round_id, organization_id)
    references public.duo_rounds(id, organization_id) on delete cascade,
  -- CASCADE vers la fiche : le commerçant doit pouvoir retirer un plat de sa
  -- carte, même s'il a été choisi dans une partie en cours. Le cas est
  -- marginal (une partie dure quinze minutes) et l'alternative — `restrict` —
  -- aurait rendu une fiche indélébile pour vingt-quatre heures parce que
  -- quelqu'un l'avait désignée.
  foreign key (item_id, organization_id)
    references public.vitrine_items(id, organization_id) on delete cascade
);

comment on table public.duo_choices is
  'Le choix SCELLÉ d''un joueur dans une manche de Duo Miroir (L17). AUCUN '
  'update ne vise cette table, nulle part : duo_choose insère ou ne fait rien, '
  'et « scellé » n''a de sens que si le sceau tient — sans quoi il suffirait '
  'd''attendre que autre_a_choisi passe à vrai pour changer d''avis. '
  'unique (round_id, member_token_hash) est le filet qui rend la propriété '
  'vraie même hors des RPC. member_token_hash est l''identité PAR LOBBY de L16, '
  'jamais l''identité globale du joueur : la base ne peut pas recoudre les '
  'parties d''une même personne (« aucune collecte de profil »). Ni score, ni '
  'rang, ni gagnant : l''accord se CALCULE à la lecture et ne se stocke pas. '
  'RLS active et AUCUNE policy : service_role seul, par RPC.';

alter table public.duo_choices enable row level security;

revoke all on table public.duo_choices from public, anon, authenticated;

-- Index de tête de `organization_id` (FK vers `organizations`). Le chemin par
-- `round_id` est déjà couvert par `duo_choices_round_membre_unique`.
create index duo_choices_org_idx
  on public.duo_choices (organization_id);

-- Index de tête de la FK composite vers `vitrine_items`, pour sa cascade.
create index duo_choices_item_idx
  on public.duo_choices (item_id, organization_id);


-- ────────────────────────────────────────────────────────────
-- 5. `duo_options_json` — LE PLATEAU, ÉCRIT UNE FOIS
--
-- Motif `player_lobby_rang` (L16) : `duo_start`, `duo_state` et
-- `duo_options_state` rendent tous les trois la liste des options, et deux
-- formulations auraient fini par rendre deux plateaux différents sur deux
-- écrans ouverts en même temps — celui qui choisit et celui qui regarde.
--
-- LES FICHES INDISPONIBLES RESTENT SUR LE PLATEAU. `disponible` n'est PAS
-- filtré, et c'est une décision : la question posée est « que lui offririez-vous
-- ? », pas « qu'est-ce qui reste en cuisine ». Filtrer aurait aussi pu faire
-- tomber le plateau sous deux options EN COURS DE PARTIE, entre le moment où
-- l'un choisit et le moment où l'autre choisit — donc changer les règles au
-- milieu. La carte publique montre déjà l'indisponibilité par ailleurs
-- (`vitrine_public_state` rend la fiche avec son drapeau plutôt que de la faire
-- disparaître) : c'est le même parti pris.
--
-- Accordée à AUCUN rôle applicatif, `service_role` compris : elle n'a de sens
-- qu'à l'intérieur des RPC, qui l'exécutent avec les privilèges de leur
-- propriétaire (motif `player_lobby_rang`).
-- ────────────────────────────────────────────────────────────

create or replace function public.duo_options_json(
  p_organization_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'item_id', i.id,
               'nom', i.nom,
               'description', i.description,
               'prix_affiche', i.prix_affiche,
               'photo_path', i.photo_path,
               'ordre', o.ordre)
             order by o.ordre),
           '[]'::jsonb)
    from public.duo_options o
    join public.vitrine_items i
      on i.id = o.item_id
     and i.organization_id = o.organization_id
   where o.organization_id = p_organization_id;
$$;

revoke all on function public.duo_options_json(uuid)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 5 bis. `duo_jouable` — « LE JEU PEUT-IL SE JOUER ICI »
--
-- UNE SEULE DÉFINITION, DEUX APPELANTS. `duo_start` s'en sert pour refuser
-- d'ouvrir une manche injouable (`non_configure`) ; `vitrine_public_state`
-- s'en sert pour décider si la PORTE du jeu s'affiche sur la vitrine publique
-- (§12). Deux seuils écrits séparément auraient fini par diverger, et la
-- divergence aurait la pire forme possible : une porte visible menant à un jeu
-- qui refuse de démarrer, ou un jeu jouable que personne ne peut trouver.
-- Motif `player_lobby_rang` (L16), pour exactement la même raison.
--
-- `exists … offset 1` ET NON `count(*) >= 2` : le parcours s'arrête à la
-- seconde ligne au lieu de lire les six. Motif `create_player_lobby`
-- (20261017120000), à la lettre.
--
-- LE SEUIL EST DEUX, ET C'EST L'ARITHMÉTIQUE DU JEU, pas le cahier : avec une
-- seule fiche, l'accord serait certain et le choix nul. Le cahier demande trois
-- à six et `set_duo_options` tient cette borne-là à l'ÉCRITURE ; ici on CONSTATE
-- ce qui reste jouable après une cascade de suppression de fiche.
--
-- Accordée à AUCUN rôle applicatif, `service_role` compris : elle n'a de sens
-- qu'à l'intérieur des fonctions qui l'appellent.
-- ────────────────────────────────────────────────────────────

create or replace function public.duo_jouable(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.duo_options o
     where o.organization_id = p_organization_id
     offset 1
  );
$$;

revoke all on function public.duo_jouable(uuid)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 6. `duo_start` — OUVRIR LE PLATEAU
--
-- CONTRAT :
--   {"state":"ok","round_id":uuid,
--    "options":[{"item_id":uuid,"nom":text,"description":text|null,
--                "prix_affiche":text|null,"photo_path":text|null,"ordre":int}]}
--   {"state":"non_configure"}  — moins de deux fiches épinglées
--   {"state":"unavailable"}    — TOUT le reste
--
-- ── L'IDEMPOTENCE EST LE POINT DÉLICAT ──
--
-- Deux téléphones ouvrent l'écran à la même seconde, et les deux appellent
-- `duo_start`. Il doit en sortir UNE manche, la même pour les deux. Deux gardes
-- superposées, motif L16 :
--
--   · le VERROU CONSULTATIF sur la clé du lobby — la MÊME que `join`, `lock`,
--     `kick` et `close_player_lobby_as_org` de L16, délibérément : une manche
--     qui s'ouvrirait pendant que le commerçant ferme la salle laisserait un
--     plateau sur une table qu'on vient de débarrasser ;
--   · `unique (lobby_id)` sur la table, qui tient même sans le verrou.
--
-- ── UNE MANCHE DÉJÀ OUVERTE SE REND SANS RIEN REDEMANDER ──
--
-- Si la manche EXISTE, on la rend — sans vérifier ni le statut du lobby ni son
-- expiration. C'est nécessaire, pas laxiste : la révélation FERME la salle
-- (arbitrage 6) et ramène sa date de mort à l'instant même, donc exiger un
-- lobby `locked` et vivant aurait rendu `unavailable` à qui recharge l'écran
-- juste après avoir vu le résultat. La partie a eu lieu ; son écran doit lui
-- survivre. L'appartenance, elle, reste exigée dans tous les cas.
--
-- ── `non_configure` N'EST PAS UN REFUS DE SÉCURITÉ ──
--
-- Voir l'en-tête du fichier. Il faut déjà être membre d'une salle verrouillée
-- de ce commerce pour le lire, donc il n'apprend rien à qui sonde ; et le
-- confondre avec `unavailable` aurait envoyé les joueurs chercher une panne là
-- où il n'y a qu'une case à cocher côté commerçant.
-- ────────────────────────────────────────────────────────────

create or replace function public.duo_start(
  p_lobby_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
  v_round public.duo_rounds%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  -- Identifiant absent : le même refus muet que tout le reste (motif
  -- `lobby_state`). Un `null` peut venir d'un cookie effacé plutôt que d'un
  -- bogue de l'appelant.
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Localisation, jamais décision — motif `join_player_lobby` : cette lecture
  -- ne sert qu'à trouver la CLÉ du verrou.
  select l.organization_id into v_org
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LA MÊME CLÉ DE VERROU QUE L16, et c'est voulu : une manche qui s'ouvrirait
  -- pendant que `close_player_lobby_as_org` ferme la salle poserait un plateau
  -- sur une table qu'on vient de débarrasser.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || p_lobby_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found or v_lobby.kind <> 'duo' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- L'APPARTENANCE EST EXIGÉE DANS TOUS LES CAS, et son absence rend le refus
  -- INDISTINCT de celui d'un lobby inconnu (motif `lobby_state`). Sans elle, un
  -- identifiant de salle volé suffirait à lire le plateau — et, plus tard, la
  -- manche.
  if not exists (
    select 1 from public.player_lobby_members m
     where m.lobby_id = v_lobby.id
       and m.token_hash = p_token_hash
  ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LA MANCHE EXISTANTE SE REND TELLE QUELLE — voir l'en-tête. Ni statut de
  -- lobby, ni expiration : la salle est fermée par la révélation elle-même.
  select r.* into v_round
    from public.duo_rounds r
   where r.lobby_id = v_lobby.id;

  if not found then
    -- CRÉATION : là, et seulement là, la salle doit être verrouillée et vivante.
    -- `locked` veut dire « l'hôte a fermé la porte, on est au complet » : c'est
    -- exactement le moment où un plateau a un sens.
    if v_lobby.status <> 'locked'
       or v_lobby.expires_at <= pg_catalog.now() then
      return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;

    -- LE PLATEAU AVANT LA MANCHE : on ne crée pas une partie qui ne peut pas se
    -- jouer. Le seuil n'est PAS écrit ici — il est dans `duo_jouable` (§5 bis),
    -- qui est aussi ce que lit `vitrine_public_state` pour décider d'afficher la
    -- porte du jeu. Une seconde écriture du même seuil aurait fini par diverger
    -- de la première, et la divergence se serait vue de la pire façon : une
    -- porte publique menant à un `non_configure`.
    if not public.duo_jouable(v_lobby.organization_id) then
      return pg_catalog.jsonb_build_object('state', 'non_configure');
    end if;

    insert into public.duo_rounds (lobby_id, organization_id)
    values (v_lobby.id, v_lobby.organization_id)
    returning * into v_round;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'round_id', v_round.id,
    'options', public.duo_options_json(v_lobby.organization_id)
  );
end;
$$;

comment on function public.duo_start(uuid, text) is
  'Ouvre — ou retrouve — la manche de Duo Miroir d''une salle (L17). '
  'IDEMPOTENTE sous concurrence par DEUX gardes superposées : le verrou '
  'consultatif sur la clé du lobby (la MÊME qu''en L16, pour qu''une manche ne '
  's''ouvre pas pendant que le commerçant ferme la salle) et unique (lobby_id) '
  'sur duo_rounds, qui tient même sans le verrou. Une manche DÉJÀ OUVERTE se '
  'rend sans revérifier ni le statut du lobby ni son expiration : la révélation '
  'FERME la salle, donc l''exiger rendrait unavailable à qui recharge l''écran '
  'de résultat. L''appartenance reste exigée dans tous les cas, et son refus est '
  'INDISTINCT de celui d''un lobby inconnu. non_configure (moins de deux fiches '
  'épinglées) n''est pas un refus de sécurité mais un message pour l''écran — il '
  'faut déjà être membre d''une salle verrouillée pour le lire. Rendue à '
  'service_role.';

revoke all on function public.duo_start(uuid, text)
  from public, anon, authenticated;
grant execute on function public.duo_start(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 7. `duo_choose` — SCELLER SON CHOIX
--
-- CONTRAT :
--   {"state":"ok","scelle":true,"revelee":bool}
--   {"state":"scelle"}       — vous aviez déjà scellé un AUTRE item
--   {"state":"unavailable"}  — TOUT le reste, item hors options compris
--
-- ── L'ITEM HORS OPTIONS REND `unavailable`, PAS UN MESSAGE À LUI ──
--
-- Un item inexistant, un item d'un autre commerce et un item du MÊME commerce
-- mais non épinglé empruntent le même `return`. Distinguer le troisième aurait
-- fait de cette RPC un oracle sur le catalogue d'en face : il aurait suffi de
-- présenter des identifiants au hasard pour apprendre lesquels existent chez le
-- voisin. La validation est un `exists` sur `duo_options`, qui porte déjà
-- l'organisation — donc les trois cas partagent le chemin, ils ne se sont pas
-- mis d'accord.
--
-- ── L'IDEMPOTENCE ET LE SCEAU SONT LA MÊME LECTURE ──
--
-- Le choix déjà écrit est lu UNE fois, sous le verrou, et l'item est comparé :
-- le même → `ok` (le double-clic ne doit pas punir) ; un autre → `scelle`, et
-- rien ne bouge. Il n'y a pas d'`update`, ici ni ailleurs (voir §4).
--
-- ── LA RÉVÉLATION EST DANS LA MÊME TRANSACTION QUE LE SECOND CHOIX ──
--
-- C'est le mot « simultanée » du cahier, et il ne se délègue pas à un cron ni à
-- un appel de suivi. Trois écritures, un seul instantané :
--
--   1. le second `duo_choices` est inséré ;
--   2. la manche passe `revelee`, `revealed_at` posé ;
--   3. le lobby passe `closed`, sa date de mort ramenée à l'instant.
--
-- Si l'une échoue, les trois sont défaites. Il n'existe donc AUCUN état
-- intermédiaire où les deux choix seraient écrits sans que la manche soit
-- révélée — état dans lequel un `duo_state` bien synchronisé aurait pu lire
-- deux choix scellés et n'en montrer qu'un.
--
-- ── LA FERMETURE EST AUTOMATIQUE (arbitrage 6, cahier : « fermeture
--    automatique ») ──
--
-- `least(clock_timestamp(), expires_at)` — motif `close_player_lobby_as_org` :
-- fermer ne PROLONGE jamais, et `clock_timestamp()` plutôt que `now()` pour
-- qu'une salle créée puis révélée dans la même transaction ne viole pas
-- `expires_at > created_at`. La salle a fini son office ; ce qui reste à lire
-- se lit par `duo_state`, qui n'exige ni salle vivante ni salle ouverte.
-- ────────────────────────────────────────────────────────────

create or replace function public.duo_choose(
  p_lobby_id uuid,
  p_token_hash text,
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
  v_round public.duo_rounds%rowtype;
  v_choix public.duo_choices%rowtype;
  v_membres integer;
  v_scelles integer;
  v_revelee boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_lobby_id is null or p_item_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select l.organization_id into v_org
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE MÊME VERROU QUE `duo_start` ET QUE L16 : c'est lui qui rend le comptage
  -- des sceaux vrai. Sans lui, deux choix simultanés liraient tous les deux
  -- « un seul scellé » et AUCUN ne déclencherait la révélation — la partie
  -- resterait ouverte pour toujours avec ses deux choix écrits.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || p_lobby_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  -- ON NE CHOISIT QUE DANS UNE SALLE VERROUILLÉE ET VIVANTE, contrairement à
  -- `duo_state` qui doit survivre à la fermeture. Une salle déjà `closed` — donc
  -- une manche déjà révélée — emprunte ce refus-ci, et c'est le premier des deux
  -- filets qui protègent le sceau.
  if not found
     or v_lobby.kind <> 'duo'
     or v_lobby.status <> 'locked'
     or v_lobby.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if not exists (
    select 1 from public.player_lobby_members m
     where m.lobby_id = v_lobby.id
       and m.token_hash = p_token_hash
  ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select r.* into v_round
    from public.duo_rounds r
   where r.lobby_id = v_lobby.id;
  -- Le SECOND filet : une manche absente ou déjà révélée refuse le choix. Le
  -- premier (salle `closed`) l'aura presque toujours devancé, mais une garde ne
  -- se déduit pas d'une autre.
  if not found or v_round.status <> 'ouverte' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- L'ITEM DOIT ÊTRE SUR LE PLATEAU. `duo_options` porte l'organisation, donc
  -- ce seul `exists` couvre les trois refus d'un coup — inexistant, d'un autre
  -- commerce, non épinglé — et ils sont indistincts par STRUCTURE.
  if not exists (
    select 1 from public.duo_options o
     where o.organization_id = v_lobby.organization_id
       and o.item_id = p_item_id
  ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE SCEAU. Lecture unique, sous le verrou.
  select c.* into v_choix
    from public.duo_choices c
   where c.round_id = v_round.id
     and c.member_token_hash = p_token_hash;

  if found then
    -- UN AUTRE ITEM APRÈS AVOIR SCELLÉ : refus, et RIEN n'est écrit. C'est ce
    -- qui empêche d'attendre `autre_a_choisi` pour changer d'avis.
    if v_choix.item_id <> p_item_id then
      return pg_catalog.jsonb_build_object('state', 'scelle');
    end if;
    -- LE MÊME ITEM : idempotent, et l'on RETOMBE DANS LE COMPTAGE ci-dessous
    -- plutôt que de rendre tout de suite. Un `return` ici serait un
    -- court-circuit : le jour où la révélation deviendrait due entre deux
    -- appels du même joueur, elle serait sautée par celui-là même qui aurait dû
    -- la déclencher. Rejouer ne saute jamais une révélation.
  else
    insert into public.duo_choices
      (round_id, organization_id, member_token_hash, item_id)
    values (v_round.id, v_lobby.organization_id, p_token_hash, p_item_id);
  end if;

  -- ── LA RÉVÉLATION ────────────────────────────────────────
  --
  -- « Tout le monde a scellé » se lit en comparant DEUX COMPTES : les membres de
  -- la salle et les choix de la manche. Le second ne peut pas dépasser le
  -- premier — `duo_choose` exige l'appartenance et `unique (round_id,
  -- member_token_hash)` interdit le doublon — donc l'égalité veut bien dire
  -- « tous ». Le `v_membres >= 2` est la ceinture : `lock_player_lobby` refuse
  -- déjà de verrouiller à un seul, mais une révélation à un joueur serait un
  -- miroir sans reflet.
  select pg_catalog.count(*)::integer into v_membres
    from public.player_lobby_members m
   where m.lobby_id = v_lobby.id;

  select pg_catalog.count(*)::integer into v_scelles
    from public.duo_choices c
   where c.round_id = v_round.id;

  if v_membres >= 2 and v_scelles >= v_membres then
    update public.duo_rounds r
       set status = 'revelee',
           revealed_at = pg_catalog.clock_timestamp()
     where r.id = v_round.id
       and r.status = 'ouverte';

    -- LA SALLE A FINI SON OFFICE (arbitrage 6). `least` NON qualifié : ce n'est
    -- pas une fonction du catalogue, la qualifier casserait à l'exécution
    -- (garde `npm run sql:check`).
    update public.player_lobbies l
       set status = 'closed',
           expires_at = least(pg_catalog.clock_timestamp(), l.expires_at)
     where l.id = v_lobby.id;

    v_revelee := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'scelle', true,
    'revelee', v_revelee
  );
end;
$$;

comment on function public.duo_choose(uuid, text, uuid) is
  'Scelle le choix d''un joueur dans une manche de Duo Miroir (L17). Le choix '
  'est IMMUABLE : aucun update ne vise duo_choices, ici ni ailleurs. Rejouer le '
  'MÊME item est idempotent ; en désigner un AUTRE rend {"state":"scelle"} et '
  'n''écrit rien — sans quoi il suffirait d''attendre que autre_a_choisi passe à '
  'vrai pour changer d''avis. Un item inexistant, d''un autre commerce ou non '
  'épinglé rendent le MÊME unavailable, par STRUCTURE (un seul exists sur '
  'duo_options, qui porte déjà l''organisation) : les distinguer ferait de cette '
  'RPC un oracle sur le catalogue d''en face. QUAND LES DEUX ONT SCELLÉ, la '
  'révélation et la FERMETURE AUTOMATIQUE de la salle sont dans la MÊME '
  'TRANSACTION que le second choix — c''est le mot « simultanée » du cahier, et '
  'il n''existe donc aucun état où deux choix seraient écrits sans manche '
  'révélée. expires_at ramené par least(clock_timestamp(), expires_at) : fermer '
  'ne prolonge jamais. Rendue à service_role.';

revoke all on function public.duo_choose(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.duo_choose(uuid, text, uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 8. `duo_state` — LE CŒUR ANTI-TRICHE
--
-- CONTRAT — HUIT CLÉS, TOUJOURS LES MÊMES :
--   {"state":"ok",
--    "status":"ouverte"|"revelee",
--    "mon_choix":{"item_id":uuid,"nom":text}|null,
--    "options":[{item_id, nom, description, prix_affiche, photo_path, ordre}],
--    "autre_a_choisi":bool,
--    "autre_choix":{"item_id":uuid,"nom":text}|null,   ← NULL TANT QU'OUVERTE
--    "suggestion":{"item_id":uuid,"nom":text,
--                  "description":text|null,"prix_affiche":text|null}|null,
--    "accord":bool|null}                                ← NULL TANT QU'OUVERTE
--   {"state":"unavailable"}  — non-membre, lobby inconnu, manche absente
--
-- ── LA RPC FILTRE, JAMAIS L'ÉCRAN (motif `event_etat_partage`, 20260929120000)
--
-- C'est LA raison d'être de ce fichier, et elle mérite d'être dite en clair :
-- tant que la manche est `ouverte`, le choix de l'autre N'EST PAS DANS LE
-- DOCUMENT. Il n'est pas masqué par le client, pas chiffré, pas « rendu mais
-- ignoré » — il est ABSENT. Un document JSON qui transite est un document qu'on
-- peut ouvrir : un `curl`, un onglet « réseau », et le tricheur voit ce que
-- l'écran s'était engagé à ne pas montrer.
--
-- ── LES TROIS VALEURS RÉSERVÉES SONT LUES SOUS UN `if`, PAS ÉCARTÉES PAR UN
--    `case` ──
--
-- `autre_choix`, `suggestion` et `accord` ne sont CALCULÉS que dans la branche
-- `revelee`. Un `case when v_round.status = 'revelee' then (select …) end`
-- inséré dans le `jsonb_build_object` aurait donné le même document — mais la
-- garde aurait tenu par l'accord de trois expressions, chacune réécrite un jour
-- par quelqu'un d'autre. Ici elle tient par la STRUCTURE : il n'y a rien à
-- accorder, la valeur n'existe pas hors de la branche.
--
-- ── `autre_a_choisi` EST UN BOOLÉEN, ET C'EST TOUT CE QU'IL PEUT ÊTRE ──
--
-- L'écran a besoin de dire « l'autre a scellé, on attend vous » : c'est un fait
-- sur L'EXISTENCE d'un choix, jamais sur son contenu. Un compteur, une longueur,
-- une empreinte — toutes ces variantes auraient été des fuites graduées, et un
-- `item_id` haché reste un `item_id` quand le plateau ne compte que six fiches.
--
-- ── LES HUIT CLÉS SONT TOUJOURS PRÉSENTES ──
--
-- Les trois réservées valent `null` avant la révélation plutôt que de
-- disparaître. Motif `lobby_state` (`join_code` rendu `null` aux non-hôtes) : un
-- document de forme STABLE se type une fois côté application, là où une clé qui
-- apparaît et disparaît se teste à chaque lecture — et une clé qu'on oublie de
-- tester est une clé qu'on affiche.
--
-- ── NI SALLE VIVANTE, NI SALLE OUVERTE ──
--
-- Contrairement à `duo_choose`, cette RPC ne regarde ni `status` ni
-- `expires_at` du lobby. C'est nécessaire : la révélation FERME la salle et
-- ramène sa date de mort à l'instant même (arbitrage 6), donc toute exigence de
-- ce genre rendrait `unavailable` exactement à l'écran de résultat qu'on vient
-- d'ouvrir. Ce qui est exigé, et qui suffit : ÊTRE MEMBRE, et que la manche
-- existe. Les données ne survivent pas plus longtemps que la salle — la purge
-- de L16 les emporte en cascade.
-- ────────────────────────────────────────────────────────────

create or replace function public.duo_state(
  p_lobby_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lobby public.player_lobbies%rowtype;
  v_round public.duo_rounds%rowtype;
  v_mon_item uuid;
  v_mon_choix jsonb := null;
  v_autre_choix jsonb := null;
  v_suggestion jsonb := null;
  v_accord boolean := null;
  v_autre_a_choisi boolean;
  v_autre_item uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found or v_lobby.kind <> 'duo' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- L'APPARTENANCE EST LA SEULE GARDE, ET ELLE SUFFIT. Le refus est INDISTINCT
  -- de celui d'un lobby inconnu : sans cela, un identifiant de salle volé
  -- suffirait à lire une partie où l'on n'a pas été invité.
  if not exists (
    select 1 from public.player_lobby_members m
     where m.lobby_id = v_lobby.id
       and m.token_hash = p_token_hash
  ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select r.* into v_round
    from public.duo_rounds r
   where r.lobby_id = v_lobby.id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- MON choix : toujours lisible, c'est le mien.
  select c.item_id into v_mon_item
    from public.duo_choices c
   where c.round_id = v_round.id
     and c.member_token_hash = p_token_hash;
  if found then
    select pg_catalog.jsonb_build_object('item_id', i.id, 'nom', i.nom)
      into v_mon_choix
      from public.vitrine_items i
     where i.id = v_mon_item
       and i.organization_id = v_lobby.organization_id;
  end if;

  -- L'AUTRE A-T-IL SCELLÉ : un BOOLÉEN, et rien de plus. `exists` et non
  -- `count` — un compte serait déjà une information de trop le jour où la
  -- salle en compterait plus de deux.
  v_autre_a_choisi := exists (
    select 1 from public.duo_choices c
     where c.round_id = v_round.id
       and c.member_token_hash <> p_token_hash
  );

  -- ── LA BRANCHE RÉVÉLÉE, ET ELLE SEULE ──────────────────────
  --
  -- Tout ce qui suit n'est LU que si la manche est révélée. Hors de ce `if`,
  -- `v_autre_choix`, `v_suggestion` et `v_accord` gardent leur `null` initial :
  -- ce ne sont pas des valeurs écartées à l'écriture du document, ce sont des
  -- valeurs qui n'ont jamais été cherchées.
  if v_round.status = 'revelee' then
    select c.item_id into v_autre_item
      from public.duo_choices c
     where c.round_id = v_round.id
       and c.member_token_hash <> p_token_hash;
    if found then
      select pg_catalog.jsonb_build_object('item_id', i.id, 'nom', i.nom)
        into v_autre_choix
        from public.vitrine_items i
       where i.id = v_autre_item
         and i.organization_id = v_lobby.organization_id;
    end if;

    -- L'ACCORD SE CALCULE, IL NE SE STOCKE PAS (voir §4). Booléen, sans note et
    -- sans récompense : « vous avez pensé à la même chose », et le cahier
    -- interdit tout ce qu'on pourrait vouloir en faire ensuite. Il reste `null`
    -- tant que les deux choix ne sont pas connus — un accord ne se prononce pas
    -- sur un seul.
    if v_mon_item is not null and v_autre_item is not null then
      v_accord := v_mon_item = v_autre_item;
    end if;

    -- LA PROPOSITION DE LA MAISON, après les deux autres et jamais avant :
    -- l'afficher pendant le choix aurait surligné une réponse sur le plateau.
    select pg_catalog.jsonb_build_object(
             'item_id', i.id,
             'nom', i.nom,
             'description', i.description,
             'prix_affiche', i.prix_affiche)
      into v_suggestion
      from public.duo_settings s
      join public.vitrine_items i
        on i.id = s.suggestion_item_id
       and i.organization_id = s.organization_id
     where s.organization_id = v_lobby.organization_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'status', v_round.status,
    'mon_choix', v_mon_choix,
    'options', public.duo_options_json(v_lobby.organization_id),
    'autre_a_choisi', v_autre_a_choisi,
    'autre_choix', v_autre_choix,
    'suggestion', v_suggestion,
    'accord', v_accord
  );
end;
$$;

comment on function public.duo_state(uuid, text) is
  'Ce que voit un joueur de Duo Miroir (L17), et LE CŒUR ANTI-TRICHE du lot — '
  'motif event_etat_partage (20260929120000) : LA RPC FILTRE, JAMAIS L''ÉCRAN. '
  'Tant que la manche est ouverte, le choix de l''autre N''EST PAS DANS LE '
  'DOCUMENT : ni masqué, ni chiffré, ni « rendu mais ignoré » — ABSENT. '
  'autre_choix, suggestion et accord sont lus SOUS UN `if` et non écartés par '
  'un `case` : la garde tient par la STRUCTURE, pas par l''accord de trois '
  'expressions qu''on réécrira un jour séparément. autre_a_choisi est un '
  'BOOLÉEN et ne peut être que cela — un compteur ou une empreinte auraient été '
  'des fuites graduées sur un plateau de six fiches. Les HUIT clés sont '
  'toujours présentes (null plutôt qu''absentes, motif lobby_state/join_code) : '
  'un document de forme stable se type une fois, une clé qui apparaît se teste '
  'à chaque lecture. N''exige NI salle vivante NI salle ouverte, contrairement à '
  'duo_choose : la révélation ferme la salle, donc l''exiger rendrait '
  'unavailable à l''écran de résultat lui-même. Appartenance exigée, refus '
  'indistinct. Rendue à service_role.';

revoke all on function public.duo_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.duo_state(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 9. `set_duo_options` — LE COMMERÇANT COMPOSE SON PLATEAU
--
-- CONTRAT :
--   {"state":"ok","options":int}
--   42501  — acteur absent ou non `owner|editor`
--   22023  — cardinal hors 2..6, doublon, item inconnu OU d'un autre commerce
--
-- ── REMPLACEMENT INTÉGRAL, PAS UNE FUSION ──
--
-- La RPC prend LA sélection et l'écrit en entier : `delete` puis `insert`, dans
-- une seule transaction. Une fusion aurait demandé à l'appelant de calculer un
-- diff — donc de connaître l'état courant, donc de le relire, donc de gérer la
-- course entre sa lecture et son écriture. Ici l'écran envoie ce qu'il affiche,
-- et ce qu'il affiche devient ce qui est.
--
-- L'`ordre` EST LA POSITION DANS LE TABLEAU REÇU. C'est ce que le commerçant a
-- sous les yeux quand il réordonne ses fiches ; lui demander un champ `ordre`
-- séparé aurait ouvert la possibilité qu'il contredise l'ordre du tableau.
--
-- ── L'ACTEUR EST VÉRIFIÉ EN SQL (motif `set_vitrine_slug`) ──
--
-- Parce que le geste est JOURNALISÉ : un `p_actor` accepté sur parole ferait de
-- la ligne d'audit une déclaration sur l'honneur. `owner|editor` et pas le
-- caissier — composer le plateau est un geste éditorial, pas un geste de
-- comptoir, et c'est le même partage que les policies de la table.
--
-- ── LES TROIS REFUS D'ÉCRITURE, ET POURQUOI ILS LÈVENT ──
--
-- Cardinal, doublon et item inconnu lèvent au lieu de rendre un document : ce
-- sont des bogues de l'appelant, que l'écran doit prévenir avant d'envoyer
-- (motif `invalid pseudo` dans `create_player_lobby`). ITEM INCONNU ET ITEM
-- D'UN AUTRE COMMERCE PARTAGENT LE MÊME `raise`, au message près : les
-- distinguer donnerait à un commerçant un oracle d'existence sur le catalogue
-- de son voisin, une requête à la fois.
--
-- LA BORNE BASSE EST DEUX, PAS TROIS. Le cahier demande « 3 à 6 » et l'écran
-- doit le proposer ainsi ; la base, elle, refuse ce qui rend le jeu IMPOSSIBLE,
-- et c'est une seule option (l'accord serait certain, le choix nul). Refuser
-- deux fiches ici aurait été une règle de présentation gravée dans une garde
-- d'intégrité — et `duo_start` compte déjà deux, pas trois, parce qu'une
-- cascade de suppression peut faire tomber une sélection de six à deux sans que
-- personne n'ait rien demandé.
-- ────────────────────────────────────────────────────────────

create or replace function public.set_duo_options(
  p_organization_id uuid,
  p_item_ids uuid[],
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
  v_distincts integer;
  v_connus integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  -- L'ACTEUR D'ABORD, LA SÉLECTION ENSUITE (motif
  -- `close_player_lobby_as_org`) : un non-habilité ne doit rien apprendre du
  -- catalogue qu'il désigne, pas même par la forme du chemin parcouru.
  if p_actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = p_actor
       and om.role in ('owner', 'editor')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- `coalesce` NON qualifié : ce n'est pas une fonction du catalogue mais une
  -- construction du parseur, et la préfixer casserait à l'exécution — même
  -- règle que `least` en §7 (garde `npm run sql:check`). Le `coalesce` est
  -- nécessaire : `array_length` d'un tableau VIDE rend `null`, pas zéro.
  v_n := coalesce(pg_catalog.array_length(p_item_ids, 1), 0);
  if v_n < 2 or v_n > 6 then
    raise exception 'invalid duo options count' using errcode = '22023';
  end if;

  -- L'ordinalité sert d'`ordre` plus bas : un doublon occuperait deux places
  -- avec la même fiche, et `duo_options_org_item_unique` remonterait une
  -- violation brute au lieu d'un refus lisible. On le dit ici.
  --
  -- `select distinct` ET NON `count(distinct x)` : ce dernier IGNORE les nuls,
  -- si bien qu'un tableau `{fiche, null}` compterait UN distinct pour deux
  -- éléments et se ferait refuser comme « doublon » — un message faux pour un
  -- tableau qui n'en contient pas. Avec `select distinct`, le nul compte comme
  -- une valeur, le cardinal correspond, et c'est le contrôle d'existence
  -- ci-dessous qui le refuse en le nommant correctement : un nul n'est la
  -- fiche de personne.
  select pg_catalog.count(*)::integer into v_distincts
    from (select distinct x from pg_catalog.unnest(p_item_ids) as t(x)) s;
  if v_distincts <> v_n then
    raise exception 'duplicate duo option item' using errcode = '22023';
  end if;

  -- TOUS LES ITEMS EXISTENT ET SONT DE CE COMMERCE — une seule question, donc
  -- un seul refus. Un `null` dans le tableau ne joint rien et tombe dans ce
  -- même compte.
  select pg_catalog.count(*)::integer into v_connus
    from public.vitrine_items i
   where i.organization_id = p_organization_id
     and i.id = any(p_item_ids);
  if v_connus <> v_n then
    raise exception 'unknown duo option item' using errcode = '22023';
  end if;

  -- REMPLACEMENT INTÉGRAL, dans la transaction de l'appelant. Le `delete`
  -- précède l'`insert`, donc `duo_options_org_ordre_unique` ne voit jamais deux
  -- fiches à la même place — les contraintes uniques sont vérifiées par
  -- instruction, pas en fin de transaction.
  delete from public.duo_options o
   where o.organization_id = p_organization_id;

  insert into public.duo_options (organization_id, item_id, ordre)
  select p_organization_id,
         x.item_id,
         x.ordinality::integer
    from pg_catalog.unnest(p_item_ids) with ordinality as x(item_id, ordinality);

  -- LE JOURNAL PORTE LE GESTE. Le COMPTE et non la liste : « qui a changé le
  -- plateau, et pour combien de fiches » est la question qu'on se pose après
  -- coup ; recopier six identifiants dans l'audit n'y répond pas mieux et
  -- duplique un état que la table porte déjà.
  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor::text, 'duo.options_set',
          pg_catalog.jsonb_build_object('options', v_n));

  return pg_catalog.jsonb_build_object('state', 'ok', 'options', v_n);
end;
$$;

comment on function public.set_duo_options(uuid, uuid[], uuid) is
  'Le commerçant compose le plateau de Duo Miroir (L17) : REMPLACEMENT INTÉGRAL '
  'de la sélection (delete puis insert, une transaction), et non une fusion — '
  'l''écran envoie ce qu''il affiche, sans avoir à calculer un diff ni à gérer '
  'la course entre sa lecture et son écriture. L''ordre est la POSITION DANS LE '
  'TABLEAU reçu. Acteur vérifié EN SQL owner|editor (motif set_vitrine_slug), '
  'parce que le geste est JOURNALISÉ (duo.options_set) : un p_actor accepté sur '
  'parole ferait de l''audit une déclaration sur l''honneur. Cardinal hors 2..6, '
  'doublon et item inconnu lèvent en 22023 — bogues d''appelant que l''écran doit '
  'prévenir ; ITEM INCONNU et ITEM D''UN AUTRE COMMERCE partagent le MÊME raise, '
  'sinon un commerçant énumérerait le catalogue de son voisin. La borne basse '
  'est DEUX et non trois : le cahier demande 3 à 6 et l''écran le propose ainsi, '
  'mais la base ne refuse que ce qui rend le jeu IMPOSSIBLE — et une cascade de '
  'suppression de fiche peut faire tomber une sélection sans que personne n''ait '
  'rien demandé. Rendue à service_role.';

revoke all on function public.set_duo_options(uuid, uuid[], uuid)
  from public, anon, authenticated;
grant execute on function public.set_duo_options(uuid, uuid[], uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 10. `set_duo_suggestion` — LA PROPOSITION DE LA MAISON
--
-- CONTRAT :
--   {"state":"ok","suggestion":uuid|null}
--   42501  — acteur absent ou non `owner|editor`
--   22023  — item inconnu OU d'un autre commerce
--
-- `p_item_id` NUL RETIRE LA SUGGESTION, et ce n'est pas un cas d'erreur : le
-- commerçant qui ne veut plus rien proposer doit pouvoir le dire, et lui
-- imposer une seconde RPC « effacer » aurait dédoublé le journal pour un même
-- geste. Le document rendu porte la valeur POSÉE, donc `null` s'y lit comme le
-- retrait qu'il est.
--
-- LA LIGNE NAÎT ICI, et c'est pourquoi `duo_settings` n'a pas de `grant
-- insert` (motif `vitrine_settings`) : la première suggestion est celle qui
-- compte, et elle doit laisser une trace comme les suivantes.
-- ────────────────────────────────────────────────────────────

create or replace function public.set_duo_suggestion(
  p_organization_id uuid,
  p_item_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  if p_actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = p_actor
       and om.role in ('owner', 'editor')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- ITEM INCONNU ET ITEM D'UN AUTRE COMMERCE : le MÊME raise, même motif qu'en
  -- §9. La FK composite refuserait de toute façon le second, mais une violation
  -- de contrainte remontée brute n'est pas une réponse — et elle NOMMERAIT la
  -- contrainte, donc la table, donc le fait que l'item existe ailleurs.
  if p_item_id is not null and not exists (
    select 1 from public.vitrine_items i
     where i.organization_id = p_organization_id
       and i.id = p_item_id
  ) then
    raise exception 'unknown duo suggestion item' using errcode = '22023';
  end if;

  insert into public.duo_settings (organization_id, suggestion_item_id)
  values (p_organization_id, p_item_id)
  on conflict (organization_id) do update
     set suggestion_item_id = excluded.suggestion_item_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor::text, 'duo.suggestion_set',
          pg_catalog.jsonb_build_object('suggestion_item_id', p_item_id));

  return pg_catalog.jsonb_build_object('state', 'ok', 'suggestion', p_item_id);
end;
$$;

comment on function public.set_duo_suggestion(uuid, uuid, uuid) is
  'Le commerçant pose — ou retire — la proposition de la maison pour Duo Miroir '
  '(L17). p_item_id NUL retire la suggestion : ce n''est pas un cas d''erreur, '
  'et une seconde RPC « effacer » aurait dédoublé le journal pour un même '
  'geste. La ligne duo_settings NAÎT ici, ce qui est la raison de son absence '
  'de grant insert (motif vitrine_settings) : la première suggestion est celle '
  'qui compte. Acteur owner|editor vérifié EN SQL parce que le geste est '
  'journalisé (duo.suggestion_set). Item inconnu et item d''un autre commerce '
  'partagent le MÊME raise 22023 — la FK composite refuserait le second, mais '
  'une violation brute nommerait la contrainte, donc la table, donc le fait que '
  'l''item existe ailleurs. Rendue à service_role.';

revoke all on function public.set_duo_suggestion(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.set_duo_suggestion(uuid, uuid, uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 11. `duo_options_state` — L'ÉCRAN DU COMMERÇANT
--
-- CONTRAT :
--   {"options":[{item_id, nom, description, prix_affiche, photo_path, ordre}],
--    "suggestion":{"item_id":uuid,"nom":text,
--                  "description":text|null,"prix_affiche":text|null}|null}
--
-- Toujours un document, jamais un refus : une organisation inconnue et une
-- organisation sans sélection rendent le MÊME `{"options":[],
-- "suggestion":null}`. Il n'y a rien à distinguer — l'appelant est le serveur,
-- qui connaît déjà l'organisation dont il tient l'écran (motif
-- `org_player_lobbies`).
--
-- PAS D'ACTEUR, ET C'EST LE MÊME ARBITRAGE QU'EN §12 DE L16 : cette RPC ne rend
-- rien de personnel — ni pseudo, ni empreinte, ni choix de joueur, seulement le
-- catalogue que le commerçant a lui-même épinglé — et n'écrit rien. Exiger un
-- `p_actor` ici aurait coûté une vérification par rafraîchissement d'écran pour
-- garder une liste de plats. La garde qui compte est celle de l'ÉCRITURE, et
-- elle est en SQL — §9 et §10.
--
-- ELLE NE MONTRE AUCUNE PARTIE. Ni manche, ni choix, ni accord : le commerçant
-- configure son plateau, il ne regarde pas jouer ses clients par-dessus leur
-- épaule. C'est la même limite qu'`org_player_lobbies`, qui rend des salles
-- sans rendre ni pseudo ni code de partage.
-- ────────────────────────────────────────────────────────────

create or replace function public.duo_options_state(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_suggestion jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  select pg_catalog.jsonb_build_object(
           'item_id', i.id,
           'nom', i.nom,
           'description', i.description,
           'prix_affiche', i.prix_affiche)
    into v_suggestion
    from public.duo_settings s
    join public.vitrine_items i
      on i.id = s.suggestion_item_id
     and i.organization_id = s.organization_id
   where s.organization_id = p_organization_id;

  return pg_catalog.jsonb_build_object(
    'options', public.duo_options_json(p_organization_id),
    'suggestion', v_suggestion
  );
end;
$$;

comment on function public.duo_options_state(uuid) is
  'L''écran de configuration Duo Miroir du commerçant (L17) : les fiches '
  'épinglées et la proposition de la maison, avec leurs noms. Toujours un '
  'document, jamais un refus — organisation inconnue et organisation sans '
  'sélection rendent le même {"options":[],"suggestion":null}. PAS D''ACTEUR, '
  'même arbitrage qu''org_player_lobbies : elle ne rend rien de personnel '
  '(seulement le catalogue que le commerçant a lui-même épinglé) et n''écrit '
  'rien, donc la garde qui compte est celle de l''écriture — set_duo_options et '
  'set_duo_suggestion, vérifiées en SQL. NE MONTRE AUCUNE PARTIE : ni manche, '
  'ni choix, ni accord. Le commerçant configure son plateau, il ne regarde pas '
  'jouer ses clients par-dessus leur épaule. Rendue à service_role.';

revoke all on function public.duo_options_state(uuid)
  from public, anon, authenticated;
grant execute on function public.duo_options_state(uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 12. `vitrine_public_state` — LA PORTE MANQUANTE
--
-- ── SANS PORTE, LE JEU EXISTE ET PERSONNE NE LE TROUVE ──
--
-- Tout ce qui précède fabrique un jeu jouable, et rien de tout cela n'était
-- ANNONCÉ nulle part : `portes.experiences` ne portait que `quiz`, et aucune
-- page publique ne menait à un salon. Un module qu'on ne peut pas atteindre
-- depuis la vitrine du commerce n'a pas été livré à moitié — il n'a pas été
-- livré. C'est le sens de cette section, et c'est la seule raison pour laquelle
-- une migration Duo Miroir touche à une fonction Vitrine.
--
-- ── UN BOOLÉEN, ET RIEN D'AUTRE ──
--
-- `duo: true|false`, jamais un objet ni une liste. La différence avec `quiz`
-- n'est pas un caprice de forme : un quiz est une COLLECTION — le commerce en
-- publie plusieurs, chacun avec son adresse propre, donc l'écran a besoin de
-- leurs slugs et de leurs titres pour peindre N liens. Duo Miroir est UN jeu par
-- commerce, à UNE adresse déductible du slug de la vitrine
-- (`/lobby/nouveau/{slug}`). L'écran n'a besoin de rien de plus que « oui » ou
-- « non », et publier davantage — le nombre de fiches épinglées, leurs noms —
-- serait publier ce que le commerçant a rangé dans sa configuration, pas dans sa
-- vitrine.
--
-- ── LE SEUIL N'EST PAS ÉCRIT ICI ──
--
-- `duo_jouable` (§5 bis) est la MÊME fonction que celle dont `duo_start` tire
-- son `non_configure`. C'est ce qui garantit la propriété qui compte pour le
-- visiteur : la porte est visible si et seulement si le jeu démarre. Recopier
-- « au moins deux options » ici aurait créé deux vérités qui se ressemblent
-- aujourd'hui et divergeront un jour — en laissant soit une porte ouverte sur
-- un refus, soit un jeu que personne ne trouve.
--
-- ── AUCUN DROIT SUPPLÉMENTAIRE N'EST DEMANDÉ ──
--
-- Contrairement à `quiz`, qui redemande `org_has_module_access(…, 'quiz')`
-- parce qu'il n'est pas couvert par `vitrine`. Les salons joueurs, eux, SONT la
-- Vitrine : ADR-109 §A1 a tranché un entitlement unique, et
-- `create_player_lobby` (L16) n'exige rien d'autre que `vitrine` + `published`
-- — les deux étant déjà acquis à ce point de la fonction. Redemander un droit
-- ici aurait annoncé une porte selon une règle, et l'aurait ouverte selon une
-- autre.
--
-- ── MÊME SIGNATURE, DONC PAS DE `drop` ──
--
-- `src/lib/vitrine-context.ts` appelle à deux arguments depuis L11, et
-- `vitrine.test.sql` compte qu'il n'existe qu'UN exemplaire de cette fonction.
-- Le corps est celui de 20261015120000, à l'identique, plus la clé `duo` : une
-- réécriture partielle par `alter` n'existe pas pour une fonction, donc la
-- recopie intégrale est le seul geste possible — et c'est pourquoi cette
-- migration doit rester la DERNIÈRE à toucher `vitrine_public_state`.
-- ────────────────────────────────────────────────────────────

create or replace function public.vitrine_public_state(
  p_slug text,
  p_lang text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings   public.vitrine_settings%rowtype;
  v_org        public.organizations%rowtype;
  v_lang       text;
  v_accroche   text;
  v_histoire   text;
  v_horaires   text;
  v_total      integer;
  v_frais      integer;
  v_lang_traduite constant text := 'en';
  c_max_portes constant integer := 12;
  c_max_contenus constant integer := 3;
  v_activites  jsonb;
  v_files      jsonb;
  v_offres     jsonb;
  v_quiz       jsonb;
  v_contenus   jsonb;
  -- LA PORTE DU JEU (L17). Un booléen : voir l'en-tête de section.
  v_duo        boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- FORME D'ABORD, et le refus est déjà `unavailable` : une adresse mal formée
  -- ne peut désigner aucune vitrine, et lever ici aurait donné à l'appelant un
  -- moyen de distinguer « impossible » de « inconnu ».
  if p_slug is null or p_slug !~ '^[a-z0-9-]{3,60}$' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_lang := pg_catalog.lower(pg_catalog.btrim(coalesce(p_lang, 'fr')));
  if v_lang <> v_lang_traduite then
    v_lang := 'fr';
  end if;

  select * into v_settings
    from public.vitrine_settings s
   where s.slug = p_slug;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if not v_settings.published then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if not public.org_has_module_access(v_settings.organization_id, 'vitrine') then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select * into v_org
    from public.organizations o
   where o.id = v_settings.organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select
    pg_catalog.max(t.texte) filter (where t.champ = 'accroche'),
    pg_catalog.max(t.texte) filter (where t.champ = 'histoire'),
    pg_catalog.max(t.texte) filter (where t.champ = 'horaires_texte')
  into v_accroche, v_histoire, v_horaires
    from public.vitrine_translations t
   where t.organization_id = v_settings.organization_id
     and t.cible_type = 'settings'
     and t.cible_id = v_settings.id
     and t.lang = v_lang
     and t.version_source >= v_settings.updated_at;

  -- NI LES PORTES, NI LES CONTENUS, NI LA PORTE DUO n'entrent dans la
  -- couverture : aucun ne passe par `vitrine_champs_traduisibles`, donc ni le
  -- numérateur ni le dénominateur ne bougent. Un booléen n'a d'ailleurs rien à
  -- traduire — mais il fallait que l'ajout de L17 laisse ce calcul EXACTEMENT
  -- où il était, sans quoi les vitrines traduites seraient retombées sous le
  -- seuil du sélecteur de langue (19/19 et 5/5 du seed restent invariants).
  select pg_catalog.count(*)::integer,
         pg_catalog.count(t.id)::integer
    into v_total, v_frais
    from public.vitrine_champs_traduisibles(v_settings.organization_id, true) c
    left join public.vitrine_translations t
      on t.organization_id = v_settings.organization_id
     and t.cible_type = c.cible_type
     and t.cible_id = c.cible_id
     and t.champ = c.champ
     and t.lang = v_lang_traduite
     and t.version_source >= c.version_courante;

  -- ── LES PORTES (VIT-3) ─────────────────────────────────────
  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object('id', x.id::text, 'nom', x.nom)
             order by x.nom, x.id),
           '[]'::jsonb)
    into v_activites
    from (select a.id, a.name as nom
            from public.reservation_activities a
           where a.organization_id = v_settings.organization_id
             and a.active
           order by a.name, a.id
           limit c_max_portes) x;

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object('id', x.id::text, 'nom', x.nom)
             order by x.nom, x.id),
           '[]'::jsonb)
    into v_files
    from (select q.id, q.name as nom
            from public.reservation_queues q
           where q.organization_id = v_settings.organization_id
             and q.status = 'open'
           order by q.name, q.id
           limit c_max_portes) x;

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'id', x.id::text,
               'nom', x.nom,
               'window_starts_at', x.window_starts_at,
               'window_ends_at', x.window_ends_at)
             order by x.nom, x.id),
           '[]'::jsonb)
    into v_offres
    from (select o.id, o.title as nom, o.window_starts_at, o.window_ends_at
            from public.reservation_stock_offers o
           where o.organization_id = v_settings.organization_id
             and o.status = 'open'
             and o.window_starts_at <= pg_catalog.now()
             and o.window_ends_at > pg_catalog.now()
           order by o.title, o.id
           limit c_max_portes) x;

  -- LE SEUL DROIT REDEMANDÉ ICI. `quiz` n'est pas couvert par `vitrine` : sans
  -- ce test, une vitrine servie aurait annoncé un quiz que sa propre page
  -- publique refuse d'ouvrir. Duo Miroir, lui, EST la Vitrine (ADR-109 §A1) et
  -- ne redemande rien — voir l'en-tête de section.
  if public.org_has_module_access(v_settings.organization_id, 'quiz') then
    select coalesce(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object('slug', x.slug, 'titre', x.titre)
               order by x.titre, x.id),
             '[]'::jsonb)
      into v_quiz
      from (select q.id, q.public_slug as slug, q.name as titre
              from public.quizzes q
             where q.organization_id = v_settings.organization_id
               and q.status = 'active'
             order by q.name, q.id
             limit c_max_portes) x;
  else
    v_quiz := '[]'::jsonb;
  end if;

  -- LA PORTE DU JEU (L17). Le seuil vit dans `duo_jouable`, partagé avec
  -- `duo_start` : la porte est visible si et seulement si le jeu démarre.
  v_duo := public.duo_jouable(v_settings.organization_id);

  -- ── LES CONTENUS MIS EN AVANT (VIT-4) ──────────────────────
  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'titre', x.titre, 'url', x.url, 'rang', x.rang)
             order by x.rang),
           '[]'::jsonb)
    into v_contenus
    from (select c.titre, c.url, c.rang
            from public.vitrine_contenus c
           where c.organization_id = v_settings.organization_id
           order by c.rang
           limit c_max_contenus) x;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'slug', v_settings.slug,
    'lang', v_lang,
    'lang_coverage', pg_catalog.jsonb_build_object(
      'lang', v_lang_traduite,
      'total_champs_traduisibles', v_total,
      'traduits_frais', v_frais
    ),
    'identite', pg_catalog.jsonb_build_object(
      'nom', v_org.name,
      'logo_url', v_org.logo_url,
      'accroche', coalesce(v_accroche, v_settings.accroche),
      'histoire', coalesce(v_histoire, v_settings.histoire),
      'horaires_texte', coalesce(v_horaires, v_settings.horaires_texte),
      'cover_path', v_settings.cover_path,
      'theme', v_settings.theme
    ),
    'liens', pg_catalog.jsonb_build_object(
      'google_review_url', v_org.google_review_url,
      'instagram_url', v_org.instagram_url,
      'tiktok_url', v_org.tiktok_url
    ),
    'contenus', v_contenus,
    'cartes', public.vitrine_cartes_json(
      v_settings.organization_id, true, v_lang),
    -- LES PORTES DES MODULES (VIT-3, plus la porte Duo de L17). Les quatre
    -- listes et le drapeau existent TOUJOURS, même vides et même à faux : c'est
    -- l'écran qui masque un bloc sans contenu, pas la base. `duo` à `false` est
    -- une réponse, pas une absence — et une clé qui apparaît et disparaît se
    -- teste à chaque lecture, là où une forme stable se type une fois.
    'portes', pg_catalog.jsonb_build_object(
      'reserver', pg_catalog.jsonb_build_object(
        'activites', v_activites,
        'files', v_files,
        'offres', v_offres
      ),
      'experiences', pg_catalog.jsonb_build_object(
        'quiz', v_quiz,
        'duo', v_duo
      )
    )
  );
end;
$$;

comment on function public.vitrine_public_state(text, text) is
  'État PUBLIC d''une vitrine, par son slug et dans une langue (VIT-1a, langue '
  'ajoutée en VIT-1b, PORTES en VIT-3, CONTENUS MIS EN AVANT en VIT-4, PORTE DUO '
  'MIROIR en L17). Exige `published` ET org_has_module_access(…, ''vitrine''), '
  'relu à CHAQUE consultation. Rend `unavailable` INDISTINCTEMENT pour un slug '
  'mal formé, inconnu, non publié ou sans droit — ce point d''entrée non '
  'authentifié n''est pas un oracle. `p_lang` null, ''fr'' ou INCONNUE → '
  'français : le repli est silencieux. En anglais, les traductions FRAÎCHES se '
  'superposent champ à champ et les périmées sont ignorées. Rend `lang` — la '
  'langue RÉELLEMENT servie — et `lang_coverage` DANS LES DEUX LANGUES ; le '
  'SEUIL reste dans l''application. `portes` rend l''annuaire des pages publiques '
  'du commerce : {reserver: {activites, files, offres}, experiences: {quiz, '
  'duo}} — QUATRE listes toujours présentes (douze par liste, identifiants en '
  'TEXTE) et UN drapeau toujours présent. `duo` est un BOOLÉEN et non une '
  'liste : Duo Miroir est UN jeu par commerce, à une adresse déductible du slug '
  '(/lobby/nouveau/{slug}), là où les quiz sont une collection dont l''écran a '
  'besoin des slugs. Il vaut vrai si et seulement si duo_jouable() — la MÊME '
  'fonction dont duo_start tire son non_configure, pour que la porte soit '
  'visible si et seulement si le jeu démarre. Il ne redemande AUCUN droit, '
  'contrairement à quiz : les salons SONT la Vitrine (ADR-109 §A1). NI LES '
  'PORTES, NI LES CONTENUS, NI LA PORTE DUO NE SONT TRADUISIBLES : ils '
  'n''entrent ni au numérateur ni au dénominateur de `lang_coverage`, sans quoi '
  'toute vitrine traduite retomberait sous le seuil du sélecteur de langue. '
  'N''expose aucune donnée de client, aucun identifiant d''organisation.';

revoke all on function public.vitrine_public_state(text, text)
  from public, anon, authenticated;
grant execute on function public.vitrine_public_state(text, text) to service_role;
