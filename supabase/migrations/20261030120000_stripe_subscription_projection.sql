-- Projection versionnee de la facturation Stripe pour le back-office.
-- Stripe reste l'autorite : cette table n'est ecrite que par le webhook signe,
-- apres relecture de l'objet Subscription courant. Elle ne porte aucun droit
-- d'acces et ne doit jamais servir a en deduire un.

create table public.stripe_subscription_projections (
  subscription_id text primary key
    check (
      pg_catalog.char_length(subscription_id) between 1 and 255
    ),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  stripe_customer_id text not null
    check (
      pg_catalog.char_length(stripe_customer_id) between 1 and 255
    ),
  stripe_status text not null
    check (
      pg_catalog.char_length(stripe_status) between 1 and 64
    ),
  cancel_at_period_end boolean not null default false,
  cancel_at timestamptz,
  canceled_at timestamptz,
  ended_at timestamptz,
  next_billing_at timestamptz,
  items jsonb not null default '[]'::jsonb
    check (
      pg_catalog.jsonb_typeof(items) = 'array'
      and pg_catalog.jsonb_array_length(items) <= 100
      and pg_catalog.octet_length(items::text) <= 65536
    ),
  -- NULL signifie "au moins une ligne recurrente n'est pas chiffrable".
  -- Un total partiel ne doit jamais etre presente comme le MRR reel.
  mrr_monthly_cents bigint
    check (mrr_monthly_cents is null or mrr_monthly_cents >= 0),
  projection_version smallint not null default 1
    check (projection_version = 1),
  last_event_id text not null
    check (
      pg_catalog.char_length(last_event_id) between 1 and 255
    ),
  last_event_created_at timestamptz not null,
  synced_at timestamptz not null default pg_catalog.now()
);

comment on table public.stripe_subscription_projections is
  'Cache back-office versionne des abonnements et items recurrents relus chez Stripe. '
  'Ne gouverne aucun acces; ecriture service_role par webhook uniquement.';
comment on column public.stripe_subscription_projections.items is
  'Snapshot v1 des SubscriptionItems Stripe: prix, quantite, recurrence, periode et montant mensuel derive.';
comment on column public.stripe_subscription_projections.mrr_monthly_cents is
  'Somme mensuelle des items recurrents Stripe. NULL si une ligne est non chiffrable; jamais derivee des droits.';

create index stripe_subscription_projections_org_idx
  on public.stripe_subscription_projections (
    organization_id,
    last_event_created_at desc
  );
create index stripe_subscription_projections_active_mrr_idx
  on public.stripe_subscription_projections (organization_id, stripe_status)
  where stripe_status = 'active';

alter table public.stripe_subscription_projections enable row level security;
revoke all on table public.stripe_subscription_projections
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.stripe_subscription_projections to service_role;

create or replace function public.apply_stripe_subscription_projection_v1(
  p_event_id text,
  p_event_created_at timestamptz,
  p_customer_id text,
  p_subscription_id text,
  p_stripe_status text,
  p_cancel_at_period_end boolean,
  p_cancel_at timestamptz,
  p_canceled_at timestamptz,
  p_ended_at timestamptz,
  p_next_billing_at timestamptz,
  p_items jsonb,
  p_mrr_monthly_cents bigint
)
returns table(organization_id uuid, applied boolean, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_existing public.stripe_subscription_projections%rowtype;
  v_applied boolean := false;
begin
  if p_event_id is null
     or pg_catalog.char_length(p_event_id) not between 1 and 255
     or p_customer_id is null
     or pg_catalog.char_length(p_customer_id) not between 1 and 255
     or p_subscription_id is null
     or pg_catalog.char_length(p_subscription_id) not between 1 and 255
     or p_stripe_status is null
     or pg_catalog.char_length(p_stripe_status) not between 1 and 64
     or p_event_created_at is null then
    raise exception 'invalid stripe projection identifiers';
  end if;

  if p_items is null
     or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) > 100
     or pg_catalog.octet_length(p_items::text) > 65536
     or exists (
       select 1
         from pg_catalog.jsonb_array_elements(p_items) item
        where pg_catalog.jsonb_typeof(item) <> 'object'
           or pg_catalog.jsonb_typeof(item -> 'item_id') <> 'string'
           or pg_catalog.jsonb_typeof(item -> 'price_id') <> 'string'
           or pg_catalog.jsonb_typeof(item -> 'currency') <> 'string'
           or pg_catalog.jsonb_typeof(item -> 'quantity') <> 'number'
           or coalesce(
                pg_catalog.jsonb_typeof(item -> 'recurring_interval'),
                'missing'
              ) not in ('string', 'null')
           or coalesce(
                pg_catalog.jsonb_typeof(item -> 'monthly_amount_cents'),
                'missing'
              ) not in ('number', 'null')
     ) then
    raise exception 'invalid stripe projection items';
  end if;

  if p_mrr_monthly_cents is not null and p_mrr_monthly_cents < 0 then
    raise exception 'invalid stripe projection mrr';
  end if;

  select o.id into v_organization_id
    from public.organizations o
   where o.stripe_customer_id = p_customer_id
   for update;
  if not found then
    raise exception 'unknown stripe customer';
  end if;

  select p.* into v_existing
    from public.stripe_subscription_projections p
   where p.subscription_id = p_subscription_id
   for update;

  if found then
    if v_existing.organization_id <> v_organization_id
       or v_existing.stripe_customer_id <> p_customer_id then
      raise exception 'stripe subscription ownership mismatch';
    end if;
    if v_existing.last_event_id = p_event_id then
      return query select v_organization_id, false, true;
      return;
    end if;
    if p_event_created_at < v_existing.last_event_created_at then
      return query select v_organization_id, false, false;
      return;
    end if;

    update public.stripe_subscription_projections set
      stripe_status = p_stripe_status,
      cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
      cancel_at = p_cancel_at,
      canceled_at = p_canceled_at,
      ended_at = p_ended_at,
      next_billing_at = p_next_billing_at,
      items = p_items,
      mrr_monthly_cents = p_mrr_monthly_cents,
      last_event_id = p_event_id,
      last_event_created_at = p_event_created_at,
      synced_at = pg_catalog.now()
    where subscription_id = p_subscription_id;
    v_applied := true;
  else
    insert into public.stripe_subscription_projections (
      subscription_id,
      organization_id,
      stripe_customer_id,
      stripe_status,
      cancel_at_period_end,
      cancel_at,
      canceled_at,
      ended_at,
      next_billing_at,
      items,
      mrr_monthly_cents,
      projection_version,
      last_event_id,
      last_event_created_at
    ) values (
      p_subscription_id,
      v_organization_id,
      p_customer_id,
      p_stripe_status,
      coalesce(p_cancel_at_period_end, false),
      p_cancel_at,
      p_canceled_at,
      p_ended_at,
      p_next_billing_at,
      p_items,
      p_mrr_monthly_cents,
      1,
      p_event_id,
      p_event_created_at
    );
    v_applied := true;
  end if;

  return query select v_organization_id, v_applied, false;
end
$$;

revoke all on function public.apply_stripe_subscription_projection_v1(
  text, timestamptz, text, text, text, boolean, timestamptz, timestamptz,
  timestamptz, timestamptz, jsonb, bigint
) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_projection_v1(
  text, timestamptz, text, text, text, boolean, timestamptz, timestamptz,
  timestamptz, timestamptz, jsonb, bigint
) to service_role;
