-- ============================================================
-- FID-5a — Parrainage du passeport : comportement réel des RPC
--
-- Couverture reprise de `referral.test.sql` et transposée au passeport, plus
-- ce que la transposition ajoute :
--
--   1. Gating : addon coupé / programme brouillon / parrainage désactivé →
--      'unavailable' (pas d'oracle, même réponse quel que soit le motif).
--   2. ensure_loyalty_referral_code : get-or-create idempotent, code PASS-…
--      STABLE, pas de doublon ; non-porteur de passeport → 'not_a_member'.
--   3. LE CAS CENTRAL — un filleul qui CRÉE son passeport sans le faire
--      valider ne déclenche RIEN ('no_stamp'), et le parrain ne bouge pas
--      d'un point. C'est la demande du propriétaire, mot pour mot.
--   4. Son PREMIER TAMPON déclenche le versement : le parrain voit ses points
--      monter dans les DEUX compteurs (solde ET cumul), son niveau suit le
--      cumul, et son `visit_count` ne bouge PAS (un parrainage n'est pas une
--      visite). Le filleul reçoit son bonus de bienvenue.
--   5. Code inconnu → 'invalid'.
--   6. Auto-parrainage → 'self_referral'.
--   7. Doublon (un filleul ne compte qu'une fois, pour un AUTRE parrain) →
--      'duplicate'.
--   8. Boucle A→B→A → 'loop'.
--   9. Plafond → 'capped' ; fenêtre écoulée → 'expired'.
--  10. 'already_customer' : un client déjà tamponné AVANT le code du parrain
--      n'est le filleul de personne (refus propre à ce module).
--  11. IDEMPOTENCE : rejouer la validation ne verse pas deux fois — même
--      signup, mêmes soldes, et `idempotent: true`.
--  12. ISOLATION (contrôle négatif) : un parrain d'une AUTRE organisation ne
--      reçoit rien ; son code est indiscernable d'un code inventé.
--  13. Barème à zéro : le parrainage est enregistré et compté, aucun point.
--  14. ACL : ni `anon` ni `authenticated` n'exécutent les RPC, et la garde de
--      rôle vit AUSSI dans le corps ; les colonnes neuves sont lisibles et
--      modifiables par le commerçant, `rotating_secret` reste fermé.
--
-- Les tampons sont insérés DIRECTEMENT dans `loyalty_stamps` plutôt que par
-- `record_loyalty_stamp` : c'est délibéré. La RPC impose un cooldown, un mode
-- de validation et une identité de staff qui n'ont rien à voir avec ce qu'on
-- éprouve ici, et la faire tourner ferait dépendre ces assertions de son
-- comportement au lieu du nôtre. Ce que la preuve exige, c'est UNE LIGNE dans
-- `loyalty_stamps` — et c'est exactement ce qu'on pose.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- Préfixe UUID hex-valide 'fa…' (fixtures locales à cette transaction, annulée).

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug, addon_loyalty)
values ('fa000000-0000-4000-8000-000000000001', 'Test Parrainage', 'tap-parrainage', true);
-- Seconde organisation (addon ON) : cloisonnement multi-locataire.
insert into public.organizations (id, name, slug, addon_loyalty)
values ('fa000000-0000-4000-8000-0000000000ff', 'Autre Org Parrainage', 'tap-parrainage-2', true);
-- Troisième organisation : addon COUPÉ (premier verrou).
insert into public.organizations (id, name, slug, addon_loyalty)
values ('fa000000-0000-4000-8000-0000000000fe', 'Sans Addon', 'tap-parrainage-3', false);

-- Programme A — actif, parrainage ACTIVÉ. Parrain 200, filleul 100, plafond 2
-- (pour éprouver 'capped' sans fabriquer vingt passeports), fenêtre 30 j.
-- Seuils de niveau : argent 200, or 300 — c'est-à-dire qu'UN SEUL parrainage
-- à 200 points fait passer le parrain en argent. C'est ce qui prouve que le
-- versement compte pour le niveau.
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode,
  min_stamp_interval_seconds, silver_threshold, gold_threshold,
  referral_enabled, referral_sponsor_points, referral_filleul_points,
  referral_max_filleuls, referral_window_days
) values (
  'fa000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000001',
  'Passeport parrainage', 'active', 'staff', 300, 200, 300,
  true, 200, 100, 2, 30
);

-- Programme B (org1) — parrainage DÉSACTIVÉ (second verrou).
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode, referral_enabled
) values (
  'fa000000-0000-4000-8000-000000000003', 'fa000000-0000-4000-8000-000000000001',
  'Passeport sans parrainage', 'active', 'staff', false
);

-- Programme C (org1) — BROUILLON, parrainage activé (troisième verrou).
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode, referral_enabled
) values (
  'fa000000-0000-4000-8000-000000000004', 'fa000000-0000-4000-8000-000000000001',
  'Passeport brouillon', 'draft', 'staff', true
);

-- Programme D — org SANS addon, actif, parrainage activé (premier verrou).
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode, referral_enabled
) values (
  'fa000000-0000-4000-8000-000000000005', 'fa000000-0000-4000-8000-0000000000fe',
  'Passeport sans addon', 'active', 'staff', true
);

-- Programme E — AUTRE organisation, actif, parrainage activé (isolation).
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode,
  silver_threshold, gold_threshold,
  referral_enabled, referral_sponsor_points, referral_filleul_points
) values (
  'fa000000-0000-4000-8000-000000000006', 'fa000000-0000-4000-8000-0000000000ff',
  'Passeport voisin', 'active', 'staff', 200, 300, true, 200, 100
);

-- Programme F — barème à ZÉRO des deux côtés (§13).
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode,
  referral_enabled, referral_sponsor_points, referral_filleul_points
) values (
  'fa000000-0000-4000-8000-000000000007', 'fa000000-0000-4000-8000-000000000001',
  'Passeport barème zéro', 'active', 'staff', true, 0, 0
);

-- ── Passeports du programme A ────────────────────────────────
-- SA = parrain. F1 = filleul qui va valider. F2 = filleul « fantôme » (crée
-- son passeport, ne le fait JAMAIS valider). F3, F4 = plafond. SB = second
-- parrain (doublon / boucle). ANCIEN = client déjà tamponné avant le code.
insert into public.loyalty_members (id, program_id, organization_id, token_hash)
values
  ('fa000000-0000-4000-8000-00000000a001', 'fa000000-0000-4000-8000-000000000002',
   'fa000000-0000-4000-8000-000000000001', repeat('a1', 32)),
  ('fa000000-0000-4000-8000-00000000a002', 'fa000000-0000-4000-8000-000000000002',
   'fa000000-0000-4000-8000-000000000001', repeat('a2', 32)),
  ('fa000000-0000-4000-8000-00000000a003', 'fa000000-0000-4000-8000-000000000002',
   'fa000000-0000-4000-8000-000000000001', repeat('a3', 32)),
  ('fa000000-0000-4000-8000-00000000a004', 'fa000000-0000-4000-8000-000000000002',
   'fa000000-0000-4000-8000-000000000001', repeat('a4', 32)),
  ('fa000000-0000-4000-8000-00000000a005', 'fa000000-0000-4000-8000-000000000002',
   'fa000000-0000-4000-8000-000000000001', repeat('a5', 32)),
  ('fa000000-0000-4000-8000-00000000a006', 'fa000000-0000-4000-8000-000000000002',
   'fa000000-0000-4000-8000-000000000001', repeat('a6', 32)),
  ('fa000000-0000-4000-8000-00000000a007', 'fa000000-0000-4000-8000-000000000002',
   'fa000000-0000-4000-8000-000000000001', repeat('a7', 32));

-- Passeports de l'AUTRE organisation (isolation) et du programme à barème zéro.
insert into public.loyalty_members (id, program_id, organization_id, token_hash)
values
  ('fa000000-0000-4000-8000-00000000b001', 'fa000000-0000-4000-8000-000000000006',
   'fa000000-0000-4000-8000-0000000000ff', repeat('b1', 32)),
  ('fa000000-0000-4000-8000-00000000b002', 'fa000000-0000-4000-8000-000000000006',
   'fa000000-0000-4000-8000-0000000000ff', repeat('b2', 32)),
  ('fa000000-0000-4000-8000-00000000c001', 'fa000000-0000-4000-8000-000000000007',
   'fa000000-0000-4000-8000-000000000001', repeat('c1', 32)),
  ('fa000000-0000-4000-8000-00000000c002', 'fa000000-0000-4000-8000-000000000007',
   'fa000000-0000-4000-8000-000000000001', repeat('c2', 32));

create temporary table tap_r (r jsonb) on commit drop;
create temporary table tap_code (etiquette text, code text) on commit drop;


-- ══ 1. GATING : trois verrous, une seule réponse ═════════════
select is((public.ensure_loyalty_referral_code(
    'fa000000-0000-4000-8000-000000000005', repeat('a1', 32)))->>'state',
  'unavailable', 'ensure refusé quand l''addon de l''organisation est coupé');
select is((public.ensure_loyalty_referral_code(
    'fa000000-0000-4000-8000-000000000003', repeat('a1', 32)))->>'state',
  'unavailable', 'ensure refusé quand le parrainage du programme est désactivé');
select is((public.ensure_loyalty_referral_code(
    'fa000000-0000-4000-8000-000000000004', repeat('a1', 32)))->>'state',
  'unavailable', 'ensure refusé quand le programme est en brouillon');
select is((public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000003', 'PASS-AAAAAAAA', repeat('a2', 32)))->>'state',
  'unavailable', 'validate refusé quand le parrainage est désactivé');


-- ══ 2. ensure : get-or-create idempotent, code stable ════════
select is((public.ensure_loyalty_referral_code(
    'fa000000-0000-4000-8000-000000000002', repeat('ee', 32)))->>'state',
  'not_a_member',
  'un jeton qui ne désigne aucun passeport ne peut pas devenir parrain');

insert into tap_r select public.ensure_loyalty_referral_code(
  'fa000000-0000-4000-8000-000000000002', repeat('a1', 32));
select is((select r->>'state' from tap_r), 'ready', 'ensure valide → ready');
select ok((select r->>'referral_code' ~ '^PASS-[A-HJ-NP-Z2-9]{8}$' from tap_r),
  'code au format PASS-… (alphabet sans I/O/0/1, préfixe distinct de PR-)');
select is((select (r->>'validated_count')::int from tap_r), 0,
  'un parrain neuf n''a aucun filleul');
select is((select (r->>'max_filleuls')::int from tap_r), 2,
  'le plafond du programme est rendu au parrain');
insert into tap_code select 'SA', r->>'referral_code' from tap_r;
delete from tap_r;

select is((public.ensure_loyalty_referral_code(
    'fa000000-0000-4000-8000-000000000002', repeat('a1', 32)))->>'referral_code',
  (select code from tap_code where etiquette = 'SA'),
  'ensure idempotent : le code est STABLE d''un appel à l''autre');
select is((select count(*)::int from public.loyalty_referral_sponsors
             where program_id = 'fa000000-0000-4000-8000-000000000002'
               and member_id = 'fa000000-0000-4000-8000-00000000a001'),
  1, 're-ensure ne crée pas de second parrain');

-- Second parrain (SB) : sert au doublon et à la boucle.
insert into tap_code select 'SB', public.ensure_loyalty_referral_code(
  'fa000000-0000-4000-8000-000000000002', repeat('a5', 32))->>'referral_code';
select ok((select code <> (select code from tap_code where etiquette = 'SA')
             from tap_code where etiquette = 'SB'),
  'deux parrains ont deux codes distincts');


-- ══ 3. LE CAS CENTRAL ═══════════════════════════════════════
-- « demander à son ami de créer son passeport … le filleul doit valider son
-- passeport via une commande ou à la boutique ». F2 a créé son passeport et
-- ne l'a JAMAIS fait valider. Rien ne doit se produire.
select is((public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000002',
    (select code from tap_code where etiquette = 'SA'),
    repeat('a3', 32)))->>'state',
  'no_stamp',
  'CAS CENTRAL : un passeport CRÉÉ mais jamais VALIDÉ ne déclenche rien');

-- Et le parrain n'a pas bougé d'un point.
select results_eq(
  $$select points_balance, points_earned_total, validated_count::int
      from public.loyalty_members m
      join public.loyalty_referral_sponsors s on s.member_id = m.id
     where m.id = 'fa000000-0000-4000-8000-00000000a001'$$,
  $$values (0, 0, 0)$$,
  'le parrain n''a reçu AUCUN point pour un passeport non validé');

select is((select count(*)::int from public.loyalty_referral_signups
             where program_id = 'fa000000-0000-4000-8000-000000000002'),
  0, 'aucun parrainage n''a été enregistré');


-- ══ 4. LE PREMIER TAMPON DÉCLENCHE LE VERSEMENT ═════════════
-- F1 fait valider son passeport en boutique. On pose le tampon tel que la
-- caisse le poserait, APRÈS la création du code du parrain.
insert into public.loyalty_stamps
  (id, member_id, program_id, organization_id, stamped_at, mode, validated_by)
values ('fa000000-0000-4000-8000-00000000e001', 'fa000000-0000-4000-8000-00000000a002',
        'fa000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000001',
        now(), 'staff', null);

insert into tap_r select public.validate_loyalty_referral(
  'fa000000-0000-4000-8000-000000000002',
  (select code from tap_code where etiquette = 'SA'),
  repeat('a2', 32));

select is((select r->>'state' from tap_r), 'validated',
  'le premier tampon du filleul VALIDE le parrainage');
select is((select (r->>'idempotent')::boolean from tap_r), false,
  'premier passage : ce n''est pas un rejeu');
select is((select (r->>'validated_count')::int from tap_r), 1,
  'le compteur de filleuls du parrain passe à 1');
select is((select r->'sponsor'->>'points_balance' from tap_r), '200',
  'PARRAIN : le SOLDE monte de 200');
select is((select r->'sponsor'->>'points_earned_total' from tap_r), '200',
  'PARRAIN : le CUMUL monte aussi de 200 — un gain compte pour le niveau');
select is((select r->'sponsor'->>'tier' from tap_r), 'silver',
  'PARRAIN : le niveau suit le cumul (200 ≥ seuil argent) — parrainer fait progresser');
select is((select r->'sponsor'->>'visit_count' from tap_r), '0',
  'PARRAIN : visit_count NE bouge PAS — un parrainage n''est pas une visite');
select is((select r->'filleul'->>'points_balance' from tap_r), '100',
  'FILLEUL : bonus de bienvenue crédité');
select is((select r->'filleul'->>'points_earned_total' from tap_r), '100',
  'FILLEUL : son bonus compte aussi pour son niveau');
delete from tap_r;

-- Les DEUX compteurs, relus en base et non dans la réponse de la RPC.
select results_eq(
  $$select points_balance, points_earned_total, tier
      from public.loyalty_members
     where id = 'fa000000-0000-4000-8000-00000000a001'$$,
  $$values (200, 200, 'silver')$$,
  'EN BASE : le parrain porte bien 200/200 et le niveau argent');

-- La preuve est GRAVÉE, et les montants avec elle.
select results_eq(
  $$select proof_stamp_id, sponsor_points_awarded, filleul_points_awarded
      from public.loyalty_referral_signups
     where filleul_member_id = 'fa000000-0000-4000-8000-00000000a002'$$,
  $$values ('fa000000-0000-4000-8000-00000000e001'::uuid, 200, 100)$$,
  'le tampon qui a servi de preuve et les montants versés sont gravés sur le parrainage');

-- Un tampon ne vaut qu'un parrainage : la preuve n'est pas réutilisable.
select throws_ok($$
  insert into public.loyalty_referral_signups
    (program_id, organization_id, sponsor_id, filleul_member_id, proof_stamp_id)
  select 'fa000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000001',
         s.id, 'fa000000-0000-4000-8000-00000000a004', 'fa000000-0000-4000-8000-00000000e001'
    from public.loyalty_referral_sponsors s
   where s.member_id = 'fa000000-0000-4000-8000-00000000a001'
$$, '23505', null,
  'le MÊME tampon ne peut pas valider un second parrainage');


-- ══ 11. IDEMPOTENCE — rejouer ne verse pas deux fois ════════
-- Placé ici, juste après le versement, parce que c'est là qu'un double-clic
-- ou un réseau qui repart le produirait réellement.
insert into tap_r select public.validate_loyalty_referral(
  'fa000000-0000-4000-8000-000000000002',
  (select code from tap_code where etiquette = 'SA'),
  repeat('a2', 32));
select is((select r->>'state' from tap_r), 'validated',
  'rejeu : le parrainage déjà conclu se RELIT (ce n''est pas une erreur)');
select is((select (r->>'idempotent')::boolean from tap_r), true,
  'rejeu : signalé comme tel');
select is((select (r->>'validated_count')::int from tap_r), 1,
  'rejeu : le compteur de filleuls ne monte pas une seconde fois');
delete from tap_r;

select results_eq(
  $$select points_balance, points_earned_total
      from public.loyalty_members
     where id = 'fa000000-0000-4000-8000-00000000a001'$$,
  $$values (200, 200)$$,
  'IDEMPOTENCE : après rejeu, le parrain porte toujours 200/200 — aucun second versement');
select is((select count(*)::int from public.loyalty_referral_signups
             where filleul_member_id = 'fa000000-0000-4000-8000-00000000a002'),
  1, 'IDEMPOTENCE : un seul parrainage en base');


-- ══ 5. Code inconnu ═════════════════════════════════════════
select is((public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000002', 'PASS-ZZZZZZZZ', repeat('a4', 32)))->>'state',
  'invalid', 'code de parrainage inconnu → invalid');


-- ══ 6. AUTO-PARRAINAGE ══════════════════════════════════════
-- Le parrain se présente comme son propre filleul, tampon à l'appui.
insert into public.loyalty_stamps
  (id, member_id, program_id, organization_id, stamped_at, mode)
values ('fa000000-0000-4000-8000-00000000e002', 'fa000000-0000-4000-8000-00000000a001',
        'fa000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000001',
        now(), 'staff');
select is((public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000002',
    (select code from tap_code where etiquette = 'SA'),
    repeat('a1', 32)))->>'state',
  'self_referral', 'AUTO-PARRAINAGE refusé, même avec un tampon réel');
select results_eq(
  $$select points_balance from public.loyalty_members
     where id = 'fa000000-0000-4000-8000-00000000a001'$$,
  $$values (200)$$,
  'et rien n''a été versé pour cette tentative');


-- ══ 7. DOUBLON — un filleul ne compte qu'une fois ═══════════
-- F1 est déjà le filleul de SA. SB le présente à son tour.
select is((public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000002',
    (select code from tap_code where etiquette = 'SB'),
    repeat('a2', 32)))->>'state',
  'duplicate',
  'DOUBLON : un passeport déjà filleul ne peut pas être revendu à un autre parrain');
select results_eq(
  $$select points_balance, validated_count::int
      from public.loyalty_members m
      join public.loyalty_referral_sponsors s on s.member_id = m.id
     where m.id = 'fa000000-0000-4000-8000-00000000a005'$$,
  $$values (0, 0)$$,
  'le second parrain n''a rien reçu');


-- ══ 8. BOUCLE A→B→A ═════════════════════════════════════════
-- SB (a5) est parrain. On en fait le filleul de SA, puis SB tente de
-- présenter SA (a1) comme SON filleul : réciprocité directe.
insert into public.loyalty_stamps
  (id, member_id, program_id, organization_id, stamped_at, mode)
values ('fa000000-0000-4000-8000-00000000e005', 'fa000000-0000-4000-8000-00000000a005',
        'fa000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000001',
        now(), 'staff');
select is((public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000002',
    (select code from tap_code where etiquette = 'SA'),
    repeat('a5', 32)))->>'state',
  'validated', 'SB devient filleul de SA (mise en place de la boucle)');
select is((public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000002',
    (select code from tap_code where etiquette = 'SB'),
    repeat('a1', 32)))->>'state',
  'loop', 'BOUCLE : A parraine B, B ne peut pas parrainer A en retour');


-- ══ 9. PLAFOND puis FENÊTRE ═════════════════════════════════
-- SA a maintenant 2 filleuls (F1 et SB) pour un plafond de 2.
select is((select validated_count from public.loyalty_referral_sponsors
             where member_id = 'fa000000-0000-4000-8000-00000000a001'),
  2, 'SA est à 2 filleuls validés');
insert into public.loyalty_stamps
  (id, member_id, program_id, organization_id, stamped_at, mode)
values ('fa000000-0000-4000-8000-00000000e006', 'fa000000-0000-4000-8000-00000000a006',
        'fa000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000001',
        now(), 'staff');
select is((public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000002',
    (select code from tap_code where etiquette = 'SA'),
    repeat('a6', 32)))->>'state',
  'capped', 'PLAFOND : au-delà de referral_max_filleuls, plus rien n''est versé');

-- FENÊTRE : on vieillit le code de SB au-delà des 30 jours du programme.
update public.loyalty_referral_sponsors
   set created_at = now() - interval '90 days'
 where member_id = 'fa000000-0000-4000-8000-00000000a005';
select is((public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000002',
    (select code from tap_code where etiquette = 'SB'),
    repeat('a6', 32)))->>'state',
  'expired', 'FENÊTRE : un code plus vieux que referral_window_days ne vaut plus');


-- ══ 10. already_customer — le refus propre à ce module ══════
-- Le passeport a7 a été tamponné AVANT que SA n'obtienne son code : c'était
-- déjà un client de la maison, il n'est le filleul de personne.
insert into public.loyalty_stamps
  (id, member_id, program_id, organization_id, stamped_at, mode)
values ('fa000000-0000-4000-8000-00000000e007', 'fa000000-0000-4000-8000-00000000a007',
        'fa000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000001',
        now() - interval '200 days', 'staff');
-- On remonte le plafond de SA pour que le refus testé soit bien celui-ci.
update public.loyalty_programs set referral_max_filleuls = 20
 where id = 'fa000000-0000-4000-8000-000000000002';
select is((public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000002',
    (select code from tap_code where etiquette = 'SA'),
    repeat('a7', 32)))->>'state',
  'already_customer',
  'un client déjà tamponné AVANT le code du parrain n''est le filleul de personne');

-- Contre-épreuve : le MÊME passeport, dont un tampon POSTÉRIEUR existe aussi,
-- reste refusé — c'est le PREMIER tampon qui décide, pas le plus récent.
insert into public.loyalty_stamps
  (id, member_id, program_id, organization_id, stamped_at, mode)
values ('fa000000-0000-4000-8000-00000000e008', 'fa000000-0000-4000-8000-00000000a007',
        'fa000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000001',
        now(), 'staff');
select is((public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000002',
    (select code from tap_code where etiquette = 'SA'),
    repeat('a7', 32)))->>'state',
  'already_customer',
  'un tampon récent ne rachète pas l''ancienneté : c''est le PREMIER qui décide');


-- ══ 12. ISOLATION — contrôle négatif inter-organisations ════
-- Un parrain de l'AUTRE organisation, avec un filleul tamponné chez lui.
insert into tap_code select 'VOISIN', public.ensure_loyalty_referral_code(
  'fa000000-0000-4000-8000-000000000006', repeat('b1', 32))->>'referral_code';
insert into public.loyalty_stamps
  (id, member_id, program_id, organization_id, stamped_at, mode)
values ('fa000000-0000-4000-8000-00000000f001', 'fa000000-0000-4000-8000-00000000b002',
        'fa000000-0000-4000-8000-000000000006', 'fa000000-0000-4000-8000-0000000000ff',
        now(), 'staff');

-- Le code du voisin, présenté au programme d'org1 : indiscernable d'un code
-- inventé. Aucun oracle, et surtout aucun versement.
select is((public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000002',
    (select code from tap_code where etiquette = 'VOISIN'),
    repeat('a6', 32)))->>'state',
  'invalid',
  'ISOLATION : le code d''un parrain d''une AUTRE organisation est un code inconnu');
select results_eq(
  $$select points_balance, points_earned_total, validated_count::int
      from public.loyalty_members m
      join public.loyalty_referral_sponsors s on s.member_id = m.id
     where m.id = 'fa000000-0000-4000-8000-00000000b001'$$,
  $$values (0, 0, 0)$$,
  'ISOLATION : le parrain de l''autre organisation n''a RIEN reçu');

-- Et le filleul d'à côté, présenté au programme d'org1 : pas de passeport ici.
select is((public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000002',
    (select code from tap_code where etiquette = 'SA'),
    repeat('b2', 32)))->>'state',
  'not_a_member',
  'ISOLATION : un passeport d''une autre organisation n''existe pas dans ce programme');


-- ══ 13. BARÈME À ZÉRO ═══════════════════════════════════════
-- 0 point ne veut pas dire « pas de parrainage » : le commerçant veut compter
-- ses filleuls même s'il ne les paie pas.
insert into tap_code select 'ZERO', public.ensure_loyalty_referral_code(
  'fa000000-0000-4000-8000-000000000007', repeat('c1', 32))->>'referral_code';
insert into public.loyalty_stamps
  (id, member_id, program_id, organization_id, stamped_at, mode)
values ('fa000000-0000-4000-8000-00000000f002', 'fa000000-0000-4000-8000-00000000c002',
        'fa000000-0000-4000-8000-000000000007', 'fa000000-0000-4000-8000-000000000001',
        now(), 'staff');
insert into tap_r select public.validate_loyalty_referral(
  'fa000000-0000-4000-8000-000000000007',
  (select code from tap_code where etiquette = 'ZERO'),
  repeat('c2', 32));
select is((select r->>'state' from tap_r), 'validated',
  'BARÈME ZÉRO : le parrainage est validé et compté');
select is((select (r->>'validated_count')::int from tap_r), 1,
  'BARÈME ZÉRO : le compteur de filleuls monte quand même');
delete from tap_r;
select results_eq(
  $$select points_balance, points_earned_total
      from public.loyalty_members
     where id = 'fa000000-0000-4000-8000-00000000c001'$$,
  $$values (0, 0)$$,
  'BARÈME ZÉRO : aucun point versé, et le passeport n''est pas touché');


-- ══ 14. ACL ═════════════════════════════════════════════════
select ok(not has_function_privilege(
    'anon', 'public.validate_loyalty_referral(uuid, text, text)', 'EXECUTE'),
  'anon ne peut pas exécuter validate_loyalty_referral');
select ok(not has_function_privilege(
    'authenticated', 'public.validate_loyalty_referral(uuid, text, text)', 'EXECUTE'),
  'authenticated ne peut pas exécuter validate_loyalty_referral');
select ok(has_function_privilege(
    'service_role', 'public.validate_loyalty_referral(uuid, text, text)', 'EXECUTE'),
  'service_role l''exécute (c''est lui qui porte les server actions)');

select ok(not has_function_privilege(
    'anon', 'public.ensure_loyalty_referral_code(uuid, text)', 'EXECUTE'),
  'anon ne peut pas exécuter ensure_loyalty_referral_code');
select ok(not has_function_privilege(
    'authenticated', 'public.ensure_loyalty_referral_code(uuid, text)', 'EXECUTE'),
  'authenticated ne peut pas exécuter ensure_loyalty_referral_code');
select ok(not has_function_privilege(
    'anon', 'public.loyalty_referral_credit(uuid, uuid, integer)', 'EXECUTE'),
  'anon ne peut pas exécuter le helper de crédit');
select ok(not has_function_privilege(
    'authenticated', 'public.loyalty_referral_credit(uuid, uuid, integer)', 'EXECUTE'),
  'authenticated ne peut pas exécuter le helper de crédit (il crédite des points)');

-- La garde de rôle vit AUSSI dans le corps : le droit d'exécution n'est pas la
-- seule barrière.
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$
  select public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000002', 'PASS-AAAAAAAA', repeat('a2', 32))
$$, 'P0001', 'not authorized',
  'même appelée, la RPC refuse un appelant qui n''est pas service_role');
select throws_ok($$
  select public.loyalty_referral_credit(
    'fa000000-0000-4000-8000-00000000a001', 'fa000000-0000-4000-8000-000000000002', 5000)
$$, 'P0001', 'not authorized',
  'le helper de crédit refuse lui aussi un appelant non service_role');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Un jeton mal formé est refusé avant toute lecture.
select throws_ok($$
  select public.validate_loyalty_referral(
    'fa000000-0000-4000-8000-000000000002', 'PASS-AAAAAAAA', 'pas-un-hash')
$$, 'P0001', 'invalid member token',
  'un jeton de passeport mal formé est refusé');

-- ── Les colonnes neuves : lisibles ET modifiables par le commerçant ──
-- C'est la classe de panne qui a coûté six lots à ce dépôt.
select ok(has_column_privilege(
    'authenticated', 'public.loyalty_programs', 'referral_enabled', 'SELECT'),
  'le commerçant peut LIRE l''activation du parrainage');
select ok(has_column_privilege(
    'authenticated', 'public.loyalty_programs', 'referral_enabled', 'UPDATE'),
  'le commerçant peut ACTIVER le parrainage (sinon le panneau enregistre dans le vide)');
select ok(has_column_privilege(
    'authenticated', 'public.loyalty_programs', 'referral_sponsor_points', 'UPDATE'),
  'le commerçant peut régler les points du parrain');
select ok(has_column_privilege(
    'authenticated', 'public.loyalty_programs', 'referral_filleul_points', 'UPDATE'),
  'le commerçant peut régler le bonus de bienvenue');
select ok(has_column_privilege(
    'authenticated', 'public.loyalty_programs', 'referral_max_filleuls', 'UPDATE'),
  'le commerçant peut régler le plafond de filleuls');
select ok(has_column_privilege(
    'authenticated', 'public.loyalty_programs', 'referral_window_days', 'UPDATE'),
  'le commerçant peut régler la fenêtre de validité');

-- CONTRÔLE NÉGATIF : ce fichier touche aux grants de colonnes de
-- loyalty_programs, et une liste de grants se manipule mal.
select ok(not has_column_privilege(
    'authenticated', 'public.loyalty_programs', 'rotating_secret', 'SELECT'),
  'le secret du code tournant reste fermé — les grants voisins n''ont pas bougé');

-- Les tables : lecture d'équipe, écriture RPC-only, rien pour anon.
select ok(has_table_privilege(
    'authenticated', 'public.loyalty_referral_signups', 'SELECT'),
  'le commerçant lit ses parrainages (statistiques, caisse)');
select ok(not has_table_privilege(
    'authenticated', 'public.loyalty_referral_signups', 'INSERT'),
  'le commerçant ne peut pas se fabriquer un filleul');
select ok(not has_table_privilege(
    'authenticated', 'public.loyalty_referral_sponsors', 'UPDATE'),
  'le commerçant ne peut pas gonfler le compteur de filleuls d''un parrain');
select ok(not has_table_privilege('anon', 'public.loyalty_referral_sponsors', 'SELECT'),
  'anon ne peut pas énumérer les codes de parrainage');
select ok(not has_table_privilege('anon', 'public.loyalty_referral_signups', 'SELECT'),
  'anon ne peut pas énumérer les parrainages');

-- RLS active sur les deux tables neuves.
select ok((select relrowsecurity from pg_class
             where oid = 'public.loyalty_referral_sponsors'::regclass),
  'loyalty_referral_sponsors tourne avec RLS');
select ok((select relrowsecurity from pg_class
             where oid = 'public.loyalty_referral_signups'::regclass),
  'loyalty_referral_signups tourne avec RLS');

select * from finish();
rollback;
