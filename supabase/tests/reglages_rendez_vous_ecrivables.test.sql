-- ============================================================
-- LES RÉGLAGES DE RENDEZ-VOUS S'ÉCRIVENT — 20261112120000 (RDV-12)
--
-- Le défaut que ces assertions ferment a survécu à six lots : quatre colonnes
-- posées sans droit d'écriture, et un module entier bâti dessus.
-- ============================================================

begin;
select plan(10);


-- ────────────────────────────────────────────────────────────
-- RRV-1..5 · CE QUI SE MODIFIE
--
-- Sans ces cinq droits, `enregistrerReglagesRendezVous` et
-- `enregistrerDureeService` échouent sur « permission denied for column » —
-- et l'écran affiche « Enregistrement impossible » sans dire pourquoi.
-- ────────────────────────────────────────────────────────────

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.reservation_activities', 'booking_mode', 'UPDATE'),
  'RRV-1 · booking_mode se modifie : sans lui aucune activité ne devient un rendez-vous'
);

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.reservation_activities', 'slot_capacity', 'UPDATE'),
  'RRV-2 · slot_capacity se modifie — la contrainte de complétude l''exige avec le mode'
);

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.reservation_activities', 'booking_horizon_days', 'UPDATE'),
  'RRV-3 · booking_horizon_days se modifie'
);

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.reservation_activities', 'lead_time_minutes', 'UPDATE'),
  'RRV-4 · lead_time_minutes se modifie'
);

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.reservation_activities', 'table_turn_minutes', 'UPDATE'),
  'RRV-5 · table_turn_minutes se modifie — l''étape « durée de service » de l''assistant'
);


-- ────────────────────────────────────────────────────────────
-- RRV-6..7 · CE QUI S'INSÈRE
--
-- Le mode est posé À LA CRÉATION depuis RDV-11 : une salle créée depuis
-- l'écran Réservation doit naître `rendez_vous`, sinon elle sort du filtre de
-- sa propre page à la seconde suivante.
-- ────────────────────────────────────────────────────────────

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.reservation_activities', 'booking_mode', 'INSERT'),
  'RRV-6 · booking_mode s''insère : une salle naît rendez-vous, pas Moment'
);

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.reservation_activities', 'slot_capacity', 'INSERT'),
  'RRV-7 · slot_capacity s''insère avec lui — la contrainte de complétude est vérifiée à l''écriture'
);


-- ────────────────────────────────────────────────────────────
-- RRV-8..9 · CE QUI DOIT RESTER FERMÉ
--
-- ON NE DÉPLACE PAS UNE ACTIVITÉ. `organization_id` est bien INSÉRABLE —
-- le socle l'accorde, et il le doit : la server action l'écrit depuis la
-- session. Ce qui empêche un formulaire de déclarer l'organisation du
-- voisin est la policy (`with check (is_org_editor(...))`), pas le grant.
--
-- En revanche aucun `grant update` ne l'a jamais couverte, et c'est là que
-- tient la garde : lui en ouvrir un laisserait un éditeur transférer son
-- activité — créneaux, réservations et arrivées compris — chez un autre.
-- ────────────────────────────────────────────────────────────

select ok(
  not pg_catalog.has_column_privilege(
    'authenticated', 'public.reservation_activities', 'organization_id', 'UPDATE'),
  'RRV-8 · organization_id ne se MODIFIE pas : une activité ne change pas d''organisation'
);

select ok(
  not pg_catalog.has_column_privilege(
    'anon', 'public.reservation_activities', 'booking_mode', 'UPDATE'),
  'RRV-9 · anon ne modifie rien, mode compris'
);


-- ────────────────────────────────────────────────────────────
-- RRV-10 · LE MODE SE POSE VRAIMENT, contrainte comprise
--
-- Les neuf assertions ci-dessus lisent le catalogue. Celle-ci ÉCRIT : elle
-- prouve qu'une activité complète passe en rendez-vous sans se heurter à
-- `reservation_activities_rendez_vous_complete_check`, qui est le second mur
-- derrière le grant.
-- ────────────────────────────────────────────────────────────

do $$
declare
  v_org uuid;
  v_activite uuid;
begin
  insert into public.organizations (name, slug)
  values ('Salle RRV', 'salle-rrv-' || pg_catalog.substr(gen_random_uuid()::text, 1, 8))
  returning id into v_org;

  insert into public.reservation_activities
    (organization_id, name, active, booking_mode, duration_minutes, slot_capacity)
  values (v_org, 'Le Comptoir RRV', true, 'rendez_vous', 30, 1)
  returning id into v_activite;

  update public.reservation_activities
     set booking_horizon_days = 45,
         lead_time_minutes = 60,
         table_turn_minutes = 120
   where id = v_activite;
end
$$;

select is(
  (select booking_mode || '/' || booking_horizon_days || '/' || table_turn_minutes
     from public.reservation_activities
    where name = 'Le Comptoir RRV'),
  'rendez_vous/45/120',
  'RRV-10 · une salle naît en rendez-vous et se règle, contrainte de complétude satisfaite'
);


select * from finish();
rollback;
