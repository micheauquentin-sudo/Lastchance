-- ============================================================
-- Lastchance — Synchronisation automatique des matchs (Pronostics)
--
-- Les compétitions du catalogue (Ligue 1, LDC, CDM, Euro, 6 Nations,
-- CDM rugby) sont désormais alimentées automatiquement depuis un
-- fournisseur de calendriers sportifs. `external_ref` porte
-- l'identifiant du match chez le fournisseur : il déduplique les
-- imports successifs et route les résultats vers le bon match.
-- La saisie manuelle (custom / Roland-Garros) garde external_ref = ''.
-- ============================================================

alter table public.contest_matches
  add column if not exists external_ref text not null default '';

comment on column public.contest_matches.external_ref is
  'Identifiant du match chez le fournisseur de calendriers (vide = saisie manuelle).';

alter table public.contest_matches
  add constraint contest_matches_external_ref_length_check
    check (char_length(external_ref) <= 40) not valid;
alter table public.contest_matches
  validate constraint contest_matches_external_ref_length_check;

-- Un même match fournisseur n'est importé qu'une fois par championnat.
create unique index contest_matches_external_ref_uniq
  on public.contest_matches (contest_id, external_ref)
  where external_ref <> '';

-- La RPC de résultat devient appelable par le cron de synchronisation
-- (service_role, aucune session utilisateur). La garde éditeur reste
-- inchangée pour les sessions commerçant.
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
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_editor(p_organization_id)
  ) then
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
