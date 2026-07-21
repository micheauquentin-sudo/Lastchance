-- ============================================================
-- Lastchance — Ligues privées Pronostics
--
-- Les joueurs d'un championnat se regroupent en ligues privées
-- (collègues, famille, bande d'amis) : un créateur obtient un code
-- d'invitation court, les autres le saisissent, et le classement se
-- filtre sur la ligue — pendant le championnat comme après clôture
-- (palmarès figé). Tout le parcours joueur passe par le service role
-- (server actions), comme l'inscription et les pronostics : aucune
-- écriture directe côté clients.
--
--  1. contest_leagues / contest_league_members : tables + RLS lecture
--     membres org, écritures service role uniquement.
--  2. RPC create / join / leave — plafonds (200 ligues/championnat,
--     100 membres/ligue), code unique par championnat (alphabet sans
--     caractères ambigus, insensible à la casse à la saisie).
--  3. contest_leaderboard / contest_player_rank : paramètre optionnel
--     p_league_id — restreint aux membres de la ligue, y compris en
--     mode clôturé (contest_final_standings), même politique d'ex æquo.
-- ============================================================

-- ── 1. Tables ────────────────────────────────────────────────
create table public.contest_leagues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contest_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- Code d'invitation : 6 à 8 caractères, alphabet des codes de retrait
  -- (pas de I/O/0/1 ambigus). Unique PAR championnat.
  code text not null check (code ~ '^[A-HJ-NP-Z2-9]{6,8}$'),
  created_by uuid references public.contest_players(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (contest_id, code),
  -- FK composite : la ligue ne peut référencer qu'un championnat de SA
  -- propre organisation (même modèle que contest_matches/players).
  foreign key (contest_id, organization_id)
    references public.contests(id, organization_id) on delete cascade
);

comment on table public.contest_leagues is
  'Ligues privées d''un championnat de pronostics : code d''invitation court, classement filtré. Écritures via RPC service role uniquement.';

create index contest_leagues_org_idx on public.contest_leagues (organization_id);

alter table public.contest_leagues enable row level security;
revoke all on table public.contest_leagues from public, anon, authenticated;
-- Lecture pour l'équipe (dashboard) ; aucune écriture directe.
grant select on table public.contest_leagues to authenticated;
create policy contest_leagues_member_read on public.contest_leagues
  for select to authenticated
  using (public.is_org_member(organization_id));
grant select, insert, update, delete on table public.contest_leagues to service_role;

create table public.contest_league_members (
  league_id uuid not null references public.contest_leagues(id) on delete cascade,
  player_id uuid not null references public.contest_players(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, player_id)
);

comment on table public.contest_league_members is
  'Appartenance d''un joueur à une ligue privée. La cohérence joueur/championnat est garantie par les RPC (seules voies d''écriture).';

create index contest_league_members_player_idx
  on public.contest_league_members (player_id);

alter table public.contest_league_members enable row level security;
revoke all on table public.contest_league_members from public, anon, authenticated;
grant select on table public.contest_league_members to authenticated;
create policy contest_league_members_member_read on public.contest_league_members
  for select to authenticated
  using (exists (
    select 1 from public.contest_leagues l
     where l.id = league_id and public.is_org_member(l.organization_id)
  ));
grant select, insert, update, delete on table public.contest_league_members to service_role;

-- ── 2. RPC : création (code unique, créateur auto-inscrit) ───
create or replace function public.create_contest_league(
  p_contest_id uuid,
  p_player_id uuid,
  p_name text
)
returns table (league_id uuid, name text, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_name text;
  v_code text;
  v_id uuid;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  v_name := pg_catalog.btrim(coalesce(p_name, ''));
  if pg_catalog.char_length(v_name) not between 1 and 40 then
    raise exception 'invalid name';
  end if;

  -- Le créateur doit être un joueur inscrit à CE championnat.
  select pl.organization_id into v_org
    from public.contest_players pl
   where pl.id = p_player_id and pl.contest_id = p_contest_id;
  if v_org is null then
    raise exception 'player not in contest';
  end if;

  -- Sérialise le plafond par championnat (pas de course entre deux
  -- créations simultanées).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('contest_leagues:' || p_contest_id::text, 0)
  );
  if (select count(*) from public.contest_leagues l
       where l.contest_id = p_contest_id) >= 200 then
    raise exception 'league limit reached';
  end if;

  for attempt in 1..8 loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code
        || pg_catalog.substr(v_alphabet,
             pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
    end loop;
    begin
      insert into public.contest_leagues
        (organization_id, contest_id, name, code, created_by)
      values (v_org, p_contest_id, v_name, v_code, p_player_id)
      returning id into v_id;
      insert into public.contest_league_members (league_id, player_id)
      values (v_id, p_player_id)
      on conflict (league_id, player_id) do nothing;
      return query select v_id, v_name, v_code;
      return;
    exception when unique_violation then
      -- Collision de code : nouvelle tentative.
      null;
    end;
  end loop;
  raise exception 'code generation exhausted';
end;
$$;

revoke all on function public.create_contest_league(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_contest_league(uuid, uuid, text)
  to service_role;

-- ── RPC : rejoindre par code (idempotent, plafond 100) ───────
create or replace function public.join_contest_league(
  p_contest_id uuid,
  p_player_id uuid,
  p_code text
)
returns table (league_id uuid, name text, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_league public.contest_leagues%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select pl.organization_id into v_org
    from public.contest_players pl
   where pl.id = p_player_id and pl.contest_id = p_contest_id;
  if v_org is null then
    raise exception 'player not in contest';
  end if;

  -- Code insensible à la casse ; le verrou de ligne sérialise le
  -- plafond de membres face aux adhésions simultanées.
  select l.* into v_league
    from public.contest_leagues l
   where l.contest_id = p_contest_id
     and l.code = pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, '')))
   for update;
  if not found then
    raise exception 'invalid code';
  end if;

  -- Déjà membre : succès idempotent.
  if exists (select 1 from public.contest_league_members m
              where m.league_id = v_league.id and m.player_id = p_player_id) then
    return query select v_league.id, v_league.name, v_league.code;
    return;
  end if;

  if (select count(*) from public.contest_league_members m
       where m.league_id = v_league.id) >= 100 then
    raise exception 'league full';
  end if;

  insert into public.contest_league_members (league_id, player_id)
  values (v_league.id, p_player_id)
  on conflict (league_id, player_id) do nothing;

  return query select v_league.id, v_league.name, v_league.code;
end;
$$;

revoke all on function public.join_contest_league(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.join_contest_league(uuid, uuid, text)
  to service_role;

-- ── RPC : quitter une ligue ──────────────────────────────────
create or replace function public.leave_contest_league(
  p_contest_id uuid,
  p_player_id uuid,
  p_league_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  delete from public.contest_league_members m
   using public.contest_leagues l
   where m.league_id = p_league_id
     and l.id = m.league_id
     and l.contest_id = p_contest_id
     and m.player_id = p_player_id;
  return found;
end;
$$;

revoke all on function public.leave_contest_league(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.leave_contest_league(uuid, uuid, uuid)
  to service_role;

-- ── 3. Classement filtré par ligue ───────────────────────────
-- Changement de signature : drop + recreate propre des deux RPC
-- (corps repris de 20260721190000, la version en vigueur).
-- Dans une ligue, les rangs sont RE-NUMÉROTÉS parmi ses membres
-- (1..n, total_players = effectif de la ligue) avec la même politique
-- d'ex æquo : en direct via rank() sur le sous-ensemble, après clôture
-- en re-numérotant le palmarès figé (rangs globaux déjà départagés,
-- tirage compris — l'ordre relatif est strictement conservé).
drop function if exists public.contest_player_rank(uuid, uuid);
drop function if exists public.contest_leaderboard(uuid, integer, integer);

create or replace function public.contest_leaderboard(
  p_contest_id uuid,
  p_limit integer default 50,
  p_offset integer default 0,
  p_league_id uuid default null
)
returns table (
  player_id uuid,
  first_name text,
  avatar text,
  email text,
  total_points integer,
  exact_count integer,
  diff_count integer,
  prediction_count integer,
  rank bigint,
  total_players bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_exact integer;
  v_diff integer;
  v_answer integer;
  v_finalized timestamptz;
begin
  select c.organization_id,
         coalesce(nullif(c.scoring->>'exact', '')::integer, 3),
         coalesce(nullif(c.scoring->>'diff', '')::integer, 2),
         c.tiebreaker_answer,
         c.finalized_at
    into v_org, v_exact, v_diff, v_answer, v_finalized
    from public.contests c
   where c.id = p_contest_id;
  if v_org is null then
    return; -- championnat inconnu : zéro ligne, pas d'oracle d'existence
  end if;

  -- Serveur (pages publiques) ou propriétaire (dashboard) : les emails
  -- des joueurs font partie de la réponse, réservée à ces deux rôles.
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_owner(v_org)
  ) then
    raise exception 'not authorized';
  end if;

  -- Ligue inconnue ou d'un autre championnat : zéro ligne (même
  -- politique que le championnat inconnu, pas d'oracle).
  if p_league_id is not null and not exists (
    select 1 from public.contest_leagues l
     where l.id = p_league_id and l.contest_id = p_contest_id
  ) then
    return;
  end if;

  -- Championnat clôturé : le palmarès photographié fait foi (rangs
  -- uniques, tirage compris) — plus aucun recalcul. En ligue, on
  -- re-numérote ce palmarès sur les seuls membres.
  if v_finalized is not null then
    return query
    select s.player_id, pl.first_name, coalesce(pl.avatar, '') as avatar,
           pl.email, s.total_points, s.exact_count, s.diff_count,
           (select count(pr.player_id)::integer
              from public.contest_predictions pr
             where pr.contest_id = p_contest_id
               and pr.player_id = s.player_id
               and pr.points is not null) as prediction_count,
           case when p_league_id is null then s.rank::bigint
                else (row_number() over (order by s.rank asc))::bigint
           end as rank,
           (count(*) over ())::bigint as total_players
      from public.contest_final_standings s
      join public.contest_players pl on pl.id = s.player_id
     where s.contest_id = p_contest_id
       and (p_league_id is null or exists (
             select 1 from public.contest_league_members lm
              where lm.league_id = p_league_id
                and lm.player_id = s.player_id))
     order by s.rank asc
     limit greatest(least(coalesce(p_limit, 50), 500), 0)
    offset greatest(coalesce(p_offset, 0), 0);
    return;
  end if;

  return query
  with base as (
    select pl.id,
           pl.first_name,
           coalesce(pl.avatar, '') as avatar,
           pl.email,
           pl.created_at,
           case
             when v_answer is null or pl.tiebreaker_guess is null then null
             else pg_catalog.abs(pl.tiebreaker_guess - v_answer)
           end as tiebreaker_delta,
           coalesce(sum(pr.points), 0)::integer as total_points,
           (count(*) filter (where pr.points = v_exact))::integer as exact_count,
           (count(*) filter (where pr.points = v_diff))::integer as diff_count,
           count(pr.player_id)::integer as prediction_count
      from public.contest_players pl
      left join public.contest_predictions pr
        on pr.contest_id = pl.contest_id
       and pr.player_id = pl.id
       and pr.points is not null
     where pl.contest_id = p_contest_id
       and pl.accepted_terms = true
       and (p_league_id is null or exists (
             select 1 from public.contest_league_members lm
              where lm.league_id = p_league_id
                and lm.player_id = pl.id))
     group by pl.id, pl.first_name, pl.avatar, pl.email, pl.created_at,
              pl.tiebreaker_guess
  ),
  ranked as (
    select b.*,
           rank() over (
             order by b.total_points desc,
                      b.exact_count desc,
                      b.diff_count desc,
                      b.tiebreaker_delta asc nulls last
           ) as rnk,
           count(*) over () as total
      from base b
  )
  select r.id, r.first_name, r.avatar, r.email, r.total_points,
         r.exact_count, r.diff_count, r.prediction_count, r.rnk, r.total
    from ranked r
   order by r.rnk asc, r.created_at asc, r.id asc
   limit greatest(least(coalesce(p_limit, 50), 500), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.contest_leaderboard(uuid, integer, integer, uuid)
  from public, anon;
grant execute on function public.contest_leaderboard(uuid, integer, integer, uuid)
  to service_role, authenticated;

create or replace function public.contest_player_rank(
  p_contest_id uuid,
  p_player_id uuid,
  p_league_id uuid default null
)
returns table (
  player_id uuid,
  first_name text,
  avatar text,
  email text,
  total_points integer,
  exact_count integer,
  diff_count integer,
  prediction_count integer,
  rank bigint,
  total_players bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  return query
  select l.player_id, l.first_name, l.avatar, l.email, l.total_points,
         l.exact_count, l.diff_count, l.prediction_count, l.rank, l.total_players
    from public.contest_leaderboard(p_contest_id, 500000, 0, p_league_id) l
   where l.player_id = p_player_id;
end;
$$;

revoke all on function public.contest_player_rank(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.contest_player_rank(uuid, uuid, uuid)
  to service_role;
