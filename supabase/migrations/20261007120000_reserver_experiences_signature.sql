-- ============================================================
-- LES EXPÉRIENCES SIGNATURE (RES-5, lot L8) — DEUX FORMATS, UN SEUL MOTEUR
--
-- Le cahier demande deux expériences nouvelles, et elles partagent TOUT leur
-- socle : page immersive, promesse, durée, capacité, préparation, check-in,
-- liste d'attente éventuelle.
--
--   * LE MOMENT SIGNATURE — 20 à 45 minutes, présenté en trois étapes ; le
--     joueur choisit un créneau, voit la jauge, réserve, et le staff l'accueille.
--   * L'ATELIER DUO — réservé par UN HÔTE POUR DEUX. Aucun score, aucun
--     classement, aucun gain : ce fichier n'écrit RIEN dans `reward_issuances`,
--     ne touche à aucune campagne et ne crée aucun octroi. Ce qui le distingue
--     n'est pas une mécanique de jeu, c'est une CAPACITÉ QUI SE COMPTE PAR
--     PERSONNE.
--
-- ── LA CONTRAINTE DURE : PAS DE SECOND MOTEUR ──
--
-- Il aurait été plus rapide de donner à chacun de ces formats sa table de
-- réservation, sa jauge et son verrou. Ç'aurait été trois moteurs à tenir
-- d'accord — trois endroits où corriger la prochaine course, trois définitions
-- de « complet », et la garantie qu'au moins une des trois divergerait. Ce
-- fichier ne crée AUCUNE table de réservation. Il TYPE celle qui existe :
-- `reservation_activities.kind` dit de quelle expérience il s'agit, et les
-- mêmes RPC, sous le MÊME verrou d'avis, servent les trois.
--
-- ── LE SEUL CHANGEMENT DE FOND : LA PLACE N'EST PLUS LA LIGNE ──
--
-- Depuis le socle (20261002120000), « une réservation = une place » était vrai
-- par construction, et tout le module comptait donc des LIGNES — `count(*)`
-- contre `capacity`. L'Atelier Duo casse cette équivalence : une ligne, deux
-- personnes. `reservations.party_size` porte le nombre de personnes, et TOUS
-- les comptages de ce module passent de `count(*)` à `sum(party_size)`.
--
-- CE N'EST PAS UN DÉTAIL D'ARITHMÉTIQUE, c'est la propriété d'atomicité
-- elle-même. Sur un Atelier à deux places, deux hôtes qui cliquent en même
-- temps doivent produire UN succès et UN refus — jamais deux moitiés de duo.
-- Compter des lignes aurait laissé passer les deux (2 lignes <= 2 places) et
-- accueilli quatre personnes dans un atelier pour deux.
--
-- LES SITES SONT RECENSÉS, PAS DEVINÉS. Six fonctions comptent des places, et
-- toutes sont redéfinies ici, en entier, sous leurs verrous inchangés :
--   `reserve_slot` (jauge + idempotence), `reservation_offer_next` (le nombre
--   d'offres à créer), `waitlist_join` (le test « réellement complet »),
--   `claim_waitlist_offer` (la taille de la réservation créée),
--   `redeem_invitation` (jauge + `remaining`), `reservation_public_state`
--   (ce que le joueur relit de sa propre réservation).
-- Les DEUX annulations (`cancel_reservation`, `cancel_reservation_staff`) ne
-- comptent rien : elles écrivent un statut puis appellent `reservation_offer_next`
-- sous leur verrou. La bonne arithmétique de libération leur vient donc
-- GRATUITEMENT, par la fonction qu'elles appellent déjà — et c'est exactement
-- pourquoi elles ne sont PAS redéfinies ici : les recopier pour ne rien y
-- changer aurait ajouté deux corps à relire sans ajouter une seule garantie.
-- `wait_session_open` (20261006120000) a été vérifiée pour la même question :
-- elle lit `reservations` pour la VIVACITÉ d'une ligne (`status = 'confirmed'`),
-- jamais pour compter des places. Rien à y changer, le guichet d'attente reste
-- valable tel quel pour les trois formats.
--
-- ── L'UNITÉ DE RÉSERVATION, ET POURQUOI ELLE EST UNIFORME ──
--
-- Sur une activité `duo`, TOUTE réservation vaut deux personnes — par les trois
-- portes, pas seulement par la porte publique. Une offre de liste prioritaire y
-- tient donc DEUX places, et `reservation_offer_next` n'émet qu'une offre par
-- PAIRE libre.
--
-- L'alternative — laisser la liste prioritaire et l'invitation créer des
-- réservations d'une personne sur un Atelier Duo — aurait produit deux défauts
-- au lieu d'un : une ligne qui contredit la définition même du format (« l'atelier
-- se réserve à deux »), et une comptabilité fausse (l'offre aurait tenu une
-- place, la conversion en aurait pris deux, et le créneau se serait sur-réservé
-- par le seul chemin qui ne repasse PAS par la jauge). L'uniformité n'est pas un
-- raffinement : c'est ce qui permet à `claim_waitlist_offer` de rester sans
-- jauge, ce qui est sa propriété la plus importante.
--
-- SUR UNE ACTIVITÉ NON-DUO, `v_seats` VAUT 1 ET TOUTE L'ARITHMÉTIQUE REDEVIENT
-- CELLE D'HIER, AU CARACTÈRE PRÈS : `sum(party_size)` sur des lignes toutes à 1
-- est `count(*)`, `count(*) * 1` est `count(*)`, et `v_taken + v_held + 1 >
-- capacity` est `v_taken + v_held >= capacity`. Les blocs 1 à 23 de
-- `supabase/tests/reserver.test.sql` passent donc inchangés — c'est la
-- vérification que ce fichier ne casse rien, et elle est mécanique.
--
-- ── CE QUE CE FICHIER NE FAIT PAS, VOLONTAIREMENT ──
--
--   * AUCUN paiement, AUCUNE billetterie, AUCUN matériel : hors cahier.
--   * AUCUN score, AUCUN classement, AUCUN gain pour le Duo — rien n'entre au
--     registre `reward_issuances`, conformément au socle (20261002120000 :
--     « une réservation n'est pas une récompense »).
--   * AUCUNE taille supérieure à 2. `party_size` est borné à 1..2 PAR LA BASE :
--     au MVP le duo est la seule taille plurielle, et une borne large aurait
--     ouvert la porte à un groupe de 40 sur un créneau de 4 sans qu'aucune
--     règle écrite ne s'y oppose. Élargir sera une migration, avec sa décision.
--   * AUCUNE contrainte de table liant `party_size` au format de l'activité :
--     un `check` ne peut pas lire une AUTRE table, et un trigger l'aurait fait
--     au prix d'une lecture par écriture. La règle est tenue là où elle est
--     décidée — dans les RPC, sous le verrou, où le format est déjà lu.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. `is_valid_experience_steps` — les trois cartes du Moment Signature
--
-- Motif des validateurs du dépôt (`is_valid_experience_blueprint_payload`,
-- 20260805180000 ; `is_valid_progression_rule`, 20260805200000) : `immutable`,
-- `set search_path = pg_catalog` — d'où les appels NON qualifiés, qui s'y
-- résolvent — et rendue à personne.
--
-- ELLE VALIDE LA FORME, PAS LA PRÉSENCE. Le plafond de trois et la forme de
-- chaque carte sont ici ; l'exigence « une à trois cartes POUR UNE SIGNATURE »
-- est portée par une contrainte conditionnelle de la table, parce qu'elle
-- dépend du format et pas du tableau. Un tableau vide est donc structurellement
-- valide et refusé par la contrainte conditionnelle sur `signature` — la
-- séparation est ce qui permet aux deux autres formats d'accepter `null`.
--
-- TROIS, PARCE QUE LA PAGE EN MONTRE TROIS. Ce n'est pas une borne technique
-- mais le format lui-même : « présentée en trois étapes/cartes ». Une
-- quatrième carte n'aurait nulle part où s'afficher, et la base refuse ce que
-- l'écran ne sait pas rendre plutôt que de le stocker en silence.
-- ────────────────────────────────────────────────────────────

create or replace function public.is_valid_experience_steps(p_steps jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_step jsonb;
begin
  -- `null` est VALIDE ici : c'est l'absence d'étapes, légitime pour un format
  -- qui n'en présente pas. Ce qui l'interdit à une `signature`, c'est la
  -- contrainte conditionnelle de la table, pas ce validateur.
  if p_steps is null then
    return true;
  end if;

  if jsonb_typeof(p_steps) <> 'array'
    or jsonb_array_length(p_steps) > 3
  then
    return false;
  end if;

  -- ── LES `coalesce` NE SONT PAS DÉCORATIFS : ILS FERMENT UN TROU ──
  --
  -- Sur une carte à qui il MANQUE une clé, `v_step -> 'body'` vaut NULL SQL,
  -- donc `jsonb_typeof(...)` vaut NULL, donc `NULL <> 'string'` vaut NULL — et
  -- une chaîne `or` qui ne contient que `false` et `NULL` vaut NULL, que le
  -- `if` ne prend PAS. Sans ces `coalesce`, une carte sans corps était donc
  -- ACCEPTÉE, et la page aurait rendu une carte vide. Le défaut a été trouvé
  -- par PRES-6, qui est écrit exactement pour lui.
  --
  -- `coalesce` reste NON QUALIFIÉ (garde sql:check) : c'est un nœud du parseur,
  -- pas une fonction du catalogue.
  for v_step in select value from jsonb_array_elements(p_steps)
  loop
    if jsonb_typeof(v_step) <> 'object'
      or coalesce(jsonb_typeof(v_step -> 'title'), '') <> 'string'
      or char_length(btrim(coalesce(v_step ->> 'title', ''))) not between 1 and 80
      or coalesce(jsonb_typeof(v_step -> 'body'), '') <> 'string'
      or char_length(btrim(coalesce(v_step ->> 'body', ''))) not between 1 and 400
    then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

comment on function public.is_valid_experience_steps(jsonb) is
  'Valide la FORME des étapes d''un Moment Signature (RES-5) : un tableau d''AU '
  'PLUS TROIS objets `{title, body}`, titres et corps non vides et bornés à 80 '
  'et 400 caractères une fois détourés. `null` est accepté — l''absence '
  'd''étapes est légitime pour les formats qui n''en présentent pas ; c''est la '
  'contrainte conditionnelle `reservation_activities_signature_steps` qui les '
  'EXIGE d''une `signature`. Rendue à personne : elle n''est appelée que depuis '
  'un `check` de table, où PostgreSQL évalue l''expression sans contrôle '
  'de privilège (motif is_valid_progression_rule, 20260805200000).';

revoke all on function public.is_valid_experience_steps(jsonb)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 2. `reservation_activities` — le format et sa présentation
--
-- ── POURQUOI UN `kind` SUR L'ACTIVITÉ, ET PAS SUR LE CRÉNEAU ──
--
-- Le format est une propriété de CE QUE LE COMMERÇANT PROPOSE, pas de l'heure
-- à laquelle il le propose. Le porter par créneau aurait permis à un même
-- Atelier Duo d'être « duo » le mardi et « standard » le jeudi — c'est-à-dire à
-- la capacité de changer d'unité en cours de semaine, sur des créneaux dont
-- certains portent déjà des réservations. Sur l'activité, le format est lu une
-- fois, au même endroit que `active`, dans la requête que chaque RPC fait déjà.
--
-- `standard` PAR DÉFAUT, et c'est ce qui rend la migration sûre : les activités
-- existantes gardent EXACTEMENT le comportement du socle, sans écriture de
-- données et sans réécriture de table.
--
-- ── LES CHAMPS DE PRÉSENTATION SONT NULLABLES, ET BORNÉS ──
--
-- Ils décrivent la page immersive : la promesse en une phrase, la durée
-- annoncée, les trois cartes, la préparation. Nullables parce qu'une activité
-- `standard` n'en a aucun besoin ; bornés parce que ce sont des textes que le
-- commerçant saisit et que la page doit rendre — un champ non borné se
-- retrouve un jour à 40 Ko dans une carte prévue pour trois lignes.
--
-- `preparation` PORTE AUSSI LES « INSTRUCTIONS » DU DUO. Le cahier nomme
-- « préparation » côté Signature et « instructions » côté Duo : c'est le même
-- champ, la même chose dite au participant avant qu'il vienne. Deux colonnes
-- pour cela auraient créé deux endroits où écrire la même phrase, et un écran
-- qui doit choisir lequel afficher.
-- ────────────────────────────────────────────────────────────

alter table public.reservation_activities
  add column if not exists kind text not null default 'standard';
alter table public.reservation_activities
  add column if not exists promise text;
alter table public.reservation_activities
  add column if not exists duration_minutes integer;
alter table public.reservation_activities
  add column if not exists steps jsonb;
alter table public.reservation_activities
  add column if not exists preparation text;

-- Contraintes NOMMÉES et posées séparément (motif des FK de 20261006120000) :
-- un `check` inline sur `add column if not exists` ne se repose pas si la
-- colonne existe déjà, et son nom auto-généré serait illisible dans l'erreur
-- que le commerçant voit.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::regclass
       and con.conname = 'reservation_activities_kind_check'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_kind_check
      check (kind in ('standard', 'signature', 'duo'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::regclass
       and con.conname = 'reservation_activities_promise_check'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_promise_check
      check (promise is null or pg_catalog.char_length(promise) <= 200);
  end if;

  -- 10 À 240 MINUTES. La borne basse écarte la saisie accidentelle (« 1 »
  -- minute n'est pas une expérience) ; la haute est la journée de travail d'un
  -- commerce, au-delà de laquelle un créneau unique n'est plus le bon objet.
  -- Le cahier annonce 20 à 45 minutes pour le Moment Signature : c'est une
  -- RECOMMANDATION DE FORMAT, pas une règle de base — la borner ici aurait
  -- interdit l'Atelier Duo de deux heures, qui partage la même colonne.
  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::regclass
       and con.conname = 'reservation_activities_duration_check'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_duration_check
      check (duration_minutes is null
             or duration_minutes between 10 and 240);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::regclass
       and con.conname = 'reservation_activities_steps_check'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_steps_check
      check (public.is_valid_experience_steps(steps));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::regclass
       and con.conname = 'reservation_activities_preparation_check'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_preparation_check
      check (preparation is null
             or pg_catalog.char_length(preparation) <= 600);
  end if;

  -- ── LES DEUX CONTRAINTES CONDITIONNELLES ──
  --
  -- Elles disent ce qu'un format EXIGE, là où les cinq précédentes disaient ce
  -- qu'une valeur a le droit d'être. Écrites en implication (`kind = 'standard'
  -- OR …`), elles ne contraignent QUE les formats concernés et laissent le
  -- socle existant strictement intact.
  --
  -- LA DURÉE EST EXIGÉE DES DEUX FORMATS NOUVEAUX. « 20-45 min » et « capacité
  -- par personne » sont des promesses faites au joueur AVANT qu'il réserve :
  -- une page immersive sans durée annoncée lui demande de s'engager sur une
  -- inconnue. Un `standard` s'en passe — il n'a pas de page immersive.
  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::regclass
       and con.conname = 'reservation_activities_experience_duration'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_experience_duration
      check (kind = 'standard' or duration_minutes is not null);
  end if;

  -- LES ÉTAPES SONT EXIGÉES DE LA SEULE `signature`. C'est SA définition —
  -- « présentée en trois étapes/cartes ». Le Duo, lui, dit sa préparation en
  -- prose : lui imposer trois cartes aurait été plaquer le format de l'un sur
  -- l'autre. Une à trois, jamais zéro : `is_valid_experience_steps` borne le
  -- haut, cette contrainte borne le bas ET la nullité.
  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::regclass
       and con.conname = 'reservation_activities_signature_steps'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_signature_steps
      check (kind <> 'signature'
             or (steps is not null
                 and pg_catalog.jsonb_array_length(steps) between 1 and 3));
  end if;
end;
$$;

comment on column public.reservation_activities.kind is
  'Format de l''expérience (RES-5) : `standard` (le socle, défaut), '
  '`signature` (Moment Signature — page immersive présentée en trois étapes) '
  'ou `duo` (Atelier Duo — un hôte réserve POUR DEUX). SEUL `duo` change '
  'l''arithmétique : sur lui, toute réservation vaut deux personnes, par les '
  'trois portes (publique, liste prioritaire, invitation). Aucun des trois ne '
  'porte de score, de classement ni de gain.';
comment on column public.reservation_activities.promise is
  'La phrase que le joueur lit avant de s''engager (≤ 200 caractères). '
  'Facultative ; purement présentation, aucune règle ne s''y appuie.';
comment on column public.reservation_activities.duration_minutes is
  'Durée annoncée, 10 à 240 minutes. EXIGÉE de `signature` et de `duo` — une '
  'page immersive sans durée demande au joueur de s''engager sur une inconnue. '
  'C''est une PROMESSE D''AFFICHAGE : la durée réelle du créneau reste '
  '`ends_at - starts_at`, et rien ne les force à coïncider (un atelier de 45 '
  'min peut occuper un créneau d''une heure, accueil compris).';
comment on column public.reservation_activities.steps is
  'Les trois cartes du Moment Signature : tableau d''au plus trois objets '
  '`{title, body}`, validé par is_valid_experience_steps. EXIGÉ (1 à 3) de '
  '`signature`, `null` accepté partout ailleurs.';
comment on column public.reservation_activities.preparation is
  'Ce qu''il faut savoir avant de venir (≤ 600 caractères) — la « préparation » '
  'du Moment Signature ET les « instructions » de l''Atelier Duo, qui sont la '
  'même chose dite au même moment. Une seule colonne, délibérément : deux '
  'auraient créé deux endroits où écrire la même phrase.';


-- ────────────────────────────────────────────────────────────
-- 3. `reservations.party_size` — la place se compte en PERSONNES
--
-- 1 PAR DÉFAUT, NOT NULL, BORNÉ À 2. Le défaut est ce qui rend la colonne
-- rétrocompatible sans écriture : PostgreSQL 11+ pose un défaut de colonne sans
-- réécrire la table, et toutes les réservations existantes valent une personne
-- — ce qu'elles ont toujours voulu dire.
--
-- LA BORNE HAUTE EST DANS LA BASE, pas seulement dans les RPC. Les RPC
-- décident qui a le droit de réserver à deux ; la contrainte, elle, garantit
-- qu'AUCUN chemin — pas même un correctif écrit un soir en SQL — n'inscrira un
-- groupe de 40 sur un créneau de 4. C'est le motif du socle : la capacité n'est
-- pas contournable par la forme de l'appel.
-- ────────────────────────────────────────────────────────────

alter table public.reservations
  add column if not exists party_size integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservations'::regclass
       and con.conname = 'reservations_party_size_bound'
  ) then
    alter table public.reservations
      add constraint reservations_party_size_bound
      check (party_size between 1 and 2);
  end if;
end;
$$;

comment on column public.reservations.party_size is
  'Nombre de PERSONNES que cette réservation occupe sur le créneau (RES-5). '
  '1 partout, sauf sur une activité `duo` où toute réservation vaut 2 — un '
  'hôte et son accompagnant, sur UNE ligne et UN code de comptoir. Borné à '
  '1..2 PAR LA BASE : au MVP le duo est la seule taille plurielle. TOUS les '
  'comptages de capacité du module somment cette colonne au lieu de compter '
  'des lignes ; compter des lignes aurait laissé deux hôtes remplir un atelier '
  'de deux places avec quatre personnes.';


-- ────────────────────────────────────────────────────────────
-- 4. Les privilèges de colonnes
--
-- ADDITIFS, motif `waitlist_offer_minutes` (L5) et `wait_quiz_id` (L7) : aucun
-- grant existant n'est repris ni élargi.
--
-- `party_size` EN LECTURE SEULE POUR L'ÉDITEUR, et c'est délibéré. Il rejoint
-- la liste blanche de `select` — sans elle, l'agenda du commerçant afficherait
-- « 3 réservations » sur un atelier plein à 6 personnes, et le calcul de places
-- restantes du tableau de bord (`src/lib/reserver-context.ts`) ne pourrait pas
-- sommer ce qu'il ne peut pas lire. Il n'entre NI en `insert` NI en `update` :
-- la table `reservations` n'a aucune policy d'écriture depuis le socle, et la
-- taille d'une réservation se décide sous le verrou, dans `reserve_slot`.
-- ────────────────────────────────────────────────────────────

grant select (party_size) on public.reservations to authenticated;

grant insert (kind, promise, duration_minutes, steps, preparation)
  on public.reservation_activities to authenticated;
grant update (kind, promise, duration_minutes, steps, preparation)
  on public.reservation_activities to authenticated;


-- ────────────────────────────────────────────────────────────
-- 5. `reservation_offer_next` — l'offre repart par PAIRES sur un duo
--
-- CORPS DE 20261004120000 (section 7) RECOPIÉ, avec le seul changement d'unité :
--
--   * `v_taken` somme `party_size` au lieu de compter des lignes ;
--   * `v_held` compte les offres vivantes ET LES MULTIPLIE PAR `v_seats` — une
--     offre sur un Atelier Duo tient DEUX places, puisque sa conversion en
--     prendra deux ;
--   * le nombre d'offres à créer est `v_free / v_seats`, division ENTIÈRE : sur
--     un duo, une place libre esseulée ne se propose à personne, parce que
--     personne ne pourrait la prendre.
--
-- SUR UNE ACTIVITÉ NON-DUO `v_seats` VAUT 1 et les trois formules redeviennent
-- mot pour mot celles d'hier. La boucle garde sa borne et sa terminaison : le
-- nombre d'offres est calculé UNE FOIS sous le verrou et chaque tour consomme
-- une entrée `waiting` distincte.
--
-- LE FORMAT EST LU DANS LA REQUÊTE QUI LISAIT DÉJÀ `active` : une colonne de
-- plus, pas une lecture de plus.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservation_offer_next(
  p_organization_id uuid,
  p_slot_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.reservation_slots%rowtype;
  v_activity_active boolean;
  v_kind text;
  v_seats integer;
  v_taken integer;
  v_held integer;
  v_free integer;
  v_offers integer;
  v_minutes integer;
  v_deadline timestamptz;
  v_entry_id uuid;
  v_created integer := 0;
  i integer;
begin
  -- (1) LA COMPTABILITÉ D'ABORD, SANS CONDITION.
  update public.reservation_waitlist_entries w
     set status = 'expired',
         expired_at = pg_catalog.now()
   where w.slot_id = p_slot_id
     and w.organization_id = p_organization_id
     and w.status = 'offered'
     and w.offer_expires_at <= pg_catalog.now();

  select s.* into v_slot
    from public.reservation_slots s
   where s.id = p_slot_id
     and s.organization_id = p_organization_id;
  if not found then
    return 0;
  end if;

  -- (2) LES CONDITIONS COMMERCIALES. Mêmes quatre que `reserve_slot`, moins
  -- l'existence du créneau déjà tranchée ci-dessus.
  select a.active, a.kind into v_activity_active, v_kind
    from public.reservation_activities a
   where a.id = v_slot.activity_id
     and a.organization_id = v_slot.organization_id;

  if not coalesce(v_activity_active, false)
     or v_slot.status <> 'open'
     or v_slot.starts_at <= pg_catalog.now()
     or not public.org_has_module_access(v_slot.organization_id, 'vitrine')
  then
    return 0;
  end if;

  -- L'UNITÉ DE RÉSERVATION DE CE FORMAT. Une seule expression, ici et dans les
  -- quatre autres RPC — c'est ce qui garantit que les cinq comptent pareil.
  v_seats := case when v_kind = 'duo' then 2 else 1 end;

  -- LES DEUX TERMES DU COMPTAGE, EN PERSONNES. `v_taken` somme les places
  -- réellement occupées ; `v_held` compte les offres vivantes — l'échéance y
  -- est comparée à `now()`, ce qui rend la place récupérable sans attendre le
  -- balayage — et les convertit en personnes.
  select coalesce(pg_catalog.sum(r.party_size), 0)::integer into v_taken
    from public.reservations r
   where r.slot_id = p_slot_id
     and r.status in ('confirmed', 'checked_in');

  select (pg_catalog.count(*)::integer * v_seats) into v_held
    from public.reservation_waitlist_entries w
   where w.slot_id = p_slot_id
     and w.status = 'offered'
     and w.offer_expires_at > pg_catalog.now();

  v_free := v_slot.capacity - v_taken - v_held;
  -- `< v_seats` ET NON `<= 0` : sur un Atelier Duo, une place libre isolée
  -- n'est pas une place proposable. La proposer aurait fait sonner un
  -- téléphone pour une offre que `claim_waitlist_offer` ne pourrait honorer
  -- sans sur-réserver.
  if v_free < v_seats then
    return 0;
  end if;

  -- DIVISION ENTIÈRE, et c'est la borne de la boucle : autant d'offres que de
  -- réservations complètes qui tiennent dans la place libre.
  v_offers := v_free / v_seats;

  -- LA FENÊTRE, PLAFONNÉE AU DÉBUT DU CRÉNEAU. `least` reste NON qualifié :
  -- ce n'est pas une fonction du catalogue mais un nœud du parseur, et le
  -- préfixer échouerait À L'EXÉCUTION seulement (garde sql:check).
  v_minutes := coalesce(v_slot.waitlist_offer_minutes, 120);
  v_deadline := least(
    pg_catalog.now() + pg_catalog.make_interval(mins => v_minutes),
    v_slot.starts_at
  );

  for i in 1..v_offers loop
    select w.id into v_entry_id
      from public.reservation_waitlist_entries w
     where w.slot_id = p_slot_id
       and w.organization_id = p_organization_id
       and w.status = 'waiting'
       -- UNE ENTRÉE PURGÉE NE REÇOIT PLUS D'OFFRE (revue de sécurité L5, I-4).
       and w.player_key_hash not like 'purge:%'
     order by w.created_at, w.id
     limit 1;
    exit when v_entry_id is null;

    update public.reservation_waitlist_entries
       set status = 'offered',
           offered_at = pg_catalog.now(),
           offer_expires_at = v_deadline
     where id = v_entry_id;

    v_created := v_created + 1;
    v_entry_id := null;
  end loop;

  return v_created;
end;
$$;

comment on function public.reservation_offer_next(uuid, uuid) is
  'Fait avancer la liste prioritaire d''UN créneau : marque expirées les offres '
  'échues (toujours), puis propose la ou les places réellement libres aux '
  'premiers `waiting` NON PURGÉS (seulement si le créneau est ouvert, à venir, '
  'd''une activité active et d''une organisation portant le droit `vitrine`). '
  'COMPTE EN PERSONNES depuis RES-5 : les places prises somment '
  '`reservations.party_size`, et une offre tient l''unité de réservation du '
  'format — DEUX places sur une activité `duo`. Le nombre d''offres créées est '
  'donc `places libres / unité`, en division ENTIÈRE : sur un Atelier Duo, une '
  'place libre isolée n''est proposée à personne, faute de pouvoir être prise. '
  'INVARIANT TENU : personnes réservées + personnes tenues <= capacité. '
  'SUPPOSE QUE L''APPELANT DÉTIENT DÉJÀ le verrou d''avis (organisation + '
  'créneau) : elle ne le prend pas, pour que son comptage soit dans le même '
  'instantané que celui de son appelant. N''est grantée à personne — pas même '
  'service_role. Rend le nombre d''offres créées.';

-- AUCUN grant, et c'est la protection elle-même. `service_role` EST DANS LA
-- LISTE : les privilèges par défaut de Supabase le serviraient sur toute
-- fonction neuve de `public`. `create or replace` conserve les privilèges de la
-- fonction existante, donc ce `revoke` ne fait ici que réénoncer l'état voulu —
-- il est reposé pour que le fichier reste juste sur une base fraîche.
revoke all on function public.reservation_offer_next(uuid, uuid)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 6. `reserve_slot` — la jauge apprend à compter des personnes
--
-- ── POURQUOI UN `drop` ICI, ALORS QUE LE TYPE DE RETOUR NE CHANGE PAS ──
--
-- La leçon de L3 (20261002120000, section 5 bis), et elle vaut à l'envers.
-- `p_party_size` a beau porter un défaut, l'ancienne signature à cinq arguments
-- NE DISPARAÎT PAS d''un `create or replace` : PostgreSQL distingue les
-- fonctions par leurs types d''arguments. Les deux auraient coexisté, et un
-- appel à cinq arguments — celui que L4 fait aujourd''hui — serait devenu
-- AMBIGU entre l''ancienne (exacte) et la nouvelle (par défaut), donc une
-- erreur « function is not unique » à l''exécution. Pire s''il avait résolu :
-- l''ancienne n''aurait vu passer AUCUNE règle de format, et un Atelier Duo se
-- serait réservé à une personne par la seule FORME de l''appel.
--
-- Aucun `cascade` : rien ne dépend de cette fonction, et une dépendance
-- inattendue doit faire échouer la migration, pas disparaître avec elle.
--
-- ── CE QUE LA RÈGLE DE TAILLE DIT, EN UNE ÉGALITÉ ──
--
-- `p_party_size <> v_seats` couvre les deux refus du cahier d''un seul test :
-- deux personnes sur une activité qui n''est pas un duo, et une seule personne
-- sur un Atelier Duo. Les écrire séparément aurait donné deux conditions à
-- tenir d''accord pour une seule règle — « la taille de la réservation est
-- celle du format ».
--
-- ET C'EST UN REFUS NOMMÉ, pas un `unavailable` muet. Les six refus muets de
-- `reserve_slot` protègent un ORACLE : ils empêchent de découvrir l''existence
-- d''un créneau, d''une activité ou d''un abonnement. Le format, lui, est
-- PUBLIC — il est écrit sur la page que le joueur vient de lire. Le taire
-- n''aurait rien caché et aurait rendu l''écran incapable de dire « cet atelier
-- se réserve à deux ».
-- ────────────────────────────────────────────────────────────

drop function if exists public.reserve_slot(uuid, uuid, text, text, boolean);

create or replace function public.reserve_slot(
  p_organization_id uuid,
  p_slot_id uuid,
  p_player_key_hash text,
  p_email text default null,
  p_consent boolean default false,
  p_party_size integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.reservation_slots%rowtype;
  v_activity_active boolean;
  v_kind text;
  v_seats integer;
  v_existing public.reservations%rowtype;
  v_email text;
  v_taken integer;
  v_held integer;
  v_row public.reservations%rowtype;
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
  -- GARDE DE FORME, au même rang que les deux précédentes et pour la même
  -- raison : hors de 1..2, c'est un bogue d'appelant, pas un choix de joueur.
  -- La contrainte de table refuserait de toute façon la ligne, mais avec une
  -- erreur que personne ne saurait rattacher à son origine.
  if p_party_size is null or p_party_size not between 1 and 2 then
    raise exception 'invalid party size' using errcode = '22023';
  end if;

  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null
     and (pg_catalog.char_length(v_email) > 254
          or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  then
    return pg_catalog.jsonb_build_object('state', 'invalid_email');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_slot:' || p_organization_id::text || ':' || p_slot_id::text,
      0)
  );

  select s.* into v_slot
    from public.reservation_slots s
   where s.id = p_slot_id
     and s.organization_id = p_organization_id;

  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select a.active, a.kind into v_activity_active, v_kind
    from public.reservation_activities a
   where a.id = v_slot.activity_id
     and a.organization_id = v_slot.organization_id;

  if not coalesce(v_activity_active, false)
     or v_slot.status <> 'open'
     or v_slot.starts_at <= pg_catalog.now()
     or not public.org_has_module_access(v_slot.organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_seats := case when v_kind = 'duo' then 2 else 1 end;

  -- LA TAILLE EST CELLE DU FORMAT — voir l'en-tête. Ce refus vient APRÈS les
  -- six muets : il ne doit rien révéler d'un créneau qu'on n'aurait pas eu le
  -- droit de voir.
  if p_party_size <> v_seats then
    return pg_catalog.jsonb_build_object(
      'state', 'invalid_party_size',
      'expected', v_seats
    );
  end if;

  -- IDEMPOTENCE AVANT CAPACITÉ, comme dans le socle : un joueur déjà inscrit sur
  -- un créneau devenu complet doit retrouver sa réservation, pas s'entendre dire
  -- « complet » sur sa propre place. `party_size` sort avec elle : l'hôte d'un
  -- duo qui recharge sa page doit relire « pour deux ».
  select r.* into v_existing
    from public.reservations r
   where r.slot_id = p_slot_id
     and r.player_key_hash = p_player_key_hash
     and r.status in ('confirmed', 'checked_in');
  if found then
    return pg_catalog.jsonb_build_object(
      'state', 'already_reserved',
      'reservation_id', v_existing.id,
      'code', v_existing.code,
      'status', v_existing.status,
      'party_size', v_existing.party_size
    );
  end if;

  -- LE COMPTAGE, EN PERSONNES (RES-5). `sum` et non `count` : sur un Atelier
  -- Duo, trois lignes valent six personnes.
  select coalesce(pg_catalog.sum(r.party_size), 0)::integer into v_taken
    from public.reservations r
   where r.slot_id = p_slot_id
     and r.status in ('confirmed', 'checked_in');

  -- LE SECOND TERME (RES-2), CONVERTI EN PERSONNES (RES-5). Une offre dont
  -- l'échéance est passée ne tient plus rien : la comparer à `now()` est ce qui
  -- rend la place récupérable par le public dès la seconde qui suit, sans
  -- attendre le balayage.
  select (pg_catalog.count(*)::integer * v_seats) into v_held
    from public.reservation_waitlist_entries w
   where w.slot_id = p_slot_id
     and w.status = 'offered'
     and w.offer_expires_at > pg_catalog.now();

  -- LA JAUGE TESTE LA DEMANDE, PAS SEULEMENT L'ÉTAT. `+ v_seats` est ce qui
  -- rend le duo ATOMIQUE : sur un atelier de trois places dont deux sont
  -- prises, `2 + 0 + 2 > 3` refuse — le second duo ne prend pas la moitié de ce
  -- qu'il demande. Avec `v_seats = 1` la formule est celle d'hier, au caractère
  -- près (`v_taken + v_held + 1 > capacity` ⟺ `v_taken + v_held >= capacity`).
  if v_taken + v_held + v_seats > v_slot.capacity then
    return pg_catalog.jsonb_build_object(
      'state', 'full',
      'capacity', v_slot.capacity
    );
  end if;

  insert into public.reservations (
    slot_id, organization_id, player_key_hash, email, consent_transactional_at,
    party_size
  ) values (
    v_slot.id,
    v_slot.organization_id,
    p_player_key_hash,
    case when coalesce(p_consent, false) then v_email end,
    case when coalesce(p_consent, false) and v_email is not null
         then pg_catalog.now() end,
    -- `v_seats`, PAS `p_party_size` : les deux sont égaux (le test ci-dessus
    -- vient de le vérifier), et écrire celui qui vient du FORMAT plutôt que
    -- celui qui vient de l'appelant met la valeur de la base hors de portée de
    -- l'appel.
    v_seats
  )
  returning * into v_row;

  return pg_catalog.jsonb_build_object(
    'state', 'reserved',
    'reservation_id', v_row.id,
    'code', v_row.code,
    'starts_at', v_slot.starts_at,
    'ends_at', v_slot.ends_at,
    'party_size', v_row.party_size,
    'remaining', v_slot.capacity - (v_taken + v_seats) - v_held
  );
end;
$$;

comment on function public.reserve_slot(uuid, uuid, text, text, boolean, integer) is
  'Prend une place sur un créneau, DANS UNE ORGANISATION DONNÉE. Atomique '
  '(verrou d''avis sur le créneau, puis lecture du créneau ET comptage sous ce '
  'verrou) et idempotente (`already_reserved` rend le code, le statut et la '
  'taille existants). LE COMPTAGE SE FAIT EN PERSONNES depuis RES-5 : les '
  'réservations vivantes SOMMENT `party_size` — `confirmed` et `checked_in`, le '
  'check-in ne libère rien — et les OFFRES DE LISTE PRIORITAIRE ENCORE TENUES '
  'valent l''unité de réservation du format. Une offre échue ne compte plus, '
  'même avant le balayage. `p_party_size` DOIT ÉGALER l''unité du format — 2 '
  'sur une activité `duo`, 1 partout ailleurs — sans quoi le refus est '
  '`invalid_party_size` (nommé, et non muet : le format est écrit sur la page '
  'publique, le taire ne cacherait rien). La jauge teste la DEMANDE ENTIÈRE : '
  'un duo ne prend jamais la moitié de ce qu''il demande. Refuse `full` à '
  'capacité atteinte, `invalid_email` sur une adresse malformée ou de plus de '
  '254 caractères, et `unavailable` — indistinctement — pour un créneau '
  'inexistant, d''une AUTRE organisation, une activité coupée, un créneau non '
  'ouvert ou passé, et une organisation sans le droit `vitrine`. '
  'L''adresse n''est stockée QUE si `p_consent`.';

revoke all on function public.reserve_slot(uuid, uuid, text, text, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_slot(uuid, uuid, text, text, boolean, integer)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 7. `waitlist_join` — « réellement complet » se dit aussi en personnes
--
-- CORPS DE 20261004120000 (section 10) RECOPIÉ. Deux changements, tous deux
-- dans le seul test qui regarde la capacité :
--
--   * `v_taken` somme, `v_held` se convertit — comme partout ;
--   * le test « il reste de la place » devient « il reste DE QUOI RÉSERVER » :
--     `v_taken + v_held + v_seats <= capacity`. Sur un Atelier Duo dont il
--     reste UNE place, la file s'ouvre — cette place n'est prenable par
--     personne, et renvoyer le joueur vers `reserve_slot` l'aurait envoyé se
--     faire refuser.
--
-- LE PLAFOND DE LA FILE NE CHANGE PAS, et c'est délibéré. Il compte des LIGNES
-- (`least(greatest(2 × capacité, 4), 50)`) parce qu'il borne un stockage de
-- données personnelles et une longueur de file annoncée — deux choses qui se
-- comptent en personnes inscrites, pas en places convoitées. Le convertir en
-- personnes aurait divisé la file d'un Atelier Duo par deux sans raison.
-- ────────────────────────────────────────────────────────────

create or replace function public.waitlist_join(
  p_organization_id uuid,
  p_slot_id uuid,
  p_player_key_hash text,
  p_email text default null,
  p_consent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.reservation_slots%rowtype;
  v_activity_active boolean;
  v_kind text;
  v_seats integer;
  v_existing public.reservations%rowtype;
  v_entry public.reservation_waitlist_entries%rowtype;
  v_email text;
  v_taken integer;
  v_held integer;
  v_live integer;
  v_plafond integer;
  v_position integer;
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

  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null
     and (pg_catalog.char_length(v_email) > 254
          or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  then
    return pg_catalog.jsonb_build_object('state', 'invalid_email');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_slot:' || p_organization_id::text || ':' || p_slot_id::text,
      0)
  );

  select s.* into v_slot
    from public.reservation_slots s
   where s.id = p_slot_id
     and s.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select a.active, a.kind into v_activity_active, v_kind
    from public.reservation_activities a
   where a.id = v_slot.activity_id
     and a.organization_id = v_slot.organization_id;

  -- LES SIX MÊMES REFUS QUE `reserve_slot`, sous le même état muet : la liste
  -- d'attente ne doit pas devenir l'oracle que la réservation refuse d'être.
  if not coalesce(v_activity_active, false)
     or v_slot.status <> 'open'
     or v_slot.starts_at <= pg_catalog.now()
     or not public.org_has_module_access(v_slot.organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_seats := case when v_kind = 'duo' then 2 else 1 end;

  -- IDEMPOTENCE #1 — il détient déjà une place.
  select r.* into v_existing
    from public.reservations r
   where r.slot_id = p_slot_id
     and r.player_key_hash = p_player_key_hash
     and r.status in ('confirmed', 'checked_in');
  if found then
    return pg_catalog.jsonb_build_object(
      'state', 'already_reserved',
      'reservation_id', v_existing.id,
      'code', v_existing.code,
      'status', v_existing.status,
      'party_size', v_existing.party_size
    );
  end if;

  -- IDEMPOTENCE #2 — il est déjà dans la file. Rendre son rang plutôt qu'une
  -- erreur : un double clic ou un rechargement ne doit pas ressembler à un
  -- refus. L'index unique partiel refuserait de toute façon la seconde ligne.
  select w.* into v_entry
    from public.reservation_waitlist_entries w
   where w.slot_id = p_slot_id
     and w.player_key_hash = p_player_key_hash
     and w.status in ('waiting', 'offered');
  if found then
    select pg_catalog.count(*)::integer + 1 into v_position
      from public.reservation_waitlist_entries w2
     where w2.slot_id = p_slot_id
       and w2.status in ('waiting', 'offered')
       and (w2.created_at, w2.id) < (v_entry.created_at, v_entry.id);
    return pg_catalog.jsonb_build_object(
      'state', 'already_waiting',
      'entry_id', v_entry.id,
      'status', v_entry.status,
      'position', v_position,
      'offer_expires_at', v_entry.offer_expires_at
    );
  end if;

  -- LE CRÉNEAU DOIT ÊTRE RÉELLEMENT COMPLET — offres tenues comprises, ET AU
  -- SENS DE CE QUE L'ON PEUT Y RÉSERVER (RES-5). Sur un créneau où une
  -- réservation entière tient encore, la réponse est `not_full` et le joueur
  -- est renvoyé vers `reserve_slot` : entrer dans une file pour une place libre
  -- serait une attente inventée.
  select coalesce(pg_catalog.sum(r.party_size), 0)::integer into v_taken
    from public.reservations r
   where r.slot_id = p_slot_id
     and r.status in ('confirmed', 'checked_in');
  select (pg_catalog.count(*)::integer * v_seats) into v_held
    from public.reservation_waitlist_entries w
   where w.slot_id = p_slot_id
     and w.status = 'offered'
     and w.offer_expires_at > pg_catalog.now();

  if v_taken + v_held + v_seats <= v_slot.capacity then
    return pg_catalog.jsonb_build_object(
      'state', 'not_full',
      -- `remaining` reste un nombre de PERSONNES : c'est ce que l'écran
      -- affiche (« il reste 3 places »), et il peut donc valoir 1 sur un
      -- Atelier Duo qui vient pourtant de rendre `not_full` faux. Les deux
      -- disent vrai — l'un compte des places, l'autre des réservations
      -- possibles.
      'remaining', v_slot.capacity - v_taken - v_held
    );
  end if;

  -- ── LA FILE A UN PLAFOND (revue de sécurité L5, E-1a) ──
  -- Il compte des LIGNES, pas des personnes — voir l'en-tête de cette section.
  -- ON COMPTE LE MÊME ENSEMBLE QUE L'INDEX UNIQUE PARTIEL `…_live_idx` —
  -- `waiting` ET `offered`, sans regarder l'échéance : le plafond ne doit pas
  -- dépendre de la ponctualité d'un cron.
  select pg_catalog.count(*)::integer into v_live
    from public.reservation_waitlist_entries w
   where w.slot_id = p_slot_id
     and w.status in ('waiting', 'offered');

  v_plafond := least(greatest(2 * v_slot.capacity, 4), 50);

  if v_live >= v_plafond then
    return pg_catalog.jsonb_build_object(
      'state', 'waitlist_full',
      'capacity', v_plafond
    );
  end if;

  insert into public.reservation_waitlist_entries (
    slot_id, organization_id, player_key_hash, email, consent_transactional_at
  ) values (
    v_slot.id,
    v_slot.organization_id,
    p_player_key_hash,
    case when coalesce(p_consent, false) then v_email end,
    case when coalesce(p_consent, false) and v_email is not null
         then pg_catalog.now() end
  )
  returning * into v_entry;

  select pg_catalog.count(*)::integer into v_position
    from public.reservation_waitlist_entries w2
   where w2.slot_id = p_slot_id
     and w2.status in ('waiting', 'offered');

  return pg_catalog.jsonb_build_object(
    'state', 'waiting',
    'entry_id', v_entry.id,
    'status', v_entry.status,
    'position', v_position,
    'offer_expires_at', null
  );
end;
$$;

comment on function public.waitlist_join(uuid, uuid, text, text, boolean) is
  'Inscrit une identité pseudonyme sur la liste prioritaire d''un créneau '
  'COMPLET (RES-2). Mêmes gardes SQL que reserve_slot — organisation exigée, '
  'forme de l''empreinte, forme et longueur de l''adresse, droit `vitrine` — et '
  'MÊME état muet `unavailable` pour les six refus, afin que la file ne devienne '
  'pas l''oracle que la réservation refuse d''être. « COMPLET » SE DIT EN '
  'RÉSERVATIONS POSSIBLES depuis RES-5 : la file s''ouvre dès qu''une '
  'réservation entière ne tient plus — donc sur un Atelier Duo à qui il reste '
  'UNE place, que personne ne pourrait prendre. `not_full` rend le nombre de '
  'PLACES restantes, qui peut donc valoir 1 dans ce cas. PLAFONNE la file à '
  '`least(greatest(2 × capacité, 4), 50)` entrées VIVANTES — des LIGNES, pas '
  'des personnes : ce plafond borne un stockage de données personnelles et une '
  'longueur de file annoncée — et rend alors `waitlist_full`. Idempotente deux '
  'fois : `already_reserved` (avec la taille) si l''identité détient déjà une '
  'place, `already_waiting` avec son RANG si elle est déjà dans la file. Le '
  'rang est déduit de l''ordre d''inscription, jamais stocké. L''adresse n''est '
  'conservée QUE si `p_consent`.';

revoke all on function public.waitlist_join(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.waitlist_join(uuid, uuid, text, text, boolean)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 8. `claim_waitlist_offer` — l'offre devient une réservation ENTIÈRE
--
-- CORPS DE 20261004120000 RECOPIÉ. UN SEUL changement : la ligne créée porte
-- `party_size = v_seats`.
--
-- ELLE NE REPASSE TOUJOURS PAS PAR LA JAUGE, et c'est précisément pourquoi
-- l'uniformité de l'unité était indispensable. La place est déjà tenue pour
-- cette personne — `reserve_slot`, `waitlist_join` et `reservation_offer_next`
-- la comptent comme occupée depuis que l'offre existe, ET POUR LE BON NOMBRE DE
-- PERSONNES puisque les trois multiplient par la même unité. Si la conversion
-- avait créé une réservation d'UNE personne là où l'offre en tenait DEUX, le
-- créneau se serait sur-réservé par le seul chemin qui ne vérifie rien.
-- ────────────────────────────────────────────────────────────

create or replace function public.claim_waitlist_offer(
  p_organization_id uuid,
  p_entry_id uuid,
  p_player_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_id uuid;
  v_entry public.reservation_waitlist_entries%rowtype;
  v_slot public.reservation_slots%rowtype;
  v_activity_active boolean;
  v_kind text;
  v_seats integer;
  v_existing public.reservations%rowtype;
  v_row public.reservations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  -- Cette garde de forme est aussi ce qui rend une entrée PURGÉE inatteignable :
  -- son empreinte vaut alors `purge:<id>`, qui ne franchit pas ce filtre.
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  -- Lecture SANS verrou, pour connaître le créneau — l'autre moitié de la clé.
  select w.slot_id into v_slot_id
    from public.reservation_waitlist_entries w
   where w.id = p_entry_id
     and w.organization_id = p_organization_id
     and w.player_key_hash = p_player_key_hash;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_slot:' || p_organization_id::text || ':' || v_slot_id::text,
      0)
  );

  select w.* into v_entry
    from public.reservation_waitlist_entries w
   where w.id = p_entry_id
     and w.organization_id = p_organization_id
     and w.player_key_hash = p_player_key_hash;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- IDEMPOTENCE : déjà converti, on rend LA MÊME réservation et le MÊME code.
  if v_entry.status = 'converted' then
    select r.* into v_existing
      from public.reservations r
     where r.id = v_entry.converted_reservation_id;
    return pg_catalog.jsonb_build_object(
      'state', 'claimed',
      'entry_id', v_entry.id,
      'reservation_id', v_existing.id,
      'code', v_existing.code,
      'status', v_existing.status,
      'party_size', v_existing.party_size
    );
  end if;

  if v_entry.status <> 'offered' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE REFUS PARESSEUX. Il ne dépend d'aucun balayage.
  if v_entry.offer_expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object(
      'state', 'expired',
      'entry_id', v_entry.id,
      'offer_expires_at', v_entry.offer_expires_at
    );
  end if;

  select s.* into v_slot
    from public.reservation_slots s
   where s.id = v_entry.slot_id
     and s.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select a.active, a.kind into v_activity_active, v_kind
    from public.reservation_activities a
   where a.id = v_slot.activity_id
     and a.organization_id = v_slot.organization_id;

  -- `not in ('open', 'closed')` PLUTÔT QUE `= 'draft'` : la formule est
  -- recopiée de `redeem_invitation`, et elle est celle qui survit à l'ajout
  -- d'un quatrième statut.
  if not coalesce(v_activity_active, false)
     or v_slot.status not in ('open', 'closed')
     or v_slot.starts_at <= pg_catalog.now()
     or not public.org_has_module_access(v_slot.organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_seats := case when v_kind = 'duo' then 2 else 1 end;

  -- CEINTURE : l'identité détient-elle DÉJÀ une place sur ce créneau ?
  select r.* into v_existing
    from public.reservations r
   where r.slot_id = v_entry.slot_id
     and r.player_key_hash = p_player_key_hash
     and r.status in ('confirmed', 'checked_in');
  if found then
    update public.reservation_waitlist_entries
       set status = 'converted',
           converted_at = pg_catalog.now(),
           converted_reservation_id = v_existing.id
     where id = v_entry.id;
    return pg_catalog.jsonb_build_object(
      'state', 'claimed',
      'entry_id', v_entry.id,
      'reservation_id', v_existing.id,
      'code', v_existing.code,
      'status', v_existing.status,
      'party_size', v_existing.party_size
    );
  end if;

  -- L'ADRESSE ET SON CONSENTEMENT SONT REPRIS DE L'ENTRÉE DE LISTE.
  insert into public.reservations (
    slot_id, organization_id, player_key_hash, email, consent_transactional_at,
    party_size
  ) values (
    v_entry.slot_id,
    v_entry.organization_id,
    p_player_key_hash,
    v_entry.email,
    v_entry.consent_transactional_at,
    -- L'UNITÉ DU FORMAT, exactement ce que l'offre tenait. Voir l'en-tête :
    -- c'est ce qui autorise cette fonction à ne pas retester la capacité.
    v_seats
  )
  returning * into v_row;

  update public.reservation_waitlist_entries
     set status = 'converted',
         converted_at = pg_catalog.now(),
         converted_reservation_id = v_row.id
   where id = v_entry.id;

  return pg_catalog.jsonb_build_object(
    'state', 'claimed',
    'entry_id', v_entry.id,
    'reservation_id', v_row.id,
    'code', v_row.code,
    'status', v_row.status,
    'party_size', v_row.party_size,
    'starts_at', v_slot.starts_at,
    'ends_at', v_slot.ends_at
  );
end;
$$;

comment on function public.claim_waitlist_offer(uuid, uuid, text) is
  'Convertit une offre de liste prioritaire VIVANTE en réservation confirmée '
  '(RES-2), sur preuve de possession (identifiant d''entrée + empreinte du '
  'cookie). NE REPASSE PAS PAR LA JAUGE PUBLIQUE : la place est déjà comptée '
  'comme tenue par reserve_slot, waitlist_join et reservation_offer_next depuis '
  'l''émission de l''offre — la retester ici la compterait deux fois et aucune '
  'offre ne serait jamais honorable. LA RÉSERVATION CRÉÉE PORTE L''UNITÉ DU '
  'FORMAT (RES-5) : deux personnes sur une activité `duo`, exactement ce que '
  'l''offre tenait — c''est cette égalité qui permet de ne pas retester. Refuse '
  '`expired` dès que l''échéance est passée, MÊME SI LE BALAYAGE N''EST PAS '
  'PASSÉ (refus paresseux), `unavailable` sur une entrée sans offre en cours, '
  'un créneau commencé, une activité coupée ou une organisation sans droit '
  '`vitrine`, et `unknown` — indistinctement — pour une entrée inconnue, d''une '
  'AUTRE organisation ou d''une autre identité. Idempotente : rejouée, elle rend '
  'la même réservation et le même code. Le créneau `draft` est REFUSÉ et le '
  'créneau `closed` ACCEPTÉ, même arbitrage que redeem_invitation.';

revoke all on function public.claim_waitlist_offer(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_waitlist_offer(uuid, uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 9. `redeem_invitation` — l'invitation aussi compte en personnes
--
-- CORPS DE 20261004120000 (section 12) RECOPIÉ. Mêmes trois changements que
-- `reserve_slot` : `v_taken` somme, `v_held` se convertit, la jauge teste la
-- demande entière — et la ligne créée porte l'unité du format.
--
-- L'INVITÉ D'UN ATELIER DUO VIENT DONC À DEUX, SANS AVOIR À LE DIRE. C'est le
-- même arbitrage que pour la liste prioritaire : la taille est une propriété
-- du format, pas un choix de l'invité, et la lui demander aurait ouvert un
-- second chemin par lequel un Atelier Duo se réserve à une personne.
-- `used_count` compte des USAGES D'INVITATION, pas des personnes : une
-- invitation « 5 places » sur un Atelier Duo ouvre cinq duos, ce qui est ce que
-- le commerçant a écrit — cinq fois « quelqu'un peut venir ».
-- ────────────────────────────────────────────────────────────

create or replace function public.redeem_invitation(
  p_organization_id uuid,
  p_token_hash text,
  p_player_key_hash text,
  p_slot_id uuid default null,
  p_email text default null,
  p_consent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.reservation_invitations%rowtype;
  v_slot public.reservation_slots%rowtype;
  v_target_slot uuid;
  v_activity_active boolean;
  v_activity_name text;
  v_kind text;
  v_seats integer;
  v_existing public.reservations%rowtype;
  v_email text;
  v_taken integer;
  v_held integer;
  v_used integer;
  v_row public.reservations%rowtype;
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
  -- Empreinte produite par l'application : malformée = bogue d'appelant.
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash' using errcode = '22023';
  end if;

  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null
     and (pg_catalog.char_length(v_email) > 254
          or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  then
    return pg_catalog.jsonb_build_object('state', 'invalid_email');
  end if;

  -- Lecture HORS VERROU pour connaître la cible — l'autre moitié de la clé.
  -- ORG-SCOPÉE : c'est ce filtre qui rend « autre organisation » et « inconnu »
  -- indistinguables. Rien n'est décidé ici, tout est relu sous le verrou.
  select i.* into v_inv
    from public.reservation_invitations i
   where i.organization_id = p_organization_id
     and i.token_hash = p_token_hash;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_target_slot := coalesce(v_inv.slot_id, p_slot_id);
  if v_target_slot is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_slot:' || p_organization_id::text || ':' || v_target_slot::text,
      0)
  );

  -- RELECTURE SOUS VERROU, et `for update` : c'est ce qui rend l'incrément de
  -- `used_count` atomique.
  select i.* into v_inv
    from public.reservation_invitations i
   where i.organization_id = p_organization_id
     and i.token_hash = p_token_hash
     for update;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LES QUATRE INTERRUPTEURS DE L'INVITATION, muets.
  if v_inv.revoked_at is not null
     or v_inv.closed_at is not null
     or (v_inv.expires_at is not null and v_inv.expires_at <= pg_catalog.now())
     or v_inv.used_count >= v_inv.max_uses
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select s.* into v_slot
    from public.reservation_slots s
   where s.id = v_target_slot
     and s.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LA CIBLE DOIT CORRESPONDRE.
  if v_inv.activity_id is not null
     and v_slot.activity_id is distinct from v_inv.activity_id
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select a.active, a.name, a.kind
    into v_activity_active, v_activity_name, v_kind
    from public.reservation_activities a
   where a.id = v_slot.activity_id
     and a.organization_id = v_slot.organization_id;

  -- `draft` refusé, `closed` ACCEPTÉ.
  if not coalesce(v_activity_active, false)
     or v_slot.status not in ('open', 'closed')
     or v_slot.starts_at <= pg_catalog.now()
     or not public.org_has_module_access(v_slot.organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_seats := case when v_kind = 'duo' then 2 else 1 end;

  -- IDEMPOTENCE AVANT INCRÉMENT. Deux clics rendent la même place et ne brûlent
  -- qu'un usage.
  select r.* into v_existing
    from public.reservations r
   where r.slot_id = v_slot.id
     and r.player_key_hash = p_player_key_hash
     and r.status in ('confirmed', 'checked_in');
  if found then
    return pg_catalog.jsonb_build_object(
      'state', 'already_reserved',
      'reservation_id', v_existing.id,
      'code', v_existing.code,
      'status', v_existing.status,
      'party_size', v_existing.party_size
    );
  end if;

  -- LA CAPACITÉ, SES DEUX TERMES ET SON UNITÉ. Une invitation ne prend pas la
  -- place tenue pour quelqu'un de la liste prioritaire, et ne prend pas non
  -- plus la moitié d'un duo.
  select coalesce(pg_catalog.sum(r.party_size), 0)::integer into v_taken
    from public.reservations r
   where r.slot_id = v_slot.id
     and r.status in ('confirmed', 'checked_in');
  select (pg_catalog.count(*)::integer * v_seats) into v_held
    from public.reservation_waitlist_entries w
   where w.slot_id = v_slot.id
     and w.status = 'offered'
     and w.offer_expires_at > pg_catalog.now();

  if v_taken + v_held + v_seats > v_slot.capacity then
    return pg_catalog.jsonb_build_object(
      'state', 'full',
      'capacity', v_slot.capacity
    );
  end if;

  insert into public.reservations (
    slot_id, organization_id, player_key_hash, email, consent_transactional_at,
    party_size
  ) values (
    v_slot.id,
    v_slot.organization_id,
    p_player_key_hash,
    case when coalesce(p_consent, false) then v_email end,
    case when coalesce(p_consent, false) and v_email is not null
         then pg_catalog.now() end,
    v_seats
  )
  returning * into v_row;

  -- L'INCRÉMENT EST CONDITIONNEL, alors même que la ligne est verrouillée et
  -- que le plafond vient d'être testé. Ceinture.
  update public.reservation_invitations i
     set used_count = i.used_count + 1
   where i.id = v_inv.id
     and i.used_count < i.max_uses
  returning i.used_count into v_used;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, 'public', 'reservation.invitation_redeem',
          pg_catalog.jsonb_build_object(
            'invitation_id', v_inv.id,
            'reservation_id', v_row.id,
            'slot_id', v_slot.id,
            'used_count', v_used));

  return pg_catalog.jsonb_build_object(
    'state', 'reserved',
    'reservation_id', v_row.id,
    'code', v_row.code,
    'invitation_id', v_inv.id,
    'starts_at', v_slot.starts_at,
    'ends_at', v_slot.ends_at,
    'activity_name', v_activity_name,
    'party_size', v_row.party_size,
    'remaining', v_slot.capacity - (v_taken + v_seats) - v_held
  );
end;
$$;

comment on function public.redeem_invitation(uuid, text, text, uuid, text, boolean) is
  'Réserve une place au titre d''une invitation privée (RES-2), par l''EMPREINTE '
  'du jeton — le clair n''entre jamais en base. UN SEUL ÉTAT `unavailable` POUR '
  'NEUF REFUS : jeton inconnu, révoqué, fermé, expiré, épuisé, d''une AUTRE '
  'organisation, créneau absent ou en brouillon ou passé, activité coupée, '
  'organisation sans droit `vitrine` — les distinguer donnerait un oracle à qui '
  'tape des jetons au hasard. Le créneau `closed` est ACCEPTÉ, délibérément. '
  'Même mécanique atomique que reserve_slot — MÊME verrou d''avis, comptage EN '
  'PERSONNES (somme de `party_size` + offres de liste tenues, converties à '
  'l''unité du format), aucune sur-réservation. LA RÉSERVATION CRÉÉE PORTE '
  'L''UNITÉ DU FORMAT (RES-5) : l''invité d''un Atelier Duo vient à deux sans '
  'avoir à le dire. `used_count` compte des USAGES D''INVITATION et non des '
  'personnes — « 5 places » sur un Atelier Duo ouvre cinq duos. Il est '
  'incrémenté SOUS VERROU et sous condition, et l''idempotence est évaluée '
  'AVANT : deux clics du même invité rendent la même réservation et ne brûlent '
  'qu''un usage. Audité sous `reservation.invitation_redeem`.';

revoke all on function public.redeem_invitation(uuid, text, text, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.redeem_invitation(uuid, text, text, uuid, text, boolean)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 10. `reservation_public_state` — le joueur relit « pour deux »
--
-- CORPS DE 20261004120000 (section 13) RECOPIÉ, SIGNATURE ET TYPE DE RETOUR
-- INCHANGÉS. Une clé s'ajoute à chaque réservation : `party_size`.
--
-- SANS ELLE, L'HÔTE D'UN ATELIER DUO NE POURRAIT PAS SAVOIR CE QU'IL A RÉSERVÉ.
-- Sa page ne lit pas la table — elle lit ce document — et « Atelier Duo,
-- samedi 14 h » sans le nombre de personnes laisserait ouverte la seule
-- question qui compte pour lui : est-ce que mon accompagnant a une place.
--
-- LE FORMAT DE L'ACTIVITÉ N'ENTRE PAS ICI, volontairement. `kind`, `promise`,
-- `steps` et `preparation` décrivent CE QUI EST PROPOSÉ, pas ce que cette
-- personne a réservé : la page publique les lit sur `reservation_activities`,
-- qu'elle interroge déjà pour bâtir la page immersive. Les recopier ici aurait
-- créé une seconde source pour la même vérité.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservation_public_state(
  p_organization_id uuid,
  p_player_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_items jsonb;
  v_waitlist jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  select o.timezone into v_timezone
    from public.organizations o
   where o.id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  if v_timezone is null or not public.is_valid_timezone(v_timezone) then
    v_timezone := 'Europe/Paris';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'reservation_id', r.id,
        'code', r.code,
        'status', r.status,
        'created_at', r.created_at,
        'cancelled_at', r.cancelled_at,
        'checked_in_at', r.checked_in_at,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'activity_name', a.name,
        'party_size', r.party_size
      )
      order by s.starts_at desc
    ),
    '[]'::jsonb
  ) into v_items
    from public.reservations r
    join public.reservation_slots s
      on s.id = r.slot_id
     and s.organization_id = p_organization_id
    join public.reservation_activities a
      on a.id = s.activity_id
     and a.organization_id = p_organization_id
   where r.organization_id = p_organization_id
     and r.player_key_hash = p_player_key_hash
     and r.player_key_hash not like 'purge:%';

  -- LA FILE. Le RANG est recalculé ici, à la lecture, exactement comme la
  -- capacité : il compte les entrées vivantes du même créneau inscrites avant
  -- celle-ci. La comparaison de LIGNES `(created_at, id) < (…)` départage deux
  -- inscriptions de la même milliseconde de façon stable.
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'entry_id', w.id,
        'slot_id', w.slot_id,
        'status', w.status,
        'created_at', w.created_at,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'activity_name', a.name,
        'offer_expires_at', w.offer_expires_at,
        'offer_live',
          w.status = 'offered' and w.offer_expires_at > pg_catalog.now(),
        'position', (
          select pg_catalog.count(*)::integer + 1
            from public.reservation_waitlist_entries w2
           where w2.slot_id = w.slot_id
             and w2.status in ('waiting', 'offered')
             and (w2.created_at, w2.id) < (w.created_at, w.id)
        )
      )
      order by s.starts_at asc
    ),
    '[]'::jsonb
  ) into v_waitlist
    from public.reservation_waitlist_entries w
    join public.reservation_slots s
      on s.id = w.slot_id
     and s.organization_id = p_organization_id
    join public.reservation_activities a
      on a.id = s.activity_id
     and a.organization_id = p_organization_id
   where w.organization_id = p_organization_id
     and w.player_key_hash = p_player_key_hash
     and w.player_key_hash not like 'purge:%'
     and w.status in ('waiting', 'offered');

  -- NI l'email NI l'empreinte ne sortent d'ici — ni des réservations, ni de la
  -- file.
  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'timezone', v_timezone,
    'reservations', v_items,
    'waitlist', v_waitlist
  );
end;
$$;

comment on function public.reservation_public_state(uuid, text) is
  'Réservations ET entrées de liste prioritaire VIVANTES d''une identité '
  'pseudonyme CHEZ UNE organisation — le joueur retrouve son statut, son '
  'créneau, son code, SA TAILLE (`party_size`, RES-5 : l''hôte d''un Atelier '
  'Duo doit pouvoir relire « pour deux »), son RANG et son offre en cours sans '
  'compte. Bornée à l''organisation : l''empreinte du cookie est globale, et une '
  'réponse non bornée exposerait sur la page d''un commerce ce que la personne '
  'a réservé chez un autre. Le rang est recalculé à la lecture (ordre '
  'd''inscription, départagé par l''identifiant), jamais stocké. `offer_live` '
  'est tranché PAR LE SERVEUR. Le FORMAT de l''activité (`kind`, `promise`, '
  '`steps`, `preparation`) n''entre PAS ici : il décrit ce qui est proposé, que '
  'la page lit sur reservation_activities. N''expose ni l''email ni l''empreinte.';

revoke all on function public.reservation_public_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reservation_public_state(uuid, text)
  to service_role;
