-- ============================================================
-- Lastchance — Correctif : ambiguïté plpgsql dans perform_atomic_spin
--
-- La requête de somme des poids (calcul de v_total) référençait
-- `is_losing` sans alias de table ; or `is_losing` est aussi une
-- colonne de sortie du `returns table` — donc une variable plpgsql.
-- PostgreSQL levait « column reference "is_losing" is ambiguous »
-- (42702) à CHAQUE tirage : la roue publique était inutilisable en
-- production (« Une erreur est survenue, réessayez »).
--
-- Correctif minimal : la requête fautive est alignée sur sa jumelle
-- déjà correcte (alias `p.` partout, cf. tirage pondéré plus bas).
-- Le corps est recréé à l'identique de 00019 pour le reste.
-- Un test pgTAP exécute désormais réellement un tirage (régression).
-- ============================================================

create or replace function public.perform_atomic_spin(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_wheel_id uuid,
  p_player_key text,
  p_engagement_action text,
  p_source text
)
returns table (
  spin_id uuid,
  prize_id uuid,
  is_losing boolean,
  denial_reason text,
  next_eligible_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_limit text;
  v_timezone text;
  v_local_now timestamp;
  v_window_key text;
  v_window_start timestamptz;
  v_next timestamptz;
  v_total bigint;
  v_pick bigint;
  v_prize record;
  v_spin_id uuid;
  v_random bytea;
begin
  if p_player_key is null or length(p_player_key) < 32 then
    raise exception 'invalid player key';
  end if;

  select w.play_limit, o.timezone into v_limit, v_timezone
  from public.wheels w
  join public.campaigns c on c.id = w.campaign_id and c.organization_id = w.organization_id
  join public.organizations o on o.id = w.organization_id
  where w.id = p_wheel_id and w.campaign_id = p_campaign_id
    and w.organization_id = p_organization_id;
  if not found then raise exception 'invalid play resource chain'; end if;

  v_local_now := pg_catalog.now() at time zone v_timezone;
  if v_limit = 'once' then
    v_window_key := 'once';
    v_window_start := 'epoch'::timestamptz;
  elsif v_limit = 'daily' then
    v_window_key := 'day:' || to_char(v_local_now, 'YYYY-MM-DD');
    v_window_start := date_trunc('day', v_local_now) at time zone v_timezone;
    v_next := (date_trunc('day', v_local_now) + interval '1 day') at time zone v_timezone;
  elsif v_limit = 'weekly' then
    v_window_key := 'week:' || to_char(v_local_now, 'IYYY-IW');
    v_window_start := date_trunc('week', v_local_now) at time zone v_timezone;
    v_next := (date_trunc('week', v_local_now) + interval '1 week') at time zone v_timezone;
  else
    v_window_key := null;
    v_window_start := null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_wheel_id::text || ':' || p_player_key, 0)
  );

  if v_window_start is not null and exists (
    select 1 from public.spins s
    where s.wheel_id = p_wheel_id and s.player_key = p_player_key
      and s.created_at >= v_window_start
  ) then
    return query select null::uuid, null::uuid, false, 'limit_reached', v_next;
    return;
  end if;

  loop
    -- (Correctif 42702) : alias `p.` — `is_losing` sans alias entrait en
    -- collision avec la colonne de sortie homonyme du returns table.
    select coalesce(sum(p.weight), 0)::bigint into v_total
    from public.prizes p
    where p.wheel_id = p_wheel_id and p.organization_id = p_organization_id
      and p.is_active and p.weight > 0
      and (p.is_losing or p.stock is null or p.stock > 0);
    if v_total <= 0 then
      return query select null::uuid, null::uuid, false, 'no_prize', null::timestamptz;
      return;
    end if;

    v_random := extensions.gen_random_bytes(4);
    v_pick := mod(
      (get_byte(v_random, 0)::bigint * 16777216
       + get_byte(v_random, 1)::bigint * 65536
       + get_byte(v_random, 2)::bigint * 256
       + get_byte(v_random, 3)::bigint),
      v_total
    );
    select q.* into v_prize from (
      select p.*, sum(p.weight) over(order by p.position, p.created_at, p.id) as ceiling
      from public.prizes p
      where p.wheel_id = p_wheel_id and p.organization_id = p_organization_id
        and p.is_active and p.weight > 0 and (p.is_losing or p.stock is null or p.stock > 0)
    ) q where q.ceiling > v_pick order by q.ceiling limit 1;

    if v_prize.is_losing or v_prize.stock is null then exit; end if;
    update public.prizes set stock = stock - 1
      where id = v_prize.id and stock > 0;
    if found then exit; end if;
  end loop;

  insert into public.spins(
    organization_id, campaign_id, wheel_id, prize_id, is_losing,
    player_key, engagement_action, source, play_window_key
  ) values (
    p_organization_id, p_campaign_id, p_wheel_id,
    case when v_prize.is_losing then null else v_prize.id end,
    v_prize.is_losing, p_player_key, p_engagement_action,
    case when p_source = 'share' then 'share' else 'direct' end,
    v_window_key
  ) returning id into v_spin_id;

  -- Le lot perdant est retourné au serveur pour restituer le bon libellé,
  -- mais n'est volontairement pas référencé par le spin en base.
  return query select v_spin_id, v_prize.id,
    v_prize.is_losing, null::text, null::timestamptz;
end
$$;

revoke all on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text)
  to service_role;
