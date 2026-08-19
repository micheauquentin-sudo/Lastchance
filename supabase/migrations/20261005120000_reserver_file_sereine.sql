-- ============================================================
-- « RÉSERVER » — LA FILE SEREINE (RES-3, lot L6)
--
-- La file d'ACCUEIL EN CONTINU, et il faut la distinguer tout de suite de la
-- liste prioritaire de RES-2 (20261004120000) : celle-là attend UN CRÉNEAU
-- PRÉCIS et n'existe que parce qu'il est complet ; celle-ci n'a AUCUN créneau —
-- on pousse la porte, on scanne, on attend son tour. Deux objets, deux tables,
-- aucun code partagé : les fusionner aurait demandé qu'une même ligne signifie
-- tantôt « je veux la place de samedi 14 h » et tantôt « je suis dans le
-- magasin, maintenant ».
--
-- Ce fichier pose LE MODÈLE et les SEPT RPC serveur-autoritaires. Il n'expose
-- AUCUNE page, AUCUNE server action, AUCUNE notification : le câblage suit.
--
-- ── LES CINQ CRITÈRES DURS DE RES-3, ET OÙ ILS SONT TENUS ──
--
--   1. AUCUN ETA TANT QU'IL N'EST PAS FIABLE — donc AUCUN ETA ICI. Il n'existe
--      dans ce fichier ni colonne de durée, ni moyenne de service, ni clé
--      `eta_*` dans une réponse. Ce n'est pas un oubli à combler plus tard par
--      une soustraction côté écran : un délai annoncé est une PROMESSE, et il
--      n'y a aujourd'hui aucune mesure du temps de service — la première
--      version de ce module ne peut donc en produire aucune qui ne soit
--      inventée. Le jour où `resolved_at - called_at` aura assez d'historique
--      pour valoir médiane, ce sera une décision produit, écrite, pas un effet
--      de bord de ce fichier.
--   2. UNE IDENTITÉ, UNE ENTRÉE VIVANTE PAR FILE. Index unique PARTIEL sur
--      (`queue_id`, `player_key_hash`) restreint à `waiting`/`called`, et la
--      RPC rend le RANG existant plutôt qu'une erreur : rejoindre deux fois est
--      un rechargement de page, pas une faute.
--   3. LE RANG NE DÉPEND NI D'UN JEU, NI D'UN APPAREIL, NI DE L'HEURE DE
--      RAFRAÎCHISSEMENT. Il n'est PAS STOCKÉ : il se compte à la lecture, sous
--      l'ordre (`created_at`, `id`). Une colonne `position` aurait dû être
--      renumérotée à chaque départ, chaque appel et chaque absence — trois
--      occasions de dériver contre une seule source de vérité — et c'est
--      précisément « le rang dépend de qui a rafraîchi en dernier ».
--   4. L'APPEL STAFF PRIME SUR TOUT AUTRE ÉCRAN. La base le rend LISIBLE, elle
--      ne peut pas le rendre BRUYANT : `queue_public_state` sort `status =
--      'called'` et `called_at` sur le MÊME document que le rang, sans qu'aucun
--      second appel ne soit nécessaire — c'est ce qui permet à l'écran joueur
--      de basculer sans rien aller chercher ailleurs. Le cri lui-même est du
--      ressort de la surface (L7).
--   5. ABANDONS ET ABSENCES MESURÉS, SANS PÉNALITÉ AUTOMATIQUE. `left` et
--      `no_show` sont deux issues DISTINCTES et comptées (`queue_staff_state`),
--      et RIEN dans ce fichier n'en tire de conséquence : aucun blocage, aucun
--      délai de carence, aucune expiration automatique d'une attente. C'est
--      aussi la raison pour laquelle CE LOT N'A PAS DE BALAYAGE pg_cron, à la
--      différence de RES-2 : faire expirer une entrée au bout de N minutes
--      serait exactement la pénalité automatique que le cahier écarte.
--
-- ── CE QUE CE FICHIER NE FAIT PAS, VOLONTAIREMENT ──
--
--   * AUCUN LIEN AVEC RES-4 (mode attente active). Le jeu ne doit pouvoir ni
--     lire ni modifier le rang : la garantie la plus solide, à ce stade, est
--     qu'aucune des sept RPC ci-dessous ne connaît l'existence d'une animation,
--     et qu'aucune n'accepte de paramètre qui vienne d'un jeu.
--   * AUCUNE NOTIFICATION. L'email et son consentement sont POSÉS (motif
--     `reservations`), pour que l'envoi de L7/L8 n'ait pas à migrer une table
--     de production ; rien ne les lit encore.
--   * AUCUNE SUPPRESSION. Ni `grant delete`, ni RPC de suppression : la cascade
--     d'une file emporterait les entrées du jour, donc les compteurs de servis
--     et d'absents. `status = 'closed'` ferme sans effacer, exactement comme
--     `active = false` sur une activité.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Les files
--
-- ── L'ACTIVITÉ EST OPTIONNELLE, ET C'EST LE CŒUR DU MODÈLE ──
--
-- Une file « Comptoir » doit exister sans rien réserver : c'est le cas
-- DOMINANT du produit — la boulangerie du samedi matin, le stand de marché, le
-- bureau de retrait. Rendre `activity_id` obligatoire aurait forcé le
-- commerçant à inventer une activité fictive pour décrire l'endroit où l'on
-- fait la queue, et à la voir ensuite apparaître dans son agenda de
-- réservation, où elle n'a rien à faire.
--
-- Quand elle EST posée, elle est reliée par une FK COMPOSITE — donc jamais à
-- l'activité d'un autre locataire. `activity_id` reste une colonne NUE, sans
-- `references` d'une seule colonne : la composite implique l'existence, et une
-- simple en plus ferait rougir `fk_composites_couverture.test.sql`, dont c'est
-- le métier. La sémantique MATCH SIMPLE de Postgres fait le reste : une FK
-- composite dont une colonne est nulle est satisfaite d'office, donc
-- « optionnelle » ne demande aucune contorsion.
--
-- ── `name` EST TOUJOURS EXIGÉ ──
--
-- Y compris quand l'activité est posée. Le libellé est ce que le joueur lit sur
-- l'écran d'attente (« Retrait commandes », « Accueil »), et le déduire de
-- l'activité aurait rendu impossible d'avoir deux files sur la même activité —
-- une par caisse, ce qui est la première chose qu'un commerce à deux comptoirs
-- demande.
--
-- ── AUCUN `updated_at` ──
--
-- Les deux tables de configuration du socle en portent un, qu'AUCUN trigger ne
-- maintient et qu'AUCUN grant ne laisse écrire : c'est une date qui ment. Elle
-- n'est pas reproduite ici. Si le besoin naît, il naîtra avec son trigger.
-- ────────────────────────────────────────────────────────────

create table public.reservation_queues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- Colonne NUE, reliée par la SEULE composite ci-dessous. Nullable : voir
  -- l'en-tête de section.
  activity_id uuid,
  name text not null
    check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 80),
  -- open   — on accepte de nouvelles arrivées ;
  -- paused — on n'accepte plus PERSONNE, mais on SERT ceux qui sont déjà là.
  --          C'est la différence avec `closed`, et elle est réelle au comptoir :
  --          « je ferme la file, je finis les douze qui attendent ».
  -- closed — la file ne sert plus à rien ; elle reste pour son historique.
  status text not null default 'open'
    check (status in ('open', 'paused', 'closed')),
  -- LE PLAFOND D'ENTRÉES VIVANTES. Sans lui, la seule borne serait une ligne
  -- par cookie — c'est-à-dire aucune, un cookie se renouvelant à volonté — et
  -- chaque ligne porterait un prénom, une adresse et un consentement : du
  -- stockage de données personnelles non borné (leçon E-1a de la revue L5).
  -- 50 par défaut : au-delà, « chacun son tour » cesse d'être une promesse
  -- tenable dans une matinée. Borné à 200 en dur, parce qu'un commerçant qui
  -- écrirait 10 000 ne décrirait plus une file d'accueil.
  max_live_entries integer not null default 50
    check (max_live_entries between 1 and 200),
  created_at timestamptz not null default pg_catalog.now(),
  -- Un libellé = une file dans le comptoir du commerçant. Unicité PAR
  -- ORGANISATION et EXACTE, motif `reservation_activities_org_name_unique` :
  -- la base n'assimile pas deux libellés que le commerçant a écrits
  -- différemment.
  constraint reservation_queues_org_name_unique unique (organization_id, name),
  -- Cible de la FK composite de `reservation_queue_entries`.
  unique (id, organization_id),
  foreign key (activity_id, organization_id)
    references public.reservation_activities(id, organization_id) on delete cascade
);

comment on table public.reservation_queues is
  'File d''accueil EN CONTINU d''une organisation (RES-3). SANS créneau — à ne '
  'pas confondre avec reservation_waitlist_entries, qui attend une place sur un '
  'créneau précis. L''activité est OPTIONNELLE (une file « Comptoir » n''en a '
  'aucune) et reliée par FK composite quand elle est posée. STRICTEMENT '
  'org-scopée et réservée aux ÉDITEURS — aucune policy anon : le parcours joueur '
  'ne lit ces lignes QUE par une RPC service_role.';
comment on column public.reservation_queues.status is
  'open (on accepte) → paused (on n''accepte plus, on SERT ceux qui sont là : '
  'queue_call_next reste ouverte) → closed. Aucun de ces états ne touche une '
  'entrée existante.';
comment on column public.reservation_queues.max_live_entries is
  'Plafond d''entrées VIVANTES (`waiting` + `called`). Sans lui la seule borne '
  'serait une ligne par cookie, donc aucune, et chaque ligne porte un prénom, '
  'une adresse et un consentement.';

create index reservation_queues_org_created_idx
  on public.reservation_queues (organization_id, created_at desc);

-- Index de tête de la FK composite vers `reservation_activities` : sans lui, la
-- cascade de suppression d'une activité balaie la table entière. Partiel, parce
-- que la file « Comptoir » — le cas dominant — n'a pas d'activité et n'a donc
-- rien à faire dans cet index.
create index reservation_queues_activity_idx
  on public.reservation_queues (activity_id)
  where activity_id is not null;


-- ────────────────────────────────────────────────────────────
-- 2. Les entrées de file
--
-- ── LE RANG EST UN CALCUL, JAMAIS UNE COLONNE ──
--
-- `created_at` est LE RANG, et c'est pourquoi il vaut `clock_timestamp()` et
-- non `now()` — même arbitrage, et même cause découverte à la dure, que
-- `reservation_waitlist_entries` : `now()` rend l'instant de DÉBUT DE
-- TRANSACTION, identique pour deux entrées écrites dans la même transaction ;
-- leur ordre retombait alors sur un UUID tiré au hasard, et la tête de file se
-- décidait au tirage. Le test le montre en trois inscriptions.
--
-- ── LES CINQ ÉTATS, ET LES TROIS ISSUES ──
--
--   waiting  — il attend ; c'est le seul état qui porte un rang ;
--   called   — le staff l'a appelé ; l'écran doit le crier ;
--   served   — il est passé ;
--   left     — il est parti de lui-même (ABANDON, mesuré) ;
--   no_show  — appelé, il ne s'est pas présenté (ABSENCE, mesurée).
--
-- `served` et `no_show` SUPPOSENT un appel — c'est l'invariant « on ne résout
-- que depuis `called` », et il est porté par une contrainte, pas seulement par
-- la RPC. `left` n'en suppose aucun : on peut partir avant comme après avoir
-- été appelé, et les deux sont le même abandon.
--
-- ── POURQUOI AUCUN ÉTAT N'EST GELÉ PAR TRIGGER, CONTRAIREMENT À RES-2 ──
--
-- La liste prioritaire gèle ses états terminaux parce qu'une place y est TENUE
-- et qu'en sortir deux fois la donnerait deux fois. Ici, rien n'est tenu : une
-- entrée résolue ne bloque aucune ressource, et `queue_reopen_entry` doit
-- justement pouvoir revenir en arrière quand le staff s'est trompé de personne.
-- Un trigger de gel aurait interdit exactement le geste que RES-3 demande. Ce
-- qui reste garanti par la base, ce sont les COHÉRENCES d'état ci-dessous : on
-- ne peut pas être `served` sans avoir été appelé, ni `waiting` avec une issue.
-- ────────────────────────────────────────────────────────────

create table public.reservation_queue_entries (
  id uuid primary key default gen_random_uuid(),
  -- Colonne NUE : voir `reservation_queues.activity_id`.
  queue_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- Empreinte SHA-256 du cookie joueur, ou marqueur de purge : MÊME forme,
  -- MÊME raison et MÊME marqueur que `reservations.player_key_hash`.
  player_key_hash text not null,
  -- LE PRÉNOM COURT, ET IL N'EST JAMAIS EXIGÉ. Il n'existe que pour que le
  -- staff puisse appeler quelqu'un à voix haute autrement que par un numéro.
  -- `null` est un cas parfaitement normal, pas une donnée manquante : la file
  -- fonctionne entièrement sans lui, et c'est ce qui permet de la rejoindre
  -- sans rien donner de soi.
  display_name text
    check (display_name is null
           or pg_catalog.char_length(display_name) between 1 and 40),
  -- Borne de longueur AVANT la forme (motif socle) : `~*` sur une chaîne non
  -- bornée est un travail proportionnel à ce que l'appelant envoie.
  email text
    check (email is null
           or (pg_catalog.char_length(email) <= 254
               and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  consent_transactional_at timestamptz,
  status text not null default 'waiting'
    check (status in ('waiting', 'called', 'served', 'left', 'no_show')),
  -- C'EST LE RANG. Voir l'en-tête de section pour `clock_timestamp()`.
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  called_at timestamptz,
  resolved_at timestamptz,

  -- ── ÉTATS COHÉRENTS ──
  -- Quatre contraintes qui disent quatre choses différentes, plutôt qu'une
  -- grosse expression qui les dirait toutes mal.
  --
  -- (1) `waiting` est PROPRE : ni appel en cours, ni issue. C'est ce qui rend
  --     `queue_reopen_entry` honnête — revenir à `waiting` OBLIGE à effacer
  --     `called_at`, donc on ne peut pas laisser traîner l'horodatage d'un
  --     appel qui n'a plus lieu d'être.
  constraint reservation_queue_entries_waiting_state
    check (status <> 'waiting' or (called_at is null and resolved_at is null)),
  -- (2) `called` a son horodatage d'appel, et RIEN n'est encore tranché.
  constraint reservation_queue_entries_called_state
    check (status <> 'called' or (called_at is not null and resolved_at is null)),
  -- (3) ÉQUIVALENCE, pas implication : les trois issues ont leur horodatage, et
  --     personne d'autre ne l'a. Une implication simple aurait laissé passer
  --     l'autre moitié du problème — une entrée `waiting` portant une date de
  --     résolution, c'est-à-dire une sortie qu'aucun écran ne montre.
  constraint reservation_queue_entries_resolved_state
    check ((status in ('served', 'left', 'no_show')) = (resolved_at is not null)),
  -- (4) ON NE RÉSOUT QUE CE QUI A ÉTÉ APPELÉ. `served` et `no_show` exigent un
  --     appel ; `left` non — partir sans avoir été appelé est le cas le plus
  --     fréquent de l'abandon. C'est le critère RES-3 « le staff appelle, sert
  --     ou marque l'absence », tenu par la base et pas seulement par la RPC.
  constraint reservation_queue_entries_outcome_origin
    check (status not in ('served', 'no_show') or called_at is not null),
  -- Reprise VERBATIM de `reservations_consent_state`. Une adresse sans
  -- consentement est une donnée personnelle sans finalité ; un consentement
  -- sans adresse est une affirmation sur quelqu'un qu'on ne sait plus joindre.
  -- C'est aussi ce qui rend la purge honnête d'un seul geste.
  constraint reservation_queue_entries_consent_state
    check ((email is not null) = (consent_transactional_at is not null)),
  -- L'EMPREINTE, OU LE MARQUEUR DE PURGE, ET RIEN D'AUTRE. Le marqueur est hors
  -- de l'espace des empreintes (le deux-points n'est pas de l'hexadécimal) et
  -- adossé à l'identifiant de SA ligne : unique par construction, donc
  -- compatible d'office avec l'index unique partiel ci-dessous.
  constraint reservation_queue_entries_player_key_shape
    check (player_key_hash ~ '^[0-9a-f]{64}$'
           or player_key_hash = 'purge:' || id::text),
  foreign key (queue_id, organization_id)
    references public.reservation_queues(id, organization_id) on delete cascade
);

comment on table public.reservation_queue_entries is
  'Entrée d''une identité pseudonyme dans une file d''accueil (RES-3). Le RANG '
  'EST IMPLICITE — ordre de `created_at`, départagé par `id`, COMPTÉ À LA '
  'LECTURE — jamais une colonne à renuméroter : c''est ce qui le rend '
  'indépendant du rafraîchissement, par construction. Écriture exclusivement '
  'par les RPC service_role : aucun grant insert/update/delete à '
  '`authenticated`, parce que l''ordre de passage est serveur-autoritaire. Les '
  'colonnes `email` et `display_name` sont HORS du grant de colonnes du '
  'commerçant — la seconde ne sort que par queue_staff_state, qui choisit ce '
  'qu''elle expose.';
comment on column public.reservation_queue_entries.created_at is
  'C''EST LE RANG. `clock_timestamp()` et non `now()` : deux entrées écrites '
  'dans la même transaction partageraient l''instant de début de transaction, '
  'et leur ordre retomberait sur un UUID tiré au hasard.';
comment on column public.reservation_queue_entries.display_name is
  'Prénom court d''appel au comptoir. JAMAIS EXIGÉ : `null` est un cas normal, '
  'la file fonctionne entièrement sans lui. Tronqué à 40 caractères par '
  'queue_join, jamais refusé — un ornement d''écran ne fait pas échouer une '
  'entrée en file.';
comment on column public.reservation_queue_entries.status is
  'waiting → called → served | no_show ; waiting|called → left. `served` et '
  '`no_show` EXIGENT un appel (contrainte …_outcome_origin) ; `left` non. '
  'AUCUN état n''est gelé par trigger, contrairement à RES-2 : rien n''est tenu '
  'ici, et queue_reopen_entry doit pouvoir défaire un appel erroné.';

-- UNE IDENTITÉ N'A QU'UNE ENTRÉE VIVANTE PAR FILE — critère dur RES-3. Partiel,
-- sur les seuls états vivants : sans quoi partir puis revenir le lendemain
-- serait refusé par la base, alors que c'est le parcours le plus ordinaire qui
-- soit. Le marqueur de purge est unique par construction, donc une ligne purgée
-- n'entre jamais en collision.
create unique index reservation_queue_entries_live_idx
  on public.reservation_queue_entries (queue_id, player_key_hash)
  where status in ('waiting', 'called');

-- LE CHEMIN DU RANG, et il est emprunté deux fois par lecture (le rang du
-- joueur, puis celui de chaque ligne de l'écran staff). L'ordre des colonnes
-- est EXACTEMENT celui du `order by` des RPC.
create index reservation_queue_entries_next_idx
  on public.reservation_queue_entries (queue_id, created_at, id)
  where status = 'waiting';

-- Le chemin des COMPTEURS DU JOUR, et l'index de tête NON PARTIEL de la FK
-- composite vers `reservation_queues` : les deux index ci-dessus sont partiels,
-- donc aucun ne sert la cascade de suppression d'une file.
create index reservation_queue_entries_queue_resolved_idx
  on public.reservation_queue_entries (queue_id, resolved_at);

-- « Ma place dans les files de ce commerçant » : le chemin de lecture joueur,
-- borné à l'organisation comme celui des réservations.
create index reservation_queue_entries_org_player_idx
  on public.reservation_queue_entries (organization_id, player_key_hash);


-- ────────────────────────────────────────────────────────────
-- 3. RLS et grants
--
-- Motif du socle, à l'identique : ÉDITEURS pour la configuration (les files),
-- lecture MEMBRE pour les entrées — le caissier tient l'écran d'accueil, c'est
-- littéralement son poste. AUCUNE policy d'écriture sur les entrées : l'ordre
-- de passage décide de qui passe devant, et une écriture PostgREST le
-- contournerait aussi sûrement qu'elle contournerait la capacité d'un créneau.
-- ────────────────────────────────────────────────────────────

alter table public.reservation_queues enable row level security;
alter table public.reservation_queue_entries enable row level security;

-- Les privilèges par défaut de Supabase servent anon/authenticated sur toute
-- nouvelle table de `public` : on repart de zéro. anon n'est JAMAIS re-servi.
revoke all on table public.reservation_queues
  from public, anon, authenticated;
revoke all on table public.reservation_queue_entries
  from public, anon, authenticated;

create policy "reservation_queues: editors" on public.reservation_queues
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "reservation_queue_entries: members read"
  on public.reservation_queue_entries
  for select to authenticated
  using (public.is_org_member(organization_id));

-- AUCUN `grant delete` sur les files, et c'est le même arbitrage que sur les
-- activités et les créneaux : la cascade emporterait les entrées, donc les
-- compteurs de servis et d'absents du jour, sans audit et sans qu'aucun écran
-- n'ait compté ce qui allait disparaître. `status = 'closed'` ferme sans rien
-- effacer.
grant select on table public.reservation_queues to authenticated;
grant insert (organization_id, activity_id, name, status, max_live_entries)
  on public.reservation_queues to authenticated;
grant update (activity_id, name, status, max_live_entries)
  on public.reservation_queues to authenticated;

-- GRANT DE COLONNES, et NI `email` NI `display_name` n'y sont. L'adresse suit
-- l'arbitrage du socle — elle n'existe que pour un envoi serveur. Le PRÉNOM la
-- rejoint pour une raison propre à ce lot : il n'a de sens QUE sur l'écran
-- d'accueil, ordonné, en face du bon rang — c'est-à-dire dans
-- `queue_staff_state`, qui décide de ce qu'elle montre. Ouvert en PostgREST, il
-- aurait aussi permis de lister les prénoms de tous ceux qui sont passés,
-- ce qui n'est l'écran de personne.
-- Conséquence pour la couche suivante : un `select *` PostgREST sera REFUSÉ EN
-- ENTIER sur cette table (précédent `getUserAndOrg`), les colonnes doivent être
-- énumérées.
grant select (
  id, queue_id, organization_id, player_key_hash, consent_transactional_at,
  status, created_at, called_at, resolved_at
) on public.reservation_queue_entries to authenticated;


-- ────────────────────────────────────────────────────────────
-- 4. `queue_join` — entrer dans la file
--
-- ── LE VERROU, ET SA CLÉ ──
--
-- `'reservation_queue:' || organisation || ':' || file`. Ce qu'il sérialise
-- n'est pas la ligne de la file — personne ne la modifie — mais le couple
-- « compter, puis écrire », exactement comme `reserve_slot` sérialise
-- « compter, puis insérer ». La MÊME clé est prise par les cinq RPC qui
-- écrivent : deux clés divergentes ne se verrouilleraient pas mutuellement, et
-- `queue_call_next` cesserait d'être sérialisé avec `queue_join`.
--
-- LA CLÉ PORTE L'ORGANISATION, comme celle du socle et pour la même raison
-- d'hygiène : dans ce module, tout ce qui désigne un objet le fait sous son
-- locataire.
--
-- ── ORDRE DES REFUS, ET IL DIFFÈRE DE `waitlist_join` ──
--
-- L'IDEMPOTENCE EST ÉVALUÉE AVANT LES REFUS COMMERCIAUX, et non après. C'est
-- une différence assumée avec RES-2, où le créneau fermé rend `unavailable`
-- même à celui qui est déjà dans la liste. La raison est physique : quelqu'un
-- qui est DÉJÀ dans la file est DEBOUT DANS LE MAGASIN. Si le commerçant met la
-- file en pause pendant ce temps — ce qui est le geste normal de fin de service
-- — lui répondre « indisponible » lui ferait croire qu'il a perdu son rang
-- alors qu'il est le prochain. Il retrouve donc son rang, toujours.
--
-- Aucun oracle n'y est ouvert : pour franchir ce test il faut DÉJÀ détenir une
-- entrée vivante dans cette file, donc y avoir été admis. La réponse n'apprend
-- rien que l'appelant ne sache déjà.
-- ────────────────────────────────────────────────────────────

create or replace function public.queue_join(
  p_organization_id uuid,
  p_queue_id uuid,
  p_player_key_hash text,
  p_display_name text default null,
  p_email text default null,
  p_consent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.reservation_queues%rowtype;
  v_activity_active boolean;
  v_entry public.reservation_queue_entries%rowtype;
  v_name text;
  v_email text;
  v_live integer;
  v_position integer;
  v_waiting integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Organisation ABSENTE = bogue de l'appelant, pas un refus métier : on le dit
  -- fort (motif `reserve_slot`). Organisation PRÉSENTE MAIS AUTRE = refus métier
  -- muet, traité plus bas avec les autres.
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  -- LE PRÉNOM EST TRONQUÉ, JAMAIS REFUSÉ — et c'est le seul endroit de ce
  -- fichier où une entrée malformée n'entraîne pas un refus. Raison : c'est un
  -- ORNEMENT D'ÉCRAN. Refuser l'entrée en file d'une personne debout dans le
  -- magasin parce que son prénom fait 41 caractères serait faire payer à la
  -- file ce qui ne la regarde pas. Le second `btrim` traite le cas où la coupe
  -- tombe sur une espace.
  v_name := nullif(pg_catalog.btrim(coalesce(p_display_name, '')), '');
  if v_name is not null then
    v_name := nullif(pg_catalog.btrim(pg_catalog.substr(v_name, 1, 40)), '');
  end if;

  -- La forme de l'adresse est jugée AVANT le verrou : une chaîne malformée ne
  -- vaut pas qu'on sérialise la file derrière elle.
  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null
     and (pg_catalog.char_length(v_email) > 254
          or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  then
    return pg_catalog.jsonb_build_object('state', 'invalid_email');
  end if;

  -- LE VERROU D'ABORD, LA LECTURE ENSUITE — motif `reserve_slot` : tout ce qui
  -- décide (le plafond, le statut de la file) est lu dans le MÊME instantané
  -- que le comptage.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_queue:' || p_organization_id::text || ':' || p_queue_id::text,
      0)
  );

  select q.* into v_queue
    from public.reservation_queues q
   where q.id = p_queue_id
     and q.organization_id = p_organization_id;
  -- File inexistante ou file d'une AUTRE organisation : le même état muet. Les
  -- distinguer donnerait à un appelant public un oracle sur ce qui existe chez
  -- le commerce d'en face.
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- IDEMPOTENCE, ET ELLE PASSE AVANT (voir l'en-tête). Sous le verrou, donc
  -- deux appels simultanés de la MÊME identité n'insèrent pas deux lignes : le
  -- second attend et voit la première. L'index unique partiel refuserait de
  -- toute façon la seconde, mais un refus de base n'est pas une réponse.
  select e.* into v_entry
    from public.reservation_queue_entries e
   where e.queue_id = p_queue_id
     and e.player_key_hash = p_player_key_hash
     and e.status in ('waiting', 'called');
  if found then
    return pg_catalog.jsonb_build_object(
      'state', 'already_waiting',
      'entry_id', v_entry.id,
      'status', v_entry.status,
      -- MÊME FORMULE DE RANG que `queue_public_state` et `queue_staff_state`.
      -- Trois formules divergentes montreraient trois rangs différents de la
      -- même personne, sur trois écrans ouverts en même temps.
      'position', public.queue_entry_position(v_entry),
      'called_at', v_entry.called_at
    );
  end if;

  select a.active into v_activity_active
    from public.reservation_activities a
   where a.id = v_queue.activity_id
     and a.organization_id = v_queue.organization_id;

  -- TROIS REFUS SOUS UN SEUL ÉTAT : file non ouverte (`paused` comme
  -- `closed` — les deux refusent l'ENTRÉE, seul `queue_call_next` les
  -- distingue), activité liée coupée, organisation sans le droit `vitrine`.
  -- `v_activity_active` est NUL quand la file n'a pas d'activité : c'est le cas
  -- « Comptoir », parfaitement légitime, d'où le `coalesce(…, true)` — à
  -- l'inverse du socle, où l'absence d'activité serait une incohérence.
  if v_queue.status <> 'open'
     or not coalesce(v_activity_active, true)
     -- DÉFENSE EN PROFONDEUR : L7 vérifiera ce droit pour rendre au commerçant
     -- un message utile ; ici il empêche que la fermeture d'un abonnement laisse
     -- une file ouverte en écriture.
     or not public.org_has_module_access(v_queue.organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE PLAFOND. On compte le MÊME ensemble que l'index unique partiel —
  -- `waiting` ET `called` — parce qu'une personne appelée occupe toujours une
  -- ligne de la file et une place au comptoir.
  select pg_catalog.count(*)::integer into v_live
    from public.reservation_queue_entries e
   where e.queue_id = p_queue_id
     and e.status in ('waiting', 'called');

  if v_live >= v_queue.max_live_entries then
    -- ÉTAT PROPRE, PAS `unavailable`. Ce refus ne révèle rien qu'un visiteur ne
    -- voie déjà en regardant la file, et il doit être DISTINGUABLE côté écran :
    -- « la file est pleine, revenez dans un moment » est actionnable,
    -- « indisponible » ne l'est pas.
    return pg_catalog.jsonb_build_object(
      'state', 'queue_full',
      'capacity', v_queue.max_live_entries
    );
  end if;

  insert into public.reservation_queue_entries (
    queue_id, organization_id, player_key_hash, display_name,
    email, consent_transactional_at
  ) values (
    v_queue.id,
    v_queue.organization_id,
    p_player_key_hash,
    v_name,
    -- L'ADRESSE N'EST CONSERVÉE QUE SI ELLE EST CONSENTIE — geste et raison du
    -- socle : sans consentement rien ne sera envoyé, donc la donnée n'a aucune
    -- finalité, et `…_consent_state` refuserait la ligne qui la garderait seule.
    case when coalesce(p_consent, false) then v_email end,
    case when coalesce(p_consent, false) and v_email is not null
         then pg_catalog.now() end
  )
  returning * into v_entry;

  v_position := public.queue_entry_position(v_entry);

  select pg_catalog.count(*)::integer into v_waiting
    from public.reservation_queue_entries e
   where e.queue_id = p_queue_id
     and e.status = 'waiting';

  return pg_catalog.jsonb_build_object(
    'state', 'waiting',
    'entry_id', v_entry.id,
    'status', v_entry.status,
    'position', v_position,
    'waiting_count', v_waiting,
    'called_at', null
  );
end;
$$;

comment on function public.queue_join(uuid, uuid, text, text, text, boolean) is
  'Entre dans une file d''accueil EN CONTINU (RES-3). Idempotente : rejoindre '
  'deux fois rend `already_waiting` et LE MÊME RANG, jamais une seconde entrée '
  '(index unique partiel sur les états vivants). L''idempotence est évaluée '
  'AVANT les refus commerciaux — différence assumée avec waitlist_join : qui est '
  'déjà dans la file est debout dans le magasin, et une mise en pause ne doit '
  'pas lui faire croire qu''il a perdu son rang. Rend `unavailable` — '
  'indistinctement — pour une file inconnue, une file d''une AUTRE organisation, '
  'une file non ouverte, une activité liée coupée, et une organisation sans le '
  'droit `vitrine` ; `queue_full` au plafond d''entrées vivantes ; '
  '`invalid_email` sur une adresse malformée. Le prénom est TRONQUÉ à 40 '
  'caractères, jamais refusé. L''adresse n''est stockée QUE si `p_consent`.';

revoke all on function public.queue_join(uuid, uuid, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.queue_join(uuid, uuid, text, text, text, boolean)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 5. `queue_entry_position` — LA formule du rang, écrite UNE FOIS
--
-- Quatre appelants ont besoin du rang d'une entrée : `queue_join` (pour le
-- rendre au rechargement), `queue_public_state` (le rang du joueur),
-- `queue_staff_state` (le rang de chaque ligne de l'écran d'accueil) et
-- `queue_reopen_entry` (pour prouver que la remise en tête a bien eu lieu).
-- Recopier la formule quatre fois, c'est se donner quatre occasions de la voir
-- diverger — et le jour où elle diverge, deux écrans ouverts côte à côte
-- annoncent deux rangs différents de la même personne. Elle est donc écrite ici,
-- et nulle part ailleurs.
--
-- ── CE QU'ELLE COMPTE, ET CE QU'ELLE NE COMPTE PAS ──
--
-- Les seules entrées `waiting` STRICTEMENT AVANT celle-ci, plus elle-même. Les
-- entrées `called` ne comptent PAS : c'est ce qui fait que le rang DESCEND quand
-- le staff appelle quelqu'un, au lieu de rester bloqué à 3 pendant que trois
-- personnes passent au comptoir. Le cahier le demande mot pour mot — « count des
-- waiting devant moi + moi ».
--
-- Une entrée qui n'attend pas n'a PAS de rang : `null`, et non `0`. Zéro se
-- serait affiché comme un rang, et « vous êtes 0e » ne veut rien dire.
--
-- ── POURQUOI `stable`, ET POURQUOI AUCUN GRANT ──
--
-- `stable` : elle ne lit que la base et rend la même chose dans la même
-- instruction — le planificateur peut donc l'appeler une fois par ligne sans
-- redouter d'effet de bord. AUCUN grant, `service_role` COMPRIS : les privilèges
-- par défaut de Supabase servent `execute` à `service_role` sur toute fonction
-- neuve de `public`, et s'arrêter à `public, anon, authenticated` l'aurait
-- laissée ouverte à l'application. Ses appelants sont `security definer`, donc
-- s'exécutent sous le propriétaire, qui la détient par possession. Motif exact
-- de `reservation_offer_next` (leçon du wagon 7 : le contrôle interne TRACE,
-- c'est l'ACL qui INTERDIT).
-- ────────────────────────────────────────────────────────────

create or replace function public.queue_entry_position(
  p_entry public.reservation_queue_entries
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_entry.status <> 'waiting' then null
    else (
      select pg_catalog.count(*)::integer + 1
        from public.reservation_queue_entries w
       where w.queue_id = p_entry.queue_id
         and w.status = 'waiting'
         and (w.created_at, w.id) < (p_entry.created_at, p_entry.id)
    )
  end;
$$;

comment on function public.queue_entry_position(public.reservation_queue_entries) is
  'LE rang d''une entrée de file, et la SEULE formule qui le calcule (RES-3). '
  'Compte les entrées `waiting` strictement avant celle-ci, plus elle-même — les '
  'entrées `called` ne comptent pas, ce qui fait descendre le rang quand le staff '
  'appelle. Rend `null` pour une entrée qui n''attend pas : « 0e » n''est pas un '
  'rang. Jamais stockée, donc indépendante du rafraîchissement par construction. '
  'N''est GRANTÉE À PERSONNE, service_role compris : seuls ses appelants '
  'SECURITY DEFINER l''exécutent, par possession.';

revoke all on function public.queue_entry_position(public.reservation_queue_entries)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 6. `queue_leave` — partir de soi-même
--
-- AUTORISATION PAR POSSESSION : le couple (identifiant d'entrée, empreinte du
-- cookie) fait foi, motif `cancel_reservation`. Aucun identifiant
-- d'organisation n'est demandé — le connaître n'ajouterait rien, et l'empreinte
-- seule rend l'énumération sans objet.
--
-- ON PEUT PARTIR APRÈS AVOIR ÉTÉ APPELÉ, et c'est délibéré : le client qui voit
-- « c'est à vous » et s'en va quand même est parti, pas absent. La distinction
-- compte pour le commerçant — `left` est un ABANDON qu'il mesure, `no_show` une
-- ABSENCE constatée au comptoir — et c'est le premier des deux gestes qui
-- l'emporte, sans que ni l'un ni l'autre n'ait de conséquence automatique.
-- ────────────────────────────────────────────────────────────

create or replace function public.queue_leave(
  p_entry_id uuid,
  p_player_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue_id uuid;
  v_org_id uuid;
  v_entry public.reservation_queue_entries%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Cette garde de forme est aussi ce qui rend une ligne PURGÉE inatteignable :
  -- son `player_key_hash` vaut alors `purge:<id>`, qui ne peut pas la franchir.
  -- Le `not like` explicite ci-dessous ne fait qu'écrire l'intention, et
  -- survivrait à un assouplissement de cette garde.
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  -- Lecture SANS verrou, pour connaître la file ET SON ORGANISATION — les deux
  -- moitiés de la clé. Rien n'est décidé dessus : tout est relu sous le verrou.
  select e.queue_id, e.organization_id into v_queue_id, v_org_id
    from public.reservation_queue_entries e
   where e.id = p_entry_id
     and e.player_key_hash = p_player_key_hash
     and e.player_key_hash not like 'purge:%';
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_queue:' || v_org_id::text || ':' || v_queue_id::text,
      0)
  );

  select e.* into v_entry
    from public.reservation_queue_entries e
   where e.id = p_entry_id
     and e.player_key_hash = p_player_key_hash
     and e.player_key_hash not like 'purge:%';
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- LE COMPTOIR A DÉJÀ TRANCHÉ : rendu tel quel, sans rien réécrire. Réécrire
  -- un `served` en `left` effacerait un passage réel des statistiques du
  -- commerçant, sur simple clic d'un joueur.
  if v_entry.status in ('served', 'no_show') then
    return pg_catalog.jsonb_build_object(
      'state', v_entry.status,
      'entry_id', v_entry.id,
      'resolved_at', v_entry.resolved_at
    );
  end if;

  -- IDEMPOTENCE : deuxième départ, même réponse, aucune écriture — et surtout
  -- `resolved_at` n'est pas repoussé à chaque appel.
  if v_entry.status = 'left' then
    return pg_catalog.jsonb_build_object(
      'state', 'left',
      'entry_id', v_entry.id,
      'resolved_at', v_entry.resolved_at
    );
  end if;

  update public.reservation_queue_entries
     set status = 'left',
         resolved_at = pg_catalog.now()
   where id = v_entry.id
  returning * into v_entry;

  -- AUCUN AUDIT, et c'est volontaire : `audit_logs` journalise ce qu'un MEMBRE
  -- du commerce a fait. Un départ volontaire n'a pas d'acteur marchand ; l'y
  -- inscrire aurait exigé un acteur fictif, et fait mentir le registre. Le
  -- départ est mesuré là où il compte — les compteurs de `queue_staff_state`.
  return pg_catalog.jsonb_build_object(
    'state', 'left',
    'entry_id', v_entry.id,
    'resolved_at', v_entry.resolved_at
  );
end;
$$;

comment on function public.queue_leave(uuid, text) is
  'Quitte une file d''accueil sur preuve de possession (identifiant d''entrée + '
  'empreinte du cookie joueur) — RES-3. Idempotente. Accepte le départ depuis '
  '`waiting` comme depuis `called` : partir après avoir été appelé reste un '
  'ABANDON (`left`), distinct de l''ABSENCE constatée au comptoir (`no_show`). '
  'Rend l''issue telle quelle, sans rien réécrire, si le comptoir a déjà '
  'tranché ; `unknown` sur une entrée inconnue ou dont les données personnelles '
  'ont été purgées. Aucune pénalité, aucune conséquence automatique.';

revoke all on function public.queue_leave(uuid, text)
  from public, anon, authenticated;
grant execute on function public.queue_leave(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 7. `queue_call_next` — le staff appelle le suivant
--
-- ── POURQUOI LE CAISSIER EN EST, ICI ──
--
-- `owner`/`editor`/`cashier`, comme `checkin_reservation` et à l'inverse de
-- `evict_waitlist_entry`. L'accueil EST le poste du caissier : appeler le
-- suivant est le geste de comptoir par excellence, pas une décision
-- commerciale. Refuser ce rôle aurait rendu le module inutilisable là où il
-- sert — au comptoir, par la personne qui y est.
--
-- ── LA FILE EN PAUSE APPELLE ENCORE ──
--
-- Aucun contrôle de `status` ici, et c'est tout le sens de `paused` : « je
-- n'accepte plus personne, je finis ceux qui attendent ». Un contrôle aurait
-- fait de la mise en pause un abandon de douze personnes debout dans le
-- magasin. `closed` non plus n'est pas contrôlé, pour la même raison : on ferme
-- une file APRÈS l'avoir vidée, et si elle ne l'est pas, il faut pouvoir la
-- vider.
--
-- ── L'ENTRÉE PURGÉE N'EST PAS SAUTÉE, CONTRAIREMENT À RES-2 ──
--
-- `reservation_offer_next` saute les entrées purgées parce qu'une offre TIENT
-- UNE PLACE : la faire à une identité effacée gèlerait un siège deux heures au
-- profit de personne. Ici, rien n'est tenu — appeler ne fait que basculer un
-- statut, et le staff résout en quelques secondes par `no_show`. Sauter aurait
-- eu un coût réel et permanent : l'entrée serait restée `waiting` POUR
-- TOUJOURS, occupant une ligne du plafond que plus rien n'aurait pu libérer.
-- La règle de RES-2 est juste chez elle et ne se transpose pas.
-- ────────────────────────────────────────────────────────────

create or replace function public.queue_call_next(
  p_organization_id uuid,
  p_queue_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_entry public.reservation_queue_entries%rowtype;
  v_waiting integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  -- MÊME GARDE DE FORME QUE `checkin_reservation`, mot pour mot : l'acteur vient
  -- de la session de l'appelant et sa forme est vérifiée AVANT le cast, pour
  -- qu'une valeur libre ne fasse pas lever un 22P02 illisible.
  if p_actor is null
     or p_actor <> pg_catalog.btrim(p_actor)
     or p_actor !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_actor_id := p_actor::uuid;
  -- Les TROIS rôles marchands, caissier compris : voir l'en-tête. Tranché EN
  -- SQL — un `p_actor` libre ferait de la ligne d'audit une déclaration sur
  -- l'honneur.
  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = v_actor_id
       and om.role in ('owner', 'editor', 'cashier')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- LE VERROU EST CE QUI REND « DEUX APPELS SIMULTANÉS » SÛR. Sans lui, deux
  -- caissiers qui cliquent en même temps lisent tous deux la même tête de file
  -- et appellent la MÊME personne — pendant que le suivant reste assis. Sous le
  -- verrou, le second attend, relit, et trouve la tête déjà passée à `called`.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_queue:' || p_organization_id::text || ':' || p_queue_id::text,
      0)
  );

  if not exists (
    select 1 from public.reservation_queues q
     where q.id = p_queue_id
       and q.organization_id = p_organization_id
  ) then
    -- INDISTINCTEMENT pour une file inconnue et pour celle d'une AUTRE
    -- organisation : un commerçant ne doit pas apprendre, en tapant des
    -- identifiants, que la file du voisin existe.
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- LE PREMIER `waiting`, sous l'ordre EXACT de l'index `…_next_idx` — le même
  -- ordre que celui du rang, sans quoi le staff appellerait quelqu'un d'autre
  -- que celui à qui l'écran annonce « vous êtes le prochain ».
  update public.reservation_queue_entries e
     set status = 'called',
         called_at = pg_catalog.now()
   where e.id = (
     select w.id
       from public.reservation_queue_entries w
      where w.queue_id = p_queue_id
        and w.organization_id = p_organization_id
        and w.status = 'waiting'
      order by w.created_at, w.id
      limit 1
   )
  returning e.* into v_entry;

  if not found then
    return pg_catalog.jsonb_build_object('state', 'empty');
  end if;

  select pg_catalog.count(*)::integer into v_waiting
    from public.reservation_queue_entries w
   where w.queue_id = p_queue_id
     and w.status = 'waiting';

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor, 'reservation.queue_call',
          -- CE QUE LE JOURNAL RETIENT, ET CE QU'IL NE RETIENT PAS : l'entrée et
          -- sa file — de quoi reconstituer un ordre de passage contesté — mais
          -- NI le prénom, NI l'adresse, NI l'empreinte du cookie, qui n'ont rien
          -- à faire dans une table qu'aucune purge ne réécrit.
          pg_catalog.jsonb_build_object(
            'entry_id', v_entry.id,
            'queue_id', p_queue_id));

  return pg_catalog.jsonb_build_object(
    'state', 'called',
    'entry_id', v_entry.id,
    'display_name', v_entry.display_name,
    'called_at', v_entry.called_at,
    'waiting_count', v_waiting
  );
end;
$$;

comment on function public.queue_call_next(uuid, uuid, text) is
  'Appelle la PREMIÈRE entrée `waiting` d''une file d''accueil (RES-3). '
  'Org-scopée, acteur obligatoire et vérifié membre owner/editor/cashier EN SQL '
  '— l''accueil est un geste de comptoir, le caissier en est. Le choix de la '
  'tête et son basculement se font SOUS UN VERROU D''AVIS : deux appels '
  'concurrents appellent deux personnes DIFFÉRENTES, jamais la même. NE CONTRÔLE '
  'PAS le statut de la file : une file `paused` n''accepte plus personne mais se '
  'sert encore, et c''est tout le sens de la pause. Ne saute PAS les entrées '
  'purgées (contrairement à reservation_offer_next : rien n''est tenu ici, et '
  'sauter les aurait laissées `waiting` pour toujours). Rend `empty` sur une file '
  'sans attente, `unknown` INDISTINCTEMENT pour une file inconnue et pour celle '
  'd''une AUTRE organisation. Auditée sous `reservation.queue_call`.';

revoke all on function public.queue_call_next(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.queue_call_next(uuid, uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 8. `queue_resolve` — servi, ou absent
--
-- DEPUIS `called` SEULEMENT, et la base le dit deux fois : ici par un refus
-- explicite (`not_called`), et dans la table par la contrainte
-- `…_outcome_origin`. Deux gardes pour une raison : la RPC rend un message
-- utile au comptoir, la contrainte tient même si quelqu'un écrit un jour par un
-- autre chemin.
--
-- POURQUOI CE N'EST PAS UN SIMPLE `update` DEPUIS L'ÉCRAN : parce que marquer
-- « absent » est une AFFIRMATION SUR UNE PERSONNE, et qu'elle doit porter un
-- auteur. `audit_logs` en garde la trace ; aucune conséquence automatique n'en
-- découle — le cahier RES-3 l'exclut nommément.
-- ────────────────────────────────────────────────────────────

create or replace function public.queue_resolve(
  p_organization_id uuid,
  p_entry_id uuid,
  p_actor text,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_queue_id uuid;
  v_entry public.reservation_queue_entries%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  -- VOCABULAIRE FERMÉ, et une valeur hors vocabulaire est un BOGUE DE
  -- L'APPELANT, pas un refus métier : on le dit fort, comme l'organisation
  -- absente. Le rendre en `state` l'aurait fait ressembler à une décision de la
  -- file, et un écran l'aurait affiché au commerçant.
  if p_outcome is null or p_outcome not in ('served', 'no_show') then
    raise exception 'invalid outcome' using errcode = '22023';
  end if;
  if p_actor is null
     or p_actor <> pg_catalog.btrim(p_actor)
     or p_actor !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_actor_id := p_actor::uuid;
  -- Geste de comptoir : les trois rôles, caissier compris (motif
  -- `queue_call_next`). Celui qui appelle est celui qui constate.
  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = v_actor_id
       and om.role in ('owner', 'editor', 'cashier')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select e.queue_id into v_queue_id
    from public.reservation_queue_entries e
   where e.id = p_entry_id
     and e.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_queue:' || p_organization_id::text || ':' || v_queue_id::text,
      0)
  );

  select e.* into v_entry
    from public.reservation_queue_entries e
   where e.id = p_entry_id
     and e.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- ON NE RÉSOUT QUE CE QUI A ÉTÉ APPELÉ. Marquer « servi » quelqu'un qui n'a
  -- jamais été appelé sauterait le tour de tous ceux qui sont devant lui, et
  -- c'est exactement ce contre quoi la file existe.
  if v_entry.status = 'waiting' then
    return pg_catalog.jsonb_build_object(
      'state', 'not_called',
      'entry_id', v_entry.id
    );
  end if;

  -- DÉJÀ RÉSOLUE — y compris avec la MÊME issue : rendue telle quelle, sans
  -- écriture et SANS AUDIT. Journaliser « ce membre a marqué absent » sur un
  -- second clic qui n'a rien écrit ferait mentir le registre (motif
  -- `evict_waitlist_entry`).
  if v_entry.status <> 'called' then
    return pg_catalog.jsonb_build_object(
      'state', v_entry.status,
      'entry_id', v_entry.id,
      'resolved_at', v_entry.resolved_at
    );
  end if;

  update public.reservation_queue_entries
     set status = p_outcome,
         resolved_at = pg_catalog.now()
   where id = v_entry.id
  returning * into v_entry;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor, 'reservation.queue_resolve',
          pg_catalog.jsonb_build_object(
            'entry_id', v_entry.id,
            'queue_id', v_queue_id,
            'outcome', p_outcome));

  return pg_catalog.jsonb_build_object(
    'state', v_entry.status,
    'entry_id', v_entry.id,
    'resolved_at', v_entry.resolved_at
  );
end;
$$;

comment on function public.queue_resolve(uuid, uuid, text, text) is
  'Clôt une entrée de file APPELÉE : `served` ou `no_show` (RES-3). Org-scopée, '
  'acteur obligatoire et vérifié membre owner/editor/cashier EN SQL, idempotente '
  '(une entrée déjà résolue est rendue telle quelle, sans écriture et sans '
  'audit), auditée sous `reservation.queue_resolve` SUR LE SEUL GESTE RÉEL. '
  'Refuse `not_called` depuis `waiting` — servir quelqu''un qui n''a pas été '
  'appelé saute le tour de tous ceux qui sont devant. Une issue hors '
  'vocabulaire LÈVE (bogue de l''appelant). AUCUNE conséquence automatique n''est '
  'tirée d''un `no_show` : le cahier RES-3 l''exclut nommément. `unknown` '
  'INDISTINCTEMENT pour une entrée inconnue et pour celle d''une AUTRE '
  'organisation.';

revoke all on function public.queue_resolve(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.queue_resolve(uuid, uuid, text, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 9. `queue_reopen_entry` — le staff s'est trompé de personne
--
-- ── LA REMISE EN TÊTE EST UNE CONSÉQUENCE, PAS UNE ÉCRITURE ──
--
-- La fonction ne touche NI `created_at`, NI aucun rang : elle repose `status =
-- 'waiting'` et efface `called_at`. Et pourtant l'entrée se retrouve EN TÊTE,
-- toujours — parce que `queue_call_next` a pris la PLUS ANCIENNE des entrées en
-- attente, et que rien de plus ancien ne peut apparaître après coup. Son
-- `created_at` est donc, par construction, antérieur à celui de toutes les
-- entrées qui attendent encore.
--
-- C'est le contraire de ce qu'une colonne `position` aurait demandé : il aurait
-- fallu décaler tout le monde d'un cran, sous verrou, et espérer qu'aucun
-- chemin d'écriture ne l'oublie. Ici il n'y a rien à décaler — c'est la même
-- raison qui fait que le rang ne dépend pas du rafraîchissement.
--
-- ── LE CAISSIER EN EST, ET C'EST L'INVERSE DE `evict_waitlist_entry` ──
--
-- Celle-ci RETIRE un rang et exclut le caissier ; celle-là le REND, et c'est la
-- correction immédiate d'une erreur de comptoir — « j'ai appelé Camille, c'était
-- Dominique ». Faire remonter la correction à un responsable aurait laissé
-- quelqu'un perdre son tour en attendant.
--
-- ── DEPUIS `called` SEULEMENT ──
--
-- Une entrée `served`, `no_show` ou `left` est rendue telle quelle. Rouvrir un
-- `no_show` reviendrait à effacer une absence constatée ; si le staff s'est
-- trompé là-dessus, la personne rejoint la file — elle est devant lui.
-- ────────────────────────────────────────────────────────────

create or replace function public.queue_reopen_entry(
  p_organization_id uuid,
  p_entry_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_queue_id uuid;
  v_entry public.reservation_queue_entries%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_actor is null
     or p_actor <> pg_catalog.btrim(p_actor)
     or p_actor !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_actor_id := p_actor::uuid;
  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = v_actor_id
       and om.role in ('owner', 'editor', 'cashier')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select e.queue_id into v_queue_id
    from public.reservation_queue_entries e
   where e.id = p_entry_id
     and e.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_queue:' || p_organization_id::text || ':' || v_queue_id::text,
      0)
  );

  select e.* into v_entry
    from public.reservation_queue_entries e
   where e.id = p_entry_id
     and e.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- IDEMPOTENCE : déjà en attente, on rend son rang sans rien écrire ni auditer.
  if v_entry.status = 'waiting' then
    return pg_catalog.jsonb_build_object(
      'state', 'waiting',
      'entry_id', v_entry.id,
      'position', public.queue_entry_position(v_entry)
    );
  end if;

  -- TERMINALE : rendue telle quelle. Voir l'en-tête — on ne rouvre pas une
  -- absence constatée ni un départ volontaire.
  if v_entry.status <> 'called' then
    return pg_catalog.jsonb_build_object(
      'state', v_entry.status,
      'entry_id', v_entry.id,
      'resolved_at', v_entry.resolved_at
    );
  end if;

  -- `called_at` EST EFFACÉ, et la contrainte `…_waiting_state` l'exigerait de
  -- toute façon : une entrée qui attend n'a pas d'appel en cours. La trace de
  -- l'appel erroné ne disparaît pas pour autant — elle est dans `audit_logs`,
  -- qui est l'endroit d'une histoire, là où la ligne porte un état.
  update public.reservation_queue_entries
     set status = 'waiting',
         called_at = null
   where id = v_entry.id
  returning * into v_entry;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor, 'reservation.queue_reopen',
          pg_catalog.jsonb_build_object(
            'entry_id', v_entry.id,
            'queue_id', v_queue_id));

  return pg_catalog.jsonb_build_object(
    'state', 'waiting',
    'entry_id', v_entry.id,
    'position', public.queue_entry_position(v_entry)
  );
end;
$$;

comment on function public.queue_reopen_entry(uuid, uuid, text) is
  'Défait un appel erroné : une entrée `called` redevient `waiting`, EN TÊTE '
  'DE FILE (RES-3). La remise en tête n''est pas une écriture mais une '
  'CONSÉQUENCE — queue_call_next a pris la plus ancienne entrée en attente, et '
  'rien de plus ancien ne peut apparaître ensuite ; aucun rang n''est donc '
  'renuméroté. Org-scopée, acteur vérifié membre owner/editor/cashier EN SQL — '
  'le caissier en est, à l''inverse d''evict_waitlist_entry : c''est la '
  'correction immédiate d''une erreur de comptoir. Idempotente sur `waiting`. '
  'Rend telle quelle une entrée `served`, `no_show` ou `left` : on ne rouvre '
  'pas une issue constatée. Auditée sous `reservation.queue_reopen`.';

revoke all on function public.queue_reopen_entry(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.queue_reopen_entry(uuid, uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 10. `queue_public_state` — ce que le joueur voit, et RIEN de plus
--
-- ── AUCUN ETA, ET C'EST LA CLÉ QUI MANQUE VOLONTAIREMENT ──
--
-- Ce document ne porte ni durée estimée, ni heure de passage, ni « environ N
-- minutes ». Le critère RES-3 est « aucun ETA tant qu'il n'est pas fiable », et
-- rien dans cette base ne permet aujourd'hui d'en calculer un qui le soit :
-- aucune mesure de temps de service n'existe, et le rang seul ne dit rien de la
-- durée — trois personnes devant un retrait de colis et trois devant une
-- dégustation ne sont pas la même attente. Une estimation inventée serait pire
-- que pas d'estimation : elle serait CRUE, puis démentie.
--
-- ── AUCUNE IDENTITÉ, PAS MÊME UN PRÉNOM ──
--
-- Le joueur reçoit SON entrée et des NOMBRES. Rendre la liste — même réduite à
-- des prénoms — aurait fait de la page d'attente publique un annuaire de qui
-- est dans le magasin, consultable par n'importe qui possède l'adresse de la
-- file.
--
-- ── PAS D'ORGANISATION EN PARAMÈTRE, ET C'EST CORRECT ICI ──
--
-- `reservation_public_state` exige l'organisation parce qu'elle rend TOUT ce
-- qu'une empreinte a réservé, et que cette empreinte suit le joueur chez tous
-- les commerçants. Celle-ci est bornée à UNE file NOMMÉE par l'appelant : elle
-- ne peut rien dire d'un autre commerce, même sans borne de locataire. Même
-- forme d'autorisation que `cancel_reservation` — la possession.
--
-- ── NI LE DROIT `vitrine`, NI LE STATUT DE LA FILE NE BLOQUENT LA LECTURE ──
--
-- Lire son propre rang n'est pas un acte commercial. Le bloquer aurait laissé
-- sans réponse quelqu'un qui attend physiquement, pour un motif — un abonnement,
-- une pause — qui ne le regarde pas. Le statut de la file est RENDU, pour que
-- l'écran puisse le dire ; il ne conditionne rien.
-- ────────────────────────────────────────────────────────────

create or replace function public.queue_public_state(
  p_queue_id uuid,
  p_player_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.reservation_queues%rowtype;
  v_entry public.reservation_queue_entries%rowtype;
  v_waiting integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  select q.* into v_queue
    from public.reservation_queues q
   where q.id = p_queue_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LA TAILLE DE LA FILE : les seules entrées `waiting`. Une personne appelée
  -- n'attend plus, et la compter aurait fait dire à l'écran « 4 personnes
  -- attendent » quand trois sont déjà au comptoir. Ce nombre est le même pour
  -- tout le monde, et c'est aussi ce qui rend le rang lisible : « 2e sur 5 ».
  select pg_catalog.count(*)::integer into v_waiting
    from public.reservation_queue_entries e
   where e.queue_id = p_queue_id
     and e.status = 'waiting';

  select e.* into v_entry
    from public.reservation_queue_entries e
   where e.queue_id = p_queue_id
     and e.player_key_hash = p_player_key_hash
     -- UNE LIGNE PURGÉE NE SE RELIT PAS. La garde de forme du paramètre
     -- l'interdit déjà ; ce filtre écrit l'intention et tiendrait encore si
     -- cette garde venait à s'assouplir.
     and e.player_key_hash not like 'purge:%'
     and e.status in ('waiting', 'called');

  if not found then
    return pg_catalog.jsonb_build_object(
      'state', 'not_in_queue',
      'queue_name', v_queue.name,
      'queue_status', v_queue.status,
      'waiting_count', v_waiting
    );
  end if;

  -- NI l'empreinte, NI l'adresse, NI le prénom ne sortent d'ici : les deux
  -- premières sont des données que l'appelant a déjà fournies s'il les connaît,
  -- et une réponse qui les recopie ne lui apprend rien tout en les exposant à
  -- chaque journal traversé. Le prénom n'a de sens que sur l'écran du staff.
  --
  -- `status = 'called'` ET `called_at` VOYAGENT AVEC LE RANG, sur le MÊME
  -- document : c'est ce qui permet à l'écran joueur de basculer sans aller
  -- chercher ailleurs — critère RES-3 « l'appel staff prime sur tout autre
  -- écran ».
  return pg_catalog.jsonb_build_object(
    'state', 'in_queue',
    'queue_name', v_queue.name,
    'queue_status', v_queue.status,
    'entry_id', v_entry.id,
    'status', v_entry.status,
    'position', public.queue_entry_position(v_entry),
    'waiting_count', v_waiting,
    'joined_at', v_entry.created_at,
    'called_at', v_entry.called_at
  );
end;
$$;

comment on function public.queue_public_state(uuid, text) is
  'État public d''une identité pseudonyme dans UNE file d''accueil (RES-3) : son '
  'rang RÉEL — compté à la lecture, jamais stocké — le nombre de personnes qui '
  'attendent, et son statut. NE PORTE AUCUN ETA, aucune durée, aucune heure de '
  'passage : critère dur RES-3, et rien dans cette base ne permet aujourd''hui '
  'd''en calculer un qui soit fiable. N''expose AUCUNE autre identité, pas même '
  'un prénom, ni l''empreinte ni l''adresse de l''appelant. `status = ''called''` '
  'et `called_at` voyagent sur le MÊME document que le rang, pour que l''écran '
  'bascule sans second appel. Ne vérifie ni le droit `vitrine` ni le statut de '
  'la file : lire son propre rang n''est pas un acte commercial.';

revoke all on function public.queue_public_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.queue_public_state(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 11. `queue_staff_state` — l'écran d'accueil
--
-- ── CE QU'ELLE REND, ET POURQUOI CES COMPTEURS-LÀ ──
--
-- Les entrées VIVANTES, ordonnées comme la file elle-même, avec le prénom et
-- les horodatages ; puis les compteurs DU JOUR : servis, absents, partis. Ces
-- trois-là et pas d'autres, parce que ce sont exactement les trois issues
-- possibles, et que leur rapport est la seule mesure honnête qu'on puisse tirer
-- d'une file sans mesurer le temps — critère RES-3 « abandons et absences
-- MESURÉS ».
--
-- ── LE JOUR EST CELUI DU COMMERÇANT ──
--
-- `date_trunc('day', …)` DANS LE FUSEAU DE L'ORGANISATION, motif
-- `checkin_reservation`. En UTC, la journée d'un commerce parisien se serait
-- terminée à 2 h du matin l'été, et son écran aurait remis les compteurs à zéro
-- en plein service. Même repli qu'ailleurs : une zone que Postgres ne connaît
-- pas ne doit pas faire échouer un écran de comptoir.
--
-- ── PAS D'ACTEUR EN PARAMÈTRE, ET IL FAUT LE DIRE ──
--
-- Contrairement aux trois RPC d'écriture, celle-ci ne vérifie AUCUNE
-- appartenance : elle est en LECTURE, `service_role` seulement, et bornée à
-- l'organisation passée. C'est la même posture que `reservation_public_state`.
-- CE QUE CELA EXIGE DE LA COUCHE APPELANTE, et qui doit être écrit noir sur
-- blanc : `p_organization_id` DOIT venir de la session marchande résolue côté
-- serveur (`getUserAndOrg`), JAMAIS d'un paramètre de requête. Passer un
-- identifiant reçu du navigateur ouvrirait l'écran d'accueil du voisin.
-- ────────────────────────────────────────────────────────────

create or replace function public.queue_staff_state(
  p_organization_id uuid,
  p_queue_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.reservation_queues%rowtype;
  v_activity_name text;
  v_timezone text;
  v_day_start timestamptz;
  v_entries jsonb;
  v_served integer;
  v_no_show integer;
  v_left integer;
  v_waiting integer;
  v_called integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  select q.* into v_queue
    from public.reservation_queues q
   where q.id = p_queue_id
     and q.organization_id = p_organization_id;
  if not found then
    -- INDISTINCTEMENT pour une file inconnue et pour celle d'une AUTRE
    -- organisation.
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  select a.name into v_activity_name
    from public.reservation_activities a
   where a.id = v_queue.activity_id
     and a.organization_id = p_organization_id;

  select o.timezone into v_timezone
    from public.organizations o
   where o.id = p_organization_id;
  if v_timezone is null or not public.is_valid_timezone(v_timezone) then
    v_timezone := 'Europe/Paris';
  end if;
  v_day_start :=
    (pg_catalog.date_trunc('day', pg_catalog.now() at time zone v_timezone))
      at time zone v_timezone;

  -- LES ENTRÉES VIVANTES, dans l'ordre de la file. `position` emprunte LA MÊME
  -- formule que l'écran du joueur : deux formules divergentes montreraient deux
  -- rangs différents de la même personne sur deux écrans ouverts côte à côte.
  -- Elle est nulle pour une entrée `called` — celle-là n'attend plus.
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'entry_id', e.id,
        'display_name', e.display_name,
        'status', e.status,
        'position', public.queue_entry_position(e),
        'joined_at', e.created_at,
        'called_at', e.called_at
      )
      -- LES APPELÉS D'ABORD : ce sont eux qui sont au comptoir, donc eux que le
      -- staff regarde. Les attentes suivent dans l'ordre exact du rang.
      order by (e.status = 'called') desc, e.created_at, e.id
    ),
    '[]'::jsonb
  ) into v_entries
    from public.reservation_queue_entries e
   where e.queue_id = p_queue_id
     and e.organization_id = p_organization_id
     and e.status in ('waiting', 'called');

  -- Les parenthèses autour de l'agrégat ne sont pas décoratives : sans elles,
  -- `::integer` se colle à la clause `filter` et le sens du cast devient au
  -- mieux ambigu. Même geste sur les deux comptages vivants ci-dessous.
  select
    (pg_catalog.count(*) filter (where e.status = 'served'))::integer,
    (pg_catalog.count(*) filter (where e.status = 'no_show'))::integer,
    (pg_catalog.count(*) filter (where e.status = 'left'))::integer
    into v_served, v_no_show, v_left
    from public.reservation_queue_entries e
   where e.queue_id = p_queue_id
     and e.organization_id = p_organization_id
     and e.resolved_at >= v_day_start;

  select
    (pg_catalog.count(*) filter (where e.status = 'waiting'))::integer,
    (pg_catalog.count(*) filter (where e.status = 'called'))::integer
    into v_waiting, v_called
    from public.reservation_queue_entries e
   where e.queue_id = p_queue_id
     and e.organization_id = p_organization_id
     and e.status in ('waiting', 'called');

  -- L'ADRESSE NE SORT PAS, comme partout ailleurs dans ce module : elle
  -- n'existe que pour un envoi serveur. Le PRÉNOM, lui, sort — c'est ici, et
  -- seulement ici, qu'il a une raison d'être.
  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'queue', pg_catalog.jsonb_build_object(
      'id', v_queue.id,
      'name', v_queue.name,
      'status', v_queue.status,
      'max_live_entries', v_queue.max_live_entries,
      'activity_id', v_queue.activity_id,
      'activity_name', v_activity_name
    ),
    'timezone', v_timezone,
    'entries', v_entries,
    'live', pg_catalog.jsonb_build_object(
      'waiting', v_waiting,
      'called', v_called
    ),
    'today', pg_catalog.jsonb_build_object(
      'served', v_served,
      'no_show', v_no_show,
      'left', v_left
    )
  );
end;
$$;

comment on function public.queue_staff_state(uuid, uuid) is
  'Écran d''accueil d''une file (RES-3) : les entrées VIVANTES ordonnées — les '
  'appelés d''abord, puis les attentes dans l''ordre exact du rang — avec '
  'prénom, horodatages et rang calculé par LA MÊME formule que l''écran du '
  'joueur ; et les compteurs DU JOUR (servis, absents, partis), le jour étant '
  'celui du FUSEAU DE L''ORGANISATION. N''expose AUCUNE adresse. Ne vérifie '
  'AUCUNE appartenance — lecture service_role, bornée à l''organisation passée : '
  'la couche appelante DOIT résoudre `p_organization_id` depuis la session '
  'marchande (getUserAndOrg), jamais depuis un paramètre de requête. `unknown` '
  'INDISTINCTEMENT pour une file inconnue et pour celle d''une AUTRE '
  'organisation.';

revoke all on function public.queue_staff_state(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.queue_staff_state(uuid, uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 12. Purge RGPD — corps VERBATIM de 20261004120000, +1 geste
--
-- Même forme que les gestes (d) et (e) avant lui, et pour la même raison : LA
-- SIGNATURE NE BOUGE PAS. Une quatrième colonne de retour aurait exigé un `drop
-- function` et une modification de src/app/api/cron/purge-data/route.ts, qui lit
-- les colonnes par leur nom — deux périmètres pour un compteur que personne ne
-- lit.
--
-- LE GESTE (f) : une entrée de file porte un PRÉNOM en plus de l'adresse, du
-- consentement et de l'empreinte. Il part avec les trois autres, et d'un seul
-- geste — c'est un nom de personne, la donnée la plus directement identifiante
-- de la table.
--
-- ── POURQUOI LA LIGNE RESTE, PLUTÔT QUE D'ÊTRE SUPPRIMÉE ──
--
-- Parce que ce qui reste après la personne appartient au commerçant : combien
-- de gens ont attendu, combien sont partis, combien ne se sont pas présentés.
-- C'est la seule mesure que RES-3 lui promet. Supprimer les lignes résolues
-- aurait effacé ses statistiques d'accueil en même temps que les identités —
-- deux choses qui n'ont ni le même propriétaire ni la même raison d'exister.
-- Motif des gestes (c), (d) et (e), à l'identique.
--
-- LE FILTRE PORTE SUR `created_at`, sans distinction d'état : une entrée
-- toujours `waiting` six mois après avoir été créée n'est pas une personne qui
-- attend, c'est une ligne oubliée — et sa donnée personnelle a la même échéance
-- que celle des autres. Le garde final rend le passage idempotent.
--
-- ── ET POURQUOI CETTE LIGNE-LÀ EST FERMÉE, ELLE ──
--
-- Effacer la personne SANS TOUCHER À L'ÉTAT laissait l'entrée oubliée occuper
-- une ligne du plafond POUR TOUJOURS, et le mot n'est pas exagéré : plus rien
-- ne pouvait la libérer. `queue_leave` exige une empreinte, et la purge vient
-- précisément de la remplacer par un marqueur ; `queue_call_next` la prendrait
-- bien — c'est l'arbitrage de la section 7, qui refuse de sauter les purgées
-- pour cette raison même — mais il faut encore que quelqu'un appelle, et une
-- file qu'on a cessé de servir est justement celle où les lignes oubliées
-- s'accumulent. Le plafond existe pour BORNER LE STOCKAGE DE DONNÉES
-- PERSONNELLES (leçon E-1a de la revue L5) : le laisser saturé par des lignes
-- DONT LA DONNÉE PERSONNELLE VIENT D'ÊTRE EFFACÉE serait l'exact contraire de
-- ce qu'il protège — la file refuserait une vraie personne au nom de fantômes.
-- Le rang, lui, mentait de la même façon : `queue_entry_position` compte les
-- `waiting` devant soi, fantômes compris.
--
-- `left`, ET AUCUNE AUTRE ISSUE. `served` affirmerait un passage qui n'a pas eu
-- lieu, et gonflerait le seul chiffre dont le commerçant se sert. `no_show` est
-- une AFFIRMATION SUR UNE PERSONNE — la section 8 exige qu'elle porte un
-- auteur, et une purge n'en a pas. `left` dit la seule chose qu'on sache :
-- l'attente s'est terminée sans passage. C'est aussi la seule issue que
-- `…_outcome_origin` accepte SANS APPEL PRÉALABLE, donc la seule qui ferme d'un
-- même geste une entrée `waiting` et une entrée `called`.
--
-- `resolved_at` EST DATÉ AU DERNIER INSTANT CONNU DE L'ENTRÉE — `called_at`
-- s'il y a eu un appel, `created_at` sinon — et JAMAIS `now()`. Avec `now()`,
-- le matin où le cron passe, `queue_staff_state` aurait montré au commerçant
-- une volée d'abandons « du jour » vieux de treize mois : la purge aurait
-- INVENTÉ une statistique, exactement ce que le critère « abandons et absences
-- mesurés » interdit. Daté ainsi, l'instant retenu est par construction
-- antérieur à la rétention, donc à tout jour que le comptoir regarde encore, et
-- le compte du jour ne bouge pas d'une unité.
--
-- LE GARDE FINAL GAGNE DONC `status in ('waiting', 'called')`. Sans ce
-- disjoint, une ligne déjà purgée mais restée vivante — celles qu'une version
-- antérieure de cette fonction a pu laisser derrière elle — serait sautée par
-- l'idempotence et ne serait JAMAIS fermée. Le rejeu reste sans écriture une
-- fois l'entrée close : `left` ne satisfait plus aucun disjoint.
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
