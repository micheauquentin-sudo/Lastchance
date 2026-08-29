-- ============================================================
-- LE PLAN DE SALLE (RDV-6) — des tables, un effectif, une durée d'occupation
--
-- ── CE QUE RDV-1 À RDV-5 AVAIENT MANQUÉ ──
--
-- Le module rendait une prise de rendez-vous GÉNÉRIQUE : un créneau, une jauge
-- plate, une réservation d'une personne. Pour un restaurant, les trois sont
-- faux. On ne réserve pas « une place à 20 h », on réserve UNE TABLE POUR
-- QUATRE, et cette table reste occupée bien après l'heure d'arrivée.
--
-- ── LES TROIS NOTIONS QUE CE FICHIER AJOUTE ──
--
--   1. LA TABLE. Une ligne par table réelle, avec son nom et son nombre de
--      couverts. C'est elle qu'on réserve — pas une part de jauge.
--   2. L'EFFECTIF (`party_size`). Le client dit combien ils seront ; la borne
--      1..2 héritée de l'Atelier Duo s'ouvre à 1..30.
--   3. LA DURÉE D'OCCUPATION (`table_turn_minutes`). Une table prise à 20 h
--      pour 1 h 30 n'est pas libre à 20 h 15 — c'est le défaut qu'une jauge par
--      créneau ne peut pas voir, et il ferait accepter deux services à la même
--      table.
--
-- ── L'AFFECTATION EST À UNE SEULE TABLE, ET C'EST UNE LIMITE ASSUMÉE ──
--
-- Un groupe de cinq est refusé si aucune table seule ne le prend, même quand
-- neuf couverts sont libres sur deux tables. Le REGROUPEMENT de tables est un
-- produit à lui seul : il demande de savoir lesquelles sont mitoyennes, dans
-- quel ordre les joindre, et comment défaire la jointure à l'annulation.
--
-- La parade n'est pas un contournement, c'est le mécanisme que le propriétaire
-- a demandé : ce groupe rejoint la LISTE D'ATTENTE avec son effectif, et
-- `reservation_offer_next` lui offrira la place dès qu'une table assez grande
-- se libère. La colonne `party_size` de la liste, ajoutée ici, existe pour ça.
--
-- ── LE MEILLEUR AJUSTEMENT, ET POURQUOI PAS LA PREMIÈRE LIBRE ──
--
-- `reserve_table` retient la PLUS PETITE table qui convient. Donner une table
-- de six à un couple parce qu'elle vient en premier dans la liste, c'est
-- refuser le groupe de six qui appellera dix minutes plus tard. Le tri par
-- `seats` puis par nom rend aussi l'affectation DÉTERMINISTE : deux exécutions
-- sur le même état donnent la même table, ce qu'un test peut vérifier.
--
-- ── CE QUE CE FICHIER NE FAIT PAS ──
--
--   * AUCUNE modification de `reserve_slot`. Elle continue de servir les
--     MOMENTS — ateliers, dégustations — à l'identique. Un TRIGGER, et non une
--     réécriture de cette RPC, interdit qu'une réservation de rendez-vous
--     naisse sans table : recopier cent cinquante lignes de fonction pour y
--     ajouter une garde aurait risqué d'en perdre une autre au passage, et ce
--     dépôt a déjà payé un `create or replace` qui annulait un patch.
--   * AUCUN regroupement de tables (voir ci-dessus).
--   * AUCUN email. La notification d'annulation est le lot suivant ; la
--     colonne `party_size` de la liste d'attente est ce dont il aura besoin.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. L'activité apprend la durée d'occupation d'une table
--
-- DISTINCTE de `duration_minutes`, et les confondre serait le défaut de
-- conception de ce fichier. `duration_minutes` est le PAS DE LA GRILLE — tous
-- les quarts d'heure, de 19 h à 22 h. `table_turn_minutes` est le temps qu'un
-- service occupe la table — une heure et demie. La première décide des heures
-- PROPOSÉES, la seconde de ce qu'une réservation BLOQUE.
-- ────────────────────────────────────────────────────────────

alter table public.reservation_activities
  add column if not exists table_turn_minutes integer;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::pg_catalog.regclass
       and con.conname = 'reservation_activities_turn_check'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_turn_check
      check (table_turn_minutes is null
             or table_turn_minutes between 15 and 600);
  end if;
end
$$;

comment on column public.reservation_activities.table_turn_minutes is
  'Durée pendant laquelle une réservation OCCUPE sa table, en minutes. À NE PAS '
  'confondre avec `duration_minutes`, qui est le PAS de la grille horaire : la '
  'première décide de ce qu''une réservation bloque, la seconde des heures '
  'proposées. `null` hors d''une activité à plan de salle.';


-- ────────────────────────────────────────────────────────────
-- 2. Les tables
-- ────────────────────────────────────────────────────────────

create table if not exists public.reservation_tables (
  id uuid primary key default gen_random_uuid(),
  -- Colonne NUE : seule la FK COMPOSITE relie la table à son activité. Motif du
  -- socle — une FK d'une seule colonne ne décide pas entre deux locataires.
  activity_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- « T1 », « Terrasse 3 », « Le bar ». Court : il se lit dans une case
  -- d'agenda et se dit à voix haute en salle.
  name text not null
    check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 40),
  seats smallint not null check (seats between 1 and 30),
  -- Interrupteur, jamais une suppression : une table en travaux cesse d'être
  -- proposée sans que les réservations passées perdent leur emplacement.
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  -- Deux tables ne portent pas le même nom dans la même salle : le service les
  -- confondrait, et l'agenda afficherait deux lignes indiscernables.
  constraint reservation_tables_name_unique unique (activity_id, name),
  -- Cible de la FK composite de `reservations.table_id`.
  unique (id, organization_id),
  foreign key (activity_id, organization_id)
    references public.reservation_activities(id, organization_id) on delete cascade
);

comment on table public.reservation_tables is
  'Une table réelle de la salle, avec son nom et ses couverts. C''est elle '
  'qu''on réserve — pas une part de jauge. Org-scopée, éditeurs seulement, '
  'aucune policy anon : le parcours joueur ne lit jamais ces lignes, il lit les '
  'DISPONIBILITÉS que reserve_table en déduit.';
comment on column public.reservation_tables.seats is
  'Couverts de cette table. `reserve_table` retient la PLUS PETITE table qui '
  'convient : donner une table de six à un couple refuserait le groupe de six '
  'qui appellera ensuite.';

create index if not exists reservation_tables_activity_idx
  on public.reservation_tables (activity_id, seats, name);
create index if not exists reservation_tables_org_idx
  on public.reservation_tables (organization_id);


-- ────────────────────────────────────────────────────────────
-- 3. La réservation porte sa table
-- ────────────────────────────────────────────────────────────

alter table public.reservations
  add column if not exists table_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservations'::pg_catalog.regclass
       and con.conname = 'reservations_table_fk'
  ) then
    alter table public.reservations
      add constraint reservations_table_fk
      foreign key (table_id, organization_id)
      references public.reservation_tables(id, organization_id)
      -- `restrict` ET NON `cascade` : supprimer une table ne doit pas effacer
      -- les réservations qu'elle portait — ce serait perdre l'historique du
      -- service. L'interrupteur `active` est le geste prévu.
      on delete restrict;
  end if;
end
$$;

comment on column public.reservations.table_id is
  'Table affectée. `null` pour un MOMENT (atelier, dégustation : on réserve une '
  'place, pas une table) ; OBLIGATOIRE pour un rendez-vous, imposé par le '
  'trigger `reservations_require_table`.';

-- Index de l'INTERROGATION CHAUDE : « cette table est-elle libre entre X et
-- Y ? ». Partiel sur les états VIVANTS — exactement l'ensemble que compte
-- `reserve_slot` — parce qu'une réservation annulée ne bloque rien.
create index if not exists reservations_table_vivantes_idx
  on public.reservations (table_id, slot_id)
  where table_id is not null and status in ('confirmed', 'checked_in');


-- ────────────────────────────────────────────────────────────
-- 4. L'effectif s'ouvre — 1..2 devient 1..30
--
-- La borne 1..2 datait de l'Atelier Duo (20261007120000), où elle disait « une
-- ligne vaut une ou deux personnes ». Elle interdisait mécaniquement une table
-- de six. Elle s'ouvre ici, et l'invariant du Duo NE BOUGE PAS : c'est
-- `reserve_slot` qui impose `party_size = 2` sur une activité `duo`, et cette
-- RPC n'est pas touchée. La base cesse d'être la seconde barrière d'une règle
-- qui n'était pas la sienne.
-- ────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservations'::pg_catalog.regclass
       and con.conname = 'reservations_party_size_bound'
  ) then
    alter table public.reservations drop constraint reservations_party_size_bound;
  end if;

  alter table public.reservations
    add constraint reservations_party_size_bound
    check (party_size between 1 and 30);
end
$$;

comment on column public.reservations.party_size is
  'Nombre de PERSONNES de cette réservation. 1 par défaut, 2 sur une activité '
  '`duo` (imposé par reserve_slot), et jusqu''à 30 sur un plan de salle où le '
  'client saisit son effectif. Borné 1..30 en base depuis RDV-6 : la borne 1..2 '
  'd''origine interdisait mécaniquement une table de six.';


-- ────────────────────────────────────────────────────────────
-- 5. La liste d'attente retient POUR COMBIEN DE PERSONNES
--
-- Sans cette colonne, offrir une place libérée relèverait du pari : on
-- proposerait une table de deux à un groupe de six, qui refuserait, et la table
-- resterait vide pendant que le suivant attend. C'est la donnée qui rend
-- l'offre d'annulation utile.
-- ────────────────────────────────────────────────────────────

alter table public.reservation_waitlist_entries
  add column if not exists party_size integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_waitlist_entries'::pg_catalog.regclass
       and con.conname = 'reservation_waitlist_party_size_bound'
  ) then
    alter table public.reservation_waitlist_entries
      add constraint reservation_waitlist_party_size_bound
      check (party_size between 1 and 30);
  end if;
end
$$;

comment on column public.reservation_waitlist_entries.party_size is
  'Effectif souhaité. Sans lui, une place libérée serait offerte au premier de '
  'la file quel que soit son groupe — une table de deux proposée à six, '
  'refusée, et laissée vide pendant que le suivant attend.';


-- ────────────────────────────────────────────────────────────
-- 6. RLS — org-scopée, éditeurs seulement, anon jamais
-- ────────────────────────────────────────────────────────────

alter table public.reservation_tables enable row level security;

revoke all on table public.reservation_tables from public, anon, authenticated;

create policy "reservation_tables: editors" on public.reservation_tables
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- `organization_id` HORS du grant d'insertion : il vient de la session, jamais
-- du formulaire. Même geste que les offres de stock (20261010120000).
grant select on table public.reservation_tables to authenticated;
grant insert (activity_id, organization_id, name, seats, active, position)
  on table public.reservation_tables to authenticated;
grant update (name, seats, active, position, updated_at)
  on table public.reservation_tables to authenticated;
grant delete on table public.reservation_tables to authenticated;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) and not exists (
    select 1 from pg_catalog.pg_trigger t
     where t.tgrelid = 'public.reservation_tables'::pg_catalog.regclass
       and t.tgname = 'reservation_tables_set_updated_at'
  ) then
    create trigger reservation_tables_set_updated_at
      before update on public.reservation_tables
      for each row execute function public.set_updated_at();
  end if;
end
$$;


-- ────────────────────────────────────────────────────────────
-- 7. UNE RÉSERVATION DE RENDEZ-VOUS NE NAÎT PAS SANS TABLE
--
-- ── POURQUOI UN TRIGGER ET NON UNE GARDE DANS `reserve_slot` ──
--
-- La règle doit tenir quel que soit le chemin d'écriture, et `reserve_slot`
-- n'est pas le seul : `claim_waitlist_offer` et `redeem_invitation` insèrent
-- aussi dans `reservations`. Une garde recopiée dans trois RPC diverge ; un
-- trigger est écrit une fois et ne se contourne pas.
--
-- Et c'est aussi ce qui évite de RÉÉCRIRE `reserve_slot` : recopier cent
-- cinquante lignes de fonction pour y ajouter une ligne aurait risqué d'en
-- perdre une autre, et ce dépôt a déjà payé un `create or replace` qui annulait
-- silencieusement un patch en production.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservations_require_table()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
begin
  if new.table_id is not null then
    return new;
  end if;

  select a.booking_mode into v_mode
    from public.reservation_slots s
    join public.reservation_activities a
      on a.id = s.activity_id
     and a.organization_id = s.organization_id
   where s.id = new.slot_id
     and s.organization_id = new.organization_id;

  if v_mode = 'rendez_vous' then
    raise exception
      'une reservation de rendez-vous exige une table (reserve_table)'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- FERMÉE À PUBLIC comme toute fonction de ce schéma : PostgreSQL accorde
-- l'EXECUTE à `public` par défaut, et `security_acl` le refuse — à raison,
-- celle-ci étant `security definer`. Le trigger l'appelle par le moteur, pas
-- par un grant.
revoke all on function public.reservations_require_table()
  from public, anon, authenticated;

drop trigger if exists reservations_require_table on public.reservations;
create trigger reservations_require_table
  before insert on public.reservations
  for each row execute function public.reservations_require_table();

comment on function public.reservations_require_table() is
  'Interdit qu''une réservation sur une activité `rendez_vous` naisse sans '
  'table, QUEL QUE SOIT le chemin d''écriture — reserve_slot, '
  'claim_waitlist_offer ou redeem_invitation. Écrit une fois plutôt que recopié '
  'dans trois RPC.';


-- ────────────────────────────────────────────────────────────
-- 8. `reserve_table` — LA RÉSERVATION D'UN PLAN DE SALLE
--
-- ── LES QUATRE PROPRIÉTÉS QU'ELLE REND VRAIES ──
--
--   1. AUCUNE DOUBLE AFFECTATION SOUS CONCURRENCE. Le verrou d'avis porte sur
--      l'ACTIVITÉ et non sur le créneau : une réservation de 20 h occupe aussi
--      20 h 15 et 20 h 30, donc deux créneaux différents se disputent la même
--      table. Un verrou par créneau les aurait laissés passer côte à côte.
--   2. LA DURÉE D'OCCUPATION FAIT FOI. Une table est libre pour [T, T+durée) si
--      AUCUNE réservation vivante de cette table ne chevauche cette fenêtre.
--      Le chevauchement est calculé sur des instants, jamais sur des créneaux.
--   3. LE MEILLEUR AJUSTEMENT. La plus petite table qui convient, puis le nom :
--      déterministe, et économe du gros mobilier.
--   4. IDEMPOTENT. Re-réserver le même créneau rend la réservation existante et
--      son code, sans en créer une seconde — même contrat que `reserve_slot`.
-- ────────────────────────────────────────────────────────────

create or replace function public.reserve_table(
  p_organization_id uuid,
  p_slot_id uuid,
  p_player_key_hash text,
  p_party_size integer default 1,
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
  v_activity public.reservation_activities%rowtype;
  v_email text;
  v_debut timestamptz;
  v_fin timestamptz;
  v_table_id uuid;
  v_table_name text;
  v_existing public.reservations%rowtype;
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
  if p_party_size is null or p_party_size not between 1 and 30 then
    return pg_catalog.jsonb_build_object('state', 'invalid_party_size');
  end if;

  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null
     and (pg_catalog.char_length(v_email) > 254
          or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  then
    return pg_catalog.jsonb_build_object('state', 'invalid_email');
  end if;

  select s.* into v_slot
    from public.reservation_slots s
   where s.id = p_slot_id
     and s.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select a.* into v_activity
    from public.reservation_activities a
   where a.id = v_slot.activity_id
     and a.organization_id = v_slot.organization_id;

  -- REFUS INDISTINCTS, comme dans le socle : activité coupée, créneau non
  -- ouvert, créneau passé, mode incorrect ou organisation sans le droit rendent
  -- tous `unavailable`. Ce point d'entrée est ouvert à Internet.
  if not coalesce(v_activity.active, false)
     or v_activity.booking_mode <> 'rendez_vous'
     or v_slot.status <> 'open'
     or v_slot.starts_at <= pg_catalog.now()
     or not public.org_has_module_access(v_slot.organization_id, 'rendez_vous')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE VERROU PORTE SUR L'ACTIVITÉ, pas sur le créneau : une réservation de
  -- 20 h occupe aussi 20 h 15, donc deux créneaux se disputent la même table.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_activity.id::text, 0)
  );

  -- IDEMPOTENCE, sous le verrou : re-réserver rend la ligne existante.
  select r.* into v_existing
    from public.reservations r
   where r.slot_id = p_slot_id
     and r.organization_id = p_organization_id
     and r.player_key_hash = p_player_key_hash
     and r.status in ('confirmed', 'checked_in')
   limit 1;
  if found then
    select t.name into v_table_name
      from public.reservation_tables t
     where t.id = v_existing.table_id;
    return pg_catalog.jsonb_build_object(
      'state', 'reserved',
      'reservation_id', v_existing.id,
      'code', v_existing.code,
      'party_size', v_existing.party_size,
      'table_name', v_table_name
    );
  end if;

  v_debut := v_slot.starts_at;
  v_fin := v_slot.starts_at
    + pg_catalog.make_interval(mins => coalesce(v_activity.table_turn_minutes, 90));

  -- LE MEILLEUR AJUSTEMENT. `seats` croissant puis `name` : la plus petite
  -- table qui convient, et un départage stable.
  select t.id, t.name into v_table_id, v_table_name
    from public.reservation_tables t
   where t.activity_id = v_activity.id
     and t.organization_id = v_activity.organization_id
     and t.active
     and t.seats >= p_party_size
     -- LIBRE sur toute la fenêtre : aucune réservation VIVANTE de cette table
     -- dont l'occupation chevauche [v_debut, v_fin). Le chevauchement se lit
     -- sur des instants — `a < fin_b and b < fin_a` — jamais sur des créneaux.
     and not exists (
       select 1
         from public.reservations r
         join public.reservation_slots rs
           on rs.id = r.slot_id
          and rs.organization_id = r.organization_id
        where r.table_id = t.id
          and r.status in ('confirmed', 'checked_in')
          and rs.starts_at < v_fin
          and v_debut < rs.starts_at
            + pg_catalog.make_interval(
                mins => coalesce(v_activity.table_turn_minutes, 90))
     )
   order by t.seats asc, t.name asc
   limit 1;

  if v_table_id is null then
    -- COMPLET, et le mot est juste : il n'y a pas de table LIBRE ASSEZ GRANDE.
    -- L'écran proposera la liste d'attente avec cet effectif.
    return pg_catalog.jsonb_build_object('state', 'full');
  end if;

  insert into public.reservations
    (slot_id, organization_id, player_key_hash, email,
     consent_transactional_at, party_size, table_id)
  values
    (p_slot_id, p_organization_id, p_player_key_hash,
     case when p_consent then v_email else null end,
     case when p_consent and v_email is not null then pg_catalog.now() else null end,
     p_party_size, v_table_id)
  returning * into v_row;

  return pg_catalog.jsonb_build_object(
    'state', 'reserved',
    'reservation_id', v_row.id,
    'code', v_row.code,
    'party_size', v_row.party_size,
    'table_name', v_table_name
  );
end;
$$;

comment on function public.reserve_table(uuid, uuid, text, integer, text, boolean) is
  'Réserve UNE TABLE pour un effectif donné, sur la fenêtre '
  '[créneau, créneau + table_turn_minutes). Verrou d''avis sur l''ACTIVITÉ — et '
  'non sur le créneau, qu''une occupation traverse. Retient la plus petite table '
  'qui convient (meilleur ajustement, déterministe). IDEMPOTENTE. Rend `full` '
  'quand aucune table libre n''est assez grande — l''écran propose alors la '
  'liste d''attente avec l''effectif.';

revoke all on function public.reserve_table(uuid, uuid, text, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.reserve_table(uuid, uuid, text, integer, text, boolean)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 9. `reservation_tables_state` — LES DISPONIBILITÉS, VUES DU JOUEUR
--
-- Elle rend, pour chaque créneau à venir d'une activité, le PLUS GRAND effectif
-- encore plaçable. C'est la seule information dont l'écran public a besoin, et
-- la seule qu'il doit recevoir : la liste des tables, leurs noms et qui les
-- occupe ne regardent pas un visiteur.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservation_tables_state(
  p_activity_id uuid,
  p_from timestamptz default pg_catalog.now(),
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_activity public.reservation_activities%rowtype;
  v_turn integer;
  v_items jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select a.* into v_activity
    from public.reservation_activities a
   where a.id = p_activity_id;
  if not found or not v_activity.active
     or v_activity.booking_mode <> 'rendez_vous'
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_turn := coalesce(v_activity.table_turn_minutes, 90);

  select coalesce(pg_catalog.jsonb_agg(ligne order by ligne->>'starts_at'), '[]'::jsonb)
    into v_items
    from (
      select pg_catalog.jsonb_build_object(
        'slot_id', s.id,
        'starts_at', s.starts_at,
        -- LE PLUS GRAND EFFECTIF PLAÇABLE, et non le nombre de places restantes :
        -- douze couverts libres sur six tables de deux ne prennent pas un groupe
        -- de quatre, et annoncer « 12 places » l'aurait laissé croire.
        'max_party', coalesce((
          select pg_catalog.max(t.seats)
            from public.reservation_tables t
           where t.activity_id = v_activity.id
             and t.organization_id = v_activity.organization_id
             and t.active
             and not exists (
               select 1
                 from public.reservations r
                 join public.reservation_slots rs
                   on rs.id = r.slot_id
                  and rs.organization_id = r.organization_id
                where r.table_id = t.id
                  and r.status in ('confirmed', 'checked_in')
                  and rs.starts_at < s.starts_at
                    + pg_catalog.make_interval(mins => v_turn)
                  and s.starts_at < rs.starts_at
                    + pg_catalog.make_interval(mins => v_turn)
             )
        ), 0)
      ) as ligne
        from public.reservation_slots s
       where s.activity_id = v_activity.id
         and s.organization_id = v_activity.organization_id
         and s.status = 'open'
         and s.starts_at > p_from
       order by s.starts_at
       -- `least` NU : c'est une construction du parseur, pas une fonction de
       -- pg_catalog — la qualifier échouerait À L'EXÉCUTION.
       limit least(coalesce(p_limit, 200), 500)
    ) lignes;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'turn_minutes', v_turn,
    'slots', v_items
  );
end;
$$;

comment on function public.reservation_tables_state(uuid, timestamptz, integer) is
  'Disponibilités d''un plan de salle, pour l''écran PUBLIC : par créneau, le '
  'plus grand effectif encore plaçable. Ni les noms de tables, ni qui les '
  'occupe — un visiteur n''a pas à les lire. `max_party` et NON un nombre de '
  'places : douze couverts libres sur six tables de deux ne prennent pas un '
  'groupe de quatre.';

revoke all on function public.reservation_tables_state(uuid, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.reservation_tables_state(uuid, timestamptz, integer)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 10. RÉPARATION DE RDV-5 — `rendez_vous` N'ÉTAIT PAS OCTROYABLE
--
-- ── LE DÉFAUT, ET COMMENT IL A ÉCHAPPÉ À LA CI ──
--
-- RDV-5 (20261107120000) a fait entrer `rendez_vous` dans
-- `org_has_module_access`, dans `GRANTABLE_MODULES` et dans le catalogue
-- commercial. Il a OUBLIÉ le `check` de `organization_module_grants.module`,
-- qui énumère les modules qu'un octroi peut porter.
--
-- Conséquence : le back-office pouvait proposer « Réservation » dans sa liste —
-- elle dérive de `GRANTABLE_MODULES` — et l'écriture échouait sur une violation
-- de contrainte. Le droit n'était PAS accordable, alors que la note de
-- livraison affirmait le contraire.
--
-- Aucune garde ne l'a vu : `module-access-parity` compare la constante
-- TypeScript au `case` de la fonction, pas au `check` de la table des octrois.
-- Les deux listes disent « quels modules existent » et rien ne les tenait
-- d'accord. C'est un test pgTAP de CE lot — qui sème un octroi `rendez_vous` —
-- qui l'a trouvé, en trois lignes.
--
-- Le texte ci-dessous est repris de la DERNIÈRE définition, 20261020120000, et
-- une garde vérifie cette filiation avant de remplacer.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def text;
begin
  select pg_catalog.pg_get_constraintdef(c.oid) into strict v_def
    from pg_catalog.pg_constraint c
   where c.conname = 'organization_module_grants_module_check';

  -- DÉJÀ POSÉE : rien à faire.
  if pg_catalog.strpos(v_def, 'rendez_vous') > 0 then
    return;
  end if;

  -- La définition vivante doit être celle des treize modules de
  -- 20261020120000 : si elle ne les porte pas, une migration postérieure l'a
  -- réécrite et le texte ci-dessous en supprimerait le travail.
  if pg_catalog.strpos(v_def, 'reserver') = 0
     or pg_catalog.strpos(v_def, 'vitrine') = 0
     or pg_catalog.strpos(v_def, 'bande') = 0
  then
    raise exception
      'organization_module_grants_module_check ne porte pas les cles de 20261020120000 : la definition vivante n est pas celle attendue';
  end if;

  alter table public.organization_module_grants
    drop constraint organization_module_grants_module_check;

  alter table public.organization_module_grants
    add constraint organization_module_grants_module_check
    check (module in ('wheel', 'hunts', 'calendar', 'loyalty', 'quiz',
                      'jackpot', 'events', 'referral', 'pronostics',
                      'vitrine', 'reserver', 'rendez_vous', 'duo', 'bande'));
end
$migration$;
