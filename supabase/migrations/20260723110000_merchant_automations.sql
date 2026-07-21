-- ============================================================
-- Lastchance — Socle des automatisations commerçant
--
--  1. Campagnes : programmation automatique (auto_schedule sur
--     starts_at/ends_at existants) + budget plafonné (le coût réel des
--     lots réclamés s'impute au fil de l'eau ; à l'atteinte, la
--     campagne se met en pause d'elle-même). paused_reason distingue
--     une pause de calendrier d'une pause budget — et s'efface dès que
--     la campagne repasse active (trigger).
--  2. claim_winning_spin : resignée à l'identique de 00019 + imputation
--     budget atomique dans LA transaction du gain (léger dépassement
--     d'un lot accepté par design) + job `automation.budget-paused`.
--  3. run_campaign_schedule() : bascule programmée (activation dans
--     [starts_at, ends_at), pause à l'échéance), planifiée par pg_cron
--     en SQL direct — visible dans cron_last_success().
--  4. Stock faible : seuil par lot + alerte UNE fois par épisode
--     (réarmée quand le stock remonte) via un job `automation.low-stock`.
--  5. automation_settings : activation/config par scénario d'email.
--  6. email_log : journal anti-doublon des scénarios (dedup_key).
--  7. newsletter_subscribers.birth_date : consentement anniversaire.
--  8. RPC de ciblage service_role : won_not_redeemed / inactive /
--     post_redemption / birthday — dédoublonnées par email_log,
--     désinscrits exclus.
--  9. Purge RGPD : email_log entre dans purge_expired_personal_data
--     (rétention par organisation, comme participations/abonnés).
-- ============================================================

-- ── 1. Campagnes : programmation + budget ────────────────────
alter table public.campaigns
  add column if not exists auto_schedule boolean not null default false,
  add column if not exists budget_cents integer
    check (budget_cents is null or budget_cents > 0),
  add column if not exists budget_spent_cents integer not null default 0
    check (budget_spent_cents >= 0),
  add column if not exists paused_reason text
    check (paused_reason is null or paused_reason in ('schedule_end', 'budget_reached'));

comment on column public.campaigns.auto_schedule is
  'Programmation automatique : run_campaign_schedule() active/pause la campagne selon starts_at/ends_at.';
comment on column public.campaigns.budget_cents is
  'Plafond de dépense en centimes (somme des cost_cents des lots réclamés). Null = sans plafond.';
comment on column public.campaigns.budget_spent_cents is
  'Dépense imputée à chaque gain réclamé (claim_winning_spin, atomique).';
comment on column public.campaigns.paused_reason is
  'Pourquoi la campagne est en pause automatique (schedule_end, budget_reached). Null : pause manuelle ou campagne non pausée. Effacé au retour en active.';

-- Toute remise en route (RPC, action commerçant, programmation) efface
-- le motif de pause automatique — sans dépendre du code appelant.
create or replace function public.campaigns_clear_paused_reason()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and old.status is distinct from new.status then
    new.paused_reason := null;
  end if;
  return new;
end;
$$;

revoke all on function public.campaigns_clear_paused_reason()
  from public, anon, authenticated;

drop trigger if exists campaigns_clear_paused_reason on public.campaigns;
create trigger campaigns_clear_paused_reason
  before update of status on public.campaigns
  for each row execute function public.campaigns_clear_paused_reason();

-- ── 2. claim_winning_spin : imputation budget dans la transaction ──
-- Corps repris à l'identique de 00019 (version en vigueur, signature
-- inchangée) ; ajout : budget_spent_cents += coalesce(cost_cents, 0),
-- pause budget_reached + job de notification à l'atteinte du plafond.
create or replace function public.claim_winning_spin(
  p_spin_id uuid,
  p_first_name text,
  p_email text,
  p_phone text,
  p_accepted_terms boolean,
  p_marketing_opt_in boolean
)
returns table(participation_id uuid, redeem_code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_spin public.spins%rowtype;
  v_campaign public.campaigns%rowtype;
  v_code text;
  v_id uuid;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_budget_cents integer;
  v_budget_spent integer;
  i integer;
  attempt integer;
begin
  select * into v_spin from public.spins where id = p_spin_id for update;
  if not found or v_spin.is_losing or v_spin.prize_id is null or v_spin.claimed then
    raise exception 'gain unavailable';
  end if;
  select * into v_campaign from public.campaigns
    where id = v_spin.campaign_id and organization_id = v_spin.organization_id;
  if not found then raise exception 'campaign unavailable'; end if;
  if v_campaign.collect_email and p_email is null then raise exception 'email required'; end if;
  if v_campaign.collect_phone and p_phone is null then raise exception 'phone required'; end if;
  if (v_campaign.collect_email or v_campaign.collect_phone)
     and (p_first_name is null or not p_accepted_terms) then
    raise exception 'consent required';
  end if;

  for attempt in 1..8 loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := 'GAIN-';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, get_byte(v_bytes, i) % length(v_alphabet) + 1, 1);
    end loop;
    begin
      insert into public.participations(
        organization_id, campaign_id, wheel_id, prize_id, spin_id,
        first_name, email, phone, accepted_terms, marketing_opt_in,
        redeem_code, player_key
      ) values (
        v_spin.organization_id, v_spin.campaign_id, v_spin.wheel_id,
        v_spin.prize_id, v_spin.id,
        case when v_campaign.collect_email or v_campaign.collect_phone then p_first_name else null end,
        case when v_campaign.collect_email then p_email else null end,
        case when v_campaign.collect_phone then p_phone else null end,
        case when v_campaign.collect_email or v_campaign.collect_phone then p_accepted_terms else false end,
        case when v_campaign.collect_email or v_campaign.collect_phone then p_marketing_opt_in else false end,
        v_code, v_spin.player_key
      ) returning id into v_id;
      update public.spins set claimed = true where id = v_spin.id;

      -- ── Budget : le coût réel du lot s'impute ICI, atomiquement.
      -- Un plafond atteint pause la campagne dans la même transaction
      -- (le lot en cours reste dû : léger dépassement accepté).
      update public.campaigns c
         set budget_spent_cents = c.budget_spent_cents
           + coalesce((select p.cost_cents from public.prizes p
                        where p.id = v_spin.prize_id), 0)
       where c.id = v_spin.campaign_id
      returning c.budget_cents, c.budget_spent_cents
        into v_budget_cents, v_budget_spent;
      if v_budget_cents is not null and v_budget_spent >= v_budget_cents then
        update public.campaigns c
           set status = 'paused', paused_reason = 'budget_reached'
         where c.id = v_spin.campaign_id and c.status = 'active';
        if found then
          insert into public.audit_logs(organization_id, actor, action, metadata)
          values(v_spin.organization_id, 'system', 'campaign.budget.pause',
            jsonb_build_object('campaign_id', v_spin.campaign_id,
              'budget_cents', v_budget_cents,
              'budget_spent_cents', v_budget_spent));
        end if;
        insert into public.jobs (type, payload, organization_id, idempotency_key)
        values ('automation.budget-paused',
          jsonb_build_object('campaignId', v_spin.campaign_id,
                             'organizationId', v_spin.organization_id),
          v_spin.organization_id,
          'budget-paused:' || v_spin.campaign_id::text || ':' || v_budget_cents::text)
        on conflict (idempotency_key) do nothing;
      end if;

      insert into public.audit_logs(organization_id, actor, action, metadata)
      values(v_spin.organization_id, 'public', 'participation.claim',
        jsonb_build_object('campaign_id', v_spin.campaign_id, 'prize_id', v_spin.prize_id));
      if p_marketing_opt_in and p_email is not null then
        insert into public.newsletter_subscribers(organization_id, email, source)
        values(v_spin.organization_id, p_email, 'claim')
        on conflict(organization_id, email) do nothing;
        if found and exists(select 1 from public.organizations o where o.id = v_spin.organization_id and o.webhook_url is not null) then
          insert into public.webhook_deliveries(organization_id, event, data)
          values(v_spin.organization_id, 'newsletter.subscriber.created',
            jsonb_build_object('email', p_email, 'source', 'claim'));
        end if;
      end if;
      if exists(select 1 from public.organizations o where o.id = v_spin.organization_id and o.webhook_url is not null) then
        insert into public.webhook_deliveries(organization_id, event, data)
        values(v_spin.organization_id, 'participation.claimed', jsonb_strip_nulls(jsonb_build_object(
          'first_name', case when v_campaign.collect_email or v_campaign.collect_phone then p_first_name else null end,
          'email', case when v_campaign.collect_email then p_email else null end,
          'phone', case when v_campaign.collect_phone then p_phone else null end,
          'prize_label', (select label from public.prizes where id = v_spin.prize_id),
          'redeem_code', v_code
        )));
      end if;
      return query select v_id, v_code;
      return;
    exception when unique_violation then
      if exists(select 1 from public.participations where spin_id = v_spin.id) then
        raise exception 'gain already claimed';
      end if;
    end;
  end loop;
  raise exception 'code generation exhausted';
end
$$;

revoke all on function public.claim_winning_spin(uuid,text,text,text,boolean,boolean)
  from public, anon, authenticated;
grant execute on function public.claim_winning_spin(uuid,text,text,text,boolean,boolean)
  to service_role;

-- ── 3. Programmation : bascule d'état planifiée ──────────────
-- ACL seule en garde (pattern claim_jobs) : exécutable par le serveur
-- et par pg_cron (propriétaire), jamais par les clients.
create or replace function public.run_campaign_schedule()
returns table (campaign_id uuid, organization_id uuid, action text)
language sql
security definer
set search_path = ''
as $$
  with activated as (
    update public.campaigns c
       set status = 'active', paused_reason = null
     where c.auto_schedule
       and c.status in ('draft', 'paused')
       -- Un plafond de budget atteint prime sur le calendrier.
       and c.paused_reason is distinct from 'budget_reached'
       and c.starts_at is not null and c.starts_at <= pg_catalog.now()
       and (c.ends_at is null or c.ends_at > pg_catalog.now())
     returning c.id, c.organization_id
  ),
  ended as (
    update public.campaigns c
       set status = 'paused', paused_reason = 'schedule_end'
     where c.auto_schedule
       and c.status = 'active'
       and c.ends_at is not null and c.ends_at <= pg_catalog.now()
     returning c.id, c.organization_id
  )
  select a.id, a.organization_id, 'activated'::text from activated a
  union all
  select e.id, e.organization_id, 'paused'::text from ended e
$$;

revoke all on function public.run_campaign_schedule()
  from public, anon, authenticated;
grant execute on function public.run_campaign_schedule() to service_role;

-- SQL direct (pas de Vault/pg_net nécessaire) ; suivi via
-- cron_last_success() comme les autres jobs.
select cron.schedule(
  'lastchance-campaign-schedule',
  '*/10 * * * *',
  $job$ select public.run_campaign_schedule() $job$
);

-- ── 4. Stock faible : alerte une fois, réarmée à la remontée ─
alter table public.prizes
  add column if not exists low_stock_threshold integer
    check (low_stock_threshold is null or low_stock_threshold >= 0),
  add column if not exists low_stock_notified_at timestamptz;

comment on column public.prizes.low_stock_threshold is
  'Seuil d''alerte stock faible (null : pas d''alerte). Alerte quand stock <= seuil, réarmée quand le stock repasse au-dessus.';
comment on column public.prizes.low_stock_notified_at is
  'Épisode d''alerte en cours (null : alerte armée). Posé au franchissement du seuil, effacé quand le stock remonte.';

create or replace function public.prizes_low_stock_watch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Sans seuil, ou stock illimité : rien à surveiller.
  if new.low_stock_threshold is null or new.stock is null then
    new.low_stock_notified_at := null;
    return new;
  end if;
  if new.stock <= new.low_stock_threshold then
    if new.low_stock_notified_at is null then
      new.low_stock_notified_at := pg_catalog.now();
      insert into public.jobs (type, payload, organization_id, idempotency_key)
      values ('automation.low-stock',
        pg_catalog.jsonb_build_object('prizeId', new.id,
                                      'organizationId', new.organization_id),
        new.organization_id,
        -- Une clé PAR épisode : l'horloge réelle (pas now(), figé par
        -- transaction) distingue deux épisodes d'une même transaction.
        'low-stock:' || new.id::text || ':'
          || extract(epoch from pg_catalog.clock_timestamp())::text)
      on conflict (idempotency_key) do nothing;
    end if;
  else
    -- Stock repassé au-dessus du seuil : réarme l'alerte.
    new.low_stock_notified_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.prizes_low_stock_watch()
  from public, anon, authenticated;

drop trigger if exists prizes_low_stock_watch on public.prizes;
create trigger prizes_low_stock_watch
  before update of stock, low_stock_threshold on public.prizes
  for each row execute function public.prizes_low_stock_watch();

-- ── 5. Réglages des scénarios d'automatisation ───────────────
create table public.automation_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scenario text not null
    check (scenario in ('won_not_redeemed', 'inactive', 'post_redemption', 'birthday')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id, scenario)
);

comment on table public.automation_settings is
  'Activation et réglages (jsonb) des scénarios d''emails automatiques, par organisation. Lecture équipe, écriture éditeurs.';

alter table public.automation_settings enable row level security;
revoke all on table public.automation_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.automation_settings to authenticated;
create policy automation_settings_member_read on public.automation_settings
  for select to authenticated
  using (public.is_org_member(organization_id));
-- Écriture : éditeurs (pattern des réglages/mutations du projet —
-- « campaign mutations are editor-only »), pas les caissiers.
create policy automation_settings_editor_write on public.automation_settings
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));
grant select, insert, update, delete on table public.automation_settings to service_role;

create or replace function public.automation_settings_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.automation_settings_touch()
  from public, anon, authenticated;

drop trigger if exists automation_settings_touch on public.automation_settings;
create trigger automation_settings_touch
  before update on public.automation_settings
  for each row execute function public.automation_settings_touch();

-- ── 6. Journal anti-doublon des scénarios ────────────────────
create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scenario text not null check (char_length(scenario) between 1 and 40),
  recipient text not null check (recipient ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  participation_id uuid references public.participations(id) on delete set null,
  dedup_key text not null unique,
  sent_at timestamptz not null default now()
);

comment on table public.email_log is
  'Journal des emails de scénario envoyés : dedup_key garantit qu''un même rappel ne part qu''une fois. Écrit par le worker (service role) ; purgé avec la rétention de l''organisation.';

create index email_log_org_sent_idx on public.email_log (organization_id, sent_at desc);
create index email_log_participation_idx on public.email_log (participation_id)
  where participation_id is not null;

alter table public.email_log enable row level security;
revoke all on table public.email_log from public, anon, authenticated;
-- Les destinataires sont des PII : lecture propriétaire uniquement,
-- comme la newsletter (« newsletter: owner select »).
grant select on table public.email_log to authenticated;
create policy email_log_owner_read on public.email_log
  for select to authenticated
  using (public.is_org_owner(organization_id));
grant select, insert, delete on table public.email_log to service_role;

-- ── 7. Anniversaire : consentement explicite ─────────────────
alter table public.newsletter_subscribers
  add column if not exists birth_date date;

comment on column public.newsletter_subscribers.birth_date is
  'Date d''anniversaire — présente UNIQUEMENT si le consentement « anniversaire » explicite a été recueilli via la case dédiée côté UI. Effacée avec la ligne : suppression par le propriétaire, ou purge RGPD (purge_expired_personal_data supprime l''abonné désinscrit une fois la rétention de l''organisation écoulée).';

-- ── 8. RPC de ciblage (service role uniquement) ──────────────
-- Chaque RPC exclut les désinscrits et les envois déjà journalisés
-- (email_log.dedup_key) ; le worker écrit la ligne email_log APRÈS
-- l'envoi, avec la même clé que celle attendue ici.

-- Rappel « gagné mais pas retiré » : transactionnel (le gain du joueur
-- lui-même) — marketing_opt_in non exigé, désinscrits tout de même
-- exclus par prudence. dedup_key attendue : 'wnr:{participation_id}'.
create or replace function public.automation_won_not_redeemed_targets(
  p_organization_id uuid,
  p_min_age_hours integer,
  p_limit integer default 100
)
returns table (
  participation_id uuid,
  email text,
  first_name text,
  redeem_code text,
  redeem_expires_at timestamptz,
  prize_label text,
  campaign_id uuid,
  campaign_name text,
  organization_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  return query
  select p.id, p.email, p.first_name, p.redeem_code, p.redeem_expires_at,
         pr.label, c.id, c.name, p.organization_id
    from public.participations p
    join public.campaigns c on c.id = p.campaign_id
    left join public.prizes pr on pr.id = p.prize_id
   where p.organization_id = p_organization_id
     and p.email is not null
     and p.redeem_code is not null
     and p.redeemed_at is null
     and p.cancelled_at is null
     and p.redeem_expires_at is not null
     and p.redeem_expires_at > now()
     and p.created_at <= now()
       - make_interval(hours => least(greatest(coalesce(p_min_age_hours, 24), 1), 720))
     and not exists (select 1 from public.email_log el
                      where el.dedup_key = 'wnr:' || p.id::text)
     and not exists (select 1 from public.newsletter_subscribers ns
                      where ns.organization_id = p_organization_id
                        and ns.email = p.email
                        and ns.unsubscribed_at is not null)
   order by p.redeem_expires_at asc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke all on function public.automation_won_not_redeemed_targets(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.automation_won_not_redeemed_targets(uuid, integer, integer)
  to service_role;

-- Réengagement des abonnés inactifs : dernière activité = dernière
-- participation portant leur email, sinon date d'inscription à la
-- newsletter. dedup_key attendue : 'inactive:{p_days}:{email}'.
create or replace function public.automation_inactive_targets(
  p_organization_id uuid,
  p_days integer,
  p_limit integer default 100
)
returns table (email text, first_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  v_days := least(greatest(coalesce(p_days, 60), 1), 3650);
  return query
  select s.email, last_win.first_name
    from public.newsletter_subscribers s
    left join lateral (
      select p.first_name
        from public.participations p
       where p.organization_id = s.organization_id
         and p.email = s.email
       order by p.created_at desc
       limit 1
    ) last_win on true
    left join lateral (
      select max(p.created_at) as last_at
        from public.participations p
       where p.organization_id = s.organization_id
         and p.email = s.email
    ) activity on true
   where s.organization_id = p_organization_id
     and s.unsubscribed_at is null
     and coalesce(activity.last_at, s.created_at)
         < now() - make_interval(days => v_days)
     and not exists (select 1 from public.email_log el
                      where el.dedup_key = 'inactive:' || v_days::text || ':' || s.email)
   order by coalesce(activity.last_at, s.created_at) asc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke all on function public.automation_inactive_targets(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.automation_inactive_targets(uuid, integer, integer)
  to service_role;

-- Suite de retrait (avis, remerciement) : marketing — opt-in exigé.
-- Fenêtre bornée [delay, delay+48h] : un retrait ancien ne déclenche
-- jamais d'email tardif. dedup_key attendue : 'postredeem:{participation_id}'.
create or replace function public.automation_post_redemption_targets(
  p_organization_id uuid,
  p_delay_hours integer,
  p_limit integer default 100
)
returns table (
  participation_id uuid,
  email text,
  first_name text,
  prize_label text,
  campaign_id uuid,
  campaign_name text,
  redeemed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_delay integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  v_delay := least(greatest(coalesce(p_delay_hours, 24), 1), 720);
  return query
  select p.id, p.email, p.first_name, pr.label, c.id, c.name, p.redeemed_at
    from public.participations p
    join public.campaigns c on c.id = p.campaign_id
    left join public.prizes pr on pr.id = p.prize_id
   where p.organization_id = p_organization_id
     and p.email is not null
     and p.marketing_opt_in = true
     and p.redeemed_at is not null
     and p.redeemed_at <= now() - make_interval(hours => v_delay)
     and p.redeemed_at > now() - make_interval(hours => v_delay + 48)
     and not exists (select 1 from public.email_log el
                      where el.dedup_key = 'postredeem:' || p.id::text)
     and not exists (select 1 from public.newsletter_subscribers ns
                      where ns.organization_id = p_organization_id
                        and ns.email = p.email
                        and ns.unsubscribed_at is not null)
   order by p.redeemed_at asc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke all on function public.automation_post_redemption_targets(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.automation_post_redemption_targets(uuid, integer, integer)
  to service_role;

-- Anniversaires du jour (fuseau de l'organisation, comme les fenêtres
-- de jeu). Les 29/02 sont fêtés le 28/02 les années non bissextiles.
-- dedup_key attendue : 'birthday:{email}:{année courante}'.
create or replace function public.automation_birthday_targets(
  p_organization_id uuid,
  p_limit integer default 100
)
returns table (email text, first_name text, birth_date date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_feb28_nonleap boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  select (pg_catalog.now() at time zone o.timezone)::date into v_today
    from public.organizations o where o.id = p_organization_id;
  if v_today is null then
    return; -- organisation inconnue : zéro ligne
  end if;
  v_feb28_nonleap := extract(month from v_today) = 2
    and extract(day from v_today) = 28
    and extract(day from (pg_catalog.date_trunc('year', v_today::timestamp)
        + interval '2 months' - interval '1 day')) = 28;
  return query
  select s.email, last_win.first_name, s.birth_date
    from public.newsletter_subscribers s
    left join lateral (
      select p.first_name
        from public.participations p
       where p.organization_id = s.organization_id
         and p.email = s.email
       order by p.created_at desc
       limit 1
    ) last_win on true
   where s.organization_id = p_organization_id
     and s.unsubscribed_at is null
     and s.birth_date is not null
     and (
       (extract(month from s.birth_date) = extract(month from v_today)
        and extract(day from s.birth_date) = extract(day from v_today))
       or (v_feb28_nonleap
           and extract(month from s.birth_date) = 2
           and extract(day from s.birth_date) = 29)
     )
     and not exists (select 1 from public.email_log el
                      where el.dedup_key = 'birthday:' || s.email || ':'
                        || extract(year from v_today)::integer::text)
   order by s.email asc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke all on function public.automation_birthday_targets(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.automation_birthday_targets(uuid, integer)
  to service_role;

-- ── 9. Purge RGPD : email_log suit la rétention de l'org ─────
-- Corps repris à l'identique de 00019 ; ajout : email_log (les
-- destinataires sont des PII). NB : la re-purge d'une clé de dedup
-- « inactive » réautorise au pire une relance après la rétention.
-- newsletter_subscribers (birth_date comprise) reste couvert : la
-- ligne d'un désinscrit est supprimée après la rétention, et le
-- propriétaire peut la supprimer directement à tout moment.
create or replace function public.purge_expired_personal_data()
returns table(organizations_processed bigint, participations_deleted bigint, subscribers_deleted bigint)
language plpgsql security definer set search_path = '' as $$
declare r record; p_count bigint := 0; s_count bigint := 0; n bigint := 0; c bigint;
begin
  for r in select id, data_retention_months from public.organizations
           where data_retention_months is not null loop
    n := n + 1;
    delete from public.participations
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months);
    get diagnostics c = row_count; p_count := p_count + c;
    delete from public.newsletter_subscribers
      where organization_id = r.id and unsubscribed_at is not null
        and unsubscribed_at < now() - make_interval(months => r.data_retention_months);
    get diagnostics c = row_count; s_count := s_count + c;
    delete from public.email_log
      where organization_id = r.id
        and sent_at < now() - make_interval(months => r.data_retention_months);
  end loop;
  delete from public.webhook_deliveries
    where (delivered_at is not null or attempts >= 12)
      and created_at < pg_catalog.now() - interval '30 days';
  delete from public.admin_sessions
    where expires_at < pg_catalog.now() - interval '30 days';
  -- L'événement d'audit reste probant, mais l'email et l'IP cessent
  -- d'identifier une personne après 24 mois.
  perform pg_catalog.set_config('lastchance.audit_maintenance', 'on', true);
  update public.admin_audit_logs set actor_email = '[anonymisé]', ip = null,
    metadata = metadata - 'email' - 'target_email'
    where created_at < pg_catalog.now() - interval '24 months'
      and (actor_email <> '[anonymisé]' or ip is not null);
  perform pg_catalog.set_config('lastchance.audit_maintenance', 'off', true);
  delete from public.admin_notes where created_at < pg_catalog.now() - interval '24 months';
  return query select n, p_count, s_count;
end
$$;

revoke all on function public.purge_expired_personal_data() from public, anon, authenticated;
grant execute on function public.purge_expired_personal_data() to service_role;
