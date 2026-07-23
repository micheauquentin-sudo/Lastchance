-- ============================================================
-- Lastchance — Correctif Calendrier : deux bugs d'EXÉCUTION dans les
-- RPC du parcours public (20260728120000). La migration d'origine s'est
-- appliquée sans erreur (les corps ne sont pas évalués au CREATE quand
-- check_function_bodies ne planifie pas le SQL embarqué), mais les deux
-- fonctions échouent À L'EXÉCUTION. Elles sont déjà en PROD : on ne
-- retouche pas 20260728120000, on recrée à l'identique (mêmes corps) avec
-- les deux corrections. Aucun changement de schéma (colonnes/types).
-- Miroir de 20260721190000_fix_nullif_qualification. CREATE OR REPLACE
-- conserve les privilèges (aucun re-grant nécessaire).
--
--   Bug 1 — join_calendar : `pg_catalog.nullif(...)`. NULLIF est une
--     construction du parseur SQL (comme COALESCE), pas une fonction du
--     catalogue → « function pg_catalog.nullif(text, unknown) does not
--     exist » au premier join avec email. `nullif` nu (résolu par le
--     parseur, sûr sous search_path = ''). Les btrim/lower/coalesce
--     internes, eux, sont de vraies fonctions et restent qualifiés.
--
--   Bug 2 — calendar_public_state : la sous-requête de la grille des
--     cases exposait DEUX colonnes de sortie nommées `day_index` (un
--     `d.day_index` nu résiduel EN PLUS de `d.day_index as day_index`).
--     La référence `x.day_index` de `jsonb_agg(x.obj order by x.day_index)`
--     devient alors AMBIGUË → « column reference "day_index" is
--     ambiguous » à l'exécution. La page publique appelle cette RPC ; son
--     échec faisait tomber le rendu en notFound()/404 (E2E). Correctif :
--     retirer la colonne `day_index` nue redondante ; on garde l'alias
--     explicite utilisé par l'ORDER BY.
-- ============================================================

-- ── join_calendar (Bug 1 : nullif nu) ────────────────────────
create or replace function public.join_calendar(
  p_slug text,
  p_player_token_hash text,
  p_email text default null,
  p_marketing_opt_in boolean default false,
  p_reminder_opt_in boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cal public.calendars%rowtype;
  v_player public.calendar_players%rowtype;
  v_email text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  select c.* into v_cal
    from public.calendars c
    join public.organizations o on o.id = c.organization_id
   where c.public_slug = pg_catalog.lower(pg_catalog.btrim(coalesce(p_slug, '')))
     and o.addon_calendar
   for update of c;
  -- Réponse 'unavailable' identique quel que soit le motif (slug inconnu, addon
  -- coupé, calendrier non actif) : pas d'oracle.
  if not found or v_cal.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Email nettoyé (opt-in). Coercition silencieuse vers null si manifestement
  -- invalide (la contrainte de colonne reste le filet).
  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null and (pg_catalog.length(v_email) > 320 or v_email not like '%@%') then
    v_email := null;
  end if;

  -- Joueur créé au premier join (idempotent). Le DO NOTHING puis l'UPDATE ci-
  -- dessous évitent toute auto-référence ambiguë dans le ON CONFLICT.
  insert into public.calendar_players
    (calendar_id, organization_id, token_hash, email, marketing_opt_in, reminder_opt_in)
  values (v_cal.id, v_cal.organization_id, p_player_token_hash, v_email,
          coalesce(p_marketing_opt_in, false), coalesce(p_reminder_opt_in, false))
  on conflict (calendar_id, token_hash) do nothing;

  -- Toujours appliqué (nouvelle ligne ou re-join) : on met à jour l'email
  -- seulement si un nouvel email est fourni, et on fait MONTER les opt-in (OR)
  -- — un re-join ne rétracte jamais un consentement déjà donné.
  update public.calendar_players
     set email = coalesce(v_email, email),
         marketing_opt_in = marketing_opt_in or coalesce(p_marketing_opt_in, false),
         reminder_opt_in = reminder_opt_in or coalesce(p_reminder_opt_in, false)
   where calendar_id = v_cal.id and token_hash = p_player_token_hash
  returning * into v_player;

  return pg_catalog.jsonb_build_object(
    'state', 'joined',
    'calendar', pg_catalog.jsonb_build_object(
      'id', v_cal.id, 'name', v_cal.name, 'theme', v_cal.theme,
      'day_count', v_cal.day_count, 'merchant_content', v_cal.merchant_content),
    'player', pg_catalog.jsonb_build_object(
      'id', v_player.id, 'opened_count', v_player.opened_count,
      'marketing_opt_in', v_player.marketing_opt_in,
      'reminder_opt_in', v_player.reminder_opt_in,
      'has_email', (v_player.email is not null))
  );
end;
$$;

-- ── calendar_public_state (Bug 2 : day_index dupliqué → ambigu) ──
create or replace function public.calendar_public_state(
  p_calendar_id uuid,
  p_player_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cal public.calendars%rowtype;
  v_player public.calendar_players%rowtype;
  v_has_player boolean := false;
  v_now timestamptz := pg_catalog.now();
  v_days jsonb;
  v_reward jsonb := null;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select c.* into v_cal from public.calendars c where c.id = p_calendar_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if p_player_token_hash is not null and p_player_token_hash ~ '^[0-9a-f]{64}$' then
    select p.* into v_player
      from public.calendar_players p
     where p.calendar_id = v_cal.id and p.token_hash = p_player_token_hash;
    v_has_player := found;
  end if;

  -- Grille des cases. Le contenu (content_type, texte, libellé, code, grant)
  -- N'EST inclus QUE pour les cases ouvertes par CE joueur (LEFT JOIN sur
  -- calendar_openings du joueur). Sinon : statut temporel seul.
  select coalesce(pg_catalog.jsonb_agg(x.obj order by x.day_index), '[]'::jsonb)
    into v_days
    from (
      select
        case when o.id is not null then
          -- Case OUVERTE par le joueur : contenu complet (le sien).
          pg_catalog.jsonb_build_object(
            'day_index', d.day_index,
            'unlock_at', d.unlock_at,
            'status', 'opened',
            'is_special', d.is_special,
            'content_type', o.content_type,
            'content_text', case when o.content_type = 'content' then d.content_text else null end,
            'reward_label', case when o.content_type = 'lot' then d.reward_label else null end,
            'reward_details', case when o.content_type = 'lot' then d.reward_details else null end,
            'code', o.code,
            'spin_grant_token', o.spin_grant_token,
            'target_wheel_id', case when o.content_type = 'spin' then d.target_wheel_id else null end,
            'resulting_spin_id', o.resulting_spin_id,
            'out_of_stock', o.out_of_stock)
        else
          -- Case NON ouverte : AUCUN contenu (invariant #2), statut temporel seul.
          pg_catalog.jsonb_build_object(
            'day_index', d.day_index,
            'unlock_at', d.unlock_at,
            'status', case when v_now >= d.unlock_at then 'available' else 'locked' end,
            'is_special', d.is_special)
        end as obj,
        d.day_index as day_index
        from public.calendar_days d
        left join public.calendar_openings o
          on o.day_id = d.id
         and v_has_player
         and o.player_id = v_player.id
       where d.calendar_id = v_cal.id
    ) x;

  -- Récompense d'assiduité du joueur (si gagnée) : son code (jamais celui d'un
  -- autre). completion_reward_label reste une accroche publique.
  if v_has_player then
    select pg_catalog.jsonb_build_object(
             'code', r.code, 'redeemed_at', r.redeemed_at)
      into v_reward
      from public.calendar_rewards r
     where r.calendar_id = v_cal.id and r.player_id = v_player.id
     limit 1;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'calendar', pg_catalog.jsonb_build_object(
      'id', v_cal.id, 'name', v_cal.name, 'theme', v_cal.theme,
      'status', v_cal.status, 'day_count', v_cal.day_count,
      'merchant_content', v_cal.merchant_content,
      'completion_reward_label', v_cal.completion_reward_label,
      'completion_reward_details', v_cal.completion_reward_details),
    'days', v_days,
    'progression', pg_catalog.jsonb_build_object(
      'opened_count', case when v_has_player then v_player.opened_count else 0 end,
      'day_count', v_cal.day_count),
    'completion_reward', v_reward
  );
end;
$$;
