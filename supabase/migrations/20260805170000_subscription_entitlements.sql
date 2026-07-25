-- ============================================================
-- Droits commerciaux synchronisés depuis les items Stripe.
--
-- Migration progressive :
--   * les booléens addon_* restent des projections compatibles ;
--   * les activations existantes sont reprises avec source `legacy` ;
--   * dès qu'un abonnement Stripe V2 est reçu, sa photographie fait foi.
-- Aucune référence de prix n'est codée en base : les IDs restent des
-- variables serveur et seuls les droits fonctionnels sont persistés.
-- ============================================================

create table public.organization_entitlements (
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  entitlement text not null check (
    entitlement in (
      'core', 'pronostics', 'hunts', 'loyalty', 'jackpot',
      'events', 'calendar', 'quiz', 'referral'
    )
  ),
  source text not null check (source in ('stripe', 'legacy')),
  active boolean not null default true,
  source_reference text
    check (source_reference is null or char_length(source_reference) <= 255),
  metadata jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(metadata) = 'object'
      and octet_length(metadata::text) <= 4096
    ),
  updated_at timestamptz not null default now(),
  primary key (organization_id, entitlement, source)
);

comment on table public.organization_entitlements is
  'Droits fonctionnels : snapshot Stripe prioritaire, reprise legacy temporaire. Aucun secret ou détail de paiement.';

create index organization_entitlements_active_idx
  on public.organization_entitlements (organization_id, entitlement)
  where active;

alter table public.organization_entitlements enable row level security;
revoke all on table public.organization_entitlements
  from public, anon, authenticated;
grant select, insert, update, delete on table public.organization_entitlements
  to service_role;

-- Reprise sans coupure des modules déjà accordés. Ces lignes cessent de
-- faire foi dès qu'une photographie Stripe existe pour l'organisation.
insert into public.organization_entitlements (
  organization_id, entitlement, source, active, source_reference
)
select o.id, x.entitlement, 'legacy', true, 'addon_projection'
from public.organizations o
cross join lateral (
  values
    ('pronostics', o.addon_pronostics),
    ('hunts', o.addon_hunts),
    ('loyalty', o.addon_loyalty),
    ('jackpot', o.addon_jackpot),
    ('events', o.addon_events),
    ('calendar', o.addon_calendar),
    ('quiz', o.addon_quiz),
    ('referral', o.addon_referral)
) as x(entitlement, enabled)
where x.enabled;

-- Lecture effective bornée : un snapshot Stripe, même entièrement inactif,
-- masque la reprise legacy. Les membres ne voient que leurs propres droits.
create or replace function public.org_effective_entitlements(
  p_organization_id uuid
)
returns table (entitlement text)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_has_stripe boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_member(p_organization_id) then
    raise exception 'not authorized';
  end if;

  select exists(
    select 1
      from public.organization_entitlements e
     where e.organization_id = p_organization_id
       and e.source = 'stripe'
  ) into v_has_stripe;

  return query
  select e.entitlement
    from public.organization_entitlements e
   where e.organization_id = p_organization_id
     and e.active
     and e.source = case when v_has_stripe then 'stripe' else 'legacy' end
   order by e.entitlement;
end
$$;

revoke all on function public.org_effective_entitlements(uuid)
  from public, anon;
grant execute on function public.org_effective_entitlements(uuid)
  to authenticated, service_role;

-- Défense en profondeur : PostgREST/back-office ne peut pas contourner un
-- snapshot Stripe en modifiant directement les projections historiques.
-- Seule la transaction du webhook V2 ouvre temporairement cette écriture.
create or replace function public.protect_stripe_managed_entitlements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.current_setting(
       'lastchance.stripe_entitlements_sync',
       true
     ) is distinct from 'on'
     and exists (
       select 1
         from public.organization_entitlements e
        where e.organization_id = old.id
          and e.source = 'stripe'
     )
     and (
       new.plan is distinct from old.plan
       or new.addon_pronostics is distinct from old.addon_pronostics
       or new.addon_hunts is distinct from old.addon_hunts
       or new.addon_loyalty is distinct from old.addon_loyalty
       or new.addon_jackpot is distinct from old.addon_jackpot
       or new.addon_events is distinct from old.addon_events
       or new.addon_calendar is distinct from old.addon_calendar
       or new.addon_quiz is distinct from old.addon_quiz
       or new.addon_referral is distinct from old.addon_referral
     ) then
    raise exception 'entitlements are managed by Stripe'
      using errcode = '42501';
  end if;
  return new;
end
$$;

revoke all on function public.protect_stripe_managed_entitlements()
  from public, anon, authenticated;

create trigger organizations_protect_stripe_entitlements
before update of
  plan,
  addon_pronostics,
  addon_hunts,
  addon_loyalty,
  addon_jackpot,
  addon_events,
  addon_calendar,
  addon_quiz,
  addon_referral
on public.organizations
for each row execute function public.protect_stripe_managed_entitlements();

-- V2 atomique : statut, plan et droits partagent l'idempotence/l'ordre de
-- l'événement Stripe. Un échec de droits annule aussi stripe_events, afin
-- que Stripe puisse retenter l'ensemble au lieu de laisser un demi-état.
create or replace function public.apply_stripe_subscription_event_v2(
  p_event_id text,
  p_event_created_at timestamptz,
  p_customer_id text,
  p_status text,
  p_trial_ends_at timestamptz,
  p_subscription_id text,
  p_plan_id text,
  p_entitlements text[],
  p_price_ids text[]
)
returns table(organization_id uuid, applied boolean, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations%rowtype;
  v_allowed constant text[] := array[
    'core', 'pronostics', 'hunts', 'loyalty', 'jackpot',
    'events', 'calendar', 'quiz', 'referral'
  ];
  v_entitlements text[] := coalesce(p_entitlements, array[]::text[]);
  v_prices text[] := coalesce(p_price_ids, array[]::text[]);
  v_access_active boolean;
begin
  if p_status not in ('trialing','active','past_due','canceled','inactive') then
    raise exception 'invalid subscription status';
  end if;
  if p_event_id is null or pg_catalog.char_length(p_event_id) > 255
     or p_customer_id is null or pg_catalog.char_length(p_customer_id) > 255
     or p_subscription_id is null
     or pg_catalog.char_length(p_subscription_id) > 255 then
    raise exception 'invalid stripe identifiers';
  end if;
  if p_plan_id not in ('starter', 'core', 'engagement', 'live', 'full') then
    raise exception 'invalid plan';
  end if;
  if not v_entitlements <@ v_allowed then
    raise exception 'invalid entitlement';
  end if;
  if coalesce(array_length(v_prices, 1), 0) > 20
     or exists(
       select 1 from unnest(v_prices) price
        where pg_catalog.char_length(price) > 255
     ) then
    raise exception 'invalid price identifiers';
  end if;

  insert into public.stripe_events(id, event_created_at)
  values(p_event_id, p_event_created_at)
  on conflict(id) do nothing;
  if not found then
    return query select null::uuid, false, true;
    return;
  end if;

  select * into v_org
    from public.organizations
   where stripe_customer_id = p_customer_id
   for update;
  if not found then raise exception 'unknown stripe customer'; end if;

  if v_org.stripe_event_created_at is null
     or p_event_created_at >= v_org.stripe_event_created_at then
    v_access_active := p_status in ('trialing', 'active', 'past_due');

    perform pg_catalog.set_config(
      'lastchance.stripe_entitlements_sync',
      'on',
      true
    );

    update public.organizations set
      subscription_status = p_status,
      plan = p_plan_id,
      past_due_since = case
        when p_status = 'past_due'
          then coalesce(past_due_since, p_event_created_at)
        else null
      end,
      trial_ends_at = case
        when p_status = 'trialing' and p_trial_ends_at is not null
          then p_trial_ends_at
        else trial_ends_at
      end,
      stripe_event_created_at = p_event_created_at,
      -- Projections de compatibilité : les RPC publiques historiques
      -- continuent à appliquer les mêmes contrôles pendant la migration.
      addon_pronostics = v_access_active and 'pronostics' = any(v_entitlements),
      addon_hunts = v_access_active and 'hunts' = any(v_entitlements),
      addon_loyalty = v_access_active and 'loyalty' = any(v_entitlements),
      addon_jackpot = v_access_active and 'jackpot' = any(v_entitlements),
      addon_events = v_access_active and 'events' = any(v_entitlements),
      addon_calendar = v_access_active and 'calendar' = any(v_entitlements),
      addon_quiz = v_access_active and 'quiz' = any(v_entitlements),
      addon_referral = v_access_active and 'referral' = any(v_entitlements)
    where id = v_org.id;

    delete from public.organization_entitlements
     where organization_entitlements.organization_id = v_org.id
       and source = 'stripe';

    insert into public.organization_entitlements (
      organization_id, entitlement, source, active,
      source_reference, metadata, updated_at
    )
    select
      v_org.id,
      allowed.entitlement,
      'stripe',
      v_access_active and allowed.entitlement = any(v_entitlements),
      p_subscription_id,
      pg_catalog.jsonb_build_object('price_ids', to_jsonb(v_prices)),
      pg_catalog.now()
    from unnest(v_allowed) as allowed(entitlement);

    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;
    perform pg_catalog.set_config(
      'lastchance.stripe_entitlements_sync',
      'off',
      true
    );
    return query select v_org.id, true, false;
  end if;

  update public.stripe_events
     set processed_at = pg_catalog.now()
   where id = p_event_id;
  return query select v_org.id, false, false;
end
$$;

revoke all on function public.apply_stripe_subscription_event_v2(
  text,timestamptz,text,text,timestamptz,text,text,text[],text[]
) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_event_v2(
  text,timestamptz,text,text,timestamptz,text,text,text[],text[]
) to service_role;
