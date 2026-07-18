-- ============================================================
-- LastChance — Durcissement du module Pronostics
-- ============================================================
-- Cette migration est volontairement séparée de 00022 : elle peut être
-- appliquée sur une base où le module a déjà été déployé.

-- 1. `organizations` utilise des grants de colonnes (00017). Une colonne
-- ajoutée ensuite n'est pas lisible automatiquement par authenticated.
grant select (addon_pronostics) on public.organizations to authenticated;
comment on column public.organizations.addon_pronostics is
  'Module Pronostics activé depuis le back-office (option payante)';

-- Preuve du consentement aux règles et à l'affichage du prénom. Les lignes
-- éventuellement créées avant ce durcissement restent explicitement `false` :
-- on ne fabrique jamais un consentement rétroactif.
alter table public.contest_players
  add column accepted_terms boolean not null default false;

-- 2. Validation en base des deux documents jsonb éditables. La validation
-- Zod reste utile pour les messages d'erreur, mais un client PostgREST peut
-- appeler la base directement avec sa session : l'invariant doit donc aussi
-- vivre dans PostgreSQL.
create or replace function public.is_valid_contest_scoring(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_exact numeric;
  v_diff numeric;
  v_winner numeric;
begin
  if jsonb_typeof(p_value) <> 'object'
    or jsonb_typeof(p_value -> 'exact') <> 'number'
    or jsonb_typeof(p_value -> 'diff') <> 'number'
    or jsonb_typeof(p_value -> 'winner') <> 'number'
  then
    return false;
  end if;

  v_exact := (p_value ->> 'exact')::numeric;
  v_diff := (p_value ->> 'diff')::numeric;
  v_winner := (p_value ->> 'winner')::numeric;

  return trunc(v_exact) = v_exact and v_exact between 0 and 100
    and trunc(v_diff) = v_diff and v_diff between 0 and 100
    and trunc(v_winner) = v_winner and v_winner between 0 and 100;
exception when others then
  return false;
end;
$$;

create or replace function public.is_valid_contest_rewards(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_item jsonb;
  v_from numeric;
  v_to numeric;
  v_label text;
begin
  if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 20 then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_value)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or jsonb_typeof(v_item -> 'from') <> 'number'
      or jsonb_typeof(v_item -> 'to') <> 'number'
      or jsonb_typeof(v_item -> 'label') <> 'string'
    then
      return false;
    end if;

    v_from := (v_item ->> 'from')::numeric;
    v_to := (v_item ->> 'to')::numeric;
    v_label := btrim(v_item ->> 'label');

    if trunc(v_from) <> v_from or v_from < 1 or v_from > 999
      or trunc(v_to) <> v_to or v_to < v_from or v_to > 999
      or char_length(v_label) < 1 or char_length(v_label) > 120
    then
      return false;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_value) with ordinality a(value, position)
    join jsonb_array_elements(p_value) with ordinality b(value, position)
      on a.position < b.position
    where (a.value ->> 'from')::numeric <= (b.value ->> 'to')::numeric
      and (b.value ->> 'from')::numeric <= (a.value ->> 'to')::numeric
  ) then
    return false;
  end if;

  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.is_valid_contest_scoring(jsonb) from public, anon;
revoke all on function public.is_valid_contest_rewards(jsonb) from public, anon;
grant execute on function public.is_valid_contest_scoring(jsonb) to authenticated, service_role;
grant execute on function public.is_valid_contest_rewards(jsonb) to authenticated, service_role;

alter table public.contests
  add constraint contests_scoring_valid_check
    check (public.is_valid_contest_scoring(scoring)) not valid,
  add constraint contests_rewards_valid_check
    check (public.is_valid_contest_rewards(rewards)) not valid;
alter table public.contests validate constraint contests_scoring_valid_check;
alter table public.contests validate constraint contests_rewards_valid_check;

alter table public.contests
  add constraint contests_slug_format_check
    check (slug ~ '^[A-Za-z0-9-]{4,64}$') not valid,
  add constraint contests_name_length_check
    check (char_length(btrim(name)) between 1 and 120) not valid,
  add constraint contests_competition_key_length_check
    check (char_length(competition_key) between 1 and 40) not valid;
alter table public.contest_matches
  add constraint contest_matches_names_length_check
    check (
      char_length(btrim(home_name)) between 1 and 60
      and char_length(btrim(away_name)) between 1 and 60
    ) not valid,
  add constraint contest_matches_keys_length_check
    check (char_length(home_key) <= 40 and char_length(away_key) <= 40) not valid,
  add constraint contest_matches_badges_length_check
    check (char_length(home_badge) <= 16 and char_length(away_badge) <= 16) not valid,
  add constraint contest_matches_colors_format_check
    check (
      (home_color = '' or home_color ~ '^#[0-9A-Fa-f]{6}$')
      and (away_color = '' or away_color ~ '^#[0-9A-Fa-f]{6}$')
    ) not valid;
alter table public.contest_players
  add constraint contest_players_identity_length_check
    check (
      char_length(btrim(first_name)) between 1 and 60
      and (email is null or char_length(email) <= 254)
      and (phone is null or char_length(phone) between 6 and 20)
    ) not valid,
  add constraint contest_players_token_hash_format_check
    check (token_hash ~ '^[0-9a-f]{64}$') not valid;

alter table public.contests validate constraint contests_slug_format_check;
alter table public.contests validate constraint contests_name_length_check;
alter table public.contests validate constraint contests_competition_key_length_check;
alter table public.contest_matches validate constraint contest_matches_names_length_check;
alter table public.contest_matches validate constraint contest_matches_keys_length_check;
alter table public.contest_matches validate constraint contest_matches_badges_length_check;
alter table public.contest_matches validate constraint contest_matches_colors_format_check;
alter table public.contest_players validate constraint contest_players_identity_length_check;
alter table public.contest_players validate constraint contest_players_token_hash_format_check;

-- 3. Intégrité inter-tenant : chaque relation transporte contest_id ET
-- organization_id. Une erreur applicative ou un appel PostgREST direct ne
-- peut plus relier un match/joueur/pronostic à une autre organisation.
alter table public.contests
  add constraint contests_id_org_unique unique (id, organization_id);
alter table public.contest_matches
  add constraint contest_matches_id_contest_org_unique
    unique (id, contest_id, organization_id),
  add constraint contest_matches_contest_org_fk
    foreign key (contest_id, organization_id)
    references public.contests(id, organization_id)
    on delete cascade not valid;
alter table public.contest_players
  add constraint contest_players_id_contest_org_unique
    unique (id, contest_id, organization_id),
  add constraint contest_players_contest_org_fk
    foreign key (contest_id, organization_id)
    references public.contests(id, organization_id)
    on delete cascade not valid;
alter table public.contest_predictions
  add constraint contest_predictions_contest_org_fk
    foreign key (contest_id, organization_id)
    references public.contests(id, organization_id)
    on delete cascade not valid,
  add constraint contest_predictions_match_contest_org_fk
    foreign key (match_id, contest_id, organization_id)
    references public.contest_matches(id, contest_id, organization_id)
    on delete cascade not valid,
  add constraint contest_predictions_player_contest_org_fk
    foreign key (player_id, contest_id, organization_id)
    references public.contest_players(id, contest_id, organization_id)
    on delete cascade not valid;

alter table public.contest_matches
  validate constraint contest_matches_contest_org_fk;
alter table public.contest_players
  validate constraint contest_players_contest_org_fk;
alter table public.contest_predictions
  validate constraint contest_predictions_contest_org_fk;
alter table public.contest_predictions
  validate constraint contest_predictions_match_contest_org_fk;
alter table public.contest_predictions
  validate constraint contest_predictions_player_contest_org_fk;

-- 4. Les emails/téléphones, jetons et grilles sont des données personnelles.
-- Comme participations/newsletter, leur lecture directe est owner-only. Les
-- écritures publiques passent par les RPC service_role ci-dessous ; un
-- commerçant ne peut pas réécrire le pronostic d'un client via PostgREST.
drop policy if exists "contest_players: editors" on public.contest_players;
drop policy if exists "contest_predictions: editors" on public.contest_predictions;

create policy "contest_players: owner select" on public.contest_players
  for select to authenticated
  using (public.is_org_owner(organization_id));
create policy "contest_predictions: owner select" on public.contest_predictions
  for select to authenticated
  using (public.is_org_owner(organization_id));

revoke insert, update, delete on public.contest_players from authenticated;
revoke insert, update, delete on public.contest_predictions from authenticated;

-- Les deux champs qui déclenchent un recalcul ne sont modifiables que par les
-- RPC transactionnelles. Les autres réglages restent éditables sous RLS.
revoke update on public.contests from authenticated;
grant update (name, status, rewards, collect_email, collect_phone)
  on public.contests to authenticated;
revoke update on public.contest_matches from authenticated;

-- 5. Calcul unique des points, utilisé dans les deux transactions métier.
create or replace function public.contest_prediction_points(
  p_scoring jsonb,
  p_actual_home integer,
  p_actual_away integer,
  p_predicted_home integer,
  p_predicted_away integer
)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_predicted_home = p_actual_home and p_predicted_away = p_actual_away
      then (p_scoring ->> 'exact')::integer
    when p_predicted_home - p_predicted_away = p_actual_home - p_actual_away
      then (p_scoring ->> 'diff')::integer
    when sign(p_predicted_home - p_predicted_away) = sign(p_actual_home - p_actual_away)
      then (p_scoring ->> 'winner')::integer
    else 0
  end
$$;

revoke all on function public.contest_prediction_points(jsonb,integer,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.contest_prediction_points(jsonb,integer,integer,integer,integer)
  to service_role;

-- Enregistrement public atomique. Le verrou sur championnat + match ferme la
-- course « validation juste avant le coup d'envoi, écriture juste après » et
-- sérialise la saisie d'un résultat concurrente.
create or replace function public.submit_contest_prediction(
  p_contest_id uuid,
  p_match_id uuid,
  p_player_id uuid,
  p_home_score integer,
  p_away_score integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
begin
  if p_home_score is null or p_away_score is null
    or p_home_score not between 0 and 99 or p_away_score not between 0 and 99
  then
    return false;
  end if;

  select m.organization_id
    into v_organization_id
  from public.contest_matches m
  join public.contests c
    on c.id = m.contest_id and c.organization_id = m.organization_id
  where c.id = p_contest_id
    and m.id = p_match_id
    and c.status = 'active'
    and m.status = 'scheduled'
    and m.kickoff_at > pg_catalog.clock_timestamp()
  for update of c, m;

  if not found then return false; end if;

  perform 1
  from public.contest_players p
  where p.id = p_player_id
    and p.contest_id = p_contest_id
    and p.organization_id = v_organization_id;
  if not found then return false; end if;

  insert into public.contest_predictions (
    contest_id, organization_id, match_id, player_id,
    home_score, away_score, updated_at
  ) values (
    p_contest_id, v_organization_id, p_match_id, p_player_id,
    p_home_score, p_away_score, pg_catalog.now()
  )
  on conflict (match_id, player_id) do update
    set home_score = excluded.home_score,
        away_score = excluded.away_score,
        points = null,
        updated_at = pg_catalog.now();

  return true;
end;
$$;

revoke all on function public.submit_contest_prediction(uuid,uuid,uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function public.submit_contest_prediction(uuid,uuid,uuid,integer,integer)
  to service_role;

-- Résultat + recalcul de toutes les grilles : une seule transaction. Une
-- erreur ne peut plus laisser un match « terminé » avec un classement partiel.
create or replace function public.set_contest_match_result(
  p_organization_id uuid,
  p_match_id uuid,
  p_home_score integer,
  p_away_score integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest_id uuid;
  v_scoring jsonb;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_home_score is null or p_away_score is null
    or p_home_score not between 0 and 99 or p_away_score not between 0 and 99
  then
    raise exception 'invalid score';
  end if;

  select c.id, c.scoring
    into v_contest_id, v_scoring
  from public.contests c
  join public.contest_matches m
    on m.contest_id = c.id and m.organization_id = c.organization_id
  where c.organization_id = p_organization_id and m.id = p_match_id
  for update of c, m;

  if not found then return false; end if;

  update public.contest_matches
  set home_score = p_home_score,
      away_score = p_away_score,
      status = 'finished'
  where id = p_match_id
    and contest_id = v_contest_id
    and organization_id = p_organization_id;

  update public.contest_predictions p
  set points = public.contest_prediction_points(
        v_scoring, p_home_score, p_away_score, p.home_score, p.away_score
      ),
      updated_at = pg_catalog.now()
  where p.match_id = p_match_id
    and p.contest_id = v_contest_id
    and p.organization_id = p_organization_id;

  return true;
end;
$$;

revoke all on function public.set_contest_match_result(uuid,uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function public.set_contest_match_result(uuid,uuid,integer,integer)
  to authenticated, service_role;

-- Un changement de barème recalcule immédiatement tous les matchs déjà joués.
create or replace function public.update_contest_scoring(
  p_organization_id uuid,
  p_contest_id uuid,
  p_exact integer,
  p_diff integer,
  p_winner integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scoring jsonb;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_exact is null or p_diff is null or p_winner is null
    or p_exact not between 0 and 100
    or p_diff not between 0 and 100
    or p_winner not between 0 and 100
  then
    raise exception 'invalid scoring';
  end if;

  v_scoring := jsonb_build_object(
    'exact', p_exact,
    'diff', p_diff,
    'winner', p_winner
  );

  perform 1
  from public.contests c
  where c.id = p_contest_id and c.organization_id = p_organization_id
  for update;
  if not found then return false; end if;

  update public.contests
  set scoring = v_scoring
  where id = p_contest_id and organization_id = p_organization_id;

  update public.contest_predictions p
  set points = public.contest_prediction_points(
        v_scoring, m.home_score, m.away_score, p.home_score, p.away_score
      ),
      updated_at = pg_catalog.now()
  from public.contest_matches m
  where p.contest_id = p_contest_id
    and p.organization_id = p_organization_id
    and m.id = p.match_id
    and m.contest_id = p.contest_id
    and m.organization_id = p.organization_id
    and m.status = 'finished'
    and m.home_score is not null
    and m.away_score is not null;

  return true;
end;
$$;

revoke all on function public.update_contest_scoring(uuid,uuid,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.update_contest_scoring(uuid,uuid,integer,integer,integer)
  to authenticated, service_role;

-- 6. La purge RGPD historique ne connaissait pas encore les joueurs de
-- championnats. Leur suppression cascade vers les pronostics associés.
create or replace function public.purge_expired_contest_players()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.contest_players p
  using public.organizations o
  where p.organization_id = o.id
    and o.data_retention_months is not null
    and p.created_at < pg_catalog.now()
      - pg_catalog.make_interval(months => o.data_retention_months);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_contest_players()
  from public, anon, authenticated;
grant execute on function public.purge_expired_contest_players()
  to service_role;
