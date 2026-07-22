-- ============================================================
-- Automatisations commerçant + ligues privées Pronostics —
-- comportement réel sur base migrée vierge (fixtures locales) :
--   1. Budget : imputation au claim, pause à l'atteinte, job déposé
--      une seule fois par plafond, réarmement si le plafond remonte.
--   2. run_campaign_schedule : activation dans la fenêtre, pause à
--      l'échéance, la pause budget n'est jamais réactivée.
--   3. Stock faible : alerte UNE fois par épisode, réarmée quand le
--      stock remonte.
--   4. RPC de ciblage : filtres métier + anti-doublon email_log +
--      exclusion des désinscrits.
--   5. Ligues : création (code, auto-inscription), adhésion par code
--      insensible à la casse (idempotente), plafonds, classement
--      filtré en direct et après clôture.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ══ 1. Budget de campagne ════════════════════════════════════
insert into public.organizations (id, name, slug)
values ('aa000000-0000-4000-8000-000000000001', 'Test Automations', 'tap-automations');

insert into public.campaigns (id, organization_id, name, status, budget_cents)
values ('aa000000-0000-4000-8000-000000000002',
        'aa000000-0000-4000-8000-000000000001', 'Campagne budget', 'active', 200);

insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('aa000000-0000-4000-8000-000000000003',
        'aa000000-0000-4000-8000-000000000001',
        'aa000000-0000-4000-8000-000000000002', 'Roue budget', 'unlimited');

insert into public.prizes (id, organization_id, wheel_id, label, cost_cents)
values ('aa000000-0000-4000-8000-000000000004',
        'aa000000-0000-4000-8000-000000000001',
        'aa000000-0000-4000-8000-000000000003', 'Menu offert', 150);

insert into public.spins (id, organization_id, campaign_id, wheel_id, prize_id, is_losing, player_key)
values
  ('aa000000-0000-4000-8000-000000000011', 'aa000000-0000-4000-8000-000000000001',
   'aa000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000003',
   'aa000000-0000-4000-8000-000000000004', false, repeat('1', 64)),
  ('aa000000-0000-4000-8000-000000000012', 'aa000000-0000-4000-8000-000000000001',
   'aa000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000003',
   'aa000000-0000-4000-8000-000000000004', false, repeat('2', 64)),
  ('aa000000-0000-4000-8000-000000000013', 'aa000000-0000-4000-8000-000000000001',
   'aa000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000003',
   'aa000000-0000-4000-8000-000000000004', false, repeat('3', 64)),
  ('aa000000-0000-4000-8000-000000000014', 'aa000000-0000-4000-8000-000000000001',
   'aa000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000003',
   'aa000000-0000-4000-8000-000000000004', false, repeat('4', 64));

select lives_ok(
  $$select * from public.claim_winning_spin('aa000000-0000-4000-8000-000000000011',
    'Alice', 'a1@tap.local', null, true, false)$$,
  'premier gain réclamé (150 imputés sur 200)'
);
select results_eq(
  $$select status, budget_spent_cents, paused_reason
      from public.campaigns where id = 'aa000000-0000-4000-8000-000000000002'$$,
  $$values ('active', 150, null::text)$$,
  'sous le plafond : la campagne reste active'
);
select is(
  (select count(*) from public.jobs where type = 'automation.budget-paused'),
  0::bigint, 'aucune notification tant que le plafond n''est pas atteint'
);

select lives_ok(
  $$select * from public.claim_winning_spin('aa000000-0000-4000-8000-000000000012',
    'Boris', 'a2@tap.local', null, true, false)$$,
  'second gain réclamé (300 imputés : plafond 200 franchi)'
);
select results_eq(
  $$select status, budget_spent_cents, paused_reason
      from public.campaigns where id = 'aa000000-0000-4000-8000-000000000002'$$,
  $$values ('paused', 300, 'budget_reached')$$,
  'plafond atteint : pause automatique motivée dans LA transaction du gain'
);
select results_eq(
  $$select payload->>'campaignId', payload->>'organizationId'
      from public.jobs
     where idempotency_key = 'budget-paused:aa000000-0000-4000-8000-000000000002:200'$$,
  $$values ('aa000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000001')$$,
  'un job automation.budget-paused est déposé avec la clé du plafond'
);
select is(
  (select count(*) from public.audit_logs where action = 'campaign.budget.pause'),
  1::bigint, 'la pause budget est auditée'
);

-- Réactivation manuelle : le motif s'efface (trigger), et un nouveau
-- franchissement du MÊME plafond ne redépose pas de notification.
update public.campaigns set status = 'active'
 where id = 'aa000000-0000-4000-8000-000000000002';
select is(
  (select paused_reason from public.campaigns
    where id = 'aa000000-0000-4000-8000-000000000002'),
  null::text, 'repasser active efface paused_reason'
);
select lives_ok(
  $$select * from public.claim_winning_spin('aa000000-0000-4000-8000-000000000013',
    'Carla', 'a3@tap.local', null, true, false)$$,
  'troisième gain réclamé (450, plafond 200 toujours franchi)'
);
select is(
  (select count(*) from public.jobs where type = 'automation.budget-paused'),
  1::bigint, 'même plafond : la notification n''est pas dupliquée'
);

-- Plafond relevé : nouvel épisode, nouvelle clé, nouvelle notification.
update public.campaigns set status = 'active', budget_cents = 500
 where id = 'aa000000-0000-4000-8000-000000000002';
select lives_ok(
  $$select * from public.claim_winning_spin('aa000000-0000-4000-8000-000000000014',
    'Dina', 'a4@tap.local', null, true, false)$$,
  'quatrième gain réclamé (600 : plafond relevé à 500 franchi)'
);
select results_eq(
  $$select status, paused_reason from public.campaigns
     where id = 'aa000000-0000-4000-8000-000000000002'$$,
  $$values ('paused', 'budget_reached')$$,
  'le plafond relevé pause de nouveau la campagne'
);
select is(
  (select count(*) from public.jobs where type = 'automation.budget-paused'),
  2::bigint, 'plafond différent : une nouvelle notification part'
);

-- ══ 2. Programmation automatique ═════════════════════════════
insert into public.campaigns
  (id, organization_id, name, status, auto_schedule, starts_at, ends_at, paused_reason)
values
  -- Dans la fenêtre, en brouillon : à activer.
  ('ab000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001',
   'Programmée à venir', 'draft', true, now() - interval '1 hour', now() + interval '1 hour', null),
  -- Échue et encore active : à mettre en pause.
  ('ab000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000001',
   'Programmée échue', 'active', true, now() - interval '2 hours', now() - interval '5 minutes', null),
  -- Pause budget : la programmation ne la réactive JAMAIS.
  ('ab000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000001',
   'Pause budget', 'paused', true, now() - interval '1 hour', now() + interval '1 hour', 'budget_reached'),
  -- Sans auto_schedule : jamais touchée.
  ('ab000000-0000-4000-8000-000000000004', 'aa000000-0000-4000-8000-000000000001',
   'Manuelle', 'draft', false, now() - interval '1 hour', now() + interval '1 hour', null);

select results_eq(
  $$select campaign_id, action from public.run_campaign_schedule() order by action$$,
  $$values ('ab000000-0000-4000-8000-000000000001'::uuid, 'activated'),
           ('ab000000-0000-4000-8000-000000000002'::uuid, 'paused')$$,
  'le planificateur active la campagne dans sa fenêtre et pause l''échue — rien d''autre'
);
select results_eq(
  $$select status, paused_reason from public.campaigns
     where id = 'ab000000-0000-4000-8000-000000000001'$$,
  $$values ('active', null::text)$$,
  'campagne programmée activée, sans motif de pause'
);
select results_eq(
  $$select status, paused_reason from public.campaigns
     where id = 'ab000000-0000-4000-8000-000000000002'$$,
  $$values ('paused', 'schedule_end')$$,
  'campagne échue pausée avec le motif schedule_end'
);
select results_eq(
  $$select status, paused_reason from public.campaigns
     where id = 'ab000000-0000-4000-8000-000000000003'$$,
  $$values ('paused', 'budget_reached')$$,
  'une pause budget n''est jamais réactivée par le calendrier'
);
select is(
  (select status from public.campaigns
    where id = 'ab000000-0000-4000-8000-000000000004'),
  'draft', 'sans auto_schedule, le planificateur ne touche à rien'
);
select is(
  (select count(*) from public.run_campaign_schedule()),
  0::bigint, 'un second passage immédiat est un no-op (idempotent)'
);
select ok(
  exists (select 1 from cron.job where jobname = 'lastchance-campaign-schedule'),
  'le planificateur est inscrit dans pg_cron (suivi cron_last_success)'
);

-- ══ 3. Stock faible ══════════════════════════════════════════
insert into public.prizes (id, organization_id, wheel_id, label, stock, low_stock_threshold)
values ('aa000000-0000-4000-8000-000000000005',
        'aa000000-0000-4000-8000-000000000001',
        'aa000000-0000-4000-8000-000000000003', 'Café stock', 5, 2);

update public.prizes set stock = 3 where id = 'aa000000-0000-4000-8000-000000000005';
select is(
  (select count(*) from public.jobs where type = 'automation.low-stock'),
  0::bigint, 'au-dessus du seuil : pas d''alerte'
);

update public.prizes set stock = 2 where id = 'aa000000-0000-4000-8000-000000000005';
select ok(
  (select low_stock_notified_at is not null from public.prizes
    where id = 'aa000000-0000-4000-8000-000000000005'),
  'seuil franchi : épisode d''alerte ouvert'
);
select results_eq(
  $$select payload->>'prizeId', payload->>'organizationId'
      from public.jobs where type = 'automation.low-stock'$$,
  $$values ('aa000000-0000-4000-8000-000000000005', 'aa000000-0000-4000-8000-000000000001')$$,
  'un job automation.low-stock est déposé avec le lot et l''organisation'
);

update public.prizes set stock = 1 where id = 'aa000000-0000-4000-8000-000000000005';
select is(
  (select count(*) from public.jobs where type = 'automation.low-stock'),
  1::bigint, 'sous le seuil, l''alerte ne part qu''UNE fois par épisode'
);

update public.prizes set stock = 10 where id = 'aa000000-0000-4000-8000-000000000005';
select ok(
  (select low_stock_notified_at is null from public.prizes
    where id = 'aa000000-0000-4000-8000-000000000005'),
  'stock remonté : l''alerte se réarme'
);

update public.prizes set stock = 2 where id = 'aa000000-0000-4000-8000-000000000005';
select is(
  (select count(*) from public.jobs where type = 'automation.low-stock'),
  2::bigint, 'nouvel épisode : une nouvelle alerte part'
);

-- ══ 4. RPC de ciblage ════════════════════════════════════════
insert into public.organizations (id, name, slug, timezone)
values ('ad000000-0000-4000-8000-000000000001', 'Test Ciblage', 'tap-ciblage', 'UTC');

insert into public.campaigns (id, organization_id, name, status)
values ('ad000000-0000-4000-8000-000000000002',
        'ad000000-0000-4000-8000-000000000001', 'Campagne ciblage', 'active');

insert into public.wheels (id, organization_id, campaign_id, name)
values ('ad000000-0000-4000-8000-000000000003',
        'ad000000-0000-4000-8000-000000000001',
        'ad000000-0000-4000-8000-000000000002', 'Roue ciblage');

insert into public.prizes (id, organization_id, wheel_id, label)
values ('ad000000-0000-4000-8000-000000000004',
        'ad000000-0000-4000-8000-000000000001',
        'ad000000-0000-4000-8000-000000000003', 'Dessert offert');

-- « Gagné mais pas retiré » : W1 cible, W2 déjà retiré, W3 trop
-- frais, W4 désinscrit de la newsletter.
insert into public.participations
  (id, organization_id, campaign_id, wheel_id, prize_id, first_name, email,
   accepted_terms, marketing_opt_in, redeem_code, redeem_expires_at, redeemed_at, created_at, player_key)
values
  ('ad000000-0000-4000-8000-000000000011', 'ad000000-0000-4000-8000-000000000001',
   'ad000000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000003',
   'ad000000-0000-4000-8000-000000000004', 'Wafa', 'w1@tap.local',
   true, false, 'GAIN-TAPWNR01', now() + interval '2 hours', null, now() - interval '30 hours', repeat('a', 64)),
  ('ad000000-0000-4000-8000-000000000012', 'ad000000-0000-4000-8000-000000000001',
   'ad000000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000003',
   'ad000000-0000-4000-8000-000000000004', 'Willy', 'w2@tap.local',
   true, false, 'GAIN-TAPWNR02', now() + interval '2 hours', now() - interval '1 hour', now() - interval '30 hours', repeat('b', 64)),
  ('ad000000-0000-4000-8000-000000000013', 'ad000000-0000-4000-8000-000000000001',
   'ad000000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000003',
   'ad000000-0000-4000-8000-000000000004', 'Wanda', 'w3@tap.local',
   true, false, 'GAIN-TAPWNR03', now() + interval '2 hours', null, now() - interval '1 hour', repeat('c', 64)),
  ('ad000000-0000-4000-8000-000000000014', 'ad000000-0000-4000-8000-000000000001',
   'ad000000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000003',
   'ad000000-0000-4000-8000-000000000004', 'Waldo', 'w4@tap.local',
   true, false, 'GAIN-TAPWNR04', now() + interval '2 hours', null, now() - interval '30 hours', repeat('d', 64));

insert into public.newsletter_subscribers (organization_id, email, unsubscribed_at)
values ('ad000000-0000-4000-8000-000000000001', 'w4@tap.local', now() - interval '1 day');

select results_eq(
  $$select participation_id, email, first_name, redeem_code, prize_label
      from public.automation_won_not_redeemed_targets(
        'ad000000-0000-4000-8000-000000000001', 24, 100)$$,
  $$values ('ad000000-0000-4000-8000-000000000011'::uuid, 'w1@tap.local', 'Wafa',
            'GAIN-TAPWNR01', 'Dessert offert')$$,
  'wnr : seul le gain non retiré, non expiré, assez ancien et non désinscrit'
);
insert into public.email_log (organization_id, scenario, recipient, participation_id, dedup_key)
values ('ad000000-0000-4000-8000-000000000001', 'won_not_redeemed', 'w1@tap.local',
        'ad000000-0000-4000-8000-000000000011', 'wnr:ad000000-0000-4000-8000-000000000011');
select is(
  (select count(*) from public.automation_won_not_redeemed_targets(
     'ad000000-0000-4000-8000-000000000001', 24, 100)),
  0::bigint, 'wnr : jamais deux fois le même rappel (email_log)'
);

-- Inactifs : i1 cible (inscrit il y a 90 j, aucune activité), i2 a
-- gagné il y a 5 jours, i3 désinscrit.
insert into public.newsletter_subscribers (organization_id, email, created_at)
values
  ('ad000000-0000-4000-8000-000000000001', 'i1@tap.local', now() - interval '90 days'),
  ('ad000000-0000-4000-8000-000000000001', 'i2@tap.local', now() - interval '90 days');
insert into public.newsletter_subscribers (organization_id, email, created_at, unsubscribed_at)
values ('ad000000-0000-4000-8000-000000000001', 'i3@tap.local', now() - interval '90 days', now());
insert into public.participations
  (id, organization_id, campaign_id, wheel_id, prize_id, first_name, email,
   accepted_terms, created_at, player_key)
values ('ad000000-0000-4000-8000-000000000015', 'ad000000-0000-4000-8000-000000000001',
        'ad000000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000003',
        'ad000000-0000-4000-8000-000000000004', 'Inès', 'i2@tap.local',
        true, now() - interval '5 days', repeat('e', 64));

select results_eq(
  $$select email, first_name from public.automation_inactive_targets(
      'ad000000-0000-4000-8000-000000000001', 60, 100)$$,
  $$values ('i1@tap.local', null::text)$$,
  'inactifs : dernière activité (participation sinon inscription) > 60 j, désinscrits exclus'
);
insert into public.email_log (organization_id, scenario, recipient, dedup_key)
values ('ad000000-0000-4000-8000-000000000001', 'inactive', 'i1@tap.local', 'inactive:60:i1@tap.local');
select is(
  (select count(*) from public.automation_inactive_targets(
     'ad000000-0000-4000-8000-000000000001', 60, 100)),
  0::bigint, 'inactifs : la clé de dedup bloque la relance'
);

-- Après retrait : P1 cible (retiré il y a 25 h, opt-in), P2 trop
-- ancien (hors fenêtre delay+48 h), P3 sans opt-in marketing.
insert into public.participations
  (id, organization_id, campaign_id, wheel_id, prize_id, first_name, email,
   accepted_terms, marketing_opt_in, redeemed_at, player_key)
values
  ('ad000000-0000-4000-8000-000000000021', 'ad000000-0000-4000-8000-000000000001',
   'ad000000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000003',
   'ad000000-0000-4000-8000-000000000004', 'Pia', 'p1@tap.local',
   true, true, now() - interval '25 hours', repeat('f', 64)),
  ('ad000000-0000-4000-8000-000000000022', 'ad000000-0000-4000-8000-000000000001',
   'ad000000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000003',
   'ad000000-0000-4000-8000-000000000004', 'Paco', 'p2@tap.local',
   true, true, now() - interval '100 hours', repeat('0', 64)),
  ('ad000000-0000-4000-8000-000000000023', 'ad000000-0000-4000-8000-000000000001',
   'ad000000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000003',
   'ad000000-0000-4000-8000-000000000004', 'Pola', 'p3@tap.local',
   true, false, now() - interval '25 hours', repeat('9', 64));

select results_eq(
  $$select participation_id, email, first_name
      from public.automation_post_redemption_targets(
        'ad000000-0000-4000-8000-000000000001', 24, 100)$$,
  $$values ('ad000000-0000-4000-8000-000000000021'::uuid, 'p1@tap.local', 'Pia')$$,
  'post-retrait : fenêtre [delay, delay+48h], opt-in marketing exigé'
);
insert into public.email_log (organization_id, scenario, recipient, participation_id, dedup_key)
values ('ad000000-0000-4000-8000-000000000001', 'post_redemption', 'p1@tap.local',
        'ad000000-0000-4000-8000-000000000021', 'postredeem:ad000000-0000-4000-8000-000000000021');
select is(
  (select count(*) from public.automation_post_redemption_targets(
     'ad000000-0000-4000-8000-000000000001', 24, 100)),
  0::bigint, 'post-retrait : un seul email par participation'
);

-- Anniversaires : b1 fête aujourd'hui, b2 un autre jour, b3 fête
-- aujourd'hui mais désinscrit.
insert into public.newsletter_subscribers (organization_id, email, birth_date)
values
  ('ad000000-0000-4000-8000-000000000001', 'b1@tap.local', (now()::date - interval '25 years')::date),
  ('ad000000-0000-4000-8000-000000000001', 'b2@tap.local', (now()::date - interval '10 years' + interval '40 days')::date);
insert into public.newsletter_subscribers (organization_id, email, birth_date, unsubscribed_at)
values ('ad000000-0000-4000-8000-000000000001', 'b3@tap.local', (now()::date - interval '30 years')::date, now());

select results_eq(
  $$select email from public.automation_birthday_targets(
      'ad000000-0000-4000-8000-000000000001', 100)$$,
  $$values ('b1@tap.local')$$,
  'anniversaires : mois/jour du fuseau de l''org, désinscrits exclus'
);
insert into public.email_log (organization_id, scenario, recipient, dedup_key)
values ('ad000000-0000-4000-8000-000000000001', 'birthday', 'b1@tap.local',
        'birthday:b1@tap.local:' || extract(year from now())::integer);
select is(
  (select count(*) from public.automation_birthday_targets(
     'ad000000-0000-4000-8000-000000000001', 100)),
  0::bigint, 'anniversaires : un seul email par an (clé année courante)'
);

-- ══ 5. Ligues privées ════════════════════════════════════════
insert into public.organizations (id, name, slug)
values ('ba000000-0000-4000-8000-000000000001', 'Test Ligues', 'tap-ligues');

insert into public.contests (id, organization_id, slug, name, competition_key, status)
values
  ('ba000000-0000-4000-8000-000000000002', 'ba000000-0000-4000-8000-000000000001',
   'tap-ligues', 'Championnat ligues', 'custom', 'active'),
  ('ba000000-0000-4000-8000-000000000003', 'ba000000-0000-4000-8000-000000000001',
   'tap-ligues-2', 'Autre championnat', 'custom', 'active');

insert into public.contest_matches
  (id, contest_id, organization_id, home_name, away_name, kickoff_at, status, home_score, away_score)
values
  ('ba000000-0000-4000-8000-000000000011', 'ba000000-0000-4000-8000-000000000002',
   'ba000000-0000-4000-8000-000000000001', 'A', 'B', now() - interval '2 days', 'finished', 2, 1),
  ('ba000000-0000-4000-8000-000000000012', 'ba000000-0000-4000-8000-000000000002',
   'ba000000-0000-4000-8000-000000000001', 'C', 'D', now() - interval '1 day', 'finished', 0, 0);

insert into public.contest_players
  (id, contest_id, organization_id, token_hash, first_name, accepted_terms, created_at)
values
  ('ba000000-0000-4000-8000-000000000021', 'ba000000-0000-4000-8000-000000000002',
   'ba000000-0000-4000-8000-000000000001', repeat('a', 64), 'Alice', true, now() - interval '5 hours'),
  ('ba000000-0000-4000-8000-000000000022', 'ba000000-0000-4000-8000-000000000002',
   'ba000000-0000-4000-8000-000000000001', repeat('b', 64), 'Bruno', true, now() - interval '4 hours'),
  ('ba000000-0000-4000-8000-000000000023', 'ba000000-0000-4000-8000-000000000002',
   'ba000000-0000-4000-8000-000000000001', repeat('c', 64), 'Chloé', true, now() - interval '3 hours'),
  ('ba000000-0000-4000-8000-000000000024', 'ba000000-0000-4000-8000-000000000002',
   'ba000000-0000-4000-8000-000000000001', repeat('d', 64), 'David', true, now() - interval '2 hours'),
  -- Joueur d'un AUTRE championnat : jamais admis dans les ligues du premier.
  ('ba000000-0000-4000-8000-000000000031', 'ba000000-0000-4000-8000-000000000003',
   'ba000000-0000-4000-8000-000000000001', repeat('e', 64), 'Zoé', true, now() - interval '1 hour');

-- Alice 5 pts (3+2) · Bruno 3 (1 exact) · Chloé 3 (1 exact) · David 0.
insert into public.contest_predictions
  (contest_id, organization_id, match_id, player_id, home_score, away_score, points)
values
  ('ba000000-0000-4000-8000-000000000002', 'ba000000-0000-4000-8000-000000000001',
   'ba000000-0000-4000-8000-000000000011', 'ba000000-0000-4000-8000-000000000021', 2, 1, 3),
  ('ba000000-0000-4000-8000-000000000002', 'ba000000-0000-4000-8000-000000000001',
   'ba000000-0000-4000-8000-000000000012', 'ba000000-0000-4000-8000-000000000021', 1, 1, 2),
  ('ba000000-0000-4000-8000-000000000002', 'ba000000-0000-4000-8000-000000000001',
   'ba000000-0000-4000-8000-000000000011', 'ba000000-0000-4000-8000-000000000022', 2, 1, 3),
  ('ba000000-0000-4000-8000-000000000002', 'ba000000-0000-4000-8000-000000000001',
   'ba000000-0000-4000-8000-000000000012', 'ba000000-0000-4000-8000-000000000023', 0, 0, 3);

-- ── Verrou anti-régression : bug prod « column reference league_id
-- is ambiguous » (42702) — révélé par ce test en CI. create et join
-- exécutent tous deux INSERT ... ON CONFLICT (league_id, player_id) où
-- league_id est aussi une colonne OUT : sans #variable_conflict
-- use_column, l'appel LÈVE une erreur (créer/rejoindre cassé en prod).
-- On prouve que les deux RPC s'exécutent — join sur un NOUVEAU membre
-- (chemin qui atteint l'INSERT, pas le retour idempotent) — puis on
-- efface la ligue sonde : le décompte des plafonds plus bas repart d'un
-- championnat sans ligue.
select lives_ok(
  $$select * from public.create_contest_league('ba000000-0000-4000-8000-000000000002',
    'ba000000-0000-4000-8000-000000000023', 'Sonde régression')$$,
  'create_contest_league s''exécute (ambiguïté league_id levée)'
);
select lives_ok(
  $$select * from public.join_contest_league('ba000000-0000-4000-8000-000000000002',
    'ba000000-0000-4000-8000-000000000024',
    (select code from public.contest_leagues
      where contest_id = 'ba000000-0000-4000-8000-000000000002'
        and name = 'Sonde régression'))$$,
  'join_contest_league (nouveau membre) s''exécute (ambiguïté league_id levée)'
);
delete from public.contest_leagues
 where contest_id = 'ba000000-0000-4000-8000-000000000002'
   and name = 'Sonde régression';

-- Création : code au bon format, créateur auto-inscrit.
create temp table tap_league on commit drop as
select * from public.create_contest_league(
  'ba000000-0000-4000-8000-000000000002',
  'ba000000-0000-4000-8000-000000000021', 'Les collègues');

select is((select count(*) from tap_league), 1::bigint, 'la création rend la ligue');
select ok(
  (select code ~ '^[A-HJ-NP-Z2-9]{6}$' from tap_league),
  'le code d''invitation évite les caractères ambigus (I/O/0/1)'
);
select is(
  (select count(*) from public.contest_league_members
    where league_id = (select league_id from tap_league)),
  1::bigint, 'le créateur est auto-inscrit'
);
select throws_ok(
  $$select * from public.create_contest_league('ba000000-0000-4000-8000-000000000002',
    'ba000000-0000-4000-8000-000000000031', 'Intrus')$$,
  'P0001', 'player not in contest',
  'créer exige d''être joueur DU championnat'
);
select throws_ok(
  format($f$select * from public.create_contest_league('ba000000-0000-4000-8000-000000000002',
    'ba000000-0000-4000-8000-000000000021', '%s')$f$, repeat('x', 41)),
  'P0001', 'invalid name', 'le nom de ligue est borné à 40 caractères'
);

-- Adhésion : code insensible à la casse, idempotente, code inconnu refusé.
select results_eq(
  $$select league_id from public.join_contest_league('ba000000-0000-4000-8000-000000000002',
      'ba000000-0000-4000-8000-000000000022', lower((select code from tap_league)))$$,
  $$select league_id from tap_league$$,
  'rejoindre avec le code en minuscules fonctionne'
);
select results_eq(
  $$select league_id from public.join_contest_league('ba000000-0000-4000-8000-000000000002',
      'ba000000-0000-4000-8000-000000000022', (select code from tap_league))$$,
  $$select league_id from tap_league$$,
  'rejoindre deux fois est un succès idempotent'
);
select is(
  (select count(*) from public.contest_league_members
    where league_id = (select league_id from tap_league)
      and player_id = 'ba000000-0000-4000-8000-000000000022'),
  1::bigint, 'pas de doublon d''appartenance'
);
select throws_ok(
  $$select * from public.join_contest_league('ba000000-0000-4000-8000-000000000002',
    'ba000000-0000-4000-8000-000000000023', 'ZZZZZZ')$$,
  'P0001', 'invalid code', 'un code inconnu est refusé'
);
select throws_ok(
  format($f$select * from public.join_contest_league('ba000000-0000-4000-8000-000000000002',
    'ba000000-0000-4000-8000-000000000031', '%s')$f$, (select code from tap_league)),
  'P0001', 'player not in contest',
  'un joueur d''un autre championnat ne rejoint pas la ligue'
);
select is(
  (select league_id from public.join_contest_league('ba000000-0000-4000-8000-000000000002',
      'ba000000-0000-4000-8000-000000000024', (select code from tap_league))),
  (select league_id from tap_league), 'David rejoint la ligue'
);

-- Classement filtré en direct : membres seulement, rangs re-numérotés.
select results_eq(
  $$select first_name, rank, total_players
      from public.contest_leaderboard('ba000000-0000-4000-8000-000000000002', 50, 0,
        (select league_id from tap_league))$$,
  $$values ('Alice', 1::bigint, 3::bigint), ('Bruno', 2::bigint, 3::bigint),
           ('David', 3::bigint, 3::bigint)$$,
  'classement de ligue : membres seulement (Chloé absente), rangs 1..n'
);
select is(
  (select count(*) from public.contest_leaderboard('ba000000-0000-4000-8000-000000000002')),
  4::bigint, 'sans ligue, le classement global reste complet'
);
select is(
  (select count(*) from public.contest_leaderboard('ba000000-0000-4000-8000-000000000002', 50, 0,
     'ba000000-0000-4000-8000-0000000000ff')),
  0::bigint, 'ligue inconnue : zéro ligne, pas d''oracle'
);
select results_eq(
  $$select rank, total_players
      from public.contest_player_rank('ba000000-0000-4000-8000-000000000002',
        'ba000000-0000-4000-8000-000000000024', (select league_id from tap_league))$$,
  $$values (3::bigint, 3::bigint)$$,
  'la position joueur se filtre aussi par ligue'
);

-- Départ : effectif et idempotence.
select is(
  public.leave_contest_league('ba000000-0000-4000-8000-000000000002',
    'ba000000-0000-4000-8000-000000000024', (select league_id from tap_league)),
  true, 'quitter la ligue retire l''appartenance'
);
select is(
  public.leave_contest_league('ba000000-0000-4000-8000-000000000002',
    'ba000000-0000-4000-8000-000000000024', (select league_id from tap_league)),
  false, 'quitter deux fois est un no-op'
);

-- Clôture : le classement de ligue lit le palmarès figé, re-numéroté.
select lives_ok(
  $$select public.finalize_contest('ba000000-0000-4000-8000-000000000001',
    'ba000000-0000-4000-8000-000000000002')$$,
  'clôture du championnat'
);
select results_eq(
  $$select first_name, rank, total_players
      from public.contest_leaderboard('ba000000-0000-4000-8000-000000000002', 50, 0,
        (select league_id from tap_league))$$,
  $$values ('Alice', 1::bigint, 2::bigint), ('Bruno', 2::bigint, 2::bigint)$$,
  'après clôture : palmarès figé filtré sur la ligue, rangs 1..n'
);

-- Plafonds : 200 ligues par championnat, 100 membres par ligue.
insert into public.contest_leagues (organization_id, contest_id, name, code)
select 'ba000000-0000-4000-8000-000000000001', 'ba000000-0000-4000-8000-000000000002',
       'Cap ' || i, translate(lpad(i::text, 6, '0'), '0123456789', 'ABCDEFGHJK')
from generate_series(1, 199) i;
select throws_ok(
  $$select * from public.create_contest_league('ba000000-0000-4000-8000-000000000002',
    'ba000000-0000-4000-8000-000000000021', 'Une de trop')$$,
  'P0001', 'league limit reached', 'plafond de 200 ligues par championnat'
);

insert into public.contest_players (id, contest_id, organization_id, token_hash, first_name, accepted_terms)
select ('f1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'ba000000-0000-4000-8000-000000000002', 'ba000000-0000-4000-8000-000000000001',
       md5('cap-a' || i) || md5('cap-b' || i), 'Cap' || i, true
from generate_series(1, 99) i;
-- La ligue compte Alice + Bruno : 98 renforts la portent à 100.
insert into public.contest_league_members (league_id, player_id)
select (select league_id from tap_league),
       ('f1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid
from generate_series(1, 98) i;
select throws_ok(
  format($f$select * from public.join_contest_league('ba000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000099', '%s')$f$, (select code from tap_league)),
  'P0001', 'league full', 'plafond de 100 membres par ligue'
);

select finish();
rollback;
