-- ============================================================
-- Rétention du registre universel — purge_expired_reward_issuances
--
-- Ce que ces tests établissent, par ordre d'importance :
--   1. un lot ENCORE ENCAISSABLE n'est JAMAIS supprimé, si vieux soit-il —
--      c'est la réserve qui empêche une purge de confidentialité de devenir
--      une perte de valeur pour le client qui détient le code ;
--   2. un lot TERMINÉ (remis, annulé PAR DÉCISION, expiré) au-delà de la
--      rétention part ;
--   3. une annulation tombée en COLLATÉRAL — la rétention a emporté la source
--      (`purged`), ou le commerçant a supprimé le jeu (`source_deleted`) — n'est
--      terminée qu'au bout du délai de grâce (20260903120000) : elle n'est plus
--      encaissable, elle EXPLIQUE, et une explication a une échéance ;
--   4. cette grâce est BORNÉE par la fenêtre de l'organisation, jamais un
--      forfait de trois mois opposable à qui a déclaré moins ;
--   5. un motif FORGÉ par le commerçant dans `cancelled_reason` n'achète
--      aucune grâce — la cause vit dans `cancelled_source`, colonne
--      qu'aucune écriture legacy ne peut atteindre ;
--   6. la fenêtre est bien celle de l'organisation, pas une constante ;
--   7. la fonction est fermée à tout rôle sauf `service_role`.
--
-- Contexte : `reward_issuances` n'avait NI purge NI propagation de
-- suppression (triggers de miroir `after insert or update` seulement,
-- `source_id` polymorphe sans FK). Après la purge RGPD d'un module, le
-- registre gardait code, libellé, panier et identifiant du caissier.
-- ============================================================
-- Plan CHIFFRÉ et non `no_plan()` : un fichier qui MEURT avant `finish()` rend
-- « aucun plan trouvé », ce que rien ne distingue d'un succès. C'est la règle
-- que son voisin `reward_source_deletion.test.sql` énonce dans son en-tête et
-- que ce fichier-ci n'appliquait pas — FAIBLE 2 de la revue du 2026-08-03,
-- d'autant plus gênant que la preuve de la grâce vit ICI.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures : trois organisations, rétentions différentes ───
insert into public.organizations (id, name, slug, data_retention_months)
values
  ('f0000000-0000-4000-8000-000000000001', 'Org Retention 6', 'tap-ret-6', 6),
  -- Sans rétention déclarée : repli à 13 mois, PAS d'exemption.
  ('f0000000-0000-4000-8000-000000000002', 'Org Sans Retention', 'tap-ret-null', null),
  -- Le PLANCHER RÉEL, côté serveur : `privacy.ts:5` valide `min(1).max(60)` et
  -- le CHECK `00016:15` accepte `between 1 and 60`. Le `<select>` à 12/24/36
  -- mois de `data-retention-form.tsx` est du CLIENT et ne borne rien.
  ('f0000000-0000-4000-8000-000000000003', 'Org Retention 1', 'tap-ret-1', 1);

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

  -- (c) ANNULÉ sans cause enregistrée → repli `merchant`, purgeable. C'est le
  --     cas des annulations ANTÉRIEURES à `cancelled_source` : on les traite
  --     comme des décisions, le sens qui n'accorde aucune faveur.
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

-- ── (g) à (l) : le délai de grâce de l'EXPLICATION (20260903120000) ──
-- Les paires sont IDENTIQUES sauf sur l'unique variable qu'elles isolent.
-- C'est la seule construction qui prouve que le délai décide : si l'une des
-- deux survivait pour une autre raison (âge d'émission, expiration, cause),
-- l'autre survivrait aussi.
--
-- Famille `hunt`/`loyalty` et `expires_at` NUL partout, délibérément : c'est le
-- cas réel des sept familles pour lesquelles `sync_reward_issuance` écrit
-- `null::timestamptz as expires_at`, donc le seul où la grâce décide de quoi
-- que ce soit. Sur `wheel` avec une échéance passée, la troisième branche du
-- prédicat emporterait la ligne sans jamais consulter la grâce.
insert into public.reward_issuances
  (id, organization_id, source_type, source_id, code, label, issued_at,
   expires_at, redeemed_at, cancelled_at, cancelled_reason, cancelled_source)
values
  -- (g) Rétention, il y a UN mois. Org à 6 mois → grâce = least(3, 6) = 3 mois.
  --     Dans la grâce → SURVIT.
  ('f0000000-0000-4000-8000-0000000000a7',
   'f0000000-0000-4000-8000-000000000001', 'hunt',
   'f0000000-0000-4000-8000-0000000000b7', 'CHASSE-GGGG2345', 'Explication récente',
   pg_catalog.now() - interval '2 years', null, null,
   pg_catalog.now() - interval '1 month', 'source purgée', 'purged'),

  -- (h) Rétention, il y a QUATRE mois : grâce écoulée → PURGÉE.
  ('f0000000-0000-4000-8000-0000000000a8',
   'f0000000-0000-4000-8000-000000000001', 'loyalty',
   'f0000000-0000-4000-8000-0000000000b8', 'FIDELITE-HHHH2345', 'Explication périmée',
   pg_catalog.now() - interval '2 years', null, null,
   pg_catalog.now() - interval '4 months', 'source purgée', 'purged'),

  -- (i) MOYEN 3 : le commerçant a supprimé le JEU il y a un mois. Le client
  --     détenait un code d'une famille sans échéance, personne n'a statué sur
  --     SON lot — même grâce que (g). Avant 20260903120000 cette ligne était
  --     détruite au premier passage du cron.
  ('f0000000-0000-4000-8000-0000000000a9',
   'f0000000-0000-4000-8000-000000000001', 'hunt',
   'f0000000-0000-4000-8000-0000000000b9', 'CHASSE-IIII2345', 'Jeu supprimé, récent',
   pg_catalog.now() - interval '2 years', null, null,
   pg_catalog.now() - interval '1 month', 'source supprimée', 'source_deleted'),

  -- (j) MOYEN 1 : motif FORGÉ. Le commerçant a annulé ce lot lui-même et a
  --     saisi « source purgée » comme motif — 13 caractères, le seuil de
  --     `cancel_participation` est franchi ; ou bien il a posté un PATCH direct
  --     sur `participations`. `cancelled_source` reste NULLE : le miroir ne la
  --     nomme jamais. Repli `merchant` → AUCUNE grâce → PURGÉE.
  ('f0000000-0000-4000-8000-0000000000aa',
   'f0000000-0000-4000-8000-000000000001', 'wheel',
   'f0000000-0000-4000-8000-0000000000ba', 'GAIN-JJJJ2345', 'Motif forgé',
   pg_catalog.now() - interval '2 years', null, null,
   pg_catalog.now() - interval '1 month', 'source purgée', null),

  -- (k) MOYEN 2 : org à 1 mois de rétention, annulée en collatéral il y a DEUX
  --     mois. Grâce = least(3 mois, 1 mois) = 1 mois → écoulée → PURGÉE.
  --     Sous le forfait de trois mois de la première rédaction, cette ligne
  --     survivait : l'explication aurait vécu le TRIPLE de la fenêtre déclarée.
  ('f0000000-0000-4000-8000-0000000000ab',
   'f0000000-0000-4000-8000-000000000003', 'hunt',
   'f0000000-0000-4000-8000-0000000000bb', 'CHASSE-KKKK2345', 'Grâce bornée',
   pg_catalog.now() - interval '2 years', null, null,
   pg_catalog.now() - interval '2 months', 'source purgée', 'purged'),

  -- (l) Jumelle de (k), annulée il y a DIX JOURS : dans la grâce d'un mois →
  --     SURVIT. Sans elle, (k) ne distinguerait pas « la grâce est bornée » de
  --     « cette organisation n'a jamais eu de grâce ».
  ('f0000000-0000-4000-8000-0000000000ac',
   'f0000000-0000-4000-8000-000000000003', 'hunt',
   'f0000000-0000-4000-8000-0000000000bc', 'CHASSE-LLLL2345', 'Grâce bornée, en cours',
   pg_catalog.now() - interval '2 years', null, null,
   pg_catalog.now() - interval '10 days', 'source purgée', 'purged');

select is(
  (select count(*)::int from public.reward_issuances
    where organization_id in (
      'f0000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000002',
      'f0000000-0000-4000-8000-000000000003')),
  12,
  'point de départ : douze lignes de registre'
);

-- ── 2. La purge ──────────────────────────────────────────────
-- La VALEUR DE RETOUR n'est délibérément pas assertée, et c'est le second point
-- de FAIBLE 2. `purge_expired_reward_issuances()` compte GLOBALEMENT, toutes
-- organisations confondues : l'ancienne assertion `is(purge(), 5::bigint)` ne
-- passait que parce que rien d'assez vieux ne traînait dans le seed. Une seule
-- ligne terminale et ancienne ajoutée au seed la rendait rouge, avec un message
-- ne nommant aucune cause — sur le fichier qui porte la preuve de la grâce.
-- Tout ce qui suit est mesuré PAR ORGANISATION, donc insensible au voisinage.
select lives_ok(
  $$select public.purge_expired_reward_issuances()$$,
  'la purge du registre s''exécute'
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

select is(
  (select count(*)::int from public.reward_issuances
    where id = 'f0000000-0000-4000-8000-0000000000a3'),
  0,
  'une annulation SANS cause enregistrée est traitée comme une décision : purgée'
);

-- ── 4. La grâce décide, et lui seul ──────────────────────────
-- Le trou fermé le 2026-08-03 reste fermé : une ligne annulée en collatéral
-- n'est PAS détruite au passage suivant du cron. Elle ne peut plus être
-- encaissée — `routeRedeemCode` ne trouve plus la table parente — mais elle
-- explique encore au client et au caissier ce qui s'est passé.
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

-- MOYEN 3 : la grâce va au COLLATÉRAL, pas seulement à la rétention. Un client
-- dont le commerçant a supprimé le jeu a lui aussi besoin de lire pourquoi —
-- et il a même quelqu'un à qui le demander.
select is(
  (select count(*)::int from public.reward_issuances
    where id = 'f0000000-0000-4000-8000-0000000000a9'),
  1,
  'un lot annulé parce que le JEU a été supprimé reçoit la même grâce que la rétention'
);

-- ── 5. MOYEN 1 : le texte libre n'achète plus rien ───────────
select is(
  (select count(*)::int from public.reward_issuances
    where id = 'f0000000-0000-4000-8000-0000000000aa'),
  0,
  'un motif FORGÉ (« source purgée » saisi au formulaire) n''obtient aucune grâce : la cause vit dans cancelled_source'
);

-- ── 6. MOYEN 2 : la grâce ne dépasse jamais la rétention ─────
select is(
  (select count(*)::int from public.reward_issuances
    where id = 'f0000000-0000-4000-8000-0000000000ab'),
  0,
  'org à 1 mois : la grâce vaut UN mois, pas trois — l''explication ne survit pas à la fenêtre déclarée'
);

select is(
  (select count(*)::int from public.reward_issuances
    where id = 'f0000000-0000-4000-8000-0000000000ac'),
  1,
  'sa jumelle à dix jours survit : c''est bien la grâce bornée qui a tranché, pas l''absence de grâce'
);

-- ── 7. Les comptes par organisation ──────────────────────────
select is(
  (select count(*)::int from public.reward_issuances
    where organization_id = 'f0000000-0000-4000-8000-000000000001'),
  4,
  'org à 6 mois : restent l''encaissable, le récent, et les deux explications en grâce'
);

select is(
  (select count(*)::int from public.reward_issuances
    where organization_id = 'f0000000-0000-4000-8000-000000000002'),
  0,
  'une organisation SANS rétention déclarée n''est pas exemptée (repli 13 mois)'
);

select is(
  (select count(*)::int from public.reward_issuances
    where organization_id = 'f0000000-0000-4000-8000-000000000003'),
  1,
  'org à 1 mois : seule l''explication de dix jours subsiste'
);

-- ── 8. Idempotence, mesurée par organisation ─────────────────
-- Même raison qu'en section 2 : un second passage peut légitimement supprimer
-- des lignes d'un seed voisin. Ce qui doit être vrai ici, c'est que rien de CE
-- fichier ne bouge plus.
select lives_ok(
  $$select public.purge_expired_reward_issuances()$$,
  'un second passage s''exécute'
);

select is(
  (select count(*)::int from public.reward_issuances
    where organization_id in (
      'f0000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000002',
      'f0000000-0000-4000-8000-000000000003')),
  5,
  'un second passage ne supprime plus rien : la purge est idempotente'
);

select * from finish();
rollback;
