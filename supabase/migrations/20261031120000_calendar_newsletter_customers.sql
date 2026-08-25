-- ============================================================
-- Clients -- faire remonter les opt-ins Calendrier
--
-- `joinCalendar` inscrit deja un joueur qui coche les actualites dans
-- `newsletter_subscribers` (source `calendar`). La liste Clients partait
-- pourtant seulement de `participations`: un contact sans gain et pleinement
-- consenti etait donc invisible. On ajoute seulement cette population precise;
-- ni une reservation seule, ni un autre opt-in historique ne changent ici.
-- ============================================================

create or replace function public.org_customer_profiles_page(
  p_organization_id uuid,
  p_offset integer default 0,
  p_limit integer default 50,
  p_q text default null,
  p_segment text default null,
  p_tri text default 'dernier_gain'
)
returns table (
  email text,
  first_name text,
  wins bigint,
  redeemed bigint,
  first_win timestamptz,
  last_win timestamptz,
  total_count bigint,
  a_reserve boolean,
  est_venu boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit integer;
  v_offset integer;
  v_q text;
  v_tri text;
begin
  -- Cette liste reste nominative et strictement reservee au proprietaire.
  if not public.is_org_owner(p_organization_id) then
    raise exception 'not authorized';
  end if;

  v_offset := coalesce(p_offset, 0);
  v_limit := coalesce(p_limit, 50);
  if v_offset < 0 or v_limit < 1 or v_limit > 100
     or v_offset > 500 * v_limit then
    raise exception 'invalid pagination';
  end if;

  v_tri := coalesce(pg_catalog.lower(pg_catalog.btrim(coalesce(p_tri, ''))), '');
  if v_tri not in ('dernier_gain', 'gains', 'recuperes', 'premier_gain') then
    v_tri := 'dernier_gain';
  end if;

  v_q := nullif(pg_catalog.btrim(coalesce(p_q, '')), '');
  if v_q is not null then
    v_q := '%'
      || pg_catalog.replace(
           pg_catalog.replace(
             pg_catalog.replace(v_q, '\', '\\'),
             '%', '\%'),
           '_', '\_')
      || '%';
  end if;

  return query
  with faits as (
    select * from public.org_customer_reserver_facts(p_organization_id)
  ),
  participations_profiles as (
    select
      p.email as email,
      (pg_catalog.array_agg(p.first_name order by p.created_at desc)
        filter (where p.first_name is not null))[1] as first_name,
      (pg_catalog.array_agg(p.phone order by p.created_at desc)
        filter (where p.phone is not null))[1] as phone,
      count(*)::bigint as wins,
      count(*) filter (where p.redeemed_at is not null)::bigint as redeemed,
      min(p.created_at) as first_win,
      max(p.created_at) as last_win
      from public.participations p
     where p.organization_id = p_organization_id
       and p.email is not null
     group by p.email
  ),
  profiles as (
    select * from participations_profiles

    union all

    -- Le contact Calendrier a consenti a recevoir les actualites et reste
    -- abonne. Il n'a pas gagne: les compteurs valent 0 et les dates de gain
    -- restent NULL (ne jamais reutiliser created_at comme faux gain).
    select
      s.email,
      null::text as first_name,
      null::text as phone,
      0::bigint as wins,
      0::bigint as redeemed,
      null::timestamptz as first_win,
      null::timestamptz as last_win
      from public.newsletter_subscribers s
     where s.organization_id = p_organization_id
       and s.source = 'calendar'
       and s.unsubscribed_at is null
       -- La meme adresse qui a ensuite joue garde son profil de jeu : une
       -- seule ligne par email, avec ses vrais gains et son vrai prenom.
       and not exists (
         select 1
           from public.participations p
          where p.organization_id = s.organization_id
            and p.email = s.email
       )
  ),
  enrichis as (
    select
      pr.*,
      coalesce(f.a_reserve, false) as a_reserve,
      coalesce(f.est_venu, false) as est_venu
      from profiles pr
      left join faits f on f.email = pr.email
  ),
  filtered as (
    select en.*
      from enrichis en
     where (
       v_q is null
       or en.email ilike v_q escape '\'
       or en.first_name ilike v_q escape '\'
       or en.phone ilike v_q escape '\'
     )
       and public.customer_segment_matches(
         p_segment, en.wins, en.last_win, en.a_reserve, en.est_venu)
  )
  select
    f.email,
    f.first_name,
    f.wins,
    f.redeemed,
    f.first_win,
    f.last_win,
    count(*) over ()::bigint as total_count,
    f.a_reserve,
    f.est_venu
    from filtered f
   order by
     case when v_tri = 'gains' then f.wins end desc nulls last,
     case when v_tri = 'recuperes' then f.redeemed end desc nulls last,
     case when v_tri = 'premier_gain' then f.first_win end desc nulls last,
     case when v_tri = 'dernier_gain' then f.last_win end desc nulls last,
     f.email asc
   limit v_limit offset v_offset;
end;
$$;

comment on function public.org_customer_profiles_page(uuid, integer, integer, text, text, text) is
  'Page Clients d''une organisation, reservee au proprietaire : profils agreges de participations, plus les abonnes newsletter actifs issus du Calendrier. Un opt-in Calendrier sans gain rend wins=0, redeemed=0 et first_win/last_win NULL; ces dates ne sont jamais fabriquees depuis la date d''inscription. Les reservations seules et les autres sources newsletter ne changent pas la population. p_q cherche email, prenom et telephone; les segments et les tris sont inchanges.';
