-- ============================================================
-- Lastchance — Fidélisation & croissance (5 fonctions)
--   1. Multi-roues par campagne + planification horaire
--   2. Attribution du partage (spins.source)
--   3. Relance clients automatique (opt-in + suivi)
--   4. Segments newsletter (RPC)
--   5. Stats de performance par lot (RPC)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. MULTI-ROUES + PLANIFICATION HORAIRE
-- On lève le 1:1 (campaign_id unique) et on ajoute un créneau
-- optionnel par roue. Au moment du jeu, on choisit la première roue
-- (par position) dont le créneau couvre l'instant courant ; à défaut,
-- une roue sans créneau (toujours active). Voir lib/wheel-schedule.ts.
-- ────────────────────────────────────────────────────────────

alter table public.wheels drop constraint if exists wheels_campaign_id_key;

alter table public.wheels
  add column if not exists position integer not null default 0,
  -- Heures locales [0..24] ; null = pas de borne de ce côté.
  add column if not exists schedule_start_hour smallint
    check (schedule_start_hour is null or (schedule_start_hour between 0 and 24)),
  add column if not exists schedule_end_hour smallint
    check (schedule_end_hour is null or (schedule_end_hour between 0 and 24)),
  -- Jours actifs 0=dimanche..6=samedi ; null/[] = tous les jours.
  add column if not exists schedule_days smallint[];

create index if not exists wheels_campaign_pos_idx
  on public.wheels(campaign_id, position);

-- ────────────────────────────────────────────────────────────
-- 2. ATTRIBUTION DU PARTAGE
-- Origine de la partie : 'direct' (scan/lien) ou 'share' (lien
-- partagé par un joueur, ?ref=share). Alimente une stat de viralité.
-- ────────────────────────────────────────────────────────────

alter table public.spins
  add column if not exists source text not null default 'direct'
    check (source in ('direct', 'share'));

-- ────────────────────────────────────────────────────────────
-- 3. RELANCE CLIENTS AUTOMATIQUE
-- Opt-in par organisation + suivi anti-répétition sur l'abonné.
-- Le consentement marketing (newsletter) est la base ciblée — voir
-- l'unification côté application (claimPrize upsert la newsletter
-- quand le gagnant coche l'opt-in marketing).
-- ────────────────────────────────────────────────────────────

alter table public.organizations
  add column if not exists auto_reengage boolean not null default false;

alter table public.newsletter_subscribers
  add column if not exists last_reengaged_at timestamptz;

-- Cibles de relance d'une org : abonnés actifs, inactifs depuis
-- p_inactive_days (dernier gain), non relancés depuis p_cooldown_days.
create or replace function public.org_reengagement_targets(
  p_organization_id uuid,
  p_inactive_days int default 60,
  p_cooldown_days int default 30
)
returns table (subscriber_id uuid, email text)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, s.email
  from public.newsletter_subscribers s
  join lateral (
    select max(p.created_at) as last_win
    from public.participations p
    where p.organization_id = s.organization_id and p.email = s.email
  ) w on true
  where s.organization_id = p_organization_id
    and s.unsubscribed_at is null
    and w.last_win is not null
    and w.last_win < now() - make_interval(days => greatest(1, p_inactive_days))
    and (s.last_reengaged_at is null
         or s.last_reengaged_at < now() - make_interval(days => greatest(1, p_cooldown_days)));
$$;

revoke all on function public.org_reengagement_targets(uuid, int, int) from public, anon;

-- ────────────────────────────────────────────────────────────
-- 4. SEGMENTS NEWSLETTER
-- Résout les emails d'abonnés actifs appartenant à un segment, pour
-- l'envoi ciblé. Segments : 'all', 'loyal' (>= p_loyal_wins gains),
-- 'inactive' (dernier gain > p_inactive_days), 'new' (1 seul gain).
-- Vérification d'appartenance interne (appelable par un membre).
-- ────────────────────────────────────────────────────────────

create or replace function public.org_segment_emails(
  p_organization_id uuid,
  p_segment text,
  p_loyal_wins int default 3,
  p_inactive_days int default 60
)
returns table (subscriber_id uuid, email text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'not authorized';
  end if;

  return query
  select s.id, s.email
  from public.newsletter_subscribers s
  left join lateral (
    select count(*) as wins, max(p.created_at) as last_win
    from public.participations p
    where p.organization_id = s.organization_id and p.email = s.email
  ) agg on true
  where s.organization_id = p_organization_id
    and s.unsubscribed_at is null
    and case p_segment
      when 'all' then true
      when 'loyal' then coalesce(agg.wins, 0) >= greatest(1, p_loyal_wins)
      when 'new' then coalesce(agg.wins, 0) = 1
      when 'inactive' then agg.last_win is not null
        and agg.last_win < now() - make_interval(days => greatest(1, p_inactive_days))
      else true
    end;
end;
$$;

revoke all on function public.org_segment_emails(uuid, text, int, int) from public, anon;
grant execute on function public.org_segment_emails(uuid, text, int, int) to authenticated;

-- Compte les abonnés par segment (pour afficher les tailles dans l'UI).
create or replace function public.org_segment_counts(p_organization_id uuid)
returns table (all_count bigint, loyal_count bigint, new_count bigint, inactive_count bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'not authorized';
  end if;

  return query
  with base as (
    select s.id,
      coalesce(agg.wins, 0) as wins,
      agg.last_win
    from public.newsletter_subscribers s
    left join lateral (
      select count(*) as wins, max(p.created_at) as last_win
      from public.participations p
      where p.organization_id = s.organization_id and p.email = s.email
    ) agg on true
    where s.organization_id = p_organization_id and s.unsubscribed_at is null
  )
  select
    count(*),
    count(*) filter (where wins >= 3),
    count(*) filter (where wins = 1),
    count(*) filter (where last_win is not null and last_win < now() - interval '60 days')
  from base;
end;
$$;

revoke all on function public.org_segment_counts(uuid) from public, anon;
grant execute on function public.org_segment_counts(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. PERFORMANCE PAR LOT
-- Par lot : distribués (spins gagnants), réclamés (participations),
-- récupérés (redeemed_at) — pour piloter poids et stocks.
-- ────────────────────────────────────────────────────────────

create or replace function public.campaign_prize_performance(p_campaign_id uuid)
returns table (
  prize_id uuid,
  label text,
  color text,
  distributed bigint,
  claimed bigint,
  redeemed bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.campaigns where id = p_campaign_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'not authorized';
  end if;

  return query
  select
    pr.id,
    pr.label,
    pr.color,
    (select count(*) from public.spins s
       where s.prize_id = pr.id and s.is_losing = false) as distributed,
    (select count(*) from public.participations pa
       where pa.prize_id = pr.id) as claimed,
    (select count(*) from public.participations pa
       where pa.prize_id = pr.id and pa.redeemed_at is not null) as redeemed
  from public.prizes pr
  join public.wheels wh on wh.id = pr.wheel_id
  where wh.campaign_id = p_campaign_id
    and pr.is_losing = false
  order by distributed desc, pr.position;
end;
$$;

revoke all on function public.campaign_prize_performance(uuid) from public, anon;
grant execute on function public.campaign_prize_performance(uuid) to authenticated;
