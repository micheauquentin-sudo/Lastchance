-- ============================================================
-- Lastchance — Règles de compétition Pronostics (audit #5)
--
-- 1. Politique d'ex æquo explicite : points > nb de scores exacts >
--    nb de bons écarts > question subsidiaire (écart absolu) > tirage
--    auditable (hash déterministe, appliqué UNIQUEMENT à la clôture).
-- 2. Gel du règlement : après le premier pronostic ou le premier coup
--    d'envoi, barème et récompenses ne changent qu'avec un motif
--    journalisé ; après clôture, plus rien ne change et le championnat
--    ne peut pas être rouvert.
-- 3. Clôture : photographie du classement final
--    (contest_final_standings) + attribution des récompenses
--    (contest_awards : rang, joueur, lot, code de retrait, statut).
-- ============================================================

-- ── Colonnes nouvelles ───────────────────────────────────────
alter table public.contests
  add column if not exists tiebreaker_question text
    check (tiebreaker_question is null
           or char_length(tiebreaker_question) between 1 and 160),
  add column if not exists tiebreaker_answer integer
    check (tiebreaker_answer is null
           or tiebreaker_answer between 0 and 1000000),
  add column if not exists finalized_at timestamptz;

comment on column public.contests.tiebreaker_question is
  'Question subsidiaire optionnelle (ex. « Total de buts de la compétition ? ») — départage les ex æquo.';
comment on column public.contests.tiebreaker_answer is
  'Réponse officielle, saisie au plus tard à la clôture.';
comment on column public.contests.finalized_at is
  'Clôture des récompenses : classement photographié, récompenses attribuées, règlement figé à jamais.';

alter table public.contest_players
  add column if not exists tiebreaker_guess integer
    check (tiebreaker_guess is null
           or tiebreaker_guess between 0 and 1000000);

-- ── Verrou de règlement ──────────────────────────────────────
-- Un championnat est « verrouillé » dès le premier pronostic déposé ou
-- le premier coup d'envoi passé : le règlement ne bouge plus sans motif.
create or replace function public.contest_is_locked(p_contest_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select c.organization_id into v_org
    from public.contests c where c.id = p_contest_id;
  if v_org is null then
    return false;
  end if;
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_member(v_org)
  ) then
    raise exception 'not authorized';
  end if;
  return exists (
    select 1 from public.contest_predictions p
     where p.contest_id = p_contest_id
  ) or exists (
    select 1 from public.contest_matches m
     where m.contest_id = p_contest_id
       and m.kickoff_at <= pg_catalog.now()
  );
end;
$$;

revoke all on function public.contest_is_locked(uuid) from public, anon;
grant execute on function public.contest_is_locked(uuid) to authenticated, service_role;

-- ── Barème : gel + motif obligatoire une fois verrouillé ─────
drop function if exists public.update_contest_scoring(uuid, uuid, integer, integer, integer);

create or replace function public.update_contest_scoring(
  p_organization_id uuid,
  p_contest_id uuid,
  p_exact integer,
  p_diff integer,
  p_winner integer,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_scoring jsonb;
  v_finalized timestamptz;
  v_scoring jsonb;
  v_locked boolean;
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
  -- Paliers strictement décroissants : le départage par « nb d'exacts »
  -- puis « nb de bons écarts » exige des paliers distincts.
  if not (p_exact > p_diff and p_diff > p_winner) then
    raise exception 'scoring tiers must be strictly decreasing';
  end if;

  v_scoring := pg_catalog.jsonb_build_object(
    'exact', p_exact,
    'diff', p_diff,
    'winner', p_winner
  );

  select c.scoring, c.finalized_at into v_previous_scoring, v_finalized
  from public.contests c
  where c.id = p_contest_id and c.organization_id = p_organization_id
  for update;
  if not found then return false; end if;

  if v_previous_scoring is not distinct from v_scoring then
    return true; -- aucun changement
  end if;
  if v_finalized is not null then
    raise exception 'contest finalized';
  end if;
  v_locked := public.contest_is_locked(p_contest_id);
  if v_locked and (p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 10) then
    raise exception 'locked: reason required';
  end if;

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

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'contest.scoring.update',
    pg_catalog.jsonb_build_object(
      'contest_id', p_contest_id,
      'previous', v_previous_scoring,
      'next', v_scoring,
      'locked', v_locked,
      'reason', case when v_locked then pg_catalog.btrim(p_reason) end
    )
  );
  return true;
end;
$$;

revoke all on function public.update_contest_scoring(uuid,uuid,integer,integer,integer,text)
  from public, anon;
grant execute on function public.update_contest_scoring(uuid,uuid,integer,integer,integer,text)
  to authenticated, service_role;

-- ── Récompenses : mêmes règles de gel, via RPC auditée ───────
create or replace function public.update_contest_rewards(
  p_organization_id uuid,
  p_contest_id uuid,
  p_rewards jsonb,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous jsonb;
  v_finalized timestamptz;
  v_locked boolean;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_rewards is null or not public.is_valid_contest_rewards(p_rewards) then
    raise exception 'invalid rewards';
  end if;

  select c.rewards, c.finalized_at into v_previous, v_finalized
  from public.contests c
  where c.id = p_contest_id and c.organization_id = p_organization_id
  for update;
  if not found then return false; end if;

  if v_previous is not distinct from p_rewards then
    return true;
  end if;
  if v_finalized is not null then
    raise exception 'contest finalized';
  end if;
  v_locked := public.contest_is_locked(p_contest_id);
  if v_locked and (p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 10) then
    raise exception 'locked: reason required';
  end if;

  update public.contests
  set rewards = p_rewards
  where id = p_contest_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'contest.rewards.update',
    pg_catalog.jsonb_build_object(
      'contest_id', p_contest_id,
      'previous', v_previous,
      'next', p_rewards,
      'locked', v_locked,
      'reason', case when v_locked then pg_catalog.btrim(p_reason) end
    )
  );
  return true;
end;
$$;

revoke all on function public.update_contest_rewards(uuid,uuid,jsonb,text)
  from public, anon;
grant execute on function public.update_contest_rewards(uuid,uuid,jsonb,text)
  to authenticated, service_role;

-- ── Question subsidiaire : configurable tant que non verrouillé ──
create or replace function public.update_contest_tiebreaker(
  p_organization_id uuid,
  p_contest_id uuid,
  p_question text,
  p_answer integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev_question text;
  v_prev_answer integer;
  v_finalized timestamptz;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_question is not null and pg_catalog.char_length(pg_catalog.btrim(p_question)) not between 1 and 160 then
    raise exception 'invalid question';
  end if;
  if p_answer is not null and p_answer not between 0 and 1000000 then
    raise exception 'invalid answer';
  end if;

  select c.tiebreaker_question, c.tiebreaker_answer, c.finalized_at
    into v_prev_question, v_prev_answer, v_finalized
  from public.contests c
  where c.id = p_contest_id and c.organization_id = p_organization_id
  for update;
  if not found then return false; end if;
  if v_finalized is not null then
    raise exception 'contest finalized';
  end if;
  -- La QUESTION est figée dès le verrou (les joueurs y ont répondu) ;
  -- la RÉPONSE officielle, elle, arrive naturellement en fin de saison.
  if public.contest_is_locked(p_contest_id)
     and pg_catalog.btrim(coalesce(p_question, '')) is distinct from pg_catalog.btrim(coalesce(v_prev_question, ''))
  then
    raise exception 'locked: question frozen';
  end if;

  update public.contests
  set tiebreaker_question = pg_catalog.nullif(pg_catalog.btrim(coalesce(p_question, '')), ''),
      tiebreaker_answer = p_answer
  where id = p_contest_id and organization_id = p_organization_id;

  if (v_prev_question, v_prev_answer) is distinct from (p_question, p_answer) then
    insert into public.audit_logs (organization_id, actor, action, metadata)
    values (
      p_organization_id,
      coalesce(auth.uid()::text, auth.role(), 'system'),
      'contest.tiebreaker.update',
      pg_catalog.jsonb_build_object(
        'contest_id', p_contest_id,
        'previous', pg_catalog.jsonb_build_object('question', v_prev_question, 'answer', v_prev_answer),
        'next', pg_catalog.jsonb_build_object('question', p_question, 'answer', p_answer)
      )
    );
  end if;
  return true;
end;
$$;

revoke all on function public.update_contest_tiebreaker(uuid,uuid,text,integer)
  from public, anon;
grant execute on function public.update_contest_tiebreaker(uuid,uuid,text,integer)
  to authenticated, service_role;

-- ── Statut : transitions contrôlées, réouverture bloquée ─────
create or replace function public.set_contest_status(
  p_organization_id uuid,
  p_contest_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_finalized timestamptz;
  v_needs_reason boolean := false;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('draft', 'active', 'finished') then
    raise exception 'invalid status';
  end if;

  select c.status, c.finalized_at into v_current, v_finalized
  from public.contests c
  where c.id = p_contest_id and c.organization_id = p_organization_id
  for update;
  if not found then return false; end if;

  if v_current = p_status then
    return true;
  end if;
  -- Un championnat clôturé (récompenses attribuées) ne bouge plus.
  if v_finalized is not null then
    raise exception 'contest finalized';
  end if;
  -- Transitions permises : draft↔active, active→finished,
  -- finished→active (réouverture motivée tant que non clôturé).
  if not (
    (v_current = 'draft' and p_status = 'active')
    or (v_current = 'active' and p_status in ('draft', 'finished'))
    or (v_current = 'finished' and p_status = 'active')
  ) then
    raise exception 'invalid transition';
  end if;
  -- Motif obligatoire pour retirer un championnat en cours de route ou
  -- le rouvrir après l'avoir terminé.
  v_needs_reason := (v_current = 'finished' and p_status = 'active')
    or (v_current = 'active' and p_status = 'draft'
        and public.contest_is_locked(p_contest_id));
  if v_needs_reason
     and (p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 10)
  then
    raise exception 'locked: reason required';
  end if;

  update public.contests
  set status = p_status
  where id = p_contest_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'contest.status.update',
    pg_catalog.jsonb_build_object(
      'contest_id', p_contest_id,
      'previous', v_current,
      'next', p_status,
      'reason', case when v_needs_reason then pg_catalog.btrim(p_reason) end
    )
  );
  return true;
end;
$$;

revoke all on function public.set_contest_status(uuid,uuid,text,text)
  from public, anon;
grant execute on function public.set_contest_status(uuid,uuid,text,text)
  to authenticated, service_role;

-- Statut et récompenses ne s'écrivent plus qu'à travers les RPC
-- ci-dessus (00023 accordait la mise à jour directe de ces colonnes).
revoke update on public.contests from authenticated;
grant update (name, collect_email, collect_phone)
  on public.contests to authenticated;

-- ── Suppression de match : gardes d'origine (20260719040000) + gel ──
-- Reprend intégralement l'existant (service role ou éditeur, refus des
-- matchs gérés par le fournisseur, audit avec statut et pronostics
-- supprimés) et ajoute : refus après clôture, motif obligatoire dès
-- qu'un pronostic serait effacé (le classement change).
drop function if exists public.delete_contest_match(uuid, uuid);

create or replace function public.delete_contest_match(
  p_organization_id uuid,
  p_match_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contest_id uuid;
  v_status text;
  v_external_ref text;
  v_prediction_count bigint;
  v_finalized timestamptz;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_editor(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;

  select m.contest_id, m.status, m.external_ref,
         (select pg_catalog.count(*) from public.contest_predictions p
          where p.match_id = m.id
            and p.contest_id = m.contest_id
            and p.organization_id = m.organization_id)
    into v_contest_id, v_status, v_external_ref, v_prediction_count
  from public.contest_matches m
  where m.id = p_match_id
    and m.organization_id = p_organization_id
  for update;
  if not found then return false; end if;

  if coalesce(auth.role(), '') <> 'service_role' and v_external_ref <> '' then
    raise exception 'managed match';
  end if;

  select c.finalized_at into v_finalized
  from public.contests c where c.id = v_contest_id;
  if v_finalized is not null then
    raise exception 'contest finalized';
  end if;

  -- Supprimer un match pronostiqué change le classement : motif exigé.
  if v_prediction_count > 0
     and (p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 10)
  then
    raise exception 'locked: reason required';
  end if;

  delete from public.contest_matches m
  where m.id = p_match_id
    and m.contest_id = v_contest_id
    and m.organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'contest.match.delete',
    pg_catalog.jsonb_build_object(
      'contest_id', v_contest_id,
      'match_id', p_match_id,
      'previous_status', v_status,
      'predictions_deleted', v_prediction_count,
      'reason', case when v_prediction_count > 0 then pg_catalog.btrim(p_reason) end
    )
  );
  return true;
end;
$$;

revoke all on function public.delete_contest_match(uuid,uuid,text) from public, anon;
grant execute on function public.delete_contest_match(uuid,uuid,text)
  to authenticated, service_role;

-- ── Photographie du classement final + récompenses ───────────
create table public.contest_final_standings (
  contest_id uuid not null references public.contests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null references public.contest_players(id) on delete cascade,
  -- Rang UNIQUE après application complète de la politique d'ex æquo
  -- (tirage compris) — c'est lui qui attribue les récompenses.
  rank integer not null check (rank >= 1),
  total_points integer not null,
  exact_count integer not null,
  diff_count integer not null,
  tiebreaker_delta integer,
  -- Vrai si le tirage déterministe a dû départager ce joueur.
  draw_applied boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (contest_id, player_id),
  unique (contest_id, rank)
);

comment on table public.contest_final_standings is
  'Classement final photographié à la clôture — la RPC contest_leaderboard le sert tel quel ensuite.';

alter table public.contest_final_standings enable row level security;
revoke all on table public.contest_final_standings from public, anon, authenticated;
grant select on table public.contest_final_standings to service_role;
grant insert on table public.contest_final_standings to service_role;

create table public.contest_awards (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null references public.contest_players(id) on delete cascade,
  rank integer not null check (rank >= 1),
  reward_label text not null,
  -- Code de retrait à présenter en caisse (même alphabet que les gains
  -- de la roue : pas de I/O/0/1 ambigus).
  code text not null,
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'cancelled')),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (contest_id, rank),
  unique (contest_id, player_id),
  unique (contest_id, code)
);

comment on table public.contest_awards is
  'Récompenses attribuées à la clôture : un rang = un joueur = un lot, code de retrait, cycle de vie audité.';

create index contest_awards_org_idx on public.contest_awards (organization_id);

alter table public.contest_awards enable row level security;
revoke all on table public.contest_awards from public, anon, authenticated;
-- Lecture pour l'équipe (affichage dashboard) ; écritures via RPC.
grant select on table public.contest_awards to authenticated;
create policy contest_awards_member_read on public.contest_awards
  for select to authenticated
  using (public.is_org_member(organization_id));
grant select, insert, update on table public.contest_awards to service_role;

-- ── Clôture : classement figé + récompenses, en une transaction ──
create or replace function public.finalize_contest(
  p_organization_id uuid,
  p_contest_id uuid,
  p_tiebreaker_answer integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_finalized timestamptz;
  v_rewards jsonb;
  v_scoring jsonb;
  v_answer integer;
  v_pending integer;
  v_players integer := 0;
  v_awards integer := 0;
  v_draws integer := 0;
  v_exact integer;
  v_diff integer;
  r record;
  v_label text;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_try integer;
begin
  -- Clôture : décision du propriétaire (ou du serveur), pas des éditeurs.
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_owner(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;

  select c.status, c.finalized_at, c.rewards, c.scoring,
         coalesce(p_tiebreaker_answer, c.tiebreaker_answer)
    into v_status, v_finalized, v_rewards, v_scoring, v_answer
  from public.contests c
  where c.id = p_contest_id and c.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'contest not found';
  end if;
  if v_finalized is not null then
    raise exception 'contest finalized';
  end if;
  if v_status = 'draft' then
    raise exception 'contest not started';
  end if;

  -- Tous les matchs doivent être joués (ou supprimés avec motif) :
  -- clôturer avec des matchs en attente fausserait le classement.
  select count(*)::integer into v_pending
  from public.contest_matches m
  where m.contest_id = p_contest_id and m.status <> 'finished';
  if v_pending > 0 then
    raise exception 'matches pending';
  end if;

  v_exact := coalesce(pg_catalog.nullif(v_scoring->>'exact', '')::integer, 3);
  v_diff  := coalesce(pg_catalog.nullif(v_scoring->>'diff', '')::integer, 2);

  if p_tiebreaker_answer is not null then
    update public.contests set tiebreaker_answer = p_tiebreaker_answer
    where id = p_contest_id;
  end if;

  -- Classement final : politique d'ex æquo complète, puis tirage
  -- déterministe et auditable (md5(contest,joueur) — pré-engagé, aucun
  -- acteur ne peut l'influencer) pour garantir UN joueur par rang.
  for r in
    with base as (
      select pl.id as player_id,
             pl.created_at,
             coalesce(sum(pr.points), 0)::integer as total_points,
             (count(*) filter (where pr.points = v_exact))::integer as exact_count,
             (count(*) filter (where pr.points = v_diff))::integer as diff_count,
             case
               when v_answer is null or pl.tiebreaker_guess is null then null
               else pg_catalog.abs(pl.tiebreaker_guess - v_answer)
             end as tiebreaker_delta
        from public.contest_players pl
        left join public.contest_predictions pr
          on pr.contest_id = pl.contest_id
         and pr.player_id = pl.id
         and pr.points is not null
       where pl.contest_id = p_contest_id
         and pl.accepted_terms = true
       group by pl.id, pl.created_at, pl.tiebreaker_guess
    ),
    ordered as (
      select b.*,
             row_number() over (
               order by b.total_points desc,
                        b.exact_count desc,
                        b.diff_count desc,
                        b.tiebreaker_delta asc nulls last,
                        pg_catalog.md5(p_contest_id::text || b.player_id::text) asc
             ) as final_rank,
             (count(*) over (
               partition by b.total_points, b.exact_count, b.diff_count, b.tiebreaker_delta
             )) > 1 as draw_applied
        from base b
    )
    select * from ordered order by final_rank
  loop
    v_players := v_players + 1;
    if r.draw_applied then
      v_draws := v_draws + 1;
    end if;

    insert into public.contest_final_standings
      (contest_id, organization_id, player_id, rank, total_points,
       exact_count, diff_count, tiebreaker_delta, draw_applied)
    values
      (p_contest_id, p_organization_id, r.player_id, r.final_rank,
       r.total_points, r.exact_count, r.diff_count, r.tiebreaker_delta,
       r.draw_applied);

    -- Récompense du rang (première tranche couvrante) — un seul joueur
    -- par rang, donc un seul lot par rang prévu au règlement.
    select x->>'label' into v_label
    from pg_catalog.jsonb_array_elements(v_rewards) x
    where (x->>'from')::integer <= r.final_rank
      and (x->>'to')::integer >= r.final_rank
    limit 1;

    if v_label is not null then
      v_code := 'PRONO-';
      for v_try in 1..8 loop
        v_code := v_code || pg_catalog.substr(
          v_alphabet,
          1 + (pg_catalog.get_byte(extensions.gen_random_bytes(1), 0) % 32),
          1
        );
      end loop;
      insert into public.contest_awards
        (contest_id, organization_id, player_id, rank, reward_label, code)
      values
        (p_contest_id, p_organization_id, r.player_id, r.final_rank, v_label, v_code);
      v_awards := v_awards + 1;
    end if;
  end loop;

  update public.contests
  set status = 'finished', finalized_at = pg_catalog.now()
  where id = p_contest_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'contest.finalize',
    pg_catalog.jsonb_build_object(
      'contest_id', p_contest_id,
      'players', v_players,
      'awards', v_awards,
      'draws', v_draws,
      'tiebreaker_answer', v_answer
    )
  );

  return pg_catalog.jsonb_build_object(
    'players', v_players,
    'awards', v_awards,
    'draws', v_draws
  );
end;
$$;

revoke all on function public.finalize_contest(uuid,uuid,integer) from public, anon;
grant execute on function public.finalize_contest(uuid,uuid,integer)
  to authenticated, service_role;

-- ── Cycle de vie d'une récompense (remise / annulation) ──────
create or replace function public.set_contest_award_status(
  p_organization_id uuid,
  p_award_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_contest uuid;
  v_player uuid;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('delivered', 'cancelled') then
    raise exception 'invalid status';
  end if;

  select a.status, a.contest_id, a.player_id
    into v_current, v_contest, v_player
  from public.contest_awards a
  where a.id = p_award_id and a.organization_id = p_organization_id
  for update;
  if not found then return false; end if;
  if v_current <> 'pending' then
    raise exception 'award already settled';
  end if;
  if p_status = 'cancelled'
     and (p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 10)
  then
    raise exception 'locked: reason required';
  end if;

  update public.contest_awards
  set status = p_status,
      delivered_at = case when p_status = 'delivered' then pg_catalog.now() end
  where id = p_award_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    case when p_status = 'delivered'
      then 'contest.award.deliver' else 'contest.award.cancel' end,
    pg_catalog.jsonb_build_object(
      'contest_id', v_contest,
      'award_id', p_award_id,
      'player_id', v_player,
      'reason', case when p_status = 'cancelled' then pg_catalog.btrim(p_reason) end
    )
  );
  return true;
end;
$$;

revoke all on function public.set_contest_award_status(uuid,uuid,text,text)
  from public, anon;
grant execute on function public.set_contest_award_status(uuid,uuid,text,text)
  to authenticated, service_role;

-- ── Classement : départage explicite + lecture du palmarès figé ──
drop function if exists public.contest_player_rank(uuid, uuid);
drop function if exists public.contest_leaderboard(uuid, integer, integer);

create or replace function public.contest_leaderboard(
  p_contest_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
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
         coalesce(pg_catalog.nullif(c.scoring->>'exact', '')::integer, 3),
         coalesce(pg_catalog.nullif(c.scoring->>'diff', '')::integer, 2),
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

  -- Championnat clôturé : le palmarès photographié fait foi (rangs
  -- uniques, tirage compris) — plus aucun recalcul.
  if v_finalized is not null then
    return query
    select s.player_id, pl.first_name, coalesce(pl.avatar, '') as avatar,
           pl.email, s.total_points, s.exact_count, s.diff_count,
           (select count(pr.player_id)::integer
              from public.contest_predictions pr
             where pr.contest_id = p_contest_id
               and pr.player_id = s.player_id
               and pr.points is not null) as prediction_count,
           s.rank::bigint,
           (count(*) over ())::bigint as total_players
      from public.contest_final_standings s
      join public.contest_players pl on pl.id = s.player_id
     where s.contest_id = p_contest_id
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

revoke all on function public.contest_leaderboard(uuid, integer, integer) from public, anon;
grant execute on function public.contest_leaderboard(uuid, integer, integer)
  to service_role, authenticated;

create or replace function public.contest_player_rank(
  p_contest_id uuid,
  p_player_id uuid
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
    from public.contest_leaderboard(p_contest_id, 500000, 0) l
   where l.player_id = p_player_id;
end;
$$;

revoke all on function public.contest_player_rank(uuid, uuid) from public, anon, authenticated;
grant execute on function public.contest_player_rank(uuid, uuid) to service_role;
