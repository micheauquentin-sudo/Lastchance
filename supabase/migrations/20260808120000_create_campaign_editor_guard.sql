-- ============================================================
-- Lastchance — Correction d'une ESCALADE DE PRIVILÈGE introduite par
-- `20260806120000_create_campaign_transactional.sql`
--
-- ── Le défaut ──
--
-- La migration précédente a rendu la création de campagne transactionnelle en
-- la déplaçant du client de session vers une RPC `security definer`. Son
-- en-tête justifiait le prédicat retenu ainsi :
--
--   « Le contrôle d'accès est `is_org_member`, et c'est délibérément le MÊME
--     prédicat que la policy RLS "campaigns: all membres" (00001:164-166) que
--     cette fonction court-circuite. Exiger `is_org_editor` aurait paru plus
--     prudent mais aurait RESTREINT un droit existant. »
--
-- Ce raisonnement était juste dans sa forme et FAUX dans son fait : la policy
-- citée n'existe plus. `00019_atomic_security_sessions_timezone.sql:66-77` l'a
-- SUPPRIMÉE et remplacée par « campaigns: editors », « wheels: editors » et
-- « prizes: editors », toutes en `is_org_editor` — lequel exclut explicitement
-- le rôle `cashier` (00019:59, `and m.role in ('owner','editor')`).
--
-- La fonction était donc STRICTEMENT PLUS LARGE que la RLS qu'elle
-- court-circuite. Loin de rejouer la policy, elle ouvrait au caissier trois
-- tables qui lui sont fermées.
--
-- ── Ce que ça donnait pour un vrai commerce ──
--
-- Un employé saisonnier sur un poste de caisse partagé — le modèle de menace
-- que ce projet documente lui-même — pouvait créer campagnes, roues et lots,
-- avec libellés, couleurs et probabilités entièrement sous son contrôle.
-- Avant la migration précédente, les trois écritures passaient par le client
-- de session et la RLS les refusait toutes les trois.
--
-- ── La leçon, plus utile que le correctif ──
--
-- Quand une fonction `security definer` prétend « rejouer la policy », ce
-- n'est vrai que si la policy citée est la policy VIVANTE. Une policy est un
-- objet mutable : la lire dans la migration qui l'a créée, sans vérifier
-- qu'aucune migration ultérieure ne l'a remplacée, revient à rejouer un état
-- historique. Le prédicat doit être relu dans le catalogue, pas dans l'archive.
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
  -- `security definer` contourne la RLS : on rejoue le prédicat des policies
  -- VIVANTES « campaigns: editors » / « wheels: editors » / « prizes: editors »
  -- (00019:66-88), qui sont les trois tables écrites ci-dessous. `is_org_editor`
  -- couvre owner + editor et exclut cashier.
  if not public.is_org_editor(org_id) then
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
  'Crée campagne + roue + lots par défaut en une transaction. Rejoue le prédicat des policies VIVANTES campaigns/wheels/prizes (is_org_editor — le caissier est exclu). Style et lots fournis par l''appelant : TypeScript reste la source de vérité.';
