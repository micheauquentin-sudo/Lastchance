-- ============================================================
-- RDV-6 — LE PLAN DE SALLE (20261108120000)
--
-- Ce que ce fichier garde, et qui ne se voit qu'un vendredi soir en salle :
--
--   1. UNE TABLE N'EST PAS DONNÉE DEUX FOIS sur une fenêtre qui se chevauche.
--      C'est LE défaut qu'une jauge par créneau ne peut pas voir : une table
--      prise à 20 h reste occupée à 20 h 15, et rien dans l'ancien modèle ne
--      le savait.
--   2. LE MEILLEUR AJUSTEMENT. Un couple ne prend pas la table de six — sans
--      quoi le groupe de six qui appelle ensuite est refusé pour rien.
--   3. `full` VEUT DIRE « aucune table assez grande », pas « plus une place ».
--      Neuf couverts libres sur deux tables ne prennent pas un groupe de cinq,
--      et c'est ce refus-là qui doit conduire à la liste d'attente.
--   4. AUCUNE RÉSERVATION DE RENDEZ-VOUS SANS TABLE, quel que soit le chemin.
--   5. L'IDEMPOTENCE, comme `reserve_slot` : re-réserver rend la même ligne.
--
-- ── LES INSTANTS SONT RELATIFS ──
--
-- Tout est ancré sur `now()`. Une fixture écrite en dur rougirait le jour où on
-- la relit, et les créneaux doivent être FUTURS — `reserve_table` refuse le
-- passé, comme le socle.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('7b7b0000-0000-4000-8000-00000000000a', 'Salle A', 'tap-tbl-a',
   'active', 'starter', 'Europe/Paris', 6);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
select '7b7b0000-0000-4000-8000-00000000000a', m.module, 'pass', 'backoffice',
       now() - interval '1 day', now() + interval '365 days'
  from (values ('vitrine'), ('reserver'), ('rendez_vous')) as m(module);

-- L'activité : pas de 15 min, table occupée 90 min.
insert into public.reservation_activities
  (id, organization_id, name, active, booking_mode,
   duration_minutes, slot_capacity, booking_horizon_days, lead_time_minutes,
   table_turn_minutes)
values
  ('7b7b0000-0000-4000-8000-000000000201',
   '7b7b0000-0000-4000-8000-00000000000a', 'Service du soir', true,
   'rendez_vous', 15, 40, 28, 0, 90),
  -- Le témoin MOMENT : ses réservations n'ont pas de table, et le trigger doit
  -- les laisser passer.
  ('7b7b0000-0000-4000-8000-000000000202',
   '7b7b0000-0000-4000-8000-00000000000a', 'Atelier', true, 'moment',
   null, null, 30, 0, null);

-- Trois tables : 2, 4 et 6 couverts.
insert into public.reservation_tables
  (id, activity_id, organization_id, name, seats)
values
  ('7b7b0000-0000-4000-8000-000000000301',
   '7b7b0000-0000-4000-8000-000000000201',
   '7b7b0000-0000-4000-8000-00000000000a', 'T1', 2),
  ('7b7b0000-0000-4000-8000-000000000302',
   '7b7b0000-0000-4000-8000-000000000201',
   '7b7b0000-0000-4000-8000-00000000000a', 'T2', 4),
  ('7b7b0000-0000-4000-8000-000000000303',
   '7b7b0000-0000-4000-8000-000000000201',
   '7b7b0000-0000-4000-8000-00000000000a', 'T3', 6);

-- Quatre créneaux à quinze minutes, tous futurs : 20h00, 20h15, 20h30 et un
-- cinquième à 22h00, HORS de la fenêtre de 90 minutes du premier.
insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status, generated)
values
  ('7b7b0000-0000-4000-8000-000000000401',
   '7b7b0000-0000-4000-8000-000000000201',
   '7b7b0000-0000-4000-8000-00000000000a',
   now() + interval '1 day', now() + interval '1 day 15 minutes', 40, 'open', true),
  ('7b7b0000-0000-4000-8000-000000000402',
   '7b7b0000-0000-4000-8000-000000000201',
   '7b7b0000-0000-4000-8000-00000000000a',
   now() + interval '1 day 15 minutes', now() + interval '1 day 30 minutes',
   40, 'open', true),
  ('7b7b0000-0000-4000-8000-000000000403',
   '7b7b0000-0000-4000-8000-000000000201',
   '7b7b0000-0000-4000-8000-00000000000a',
   now() + interval '1 day 30 minutes', now() + interval '1 day 45 minutes',
   40, 'open', true),
  -- Deux heures plus tard : la fenêtre de 90 min du premier est close.
  ('7b7b0000-0000-4000-8000-000000000404',
   '7b7b0000-0000-4000-8000-000000000201',
   '7b7b0000-0000-4000-8000-00000000000a',
   now() + interval '1 day 2 hours', now() + interval '1 day 2 hours 15 minutes',
   40, 'open', true),
  -- Le créneau du MOMENT, pour le témoin du trigger.
  ('7b7b0000-0000-4000-8000-000000000405',
   '7b7b0000-0000-4000-8000-000000000202',
   '7b7b0000-0000-4000-8000-00000000000a',
   now() + interval '1 day', now() + interval '1 day 2 hours', 10, 'open', false);

-- ════════════════════════════════════════════════════════════
-- 1. LE MEILLEUR AJUSTEMENT
-- ════════════════════════════════════════════════════════════

select is(
  (public.reserve_table(
     '7b7b0000-0000-4000-8000-00000000000a',
     '7b7b0000-0000-4000-8000-000000000401',
     repeat('a', 64), 2) ->> 'table_name'),
  'T1',
  'TBL-1 un couple reçoit la table de DEUX, pas celle de six');

select is(
  (public.reserve_table(
     '7b7b0000-0000-4000-8000-00000000000a',
     '7b7b0000-0000-4000-8000-000000000401',
     repeat('b', 64), 3) ->> 'table_name'),
  'T2',
  'TBL-2 un groupe de trois reçoit la table de QUATRE — la plus petite qui convient');

select is(
  (public.reserve_table(
     '7b7b0000-0000-4000-8000-00000000000a',
     '7b7b0000-0000-4000-8000-000000000401',
     repeat('c', 64), 5) ->> 'table_name'),
  'T3',
  'TBL-3 un groupe de cinq reçoit la table de six — il n''en reste pas d''autre');

-- ════════════════════════════════════════════════════════════
-- 2. `full` = AUCUNE TABLE ASSEZ GRANDE
-- ════════════════════════════════════════════════════════════

select is(
  (public.reserve_table(
     '7b7b0000-0000-4000-8000-00000000000a',
     '7b7b0000-0000-4000-8000-000000000401',
     repeat('d', 64), 2) ->> 'state'),
  'full',
  'TBL-4 les trois tables sont prises : le quatrième couple est refusé');

-- ════════════════════════════════════════════════════════════
-- 3. LA DURÉE D'OCCUPATION — LE CŒUR DU LOT
-- ════════════════════════════════════════════════════════════

select is(
  (public.reserve_table(
     '7b7b0000-0000-4000-8000-00000000000a',
     '7b7b0000-0000-4000-8000-000000000402',
     repeat('e', 64), 2) ->> 'state'),
  'full',
  'TBL-5 le créneau de 20 h 15 est PLEIN : les tables de 20 h sont encore occupées');

select is(
  (public.reserve_table(
     '7b7b0000-0000-4000-8000-00000000000a',
     '7b7b0000-0000-4000-8000-000000000403',
     repeat('f', 64), 2) ->> 'state'),
  'full',
  'TBL-6 …et celui de 20 h 30 aussi — la fenêtre de 90 min les couvre tous deux');

select is(
  (public.reserve_table(
     '7b7b0000-0000-4000-8000-00000000000a',
     '7b7b0000-0000-4000-8000-000000000404',
     repeat('0', 64), 2) ->> 'table_name'),
  'T1',
  'TBL-7 deux heures plus tard, la table de deux est LIBÉRÉE et réattribuée');

-- ════════════════════════════════════════════════════════════
-- 4. L'ANNULATION REND LA TABLE
-- ════════════════════════════════════════════════════════════

update public.reservations
   set status = 'cancelled', cancelled_at = now()
 where player_key_hash = repeat('a', 64);

select is(
  (public.reserve_table(
     '7b7b0000-0000-4000-8000-00000000000a',
     '7b7b0000-0000-4000-8000-000000000401',
     repeat('1', 64), 2) ->> 'table_name'),
  'T1',
  'TBL-8 une réservation annulée ne bloque plus sa table');

-- Une ARRIVÉE, elle, occupe toujours : le check-in ne libère rien.
update public.reservations
   set status = 'checked_in', checked_in_at = now()
 where player_key_hash = repeat('1', 64);

select is(
  (public.reserve_table(
     '7b7b0000-0000-4000-8000-00000000000a',
     '7b7b0000-0000-4000-8000-000000000401',
     repeat('2', 64), 2) ->> 'state'),
  'full',
  'TBL-9 une arrivée enregistrée occupe la table qu''elle honore');

-- ════════════════════════════════════════════════════════════
-- 5. IDEMPOTENCE
-- ════════════════════════════════════════════════════════════

select is(
  (public.reserve_table(
     '7b7b0000-0000-4000-8000-00000000000a',
     '7b7b0000-0000-4000-8000-000000000401',
     repeat('b', 64), 3) ->> 'table_name'),
  'T2',
  'TBL-10 re-réserver rend la MÊME table');

select is(
  (select count(*)::text from public.reservations
    where player_key_hash = repeat('b', 64)),
  '1',
  'TBL-11 …et n''a pas créé de seconde ligne');

-- ════════════════════════════════════════════════════════════
-- 6. LES REFUS
-- ════════════════════════════════════════════════════════════

select is(
  (public.reserve_table(
     '7b7b0000-0000-4000-8000-00000000000a',
     '7b7b0000-0000-4000-8000-000000000401',
     repeat('3', 64), 0) ->> 'state'),
  'invalid_party_size',
  'TBL-12 un effectif nul est refusé');

select is(
  (public.reserve_table(
     '7b7b0000-0000-4000-8000-00000000000a',
     '7b7b0000-0000-4000-8000-000000000401',
     repeat('3', 64), 99) ->> 'state'),
  'invalid_party_size',
  'TBL-13 un effectif hors bornes aussi');

select is(
  (public.reserve_table(
     '7b7b0000-0000-4000-8000-00000000000a',
     '7b7b0000-0000-4000-8000-000000000405',
     repeat('4', 64), 2) ->> 'state'),
  'unavailable',
  'TBL-14 un créneau de MOMENT n''est pas réservable par reserve_table');

select is(
  (public.reserve_table(
     '7b7b0000-0000-4000-8000-00000000000a',
     '7b7b0000-0000-4000-8000-000000000999',
     repeat('4', 64), 2) ->> 'state'),
  'unavailable',
  'TBL-15 un créneau inconnu rend `unavailable`, sans rien révéler');

-- ════════════════════════════════════════════════════════════
-- 7. LE TRIGGER — AUCUN RENDEZ-VOUS SANS TABLE
-- ════════════════════════════════════════════════════════════

select throws_ok(
  $$insert into public.reservations
      (slot_id, organization_id, player_key_hash, party_size)
    values ('7b7b0000-0000-4000-8000-000000000404',
            '7b7b0000-0000-4000-8000-00000000000a', repeat('5', 64), 2)$$,
  '23514',
  null,
  'TBL-16 une réservation de rendez-vous SANS table est refusée, quel que soit le chemin');

select lives_ok(
  $$insert into public.reservations
      (slot_id, organization_id, player_key_hash, party_size)
    values ('7b7b0000-0000-4000-8000-000000000405',
            '7b7b0000-0000-4000-8000-00000000000a', repeat('6', 64), 1)$$,
  'TBL-17 …mais un MOMENT s''en passe très bien, comme avant ce lot');

-- ════════════════════════════════════════════════════════════
-- 8. LES DISPONIBILITÉS PUBLIQUES
-- ════════════════════════════════════════════════════════════

select is(
  (public.reservation_tables_state(
     '7b7b0000-0000-4000-8000-000000000201') ->> 'state'),
  'ok',
  'TBL-18 l''état public répond pour une activité à plan de salle');

select is(
  (public.reservation_tables_state(
     '7b7b0000-0000-4000-8000-000000000201') ->> 'turn_minutes'),
  '90',
  'TBL-19 …et transporte la durée d''occupation');

-- Le créneau de 20 h : T1 et T2 sont prises (une arrivée et une confirmée),
-- T3 est prise aussi (groupe de cinq) → plus rien de plaçable.
select is(
  (select ligne->>'max_party'
     from pg_catalog.jsonb_array_elements(
       public.reservation_tables_state(
         '7b7b0000-0000-4000-8000-000000000201') -> 'slots') as ligne
    where ligne->>'slot_id' = '7b7b0000-0000-4000-8000-000000000401'),
  '0',
  'TBL-20 un créneau complet annonce un effectif plaçable de ZÉRO');

select ok(
  (select (ligne->>'max_party')::int
     from pg_catalog.jsonb_array_elements(
       public.reservation_tables_state(
         '7b7b0000-0000-4000-8000-000000000201') -> 'slots') as ligne
    where ligne->>'slot_id' = '7b7b0000-0000-4000-8000-000000000404') >= 4,
  'TBL-21 un créneau libéré annonce le plus grand effectif encore plaçable');

select ok(
  (public.reservation_tables_state(
     '7b7b0000-0000-4000-8000-000000000202') ->> 'state') = 'unavailable',
  'TBL-22 une activité MOMENT n''a pas d''état de plan de salle');

-- L'ÉTAT PUBLIC NE DIT NI LES NOMS DE TABLE NI QUI LES OCCUPE.
--
-- ASSERTION SUR LA FORME, ET NON SUR LE TEXTE. La première écriture cherchait
-- la sous-chaîne « T1 » dans le JSON : elle a trouvé le « T » séparateur d'un
-- horodatage ISO — `…T19:00` — et criait à la fuite sur un document
-- parfaitement propre. On énumère donc les CLÉS rendues : ce qui n'y est pas
-- ne peut pas fuir, et un champ ajouté par mégarde fera rougir ce test.
select is(
  (select array_agg(cle order by cle)::text
     from pg_catalog.jsonb_object_keys(
       (public.reservation_tables_state(
          '7b7b0000-0000-4000-8000-000000000201') -> 'slots') -> 0) as cle),
  '{max_party,slot_id,starts_at}',
  'TBL-23 l''état public ne rend QUE l''heure, le créneau et l''effectif plaçable');

select ok(
  public.reservation_tables_state(
    '7b7b0000-0000-4000-8000-000000000201')::text not like '%' || repeat('a', 64) || '%',
  'TBL-23b …et aucune empreinte de joueur');

-- ════════════════════════════════════════════════════════════
-- 9. ACL
-- ════════════════════════════════════════════════════════════

select ok(not has_table_privilege('anon', 'public.reservation_tables', 'SELECT'),
  'TBL-24 anon n''a aucun privilège de table sur le plan de salle');
select ok(
  not has_function_privilege('anon',
    'public.reserve_table(uuid, uuid, text, integer, text, boolean)', 'EXECUTE'),
  'TBL-25 anon ne peut pas réserver directement');
select ok(
  not has_function_privilege('authenticated',
    'public.reserve_table(uuid, uuid, text, integer, text, boolean)', 'EXECUTE'),
  'TBL-26 une session marchande non plus : le chemin passe par le serveur');
select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.reservation_tables'::regclass),
  'TBL-27 RLS active sur le plan de salle');

-- La garde de rôle MORD, et pas seulement le grant.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.reserve_table(
      '7b7b0000-0000-4000-8000-00000000000a',
      '7b7b0000-0000-4000-8000-000000000404', repeat('7', 64), 2)$$,
  '42501', 'not authorized',
  'TBL-28 la garde auth.role() de reserve_table mord');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select * from finish();
rollback;
