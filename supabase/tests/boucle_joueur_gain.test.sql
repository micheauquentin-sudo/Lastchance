-- ============================================================
-- LA BOUCLE JOUEUR → GAIN (20260927120000) — JOU-1 et JOB-8
--
-- Ce que ce fichier doit prouver, par ordre d'importance :
--
--   1. QU'UN GAIN NON RÉCLAMÉ SE REPREND DANS TOUTE LA FENÊTRE. C'est JOU-1 :
--      la borne de 30 minutes faisait perdre un lot DÉJÀ décompté du stock.
--      L'assertion (a) porte donc sur un spin de 35 minutes — hors de l'ancienne
--      borne, dans la fenêtre courante — et une assertion de CONTRÔLE établit
--      que la fixture est bien au-delà de 30 minutes, sinon (a) verdirait pour
--      la mauvaise raison.
--   2. QUE LA FENÊTRE BORNE VRAIMENT. Un correctif qui rendrait « le dernier
--      gain non réclamé » sans regarder la fenêtre passerait (a) et serait faux :
--      (b) et (e) sont les négatifs qui l'en distinguent.
--   3. QUE LES TOURS OFFERTS NE SONT PAS PERDUS. La seconde branche du prédicat
--      (clé de fenêtre ABSENTE, created_at dans la fenêtre) existe pour le
--      PARRAINAGE, seul moteur de tour offert qui écrit sous la clé joueur de la
--      roue ET sans clé de fenêtre. Un filtre par clé seule aurait fermé JOU-1
--      en ouvrant une régression invisible : (d) la garde, (e) l'empêche d'être
--      satisfaite en laissant simplement tomber la borne.
--   4. QU'UN NONCE SE CONSOMME UNE FOIS, ET N'APPARTIENNE QU'À SON JOUEUR.
--      JOB-8 : même clé → même spin_id, un seul spin, stock décrémenté UNE fois ;
--      sans clé, rien ne change ; et le nonce d'AUTRUI ne rend pas son spin
--      (revue sécurité MOYEN-1 : le lookup de rejeu est borné à roue +
--      player_key, sans quoi la RPC rendrait le spin_id d'un autre joueur —
--      celui-là même que le serveur signe en jeton de retrait).
--   5. QUE LA CHAÎNE DE RESSOURCES EST RELUE PAR LA REPRISE (MOYEN-3), au même
--      titre que par le moteur. La FK la rendant inviolable en production, cette
--      assertion la démonte le temps de la transaction : c'est le seul moyen
--      qu'une défense en profondeur ne se fasse pas « simplifier ».
--   6. QUE LES DEUX PORTES SONT FERMÉES : service_role seul, et une SEULE
--      surcharge de perform_atomic_spin — deux la rendraient inappelable
--      (« function is not unique »), ce qu'aucune assertion d'ACL ne verrait.
--
-- ── DÉTERMINISME DES FIXTURES : PENSÉ AVANT D'ÊTRE ÉCRIT ──
--
-- Aucune assertion ne dépend de l'heure à laquelle la CI tourne, et cela a
-- dicté le choix des roues :
--   • les cas à clé de fenêtre (a, b) filtrent sur la CLÉ, jamais sur
--     `created_at` : la fixture la calcule par la même expression que le
--     moteur, l'égalité tient donc à toute heure ;
--   • le cas « tour offert dans la fenêtre » (d) passe par une roue `once`,
--     dont la fenêtre commence à l'EPOCH : « dans la fenêtre » y est vrai
--     toujours. Sur une roue `weekly`, un spin de 35 minutes tomberait dans la
--     semaine PRÉCÉDENTE si la CI tournait un lundi à 00h20 — un rouge une fois
--     sur trois cents, irreproductible ;
--   • le négatif (e) est à 9 jours : toujours antérieur au début de la semaine
--     courante, qui est au plus à 7 jours ;
--   • les appels d'idempotence sont des instructions SÉPARÉES, jamais deux
--     sous-requêtes du même `select`. L'ordre d'évaluation de deux fonctions
--     volatiles dans une seule instruction n'est pas garanti, et une comparaison
--     qui en dépend teste le planificateur autant que le correctif.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
-- Plan CHIFFRÉ : ce fichier appelle des RPC qui lèvent (chaîne de ressources,
-- clé joueur) et pose des fixtures sous contraintes. Sans plan, un fichier
-- interrompu au milieu annonce « All N subtests passed » pour les seules
-- assertions jouées.
select plan(28);

-- Fixtures sans JWT marchand : les gardes de publication ne sont armées que
-- pour `auth.role() = 'authenticated'`.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ════════════════════════════════════════════════════════════
-- FIXTURES
-- ════════════════════════════════════════════════════════════
-- Fuseau EXPLICITE : c'est lui qui décide des frontières de fenêtre, et le
-- laisser au défaut ferait dépendre ce fichier d'un défaut de colonne.
insert into public.organizations (id, name, slug, timezone)
values ('f0b00000-0000-4000-8000-000000000001', 'Test Boucle', 'tap-boucle',
        'Europe/Paris');

insert into public.campaigns (id, organization_id, name, status, code_ttl_seconds)
values ('f0b00000-0000-4000-8000-000000000002',
        'f0b00000-0000-4000-8000-000000000001', 'Campagne Boucle', 'active', 300);

-- Roue W : play_limit 'weekly' — porte les cas à clé de fenêtre (a, b, e).
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('f0b00000-0000-4000-8000-000000000003',
        'f0b00000-0000-4000-8000-000000000001',
        'f0b00000-0000-4000-8000-000000000002', 'Roue hebdo TAP', 'weekly');

-- Roue O : play_limit 'once' — fenêtre depuis l'EPOCH, d'où le déterminisme du
-- cas « tour offert sans clé de fenêtre » (d).
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('f0b00000-0000-4000-8000-000000000004',
        'f0b00000-0000-4000-8000-000000000001',
        'f0b00000-0000-4000-8000-000000000002', 'Roue unique TAP', 'once');

-- Roue U : play_limit 'unlimited' — reprise sans borne (c) et idempotence
-- (f à i) : la garde de limite ne doit jamais masquer ce qu'on mesure.
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('f0b00000-0000-4000-8000-000000000005',
        'f0b00000-0000-4000-8000-000000000001',
        'f0b00000-0000-4000-8000-000000000002', 'Roue libre TAP', 'unlimited');

-- Un SEUL lot gagnant par roue, à stock fini : le tirage devient déterministe
-- et le stock devient une preuve comptable.
insert into public.prizes (id, organization_id, wheel_id, label, stock, weight, is_active, is_losing)
values
  ('f0b00000-0000-4000-8000-000000000010', 'f0b00000-0000-4000-8000-000000000001',
   'f0b00000-0000-4000-8000-000000000003', 'Lot hebdo TAP', 5, 100, true, false),
  ('f0b00000-0000-4000-8000-000000000011', 'f0b00000-0000-4000-8000-000000000001',
   'f0b00000-0000-4000-8000-000000000004', 'Lot unique TAP', 5, 100, true, false),
  ('f0b00000-0000-4000-8000-000000000012', 'f0b00000-0000-4000-8000-000000000001',
   'f0b00000-0000-4000-8000-000000000005', 'Lot libre TAP', 10, 100, true, false);

-- ── Le schéma porte bien la clé d'idempotence ────────────────
select has_column('public', 'spins', 'idempotency_key',
  'spins porte la clé d''idempotence (JOB-8)');

-- `spins_idempotency_key_org_idx` depuis 20261214120000 (JOB-9) : l'index
-- porte désormais `(idempotency_key, organization_id)`. Ce qu'il garde ici est
-- inchangé — unique et partiel ; ce qu'il ne garde plus, l'unicité ENTRE
-- commerces, est la propriété que `nonce_par_tenant_et_bornes_stock.test.sql`
-- reprend en entier.
select ok(
  (select i.indisunique
     from pg_catalog.pg_class c
     join pg_catalog.pg_index i on i.indexrelid = c.oid
    where c.relname = 'spins_idempotency_key_org_idx'),
  'la clé d''idempotence est gardée par un index UNIQUE'
);

select ok(
  (select i.indpred is not null
     from pg_catalog.pg_class c
     join pg_catalog.pg_index i on i.indexrelid = c.oid
    where c.relname = 'spins_idempotency_key_org_idx'),
  'l''index est PARTIEL : les spins sans nonce n''y pèsent pas'
);

-- ════════════════════════════════════════════════════════════
-- (a) JOU-1 · 35 MINUTES, DANS LA FENÊTRE COURANTE → REPRIS
-- ════════════════════════════════════════════════════════════
-- Le trou historique tient dans un seul spin : gagnant, non réclamé, hors de la
-- borne de 30 minutes, et dans la semaine courante par sa CLÉ — celle que le
-- moteur aurait écrite, calculée ici par la même expression.
insert into public.spins (
  id, organization_id, campaign_id, wheel_id, prize_id, is_losing,
  player_key, claimed, play_window_key, created_at
)
values (
  'f0b00000-0000-4000-8000-000000000020',
  'f0b00000-0000-4000-8000-000000000001',
  'f0b00000-0000-4000-8000-000000000002',
  'f0b00000-0000-4000-8000-000000000003',
  'f0b00000-0000-4000-8000-000000000010', false,
  repeat('a', 64), false,
  'week:' || to_char(now() at time zone 'Europe/Paris', 'IYYY-IW'),
  now() - interval '35 minutes'
);

-- CONTRÔLE de la fixture : sans lui, (a) pourrait verdir sur un spin récent et
-- ne rien dire de l'ancienne borne.
select cmp_ok(
  (select created_at from public.spins
    where id = 'f0b00000-0000-4000-8000-000000000020'),
  '<', now() - interval '30 minutes',
  'la fixture est bien HORS de l''ancienne borne de 30 minutes'
);

select is(
  (select spin_id from public.recover_pending_spin(
     'f0b00000-0000-4000-8000-000000000003', repeat('a', 64))),
  'f0b00000-0000-4000-8000-000000000020'::uuid,
  'JOU-1 : un gain de 35 min dans la fenêtre weekly courante est REPRIS'
);

select is(
  (select prize_id from public.recover_pending_spin(
     'f0b00000-0000-4000-8000-000000000003', repeat('a', 64))),
  'f0b00000-0000-4000-8000-000000000010'::uuid,
  'la reprise rend le LOT du spin, pas seulement son id'
);

-- ════════════════════════════════════════════════════════════
-- (b) LA FENÊTRE PRÉCÉDENTE N'EST PAS REPRISE
-- ════════════════════════════════════════════════════════════
-- Même roue, autre joueur : son unique gain non réclamé porte la clé de la
-- semaine d'AVANT.
insert into public.spins (
  id, organization_id, campaign_id, wheel_id, prize_id, is_losing,
  player_key, claimed, play_window_key, created_at
)
values (
  'f0b00000-0000-4000-8000-000000000021',
  'f0b00000-0000-4000-8000-000000000001',
  'f0b00000-0000-4000-8000-000000000002',
  'f0b00000-0000-4000-8000-000000000003',
  'f0b00000-0000-4000-8000-000000000010', false,
  repeat('b', 64), false,
  'week:' || to_char(now() at time zone 'Europe/Paris' - interval '7 days', 'IYYY-IW'),
  now() - interval '8 days'
);

select is(
  (select count(*)::int from public.recover_pending_spin(
     'f0b00000-0000-4000-8000-000000000003', repeat('b', 64))),
  0,
  'un gain de la fenêtre PRÉCÉDENTE n''est pas repris'
);

-- ════════════════════════════════════════════════════════════
-- (c) `unlimited` · LE PLUS RÉCENT NON RÉCLAMÉ, SANS BORNE
-- ════════════════════════════════════════════════════════════
-- Trois lignes pour un seul joueur : un gain de 3 jours non réclamé, un gain
-- plus récent DÉJÀ réclamé, et une perte plus récente encore. Rendre le premier
-- prouve du même geste qu'aucune borne d'âge ne s'applique et que `claimed` et
-- `is_losing` filtrent.
insert into public.spins (
  id, organization_id, campaign_id, wheel_id, prize_id, is_losing,
  player_key, claimed, play_window_key, created_at
)
values
  ('f0b00000-0000-4000-8000-000000000030', 'f0b00000-0000-4000-8000-000000000001',
   'f0b00000-0000-4000-8000-000000000002', 'f0b00000-0000-4000-8000-000000000005',
   'f0b00000-0000-4000-8000-000000000012', false, repeat('c', 64), false, null,
   now() - interval '3 days'),
  ('f0b00000-0000-4000-8000-000000000031', 'f0b00000-0000-4000-8000-000000000001',
   'f0b00000-0000-4000-8000-000000000002', 'f0b00000-0000-4000-8000-000000000005',
   'f0b00000-0000-4000-8000-000000000012', false, repeat('c', 64), true, null,
   now() - interval '2 hours'),
  ('f0b00000-0000-4000-8000-000000000032', 'f0b00000-0000-4000-8000-000000000001',
   'f0b00000-0000-4000-8000-000000000002', 'f0b00000-0000-4000-8000-000000000005',
   null, true, repeat('c', 64), false, null,
   now() - interval '1 hour');

select is(
  (select spin_id from public.recover_pending_spin(
     'f0b00000-0000-4000-8000-000000000005', repeat('c', 64))),
  'f0b00000-0000-4000-8000-000000000030'::uuid,
  'unlimited : le gain non réclamé le plus récent est repris SANS borne d''âge'
);

-- ════════════════════════════════════════════════════════════
-- (d) TOUR OFFERT (PARRAINAGE) · CLÉ DE FENÊTRE ABSENTE → REPRIS
-- ════════════════════════════════════════════════════════════
-- Le cas que la seconde branche du prédicat existe pour couvrir. Le parrainage
-- écrit sous `anonymousPlayerKey()` — la clé joueur de la roue — avec
-- `play_window_key` null (20260809120000:222). Roue `once` : la fenêtre part de
-- l'epoch, donc « dans la fenêtre » ne dépend pas de l'heure de la CI.
insert into public.spins (
  id, organization_id, campaign_id, wheel_id, prize_id, is_losing,
  player_key, claimed, play_window_key, source, created_at
)
values (
  'f0b00000-0000-4000-8000-000000000040',
  'f0b00000-0000-4000-8000-000000000001',
  'f0b00000-0000-4000-8000-000000000002',
  'f0b00000-0000-4000-8000-000000000004',
  'f0b00000-0000-4000-8000-000000000011', false,
  repeat('d', 64), false, null, 'referral',
  now() - interval '35 minutes'
);

select is(
  (select spin_id from public.recover_pending_spin(
     'f0b00000-0000-4000-8000-000000000004', repeat('d', 64))),
  'f0b00000-0000-4000-8000-000000000040'::uuid,
  'tour OFFERT (play_window_key null) dans la fenêtre : repris, pas perdu'
);

-- ════════════════════════════════════════════════════════════
-- (e) … MAIS LA BRANCHE SANS CLÉ RESTE BORNÉE PAR LA FENÊTRE
-- ════════════════════════════════════════════════════════════
-- Roue weekly, clé de fenêtre absente, 9 jours : toujours avant le début de la
-- semaine courante. Sans cette assertion, (d) serait satisfaite par un prédicat
-- qui aurait simplement LAISSÉ TOMBER la borne pour les lignes sans clé —
-- c'est-à-dire par une reprise illimitée déguisée.
insert into public.spins (
  id, organization_id, campaign_id, wheel_id, prize_id, is_losing,
  player_key, claimed, play_window_key, source, created_at
)
values (
  'f0b00000-0000-4000-8000-000000000041',
  'f0b00000-0000-4000-8000-000000000001',
  'f0b00000-0000-4000-8000-000000000002',
  'f0b00000-0000-4000-8000-000000000003',
  'f0b00000-0000-4000-8000-000000000010', false,
  repeat('e', 64), false, null, 'referral',
  now() - interval '9 days'
);

select is(
  (select count(*)::int from public.recover_pending_spin(
     'f0b00000-0000-4000-8000-000000000003', repeat('e', 64))),
  0,
  'sans clé de fenêtre, un gain ANTÉRIEUR à la fenêtre reste hors reprise'
);

-- ── Clé joueur malformée : zéro ligne, jamais une exception ───
-- Divergence assumée avec perform_atomic_spin, qui lève : celle-ci LIT, sur un
-- chemin de rattrapage. Une exception y transformerait un cookie douteux en
-- page d'erreur pour un joueur qui a précisément un lot à récupérer.
select is(
  (select count(*)::int from public.recover_pending_spin(
     'f0b00000-0000-4000-8000-000000000003', 'trop-court')),
  0,
  'clé joueur malformée : zéro ligne (un rattrapage ne lève pas)'
);

-- ════════════════════════════════════════════════════════════
-- CHAÎNE DE RESSOURCES ROMPUE → ZÉRO LIGNE (revue sécurité, MOYEN-3)
-- ════════════════════════════════════════════════════════════
-- La reprise revérifie la chaîne roue → campagne → organisation, comme le
-- moteur (20260731120000:118-124) : elle rend un spin_id que le serveur signe
-- en jeton de retrait, elle doit donc lire la même chaîne.
--
-- CETTE FIXTURE DÉMONTE DEUX FK, ET C'EST DÉLIBÉRÉ. En production l'incohérence
-- est IMPOSSIBLE à écrire, et même DEUX FOIS : `wheels_campaign_org_fk`
-- (00017:268) l'interdit côté roue, et `spins_campaign_org_fk` (00017:278) la
-- réimpose côté spin — le premier jet de cette fixture n'en a démonté qu'une et
-- s'est fait refuser par la seconde, ce qui vaut d'être écrit ici. Les deux
-- autres FK composites de `spins` (:280-284) restent en place et satisfaites :
-- elles portent sur le triplet de la roue et sur le lot, que les lignes
-- ci-dessous respectent.
--
-- La jointure `campaigns` de la RPC est donc une défense en profondeur que RIEN
-- ne pourrait éprouver dans un schéma sain. Or une garde que rien n'éprouve se
-- fait « simplifier » : la retirer laisserait toutes les autres assertions
-- vertes. Le seul moyen de la rendre falsifiable est de lever les contraintes le
-- temps de la transaction ; le `rollback` final les restaure, et aucune
-- assertion d'ici à la fin du fichier ne dépend d'elles.
insert into public.organizations (id, name, slug, timezone)
values ('f0b00000-0000-4000-8000-000000000006', 'Test Boucle Voisin',
        'tap-boucle-voisin', 'Europe/Paris');

insert into public.campaigns (id, organization_id, name, status, code_ttl_seconds)
values ('f0b00000-0000-4000-8000-000000000007',
        'f0b00000-0000-4000-8000-000000000006', 'Campagne Voisine', 'active', 300);

alter table public.wheels drop constraint wheels_campaign_org_fk;
alter table public.spins drop constraint spins_campaign_org_fk;

-- Roue de l'org 1 rattachée à la campagne de l'org 2 : chaîne rompue.
-- `unlimited` À DESSEIN — c'est ce qui rend l'assertion falsifiable : sans la
-- jointure `campaigns`, aucune fenêtre n'empêcherait la reprise de rendre ce
-- spin, et l'assertion rougirait.
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('f0b00000-0000-4000-8000-000000000008',
        'f0b00000-0000-4000-8000-000000000001',
        'f0b00000-0000-4000-8000-000000000007', 'Roue rompue TAP', 'unlimited');

insert into public.prizes (id, organization_id, wheel_id, label, stock, weight, is_active, is_losing)
values ('f0b00000-0000-4000-8000-000000000013', 'f0b00000-0000-4000-8000-000000000001',
        'f0b00000-0000-4000-8000-000000000008', 'Lot rompu TAP', 5, 100, true, false);

-- Le spin reste cohérent avec sa propre roue et son propre lot : c'est ce qui
-- permet aux deux FK composites restantes de `spins` de tenir pendant que la
-- chaîne vers la campagne, elle, est rompue.
insert into public.spins (
  id, organization_id, campaign_id, wheel_id, prize_id, is_losing,
  player_key, claimed, play_window_key, created_at
)
values (
  'f0b00000-0000-4000-8000-000000000042',
  'f0b00000-0000-4000-8000-000000000001',
  'f0b00000-0000-4000-8000-000000000007',
  'f0b00000-0000-4000-8000-000000000008',
  'f0b00000-0000-4000-8000-000000000013', false,
  repeat('i', 64), false, null,
  now() - interval '10 minutes'
);

select is(
  (select count(*)::int from public.recover_pending_spin(
     'f0b00000-0000-4000-8000-000000000008', repeat('i', 64))),
  0,
  'chaîne roue → campagne → organisation rompue : zéro ligne, jamais un gain d''ailleurs'
);

-- ════════════════════════════════════════════════════════════
-- (f, g, h) JOB-8 · LE NONCE SE CONSOMME UNE FOIS
-- ════════════════════════════════════════════════════════════
-- Roue `unlimited` : sur une roue bornée, le second appel serait refusé en
-- « limit_reached » et le test verdirait sans rien prouver de l'idempotence.
-- Chaque appel est une instruction SÉPARÉE (cf. en-tête, déterminisme).
select is(
  (select is_losing from public.perform_atomic_spin(
     'f0b00000-0000-4000-8000-000000000001',
     'f0b00000-0000-4000-8000-000000000002',
     'f0b00000-0000-4000-8000-000000000005',
     repeat('f', 64), null, 'direct', false, 'nonce-jou-1')),
  false,
  'premier appel au nonce : tirage normal, lot gagné'
);

-- Le rejeu est comparé à la ligne EN BASE, écrite par l'instruction précédente :
-- aucune des deux valeurs ne dépend de l'ordre d'évaluation.
select is(
  (select spin_id from public.perform_atomic_spin(
     'f0b00000-0000-4000-8000-000000000001',
     'f0b00000-0000-4000-8000-000000000002',
     'f0b00000-0000-4000-8000-000000000005',
     repeat('f', 64), null, 'direct', false, 'nonce-jou-1')),
  (select id from public.spins
    where idempotency_key = 'nonce-jou-1' and player_key = repeat('f', 64)),
  'JOB-8 : un second appel de MÊME nonce rend le MÊME spin_id'
);

select is(
  (select prize_id from public.perform_atomic_spin(
     'f0b00000-0000-4000-8000-000000000001',
     'f0b00000-0000-4000-8000-000000000002',
     'f0b00000-0000-4000-8000-000000000005',
     repeat('f', 64), null, 'direct', false, 'nonce-jou-1')),
  'f0b00000-0000-4000-8000-000000000012'::uuid,
  'le rejeu rend l''ISSUE du premier appel (le lot), pas un refus'
);

select is(
  (select count(*)::int from public.spins
    where wheel_id = 'f0b00000-0000-4000-8000-000000000005'
      and player_key = repeat('f', 64)),
  1,
  'JOB-8 : un seul spin en base pour trois appels de même nonce'
);

-- LA PREUVE COMPTABLE : trois appels, un seul engagement de stock (10 → 9).
select is(
  (select stock from public.prizes
    where id = 'f0b00000-0000-4000-8000-000000000012'),
  9,
  'JOB-8 : le stock n''est décrémenté QU''UNE fois pour un nonce rejoué'
);

-- ════════════════════════════════════════════════════════════
-- (i) SANS NONCE, RIEN NE CHANGE
-- ════════════════════════════════════════════════════════════
-- Non-régression de tous les appelants existants : l'appel 6-args (les deux
-- derniers paramètres à leur défaut) doit rester identique à lui-même, et deux
-- appels sous `unlimited` restent deux spins distincts.
select lives_ok(
  $$select * from public.perform_atomic_spin(
      'f0b00000-0000-4000-8000-000000000001',
      'f0b00000-0000-4000-8000-000000000002',
      'f0b00000-0000-4000-8000-000000000005',
      repeat('g', 64), null, 'direct')$$,
  'appel 6-args (force_losing ET nonce par défaut) : accepté tel quel'
);

select lives_ok(
  $$select * from public.perform_atomic_spin(
      'f0b00000-0000-4000-8000-000000000001',
      'f0b00000-0000-4000-8000-000000000002',
      'f0b00000-0000-4000-8000-000000000005',
      repeat('g', 64), null, 'direct')$$,
  'second appel 6-args : rien ne le déduplique'
);

select is(
  (select count(*)::int from public.spins
    where wheel_id = 'f0b00000-0000-4000-8000-000000000005'
      and player_key = repeat('g', 64)),
  2,
  'clé null : deux appels restent DEUX spins distincts (zéro régression)'
);

-- ════════════════════════════════════════════════════════════
-- (j) L'INDEX REFUSE DEUX LIGNES DE MÊME CLÉ
-- ════════════════════════════════════════════════════════════
-- Joueur DIFFÉRENT à dessein : l'unicité est PAR COMMERCE (JOB-9,
-- 20261214120000 — elle était globale jusque-là), et surtout pas « par
-- joueur ». C'est elle qui empêche un nonce rejoué par un tiers DU MÊME
-- COMMERCE de produire un second spin — la recherche de rejeu étant, elle,
-- bornée au joueur pour ne pas rendre le spin_id d'autrui. Les deux lignes de
-- ce bloc sont du même commerce : la propriété testée ici n'a pas bougé.
select throws_ok(
  $$insert into public.spins (
      organization_id, campaign_id, wheel_id, prize_id, is_losing,
      player_key, claimed, idempotency_key
    ) values (
      'f0b00000-0000-4000-8000-000000000001',
      'f0b00000-0000-4000-8000-000000000002',
      'f0b00000-0000-4000-8000-000000000005',
      'f0b00000-0000-4000-8000-000000000012', false,
      repeat('h', 64), false, 'nonce-jou-1')$$,
  '23505',
  null,
  'l''index unique refuse une seconde ligne portant la même clé'
);

-- LA MÊME PROPRIÉTÉ, PAR LA PORTE DE SERVICE (revue sécurité, MOYEN-1).
-- L'assertion ci-dessus prouve que l'INDEX refuse le doublon ; celle-ci prouve
-- que la RPC ne le CONTOURNE pas en rendant la ligne d'autrui. C'est la garde de
-- la borne « roue + player_key » du lookup de rejeu : la retirer — geste que
-- n'importe quelle relecture prendrait pour une simplification — ferait rendre à
-- ce joueur le spin_id du précédent, soit exactement ce que le serveur signe en
-- jeton de retrait, et TOUTES les autres assertions resteraient vertes.
-- Aujourd'hui le lookup ne trouve rien sous cette clé joueur, le tirage se
-- déroule, et c'est l'insert qui heurte l'index : 23505.
select throws_ok(
  $$select * from public.perform_atomic_spin(
      'f0b00000-0000-4000-8000-000000000001',
      'f0b00000-0000-4000-8000-000000000002',
      'f0b00000-0000-4000-8000-000000000005',
      repeat('h', 64), null, 'direct', false, 'nonce-jou-1')$$,
  '23505',
  null,
  'le nonce d''un autre joueur ne rend PAS son spin : le lookup reste borné au joueur'
);

-- ════════════════════════════════════════════════════════════
-- (k, l) LES PORTES
-- ════════════════════════════════════════════════════════════
select ok(
  has_function_privilege('service_role', 'public.recover_pending_spin(uuid,text)', 'EXECUTE'),
  'seul le serveur peut reprendre un gain non réclamé'
);
select ok(
  not has_function_privilege('authenticated', 'public.recover_pending_spin(uuid,text)', 'EXECUTE'),
  'un compte marchand ne peut pas sonder les gains d''un joueur'
);
select ok(
  not has_function_privilege('anon', 'public.recover_pending_spin(uuid,text)', 'EXECUTE'),
  'anon ne peut pas appeler la reprise directement'
);
select ok(
  has_function_privilege('service_role',
    'public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text)', 'EXECUTE'),
  'la nouvelle signature du moteur reste ouverte au seul serveur'
);
select ok(
  not has_function_privilege('authenticated',
    'public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text)', 'EXECUTE'),
  'un compte marchand ne peut pas déclencher un tirage'
);

-- UNE SEULE SURCHARGE. Deux rendraient la fonction inappelable dès qu'un
-- appelant omet un argument à défaut (« function is not unique ») — panne
-- totale du tirage qu'aucune assertion d'ACL ne verrait, l'ancienne 7-args
-- restant parfaitement autorisée.
select is(
  (select count(*)::int
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'perform_atomic_spin'),
  1,
  'une seule surcharge de perform_atomic_spin (l''ancienne 7-args est retirée)'
);

select * from finish();
rollback;
