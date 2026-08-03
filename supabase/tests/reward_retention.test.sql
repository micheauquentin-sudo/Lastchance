-- ============================================================
-- Rétention du registre universel — purge_expired_reward_issuances
--
-- Ce que ces tests établissent, par ordre d'importance :
--   1. un lot ENCORE ENCAISSABLE n'est JAMAIS supprimé, si vieux soit-il —
--      c'est la réserve qui empêche une purge de confidentialité de devenir
--      une perte de valeur pour le client qui détient le code ;
--   2. un lot TERMINÉ (remis, annulé, expiré) au-delà de la rétention part ;
--   3. une annulation dont la cause est la RÉTENTION elle-même n'est terminée
--      qu'au bout du délai de grâce (20260903120000) : elle n'est plus
--      encaissable, elle EXPLIQUE — et une explication a une échéance ;
--   4. la fenêtre est bien celle de l'organisation, pas une constante ;
--   5. la fonction est fermée à tout rôle sauf `service_role`.
--
-- Contexte : `reward_issuances` n'avait NI purge NI propagation de
-- suppression (triggers de miroir `after insert or update` seulement,
-- `source_id` polymorphe sans FK). Après la purge RGPD d'un module, le
-- registre gardait code, libellé, panier et identifiant du caissier.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures : deux organisations, rétentions différentes ────
insert into public.organizations (id, name, slug, data_retention_months)
values
  ('f0000000-0000-4000-8000-000000000001', 'Org Retention 6', 'tap-ret-6', 6),
  -- Sans rétention déclarée : repli à 13 mois, PAS d'exemption.
  ('f0000000-0000-4000-8000-000000000002', 'Org Sans Retention', 'tap-ret-null', null);

-- ── 1. ACL ───────────────────────────────────────────────────
select ok(
  not has_function_privilege('authenticated',
    'public.purge_expired_reward_issuances()', 'execute'),
  'un utilisateur authentifié ne peut pas déclencher la purge du registre'
);
select ok(
  not has_function_privilege('anon',
    'public.purge_expired_reward_issuances()', 'execute'),
  'anon non plus'
);

-- ── Lignes de registre, toutes ANCIENNES (2 ans) ─────────────
-- L'âge seul ne doit jamais suffire à supprimer.
insert into public.reward_issuances
  (id, organization_id, source_type, source_id, code, label, issued_at,
   expires_at, redeemed_at, cancelled_at)
values
  -- (a) ENCAISSABLE : ni remis, ni annulé, ni expiré → doit SURVIVRE.
  ('f0000000-0000-4000-8000-0000000000a1',
   'f0000000-0000-4000-8000-000000000001', 'wheel',
   'f0000000-0000-4000-8000-0000000000b1', 'GAIN-AAAA2345', 'Lot encaissable',
   pg_catalog.now() - interval '2 years', null, null, null),

  -- (b) REMIS il y a 2 ans → purgeable.
  ('f0000000-0000-4000-8000-0000000000a2',
   'f0000000-0000-4000-8000-000000000001', 'wheel',
   'f0000000-0000-4000-8000-0000000000b2', 'GAIN-BBBB2345', 'Lot remis',
   pg_catalog.now() - interval '2 years', null,
   pg_catalog.now() - interval '2 years', null),

  -- (c) ANNULÉ → purgeable.
  ('f0000000-0000-4000-8000-0000000000a3',
   'f0000000-0000-4000-8000-000000000001', 'hunt',
   'f0000000-0000-4000-8000-0000000000b3', 'CHASSE-CCCC2345', 'Lot annulé',
   pg_catalog.now() - interval '2 years', null, null,
   pg_catalog.now() - interval '2 years'),

  -- (d) EXPIRÉ → purgeable.
  ('f0000000-0000-4000-8000-0000000000a4',
   'f0000000-0000-4000-8000-000000000001', 'quiz',
   'f0000000-0000-4000-8000-0000000000b4', 'QUIZ-DDDD2345', 'Lot expiré',
   pg_catalog.now() - interval '2 years',
   pg_catalog.now() - interval '1 year', null, null),

  -- (e) REMIS mais RÉCENT (1 mois) → dans la fenêtre, doit SURVIVRE.
  ('f0000000-0000-4000-8000-0000000000a5',
   'f0000000-0000-4000-8000-000000000001', 'wheel',
   'f0000000-0000-4000-8000-0000000000b5', 'GAIN-EEEE2345', 'Lot remis récent',
   pg_catalog.now() - interval '1 month', null,
   pg_catalog.now() - interval '1 month', null),

  -- (f) Organisation SANS rétention déclarée, remis il y a 2 ans : le repli
  --     de 13 mois s'applique quand même → purgeable. Une organisation qui
  --     n'a rien déclaré ne doit pas conserver indéfiniment.
  ('f0000000-0000-4000-8000-0000000000a6',
   'f0000000-0000-4000-8000-000000000002', 'wheel',
   'f0000000-0000-4000-8000-0000000000b6', 'GAIN-FFFF2345', 'Lot org sans rétention',
   pg_catalog.now() - interval '2 years', null,
   pg_catalog.now() - interval '2 years', null);

-- ── (g) et (h) : le délai de grâce de l'EXPLICATION (20260903120000) ──
-- Les deux lignes sont IDENTIQUES sauf sur l'âge de l'annulation. C'est la
-- seule construction qui prouve que le délai est ce qui décide : si l'une des
-- deux survivait pour une autre raison (âge d'émission, expiration, motif),
-- l'autre survivrait aussi.
--
-- Famille `hunt` et `expires_at` NUL des deux côtés, délibérément : c'est le
-- cas réel des sept familles pour lesquelles `sync_reward_issuance` écrit
-- `null::timestamptz as expires_at`, donc le seul où la grâce décide de quoi
-- que ce soit. Sur `wheel` avec une échéance passée, la troisième branche du
-- prédicat emporterait la ligne sans jamais consulter la grâce, et ces deux
-- assertions ne mesureraient rien.
insert into public.reward_issuances
  (id, organization_id, source_type, source_id, code, label, issued_at,
   expires_at, redeemed_at, cancelled_at, cancelled_reason)
values
  -- (g) Annulée par la rétention il y a UN mois : dans la grâce → SURVIT.
  ('f0000000-0000-4000-8000-0000000000a7',
   'f0000000-0000-4000-8000-000000000001', 'hunt',
   'f0000000-0000-4000-8000-0000000000b7', 'CHASSE-GGGG2345', 'Explication récente',
   pg_catalog.now() - interval '2 years', null, null,
   pg_catalog.now() - interval '1 month', 'source purgée'),

  -- (h) Annulée par la rétention il y a QUATRE mois : grâce écoulée → PURGÉE.
  ('f0000000-0000-4000-8000-0000000000a8',
   'f0000000-0000-4000-8000-000000000001', 'loyalty',
   'f0000000-0000-4000-8000-0000000000b8', 'FIDELITE-HHHH2345', 'Explication périmée',
   pg_catalog.now() - interval '2 years', null, null,
   pg_catalog.now() - interval '4 months', 'source purgée');

select is(
  (select count(*)::int from public.reward_issuances
    where organization_id in (
      'f0000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000002')),
  8,
  'point de départ : huit lignes de registre'
);

-- ── 2. La purge ──────────────────────────────────────────────
select is(
  public.purge_expired_reward_issuances(),
  5::bigint,
  'cinq lignes purgées : remise, annulée, expirée, celle de l''organisation sans rétention déclarée, et l''explication dont la grâce est écoulée'
);

-- ── 3. LA RÉSERVE : l'encaissable a survécu ──────────────────
-- C'est l'assertion la plus importante du fichier. Supprimer ce lot ferait
-- dire « code introuvable » à un caissier tenant un code valide.
select is(
  (select count(*)::int from public.reward_issuances
    where id = 'f0000000-0000-4000-8000-0000000000a1'),
  1,
  'un lot ENCORE ENCAISSABLE survit à sa rétention — la purge ne détruit pas de la valeur'
);

select is(
  (select count(*)::int from public.reward_issuances
    where id = 'f0000000-0000-4000-8000-0000000000a5'),
  1,
  'un lot remis mais RÉCENT survit : la fenêtre de l''organisation est respectée'
);

-- ── 3bis. Le délai de grâce décide, et lui seul ──────────────
-- Le trou fermé le 2026-08-03 reste fermé : une ligne annulée parce que la
-- rétention a emporté sa source n'est PAS détruite au passage suivant du cron.
-- Elle ne peut plus être encaissée — `routeRedeemCode` ne trouve plus la table
-- parente — mais elle explique encore au client et au caissier ce qui s'est
-- passé, et c'est cela qui est protégé.
select is(
  (select count(*)::int from public.reward_issuances
    where id = 'f0000000-0000-4000-8000-0000000000a7'),
  1,
  'une annulation par la rétention SURVIT tant que la grâce court : le client lit encore pourquoi'
);

-- Et l'explication finit par se taire. Sans cette assertion, la clause de
-- 20260902120000 conserverait sans fin une ligne porteuse d'un `player_id`
-- pour ces sept familles, qui n'ont aucune échéance.
select is(
  (select count(*)::int from public.reward_issuances
    where id = 'f0000000-0000-4000-8000-0000000000a8'),
  0,
  'passé la grâce, l''explication est supprimée : rien ne conserve indéfiniment une ligne rattachable à une personne'
);

select is(
  (select count(*)::int from public.reward_issuances
    where organization_id = 'f0000000-0000-4000-8000-000000000001'),
  3,
  'il ne reste que l''encaissable, le récent, et l''explication encore en grâce'
);

select is(
  (select count(*)::int from public.reward_issuances
    where organization_id = 'f0000000-0000-4000-8000-000000000002'),
  0,
  'une organisation SANS rétention déclarée n''est pas exemptée (repli 13 mois)'
);

-- ── 4. Idempotence ───────────────────────────────────────────
select is(
  public.purge_expired_reward_issuances(),
  0::bigint,
  'un second passage ne supprime plus rien'
);

select * from finish();
rollback;
