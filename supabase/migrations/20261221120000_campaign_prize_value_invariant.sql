-- ============================================================
-- LastChance - invariant de valeur des lots publics
--
-- Une campagne active ne peut contenir aucun lot gagnant tirable dont la
-- valeur est inconnue ou atteint 20 EUR. Les controles applicatifs restent
-- utiles pour le message marchand, mais la base ferme la course entre leur
-- lecture et l'ecriture finale, ainsi que le chemin direct du scheduler.
-- ============================================================

create or replace function public.prize_requires_verified_identity(
  p_is_active boolean,
  p_is_losing boolean,
  p_weight integer,
  p_stock integer,
  p_value_cents integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_is_active, false)
     and not coalesce(p_is_losing, false)
     and coalesce(p_weight, 0) > 0
     and (p_stock is null or p_stock > 0)
     and (p_value_cents is null or p_value_cents >= 2000)
$$;

revoke all on function public.prize_requires_verified_identity(
  boolean, boolean, integer, integer, integer
) from public, anon, authenticated;

create or replace function public.campaign_has_prize_requiring_verified_identity(
  p_campaign_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.wheels w
      join public.prizes p
        on p.wheel_id = w.id
       and p.organization_id = w.organization_id
     where w.campaign_id = p_campaign_id
       and public.prize_requires_verified_identity(
         p.is_active, p.is_losing, p.weight, p.stock, p.value_cents
       )
  )
$$;

revoke all on function public.campaign_has_prize_requiring_verified_identity(uuid)
  from public, anon, authenticated;
grant execute on function public.campaign_has_prize_requiring_verified_identity(uuid)
  to service_role;

-- Les cinq moteurs de tours offerts ecrivent directement dans spins et ne
-- passent pas par perform_atomic_spin. Ils ne disposent donc pas du pont
-- d'identite qui accompagne un gain de forte valeur. Le garde est borne a
-- leurs sources exactes : les tirages ordinaires direct/share conservent leur
-- filtrage par lot dans perform_atomic_spin.
--
-- Ce BEFORE INSERT est aussi le point atomique commun aux cinq RPC. Il prend
-- le verrou campagne avant de relire le catalogue : soit le tirage gagne la
-- course et une revalorisation concurrente sera refusee, soit la revalorisation
-- gagne et l'INSERT echoue. L'exception annule dans la RPC le decrement de
-- stock deja tente et laisse son grant non consomme.
create or replace function public.guard_offered_spin_prize_value_invariant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if coalesce(new.source, '') not in (
    'calendar', 'loyalty', 'quiz', 'referral', 'reserver_wait'
  ) then
    return new;
  end if;

  select c.status
    into v_status
    from public.campaigns c
   where c.id = new.campaign_id
     and c.organization_id = new.organization_id
   for update;

  if v_status = 'active'
     and (
       public.campaign_has_prize_requiring_verified_identity(new.campaign_id)
       or exists (
         -- Le stock du lot tire peut etre passe de 1 a 0 juste avant cet
         -- INSERT. Il reste un gain interdit pour CE spin, meme s'il n'est
         -- desormais plus tirable par le suivant.
         select 1
           from public.prizes p
           join public.wheels w
             on w.id = p.wheel_id
            and w.organization_id = p.organization_id
          where p.id = new.prize_id
            and w.campaign_id = new.campaign_id
            and p.is_active
            and not p.is_losing
            and p.weight > 0
            and (p.value_cents is null or p.value_cents >= 2000)
       )
     ) then
    raise exception 'offered spin prize value invariant violated'
      using errcode = 'P0001';
  end if;

  return new;
end
$$;

revoke all on function public.guard_offered_spin_prize_value_invariant()
  from public, anon, authenticated;

drop trigger if exists spins_offered_prize_value_guard on public.spins;
create trigger spins_offered_prize_value_guard
  before insert on public.spins
  for each row execute function public.guard_offered_spin_prize_value_invariant();

-- Les ecritures enfant prennent leurs verrous vers le parent, dans le meme
-- ordre : roue, puis campagne. L'activation verrouille deja sa propre ligne de
-- campagne et ne verrouille jamais les enfants ; il n'existe donc aucun cycle.
-- Le SELECT FOR UPDATE relit aussi la version gagnee apres une attente sous
-- READ COMMITTED, ce qu'une simple lecture de statut ne garantirait pas.
create or replace function public.lock_campaign_prize_value_invariant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_campaign_status text;
begin
  -- Une edition descriptive d'un lot legacy interdit doit rester possible :
  -- seul le tuple qui peut creer/aggraver l'invariant prend les verrous.
  if tg_table_name = 'prizes' then
    if tg_op = 'UPDATE'
       and (
         old.organization_id, old.wheel_id, old.is_active, old.is_losing,
         old.weight, old.stock, old.value_cents
       ) is not distinct from (
         new.organization_id, new.wheel_id, new.is_active, new.is_losing,
         new.weight, new.stock, new.value_cents
       ) then
      return new;
    end if;
  end if;

  if coalesce((select auth.role()), '') = 'authenticated'
     and not public.is_org_editor(new.organization_id) then
    return new;
  end if;

  if tg_table_name = 'wheels' and tg_op = 'INSERT' then
    select c.status
      into v_campaign_status
      from public.campaigns c
     where c.id = new.campaign_id
       and c.organization_id = new.organization_id
     for update;

    -- createWheel fait deux requetes PostgREST. Sans ce refus sur la premiere,
    -- les lots par defaut (valeur NULL) sont rejetes par la seconde requete et
    -- la roue deja commitee reste vide. Les creations serveur/seed, capables
    -- de construire atomiquement un catalogue complet, restent permises.
    if coalesce((select auth.role()), '') = 'authenticated'
       and v_campaign_status = 'active' then
      raise exception 'cannot add wheel to active campaign'
        using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'prizes' then
    if not public.prize_requires_verified_identity(
      new.is_active, new.is_losing, new.weight, new.stock, new.value_cents
    ) then
      return new;
    end if;

    select w.campaign_id
      into v_campaign_id
      from public.wheels w
     where w.id = new.wheel_id
       and w.organization_id = new.organization_id
     for update;

    if v_campaign_id is not null then
      perform 1
        from public.campaigns c
       where c.id = v_campaign_id
         and c.organization_id = new.organization_id
       for update;
    end if;
  elsif tg_table_name = 'wheels'
        and tg_op = 'UPDATE'
        and (old.campaign_id, old.organization_id)
            is distinct from (new.campaign_id, new.organization_id) then
    -- Deux campagnes peuvent etre concernees par un deplacement. L'ordre UUID
    -- rend deux deplacements inverses deterministes.
    perform 1
      from public.campaigns c
     where (c.id = old.campaign_id and c.organization_id = old.organization_id)
        or (c.id = new.campaign_id and c.organization_id = new.organization_id)
     order by c.id
     for update;
  end if;

  return new;
end
$$;

revoke all on function public.lock_campaign_prize_value_invariant()
  from public, anon, authenticated;

drop trigger if exists prizes_lock_campaign_value_invariant on public.prizes;
create trigger prizes_lock_campaign_value_invariant
  before insert or update on public.prizes
  for each row execute function public.lock_campaign_prize_value_invariant();

drop trigger if exists wheels_lock_campaign_value_invariant on public.wheels;
create trigger wheels_lock_campaign_value_invariant
  before insert or update of campaign_id, organization_id on public.wheels
  for each row execute function public.lock_campaign_prize_value_invariant();

-- La verification est une contrainte differee : une transaction peut construire
-- un catalogue en plusieurs instructions, mais son COMMIT ne peut jamais rendre
-- visible l'etat interdit. SET CONSTRAINTS permet aux tests et aux RPC qui le
-- souhaitent de demander le refus avant le COMMIT.
create or replace function public.assert_campaign_prize_value_invariant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_status text;
begin
  -- Meme frontiere que le trigger de verrouillage : label, description,
  -- couleur, position, cout ou emoji n'ont aucun effet sur l'invariant. Une
  -- campagne legacy doit rester editable pour pouvoir etre reparee.
  if tg_table_name = 'prizes' then
    if tg_op = 'UPDATE'
       and (
         old.organization_id, old.wheel_id, old.is_active, old.is_losing,
         old.weight, old.stock, old.value_cents
       ) is not distinct from (
         new.organization_id, new.wheel_id, new.is_active, new.is_losing,
         new.weight, new.stock, new.value_cents
       ) then
      return null;
    end if;
  end if;

  if tg_table_name = 'campaigns' then
    if new.status <> 'active'
       or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
      return null;
    end if;
    v_campaign_id := new.id;
  elsif tg_table_name = 'prizes' then
    if not public.prize_requires_verified_identity(
      new.is_active, new.is_losing, new.weight, new.stock, new.value_cents
    ) then
      return null;
    end if;

    select w.campaign_id
      into v_campaign_id
      from public.prizes p
      join public.wheels w
        on w.id = p.wheel_id
       and w.organization_id = p.organization_id
     where p.id = new.id;
  elsif tg_table_name = 'wheels' then
    if tg_op <> 'UPDATE'
       or (old.campaign_id, old.organization_id)
          is not distinct from (new.campaign_id, new.organization_id) then
      return null;
    end if;

    select w.campaign_id
      into v_campaign_id
      from public.wheels w
     where w.id = new.id;
  end if;

  if v_campaign_id is null then return null; end if;

  select c.status
    into v_status
    from public.campaigns c
   where c.id = v_campaign_id;

  if v_status = 'active'
     and public.campaign_has_prize_requiring_verified_identity(v_campaign_id) then
    raise exception 'campaign prize value invariant violated'
      using errcode = 'P0001';
  end if;

  return null;
end
$$;

revoke all on function public.assert_campaign_prize_value_invariant()
  from public, anon, authenticated;

drop trigger if exists campaigns_prize_value_invariant on public.campaigns;
create constraint trigger campaigns_prize_value_invariant
  after insert or update on public.campaigns
  deferrable initially deferred
  for each row execute function public.assert_campaign_prize_value_invariant();

drop trigger if exists prizes_campaign_value_invariant on public.prizes;
create constraint trigger prizes_campaign_value_invariant
  after insert or update on public.prizes
  deferrable initially deferred
  for each row execute function public.assert_campaign_prize_value_invariant();

drop trigger if exists wheels_campaign_value_invariant on public.wheels;
create constraint trigger wheels_campaign_value_invariant
  after update on public.wheels
  deferrable initially deferred
  for each row execute function public.assert_campaign_prize_value_invariant();

-- Le scheduler ne fait plus un UPDATE multi-lignes pour les activations. Il
-- verrouille chaque candidate, puis la revalide dans une nouvelle instruction :
-- une revalorisation qui vient de gagner la course est donc visible. Un refus
-- d'invariant ne peut annuler que cette candidate, jamais les voisines sures.
create or replace function public.run_campaign_schedule()
returns table (campaign_id uuid, organization_id uuid, action text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_activated record;
  v_message text;
begin
  for v_candidate in
    select c.id, c.organization_id
      from public.campaigns c
     where c.auto_schedule
       and c.status in ('draft', 'paused')
       and c.paused_reason is distinct from 'budget_reached'
       and c.starts_at is not null
       and c.starts_at <= pg_catalog.now()
       and (c.ends_at is null or c.ends_at > pg_catalog.now())
       and public.org_has_module_access(c.organization_id, 'wheel')
     order by c.id
  loop
    begin
      -- Instruction 1 : attendre l'ecrivain eventuel de lot/roue.
      perform 1
        from public.campaigns c
       where c.id = v_candidate.id
         and c.organization_id = v_candidate.organization_id
       for update;

      -- Instruction 2 : nouvelle photographie READ COMMITTED apres le verrou.
      update public.campaigns c
         set status = 'active', paused_reason = null
       where c.id = v_candidate.id
         and c.organization_id = v_candidate.organization_id
         and c.auto_schedule
         and c.status in ('draft', 'paused')
         and c.paused_reason is distinct from 'budget_reached'
         and c.starts_at is not null
         and c.starts_at <= pg_catalog.now()
         and (c.ends_at is null or c.ends_at > pg_catalog.now())
         and public.org_has_module_access(c.organization_id, 'wheel')
         and not public.campaign_has_prize_requiring_verified_identity(c.id)
      returning c.id, c.organization_id
           into v_activated;

      if found then
        campaign_id := v_activated.id;
        organization_id := v_activated.organization_id;
        action := 'activated';
        return next;
      end if;
    exception when raise_exception then
      get stacked diagnostics v_message = message_text;
      if v_message is distinct from 'campaign prize value invariant violated' then
        raise;
      end if;
      -- La candidate a change entre la selection et le verrou : on l'ignore.
    end;
  end loop;

  return query
  with ended as (
    update public.campaigns c
       set status = 'paused', paused_reason = 'schedule_end'
     where c.auto_schedule
       and c.status = 'active'
       and c.ends_at is not null
       and c.ends_at <= pg_catalog.now()
     returning c.id, c.organization_id
  ),
  blocked as (
    update public.campaigns c
       set status = 'paused', paused_reason = 'droit_expire'
     where c.auto_schedule
       and c.status in ('draft', 'paused')
       and c.paused_reason is distinct from 'budget_reached'
       and c.paused_reason is distinct from 'droit_expire'
       and c.starts_at is not null
       and c.starts_at <= pg_catalog.now()
       and (c.ends_at is null or c.ends_at > pg_catalog.now())
       and not public.org_has_module_access(c.organization_id, 'wheel')
     returning c.id, c.organization_id, c.name
  ),
  journal as (
    insert into public.audit_logs (organization_id, actor, action, metadata)
    select b.organization_id, 'system', 'campaign.schedule.blocked',
           pg_catalog.jsonb_build_object(
             'campaign_id', b.id,
             'campaign_name', b.name)
      from blocked b
    returning id
  ),
  notifie as (
    insert into public.jobs (type, payload, organization_id, idempotency_key)
    select 'automation.schedule-blocked',
           pg_catalog.jsonb_build_object(
             'campaignId', b.id,
             'organizationId', b.organization_id),
           b.organization_id,
           'automation.schedule-blocked:' || b.id::text || ':'
             || pg_catalog.to_char(
                  pg_catalog.now() at time zone 'UTC', 'YYYYMMDD'
                )
      from blocked b
    on conflict (idempotency_key) do nothing
    returning id
  )
  select e.id, e.organization_id, 'paused'::text from ended e
  union all
  select b.id, b.organization_id, 'blocked'::text from blocked b;
end
$$;

comment on function public.run_campaign_schedule() is
  'Bascule les campagnes auto_schedule. Chaque activation est verrouillee et '
  'revalidee separement ; une campagne portant un lot gagnant tirable de valeur '
  'inconnue ou >= 20 EUR est ignoree sans annuler les activations voisines. Les '
  'issues paused et blocked/droit_expire conservent leur comportement historique.';

revoke all on function public.run_campaign_schedule()
  from public, anon, authenticated;
grant execute on function public.run_campaign_schedule() to service_role;
