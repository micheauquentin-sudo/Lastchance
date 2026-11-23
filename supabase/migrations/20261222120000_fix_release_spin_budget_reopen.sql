-- Fix release_expired_spin_budget_reservations and set_campaign_status:
-- 1. Never reactivate archived/draft campaigns when releasing expired spin
--    budget reservations (require c.status = 'paused').
-- 2. Exclude campaigns requiring verified identity and isolate
--    'campaign prize value invariant violated' per campaign so a single
--    invalid campaign never rolls back the pg_cron job for all orgs.
-- 3. Clear paused_reason in set_campaign_status when transitioning to
--    draft or archived (in addition to active), and clean up stale rows.

update public.campaigns
   set paused_reason = null
 where status in ('draft', 'archived')
   and paused_reason is not null;

create or replace function public.release_expired_spin_budget_reservations(
  p_campaign_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_candidate record;
  v_reopened record;
  v_message text;
begin
  with candidates as (
    select s.id
      from public.spins s
     where s.prize_id is not null
       and not s.claimed
       and s.budget_reservation_released_at is null
       and s.budget_reservation_expires_at <= pg_catalog.now()
       and (p_campaign_id is null or s.campaign_id = p_campaign_id)
     order by s.budget_reservation_expires_at, s.id
     for update skip locked
  ), released as (
    update public.spins s
       set budget_reservation_released_at = pg_catalog.now()
      from candidates x
     where s.id = x.id
    returning s.organization_id, s.campaign_id, s.budget_cost_cents
  ), totals as (
    select r.organization_id, r.campaign_id,
           sum(r.budget_cost_cents)::integer as released_cents,
           count(*)::integer as released_count
      from released r
     group by r.organization_id, r.campaign_id
  ), debited as (
    update public.campaigns c
       set budget_reserved_cents = greatest(
         c.budget_reserved_cents - t.released_cents,
         0
       )
      from totals t
     where c.id = t.campaign_id
       and c.organization_id = t.organization_id
    returning c.id
  )
  select coalesce(sum(t.released_count), 0)::integer
    into v_count
    from totals t;

  -- Une pause provoquee uniquement par des claims abandonnes se repare seule.
  -- Une campagne archivee, brouillon, hors fenetre, sans droit ou portant un
  -- lot exigeant une identite verifiee reste fermee, et un echec d'invariant
  -- sur une campagne n'annule jamais le traitement des autres.
  for v_candidate in
    select c.id, c.organization_id
      from public.campaigns c
     where c.status = 'paused'
       and c.paused_reason = 'budget_reached'
       and (p_campaign_id is null or c.id = p_campaign_id)
       and (c.starts_at is null or c.starts_at <= pg_catalog.now())
       and (c.ends_at is null or c.ends_at > pg_catalog.now())
       and public.org_has_module_access(c.organization_id, 'wheel')
       and not public.campaign_has_prize_requiring_verified_identity(c.id)
       and public.campaign_has_affordable_winning_prize(
         c.organization_id, c.id
       )
     order by c.id
  loop
    begin
      perform 1
        from public.campaigns c
       where c.id = v_candidate.id
         and c.organization_id = v_candidate.organization_id
       for update;

      update public.campaigns c
         set status = 'active', paused_reason = null
       where c.id = v_candidate.id
         and c.organization_id = v_candidate.organization_id
         and c.status = 'paused'
         and c.paused_reason = 'budget_reached'
         and (c.starts_at is null or c.starts_at <= pg_catalog.now())
         and (c.ends_at is null or c.ends_at > pg_catalog.now())
         and public.org_has_module_access(c.organization_id, 'wheel')
         and not public.campaign_has_prize_requiring_verified_identity(c.id)
         and public.campaign_has_affordable_winning_prize(
           c.organization_id, c.id
         )
      returning c.id, c.organization_id
           into v_reopened;

      if found then
        insert into public.audit_logs(organization_id, actor, action, metadata)
        values (
          v_reopened.organization_id,
          'system',
          'campaign.budget.reopened',
          pg_catalog.jsonb_build_object('campaign_id', v_reopened.id)
        );
      end if;
    exception when raise_exception then
      get stacked diagnostics v_message = message_text;
      if v_message is distinct from 'campaign prize value invariant violated' then
        raise;
      end if;
      -- La candidate a change entre la selection et le verrou : on l'ignore.
    end;
  end loop;

  return v_count;
end
$$;

comment on function public.release_expired_spin_budget_reservations(uuid) is
  'Libere les reservations non reclamees apres 20 minutes et rouvre seulement '
  'les campagnes en pause budget que cette liberation rend de nouveau '
  'solvables, en isolant toute violation d''invariant de valeur de lot.';

revoke all on function public.release_expired_spin_budget_reservations(uuid)
  from public, anon, authenticated;
grant execute on function public.release_expired_spin_budget_reservations(uuid)
  to service_role;

create or replace function public.set_campaign_status(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_auto_avant boolean := false;
  v_desarme boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('draft', 'active', 'paused', 'archived') then
    raise exception 'invalid status';
  end if;

  perform public.release_expired_spin_budget_reservations(p_campaign_id);

  select c.status, c.auto_schedule into v_current, v_auto_avant
    from public.campaigns c
   where c.id = p_campaign_id and c.organization_id = p_organization_id
   for update;
  if not found then return false; end if;
  if v_current = p_status then return true; end if;
  if v_current = 'archived' and p_status = 'active' then
    raise exception 'invalid transition';
  end if;

  if p_status = 'active' then
    perform public.assert_module_publish_allowed(p_organization_id, 'wheel');
    if public.campaign_has_winning_prize(p_organization_id, p_campaign_id)
       and not public.campaign_has_affordable_winning_prize(
         p_organization_id, p_campaign_id
       ) then
      raise exception 'campaign budget unavailable';
    end if;
  end if;

  v_desarme := v_auto_avant and p_status in ('paused', 'draft', 'archived');

  update public.campaigns
     set status = p_status,
         paused_reason = case
           when p_status in ('active', 'draft', 'archived') then null
           else paused_reason
         end,
         auto_schedule = case when v_desarme then false else auto_schedule end
   where id = p_campaign_id and organization_id = p_organization_id;

  insert into public.audit_logs(organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'campaign.status.update',
    pg_catalog.jsonb_build_object(
      'campaign_id', p_campaign_id,
      'previous', v_current,
      'next', p_status,
      'reason', nullif(pg_catalog.btrim(coalesce(p_reason, '')), ''),
      'auto_schedule_disarmed', v_desarme
    )
  );
  return true;
end
$$;

comment on function public.set_campaign_status(uuid,uuid,text,text) is
  'Transition de campagne gardee par role, droit, matrice et budget engage. '
  'Efface paused_reason lors du passage en active, draft ou archived.';

revoke all on function public.set_campaign_status(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.set_campaign_status(uuid,uuid,text,text)
  to authenticated, service_role;
