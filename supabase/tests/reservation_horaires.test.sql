-- ============================================================
-- RDV-1 — LE GÉNÉRATEUR DE CRÉNEAUX (20261106120000)
--
-- Ce fichier ne teste pas « la migration s'applique » : la CI le prouve en
-- l'appliquant. Il teste les CINQ PROMESSES du générateur, celles dont
-- l'absence ne se verrait qu'un samedi matin, dans l'agenda d'un commerçant :
--
--   1. il engendre la bonne grille — bon jour de semaine, bonnes heures
--      LOCALES, découpage à la durée, et rien qui déborde de la plage ;
--   2. il est IDEMPOTENT — rejoué sans changement, il ne crée ni ne détruit ;
--   3. il ne détruit JAMAIS un créneau portant une réservation vivante, même
--      quand ce créneau vient de sortir des horaires ;
--   4. il ne touche ni au PASSÉ, ni aux créneaux posés À LA MAIN ;
--   5. il refuse ce qui n'est pas à lui — activité d'une autre organisation,
--      activité qui n'est pas en rendez-vous, activité incomplète.
--
-- ── POURQUOI LES DATES SONT RELATIVES, ET ANCRÉES SUR UN LUNDI ──
--
-- Une fixture écrite en dur (« le 14 mars ») rougit le jour où on la relit.
-- Les fermetures et l'horizon sont donc calculés depuis `now()`, et la règle
-- hebdomadaire vise le LUNDI SUIVANT — jour toujours à venir, quel que soit le
-- jour où le fichier tourne, et jamais confondu avec aujourd'hui (ce qui
-- ferait entrer le délai de prévenance dans le décompte).
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('7a7a0000-0000-4000-8000-00000000000a', 'Horaires A', 'tap-hor-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('7a7a0000-0000-4000-8000-00000000000b', 'Horaires B', 'tap-hor-b',
   'active', 'starter', 'Europe/Paris', 6);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
select o.id, m.module, 'pass', 'backoffice',
       now() - interval '1 day', now() + interval '365 days'
  from (values
    ('7a7a0000-0000-4000-8000-00000000000a'::uuid),
    ('7a7a0000-0000-4000-8000-00000000000b'::uuid)) as o(id)
 cross join (values ('vitrine'), ('reserver')) as m(module);

insert into auth.users (id, email) values
  ('7a7a0000-0000-4000-8000-000000000101', 'proprio-a@tap-hor.local'),
  ('7a7a0000-0000-4000-8000-000000000102', 'proprio-b@tap-hor.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('7a7a0000-0000-4000-8000-00000000000a',
   '7a7a0000-0000-4000-8000-000000000101', 'owner'),
  ('7a7a0000-0000-4000-8000-00000000000b',
   '7a7a0000-0000-4000-8000-000000000102', 'owner');

-- L'activité en RENDEZ-VOUS : 30 minutes, une place, horizon 28 jours.
insert into public.reservation_activities
  (id, organization_id, name, active, booking_mode,
   duration_minutes, slot_capacity, booking_horizon_days, lead_time_minutes)
values
  ('7a7a0000-0000-4000-8000-000000000201',
   '7a7a0000-0000-4000-8000-00000000000a', 'Coupe', true, 'rendez_vous',
   30, 1, 28, 0),
  -- Le témoin « pas en rendez-vous » : mêmes droits, autre mode.
  ('7a7a0000-0000-4000-8000-000000000202',
   '7a7a0000-0000-4000-8000-00000000000a', 'Atelier', true, 'moment',
   null, null, 30, 0),
  -- L'activité de la VOISINE : sert à prouver le refus inter-tenant.
  ('7a7a0000-0000-4000-8000-000000000203',
   '7a7a0000-0000-4000-8000-00000000000b', 'Coupe B', true, 'rendez_vous',
   30, 1, 28, 0);

-- ── La contrainte de complétude mord AVANT le générateur ─────
select throws_ok(
  $$insert into public.reservation_activities
      (organization_id, name, booking_mode, duration_minutes, slot_capacity)
    values ('7a7a0000-0000-4000-8000-00000000000a', 'Incomplète',
            'rendez_vous', null, null)$$,
  '23514',
  null,
  'H-1 un rendez-vous sans durée ni capacité est refusé à l''écriture');

-- ── Les horaires : lundi 9 h 00 → 11 h 00, heure locale ──────
--
-- `weekday = 0` est LUNDI (0 = lundi dans cette table, contrairement à
-- `date_part('dow')` où 0 = dimanche). Deux heures à 30 minutes = 4 créneaux.
insert into public.reservation_openings
  (activity_id, organization_id, weekday, starts_at_minute, ends_at_minute)
values
  ('7a7a0000-0000-4000-8000-000000000201',
   '7a7a0000-0000-4000-8000-00000000000a', 0, 540, 660);

-- ════════════════════════════════════════════════════════════
-- 1. LA GRILLE ENGENDRÉE
-- ════════════════════════════════════════════════════════════

set local "request.jwt.claim.sub" = '7a7a0000-0000-4000-8000-000000000101';

select is(
  (public.generate_reservation_slots(
    '7a7a0000-0000-4000-8000-000000000201') ->> 'state'),
  'ok',
  'H-2 le générateur rend `ok` pour une activité complète de son organisation');

-- Quatre créneaux par lundi. L'horizon de 28 jours en couvre exactement
-- quatre, sauf si aujourd'hui est un lundi — auquel cas le lundi du jour est
-- déjà passé pour partie. On borne donc l'attente plutôt que de la figer.
select ok(
  (select count(*) from public.reservation_slots
    where activity_id = '7a7a0000-0000-4000-8000-000000000201') between 12 and 20,
  'H-3 quatre créneaux par lundi sur un horizon de quatre semaines');

select ok(
  (select bool_and(
     public.is_valid_timezone('Europe/Paris')
     and date_part('dow', starts_at at time zone 'Europe/Paris') = 1)
     from public.reservation_slots
    where activity_id = '7a7a0000-0000-4000-8000-000000000201'),
  'H-4 tous les créneaux tombent un LUNDI, en heure locale');

select ok(
  (select bool_and(
     date_part('hour', starts_at at time zone 'Europe/Paris') between 9 and 10)
     from public.reservation_slots
    where activity_id = '7a7a0000-0000-4000-8000-000000000201'),
  'H-5 aucun créneau hors de la plage 9 h → 11 h (le dernier part à 10 h 30)');

select ok(
  (select bool_and(ends_at - starts_at = interval '30 minutes')
     from public.reservation_slots
    where activity_id = '7a7a0000-0000-4000-8000-000000000201'),
  'H-6 chaque créneau dure exactement la durée de la prestation');

select ok(
  (select bool_and(generated and status = 'open' and capacity = 1)
     from public.reservation_slots
    where activity_id = '7a7a0000-0000-4000-8000-000000000201'),
  'H-7 les créneaux naissent ENGENDRÉS, OUVERTS et à la capacité de l''activité');

select ok(
  (select bool_and(starts_at > now())
     from public.reservation_slots
    where activity_id = '7a7a0000-0000-4000-8000-000000000201'),
  'H-8 aucun créneau dans le passé');

-- ════════════════════════════════════════════════════════════
-- 2. IDEMPOTENCE
-- ════════════════════════════════════════════════════════════

create temporary table avant_rejeu on commit drop as
  select id, starts_at from public.reservation_slots
   where activity_id = '7a7a0000-0000-4000-8000-000000000201';

select is(
  (public.generate_reservation_slots(
    '7a7a0000-0000-4000-8000-000000000201') ->> 'created'),
  '0',
  'H-9 rejoué sans changement, le générateur ne crée RIEN');

select is(
  (select count(*)::text from public.reservation_slots s
    join avant_rejeu a on a.id = s.id),
  (select count(*)::text from avant_rejeu),
  'H-10 …et ne détruit rien non plus : les mêmes lignes, aux mêmes identifiants');

-- ════════════════════════════════════════════════════════════
-- 3. UNE RÉSERVATION VIVANTE PROTÈGE SON CRÉNEAU
-- ════════════════════════════════════════════════════════════

-- On réserve le premier créneau, puis on RETIRE l'horaire du lundi : la grille
-- devient vide, mais ce créneau-là porte quelqu'un.
insert into public.reservations
  (organization_id, slot_id, player_key_hash, status)
select '7a7a0000-0000-4000-8000-00000000000a', s.id, repeat('a', 64), 'confirmed'
  from public.reservation_slots s
 where s.activity_id = '7a7a0000-0000-4000-8000-000000000201'
 order by s.starts_at
 limit 1;

create temporary table creneau_reserve on commit drop as
  select s.id from public.reservation_slots s
   join public.reservations r on r.slot_id = s.id;

delete from public.reservation_openings
 where activity_id = '7a7a0000-0000-4000-8000-000000000201';

select is(
  (public.generate_reservation_slots(
    '7a7a0000-0000-4000-8000-000000000201') ->> 'state'),
  'ok',
  'H-11 le générateur tourne même sans aucun horaire (la grille devient vide)');

select is(
  (select count(*)::text from public.reservation_slots s
    join creneau_reserve c on c.id = s.id),
  '1',
  'H-12 le créneau RÉSERVÉ survit à la suppression de son horaire');

select is(
  (select count(*)::text from public.reservation_slots
    where activity_id = '7a7a0000-0000-4000-8000-000000000201'),
  '1',
  'H-13 …et il est le SEUL rescapé : tout le reste, libre, a été retiré');

-- ════════════════════════════════════════════════════════════
-- 4. LES CRÉNEAUX POSÉS À LA MAIN SONT HORS DE PORTÉE
-- ════════════════════════════════════════════════════════════

insert into public.reservation_slots
  (activity_id, organization_id, starts_at, ends_at, capacity, status, generated)
values
  ('7a7a0000-0000-4000-8000-000000000201',
   '7a7a0000-0000-4000-8000-00000000000a',
   now() + interval '10 days', now() + interval '10 days 1 hour',
   4, 'open', false);

select is(
  (public.generate_reservation_slots(
    '7a7a0000-0000-4000-8000-000000000201') ->> 'removed'),
  '0',
  'H-14 le générateur ne retire aucun créneau posé à la main');

select is(
  (select count(*)::text from public.reservation_slots
    where activity_id = '7a7a0000-0000-4000-8000-000000000201'
      and not generated),
  '1',
  'H-15 …et celui-ci est toujours là, avec sa capacité propre');

-- ════════════════════════════════════════════════════════════
-- 5. LES FERMETURES
-- ════════════════════════════════════════════════════════════

-- On remet l'horaire du lundi, puis on ferme TOUT l'horizon.
insert into public.reservation_openings
  (activity_id, organization_id, weekday, starts_at_minute, ends_at_minute)
values
  ('7a7a0000-0000-4000-8000-000000000201',
   '7a7a0000-0000-4000-8000-00000000000a', 0, 540, 660);

insert into public.reservation_closures
  (activity_id, organization_id, starts_on, ends_on, reason)
values
  ('7a7a0000-0000-4000-8000-000000000201',
   '7a7a0000-0000-4000-8000-00000000000a',
   (now() at time zone 'Europe/Paris')::date,
   (now() at time zone 'Europe/Paris')::date + 60,
   'Congés');

select is(
  (public.generate_reservation_slots(
    '7a7a0000-0000-4000-8000-000000000201') ->> 'created'),
  '0',
  'H-16 une fermeture couvrant tout l''horizon n''engendre aucun créneau');

-- ════════════════════════════════════════════════════════════
-- 6. CE QUE LE GÉNÉRATEUR REFUSE
-- ════════════════════════════════════════════════════════════

select is(
  (public.generate_reservation_slots(
    '7a7a0000-0000-4000-8000-000000000202') ->> 'state'),
  'not_rendez_vous',
  'H-17 une activité en mode `moment` n''engendre rien, et le dit');

-- L'ACTIVITÉ DE LA VOISINE, avec l'identité de A : la fonction est
-- `security definer`, c'est sa garde d'appartenance qui doit mordre.
select is(
  (public.generate_reservation_slots(
    '7a7a0000-0000-4000-8000-000000000203') ->> 'state'),
  'not_authorized',
  'H-18 un membre ne fait rien tourner chez la voisine');

select is(
  (select count(*)::text from public.reservation_slots
    where activity_id = '7a7a0000-0000-4000-8000-000000000203'),
  '0',
  'H-19 …et aucun créneau n''a été écrit chez elle');

select is(
  (public.generate_reservation_slots(
    '7a7a0000-0000-4000-8000-000000000999') ->> 'state'),
  'unavailable',
  'H-20 une activité inexistante rend `unavailable`, sans rien révéler');

-- ════════════════════════════════════════════════════════════
-- 7. ACL — anon ne voit rien, la fonction lui est fermée
-- ════════════════════════════════════════════════════════════

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select ok(not has_table_privilege('anon', 'public.reservation_openings', 'SELECT'),
  'H-21 anon n''a aucun privilège de table sur les horaires');
select ok(not has_table_privilege('anon', 'public.reservation_closures', 'SELECT'),
  'H-22 anon n''a aucun privilège de table sur les fermetures');
select ok(
  not has_function_privilege('anon',
    'public.generate_reservation_slots(uuid)', 'EXECUTE'),
  'H-23 anon ne peut pas déclencher la génération');

select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.reservation_openings'::regclass),
  'H-24 RLS active sur les horaires');
select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.reservation_closures'::regclass),
  'H-25 RLS active sur les fermetures');

select * from finish();
rollback;
