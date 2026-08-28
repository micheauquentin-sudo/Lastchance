-- ============================================================
-- LES HORAIRES RÉCURRENTS (RDV-1) — le commerçant pose ses heures une fois,
-- les créneaux se génèrent
--
-- ── LE MANQUE QUE CE FICHIER COMBLE ──
--
-- Le socle Réserver (20261002120000) sait déjà tout faire d'un créneau :
-- capacité finie, anti-surbooking sous verrou d'avis, code court, pointage à
-- l'arrivée, email de confirmation. Ce qu'il ne savait pas faire, c'est
-- EXISTER SANS SAISIE : chaque créneau était créé un par un, à la main. Un
-- commerce ouvert six jours sur sept, c'est une centaine de créneaux à saisir
-- par mois — le module était livré et inutilisable pour une prise de
-- rendez-vous.
--
-- ── CE FICHIER NE TOUCHE PAS `reserve_slot` ──
--
-- C'est la décision structurante. `reserve_slot` porte les quatre invariants
-- du socle, dont l'anti-surbooking sous verrou : le réécrire pour qu'il crée
-- le créneau à la volée aurait remis en jeu la propriété la plus chèrement
-- acquise du module. Les créneaux sont donc MATÉRIALISÉS par un générateur, en
-- amont ; la réservation continue de s'appuyer sur des lignes qui existent
-- déjà, et son code n'a pas bougé d'une ligne.
--
-- ── `generated` : LE GÉNÉRATEUR NE POSSÈDE QUE CE QU'IL A CRÉÉ ──
--
-- Changer ses horaires doit retirer les créneaux devenus faux. Sans marque
-- d'origine, la régénération aurait eu le choix entre tout effacer — emportant
-- les créneaux posés à la main pour un événement ponctuel — et ne rien
-- effacer, laissant l'ancienne grille visible à côté de la nouvelle. La
-- colonne tranche : le générateur ne supprime QUE `generated = true`, ne
-- supprime JAMAIS un créneau portant une réservation vivante, et ne touche
-- jamais au passé.
--
-- ── LES MINUTES PLUTÔT QUE `time` ──
--
-- Une règle hebdomadaire porte « de 9 h 00 à 19 h 00 » en MINUTES DEPUIS
-- MINUIT (0..1440). Un `time` aurait été plus idiomatique, mais ces bornes
-- sont lues, comparées et découpées en TypeScript pour l'aperçu du commerçant
-- comme pour l'écran joueur : un entier traverse le JSON sans forme à
-- reparser, et se teste sans horloge. 1440 est admis en borne de FIN — c'est
-- minuit du lendemain, la seule façon d'écrire « jusqu'à la fermeture ».
--
-- ── LE FUSEAU EST CELUI DE L'ORGANISATION, ET IL DÉCIDE SEUL ──
--
-- Les règles sont des heures LOCALES ; `reservation_slots.starts_at` reste un
-- instant absolu. La conversion se fait ici, à la génération, par
-- `at time zone` : c'est ce qui rend le passage à l'heure d'été correct sans
-- qu'aucune règle ne bouge. Un créneau de 9 h reste à 9 h pour le commerçant
-- des deux côtés du changement d'heure — ce qu'un décalage fixe n'aurait
-- jamais donné.
--
-- ── `booking_mode` N'EST PAS `kind` ──
--
-- `kind` (20261007120000) est le FORMAT de ce qu'on réserve : standard,
-- signature, duo — il décide l'unité de réservation. `booking_mode` dit
-- D'OÙ VIENNENT LES CRÉNEAUX : posés à la main (`moment`) ou engendrés par des
-- horaires (`rendez_vous`). Deux questions distinctes, deux colonnes : les
-- fondre aurait fait d'un « Atelier Duo » et d'une « prise de rendez-vous »
-- deux valeurs du même axe, alors qu'un rendez-vous duo est parfaitement
-- concevable.
--
-- ── CE QUE CE FICHIER NE FAIT PAS ──
--
--   * AUCUNE modification de `reserve_slot`, `cancel_reservation`,
--     `checkin_reservation` ni `reservation_public_state`. La lecture publique
--     voit les créneaux engendrés comme les autres : ce sont les mêmes lignes.
--   * AUCUN cron. La génération est déclenchée par le commerçant quand il
--     enregistre ses horaires, sur tout son horizon. Un `cron` d'entretien
--     pourra faire glisser l'horizon plus tard ; son absence ne casse rien,
--     elle raccourcit seulement l'avance disponible.
--   * AUCUN intervenant multiple (un seul agenda par activité). Décision
--     produit du 2026-08-28.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Ce que l'activité apprend
-- ────────────────────────────────────────────────────────────

alter table public.reservation_activities
  add column if not exists booking_mode text not null default 'moment',
  add column if not exists slot_capacity integer,
  add column if not exists booking_horizon_days integer not null default 30,
  add column if not exists lead_time_minutes integer not null default 0;

-- `add constraint if not exists` n'existe pas : on interroge le catalogue, seul
-- moyen de rendre ce fichier rejouable. Motif de 20261007120000:273.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::pg_catalog.regclass
       and con.conname = 'reservation_activities_booking_mode_check'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_booking_mode_check
      check (booking_mode in ('moment', 'rendez_vous'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::pg_catalog.regclass
       and con.conname = 'reservation_activities_slot_capacity_check'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_slot_capacity_check
      check (slot_capacity is null or slot_capacity between 1 and 1000);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::pg_catalog.regclass
       and con.conname = 'reservation_activities_horizon_check'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_horizon_check
      check (booking_horizon_days between 1 and 180);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::pg_catalog.regclass
       and con.conname = 'reservation_activities_lead_time_check'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_lead_time_check
      -- 0 à 14 jours. Un délai de prévenance plus long que l'horizon rendrait
      -- l'activité inréservable ; la couche applicative le dit au commerçant,
      -- la base se contente de bornes larges et sûres.
      check (lead_time_minutes between 0 and 20160);
  end if;

  -- UN RENDEZ-VOUS SANS DURÉE NI CAPACITÉ NE PEUT PAS ENGENDRER DE CRÉNEAU.
  -- La contrainte le refuse à l'écriture plutôt que de laisser le générateur
  -- rendre zéro créneau sans rien expliquer.
  if not exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservation_activities'::pg_catalog.regclass
       and con.conname = 'reservation_activities_rendez_vous_complete_check'
  ) then
    alter table public.reservation_activities
      add constraint reservation_activities_rendez_vous_complete_check
      check (
        booking_mode <> 'rendez_vous'
        or (duration_minutes is not null and duration_minutes > 0
            and slot_capacity is not null)
      );
  end if;
end
$$;

comment on column public.reservation_activities.booking_mode is
  'D''OÙ VIENNENT LES CRÉNEAUX : `moment` = posés à la main, un par un ; '
  '`rendez_vous` = engendrés par les règles de reservation_openings sur '
  'booking_horizon_days. À NE PAS CONFONDRE avec `kind`, qui est le FORMAT de '
  'ce qu''on réserve (standard / signature / duo).';
comment on column public.reservation_activities.slot_capacity is
  'Capacité posée sur CHAQUE créneau engendré. `null` tant que l''activité '
  'n''est pas en rendez-vous. 1 = un rendez-vous individuel.';
comment on column public.reservation_activities.booking_horizon_days is
  'Jusqu''où l''on engendre des créneaux à partir d''aujourd''hui. C''est aussi '
  'ce que le client peut voir : au-delà, il n''y a rien à réserver.';
comment on column public.reservation_activities.lead_time_minutes is
  'Délai de prévenance : aucun créneau n''est engendré avant now() + ce délai. '
  'Évite qu''un client réserve pour dans dix minutes.';


-- ────────────────────────────────────────────────────────────
-- 2. Le créneau sait s'il a été engendré
-- ────────────────────────────────────────────────────────────

alter table public.reservation_slots
  add column if not exists generated boolean not null default false;

comment on column public.reservation_slots.generated is
  'true = posé par generate_reservation_slots, donc à SA charge : lui seul le '
  'supprime, et seulement s''il est futur et sans réservation vivante. false = '
  'posé à la main par le commerçant ; le générateur n''y touche JAMAIS.';

-- Index de balayage du générateur : il cherche les créneaux engendrés, futurs,
-- d'une activité. Partiel — les créneaux à la main n'ont rien à y faire.
create index if not exists reservation_slots_generated_idx
  on public.reservation_slots (activity_id, starts_at)
  where generated;


-- ────────────────────────────────────────────────────────────
-- 3. Les horaires hebdomadaires
--
-- Une ligne = « le mardi, de 9 h 00 à 12 h 30 ». Plusieurs lignes par jour
-- couvrent une coupure de midi sans qu'aucune notion de « pause » n'existe :
-- deux plages valent mieux qu'une plage trouée, parce qu'une pause aurait
-- demandé sa propre grammaire (récurrente ? un seul jour ? chevauchante ?)
-- pour dire ce que deux lignes disent déjà.
-- ────────────────────────────────────────────────────────────

create table if not exists public.reservation_openings (
  id uuid primary key default gen_random_uuid(),
  -- Colonne NUE : seule la FK COMPOSITE ci-dessous relie la règle à son
  -- activité. Motif du socle — une FK d'une seule colonne ne décide pas entre
  -- deux locataires, et fk_composites_couverture la refuserait.
  activity_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- 0 = LUNDI. Le calendrier français commence le lundi, et l'écran comme la
  -- génération lisent cette colonne : caler sur le dimanche de `dow` aurait
  -- imposé une conversion à chaque lecture, donc une occasion de se tromper.
  -- La conversion depuis `extract(dow)` (0 = dimanche) se fait UNE FOIS, dans
  -- le générateur.
  weekday smallint not null check (weekday between 0 and 6),
  starts_at_minute smallint not null check (starts_at_minute between 0 and 1439),
  ends_at_minute smallint not null check (ends_at_minute between 1 and 1440),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint reservation_openings_window_check check (ends_at_minute > starts_at_minute),
  -- Deux plages ne peuvent pas commencer à la même minute le même jour : le
  -- double clic d'un éditeur doublerait sinon la grille en silence.
  constraint reservation_openings_slot_unique
    unique (activity_id, weekday, starts_at_minute),
  unique (id, organization_id),
  foreign key (activity_id, organization_id)
    references public.reservation_activities(id, organization_id) on delete cascade
);

comment on table public.reservation_openings is
  'Horaires HEBDOMADAIRES d''une activité en rendez-vous. Heures LOCALES en '
  'minutes depuis minuit ; le fuseau de l''organisation les convertit en '
  'instants à la génération, jamais ici. Org-scopée, éditeurs seulement, '
  'aucune policy anon : le parcours joueur ne lit jamais ces lignes — il lit '
  'les créneaux qu''elles ont engendrés.';

create index if not exists reservation_openings_activity_idx
  on public.reservation_openings (activity_id, weekday, starts_at_minute);
create index if not exists reservation_openings_org_idx
  on public.reservation_openings (organization_id);


-- ────────────────────────────────────────────────────────────
-- 4. Les fermetures exceptionnelles
--
-- Des JOURS, pas des instants : « fermé du 10 au 24 août » est ce que le
-- commerçant a en tête, et une fermeture à l'heure près aurait demandé de
-- saisir deux horodatages pour dire « toute la journée ».
-- ────────────────────────────────────────────────────────────

create table if not exists public.reservation_closures (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text
    check (reason is null or pg_catalog.char_length(reason) <= 200),
  created_at timestamptz not null default pg_catalog.now(),
  -- Bornes INCLUSES des deux côtés : « du 10 au 10 » ferme la journée du 10.
  constraint reservation_closures_window_check check (ends_on >= starts_on),
  unique (id, organization_id),
  foreign key (activity_id, organization_id)
    references public.reservation_activities(id, organization_id) on delete cascade
);

comment on table public.reservation_closures is
  'Fermeture exceptionnelle d''une activité, en JOURS LOCAUX, bornes incluses. '
  'Le générateur n''engendre aucun créneau dans ces journées, et supprime ceux '
  'qu''il avait déjà posés s''ils n''ont aucune réservation vivante.';

create index if not exists reservation_closures_activity_idx
  on public.reservation_closures (activity_id, starts_on, ends_on);
create index if not exists reservation_closures_org_idx
  on public.reservation_closures (organization_id);


-- ────────────────────────────────────────────────────────────
-- 5. RLS — org-scopée, éditeurs seulement, anon jamais
-- ────────────────────────────────────────────────────────────

alter table public.reservation_openings enable row level security;
alter table public.reservation_closures enable row level security;

-- Les privilèges par défaut de Supabase servent anon/authenticated sur toute
-- nouvelle table de `public` : on repart de zéro. anon n'est JAMAIS re-servi.
revoke all on table public.reservation_openings from public, anon, authenticated;
revoke all on table public.reservation_closures from public, anon, authenticated;

create policy "reservation_openings: editors" on public.reservation_openings
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "reservation_closures: editors" on public.reservation_closures
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- `organization_id` est HORS du grant d'insertion : il est posé par la server
-- action depuis la session, jamais par le formulaire. Même geste que les
-- offres de stock (20261010120000:535).
grant select on table public.reservation_openings to authenticated;
grant insert (activity_id, organization_id, weekday, starts_at_minute, ends_at_minute)
  on table public.reservation_openings to authenticated;
grant update (weekday, starts_at_minute, ends_at_minute, updated_at)
  on table public.reservation_openings to authenticated;
grant delete on table public.reservation_openings to authenticated;

grant select on table public.reservation_closures to authenticated;
grant insert (activity_id, organization_id, starts_on, ends_on, reason)
  on table public.reservation_closures to authenticated;
grant update (starts_on, ends_on, reason) on table public.reservation_closures to authenticated;
grant delete on table public.reservation_closures to authenticated;


-- ────────────────────────────────────────────────────────────
-- 6. `updated_at` — même trigger partagé que le reste du module
-- ────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) and not exists (
    select 1 from pg_catalog.pg_trigger t
     where t.tgrelid = 'public.reservation_openings'::pg_catalog.regclass
       and t.tgname = 'reservation_openings_set_updated_at'
  ) then
    create trigger reservation_openings_set_updated_at
      before update on public.reservation_openings
      for each row execute function public.set_updated_at();
  end if;
end
$$;


-- ────────────────────────────────────────────────────────────
-- 7. LE GÉNÉRATEUR
--
-- ── CE QU'IL GARANTIT ──
--
--   1. IDEMPOTENT. Rejoué sans changement, il ne crée ni ne détruit rien :
--      `on conflict (activity_id, starts_at) do nothing` s'appuie sur l'unicité
--      que le socle avait déjà posée.
--   2. IL NE DÉTRUIT JAMAIS UNE RÉSERVATION. La suppression est bornée aux
--      créneaux `generated`, FUTURS, et SANS réservation vivante — `confirmed`
--      ET `checked_in`, exactement l'ensemble que compte `reserve_slot`. Un
--      créneau réservé qui sort des horaires reste debout : le commerçant le
--      ferme ou l'annule lui-même, avec ses clients prévenus.
--   3. IL NE TOUCHE PAS AU PASSÉ. Ni suppression ni création avant
--      `now() + lead_time`. L'historique du commerce n'est pas réécrit par un
--      changement d'horaires.
--   4. IL NE TOUCHE PAS AUX CRÉNEAUX À LA MAIN (`generated = false`).
--
-- ── POURQUOI `security definer` ET `is_org_member` ──
--
-- La fonction écrit dans `reservation_slots`, dont le commerçant n'a pas le
-- grant d'insertion en masse. Elle est donc `definer`, et vérifie elle-même
-- l'appartenance : une fonction `definer` sans garde d'identité est une porte
-- ouverte sur tous les locataires.
-- ────────────────────────────────────────────────────────────

create or replace function public.generate_reservation_slots(p_activity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity public.reservation_activities%rowtype;
  v_timezone text;
  v_debut timestamptz;
  v_fin_horizon date;
  v_supprimes integer := 0;
  v_crees integer := 0;
begin
  select * into v_activity
    from public.reservation_activities
   where id = p_activity_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- L'IDENTITÉ D'ABORD : la fonction est `definer`, elle ne doit rien faire
  -- pour qui n'est pas membre de l'organisation de l'activité.
  if not public.is_org_member(v_activity.organization_id) then
    return pg_catalog.jsonb_build_object('state', 'not_authorized');
  end if;

  if v_activity.booking_mode <> 'rendez_vous' then
    return pg_catalog.jsonb_build_object('state', 'not_rendez_vous');
  end if;
  if v_activity.duration_minutes is null or v_activity.duration_minutes <= 0
     or v_activity.slot_capacity is null then
    return pg_catalog.jsonb_build_object('state', 'incomplete');
  end if;

  select o.timezone into v_timezone
    from public.organizations o
   where o.id = v_activity.organization_id;
  if v_timezone is null or not public.is_valid_timezone(v_timezone) then
    v_timezone := 'Europe/Paris';
  end if;

  -- Le plancher : rien avant maintenant + le délai de prévenance.
  v_debut := pg_catalog.now()
    + pg_catalog.make_interval(mins => v_activity.lead_time_minutes);
  -- L'horizon est un JOUR LOCAL : « 30 jours » veut dire trente journées du
  -- commerce, pas 720 heures glissantes.
  v_fin_horizon := ((pg_catalog.now() at time zone v_timezone)::date)
    + v_activity.booking_horizon_days;

  -- ── LA GRILLE ATTENDUE, PUIS L'ÉCART — EN UNE SEULE INSTRUCTION ──
  --
  -- ── POURQUOI PAS « TOUT SUPPRIMER PUIS TOUT RÉÉCRIRE » ──
  --
  -- C'était la première version, et elle était plus courte. Elle rendait aussi
  -- des IDENTIFIANTS NEUFS à chaque enregistrement d'horaires, même quand rien
  -- n'avait changé — le test H-9 l'a prise en flagrant délit. Trois
  -- conséquences, dont deux graves :
  --   · toute ligne pointant un créneau LIBRE partait avec lui — une entrée de
  --     liste d'attente, par exemple, disparaissait en silence par cascade ;
  --   · `created_at` était réécrit, donc l'ancienneté d'un créneau perdue ;
  --   · un commerçant qui corrige une faute de frappe dans ses horaires
  --     réécrivait cent lignes pour rien.
  --
  -- On calcule donc la grille ATTENDUE, et on ne touche qu'à l'écart : ce qui
  -- n'y est plus s'en va, ce qui y manque arrive. Les deux ensembles sont
  -- DISJOINTS — l'un exclut `attendus`, l'autre n'est que lui — donc l'ordre
  -- d'évaluation dans l'instruction unique n'a aucune importance, et le
  -- `delete` ne peut pas emporter une ligne que l'`insert` vient de poser.
  with jours as (
    select d::date as jour
      from pg_catalog.generate_series(
        (pg_catalog.now() at time zone v_timezone)::date,
        v_fin_horizon,
        interval '1 day'
      ) as d
  ), ouvrables as (
    select j.jour, o.starts_at_minute, o.ends_at_minute
      from jours j
      join public.reservation_openings o
        on o.activity_id = p_activity_id
       -- `date_part('dow')` rend 0 = DIMANCHE ; `weekday` porte 0 = LUNDI. La
       -- conversion vit ICI, et nulle part ailleurs.
       --
       -- `date_part` ET NON `extract` : sous `search_path = ''`, tout appel
       -- doit être qualifié — or `EXTRACT(champ FROM source)` est une
       -- CONSTRUCTION DU PARSEUR, pas une fonction appelable. La qualifier fait
       -- échouer l'analyse (« syntax error at or near "from" »).
       -- `date_part(text, date)` est sa forme fonction, et se qualifie.
       and o.weekday = ((pg_catalog.date_part('dow', j.jour)::integer + 6) % 7)
     where not exists (
       select 1 from public.reservation_closures c
        where c.activity_id = p_activity_id
          and j.jour between c.starts_on and c.ends_on
     )
  ), departs as (
    select
      ou.jour,
      pg_catalog.generate_series(
        ou.starts_at_minute,
        -- Le dernier départ possible est celui dont la FIN tient encore dans
        -- la plage : un créneau qui déborde n'est pas proposé.
        ou.ends_at_minute - v_activity.duration_minutes,
        v_activity.duration_minutes
      ) as minute_depart
      from ouvrables ou
     where ou.ends_at_minute - ou.starts_at_minute >= v_activity.duration_minutes
  -- `materialized` : `attendus` est lu DEUX fois — par la suppression et par
  -- l'insertion. Sans lui, Postgres est libre de recalculer toute la grille
  -- deux fois ; avec, elle est construite une seule fois et les deux branches
  -- lisent le même ensemble, ce qui est aussi ce qui rend leur disjonction
  -- démontrable.
  ), attendus as materialized (
    select
      ((d.jour + pg_catalog.make_interval(mins => d.minute_depart))
        at time zone v_timezone) as starts_at,
      ((d.jour + pg_catalog.make_interval(
        mins => d.minute_depart + v_activity.duration_minutes))
        at time zone v_timezone) as ends_at
      from departs d
     where ((d.jour + pg_catalog.make_interval(mins => d.minute_depart))
        at time zone v_timezone) > v_debut
  ), vivantes as (
    select distinct r.slot_id
      from public.reservations r
     where r.status in ('confirmed', 'checked_in')
  ), supprimes as (
    delete from public.reservation_slots s
     where s.activity_id = p_activity_id
       and s.generated
       and s.starts_at > v_debut
       -- JAMAIS un créneau qui porte quelqu'un, même s'il vient de sortir des
       -- horaires. Le commerçant le ferme lui-même, ses clients prévenus.
       and not exists (select 1 from vivantes v where v.slot_id = s.id)
       -- ET SEULEMENT ce qui n'est plus dans la grille attendue.
       and not exists (select 1 from attendus a where a.starts_at = s.starts_at)
    returning 1
  ), inseres as (
    insert into public.reservation_slots
      (activity_id, organization_id, starts_at, ends_at, capacity, status, generated)
    select
      p_activity_id,
      v_activity.organization_id,
      a.starts_at,
      a.ends_at,
      v_activity.slot_capacity,
      -- OUVERT D'EMBLÉE : un créneau engendré qui naîtrait en brouillon
      -- obligerait le commerçant à ouvrir cent lignes à la main, ce qui est
      -- exactement la corvée que ce fichier supprime. L'interrupteur
      -- d'ouverture reste `reservation_activities.active`, au niveau où il a
      -- un sens.
      'open',
      true
      from attendus a
    -- Le créneau existe déjà — engendré au passage précédent, ou posé à la
    -- main à cette heure-là : on ne le touche pas.
    on conflict (activity_id, starts_at) do nothing
    returning 1
  )
  select
    (select pg_catalog.count(*)::integer from supprimes),
    (select pg_catalog.count(*)::integer from inseres)
    into v_supprimes, v_crees;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'created', v_crees,
    'removed', v_supprimes,
    'horizon_until', v_fin_horizon
  );
end;
$$;

comment on function public.generate_reservation_slots(uuid) is
  'Matérialise les créneaux d''une activité en rendez-vous depuis ses horaires '
  'hebdomadaires, sur booking_horizon_days. IDEMPOTENT. Ne supprime que des '
  'créneaux ENGENDRÉS, FUTURS et SANS réservation vivante ; ne touche jamais '
  'au passé ni aux créneaux posés à la main. `reserve_slot` n''est pas modifié '
  '— ce générateur travaille en amont de lui.';

revoke all on function public.generate_reservation_slots(uuid)
  from public, anon;
grant execute on function public.generate_reservation_slots(uuid)
  to authenticated, service_role;
