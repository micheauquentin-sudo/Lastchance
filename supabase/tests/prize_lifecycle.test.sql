-- ============================================================
-- Cycle complet du gain — expiration serveur, retrait avec panier,
-- annulation motivée avec restock, entonnoir + ROI.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug)
values ('e0000000-0000-4000-8000-000000000001', 'Test Cycle', 'tap-cycle');

insert into public.campaigns (id, organization_id, name, status, code_ttl_seconds)
values ('e0000000-0000-4000-8000-000000000002',
        'e0000000-0000-4000-8000-000000000001', 'Campagne TAP', 'active', 3600);

insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('e0000000-0000-4000-8000-000000000003',
        'e0000000-0000-4000-8000-000000000001',
        'e0000000-0000-4000-8000-000000000002', 'Roue TAP', 'unlimited');

insert into public.prizes (id, organization_id, wheel_id, label, stock, cost_cents, value_cents)
values ('e0000000-0000-4000-8000-000000000004',
        'e0000000-0000-4000-8000-000000000001',
        'e0000000-0000-4000-8000-000000000003', 'Café offert', 5, 150, 300);

-- ── Trigger : l'échéance est figée en base à la réclamation ──
insert into public.participations
  (id, organization_id, campaign_id, wheel_id, prize_id, first_name, email,
   accepted_terms, redeem_code, player_key)
values ('e0000000-0000-4000-8000-000000000011',
        'e0000000-0000-4000-8000-000000000001',
        'e0000000-0000-4000-8000-000000000002',
        'e0000000-0000-4000-8000-000000000003',
        'e0000000-0000-4000-8000-000000000004',
        'Alice', 'alice@tap.local', true, 'GAIN-TAPVALID', repeat('a', 64));

select ok(
  (select redeem_expires_at between now() + interval '59 minutes'
                               and now() + interval '61 minutes'
     from public.participations
    where id = 'e0000000-0000-4000-8000-000000000011'),
  'le TTL campagne (1 h) devient une échéance SERVEUR à l''insertion'
);

-- ── Retrait valide : panier enregistré, audité, une seule fois ──
select results_eq(
  $$select redeemed_now, basket_cents
      from public.redeem_by_code('e0000000-0000-4000-8000-000000000001',
                                 'gain-tapvalid', 'tap-cashier', 1250)$$,
  $$values (true, 1250)$$,
  'retrait valide : normalisation du code, panier facultatif stocké'
);
select results_eq(
  $$select redeemed_now from public.redeem_by_code('e0000000-0000-4000-8000-000000000001',
                                                   'GAIN-TAPVALID', 'tap-cashier')$$,
  $$values (false)$$,
  'un second retrait du même code est refusé'
);
select is(
  (select metadata->>'basket_cents' from public.audit_logs
    where action = 'participation.redeem'
    order by created_at desc limit 1),
  '1250', 'le montant du panier est journalisé au retrait'
);

-- ── Expiration serveur : le code photographié ne passe plus ──
insert into public.participations
  (id, organization_id, campaign_id, wheel_id, prize_id, first_name, email,
   accepted_terms, redeem_code, redeem_expires_at, player_key)
values ('e0000000-0000-4000-8000-000000000012',
        'e0000000-0000-4000-8000-000000000001',
        'e0000000-0000-4000-8000-000000000002',
        'e0000000-0000-4000-8000-000000000003',
        'e0000000-0000-4000-8000-000000000004',
        'Bob', 'bob@tap.local', true, 'GAIN-TAPEXPIRE',
        now() - interval '5 minutes', repeat('b', 64));

select results_eq(
  $$select redeemed_now, redeemed_at is null,
           redeem_expires_at < now()
      from public.redeem_by_code('e0000000-0000-4000-8000-000000000001',
                                 'GAIN-TAPEXPIRE', 'tap-cashier')$$,
  $$values (false, true, true)$$,
  'code expiré : refus SERVEUR, l''état expiré est signalé à la caisse'
);

-- ── Annulation motivée : restock + audit, jamais après retrait ──
insert into public.participations
  (id, organization_id, campaign_id, wheel_id, prize_id, first_name, email,
   accepted_terms, redeem_code, player_key)
values ('e0000000-0000-4000-8000-000000000013',
        'e0000000-0000-4000-8000-000000000001',
        'e0000000-0000-4000-8000-000000000002',
        'e0000000-0000-4000-8000-000000000003',
        'e0000000-0000-4000-8000-000000000004',
        'Chloé', 'chloe@tap.local', true, 'GAIN-TAPCANCEL', repeat('c', 64));

select throws_ok(
  $$select public.cancel_participation('e0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000013', 'nul')$$,
  'P0001', 'reason required', 'annuler exige un motif'
);
select is(
  public.cancel_participation('e0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000013', 'erreur de saisie caisse'),
  true, 'annulation motivée acceptée'
);
select is(
  (select stock from public.prizes
    where id = 'e0000000-0000-4000-8000-000000000004'),
  6, 'le lot annulé repart en stock (5 → 6)'
);
select is(
  public.cancel_participation('e0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000013', 'seconde tentative refusée'),
  false, 'une participation déjà annulée ne s''annule pas deux fois'
);
select results_eq(
  $$select redeemed_now from public.redeem_by_code('e0000000-0000-4000-8000-000000000001',
                                                   'GAIN-TAPCANCEL', 'tap-cashier')$$,
  $$values (false)$$,
  'un code annulé ne se retire plus'
);
select is(
  public.cancel_participation('e0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000011', 'trop tard, déjà retiré'),
  false, 'une participation retirée ne s''annule pas'
);

-- ── Entonnoir gagné → réclamé → retiré + revenu/ROI ──────────
insert into public.spins (organization_id, campaign_id, wheel_id, prize_id, is_losing, player_key, claimed)
values
  ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002',
   'e0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000004', false, repeat('a', 64), true),
  ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002',
   'e0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000004', false, repeat('b', 64), true),
  ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002',
   'e0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000004', false, repeat('c', 64), true),
  ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002',
   'e0000000-0000-4000-8000-000000000003', null, true, repeat('d', 64), false);

select results_eq(
  $$select spins_total, wins, claimed, redeemed, expired, cancelled,
           basket_revenue_cents, redeemed_cost_cents, redeemed_value_cents
      from public.org_prize_funnel('e0000000-0000-4000-8000-000000000001', 30)$$,
  $$values (4::bigint, 3::bigint, 3::bigint, 1::bigint, 1::bigint, 1::bigint,
            1250::bigint, 150::bigint, 300::bigint)$$,
  'entonnoir complet : 4 tours, 3 gagnés, 3 réclamés, 1 retiré (panier 12,50 €), 1 expiré, 1 annulé — coût 1,50 €, valeur 3 €'
);

select finish();
rollback;
