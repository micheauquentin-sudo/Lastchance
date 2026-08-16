-- ============================================================
-- LE CATALOGUE STRIPE DIT VRAI — les cinq droits qui mentaient
--
-- Éprouve la migration 20260925120000. Ce que ce fichier doit prouver, dans
-- l'ordre du coût de l'erreur :
--
--   1. QU'UN PASS N'OUVRE QUE SON MODULE (SD-4). C'est l'assertion la plus
--      chère du lot, et elle est commerciale avant d'être technique : tant
--      qu'un pass à 29 EUR ouvrait la roue, les campagnes et leur publication,
--      il DOMINAIT l'offre mensuelle au même prix. Le catalogue se sous-vendait
--      lui-même, et rien dans la base ne pouvait le signaler.
--   2. QU'UN OCTROI BORNÉ À UNE RESSOURCE LE SOIT VRAIMENT (SD-5).
--      `resource_id` existait depuis le lot 2, écrit par le webhook et lu par
--      personne : une Saison vendue pour UN championnat en couvrait neuf, 360
--      jours durant.
--   3. QUE LA JAUGE VENDUE SOIT CELLE QUI S'APPLIQUE (SD-1). Le webhook
--      écrivait `capacity` ; la fonction lisait le plan. Les paliers vendus
--      n'étaient même pas STOCKABLES.
--   4. QU'UN RACHAT PENDANT LA GRÂCE NE DOUBLE PAS (SD-6). Le doublon naissait
--      en silence et n'éclatait qu'au webhook SUIVANT, en 500 — donc en rejeu
--      Stripe pendant trois jours.
--   5. QU'UN REMBOURSEMENT REPRENNE CE QU'IL A RENDU (SD-2), sans jamais rendre
--      un solde négatif ni agir deux fois sur le même rejeu.
--
-- INSTANT DE RÉFÉRENCE UNIQUE, jamais `now()` là où la fonction accepte un
-- `p_now` : sinon le fichier devient intermittent selon la durée de sa propre
-- exécution. Les deux endroits qui ne l'acceptent pas — la capacité et le
-- trigger de clôture — sont éprouvés en relatif à `now()`, et le disent.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create temporary table t0 (v timestamptz);
insert into t0 values (timestamptz '2026-06-15 12:00:00+00');

-- ════════════════════════════════════════════════════════════
-- SD-4 — UN PASS N'OUVRE QUE SON MODULE, POUR LES NEUF
-- ════════════════════════════════════════════════════════════
--
-- La matrice est jouée sur les NEUF modules et non sur un échantillon. Le
-- défaut ne venait pas d'un module particulier : il venait de
-- `org_has_active_access`, en amont de tous. Un échantillon aurait prouvé la
-- correction là où on regardait, et l'aurait supposée ailleurs.

create temporary table mods (rang int primary key, m text not null unique);
insert into mods (rang, m) values
  (1, 'wheel'), (2, 'hunts'), (3, 'calendar'), (4, 'loyalty'), (5, 'quiz'),
  (6, 'jackpot'), (7, 'events'), (8, 'referral'), (9, 'pronostics');

create temporary table modorgs (m text primary key, id uuid not null);
insert into modorgs (m, id)
select m, ('d0000000-0000-4000-8000-' || pg_catalog.lpad(rang::text, 12, '0'))::uuid
from mods;

-- ABONNEMENT RÉSILIÉ, ESSAI EXPIRÉ, AUCUN ADDON. C'est la condition qui rend la
-- matrice concluante : le SEUL droit de ces organisations est leur pass, donc
-- tout `true` observé vient de lui et de rien d'autre.
insert into public.organizations (id, name, slug, subscription_status, trial_ends_at)
select o.id, 'Pass ' || o.m, 'tap-ds-pass-' || o.m, 'canceled',
       (select v from t0) - interval '60 days'
from modorgs o;

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
select o.id, o.m, 'pass', 'backoffice',
       (select v from t0) - interval '1 day',
       (select v from t0) + interval '29 days'
from modorgs o;

select is(
  public.org_has_module_access(o.id, o.m, (select v from t0)),
  true,
  'SD-4 [' || o.m || '] le pass ouvre SON module, sans aucun abonnement'
) from modorgs o order by o.m;

-- LE CŒUR DU DÉFAUT. Avant 20260925120000, ces huit assertions rendaient
-- toutes `true` : n'importe quel octroi vivant portait le socle, et la roue
-- suivait le socle.
select is(
  public.org_has_module_access(o.id, 'wheel', (select v from t0)),
  false,
  'SD-4 [' || o.m || '] et il n''ouvre PAS la roue — « un pass n''ouvre que son module »'
) from modorgs o where o.m <> 'wheel' order by o.m;

-- Le témoin qui empêche la série ci-dessus de passer pour un succès si la
-- fonction refusait TOUT : un octroi `wheel`, lui, ouvre bien la roue.
select is(
  public.org_has_module_access(
    (select id from modorgs where m = 'wheel'), 'wheel', (select v from t0)),
  true,
  'SD-4 un octroi « wheel » ouvre la roue — le resserrement refuse, il ne ferme pas'
);

-- La matrice est-elle bien jouée ? Sans ceci, un bloc vidé par erreur rendrait
-- « 0 assertion, 0 rouge », qui se lit exactement comme un succès.
select is((select pg_catalog.count(*)::int from modorgs), 9,
  'SD-4 les NEUF modules sont joués — un bloc vide se lirait comme un succes');

-- ── CE QUE LE RESSERREMENT NE DOIT PAS CASSER ───────────────
-- Le socle reste vrai pour un porteur de pass : c'est ce que lisent les
-- bandeaux « compte actif ». Distinguer les deux questions était tout l'objet
-- du correctif ; les confondre dans l'autre sens serait le même défaut.
select is(
  public.org_has_active_access(
    (select id from modorgs where m = 'hunts'), (select v from t0)),
  true,
  'SD-4 le SOCLE reste acquis au porteur de pass — org_has_active_access inchangée'
);

select is(
  public.org_has_subscription_access(
    (select id from modorgs where m = 'hunts'), (select v from t0)),
  false,
  'SD-4 mais il n''a pas d''OFFRE — c''est la question neuve, et elle dit non'
);

-- ── L'OFFRE, ELLE, OUVRE SELON LA MATRICE DES PLANS ─────────
insert into public.organizations
  (id, name, slug, subscription_status, trial_ends_at, addon_hunts)
values
  ('d0000000-0000-4000-8000-00000000000a', 'Abonnee nue', 'tap-ds-abo', 'active',
   (select v from t0) - interval '60 days', false),
  ('d0000000-0000-4000-8000-00000000000b', 'Abonnee hunts', 'tap-ds-abo-h', 'active',
   (select v from t0) - interval '60 days', true);

select is(
  public.org_has_module_access(
    'd0000000-0000-4000-8000-00000000000a'::uuid, 'wheel', (select v from t0)),
  true,
  'SD-4 une OFFRE ouvre la roue, tous addons éteints — c''est le produit de base'
);
select is(
  public.org_has_module_access(
    'd0000000-0000-4000-8000-00000000000a'::uuid, 'hunts', (select v from t0)),
  false,
  'SD-4 une offre sans l''addon n''ouvre pas la Chasse'
);
select is(
  public.org_has_module_access(
    'd0000000-0000-4000-8000-00000000000b'::uuid, 'hunts', (select v from t0)),
  true,
  'SD-4 offre + addon allumé : la Chasse est ouverte'
);

-- ── L'EXPIRATION FERME, ET ELLE FERME LES DEUX ──────────────
insert into public.organizations (id, name, slug, subscription_status, trial_ends_at)
values ('d0000000-0000-4000-8000-00000000000c', 'Pass echu', 'tap-ds-echu', 'canceled',
        (select v from t0) - interval '60 days');
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values ('d0000000-0000-4000-8000-00000000000c', 'hunts', 'pass', 'backoffice',
        (select v from t0) - interval '40 days', (select v from t0) - interval '10 days');

select is(
  public.org_has_module_access(
    'd0000000-0000-4000-8000-00000000000c'::uuid, 'hunts', (select v from t0)),
  false,
  'SD-4 EXPIRATION : passé ends_at, le module se referme'
);
select is(
  public.org_has_module_access(
    'd0000000-0000-4000-8000-00000000000c'::uuid, 'wheel', (select v from t0)),
  false,
  'SD-4 EXPIRATION : et la roue ne s''ouvre pas davantage qu''avant'
);

-- ════════════════════════════════════════════════════════════
-- SD-5 — UN OCTROI BORNÉ NE VAUT QUE POUR SA RESSOURCE
-- ════════════════════════════════════════════════════════════

insert into public.organizations (id, name, slug, subscription_status, trial_ends_at)
values
  ('d1000000-0000-4000-8000-000000000001', 'Saison bornee', 'tap-ds-saison', 'canceled',
   (select v from t0) - interval '60 days'),
  ('d1000000-0000-4000-8000-000000000002', 'Saison historique', 'tap-ds-histo', 'canceled',
   (select v from t0) - interval '60 days');

insert into public.contests (id, organization_id, slug, name, competition_key, status)
values
  ('d1000000-0000-4000-8000-0000000000c1', 'd1000000-0000-4000-8000-000000000001',
   'tap-ds-contest-a', 'Championnat A', 'l1', 'active'),
  ('d1000000-0000-4000-8000-0000000000c2', 'd1000000-0000-4000-8000-000000000001',
   'tap-ds-contest-b', 'Championnat B', 'l1', 'active');

-- L'octroi BORNÉ : vendu pour le championnat A, et pour lui seul.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at, resource_id)
values ('d1000000-0000-4000-8000-000000000001', 'pronostics', 'pass', 'backoffice',
        (select v from t0) - interval '1 day', (select v from t0) + interval '359 days',
        'd1000000-0000-4000-8000-0000000000c1');

select is(
  public.org_has_module_access(
    'd1000000-0000-4000-8000-000000000001'::uuid, 'pronostics', (select v from t0)),
  false,
  'SD-5 un octroi BORNÉ n''ouvre pas le module entier — resource_id décide enfin'
);
select is(
  public.org_has_module_access_for_resource(
    'd1000000-0000-4000-8000-000000000001'::uuid, 'pronostics',
    'd1000000-0000-4000-8000-0000000000c1'::uuid, (select v from t0)),
  true,
  'SD-5 mais il ouvre SON championnat'
);
select is(
  public.org_has_module_access_for_resource(
    'd1000000-0000-4000-8000-000000000001'::uuid, 'pronostics',
    'd1000000-0000-4000-8000-0000000000c2'::uuid, (select v from t0)),
  false,
  'SD-5 et pas le championnat voisin de la même organisation'
);
select is(
  public.org_has_active_access(
    'd1000000-0000-4000-8000-000000000001'::uuid, (select v from t0)),
  true,
  'SD-5 le socle reste porté par un octroi borné : c''est un droit payant réel'
);

-- L'OCTROI HISTORIQUE, sans `resource_id` : comportement inchangé. C'est la
-- moitié fragile de la règle — le correctif ne doit pas fermer rétroactivement
-- ce qui a été vendu comme couvrant le module.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values ('d1000000-0000-4000-8000-000000000002', 'pronostics', 'pass', 'backoffice',
        (select v from t0) - interval '1 day', (select v from t0) + interval '359 days');

select is(
  public.org_has_module_access(
    'd1000000-0000-4000-8000-000000000002'::uuid, 'pronostics', (select v from t0)),
  true,
  'SD-5 un octroi SANS resource_id (historique) ouvre toujours le module entier'
);
select is(
  public.org_has_module_access_for_resource(
    'd1000000-0000-4000-8000-000000000002'::uuid, 'pronostics',
    'd1000000-0000-4000-8000-0000000000c1'::uuid, (select v from t0)),
  true,
  'SD-5 et le droit du module ouvre TOUTE ressource — le repli est explicite'
);

-- ── LA CLÔTURE RESSERRE LES OCTROIS DU CHAMPIONNAT ──────────
--
-- Éprouvé en RELATIF à `now()` et non contre `t0` : le trigger lit l'horloge
-- de la transaction, qu'aucun paramètre ne permet de détourner. On assied donc
-- l'assertion sur un encadrement — après la clôture, la fin doit être passée
-- sous « maintenant + 8 jours » alors qu'elle valait 359 jours.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at, resource_id)
values ('d1000000-0000-4000-8000-000000000001', 'pronostics', 'pass', 'backoffice',
        pg_catalog.now() - interval '1 day', pg_catalog.now() + interval '359 days',
        'd1000000-0000-4000-8000-0000000000c2');

update public.contests
   set status = 'finished', finalized_at = pg_catalog.now()
 where id = 'd1000000-0000-4000-8000-0000000000c2';

select ok(
  (select g.ends_at from public.organization_module_grants g
    where g.resource_id = 'd1000000-0000-4000-8000-0000000000c2')
    < pg_catalog.now() + interval '8 days',
  'SD-5 CLÔTURE : l''octroi du championnat clos tombe à sept jours, pas 359'
);
select ok(
  (select g.ends_at from public.organization_module_grants g
    where g.resource_id = 'd1000000-0000-4000-8000-0000000000c2')
    > pg_catalog.now() + interval '6 days',
  'SD-5 CLÔTURE : et il garde sa queue de sept jours — réclamations, classement'
);

-- L'octroi de l'AUTRE championnat n'a pas bougé : le resserrement est ciblé.
select ok(
  (select g.ends_at from public.organization_module_grants g
    where g.resource_id = 'd1000000-0000-4000-8000-0000000000c1')
    > (select v from t0) + interval '300 days',
  'SD-5 CLÔTURE : l''octroi du championnat VOISIN est intact'
);

-- MONOTONE : rouvrir puis reclôturer ne rend pas les jours repris, et surtout
-- ne permet pas de s'en offrir en basculant le statut d'avant en arrière.
update public.contests set status = 'active', finalized_at = null
 where id = 'd1000000-0000-4000-8000-0000000000c2';
update public.contests set status = 'finished'
 where id = 'd1000000-0000-4000-8000-0000000000c2';

select ok(
  (select g.ends_at from public.organization_module_grants g
    where g.resource_id = 'd1000000-0000-4000-8000-0000000000c2')
    < pg_catalog.now() + interval '8 days',
  'SD-5 CLÔTURE : `least` est MONOTONE — rouvrir ne rallonge rien'
);

-- ════════════════════════════════════════════════════════════
-- SD-1 — LA JAUGE VENDUE EST CELLE QUI S'APPLIQUE
-- ════════════════════════════════════════════════════════════

insert into public.organizations
  (id, name, slug, subscription_status, trial_ends_at, plan, addon_events)
values
  -- Sans offre, avec un pass Soirée de 30 places.
  ('d2000000-0000-4000-8000-000000000001', 'Soiree pass', 'tap-ds-soiree', 'canceled',
   pg_catalog.now() - interval '60 days', 'starter', false),
  -- Avec l'offre la plus haute ET le même pass : c'est le plan qui gagne.
  ('d2000000-0000-4000-8000-000000000002', 'Soiree full', 'tap-ds-soiree-full', 'active',
   pg_catalog.now() - interval '60 days', 'full', true),
  -- Pass ÉCHU : la jauge vendue ne compte plus.
  ('d2000000-0000-4000-8000-000000000003', 'Soiree echue', 'tap-ds-soiree-echue', 'canceled',
   pg_catalog.now() - interval '60 days', 'starter', false);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at, capacity)
values
  ('d2000000-0000-4000-8000-000000000001', 'events', 'pass', 'backoffice',
   pg_catalog.now() - interval '1 day', pg_catalog.now() + interval '29 days', 30),
  ('d2000000-0000-4000-8000-000000000002', 'events', 'pass', 'backoffice',
   pg_catalog.now() - interval '1 day', pg_catalog.now() + interval '29 days', 30),
  ('d2000000-0000-4000-8000-000000000003', 'events', 'pass', 'backoffice',
   pg_catalog.now() - interval '40 days', pg_catalog.now() - interval '10 days', 30);

select is(
  public.event_participant_capacity('d2000000-0000-4000-8000-000000000001'::uuid),
  30,
  'SD-1 la jauge VENDUE (30) est celle qui s''applique — elle n''était lue par rien'
);
select is(
  public.event_participant_capacity('d2000000-0000-4000-8000-000000000002'::uuid),
  1000,
  'SD-1 un plan supérieur l''emporte : c''est le plus généreux qui vaut, pas le dernier'
);
select is(
  public.event_participant_capacity('d2000000-0000-4000-8000-000000000003'::uuid),
  10,
  'SD-1 un pass ÉCHU ne compte plus — reste le plancher technique, pas 30'
);

-- ── LES PALIERS VENDUS SONT ENFIN STOCKABLES ────────────────
--
-- Éprouvé par une INSERTION RÉELLE et non en relisant la contrainte au
-- catalogue : le trigger d'instantané écrit `max_participants` lui-même, donc
-- une session créée par un porteur de pass de 30 places est le seul geste qui
-- prouve à la fois que la fonction rend 30 ET que la contrainte l'accepte.
-- Avant ce lot, `check (in (100, 500, 1000))` aurait refusé la ligne.
insert into public.event_games (id, organization_id, name, status)
values ('d2000000-0000-4000-8000-0000000000e1',
        'd2000000-0000-4000-8000-000000000001', 'Quiz de la soiree', 'active');

insert into public.event_sessions (id, game_id, organization_id, join_code, status)
values ('d2000000-0000-4000-8000-0000000000e2',
        'd2000000-0000-4000-8000-0000000000e1',
        'd2000000-0000-4000-8000-000000000001', 'ABC234', 'draft');

select is(
  (select s.max_participants from public.event_sessions s
    where s.id = 'd2000000-0000-4000-8000-0000000000e2'),
  30,
  'SD-1 la session naît avec la jauge PAYÉE, et la contrainte l''accepte'
);

-- ════════════════════════════════════════════════════════════
-- SD-6 — LE RACHAT PENDANT LA GRÂCE RÉACTIVE, IL NE DOUBLE PAS
-- ════════════════════════════════════════════════════════════

insert into public.organizations (id, name, slug, subscription_status, trial_ends_at)
values ('d3000000-0000-4000-8000-000000000001', 'Grace', 'tap-ds-grace', 'canceled',
        (select v from t0) - interval '60 days');

-- La revendication de rôle est posée à la main, comme le fait PostgREST :
-- c'est la seule façon d'atteindre le corps de `grant_module_from_payment`.
set local role postgres;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (select outcome from public.grant_module_from_payment(
     'd3000000-0000-4000-8000-000000000001'::uuid,
     'loyalty', 'recurring', 'cs_grace_1',
     (select v from t0), null, null, null, null)),
  'created',
  'SD-6 le premier achat du mensuel crée l''octroi'
);

-- LA GRÂCE, telle que le webhook la pose sur `past_due` : une fin datée, qui
-- fait sortir la ligne de l'index d'unicité partiel — c'est là que le trou
-- s'ouvre.
update public.organization_module_grants
   set ends_at = (select v from t0) + interval '14 days'
 where organization_id = 'd3000000-0000-4000-8000-000000000001';

select is(
  (select outcome from public.grant_module_from_payment(
     'd3000000-0000-4000-8000-000000000001'::uuid,
     'loyalty', 'recurring', 'cs_grace_2',
     (select v from t0) + interval '2 days', null, null, null, null)),
  'reactivated',
  'SD-6 le rachat PENDANT la grâce réactive l''octroi existant'
);

select is(
  (select pg_catalog.count(*)::int from public.organization_module_grants g
    where g.organization_id = 'd3000000-0000-4000-8000-000000000001'),
  1,
  'SD-6 et il n''en existe qu''UN — le doublon ne naît plus'
);
select is(
  (select g.ends_at from public.organization_module_grants g
    where g.organization_id = 'd3000000-0000-4000-8000-000000000001'),
  null,
  'SD-6 la fin de grâce est levée : c''est le même droit repayé, pas un second'
);
select is(
  (select g.source_reference from public.organization_module_grants g
    where g.organization_id = 'd3000000-0000-4000-8000-000000000001'),
  'cs_grace_2',
  'SD-6 rattaché au NOUVEAU paiement — sans quoi son rejeu se lirait « refused »'
);
select is(
  (select g.starts_at from public.organization_module_grants g
    where g.organization_id = 'd3000000-0000-4000-8000-000000000001'),
  (select v from t0),
  'SD-6 mais starts_at n''est PAS redaté : le droit n''a jamais cessé'
);

select is(
  (select outcome from public.grant_module_from_payment(
     'd3000000-0000-4000-8000-000000000001'::uuid,
     'loyalty', 'recurring', 'cs_grace_2',
     (select v from t0) + interval '2 days', null, null, null, null)),
  'replayed',
  'SD-6 REJEU du rachat : replayed, et rien de plus n''est écrit'
);
select is(
  (select pg_catalog.count(*)::int from public.organization_module_grants g
    where g.organization_id = 'd3000000-0000-4000-8000-000000000001'),
  1,
  'SD-6 le rejeu n''a créé aucun octroi'
);

-- LE REJEU N'EST PAS UN RACHAT — l'autre moitié de la règle. Une redélivrance
-- du paiement d'ORIGINE pendant la grâce ne doit pas LEVER la grâce.
insert into public.organizations (id, name, slug, subscription_status, trial_ends_at)
values ('d3000000-0000-4000-8000-000000000002', 'Grace bis', 'tap-ds-grace2', 'canceled',
        (select v from t0) - interval '60 days');

select is(
  (select outcome from public.grant_module_from_payment(
     'd3000000-0000-4000-8000-000000000002'::uuid,
     'referral', 'recurring', 'cs_grace_bis',
     (select v from t0), null, null, null, null)),
  'created',
  'SD-6 (témoin) un mensuel créé sur une seconde organisation'
);

update public.organization_module_grants
   set ends_at = (select v from t0) + interval '14 days'
 where organization_id = 'd3000000-0000-4000-8000-000000000002';

select is(
  (select outcome from public.grant_module_from_payment(
     'd3000000-0000-4000-8000-000000000002'::uuid,
     'referral', 'recurring', 'cs_grace_bis',
     (select v from t0), null, null, null, null)),
  'replayed',
  'SD-6 la redélivrance du paiement d''ORIGINE pendant la grâce est un rejeu'
);
select isnt(
  (select g.ends_at from public.organization_module_grants g
    where g.organization_id = 'd3000000-0000-4000-8000-000000000002'),
  null,
  'SD-6 et elle ne lève PAS la grâce — un rejeu ne repaie rien'
);

-- LE CUMUL RESTE REFUSÉ : le correctif n'ouvre pas la porte qu'il ferme.
select is(
  (select outcome from public.grant_module_from_payment(
     'd3000000-0000-4000-8000-000000000001'::uuid,
     'loyalty', 'recurring', 'cs_grace_3',
     (select v from t0) + interval '3 days', null, null, null, null)),
  'refused',
  'SD-6 hors grâce, un second achat du même mensuel reste REFUSÉ'
);

-- ════════════════════════════════════════════════════════════
-- SD-2 — REPRENDRE CE QUI A ÉTÉ REMBOURSÉ
-- ════════════════════════════════════════════════════════════

insert into public.organizations (id, name, slug, subscription_status, trial_ends_at)
values ('d4000000-0000-4000-8000-000000000001', 'Rembourse', 'tap-ds-remb', 'canceled',
        (select v from t0) - interval '60 days');

select is(
  (select outcome from public.grant_module_from_payment(
     'd4000000-0000-4000-8000-000000000001'::uuid,
     'hunts', 'pass', 'cs_remb_1',
     (select v from t0), (select v from t0) + interval '30 days', null, null, null)),
  'created',
  'SD-2 (montage) un pass Chasse acheté'
);

select is(
  (select pg_catalog.count(*)::int
     from public.revoke_grant_for_refund('cs_remb_1', 'charge.refunded')),
  1,
  'SD-2 le remboursement révoque l''octroi né de ce paiement'
);
select is(
  public.org_has_module_access(
    'd4000000-0000-4000-8000-000000000001'::uuid, 'hunts', (select v from t0)),
  false,
  'SD-2 et le module se referme aussitôt'
);

select is(
  (select pg_catalog.count(*)::int
     from public.revoke_grant_for_refund('cs_remb_1', 'dispute.created')),
  0,
  'SD-2 IDEMPOTENCE : le rejeu ne révoque rien de plus — zéro ligne, pas d''erreur'
);
select is(
  (select g.revoked_reason from public.organization_module_grants g
    where g.source_reference = 'cs_remb_1'),
  'charge.refunded',
  'SD-2 et le motif d''origine n''est pas réécrit par le rejeu'
);

-- UN OCTROI DÉJÀ ÉCHU N'EST PAS TOUCHÉ : le marquer « révoqué » réécrirait
-- l'histoire d'un droit qui s'était éteint tout seul.
insert into public.organization_module_grants
  (organization_id, module, kind, source, source_reference, starts_at, ends_at)
values ('d4000000-0000-4000-8000-000000000001', 'quiz', 'pass', 'stripe', 'cs_remb_vieux',
        (select v from t0) - interval '40 days', (select v from t0) - interval '10 days');

select is(
  (select pg_catalog.count(*)::int
     from public.revoke_grant_for_refund('cs_remb_vieux', 'charge.refunded')),
  0,
  'SD-2 un octroi DÉJÀ ÉCHU n''est pas révoqué — rien à reprendre'
);
select is(
  (select g.revoked_at from public.organization_module_grants g
    where g.source_reference = 'cs_remb_vieux'),
  null,
  'SD-2 et sa ligne reste intacte pour les exports'
);

-- ── LE CRÉDIT SMS : BORNÉ AU SOLDE, JAMAIS NÉGATIF ──────────
select is(
  (select created from public.credit_sms_balance(
     'd4000000-0000-4000-8000-000000000001'::uuid, 100, 'purchase', null, 'pi_sms_remb', null)),
  true,
  'SD-2 (montage) 100 crédits SMS achetés'
);

-- Le commerçant en a déjà dépensé 90 : la reprise ne peut porter que sur 10.
insert into public.sms_credit_entries
  (organization_id, delta_units, reason, unit_cost_micros, currency, reference)
values ('d4000000-0000-4000-8000-000000000001', -90, 'send', 45000, 'EUR', 'tap-ds-envoi');

select is(
  (select debited_units from public.debit_sms_balance_for_refund('pi_sms_remb')),
  10,
  'SD-2 la reprise est BORNÉE au solde restant (10), pas au montant vendu (100)'
);
select is(
  (select c.balance_units from public.sms_credits c
    where c.organization_id = 'd4000000-0000-4000-8000-000000000001'),
  0,
  'SD-2 le solde tombe à zéro et n''est JAMAIS négatif'
);

select is(
  (select pg_catalog.count(*)::int
     from public.debit_sms_balance_for_refund('pi_sms_remb')),
  0,
  'SD-2 IDEMPOTENCE : le rejeu ne débite pas une seconde fois'
);
select is(
  (select c.balance_units from public.sms_credits c
    where c.organization_id = 'd4000000-0000-4000-8000-000000000001'),
  0,
  'SD-2 et le solde n''a pas bougé au rejeu — le grand livre est append-only'
);

select is(
  (select pg_catalog.count(*)::int
     from public.debit_sms_balance_for_refund('pi_inconnu_des_sms')),
  0,
  'SD-2 une référence qui ne désigne aucun achat SMS rend zéro ligne, sans lever'
);

-- ════════════════════════════════════════════════════════════
-- LES PORTES RESTENT FERMÉES
--
-- Les quatre fonctions neuves sont SECURITY DEFINER et décident de ce qui est
-- payé. Un `alter default privileges` de Supabase accorde EXECUTE largement
-- (ADR-049) : sans révocation explicite, PostgREST les exposerait.
-- ════════════════════════════════════════════════════════════
reset role;

select is(
  has_function_privilege('authenticated',
    'public.org_has_subscription_access(uuid, timestamptz)', 'EXECUTE'),
  false, 'ACL org_has_subscription_access n''est pas exposée à authenticated');
select is(
  has_function_privilege('anon',
    'public.org_has_module_access_for_resource(uuid, text, uuid, timestamptz)', 'EXECUTE'),
  false, 'ACL org_has_module_access_for_resource n''est pas exposée à anon');
select is(
  has_function_privilege('authenticated',
    'public.revoke_grant_for_refund(text, text)', 'EXECUTE'),
  false, 'ACL revoke_grant_for_refund n''est pas exposée à authenticated');
select is(
  has_function_privilege('anon',
    'public.debit_sms_balance_for_refund(text)', 'EXECUTE'),
  false, 'ACL debit_sms_balance_for_refund n''est pas exposée à anon');
select is(
  has_function_privilege('authenticated',
    'public.assert_module_publish_allowed(uuid, text, uuid)', 'EXECUTE'),
  false, 'ACL la surcharge à ressource n''est pas exposée à authenticated');

select * from finish();
rollback;
