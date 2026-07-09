-- ============================================================
-- Lastchance — Création de campagne transactionnelle
--
-- createCampaign insérait campagne, roue et lots par défaut en trois
-- requêtes : un échec au milieu laissait une campagne sans roue.
-- Cette fonction crée l'ensemble en une transaction (même modèle que
-- create_organization). Appelable par un utilisateur authentifié
-- membre de l'organisation ; SECURITY DEFINER, d'où la re-vérification
-- explicite d'appartenance.
-- ============================================================

create or replace function public.create_campaign_with_defaults(
  org_id uuid,
  campaign_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_campaign_id uuid;
  new_wheel_id uuid;
  trimmed_name text := trim(campaign_name);
begin
  if not public.is_org_member(org_id) then
    raise exception 'accès refusé';
  end if;
  if trimmed_name is null
     or char_length(trimmed_name) < 1
     or char_length(trimmed_name) > 120 then
    raise exception 'nom de campagne invalide';
  end if;

  insert into public.campaigns (organization_id, name)
  values (org_id, trimmed_name)
  returning id into new_campaign_id;

  -- Roue 1:1, même nom que la campagne (comportement existant).
  insert into public.wheels (organization_id, campaign_id, name)
  values (org_id, new_campaign_id, trimmed_name)
  returning id into new_wheel_id;

  -- Lots par défaut : la campagne est jouable immédiatement.
  insert into public.prizes
    (organization_id, wheel_id, label, description, color, weight, is_losing, position)
  values
    (org_id, new_wheel_id, 'Café offert',    'Un café offert au comptoir.',    '#f59e0b', 40, false, 0),
    (org_id, new_wheel_id, 'Dessert offert', 'Un dessert au choix.',           '#ec4899', 20, false, 1),
    (org_id, new_wheel_id, 'Surprise',       'Une surprise de la maison.',     '#8b5cf6', 10, false, 2),
    (org_id, new_wheel_id, 'Pas de chance',  'Retentez votre chance bientôt !','#64748b', 30, true,  3);

  return new_campaign_id;
end;
$$;

revoke execute on function public.create_campaign_with_defaults(uuid, text) from anon;
