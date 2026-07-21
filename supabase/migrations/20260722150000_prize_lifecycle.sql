-- ============================================================
-- Lastchance — Cycle complet du gain (audit : cycle du gain)
--
-- 1. Économie du lot : coût réel + valeur commerciale sur prizes.
-- 2. Expiration SERVEUR : redeem_expires_at posé à la réclamation
--    (trigger, depuis campaigns.code_ttl_seconds) et VÉRIFIÉ par la
--    RPC de retrait — le compte à rebours client n'était qu'un
--    affichage, une capture d'écran gardait le code utilisable.
-- 3. Retrait / annulation / expiration : états réels, annulation
--    motivée avec restock et audit.
-- 4. Panier au retrait (facultatif) : le staff saisit le montant —
--    base du revenu attribuable et du ROI.
-- 5. Entonnoir gagné → réclamé → retiré + ROI : RPC d'agrégation.
-- ============================================================

-- ── Économie du lot ──────────────────────────────────────────
alter table public.prizes
  add column if not exists cost_cents integer
    check (cost_cents is null or cost_cents between 0 and 100000000),
  add column if not exists value_cents integer
    check (value_cents is null or value_cents between 0 and 100000000);

comment on column public.prizes.cost_cents is
  'Coût réel du lot pour le commerçant, en centimes (ROI).';
comment on column public.prizes.value_cents is
  'Valeur commerciale affichable du lot, en centimes.';

-- ── Cycle de vie de la participation ─────────────────────────
alter table public.participations
  add column if not exists redeem_expires_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_reason text
    check (cancelled_reason is null or char_length(cancelled_reason) between 1 and 300),
  add column if not exists basket_cents integer
    check (basket_cents is null or basket_cents between 0 and 100000000);

comment on column public.participations.redeem_expires_at is
  'Expiration SERVEUR du code de retrait (null : sans limite). Vérifiée par redeem_by_code.';
comment on column public.participations.basket_cents is
  'Montant du panier saisi en caisse au retrait (facultatif) — revenu attribuable.';

-- Historique : les codes non retirés héritent du TTL de leur campagne
-- (le compte à rebours client annonçait déjà cette échéance).
update public.participations p
   set redeem_expires_at = p.created_at
       + make_interval(secs => c.code_ttl_seconds)
  from public.campaigns c
 where c.id = p.campaign_id
   and p.redeem_expires_at is null
   and p.redeemed_at is null
   and p.redeem_code is not null
   and c.code_ttl_seconds is not null;

-- À chaque réclamation : l'échéance est figée en base à l'insertion.
create or replace function public.set_participation_redeem_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ttl integer;
begin
  if new.redeem_code is not null and new.redeem_expires_at is null then
    select c.code_ttl_seconds into v_ttl
      from public.campaigns c where c.id = new.campaign_id;
    if v_ttl is not null then
      new.redeem_expires_at := pg_catalog.now()
        + pg_catalog.make_interval(secs => v_ttl);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists participations_set_redeem_expiry on public.participations;
create trigger participations_set_redeem_expiry
  before insert on public.participations
  for each row execute function public.set_participation_redeem_expiry();

-- ── Retrait : expiration et annulation VÉRIFIÉES en base ─────
-- Reprend l'existant (00019 : recherche + validation + audit atomiques,
-- actor obligatoire) et ajoute : refus des codes expirés ou annulés,
-- panier facultatif, statut complet dans la réponse.
drop function if exists public.redeem_by_code(uuid, text, text);

create or replace function public.redeem_by_code(
  p_organization_id uuid,
  p_redeem_code text,
  p_actor text,
  p_basket_cents integer default null
)
returns table(
  id uuid, created_at timestamptz, first_name text, redeem_code text,
  redeemed_at timestamptz, prize_label text, prize_description text,
  campaign_name text, redeemed_now boolean,
  redeem_expires_at timestamptz, cancelled_at timestamptz,
  basket_cents integer
)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_actor is null or length(p_actor) = 0 then raise exception 'actor required'; end if;
  if p_basket_cents is not null and p_basket_cents not between 0 and 100000000 then
    raise exception 'invalid basket';
  end if;

  update public.participations p
     set redeemed_at = now(),
         basket_cents = p_basket_cents
   where p.organization_id = p_organization_id
     and p.redeem_code = upper(trim(p_redeem_code))
     and p.redeemed_at is null
     and p.cancelled_at is null
     -- L'expiration fait foi ICI : un code photographié ou copié d'un
     -- email ne passe plus une fois l'échéance atteinte.
     and (p.redeem_expires_at is null or p.redeem_expires_at > now())
  returning p.id into v_id;

  if v_id is not null then
    insert into public.audit_logs(organization_id, actor, action, metadata)
    values(p_organization_id, p_actor, 'participation.redeem',
           jsonb_build_object('participation_id', v_id, 'basket_cents', p_basket_cents));
  end if;

  return query
  select p.id, p.created_at, p.first_name, p.redeem_code, p.redeemed_at,
         pr.label, pr.description, c.name, (v_id is not null),
         p.redeem_expires_at, p.cancelled_at, p.basket_cents
  from public.participations p
  left join public.prizes pr on pr.id = p.prize_id
  join public.campaigns c on c.id = p.campaign_id
  where p.organization_id = p_organization_id
    and p.redeem_code = upper(trim(p_redeem_code)) limit 1;
end
$$;

revoke all on function public.redeem_by_code(uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.redeem_by_code(uuid,text,text,integer) to service_role;

-- ── Annulation motivée (fraude, erreur de saisie, rupture) ───
create or replace function public.cancel_participation(
  p_organization_id uuid,
  p_participation_id uuid,
  p_reason text,
  p_restock boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prize uuid;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_editor(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;
  if p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 5 then
    raise exception 'reason required';
  end if;

  update public.participations p
     set cancelled_at = pg_catalog.now(),
         cancelled_reason = pg_catalog.btrim(p_reason)
   where p.id = p_participation_id
     and p.organization_id = p_organization_id
     and p.redeemed_at is null
     and p.cancelled_at is null
  returning p.prize_id into v_prize;
  if not found then return false; end if;

  -- Le lot repart en stock (comptages null = illimité, intouchés).
  if p_restock and v_prize is not null then
    update public.prizes
       set stock = stock + 1
     where id = v_prize
       and organization_id = p_organization_id
       and stock is not null;
  end if;

  insert into public.audit_logs(organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'participation.cancel',
    pg_catalog.jsonb_build_object(
      'participation_id', p_participation_id,
      'reason', pg_catalog.btrim(p_reason),
      'restocked', p_restock and v_prize is not null
    )
  );
  return true;
end;
$$;

revoke all on function public.cancel_participation(uuid,uuid,text,boolean)
  from public, anon;
grant execute on function public.cancel_participation(uuid,uuid,text,boolean)
  to authenticated, service_role;

-- ── Entonnoir du gain + revenu attribuable + ROI ─────────────
create or replace function public.org_prize_funnel(
  p_organization_id uuid,
  p_days integer default 30
)
returns table (
  spins_total bigint,
  wins bigint,
  claimed bigint,
  redeemed bigint,
  expired bigint,
  cancelled bigint,
  basket_revenue_cents bigint,
  redeemed_cost_cents bigint,
  redeemed_value_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_member(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;
  v_since := pg_catalog.now()
    - pg_catalog.make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));

  return query
  select
    (select count(*) from public.spins s
      where s.organization_id = p_organization_id and s.created_at >= v_since),
    (select count(*) from public.spins s
      where s.organization_id = p_organization_id and s.created_at >= v_since
        and not s.is_losing),
    (select count(*) from public.participations p
      where p.organization_id = p_organization_id and p.created_at >= v_since),
    (select count(*) from public.participations p
      where p.organization_id = p_organization_id and p.created_at >= v_since
        and p.redeemed_at is not null),
    (select count(*) from public.participations p
      where p.organization_id = p_organization_id and p.created_at >= v_since
        and p.redeemed_at is null and p.cancelled_at is null
        and p.redeem_expires_at is not null and p.redeem_expires_at <= pg_catalog.now()),
    (select count(*) from public.participations p
      where p.organization_id = p_organization_id and p.created_at >= v_since
        and p.cancelled_at is not null),
    (select coalesce(sum(p.basket_cents), 0) from public.participations p
      where p.organization_id = p_organization_id and p.created_at >= v_since
        and p.redeemed_at is not null),
    (select coalesce(sum(pr.cost_cents), 0) from public.participations p
      join public.prizes pr on pr.id = p.prize_id
      where p.organization_id = p_organization_id and p.created_at >= v_since
        and p.redeemed_at is not null),
    (select coalesce(sum(pr.value_cents), 0) from public.participations p
      join public.prizes pr on pr.id = p.prize_id
      where p.organization_id = p_organization_id and p.created_at >= v_since
        and p.redeemed_at is not null);
end;
$$;

revoke all on function public.org_prize_funnel(uuid, integer) from public, anon;
grant execute on function public.org_prize_funnel(uuid, integer)
  to authenticated, service_role;
