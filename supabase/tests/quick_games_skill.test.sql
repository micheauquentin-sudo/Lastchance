-- ============================================================
-- Jeux rapides · VAGUE 2 (skill-gated) — chemin tirage-sur-défi.
--
-- Vérifie les invariants #2 et #3 au niveau DB via perform_atomic_spin :
--   • succès (p_force_losing = false) → tirage normal (ici gain certain :
--     un seul lot gagnant à stock fini → décrémente le stock) ;
--   • échec  (p_force_losing = true)  → spin PERDANT forcé, aucun prize_id,
--     stock INTACT, mais participation CONSOMMÉE ;
--   • anti-brute-force : sous play_limit = 'once', une 2e tentative (succès
--     OU échec) est refusée (limit_reached), aucun spin supplémentaire.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug)
values ('f0000000-0000-4000-8000-000000000001', 'Test Skill', 'tap-skill');

insert into public.campaigns (id, organization_id, name, status, code_ttl_seconds)
values ('f0000000-0000-4000-8000-000000000002',
        'f0000000-0000-4000-8000-000000000001', 'Campagne Skill', 'active', 300);

-- Roue skill : game_type = mystery_word, play_limit = 'once' (anti-rejeu),
-- secret dans skill_config (jamais lu ici — server-only).
insert into public.wheels (id, organization_id, campaign_id, name, play_limit, game_type, skill_config)
values ('f0000000-0000-4000-8000-000000000003',
        'f0000000-0000-4000-8000-000000000001',
        'f0000000-0000-4000-8000-000000000002', 'Mot mystère TAP', 'once',
        'mystery_word', '{"mystery_word":{"word":"secret","mask":"______"}}'::jsonb);

-- Un unique lot GAGNANT à stock fini (rend le tirage sur succès déterministe).
insert into public.prizes (id, organization_id, wheel_id, label, stock, weight, is_active, is_losing)
values ('f0000000-0000-4000-8000-000000000004',
        'f0000000-0000-4000-8000-000000000001',
        'f0000000-0000-4000-8000-000000000003', 'Cadeau TAP', 2, 100, true, false);

-- ── game_type skill accepté par la contrainte ────────────────
select lives_ok(
  $$update public.wheels set game_type = 'estimate'
      where id = 'f0000000-0000-4000-8000-000000000003';
    update public.wheels set game_type = 'mystery_word'
      where id = 'f0000000-0000-4000-8000-000000000003'$$,
  'game_type skill (estimate/mystery_word) accepté par wheels_game_type_check'
);

-- ── CHECK de taille skill_config ─────────────────────────────
select throws_ok(
  $$update public.wheels set skill_config =
      jsonb_build_object('x', repeat('z', 9000))
    where id = 'f0000000-0000-4000-8000-000000000003'$$,
  '23514',
  null,
  'skill_config surdimensionné (> 8 Ko) rejeté par wheels_skill_config_size_check'
);

-- ── ÉCHEC de défi : spin perdant forcé, stock intact, participation prise ──
select is(
  (select is_losing from public.perform_atomic_spin(
     'f0000000-0000-4000-8000-000000000001',
     'f0000000-0000-4000-8000-000000000002',
     'f0000000-0000-4000-8000-000000000003',
     repeat('a', 64), null, 'direct', true)),
  true,
  'échec de défi → spin PERDANT forcé (is_losing)'
);

select is(
  (select prize_id from public.perform_atomic_spin(
     'f0000000-0000-4000-8000-000000000001',
     'f0000000-0000-4000-8000-000000000002',
     'f0000000-0000-4000-8000-000000000003',
     repeat('b', 64), null, 'direct', true)),
  null::uuid,
  'échec de défi → aucun prize_id (aucun gain)'
);

select is(
  (select stock from public.prizes where id = 'f0000000-0000-4000-8000-000000000004'),
  2,
  'échec de défi → stock INTACT (aucun engagement)'
);

select is(
  (select count(*)::int from public.spins
     where wheel_id = 'f0000000-0000-4000-8000-000000000003'
       and player_key = repeat('a', 64)),
  1,
  'échec de défi → participation CONSOMMÉE (1 spin enregistré)'
);

-- ── ANTI-BRUTE-FORCE : 2e tentative même device refusée (play_limit once) ──
select is(
  (select denial_reason from public.perform_atomic_spin(
     'f0000000-0000-4000-8000-000000000001',
     'f0000000-0000-4000-8000-000000000002',
     'f0000000-0000-4000-8000-000000000003',
     repeat('a', 64), null, 'direct', true)),
  'limit_reached',
  'anti-brute-force : 2e tentative (même device) refusée sous play_limit once'
);

select is(
  (select count(*)::int from public.spins
     where wheel_id = 'f0000000-0000-4000-8000-000000000003'
       and player_key = repeat('a', 64)),
  1,
  'anti-brute-force : la tentative refusée ne crée AUCUN spin supplémentaire'
);

-- ── SUCCÈS de défi : tirage normal (gain certain), stock décrémenté ──
select is(
  (select is_losing from public.perform_atomic_spin(
     'f0000000-0000-4000-8000-000000000001',
     'f0000000-0000-4000-8000-000000000002',
     'f0000000-0000-4000-8000-000000000003',
     repeat('c', 64), null, 'direct', false)),
  false,
  'succès de défi → tirage normal aboutit au lot gagnant (is_losing false)'
);

select is(
  (select stock from public.prizes where id = 'f0000000-0000-4000-8000-000000000004'),
  1,
  'succès de défi → stock décrémenté par le tirage (le plafond éco tient)'
);

-- ── Non-régression : appel 6-args (roue classique) inchangé ──
select lives_ok(
  $$select * from public.perform_atomic_spin(
     'f0000000-0000-4000-8000-000000000001',
     'f0000000-0000-4000-8000-000000000002',
     'f0000000-0000-4000-8000-000000000003',
     repeat('e', 64), null, 'direct')$$,
  'appel 6-args (p_force_losing par défaut) inchangé — zéro régression roue'
);

select finish();
rollback;
