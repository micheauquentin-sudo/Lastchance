-- ============================================================
-- Encaissement en caisse des récompenses de pronostics (PRONO-…)
-- — comportement réel de redeem_contest_award sur une base migrée.
--
--   1. Expiration : le TTL du championnat est figé à l'émission par
--      trigger (null = sans limite, rétrocompatible).
--   2. Cloisonnement : un code d'une AUTRE organisation répond comme un
--      code inconnu — aucune ligne, pas d'oracle d'existence.
--   3. Remise nominale : statut, horodatage, acteur, panier, audit.
--   4. IDEMPOTENCE (invariant central) : le second appel ne remet rien
--      et n'écrase ni l'acteur ni l'audit.
--   5. Refus : lot annulé, lot expiré, acteur vide, panier négatif.
--   6. La contrainte (status='delivered') = (redeemed_at is not null)
--      rend l'état incohérent impossible, y compris en écriture directe.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- La RPC est réservée au service role (la caisse passe par le client
-- admin dans les server actions).
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug, addon_pronostics)
values ('cb000000-0000-4000-8000-000000000001', 'Test Caisse Prono', 'tap-prono-caisse', true);
-- Seconde organisation : preuve du cloisonnement de la caisse.
insert into public.organizations (id, name, slug, addon_pronostics)
values ('cb000000-0000-4000-8000-0000000000ff', 'Autre Org', 'tap-prono-caisse-2', true);

-- Championnat SANS TTL (cas par défaut, rétrocompatible).
insert into public.contests (id, organization_id, slug, name, competition_key, status)
values ('cb000000-0000-4000-8000-000000000002',
        'cb000000-0000-4000-8000-000000000001',
        'tap-prono-caisse-a', 'Championnat Caisse', 'ligue1', 'finished');
-- Championnat AVEC TTL : preuve du trigger d'expiration. 86400 s = 24 h,
-- une fenêtre de retrait réaliste (les bornes sont 1 h à 90 j).
insert into public.contests (id, organization_id, slug, name, competition_key, status, code_ttl_seconds)
values ('cb000000-0000-4000-8000-000000000003',
        'cb000000-0000-4000-8000-000000000001',
        'tap-prono-caisse-ttl', 'Championnat TTL', 'ligue1', 'finished', 86400);
-- Championnat de l'autre organisation.
insert into public.contests (id, organization_id, slug, name, competition_key, status)
values ('cb000000-0000-4000-8000-000000000004',
        'cb000000-0000-4000-8000-0000000000ff',
        'tap-prono-caisse-b', 'Championnat Autre', 'ligue1', 'finished');

insert into public.contest_players
  (id, contest_id, organization_id, token_hash, first_name, accepted_terms)
values
  ('cb000000-0000-4000-8000-000000000021', 'cb000000-0000-4000-8000-000000000002',
   'cb000000-0000-4000-8000-000000000001', repeat('a', 64), 'Alice', true),
  ('cb000000-0000-4000-8000-000000000022', 'cb000000-0000-4000-8000-000000000002',
   'cb000000-0000-4000-8000-000000000001', repeat('b', 64), 'Bruno', true),
  ('cb000000-0000-4000-8000-000000000023', 'cb000000-0000-4000-8000-000000000002',
   'cb000000-0000-4000-8000-000000000001', repeat('c', 64), 'Chloé', true),
  ('cb000000-0000-4000-8000-000000000024', 'cb000000-0000-4000-8000-000000000003',
   'cb000000-0000-4000-8000-000000000001', repeat('d', 64), 'David', true),
  ('cb000000-0000-4000-8000-000000000025', 'cb000000-0000-4000-8000-000000000004',
   'cb000000-0000-4000-8000-0000000000ff', repeat('e', 64), 'Edith', true);

-- Lots : nominal / annulé / expiré (org A), TTL (org A), autre org.
insert into public.contest_awards
  (id, contest_id, organization_id, player_id, rank, reward_label, code, status, redeem_expires_at)
values
  ('cb000000-0000-4000-8000-000000000031', 'cb000000-0000-4000-8000-000000000002',
   'cb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000021',
   1, 'Une bouteille', 'PRONO-AAAAAAAA', 'pending', null),
  ('cb000000-0000-4000-8000-000000000032', 'cb000000-0000-4000-8000-000000000002',
   'cb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000022',
   2, 'Un dessert', 'PRONO-BBBBBBBB', 'cancelled', null),
  -- Échéance dépassée : now() est FIGÉ pour la transaction pgTAP, donc
  -- « now() - 1 heure » est bien dans le passé du point de vue de la RPC.
  ('cb000000-0000-4000-8000-000000000033', 'cb000000-0000-4000-8000-000000000002',
   'cb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000023',
   3, 'Un café', 'PRONO-CCCCCCCC', 'pending', now() - interval '1 hour'),
  ('cb000000-0000-4000-8000-000000000034', 'cb000000-0000-4000-8000-000000000003',
   'cb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000024',
   1, 'Lot TTL', 'PRONO-DDDDDDDD', 'pending', null),
  ('cb000000-0000-4000-8000-000000000035', 'cb000000-0000-4000-8000-000000000004',
   'cb000000-0000-4000-8000-0000000000ff', 'cb000000-0000-4000-8000-000000000025',
   1, 'Lot autre org', 'PRONO-EEEEEEEE', 'pending', null);

-- ══ 0. Schéma : une seule colonne de vérité ═════════════════
select has_column('public', 'contest_awards', 'redeemed_at',
  'la remise s''horodate sur redeemed_at, comme les modules frères');
select hasnt_column('public', 'contest_awards', 'delivered_at',
  'delivered_at a disparu : pas deux horodatages qui divergent');
select has_column('public', 'contest_awards', 'redeemed_by',
  'l''acteur de la remise est tracé');
select has_column('public', 'contests', 'code_ttl_seconds',
  'le championnat porte la durée de validité de ses codes');

-- Bornes DÉLIBÉRÉMENT plus larges que campaigns.code_ttl_seconds (10 s à
-- 600 s) : ici le décompte part de la clôture, pas du passage en caisse.
-- Épinglé par un test pour qu'un futur alignement « de cohérence » sur
-- les campagnes ne réintroduise pas silencieusement des codes qui
-- expirent avant le premier retrait possible.
select throws_ok($$
  update public.contests set code_ttl_seconds = 600
   where id = 'cb000000-0000-4000-8000-000000000002'
$$, '23514', null, 'une fenêtre de 10 min est refusée (trop courte ici)');
select throws_ok($$
  update public.contests set code_ttl_seconds = 7776001
   where id = 'cb000000-0000-4000-8000-000000000002'
$$, '23514', null, 'au-delà de 90 jours : refusé');
select lives_ok($$
  update public.contests set code_ttl_seconds = 3600
   where id = 'cb000000-0000-4000-8000-000000000002'
$$, 'une fenêtre de retrait d''une heure est acceptée');
-- Remis à null : le championnat 002 sert de cas « sans expiration ».
update public.contests set code_ttl_seconds = null
 where id = 'cb000000-0000-4000-8000-000000000002';

-- ══ 1. Expiration posée à l'émission par trigger ════════════
select ok((select redeem_expires_at from public.contest_awards
            where id = 'cb000000-0000-4000-8000-000000000031') is null,
  'championnat sans TTL : le code n''expire pas');
select is((select redeem_expires_at from public.contest_awards
            where id = 'cb000000-0000-4000-8000-000000000034'),
  now() + interval '86400 seconds',
  'championnat avec TTL : l''échéance est figée en base à l''émission');

-- ══ 2. Cloisonnement multi-tenant ═══════════════════════════
select is((select count(*)::int from public.redeem_contest_award(
    'cb000000-0000-4000-8000-0000000000ff', 'PRONO-AAAAAAAA', 'caisse-autre')),
  0, 'code d''une autre organisation : aucune ligne');
select is((select count(*)::int from public.redeem_contest_award(
    'cb000000-0000-4000-8000-000000000001', 'PRONO-ZZZZZZZZ', 'caisse-1')),
  0, 'code inconnu : aucune ligne (réponse indistinguable du cross-org)');
select is((select status from public.contest_awards
            where id = 'cb000000-0000-4000-8000-000000000031'),
  'pending', 'la tentative cross-org n''a rien remis');

-- ══ 3. Remise nominale ══════════════════════════════════════
-- Un SEUL appel émetteur : on fige sa réponse pour l'inspecter.
create temporary table tap_redeem on commit drop as
select * from public.redeem_contest_award(
  'cb000000-0000-4000-8000-000000000001', 'prono-aaaaaaaa', 'caisse-1', 2500);

select is((select redeemed_now from tap_redeem), true,
  'remise valide (code insensible à la casse)');
select is((select status from tap_redeem), 'delivered',
  'la réponse annonce le lot comme remis');
select ok((select redeemed_at from tap_redeem) is not null,
  'la réponse porte l''horodatage de remise');
select is((select contest_name from tap_redeem), 'Championnat Caisse',
  'la caisse affiche le championnat d''origine');
select is((select player_name from tap_redeem), 'Alice',
  'la caisse affiche le gagnant');
select is((select reward_label from tap_redeem), 'Une bouteille',
  'la caisse affiche le lot à remettre');
select is((select "rank" from tap_redeem), 1, 'la caisse affiche le rang');
select is((select basket_cents from tap_redeem), 2500,
  'le panier saisi en caisse est enregistré (revenu attribuable)');

select is((select status from public.contest_awards
            where id = 'cb000000-0000-4000-8000-000000000031'),
  'delivered', 'le lot est passé à delivered en base');
select ok((select redeemed_at from public.contest_awards
            where id = 'cb000000-0000-4000-8000-000000000031') is not null,
  'redeemed_at est posé en base');
select is((select redeemed_by from public.contest_awards
            where id = 'cb000000-0000-4000-8000-000000000031'),
  'caisse-1', 'l''acteur de la remise est enregistré');
select is((select count(*)::int from public.audit_logs
            where organization_id = 'cb000000-0000-4000-8000-000000000001'
              and action = 'contest.award.redeem'),
  1, 'la remise est auditée');

-- ══ 4. Idempotence — l'invariant central ════════════════════
select is((select redeemed_now from public.redeem_contest_award(
    'cb000000-0000-4000-8000-000000000001', 'PRONO-AAAAAAAA', 'caisse-2')),
  false, 'pas de double remise : le second appel ne remet rien');
select is((select redeemed_by from public.contest_awards
            where id = 'cb000000-0000-4000-8000-000000000031'),
  'caisse-1', 'le second appel n''écrase pas l''acteur de la vraie remise');
select is((select basket_cents from public.contest_awards
            where id = 'cb000000-0000-4000-8000-000000000031'),
  2500, 'le second appel n''écrase pas le panier');
select is((select count(*)::int from public.audit_logs
            where organization_id = 'cb000000-0000-4000-8000-000000000001'
              and action = 'contest.award.redeem'),
  1, 'le second appel n''ajoute pas de ligne d''audit');

-- ══ 5. Refus ════════════════════════════════════════════════
select is((select redeemed_now from public.redeem_contest_award(
    'cb000000-0000-4000-8000-000000000001', 'PRONO-BBBBBBBB', 'caisse-1')),
  false, 'un lot annulé ne se remet pas en caisse');
select is((select status from public.contest_awards
            where id = 'cb000000-0000-4000-8000-000000000032'),
  'cancelled', 'le lot annulé reste annulé');

select is((select redeemed_now from public.redeem_contest_award(
    'cb000000-0000-4000-8000-000000000001', 'PRONO-CCCCCCCC', 'caisse-1')),
  false, 'un code expiré ne se remet pas (une capture d''écran ne suffit pas)');
select is((select status from public.contest_awards
            where id = 'cb000000-0000-4000-8000-000000000033'),
  'pending', 'le lot expiré reste en attente');
-- La caisse doit pouvoir EXPLIQUER le refus : la ligne est renvoyée.
select is((select redeem_expires_at is not null from public.redeem_contest_award(
    'cb000000-0000-4000-8000-000000000001', 'PRONO-CCCCCCCC', 'caisse-1')),
  true, 'la réponse porte l''échéance, pour expliquer le refus au comptoir');

select throws_ok(
  $$select * from public.redeem_contest_award(
      'cb000000-0000-4000-8000-000000000001', 'PRONO-DDDDDDDD', '')$$,
  'actor required', 'un acteur vide est refusé');
select throws_ok(
  $$select * from public.redeem_contest_award(
      'cb000000-0000-4000-8000-000000000001', 'PRONO-DDDDDDDD', null)$$,
  'actor required', 'un acteur null est refusé');
select throws_ok(
  $$select * from public.redeem_contest_award(
      'cb000000-0000-4000-8000-000000000001', 'PRONO-DDDDDDDD', 'caisse-1', -1)$$,
  'invalid basket', 'un panier négatif est refusé');

-- ══ 6. L'état incohérent est IMPOSSIBLE ═════════════════════
select throws_ok($$
  update public.contest_awards set status = 'delivered'
   where id = 'cb000000-0000-4000-8000-000000000034'
$$, '23514', null, 'remis sans horodatage : refusé par la base');
select throws_ok($$
  update public.contest_awards set redeemed_at = now()
   where id = 'cb000000-0000-4000-8000-000000000034'
$$, '23514', null, 'horodaté sans être remis : refusé par la base');

-- Le chemin ÉDITEUR écrit la même colonne de vérité et respecte donc la
-- contrainte (il pose statut et horodatage ensemble).
select lives_ok($$
  update public.contest_awards
     set status = 'delivered', redeemed_at = now(), redeemed_by = 'dashboard'
   where id = 'cb000000-0000-4000-8000-000000000034'
$$, 'statut et horodatage posés ensemble : accepté');

select * from finish();
rollback;
