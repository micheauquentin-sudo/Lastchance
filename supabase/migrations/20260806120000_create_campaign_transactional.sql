-- ============================================================
-- Lastchance — Création de campagne TRANSACTIONNELLE
--
-- Défaut corrigé (docs/bugs.md) : `createCampaign` enchaînait TROIS écritures
-- séparées — campagne, roue, lots par défaut — sans transaction ni rattrapage.
-- Un échec au milieu laissait une campagne SANS ROUE, donc injouable, et le
-- message d'erreur l'avouait au commerçant : « Campagne créée mais roue
-- manquante ». À lui de la retrouver et de la supprimer à la main.
--
-- Cette fonction fait les trois écritures en UNE transaction : soit la
-- campagne est complète et jouable, soit rien n'est écrit.
--
-- ── Deux choix de conception ──
--
-- 1. Le style de roue et les lots par défaut arrivent en PARAMÈTRES JSON, ils
--    ne sont PAS codés en dur ici. Une version antérieure de ce correctif (
--    branche claude/saas-security-audit-8z3zvv, 2026-07-09) les inscrivait dans
--    le SQL : l'adopter telle quelle aurait REGRESSÉ le produit — elle ignorait
--    le préréglage « kermesse » posé depuis sur la roue, et aurait créé une
--    seconde source de vérité pour les lots, condamnée à diverger de
--    `DEFAULT_PRIZES`. TypeScript reste la source, Postgres apporte
--    l'atomicité.
--
-- 2. Le contrôle d'accès est `is_org_member`, et c'est délibérément le MÊME
--    prédicat que la policy RLS « campaigns: all membres » (00001:164-166) que
--    cette fonction court-circuite en `security definer`. Exiger `is_org_editor`
--    aurait paru plus prudent mais aurait RESTREINT un droit existant ; se
--    contenter d'un contrôle d'authentification l'aurait ÉLARGI. On rejoue la
--    policy à l'identique, ni plus ni moins.
-- ============================================================

create or replace function public.create_campaign_with_defaults(
  org_id uuid,
  campaign_name text,
  wheel_style jsonb default '{}'::jsonb,
  default_prizes jsonb default '[]'::jsonb
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
  -- `security definer` contourne la RLS : on rejoue son prédicat exact.
  if not public.is_org_member(org_id) then
    raise exception 'accès refusé';
  end if;

  -- Mêmes bornes que le schéma Zod côté serveur (createCampaignSchema).
  if trimmed_name is null
     or char_length(trimmed_name) < 1
     or char_length(trimmed_name) > 120 then
    raise exception 'nom de campagne invalide';
  end if;

  if jsonb_typeof(default_prizes) <> 'array' then
    raise exception 'lots par défaut invalides';
  end if;

  insert into public.campaigns (organization_id, name)
  values (org_id, trimmed_name)
  returning id into new_campaign_id;

  -- Roue 1:1, même nom que la campagne, style fourni par l'appelant.
  insert into public.wheels (organization_id, campaign_id, name, style)
  values (
    org_id,
    new_campaign_id,
    trimmed_name,
    coalesce(wheel_style, '{}'::jsonb)
  )
  returning id into new_wheel_id;

  -- Lots par défaut : la campagne est jouable immédiatement. Un tableau vide
  -- est accepté — la campagne reste cohérente, simplement sans lot.
  insert into public.prizes
    (organization_id, wheel_id, label, description, color, weight, is_losing, position)
  select
    org_id,
    new_wheel_id,
    prize ->> 'label',
    prize ->> 'description',
    prize ->> 'color',
    (prize ->> 'weight')::int,
    (prize ->> 'is_losing')::boolean,
    (prize ->> 'position')::int
  from jsonb_array_elements(default_prizes) as prize;

  return new_campaign_id;
end;
$$;

revoke all on function public.create_campaign_with_defaults(uuid, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.create_campaign_with_defaults(uuid, text, jsonb, jsonb)
  to authenticated, service_role;

comment on function public.create_campaign_with_defaults(uuid, text, jsonb, jsonb) is
  'Crée campagne + roue + lots par défaut en une transaction. Rejoue le prédicat de la policy campaigns (is_org_member). Style et lots fournis par l''appelant : TypeScript reste la source de vérité.';
