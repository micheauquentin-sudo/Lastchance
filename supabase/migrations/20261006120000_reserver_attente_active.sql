-- ============================================================
-- « RÉSERVER » — LE MODE ATTENTE ACTIVE (RES-4, lot L7) — COUCHE SQL
--
-- Le cahier tient RES-4 en une phrase : « une session d'attente serveur sépare
-- STRICTEMENT file/réservation et animation ». Tout ce fichier n'est que la
-- mise en objet de cette séparation.
--
-- ── CE QUE CE LOT N'INVENTE PAS, ET C'EST L'ESSENTIEL ──
--
-- AUCUN moteur de jeu, AUCUNE famille de récompense. Les deux animations sont
-- des expériences DÉJÀ LIVRÉES du produit, simplement PROPOSÉES pendant
-- l'attente :
--
--   · Quiz éclair  — un `quizzes` existant de l'organisation, choisi par le
--                    commerçant. Le parcours quiz est celui de 20260803120000,
--                    inchangé, avec son économie et son stock fini.
--   · Pause Chance — UNE participation offerte sur une `campaigns` existante,
--                    choisie par le commerçant. Le tour est tiré par la MÊME
--                    mécanique que les quatre tours offerts déjà en place
--                    (fidélité, calendrier, parrainage, quiz), donc sous la
--                    MÊME borne économique : stock fini, ADR-031, BORNE 2.
--   · « voir l'activité » — un LIEN. Zéro SQL ; `activity_id` est rendu par
--                    `wait_session_open` pour que la surface sache où pointer.
--
-- C'est ce qui rend le critère « gains décidés côté serveur à valeur plafonnée »
-- vrai SANS RIEN ÉCRIRE DE NEUF : le plafond est celui de la campagne que le
-- commerçant a déjà dotée, et il est décompté par le même `update prizes set
-- stock = stock - 1` que partout ailleurs.
--
-- ── LES CINQ CRITÈRES DURS DE RES-4, ET OÙ ILS SONT TENUS ──
--
--   1. LA SESSION SÉPARE STRICTEMENT LA FILE DE L'ANIMATION. C'est la table de
--      la section 2 : une ligne à part, dans une table à part, qui POINTE vers
--      la source sans jamais en faire partie. La file ne sait pas qu'elle
--      existe — aucune des sept RPC de RES-3 n'a été touchée par ce fichier.
--
--   2. LE JEU NE PEUT NI LIRE NI MODIFIER RANG, PRIORITÉ, CAPACITÉ, ACCÈS,
--      DÉLAI OU DROIT À UNE PLACE. C'est l'invariant MÉCANIQUE de ce fichier, et
--      il se lit dans le code plutôt que dans une promesse : les trois RPC
--      ci-dessous n'exécutent, sur `reservation_queue_entries`, `reservations`
--      et `reservation_waitlist_entries`, QUE des `select` de PROPRIÉTÉ (une
--      empreinte), de VIVACITÉ (un `status`) et d'APPARTENANCE (`queue_id`,
--      `activity_id` — DE QUELLE file ou activité relève cette attente, ce qui
--      est l'adresse du guichet, jamais une position dans sa file). Aucun
--      `update`, aucun `insert`, aucun `delete`, pas même sur une colonne
--      d'ornement. Et surtout AUCUNE lecture de `created_at` — qui EST le rang —
--      ni d'aucun compteur : elles ne rendent au joueur NI rang, NI compteur
--      d'attente, NI échéance, et `queue_public_state` reste le seul chemin vers
--      ces nombres. `reserver_attente.test.sql` le prouve en photographiant les
--      trois tables avant et après chaque appel.
--
--   3. UNE PAUSE CHANCE EST BORNÉE PAR SESSION. Une colonne, `pause_chance_used_at`,
--      et un `update` CONDITIONNEL (`where … is null`) : le verrou est la ligne
--      elle-même, donc deux appels simultanés en voient exactement un gagner.
--      Et comme la session est UNIQUE PAR SOURCE (index unique partiel), la
--      borne réelle est « une Pause Chance par entrée en file », pour toujours.
--
--   4. LE JEU SE FERME PROPREMENT À L'APPEL. La base le rend POSSIBLE, elle ne
--      peut pas le rendre EFFECTIF : c'est un geste d'écran. Ce que ce fichier
--      garantit, c'est qu'il n'y a RIEN à défaire — aucune animation ne tient de
--      ressource, aucune ne doit être « terminée » pour que la file avance, et
--      fermer l'onglet au milieu d'un quiz ne coûte pas une place. Le cri
--      lui-même vient de `queue_public_state.status = 'called'`, que la surface
--      lit déjà (RES-3, section 10).
--
--   5. TOUTE RÉCOMPENSE N'EST REMISE QU'APRÈS CHECK-IN OU HORS DU FLUX DE FILE.
--      Tenu PAR CONSTRUCTION, et c'est le point le plus important de ce fichier :
--      le gain d'une Pause Chance est un `spins` ORDINAIRE, donc un code de
--      retrait ordinaire, remis EN CAISSE comme n'importe quel gain. Or la
--      caisse EST la visite. Il n'existe aucun chemin par lequel une récompense
--      d'attente puisse être remise dans la file, parce qu'il n'existe aucune
--      remise dans la file — ni ici, ni dans RES-3.
--
--   6. AUCUNE ANIMATION N'EST NÉCESSAIRE POUR CONSERVER SA PLACE. Corollaire
--      direct du 2 : rien de ce fichier n'écrit dans la file, donc rien de ce
--      fichier ne peut conditionner un rang. La preuve est la même photographie.
--
-- ── LA SOURCE EST POLYMORPHE, ET STRICTEMENT ──
--
-- On attend de DEUX façons dans ce produit : debout dans la file (RES-3), ou
-- avec un créneau confirmé en poche (RES-1). Les deux méritent une animation,
-- et ce sont deux tables. Une session porte donc DEUX colonnes de source dont
-- EXACTEMENT UNE est posée — `num_nonnulls(...) = 1`, pas « au moins une » —
-- et une FK COMPOSITE vers chacune. Deux sessions séparées, une par forme
-- d'attente, auraient dupliqué les trois RPC pour une seule différence : où
-- lire la configuration.
--
-- ── CE QUE CE FICHIER NE FAIT PAS, VOLONTAIREMENT ──
--
--   * AUCUNE PAGE, AUCUNE SERVER ACTION, AUCUN CÂBLAGE. Comme L6 : le modèle et
--     les RPC d'abord, la surface ensuite.
--   * AUCUN ETA, AUCUN RANG, AUCUN COMPTEUR D'ATTENTE dans les réponses. Voir
--     le critère 2 : les rendre ici aurait fait de la session d'animation une
--     SECONDE source de vérité sur la file, c'est-à-dire exactement ce que la
--     séparation interdit.
--   * AUCUNE NOUVELLE FAMILLE DE RÉCOMPENSE, AUCUN NOUVEAU MOTEUR. Voir plus
--     haut : c'est le cadrage MVP, et il est structurel, pas cosmétique.
--   * AUCUNE EXPIRATION, AUCUN BALAYAGE pg_cron. Une session d'attente ne tient
--     rien : la laisser vivre ne coûte pas une place, et la faire expirer serait
--     un délai automatique là où le cahier n'en veut pas.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. La configuration d'attente — DEUX colonnes, sur les DEUX porteurs
--
-- ── POURQUOI SUR LES DEUX, ET PAS SUR UNE TROISIÈME TABLE ──
--
-- Les deux formes d'attente n'ont pas le même porteur de configuration : celui
-- qui attend DEBOUT attend dans une FILE (`reservation_queues`), celui qui
-- attend AVEC UN CRÉNEAU attend une ACTIVITÉ (`reservation_activities`). Une
-- table de configuration commune aurait exigé une troisième clé polymorphe pour
-- dire de qui elle parle, et le commerçant aurait réglé son animation dans un
-- écran séparé de celui où il règle la file. Deux colonnes sur chaque porteur
-- disent la même chose, se règlent là où le commerçant regarde déjà, et
-- disparaissent avec lui.
--
-- ── `null` = « aucune animation », ET C'EST LE DÉFAUT ──
--
-- Le Mode Attente active est FACULTATIF (cahier, § « couche facultative »).
-- Aucune file existante n'en reçoit une, et une file sans configuration se
-- comporte exactement comme avant ce fichier.
--
-- ── FK COMPOSITES, ET `no action` PLUTÔT QUE `set null` ──
--
-- Composites, parce qu'un quiz ou une campagne d'un AUTRE locataire n'a rien à
-- faire dans l'écran d'attente d'un commerce — c'est le patron du dépôt et
-- `fk_composites_couverture.test.sql` en est le gardien.
--
-- `no action` (le défaut) et NON `on delete set null`, pour une raison
-- mécanique : `set null` sur une FK composite annule TOUTES ses colonnes, donc
-- `organization_id`, qui est `not null` — la suppression échouerait sur une
-- contrainte incompréhensible. C'est l'arbitrage déjà tenu par
-- `quizzes.target_wheel_id`, `calendar_days.target_wheel_id` et
-- `loyalty_milestones.target_wheel_id` : supprimer un quiz encore proposé en
-- attente est BLOQUÉ (le commerçant décroche d'abord), et la cascade d'une
-- organisation entière n'est pas cassée pour autant — les deux côtés partent
-- dans la même instruction.
-- ────────────────────────────────────────────────────────────

alter table public.reservation_queues
  add column if not exists wait_quiz_id uuid;
alter table public.reservation_queues
  add column if not exists wait_pause_campaign_id uuid;

alter table public.reservation_activities
  add column if not exists wait_quiz_id uuid;
alter table public.reservation_activities
  add column if not exists wait_pause_campaign_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_queues'::regclass
       and con.conname = 'reservation_queues_wait_quiz_fkey'
  ) then
    alter table public.reservation_queues
      add constraint reservation_queues_wait_quiz_fkey
      foreign key (wait_quiz_id, organization_id)
      references public.quizzes(id, organization_id);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_queues'::regclass
       and con.conname = 'reservation_queues_wait_pause_campaign_fkey'
  ) then
    alter table public.reservation_queues
      add constraint reservation_queues_wait_pause_campaign_fkey
      foreign key (wait_pause_campaign_id, organization_id)
      references public.campaigns(id, organization_id);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::regclass
       and con.conname = 'reservation_activities_wait_quiz_fkey'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_wait_quiz_fkey
      foreign key (wait_quiz_id, organization_id)
      references public.quizzes(id, organization_id);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::regclass
       and con.conname = 'reservation_activities_wait_pause_campaign_fkey'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_wait_pause_campaign_fkey
      foreign key (wait_pause_campaign_id, organization_id)
      references public.campaigns(id, organization_id);
  end if;
end;
$$;

comment on column public.reservation_queues.wait_quiz_id is
  'Quiz EXISTANT de l''organisation proposé pendant l''attente (RES-4). '
  '`null` = aucune animation de quiz, et c''est le défaut : le Mode Attente '
  'active est facultatif. Ne confère AUCUN droit sur la file — le quiz ignore '
  'jusqu''à l''existence d''un rang.';
comment on column public.reservation_queues.wait_pause_campaign_id is
  'Campagne EXISTANTE de l''organisation sur laquelle une Pause Chance offre UNE '
  'participation (RES-4). L''économie est celle de la campagne — stock fini, '
  'ADR-031, BORNE 2 — et rien n''est créé ici : le gain éventuel est un code de '
  'retrait ORDINAIRE, remis EN CAISSE comme n''importe quel gain, donc hors du '
  'flux de file par construction.';
comment on column public.reservation_activities.wait_quiz_id is
  'Miroir de reservation_queues.wait_quiz_id, pour l''attente AVEC CRÉNEAU : '
  'celui qui a réservé attend une ACTIVITÉ, pas une file.';
comment on column public.reservation_activities.wait_pause_campaign_id is
  'Miroir de reservation_queues.wait_pause_campaign_id, pour l''attente AVEC '
  'CRÉNEAU.';

-- Index de tête des FK composites. PARTIELS, motif `reservation_queues_activity_idx` :
-- une animation d''attente est facultative et restera minoritaire — les lignes
-- sans configuration n''ont rien à faire dans ces index. Ils servent surtout la
-- vérification de la FK au moment où le commerçant supprime un quiz ou une
-- campagne encore proposés, qui balaierait sinon les deux tables.
create index if not exists reservation_queues_wait_quiz_idx
  on public.reservation_queues (wait_quiz_id)
  where wait_quiz_id is not null;
create index if not exists reservation_queues_wait_pause_campaign_idx
  on public.reservation_queues (wait_pause_campaign_id)
  where wait_pause_campaign_id is not null;
create index if not exists reservation_activities_wait_quiz_idx
  on public.reservation_activities (wait_quiz_id)
  where wait_quiz_id is not null;
create index if not exists reservation_activities_wait_pause_campaign_idx
  on public.reservation_activities (wait_pause_campaign_id)
  where wait_pause_campaign_id is not null;

-- Le commerçant règle son animation depuis l'écran de la file et depuis celui
-- de l'activité : les colonnes rejoignent les listes blanches de colonnes du
-- socle et de RES-3. ADDITIF — aucun grant existant n'est repris ni élargi, et
-- rien d'autre n'est ouvert (motif `waitlist_offer_minutes`, L5).
grant insert (wait_quiz_id, wait_pause_campaign_id)
  on public.reservation_queues to authenticated;
grant update (wait_quiz_id, wait_pause_campaign_id)
  on public.reservation_queues to authenticated;
grant insert (wait_quiz_id, wait_pause_campaign_id)
  on public.reservation_activities to authenticated;
grant update (wait_quiz_id, wait_pause_campaign_id)
  on public.reservation_activities to authenticated;


-- ────────────────────────────────────────────────────────────
-- 2. `reservation_wait_sessions` — la séparation, faite objet
--
-- ── LA CIBLE DE FK QUI MANQUAIT ──
--
-- Une FK composite exige une contrainte d'unicité sur le couple visé.
-- `reservations` a reçu la sienne au lot L5 ; `reservation_queue_entries`
-- n'était encore la cible de rien et n'en a pas. Elle est posée ici, par un bloc
-- CONDITIONNEL et non par `drop … if exists` + `add` — le `drop` d'une
-- contrainte dont dépendent des FK échouerait, et il échouerait dans la
-- migration qui vient précisément de créer ces FK (raison et forme reprises de
-- 20261004120000).
--
-- ── POURQUOI LE GRANT DE SPIN VIT SUR CETTE LIGNE, ET PAS DANS UNE TABLE À PART ──
--
-- Les quatre tours de roue offerts déjà livrés (fidélité, calendrier,
-- parrainage, quiz) portent leur octroi EN COLONNES SUR LEUR PROPRE LIGNE DE
-- RÉCOMPENSE — `spin_grant_token`, `consumed_at`, `resulting_spin_id` — et non
-- dans une table d'octrois commune : il n'existe AUCUN mécanisme générique dans
-- ce dépôt, et prétendre en brancher un aurait été inventer le cinquième
-- exemplaire d'un patron sous un nom qui ne le décrit pas. Ici, la ligne de
-- récompense EST la session : une session, au plus une Pause Chance, au plus un
-- octroi. La borne « une par session » du cahier devient alors STRUCTURELLE —
-- une table séparée aurait dû la redire par une contrainte d'unicité, qu'on
-- aurait pu oublier d'écrire.
--
-- ── AUCUNE POLICY, ET C'EST LE RÉGIME DE L5/L6 ──
--
-- Voir la section 3. Rien de cette table n'a d'écran : ni le joueur (qui passe
-- par les RPC), ni le commerçant (dont l'écran d'accueil ne parle que de rangs).
-- ────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_queue_entries'::regclass
       and con.conname = 'reservation_queue_entries_id_org_unique'
  ) then
    alter table public.reservation_queue_entries
      add constraint reservation_queue_entries_id_org_unique
      unique (id, organization_id);
  end if;
end;
$$;

create table if not exists public.reservation_wait_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  -- ── LA SOURCE, POLYMORPHE ET STRICTE ──
  -- Colonnes NUES : seules les FK COMPOSITES ci-dessous relient la session à son
  -- attente. Une FK simple en plus n'ajouterait rien et ferait rougir
  -- `fk_composites_couverture.test.sql`, dont c'est le métier.
  queue_entry_id uuid,
  reservation_id uuid,

  -- Empreinte SHA-256 du cookie joueur, ou marqueur de purge : MÊME forme, MÊME
  -- raison et MÊME marqueur que `reservations.player_key_hash`. Recopiée ici
  -- plutôt que relue par jointure, pour que l'autorisation d'une RPC de session
  -- ne demande JAMAIS d'ouvrir la table de la file.
  player_key_hash text not null,

  -- LE VERROU DE LA PAUSE CHANCE, et il tient à lui seul le critère « bornée par
  -- session » : posé une fois, jamais repris.
  pause_chance_used_at timestamptz,

  -- ── L'OCTROI DE TOUR, motif exact des quatre frères ──
  -- 48 hexadécimaux = 24 octets tirés par `gen_random_bytes` ; `unique` parce
  -- que c'est un jeton de rejeu, et qu'un doublon en ferait deux.
  pause_spin_grant_token text unique
    check (pause_spin_grant_token is null
           or pause_spin_grant_token ~ '^[0-9a-f]{48}$'),
  pause_spin_consumed_at timestamptz,
  pause_resulting_spin_id uuid references public.spins(id) on delete set null,

  created_at timestamptz not null default pg_catalog.now(),

  -- EXACTEMENT UNE SOURCE. `num_nonnulls(…) = 1` et non « au moins une » : une
  -- session qui pointerait à la fois une entrée en file et une réservation
  -- n'aurait aucune configuration parente déterminée, et les deux RPC auraient
  -- dû arbitrer en silence entre deux quiz.
  constraint reservation_wait_sessions_source_check
    check (pg_catalog.num_nonnulls(queue_entry_id, reservation_id) = 1),

  -- ÉQUIVALENCE, pas implication (motif `reservations_checkin_state`) : le jeton
  -- d'octroi et la marque d'usage naissent du MÊME geste. Une implication simple
  -- aurait laissé passer l'autre moitié du problème — une Pause Chance
  -- consommée sans jeton, donc un tour dû que rien ne permet de réclamer.
  constraint reservation_wait_sessions_pause_state
    check ((pause_spin_grant_token is not null) = (pause_chance_used_at is not null)),

  -- Miroir de `quiz_rewards_spin_check` : le tour tiré et sa date vont ensemble,
  -- et aucun tour ne se tire sans un jeton pour l'avoir demandé.
  constraint reservation_wait_sessions_spin_state
    check ((pause_spin_consumed_at is null) = (pause_resulting_spin_id is null)
           and (pause_spin_consumed_at is null
                or pause_spin_grant_token is not null)),

  -- L'EMPREINTE, OU LE MARQUEUR DE PURGE, ET RIEN D'AUTRE (motif du socle) : le
  -- marqueur est hors de l'espace des empreintes et adossé à l'identifiant de SA
  -- ligne, donc unique par construction et impossible à recalculer.
  constraint reservation_wait_sessions_player_key_shape
    check (player_key_hash ~ '^[0-9a-f]{64}$'
           or player_key_hash = 'purge:' || id::text),

  foreign key (queue_entry_id, organization_id)
    references public.reservation_queue_entries(id, organization_id)
    on delete cascade,
  foreign key (reservation_id, organization_id)
    references public.reservations(id, organization_id)
    on delete cascade
);

comment on table public.reservation_wait_sessions is
  'Session d''ATTENTE ACTIVE (RES-4) : l''objet qui SÉPARE la file/réservation de '
  'l''animation. Elle POINTE vers une source vivante — exactement une entrée de '
  'file OU une réservation — sans jamais en faire partie, et aucune RPC '
  'd''animation n''écrit dans la source. Ne porte NI rang, NI priorité, NI '
  'capacité, NI délai : ces nombres n''ont qu''un seul chemin, les RPC de RES-1 '
  'et RES-3. Écriture exclusivement par les RPC service_role, AUCUNE policy — '
  'régime de reservation_invitations et reservation_queue_entries.';
comment on column public.reservation_wait_sessions.pause_chance_used_at is
  'LE VERROU DE LA PAUSE CHANCE — critère dur RES-4 « bornée par session ». Posé '
  'par un update CONDITIONNEL (`where … is null`), donc un seul appel gagne sous '
  'concurrence. Comme la session est unique PAR SOURCE, la borne réelle est « une '
  'Pause Chance par entrée en file », définitivement.';
comment on column public.reservation_wait_sessions.pause_spin_grant_token is
  'Jeton d''octroi de tour, 48 hexadécimaux, motif exact des quatre tours offerts '
  'déjà livrés (loyalty_rewards.grant_token, calendar_openings / quiz_rewards / '
  'referral_rewards.spin_grant_token). Consommé UNE FOIS par '
  'consume_reserver_wait_spin_grant, qui tire sur la campagne configurée avec '
  'la MÊME économie que le tour public.';

-- UNE SESSION PAR SOURCE — la borne qui rend « une Pause Chance par session »
-- équivalent à « une Pause Chance par attente ». Deux index PARTIELS et non un
-- seul : les deux colonnes sont nulles à tour de rôle, et un index unique
-- ordinaire sur le couple aurait considéré tous les `(null, X)` comme distincts.
-- Ils servent aussi d'index de tête aux deux FK composites, donc de chemin à
-- leur cascade.
create unique index if not exists reservation_wait_sessions_queue_entry_idx
  on public.reservation_wait_sessions (queue_entry_id)
  where queue_entry_id is not null;
create unique index if not exists reservation_wait_sessions_reservation_idx
  on public.reservation_wait_sessions (reservation_id)
  where reservation_id is not null;

-- Index de tête de la FK d'organisation — donc le chemin de la cascade quand une
-- organisation part — et celui de la purge, qui balaie par organisation.
create index if not exists reservation_wait_sessions_org_player_idx
  on public.reservation_wait_sessions (organization_id, player_key_hash);


-- ────────────────────────────────────────────────────────────
-- 3. RLS et grants — AUCUNE POLICY, et c'est délibéré
--
-- Régime de `reservation_invitations` et `reservation_queue_entries` en
-- écriture, poussé jusqu'au bout : RLS active, ZÉRO policy, aucun grant. Cette
-- table n'a d'écran NULLE PART — le joueur passe par les trois RPC ci-dessous,
-- et le commerçant n'a rien à y lire : son écran d'accueil parle de rangs, pas
-- de qui a joué en attendant. Lui ouvrir une lecture aurait fait de l'animation
-- une information sur les personnes présentes dans son magasin, ce que RES-4
-- n'a jamais promis.
--
-- LE `revoke` N'EST PAS DÉCORATIF (leçon SEC-4, wagon 7) : RLS active sans
-- policy ne laisse rien sortir AUJOURD'HUI, mais les privilèges par défaut de
-- Supabase servent `references`, `trigger` et `truncate` à `anon` et
-- `authenticated` sur toute nouvelle table de `public`. On repart de zéro.
-- ────────────────────────────────────────────────────────────

alter table public.reservation_wait_sessions enable row level security;

revoke all on table public.reservation_wait_sessions
  from public, anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 4. `wait_session_open` — ouvrir l'animation, sans toucher à l'attente
--
-- ── LA SEULE LECTURE DE LA FILE DE TOUT CE FICHIER ──
--
-- Elle lit, sur la source, DEUX choses et pas une de plus : à qui elle
-- appartient (`player_key_hash`) et si elle est VIVANTE (`status`). Elle ne lit
-- ni `created_at` — qui EST le rang — ni aucun compteur, et elle n'en rend
-- aucun. C'est ce qui rend le critère 2 du cahier vérifiable plutôt que promis :
-- même si cette fonction était détournée, elle n'aurait rien à révéler d'un
-- ordre de passage.
--
-- ── VIVANTE, ET CE QUE ÇA VEUT DIRE POUR CHAQUE FORME ──
--
--   · entrée de file — `waiting` ou `called`. `called` EST vivant : quelqu'un
--     qu'on vient d'appeler traverse encore le magasin, et lui refuser sa
--     session à cet instant précis ferait clignoter l'écran pour rien. La
--     FERMETURE du jeu à l'appel est un geste de SURFACE, nourri par
--     `queue_public_state.status`, pas un refus de la base.
--   · réservation — `confirmed`. NI `checked_in` (qui est arrivé n'attend plus)
--     NI `cancelled`.
--
-- ── IDEMPOTENTE, ET SOUS VERROU ──
--
-- Rouvrir rend LA MÊME session : recharger une page n'est pas une faute, et
-- c'est le même arbitrage que `queue_join`. Le verrou d'avis sérialise
-- « chercher, puis insérer » — sans lui, deux onglets ouverts en même temps
-- feraient lever l'index unique partiel, et un refus de base n'est pas une
-- réponse. La clé porte l'organisation ET la source, motif RES-3.
--
-- ── UN SEUL ÉTAT DE REFUS, ET IL EST MUET ──
--
-- `unknown` INDISTINCTEMENT pour : source inexistante, source d'une AUTRE
-- organisation, source d'un AUTRE joueur, source MORTE, organisation sans le
-- droit `vitrine`. Les distinguer donnerait à un appelant public un oracle sur
-- ce qui existe chez le commerce d'en face, et pire ici que partout ailleurs :
-- « cette entrée existe mais n'est pas la vôtre » est une information sur
-- quelqu'un d'autre qui se trouve dans le magasin.
--
-- ── LA CONFIGURATION N'EST RENDUE QUE SI ELLE EST JOUABLE ──
--
-- Un quiz `active`, une campagne `active` : sinon `null`, comme s'il n'y avait
-- pas d'animation. Proposer un bouton qui échouera est un défaut d'écran que la
-- base peut éviter d'un `and`. C'est l'habitude de `queue_join`, qui refuse
-- déjà sur une activité coupée. Ces deux lectures portent sur `quizzes` et
-- `campaigns` — jamais sur la file : le critère 2 est intact.
--
-- ── ELLE REND AUSSI LA CONFIGURATION DE RETRAIT DE LA CAMPAGNE ──
--
-- `collect_email`, `collect_phone`, `code_ttl_seconds` — les trois champs dont
-- `ClaimForm` a besoin pour demander ce qu'il faut AVANT d'afficher le code.
-- Sans eux l'écran d'attente devait inventer une configuration, et il inventait
-- « ne rien demander » : or `campaigns.collect_email` vaut `true` PAR DÉFAUT
-- (00004), donc le retrait automatique partait sans adresse, le serveur le
-- refusait — et le lot était déjà tiré, le stock déjà décompté. Un tour offert
-- brûlé sans code, ce qui est la pire issue possible pour ce parcours.
--
-- Ils voyagent avec la campagne et SEULEMENT avec elle : `pause_campaign_id`
-- nul (aucune campagne, ou campagne fermée) les met tous les trois à `null` —
-- une configuration de retrait sans lot à retirer n'a aucun sens, et la rendre
-- quand même aurait laissé un écran croire qu'il y a quelque chose à réclamer.
-- Ce sont trois réglages d'affichage du commerçant, pas des données de tiers :
-- ils ne disent rien de la file, rien de qui attend.
-- ────────────────────────────────────────────────────────────

create or replace function public.wait_session_open(
  p_organization_id uuid,
  p_player_key_hash text,
  p_queue_entry_id uuid default null,
  p_reservation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text;
  v_owner text;
  v_alive boolean;
  v_quiz_id uuid;
  v_campaign_id uuid;
  v_activity_id uuid;
  v_collect_email boolean;
  v_collect_phone boolean;
  v_code_ttl integer;
  v_session public.reservation_wait_sessions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Organisation ABSENTE = bogue de l'appelant, pas un refus métier : on le dit
  -- fort (motif `reserve_slot` / `queue_join`). Organisation PRÉSENTE MAIS
  -- AUTRE = refus métier muet, traité avec les autres.
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  -- EXACTEMENT UNE SOURCE, contrôlée AVANT le verrou : la contrainte de table
  -- dirait la même chose, mais elle la dirait par une erreur illisible et
  -- seulement au moment de l'insertion.
  if pg_catalog.num_nonnulls(p_queue_entry_id, p_reservation_id) <> 1 then
    raise exception 'exactly one wait source required' using errcode = '22023';
  end if;

  v_source := case when p_queue_entry_id is not null
                   then 'queue_entry' else 'reservation' end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_wait_session:' || p_organization_id::text || ':'
        || coalesce(p_queue_entry_id, p_reservation_id)::text,
      0)
  );

  -- ── LA LECTURE DE VIVACITÉ, ET RIEN D'AUTRE ──
  -- Deux colonnes par branche : à qui, et vivant ou non. La configuration
  -- d'animation vient du PARENT (file ou activité), lu dans la même requête.
  if v_source = 'queue_entry' then
    select e.player_key_hash,
           e.status in ('waiting', 'called'),
           q.wait_quiz_id, q.wait_pause_campaign_id, q.activity_id
      into v_owner, v_alive, v_quiz_id, v_campaign_id, v_activity_id
      from public.reservation_queue_entries e
      join public.reservation_queues q
        on q.id = e.queue_id and q.organization_id = e.organization_id
     where e.id = p_queue_entry_id
       and e.organization_id = p_organization_id;
  else
    select r.player_key_hash,
           r.status = 'confirmed',
           a.wait_quiz_id, a.wait_pause_campaign_id, a.id
      into v_owner, v_alive, v_quiz_id, v_campaign_id, v_activity_id
      from public.reservations r
      join public.reservation_slots s
        on s.id = r.slot_id and s.organization_id = r.organization_id
      join public.reservation_activities a
        on a.id = s.activity_id and a.organization_id = s.organization_id
     where r.id = p_reservation_id
       and r.organization_id = p_organization_id;
  end if;

  -- QUATRE REFUS SOUS UN SEUL ÉTAT MUET (voir l'en-tête) : source inconnue ou
  -- d'une autre organisation, source d'un autre joueur, source morte,
  -- organisation sans le droit `vitrine`.
  --
  -- DÉFENSE EN PROFONDEUR sur le droit, motif `queue_join` : la surface le
  -- vérifiera pour rendre au commerçant un message utile ; ici il empêche qu'un
  -- abonnement fermé laisse une animation ouverte.
  if not found
     or v_owner is distinct from p_player_key_hash
     or not coalesce(v_alive, false)
     or not public.org_has_module_access(p_organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- L'ANIMATION N'EST PROPOSÉE QUE SI ELLE EST JOUABLE. Ces deux lectures
  -- portent sur `quizzes` et `campaigns`, jamais sur la file.
  if v_quiz_id is not null and not exists (
    select 1 from public.quizzes q
     where q.id = v_quiz_id
       and q.organization_id = p_organization_id
       and q.status = 'active'
  ) then
    v_quiz_id := null;
  end if;
  --
  -- La campagne est lue UNE fois, et cette lecture fait les deux choses à la
  -- fois : elle décide si l'animation est jouable (`status = 'active'`) ET elle
  -- rapporte la configuration de retrait que `ClaimForm` devra appliquer. Un
  -- `exists` suivi d'un second `select` aurait interrogé deux fois la même
  -- ligne pour la même décision.
  if v_campaign_id is not null then
    select c.collect_email, c.collect_phone, c.code_ttl_seconds
      into v_collect_email, v_collect_phone, v_code_ttl
      from public.campaigns c
     where c.id = v_campaign_id
       and c.organization_id = p_organization_id
       and c.status = 'active';
    if not found then
      -- Campagne fermée, archivée ou d'un autre locataire : NI campagne, NI
      -- configuration. Les trois champs repartent à `null` explicitement — un
      -- `select … into` qui ne trouve rien laisse les variables intactes, et
      -- elles le sont ici, mais l'écrire protège de la prochaine réécriture.
      v_campaign_id := null;
      v_collect_email := null;
      v_collect_phone := null;
      v_code_ttl := null;
    end if;
  end if;

  -- IDEMPOTENCE. Sous le verrou, donc deux ouvertures simultanées de la MÊME
  -- source n'insèrent pas deux lignes : la seconde attend et voit la première.
  select s.* into v_session
    from public.reservation_wait_sessions s
   where (v_source = 'queue_entry' and s.queue_entry_id = p_queue_entry_id)
      or (v_source = 'reservation' and s.reservation_id = p_reservation_id);

  if not found then
    insert into public.reservation_wait_sessions
      (organization_id, queue_entry_id, reservation_id, player_key_hash)
    values
      (p_organization_id, p_queue_entry_id, p_reservation_id, p_player_key_hash)
    returning * into v_session;
  end if;

  -- NI RANG, NI COMPTEUR D'ATTENTE, NI ÉCHÉANCE. Voir le critère 2 : les rendre
  -- ici aurait fait de la session une SECONDE source de vérité sur la file.
  -- `activity_id` n'est qu'une ADRESSE — de quoi construire le lien « voir
  -- l'activité », qui est tout ce que la troisième animation demande.
  return pg_catalog.jsonb_build_object(
    'state', 'open',
    'session_id', v_session.id,
    'source', v_source,
    'quiz_id', v_quiz_id,
    'pause_campaign_id', v_campaign_id,
    -- La configuration de RETRAIT de la campagne, indissociable d'elle : nulle
    -- partout où `pause_campaign_id` l'est. Voir l'en-tête de section.
    'pause_collect_email', v_collect_email,
    'pause_collect_phone', v_collect_phone,
    'pause_code_ttl_seconds', v_code_ttl,
    'activity_id', v_activity_id,
    'pause_chance_used', v_session.pause_chance_used_at is not null
  );
end;
$$;

comment on function public.wait_session_open(uuid, text, uuid, uuid) is
  'Ouvre — ou retrouve — la session d''ATTENTE ACTIVE d''un joueur sur une source '
  'vivante (RES-4). Idempotente : rouvrir rend LA MÊME session, jamais une '
  'seconde. La source est POLYMORPHE STRICTE — exactement une entrée de file OU '
  'une réservation. Ne lit de la file/réservation QUE la propriété et la '
  'vivacité (`waiting`/`called` ; `confirmed`), n''y écrit RIEN, et ne rend NI '
  'rang, NI compteur d''attente, NI délai : critère dur RES-4 « le jeu ne peut ni '
  'lire ni modifier rang, priorité, capacité, accès, délai ou droit à une '
  'place ». Rend `unknown` INDISTINCTEMENT pour une source inconnue, celle d''une '
  'AUTRE organisation, celle d''un AUTRE joueur, une source morte et une '
  'organisation sans le droit `vitrine`. La configuration d''animation (quiz, '
  'campagne de Pause Chance) n''est rendue que si elle est `active`, et la '
  'campagne rend AVEC elle sa configuration de retrait — collect_email, '
  'collect_phone, code_ttl_seconds — sans quoi l''écran d''attente devrait '
  'l''inventer : il inventait « ne rien demander », le retrait automatique '
  'partait sans adresse alors que collect_email vaut `true` par défaut, et le '
  'tour offert était brûlé sans code.';

revoke all on function public.wait_session_open(uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.wait_session_open(uuid, text, uuid, uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 5. `wait_session_use_pause` — la Pause Chance, UNE FOIS
--
-- ── L'UPDATE CONDITIONNEL EST LE VERROU ──
--
-- `where … and pause_chance_used_at is null`. Postgres sérialise les écritures
-- sur une même ligne : de deux appels simultanés, le second attend le premier,
-- relit la ligne à jour et ne trouve plus son `is null`. Il n'y a donc rien à
-- verrouiller par avis — le verrou EST la ligne, et il est exact. Un
-- `select … for update` puis un `update` aurait dit la même chose en deux
-- gestes, avec un intervalle entre eux.
--
-- ── ELLE NE REVÉRIFIE PAS LA VIVACITÉ DE LA SOURCE, ET C'EST VOULU ──
--
-- Deux raisons, et la première est un critère du cahier. (a) « aucune animation
-- n'est nécessaire pour conserver sa place » a un symétrique honnête : perdre sa
-- place ne doit pas confisquer ce qu'on avait déjà commencé. Quelqu'un appelé au
-- comptoir à l'instant où il touche le bouton ne doit pas voir son geste
-- s'évaporer. (b) Relire la file ici aurait AJOUTÉ un accès aux tables d'attente
-- pour ne rien décider d'utile — le contraire de la séparation. La borne
-- économique ne tient pas à la vivacité : elle tient à ce qu'une session soit
-- unique par source et n'accorde qu'UNE pause.
--
-- ── MAIS « UNE PAR SESSION » NE SUFFISAIT PAS, ET C'ÉTAIT UNE FUITE ──
--
-- « Une entrée en file = une Pause Chance » se lisait comme une borne. C'en est
-- une pour l'ENTRÉE ; ce n'en est pas une pour la PERSONNE, parce que rien
-- n'empêche de sortir de la file et d'y revenir. Le cycle
-- entrer → jouer → sortir → revenir crée une entrée NEUVE, donc une session
-- NEUVE, donc une Pause Chance NEUVE — autant de fois qu'on le veut, sur le
-- stock du commerçant, en trente secondes de manipulation. La borne économique
-- de tout ce lot reposait sur une hypothèse fausse : que l'attente ne se
-- renouvelle pas.
--
-- D'où le SEAU DE 24 HEURES PAR PERSONNE ET PAR GUICHET, éprouvé ici : s'il
-- existe une AUTRE session du même `player_key_hash` sur la MÊME file (ou la
-- MÊME activité) dont la Pause Chance a été consommée il y a moins de 24 h,
-- l'octroi est refusé — `cooldown`.
--
--   · PAR PERSONNE, pas par entrée : la clé est l'empreinte du cookie, la même
--     qui prouve déjà la propriété de la source. Aucune identité nouvelle n'est
--     demandée, aucune donnée nouvelle n'est retenue.
--   · PAR GUICHET, pas par organisation : deux files d'un même commerce sont
--     deux animations que le commerçant a dotées séparément, et le client qui
--     passe de l'une à l'autre attend réellement deux fois. Élargir à
--     l'organisation aurait puni un parcours honnête.
--   · `cooldown` EST UN ÉTAT PROPRE, distinct d'`already_used` : « vous avez
--     déjà joué ici récemment » n'est pas « vous avez déjà joué DANS CETTE
--     attente-ci ». Le second rend son jeton — c'est le sien, dans cette
--     session. Le premier ne peut pas : le jeton appartient à une AUTRE
--     session, et le faire voyager d'une session à l'autre serait exactement la
--     confusion que la borne cherche à empêcher. L'écran le dit avec ses mots,
--     et renvoie au portefeuille où le gain précédent attend.
--
-- CE QUE CE CONTRÔLE LIT, ET CE QU'IL NE LIT PAS. Il suit `queue_entry_id` vers
-- `queue_id`, et `reservation_id` vers `activity_id` : de QUEL guichet relève
-- cette attente. Pas un `status`, pas un `created_at` — qui EST le rang — pas un
-- compteur. Le critère 2 tient : voir l'en-tête du fichier, amendé pour nommer
-- cette troisième lecture plutôt que de la laisser démentir une promesse.
--
-- ── ELLE NE TIRE PAS LE TOUR ──
--
-- Elle rend un JETON et la campagne cible. Le tirage est le geste séparé de la
-- section 6, qui est le tour de roue offert ORDINAIRE de ce dépôt — même
-- algorithme, mêmes bornes, même journal. Séparer les deux permet à l'écran de
-- montrer la roue avant de connaître le résultat, comme partout ailleurs.
--
-- ── `already_used` REND LE JETON, ET CE N'EST PAS UNE FUITE ──
--
-- C'est le SIEN, et le rejeu est borné à l'étage d'en dessous :
-- `consume_reserver_wait_spin_grant` est idempotente et rend le tour déjà tiré.
-- Le taire aurait puni le rechargement de page d'un tour perdu.
-- ────────────────────────────────────────────────────────────

create or replace function public.wait_session_use_pause(
  p_organization_id uuid,
  p_session_id uuid,
  p_player_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.reservation_wait_sessions%rowtype;
  v_campaign_id uuid;
  -- LE GUICHET de cette attente : exactement l'un des deux est posé, comme la
  -- source de la session. C'est la portée du seau de 24 h.
  v_queue_id uuid;
  v_activity_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  -- La session, ET SEULEMENT SI ELLE EST CELLE DE L'APPELANT. `unknown`
  -- indistinctement, motif de la section 4.
  select s.* into v_session
    from public.reservation_wait_sessions s
   where s.id = p_session_id
     and s.organization_id = p_organization_id
     and s.player_key_hash = p_player_key_hash
     -- UNE LIGNE PURGÉE NE SE RELIT PAS. La garde de forme du paramètre
     -- l'interdit déjà ; ce filtre écrit l'intention et tiendrait encore si
     -- cette garde venait à s'assouplir (motif `queue_public_state`).
     and s.player_key_hash not like 'purge:%';
  -- DÉFENSE EN PROFONDEUR SUR LE DROIT `vitrine`, motif exact de
  -- `wait_session_open` : sans elle, un abonnement fermé laissait la Pause
  -- Chance CONTINUER de tirer sur le stock du commerçant, parce que la session
  -- avait été ouverte quand le droit était encore là. Le refus rejoint les
  -- autres sous le MÊME état muet — distinguer « votre commerce n'a plus le
  -- module » de « cette session n'existe pas » n'apprendrait rien d'utile au
  -- joueur et dirait à un curieux ce qu'un commerce voisin a souscrit.
  if not found
     or not public.org_has_module_access(p_organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- LA CAMPAGNE CIBLE VIENT DU PARENT, jamais de l'appelant : c'est ce qui rend
  -- « gains décidés côté serveur » vrai. Un `p_campaign_id` en paramètre aurait
  -- laissé le navigateur choisir sur quelle campagne il joue son tour offert.
  -- La lecture de la file se borne ici à SUIVRE le lien — aucun état, aucun
  -- rang. Elle rapporte deux choses et pas une de plus : la campagne à jouer, et
  -- l'IDENTITÉ DU GUICHET (`queue_id` / `activity_id`), qui est la portée du
  -- seau de 24 h ci-dessous. Les deux voyagent dans la MÊME requête : la
  -- deuxième colonne d'un `join` qu'on faisait déjà ne coûte rien, là où un
  -- second aller-retour aurait relu la même ligne.
  if v_session.queue_entry_id is not null then
    select q.wait_pause_campaign_id, q.id into v_campaign_id, v_queue_id
      from public.reservation_queue_entries e
      join public.reservation_queues q
        on q.id = e.queue_id and q.organization_id = e.organization_id
     where e.id = v_session.queue_entry_id
       and e.organization_id = p_organization_id;
  else
    select a.wait_pause_campaign_id, a.id into v_campaign_id, v_activity_id
      from public.reservations r
      join public.reservation_slots s2
        on s2.id = r.slot_id and s2.organization_id = r.organization_id
      join public.reservation_activities a
        on a.id = s2.activity_id and a.organization_id = s2.organization_id
     where r.id = v_session.reservation_id
       and r.organization_id = p_organization_id;
  end if;

  if v_campaign_id is null then
    -- ÉTAT PROPRE, PAS `unknown` : le commerçant n'a simplement pas configuré de
    -- Pause Chance. C'est actionnable côté écran (ne pas montrer le bouton),
    -- là où « inconnu » ne l'est pas.
    return pg_catalog.jsonb_build_object('state', 'unconfigured');
  end if;

  -- ── LE SEAU DE 24 HEURES, PAR PERSONNE ET PAR GUICHET ──
  --
  -- Voir l'en-tête de section : sans lui, sortir de la file et y revenir rendait
  -- une Pause Chance neuve, indéfiniment. `s2.id <> v_session.id` est ce qui
  -- distingue les deux bornes — la session COURANTE ne se refuse pas elle-même
  -- ici (son `update` conditionnel ci-dessous rend `already_used`, avec SON
  -- jeton), seule une AUTRE attente récente du même porteur au même guichet
  -- déclenche `cooldown`.
  --
  -- Le `>` sur un horodatage rend le contrôle insensible aux lignes purgées :
  -- une empreinte remplacée par `purge:…` ne peut plus égaler une empreinte de
  -- 64 hexadécimaux, donc elle ne peut ni bloquer ni être bloquée.
  if exists (
    select 1
      from public.reservation_wait_sessions s2
     where s2.organization_id = p_organization_id
       and s2.player_key_hash = p_player_key_hash
       and s2.id <> v_session.id
       and s2.pause_chance_used_at > pg_catalog.now() - interval '24 hours'
       and (
         (v_queue_id is not null and exists (
            select 1
              from public.reservation_queue_entries e2
             where e2.id = s2.queue_entry_id
               and e2.organization_id = s2.organization_id
               and e2.queue_id = v_queue_id))
         or
         (v_activity_id is not null and exists (
            select 1
              from public.reservations r2
              join public.reservation_slots s3
                on s3.id = r2.slot_id
               and s3.organization_id = r2.organization_id
             where r2.id = s2.reservation_id
               and r2.organization_id = s2.organization_id
               and s3.activity_id = v_activity_id))
       )
  ) then
    return pg_catalog.jsonb_build_object('state', 'cooldown');
  end if;

  -- LE GESTE, EN UNE INSTRUCTION. Voir l'en-tête : le `where … is null` EST le
  -- verrou.
  update public.reservation_wait_sessions s
     set pause_chance_used_at = pg_catalog.now(),
         pause_spin_grant_token =
           pg_catalog.encode(extensions.gen_random_bytes(24), 'hex')
   where s.id = v_session.id
     and s.pause_chance_used_at is null
  returning s.* into v_session;

  if not found then
    -- Perdant de la course, ou simple rechargement de page : on relit et on rend
    -- SON jeton (voir l'en-tête — le rejeu est borné à l'étage d'en dessous).
    select s.* into v_session
      from public.reservation_wait_sessions s
     where s.id = p_session_id;
    return pg_catalog.jsonb_build_object(
      'state', 'already_used',
      'session_id', v_session.id,
      'campaign_id', v_campaign_id,
      'grant_token', v_session.pause_spin_grant_token,
      'spin_id', v_session.pause_resulting_spin_id
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'granted',
    'session_id', v_session.id,
    'campaign_id', v_campaign_id,
    'grant_token', v_session.pause_spin_grant_token
  );
end;
$$;

comment on function public.wait_session_use_pause(uuid, uuid, text) is
  'Consomme LA Pause Chance d''une session d''attente (RES-4) et rend un jeton '
  'd''octroi de tour + la campagne cible. BORNÉE PAR SESSION par un update '
  'CONDITIONNEL (`where pause_chance_used_at is null`) : le verrou est la ligne '
  'elle-même, donc un seul appel gagne sous concurrence, le second rend '
  '`already_used`. ET BORNÉE PAR PERSONNE ET PAR GUICHET : une AUTRE session du '
  'même player_key_hash sur la MÊME file (ou la MÊME activité) dont la Pause a '
  'été consommée il y a moins de 24 h rend `cooldown` — sans quoi le cycle '
  'entrer/jouer/sortir/revenir fabriquait une Pause Chance neuve à volonté sur '
  'le stock du commerçant, la borne « une par session » ne bornant que '
  'l''entrée en file, pas la personne. Exige aussi le droit `vitrine` (défense '
  'en profondeur, motif wait_session_open) : un abonnement fermé ne laisse pas '
  'une animation continuer de tirer. La campagne vient du PARENT (file ou '
  'activité), JAMAIS de '
  'l''appelant — c''est ce qui rend « gains décidés côté serveur » vrai. N''écrit '
  'RIEN dans la file ni dans la réservation, et ne revérifie pas leur vivacité : '
  'perdre sa place ne confisque pas ce qu''on avait commencé, et la borne tient à '
  'l''unicité de la session, pas à l''état de l''attente. Ne tire PAS le tour : '
  'consume_reserver_wait_spin_grant le fait, avec les bornes ordinaires.';

revoke all on function public.wait_session_use_pause(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.wait_session_use_pause(uuid, uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 6. `spins.source` — la septième valeur
--
-- Patron de 20260729120000 et 20260803120000, à l'identique : la contrainte est
-- retirée puis reposée avec la liste ENTIÈRE. Un tour de Pause Chance est un
-- tour comme les autres, et il doit se distinguer dans les statistiques du
-- commerçant comme `calendar` ou `quiz` s'y distinguent.
-- ────────────────────────────────────────────────────────────

alter table public.spins drop constraint if exists spins_source_check;
alter table public.spins
  add constraint spins_source_check
  check (source in ('direct', 'share', 'loyalty', 'calendar', 'referral',
                    'quiz', 'reserver_wait'));


-- ────────────────────────────────────────────────────────────
-- 7. `consume_reserver_wait_spin_grant` — le tour offert, ORDINAIRE
--
-- ── C'EST UNE COPIE, ET C'EST LE BUT ──
--
-- Miroir de `consume_referral_spin_grant` (20260809120000), qui est celui des
-- quatre frères dont la cible est une CAMPAGNE et non une roue : même sélection
-- de roue (miroir de `selectActiveWheel`), même BORNE 3 (statut et fenêtre de
-- campagne), même BORNE 2 (un lot à stock illimité n'est pas tirable par un tour
-- offert), même tirage pondéré atomique, même journal. Écrire ici une mécanique
-- différente aurait créé une cinquième économie à surveiller, alors que le
-- cadrage MVP dit exactement le contraire : RIEN DE NEUF.
--
-- ── OÙ LE GRANT EST CONSOMMÉ, ET DANS QUEL ORDRE ──
--
-- APRÈS le tirage, dans la MÊME transaction — ordre des quatre frères. Si aucun
-- lot n'est disponible (`no_prize`) ou si la campagne est fermée
-- (`unavailable`), le jeton reste INTACT : le joueur pourra revenir quand le
-- commerçant aura réapprovisionné. Un jeton brûlé sur une roue vide serait une
-- Pause Chance volée.
--
-- ── LE JETON SEUL NE SUFFIT PAS ──
--
-- Il doit être présenté AVEC l'empreinte du cookie du joueur (`for update` sur
-- la ligne : anti-rejeu). Défense en profondeur des quatre frères, reprise mot
-- pour mot.
-- ────────────────────────────────────────────────────────────

create or replace function public.consume_reserver_wait_spin_grant(
  p_session_id uuid,
  p_player_key_hash text,
  p_grant_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.reservation_wait_sessions%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_campaign_id uuid;
  v_wheel_id uuid;
  v_org_id uuid;
  v_camp_status text;
  v_camp_starts timestamptz;
  v_camp_ends timestamptz;
  v_timezone text;
  v_local timestamp;
  v_dow integer;
  v_hour integer;
  v_start integer;
  v_end integer;
  v_ref_day integer;
  v_in_window boolean;
  v_candidate record;
  v_total bigint;
  v_pick bigint;
  v_prize record;
  v_spin_id uuid;
  v_random bytea;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  -- Session résolue PAR LE JETON, et liée au joueur appelant. Verrou de ligne :
  -- anti-rejeu.
  select s.* into v_session
    from public.reservation_wait_sessions s
   where s.id = p_session_id
     and s.pause_spin_grant_token = pg_catalog.btrim(coalesce(p_grant_token, ''))
     and s.player_key_hash = p_player_key_hash
     and s.player_key_hash not like 'purge:%'
   for update of s;
  -- MÊME GARDE DE DROIT QU'AUX DEUX ÉTAGES DU DESSUS, et c'est ici qu'elle
  -- compte le plus : c'est cette fonction qui DÉCRÉMENTE le stock. Sans elle, un
  -- jeton obtenu du temps de l'abonnement continuait de tirer sur la campagne
  -- d'un commerce qui n'a plus le module — le seul endroit de ce lot où le
  -- défaut aurait un coût en lots réels. L'organisation vient de la SESSION,
  -- jamais d'un paramètre : cette RPC n'en prend pas, et c'est ce qui rend la
  -- garde inévitable. `unavailable`, indistinctement d'un jeton inventé.
  if not found
     or not public.org_has_module_access(v_session.organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  if v_session.pause_spin_consumed_at is not null then
    return pg_catalog.jsonb_build_object(
      'state', 'already_consumed', 'spin_id', v_session.pause_resulting_spin_id);
  end if;

  -- La campagne cible vient du PARENT de la session, comme dans
  -- `wait_session_use_pause` : le jeton ne transporte pas sa propre cible, et
  -- l'appelant n'en propose aucune.
  if v_session.queue_entry_id is not null then
    select q.wait_pause_campaign_id into v_campaign_id
      from public.reservation_queue_entries e
      join public.reservation_queues q
        on q.id = e.queue_id and q.organization_id = e.organization_id
     where e.id = v_session.queue_entry_id
       and e.organization_id = v_session.organization_id;
  else
    select a.wait_pause_campaign_id into v_campaign_id
      from public.reservations r
      join public.reservation_slots s2
        on s2.id = r.slot_id and s2.organization_id = r.organization_id
      join public.reservation_activities a
        on a.id = s2.activity_id and a.organization_id = s2.organization_id
     where r.id = v_session.reservation_id
       and r.organization_id = v_session.organization_id;
  end if;
  if v_campaign_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Campagne et fuseau, lus UNE fois : ils ne dépendent pas de la roue. La borne
  -- de locataire est explicite — la campagne DOIT être celle de la session.
  select c.organization_id, c.status, c.starts_at, c.ends_at, o.timezone
    into v_org_id, v_camp_status, v_camp_starts, v_camp_ends, v_timezone
    from public.campaigns c
    join public.organizations o on o.id = c.organization_id
   where c.id = v_campaign_id
     and c.organization_id = v_session.organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- BORNE 3 — statut et fenêtre de la campagne (miroir de `loadPlayContext`).
  -- Fermée : on sort AVANT toute écriture, le jeton reste intact (rejouable).
  if v_camp_status <> 'active'
     or (v_camp_starts is not null and v_camp_starts > v_now)
     or (v_camp_ends is not null and v_camp_ends < v_now) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Sélection de la roue : miroir de `selectActiveWheel`, repris de
  -- `consume_referral_spin_grant`. On parcourt les roues DANS L'ORDRE DE
  -- PRIORITÉ du produit et on retient la première dont le créneau correspond.
  v_local := v_now at time zone v_timezone;
  v_dow := extract(dow from v_local)::integer;
  v_hour := extract(hour from v_local)::integer;

  for v_candidate in
    select w.id, w.schedule_start_hour, w.schedule_end_hour, w.schedule_days
      from public.wheels w
     where w.campaign_id = v_campaign_id
       and w.organization_id = v_org_id
     order by w.position, w.created_at, w.id
  loop
    if v_candidate.schedule_start_hour is null
       and v_candidate.schedule_end_hour is null then
      v_in_window := pg_catalog.array_length(v_candidate.schedule_days, 1) is null
                     or v_dow = any(v_candidate.schedule_days);
    else
      v_start := coalesce(v_candidate.schedule_start_hour, 0);
      v_end := coalesce(v_candidate.schedule_end_hour, 24);
      if v_start <= v_end then
        v_in_window := (pg_catalog.array_length(v_candidate.schedule_days, 1) is null
                        or v_dow = any(v_candidate.schedule_days))
                       and v_hour >= v_start and v_hour < v_end;
      else
        v_ref_day := case when v_hour < v_end then (v_dow + 6) % 7 else v_dow end;
        v_in_window := (pg_catalog.array_length(v_candidate.schedule_days, 1) is null
                        or v_ref_day = any(v_candidate.schedule_days))
                       and (v_hour >= v_start or v_hour < v_end);
      end if;
    end if;

    if v_in_window then
      v_wheel_id := v_candidate.id;
      exit;
    end if;
  end loop;

  -- Aucune roue ouverte à cet instant : le jeton reste intact, le joueur pourra
  -- revenir.
  if v_wheel_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Tirage pondéré atomique (même algorithme que perform_atomic_spin, SANS
  -- fenêtre de jeu). BORNE 2 : `p.stock > 0` est NULL quand `stock is null`, donc
  -- un lot à stock ILLIMITÉ n'est PAS tirable par un tour offert. La roue
  -- publique accepte l'illimité parce qu'elle est bornée ailleurs (play_limit,
  -- dates, Turnstile) ; le tour offert n'a aucune de ces bornes et exige donc un
  -- stock RÉEL, dont le décrément compte ce qu'il peut coûter.
  loop
    select coalesce(sum(p.weight), 0)::bigint into v_total
      from public.prizes p
     where p.wheel_id = v_wheel_id and p.organization_id = v_org_id
       and p.is_active and p.weight > 0
       and (p.is_losing or p.stock > 0);
    if v_total <= 0 then
      -- Aucun lot disponible : le jeton reste NON consommé (rejouable quand le
      -- commerçant réapprovisionne).
      return pg_catalog.jsonb_build_object('state', 'no_prize');
    end if;

    v_random := extensions.gen_random_bytes(4);
    v_pick := mod(
      (pg_catalog.get_byte(v_random, 0)::bigint * 16777216
       + pg_catalog.get_byte(v_random, 1)::bigint * 65536
       + pg_catalog.get_byte(v_random, 2)::bigint * 256
       + pg_catalog.get_byte(v_random, 3)::bigint),
      v_total
    );
    select q.* into v_prize from (
      select p.*, sum(p.weight) over(order by p.position, p.created_at, p.id) as ceiling
        from public.prizes p
       where p.wheel_id = v_wheel_id and p.organization_id = v_org_id
         and p.is_active and p.weight > 0
         and (p.is_losing or p.stock > 0)
    ) q where q.ceiling > v_pick order by q.ceiling limit 1;

    -- Un lot perdant ne se décrémente pas (miroir exact des quatre frères).
    if v_prize.is_losing then exit; end if;
    update public.prizes set stock = stock - 1
      where id = v_prize.id and stock > 0;
    if found then exit; end if;
  end loop;

  insert into public.spins(
    organization_id, campaign_id, wheel_id, prize_id, is_losing,
    player_key, engagement_action, source, play_window_key
  ) values (
    v_org_id, v_campaign_id, v_wheel_id,
    case when v_prize.is_losing then null else v_prize.id end,
    v_prize.is_losing, p_player_key_hash, null, 'reserver_wait', null
  ) returning id into v_spin_id;

  -- Jeton consommé (une seule fois) → tour résultant journalisé.
  update public.reservation_wait_sessions
     set pause_spin_consumed_at = v_now, pause_resulting_spin_id = v_spin_id
   where id = v_session.id;

  return pg_catalog.jsonb_build_object(
    'state', 'spun',
    'spin_id', v_spin_id,
    'wheel_id', v_wheel_id,
    'campaign_id', v_campaign_id,
    'prize_id', case when v_prize.is_losing then null else v_prize.id end,
    'is_losing', v_prize.is_losing
  );
end;
$$;

comment on function public.consume_reserver_wait_spin_grant(uuid, text, text) is
  'Consomme le jeton d''octroi d''une Pause Chance et tire UN tour sur la campagne '
  'configurée (RES-4). CINQUIÈME exemplaire du tour de roue offert, miroir de '
  'consume_referral_spin_grant : même sélection de roue, même BORNE 3 (statut et '
  'fenêtre de campagne), même BORNE 2 (un lot à stock ILLIMITÉ n''est pas '
  'tirable), même tirage pondéré atomique. Le jeton n''est consommé qu''APRÈS un '
  'tirage réussi : `no_prize` et `unavailable` le laissent intact. Le jeton seul '
  'ne suffit pas — l''empreinte du joueur est exigée avec lui, et l''organisation '
  'de la session doit TOUJOURS détenir le droit `vitrine` : c''est ici que le '
  'stock se décrémente, donc ici qu''un abonnement fermé coûterait des lots '
  'réels. Le gain est un '
  '`spins` ORDINAIRE (`source = ''reserver_wait''`), donc un code remis EN CAISSE '
  'comme n''importe quel gain : critère dur RES-4 « toute récompense liée à '
  'l''attente n''est remise qu''après check-in ou hors du flux de file », tenu par '
  'construction.';

revoke all on function public.consume_reserver_wait_spin_grant(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_reserver_wait_spin_grant(uuid, text, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 8. La purge — geste (g)
--
-- Une session d'attente porte une empreinte de cookie : c'est une donnée
-- personnelle, et elle a la même échéance que celle des quatre gestes qui
-- précèdent. La LIGNE reste, motif (c) à (f) : « ouverture et complétion des
-- animations d'attente » est une mesure produit du cahier, et elle appartient au
-- commerçant — pas la personne qui a joué.
--
-- LE JETON D'OCTROI PART AVEC L'EMPREINTE, et il le doit : il ne vaut QUE
-- présenté avec elle (section 7), donc le garder après l'avoir rendue
-- inutilisable serait conserver un secret qui n'ouvre plus rien. Mais
-- `…_pause_state` est une ÉQUIVALENCE — jeton présent si et seulement si pause
-- utilisée — donc l'effacer seul serait refusé par la base. Il reste : ce qui
-- devient inatteignable, c'est l'empreinte qu'il faut lui adjoindre, et c'est
-- suffisant. Aucune donnée personnelle ne subsiste dans 48 hexadécimaux tirés au
-- hasard.
--
-- LE FILTRE PORTE SUR `created_at`, sans distinction d'état, et le garde final
-- rend le passage idempotent — motif exact de (d), (e) et (f).
-- ────────────────────────────────────────────────────────────

create or replace function public.purge_expired_personal_data()
returns table(organizations_processed bigint, participations_deleted bigint, subscribers_deleted bigint)
language plpgsql security definer set search_path = '' as $$
declare r record; p_count bigint := 0; s_count bigint := 0; n bigint := 0; c bigint;
begin
  perform pg_catalog.set_config('lastchance.purge_maintenance', 'on', true);
  for r in select id, data_retention_months from public.organizations
           where data_retention_months is not null loop
    n := n + 1;
    delete from public.participations
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months);
    get diagnostics c = row_count; p_count := p_count + c;
    delete from public.newsletter_subscribers
      where organization_id = r.id and unsubscribed_at is not null
        and unsubscribed_at < now() - make_interval(months => r.data_retention_months);
    get diagnostics c = row_count; s_count := s_count + c;
    delete from public.email_log
      where organization_id = r.id
        and sent_at < now() - make_interval(months => r.data_retention_months);

    -- (a) Le journal SMS : la ligne reste, la personne s'efface.
    update public.sms_log
       set recipient = '000000',
           last_error = null,
           updated_at = pg_catalog.clock_timestamp()
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and (recipient <> '000000' or last_error is not null);

    -- (b1) Consentement jamais retiré et périmé : supprimé.
    delete from public.sms_consents
      where organization_id = r.id
        and revoked_at is null
        and consented_at < now() - make_interval(months => r.data_retention_months);

    -- (b2) Consentement RETIRÉ : conservé — c'est la preuve d'opposition — et
    -- réduit à ce qui permet d'honorer cette opposition.
    update public.sms_consents
       set phone = phone_key,
           consent_source = null,
           revoked_reason = null
      where organization_id = r.id
        and revoked_at is not null
        and revoked_at < now() - make_interval(months => r.data_retention_months)
        and phone_key ~ '^\+?[0-9 .()\-]{6,20}$'
        and (phone <> phone_key or consent_source is not null
             or revoked_reason is not null);

    -- (c) Les PARTIES : la ligne reste, le LIEN entre les parties d'une même
    -- personne meurt.
    update public.spins
       set player_key = 'purge:' || id
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and player_key not like 'purge:%';

    -- (d) Les RÉSERVATIONS (20261002120000) : la ligne reste — remplissage et
    -- arrivées appartiennent au commerçant — l'adresse, son consentement et le
    -- lien à l'appareil s'effacent.
    update public.reservations
       set email = null,
           consent_transactional_at = null,
           player_key_hash = 'purge:' || id::text
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and (email is not null
             or consent_transactional_at is not null
             or player_key_hash not like 'purge:%');

    -- (e) La LISTE PRIORITAIRE (20261004120000) : même geste, même raison. Le
    -- rang tenu et l'issue de l'offre restent — ils racontent le remplissage,
    -- pas la personne — l'adresse, son consentement et le lien à l'appareil
    -- s'effacent d'un seul geste (l'équivalence email/consentement de la table
    -- refuserait d'ailleurs de n'en effacer qu'un). Le garde `not like` rend le
    -- passage idempotent.
    update public.reservation_waitlist_entries
       set email = null,
           consent_transactional_at = null,
           player_key_hash = 'purge:' || id::text
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and (email is not null
             or consent_transactional_at is not null
             or player_key_hash not like 'purge:%');

    -- (f) La FILE SEREINE (20261005120000) : même geste, augmenté du PRÉNOM —
    -- un nom de personne est la donnée la plus directement identifiante de
    -- cette table, et il part avec les trois autres. La ligne reste : combien
    -- de gens ont attendu, combien sont partis, combien ne se sont pas
    -- présentés, c'est la seule mesure que RES-3 promet au commerçant.
    --
    -- ET L'ENTRÉE ENCORE VIVANTE EST FERMÉE — `left`, l'issue qui n'affirme
    -- rien sur la personne et la seule qui n'exige pas d'appel préalable. Sans
    -- ce geste, une entrée `waiting` ou `called` purgée occupait une ligne du
    -- plafond POUR TOUJOURS : son empreinte n'est plus une empreinte, donc
    -- `queue_leave` ne l'atteint plus, et rien d'autre ne la clôt. Voir
    -- l'en-tête de section pour le choix de l'issue et celui de la date.
    --
    -- Les deux `case` lisent l'état AVANT mise à jour : dans un `set`, le côté
    -- droit voit toujours la ligne d'origine.
    update public.reservation_queue_entries
       set display_name = null,
           email = null,
           consent_transactional_at = null,
           player_key_hash = 'purge:' || id::text,
           status = case when status in ('waiting', 'called')
                         then 'left' else status end,
           -- DERNIER INSTANT CONNU, jamais `now()` : sinon les compteurs du
           -- jour de `queue_staff_state` afficheraient au commerçant une volée
           -- d'abandons vieux de plusieurs mois, le matin du passage du cron.
           resolved_at = case when status in ('waiting', 'called')
                              then coalesce(called_at, created_at)
                              else resolved_at end
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and (display_name is not null
             or email is not null
             or consent_transactional_at is not null
             or player_key_hash not like 'purge:%'
             -- Sans ce disjoint, une ligne déjà purgée mais restée vivante ne
             -- serait jamais fermée : l'idempotence la sauterait.
             or status in ('waiting', 'called'));

    -- (g) LES SESSIONS D'ATTENTE ACTIVE (20261006120000) : la ligne reste — la
    -- mesure « ouverture et complétion des animations d'attente » appartient au
    -- commerçant — le lien à l'appareil s'efface. Le jeton d'octroi reste, et il
    -- est inoffensif : il ne vaut QUE présenté avec l'empreinte qui vient d'être
    -- neutralisée. L'effacer seul serait de toute façon refusé par
    -- `…_pause_state`, qui est une équivalence.
    update public.reservation_wait_sessions
       set player_key_hash = 'purge:' || id::text
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and player_key_hash not like 'purge:%';
  end loop;
  delete from public.webhook_deliveries
    where (delivered_at is not null or attempts >= 12)
      and created_at < pg_catalog.now() - interval '30 days';
  delete from public.admin_sessions
    where expires_at < pg_catalog.now() - interval '30 days';
  -- L'événement d'audit reste probant, mais l'email et l'IP cessent
  -- d'identifier une personne après 24 mois.
  perform pg_catalog.set_config('lastchance.audit_maintenance', 'on', true);
  update public.admin_audit_logs set actor_email = '[anonymisé]', ip = null,
    metadata = metadata - 'email' - 'target_email'
    where created_at < pg_catalog.now() - interval '24 months'
      and (actor_email <> '[anonymisé]' or ip is not null);
  perform pg_catalog.set_config('lastchance.audit_maintenance', 'off', true);
  delete from public.admin_notes where created_at < pg_catalog.now() - interval '24 months';
  return query select n, p_count, s_count;
end
$$;
