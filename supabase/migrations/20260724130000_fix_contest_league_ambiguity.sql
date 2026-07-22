-- ============================================================
-- Lastchance — Correctif : ambiguïté plpgsql « league_id » dans les
-- RPC d'écriture de ligue (create_contest_league / join_contest_league)
--
-- Les deux fonctions déclarent `returns table (league_id uuid, name
-- text, code text)` : ces colonnes de sortie deviennent des variables
-- plpgsql en scope dans tout le corps. Or chacune exécute
--   insert into public.contest_league_members (league_id, player_id)
--   ... on conflict (league_id, player_id) do nothing
-- La cible d'inférence du ON CONFLICT ne peut pas être qualifiée : son
-- `league_id` est à la fois la colonne de la table et la variable OUT
-- homonyme. PostgreSQL levait « column reference "league_id" is
-- ambiguous » (42702) À L'EXÉCUTION — donc créer et rejoindre une ligue
-- étaient CASSÉS en production depuis 20260723100000 (déployée le
-- 2026-07-21). Le job pgTAP (automation.test.sql, ajouté à la CI) l'a
-- révélé : le test exerçait déjà les deux appels.
--
-- Correctif minimal et ciblé : directive `#variable_conflict use_column`
-- en tête de chaque fonction. Là où un nom nu peut désigner une colonne
-- OU une variable, la colonne l'emporte — ce qui résout la cible du ON
-- CONFLICT vers les colonnes de la table, sens voulu. Sûr ici : les deux
-- corps n'accèdent JAMAIS aux variables OUT par leur nom nu (locales
-- `v_`-préfixées, champs de record `v_league.*`, `return query select
-- v_id, v_name, v_code`) — aucune référence légitime n'est réinterprétée.
--
-- Signatures et colonnes de retour INCHANGÉES (l'app lit league_id /
-- name / code) : le snapshot des types généré ne dérive pas. Corps
-- repris à l'identique de 20260723100000 pour le reste. Un verrou pgTAP
-- prouve désormais que les deux RPC s'exécutent (régression).
--
-- contest_leaderboard / contest_player_rank ne sont PAS touchées : leur
-- returns table n'expose pas de colonne `league_id` (le paramètre est
-- p_league_id) et toutes leurs références à league_id sont qualifiées.
-- ============================================================

-- ── RPC : création (code unique, créateur auto-inscrit) ──────
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
#variable_conflict use_column
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
#variable_conflict use_column
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
