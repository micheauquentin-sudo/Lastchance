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
--      un solde négatif, agir deux fois sur le même rejeu, NI TOUCHER UN AUTRE
--      LOCATAIRE — les deux index qui gardent `source_reference` sont uniques
--      par organisation, donc la référence seule ne désigne pas une ligne.
--   6. QUE L'EXPIRATION SE VOIE (SD-9, migration 20260926120000). Le cron
--      `run_campaign_schedule` publiait sans lire aucun droit, et le refus muet
--      était le motif écrit de ne pas le garder (20260906120000). Il refuse
--      désormais AVEC signal — `paused_reason = 'droit_expire'`, audit, job.
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
-- 500 et non 1000 depuis 20260929120000 (wagon 5, VEN-1) : la jauge du plan
-- `full` est redescendue au plus haut palier PROUVÉ. Ce que cette assertion
-- éprouve reste SD-1 — que l'offre l'emporte sur le pass de 30 —, et elle
-- l'éprouve toujours : 500 > 30. Seul le chiffre de l'offre a changé.
select is(
  public.event_participant_capacity('d2000000-0000-4000-8000-000000000002'::uuid),
  500,
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

-- `reward_stock` est NOT NULL sans défaut (ADR-031, verrou économique : le stock
-- d'un lot est fini et obligatoire). 0 = podium seul, aucun code émis — c'est ce
-- que veut ce test, qui n'éprouve que la jauge de participants.
insert into public.event_sessions
  (id, game_id, organization_id, join_code, status, reward_stock)
values ('d2000000-0000-4000-8000-0000000000e2',
        'd2000000-0000-4000-8000-0000000000e1',
        'd2000000-0000-4000-8000-000000000001', 'ABC234', 'draft', 0);

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

-- ── LA RÉACTIVATION NE PÊCHE PAS UN OCTROI BORNÉ (revue wagon 2, INFO 1) ──
--
-- `org_has_live_module_grant` exige `resource_id is null` depuis SD-5 : le
-- module ENTIER et une ressource nommée sont deux droits distincts. La branche
-- de réactivation doit lire la même frontière, sinon le rachat du module entier
-- irait ressusciter un droit vendu pour UN championnat — en lui retirant sa fin
-- par-dessus, et en lui collant la référence du nouveau paiement.
--
-- AUCUN MODÈLE BORNÉ N'EST RÉCURRENT AUJOURD'HUI : cette assertion garde une
-- porte que le catalogue n'ouvre pas encore. C'est précisément pourquoi elle est
-- écrite ici — le jour où une Saison se vendra à l'abonnement, personne ne
-- rouvrira ce fichier pour y penser.
insert into public.organizations (id, name, slug, subscription_status, trial_ends_at)
values ('d3000000-0000-4000-8000-000000000003', 'Grace ter', 'tap-ds-grace3', 'canceled',
        (select v from t0) - interval '60 days');

select is(
  (select outcome from public.grant_module_from_payment(
     'd3000000-0000-4000-8000-000000000003'::uuid,
     'pronostics', 'recurring', 'cs_borne_1',
     (select v from t0), null, null, null,
     'd3000000-0000-4000-8000-0000000000f1'::uuid)),
  'created',
  'INFO 1 (montage) un récurrent BORNÉ à un championnat'
);

-- Sous grâce, donc hors de l'index d'unicité : exactement l'état que la branche
-- de réactivation va chercher.
update public.organization_module_grants
   set ends_at = (select v from t0) + interval '14 days'
 where source_reference = 'cs_borne_1';

select is(
  (select outcome from public.grant_module_from_payment(
     'd3000000-0000-4000-8000-000000000003'::uuid,
     'pronostics', 'recurring', 'cs_module_entier',
     (select v from t0) + interval '1 day', null, null, null, null)),
  'created',
  'INFO 1 le rachat du MODULE ENTIER crée son propre octroi, il ne réactive pas le borné'
);
select isnt(
  (select g.ends_at from public.organization_module_grants g
    where g.source_reference = 'cs_borne_1'),
  null,
  'INFO 1 et la fin du droit BORNÉ n''est pas levée — il n''a pas été repayé'
);
select is(
  (select g.resource_id from public.organization_module_grants g
    where g.source_reference = 'cs_borne_1'),
  'd3000000-0000-4000-8000-0000000000f1'::uuid,
  'INFO 1 il reste attaché à SON championnat, avec sa référence d''origine'
);

-- ════════════════════════════════════════════════════════════
-- SD-2 — REPRENDRE CE QUI A ÉTÉ REMBOURSÉ
-- ════════════════════════════════════════════════════════════

insert into public.organizations (id, name, slug, subscription_status, trial_ends_at)
values ('d4000000-0000-4000-8000-000000000001', 'Rembourse', 'tap-ds-remb', 'canceled',
        (select v from t0) - interval '60 days');

-- ⚠️ CETTE SECTION EST DATÉE EN RELATIF À `now()`, ET NON CONTRE `t0`.
-- `revoke_grant_for_refund` n'accepte AUCUN instant de référence, et c'est
-- délibéré : son seul appelant est un webhook, qui s'exécute maintenant. Lui
-- ouvrir un `p_now` donnerait à une porte de service le moyen de déclarer échu
-- ce qui ne l'est pas. La conséquence pour ce fichier est qu'un octroi daté
-- depuis `t0` (15 juin) serait DÉJÀ ÉCHU pour la fonction dès la mi-juillet —
-- elle le laisserait tranquille, à raison, et l'assertion aurait basculé toute
-- seule un beau matin. C'est le défaut que ces trois assertions ont réellement
-- eu, et il est corrigé ici, pas contourné.
select is(
  (select outcome from public.grant_module_from_payment(
     'd4000000-0000-4000-8000-000000000001'::uuid,
     'hunts', 'pass', 'cs_remb_1',
     pg_catalog.now(), pg_catalog.now() + interval '30 days', null, null, null)),
  'created',
  'SD-2 (montage) un pass Chasse acheté'
);

select is(
  (select pg_catalog.count(*)::int
     from public.revoke_grant_for_refund(
       'd4000000-0000-4000-8000-000000000001'::uuid,
       'cs_remb_1', 'charge.refunded')),
  1,
  'SD-2 le remboursement révoque l''octroi né de ce paiement'
);
select is(
  public.org_has_module_access(
    'd4000000-0000-4000-8000-000000000001'::uuid, 'hunts', pg_catalog.now()),
  false,
  'SD-2 et le module se referme aussitôt'
);

select is(
  (select pg_catalog.count(*)::int
     from public.revoke_grant_for_refund(
       'd4000000-0000-4000-8000-000000000001'::uuid,
       'cs_remb_1', 'dispute.created')),
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
        pg_catalog.now() - interval '40 days', pg_catalog.now() - interval '10 days');

select is(
  (select pg_catalog.count(*)::int
     from public.revoke_grant_for_refund(
       'd4000000-0000-4000-8000-000000000001'::uuid,
       'cs_remb_vieux', 'charge.refunded')),
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
  (select debited_units from public.debit_sms_balance_for_refund(
     'd4000000-0000-4000-8000-000000000001'::uuid, 'pi_sms_remb')),
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
     from public.debit_sms_balance_for_refund(
       'd4000000-0000-4000-8000-000000000001'::uuid, 'pi_sms_remb')),
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
     from public.debit_sms_balance_for_refund(
       'd4000000-0000-4000-8000-000000000001'::uuid, 'pi_inconnu_des_sms')),
  0,
  'SD-2 une référence qui ne désigne aucun achat SMS rend zéro ligne, sans lever'
);

-- ── LA PORTÉE D'ORGANISATION DES DEUX REPRISES (revue wagon 2, MOYEN 1) ──
--
-- UNE RÉFÉRENCE NE DÉSIGNE PAS UNE LIGNE À ELLE SEULE, et c'est tout l'objet de
-- ce bloc. Les deux index qui la gardent sont uniques PAR ORGANISATION —
-- `organization_module_grants (organization_id, source_reference)` et
-- `sms_credit_entries_one_purchase_per_reference` — et le back-office écrit une
-- `reference` libre dont le motif vaut `purchase` par défaut : deux locataires
-- portant la même référence n'est pas une hypothèse. Résolue sans portée, la
-- reprise touchait alors le mauvais : un droit fermé chez un tiers pour la
-- révocation, un débit monétaire DÉFINITIF pour les SMS, le grand livre étant
-- append-only.
--
-- LE MONTAGE EST DATÉ EXPRÈS, et c'est ce qui rend la preuve concluante plutôt
-- que chanceuse : `now()` est l'instant de la TRANSACTION, donc deux achats
-- créés ici porteraient le MÊME `created_at`, et `order by created_at asc limit
-- 1` d'avant-correctif se départagerait sur l'ordre physique des lignes.
-- L'achat du VOISIN est donc antidaté d'une heure : sous l'ancien code, c'est
-- lui, sans ambiguïté, que la reprise de l'ACHETEUR aurait débité.
insert into public.organizations (id, name, slug, subscription_status, trial_ends_at)
values
  ('d4000000-0000-4000-8000-000000000002', 'Voisin', 'tap-ds-voisin', 'canceled',
   (select v from t0) - interval '60 days'),
  ('d4000000-0000-4000-8000-000000000003', 'Acheteur', 'tap-ds-acheteur', 'canceled',
   (select v from t0) - interval '60 days'),
  ('d4000000-0000-4000-8000-000000000004', 'Tiers', 'tap-ds-tiers', 'canceled',
   (select v from t0) - interval '60 days');

-- L'ancre crée la ligne de solde du voisin : `sms_credits` n'est ouvrable que
-- par `credit_sms_balance` (le trigger `sms_credits_balance_is_ledger_only`
-- refuse l'insertion directe), et l'achat PARTAGÉ doit être antidaté, ce que la
-- RPC ne permet pas. D'où les deux gestes, avec des références distinctes pour
-- ne pas buter sur l'index d'unicité per-organisation.
select is(
  (select created from public.credit_sms_balance(
     'd4000000-0000-4000-8000-000000000002'::uuid, 40, 'purchase', 45000,
     'pi_ancre_voisin', null)),
  true,
  'SD-2 (montage) le voisin a 40 crédits sous SA propre référence'
);
insert into public.sms_credit_entries
  (organization_id, delta_units, reason, unit_cost_micros, currency, reference,
   created_at)
values ('d4000000-0000-4000-8000-000000000002', 60, 'purchase', 45000, 'EUR',
        'pi_sms_partage', pg_catalog.now() - interval '1 hour');

select is(
  (select created from public.credit_sms_balance(
     'd4000000-0000-4000-8000-000000000003'::uuid, 60, 'purchase', 45000,
     'pi_sms_partage', null)),
  true,
  'SD-2 (montage) l''acheteur porte LA MÊME référence — l''index est per-organisation'
);
select is(
  (select created from public.credit_sms_balance(
     'd4000000-0000-4000-8000-000000000004'::uuid, 25, 'purchase', 45000,
     'pi_tiers', null)),
  true,
  'SD-2 (montage) un tiers avec un solde NON VIDE, pour que le refus se lise'
);

-- ── LE MONTAGE MORD-IL ENCORE ? ─────────────────────────────
-- Ces deux gardes valent autant que les assertions qu'elles précèdent : le jour
-- où l'une des références serait renommée, tout ce qui suit passerait au vert
-- en ne prouvant plus rien du tout. Elles disent que l'ambiguïté est RÉELLE, et
-- que l'ancien tri désignait bien le mauvais locataire.
select is(
  (select pg_catalog.count(*)::int from public.sms_credit_entries e
    where e.reason = 'purchase' and e.reference = 'pi_sms_partage'),
  2,
  'MOYEN 1 (garde) DEUX locataires portent la même référence d''achat — l''index est per-organisation'
);
select is(
  (select e.organization_id from public.sms_credit_entries e
    where e.reason = 'purchase' and e.reference = 'pi_sms_partage'
    order by e.created_at asc limit 1),
  'd4000000-0000-4000-8000-000000000002'::uuid,
  'MOYEN 1 (garde) et c''est le VOISIN que l''ancien `order by created_at asc limit 1` désignait'
);

-- LE DÉBIT SUIT L'ORGANISATION, PAS LA RÉFÉRENCE. Sans le paramètre, cette
-- assertion rendait l'uuid du VOISIN — c'est ce que la garde ci-dessus établit.
select is(
  (select org_id from public.debit_sms_balance_for_refund(
     'd4000000-0000-4000-8000-000000000003'::uuid, 'pi_sms_partage')),
  'd4000000-0000-4000-8000-000000000003'::uuid,
  'MOYEN 1 la reprise SMS débite l''organisation passée en paramètre, pas la plus ancienne'
);
select is(
  (select c.balance_units from public.sms_credits c
    where c.organization_id = 'd4000000-0000-4000-8000-000000000002'),
  100,
  'MOYEN 1 et le VOISIN n''est pas touché — 100 crédits intacts, référence identique'
);
select is(
  (select c.balance_units from public.sms_credits c
    where c.organization_id = 'd4000000-0000-4000-8000-000000000003'),
  0,
  'MOYEN 1 c''est bien l''acheteur qui a été repris, jusqu''à zéro'
);

-- ORGANISATION QUI NE CORRESPOND PAS : rien à reprendre, sans lever. Le solde du
-- tiers est NON VIDE à dessein — sinon le zéro viendrait du garde-fou de solde
-- et non de la portée, et l'assertion ne prouverait rien.
select is(
  (select pg_catalog.count(*)::int
     from public.debit_sms_balance_for_refund(
       'd4000000-0000-4000-8000-000000000004'::uuid, 'pi_sms_partage')),
  0,
  'MOYEN 1 une référence qui appartient à un AUTRE locataire ne débite rien'
);
select is(
  (select c.balance_units from public.sms_credits c
    where c.organization_id = 'd4000000-0000-4000-8000-000000000004'),
  25,
  'MOYEN 1 et le solde du tiers est intact — le refus n''a rien écrit'
);

select throws_ok(
  $$select * from public.debit_sms_balance_for_refund(null::uuid, 'pi_sms_partage')$$,
  '22023', null,
  'MOYEN 1 l''organisation est REQUISE : null lève, il n''y a pas de repli global'
);

-- MÊME PORTÉE POUR LA RÉVOCATION, et le défaut y était plus large encore : le
-- `where` sans organisation sélectionnait les octrois des DEUX locataires, donc
-- un `update` de jeu — ce n'était pas « parfois le mauvais », c'était les deux.
insert into public.organization_module_grants
  (organization_id, module, kind, source, source_reference, starts_at, ends_at)
values
  ('d4000000-0000-4000-8000-000000000002', 'hunts', 'pass', 'stripe',
   'cs_partage', pg_catalog.now() - interval '1 day',
   pg_catalog.now() + interval '30 days'),
  ('d4000000-0000-4000-8000-000000000003', 'hunts', 'pass', 'stripe',
   'cs_partage', pg_catalog.now() - interval '1 day',
   pg_catalog.now() + interval '30 days');

-- MÊME GARDE : deux octrois VIVANTS sous la même référence, donc deux lignes que
-- le `where` d'avant-correctif ramassait ensemble. Ce n'était pas « parfois le
-- mauvais » : le `update` de jeu les révoquait tous les deux.
select is(
  (select pg_catalog.count(*)::int from public.organization_module_grants g
    where g.source = 'stripe' and g.source_reference = 'cs_partage'
      and g.revoked_at is null
      and (g.ends_at is null or g.ends_at > pg_catalog.now())),
  2,
  'MOYEN 1 (garde) deux octrois VIVANTS partagent la référence — l''ancien where les prenait tous'
);

select is(
  (select pg_catalog.count(*)::int
     from public.revoke_grant_for_refund(
       'd4000000-0000-4000-8000-000000000003'::uuid,
       'cs_partage', 'charge.refunded')),
  1,
  'MOYEN 1 la révocation ne prend QU''UN octroi — celui du locataire remboursé'
);
select is(
  (select g.revoked_at from public.organization_module_grants g
    where g.organization_id = 'd4000000-0000-4000-8000-000000000002'
      and g.source_reference = 'cs_partage'),
  null,
  'MOYEN 1 et le droit du voisin reste OUVERT — il n''a rien demandé'
);
select is(
  public.org_has_module_access(
    'd4000000-0000-4000-8000-000000000002'::uuid, 'hunts', pg_catalog.now()),
  true,
  'MOYEN 1 son module Chasse répond encore, ce qui est la seule preuve qui compte'
);

select throws_ok(
  $$select * from public.revoke_grant_for_refund(
      null::uuid, 'cs_partage', 'charge.refunded')$$,
  '22023', null,
  'MOYEN 1 la révocation exige aussi l''organisation, sans défaut'
);

-- ════════════════════════════════════════════════════════════
-- SD-9 — L'EXPIRATION SE VOIT : LE PLANIFICATEUR REFUSE ET LE DIT
-- ════════════════════════════════════════════════════════════
--
-- ⚠️ SECTION DATÉE EN RELATIF À `now()`, ET NON CONTRE `t0` — même raison que
-- SD-2 : `run_campaign_schedule()` n'accepte AUCUN instant de référence, et
-- c'est délibéré (son seul appelant est pg_cron, qui s'exécute maintenant). Une
-- fenêtre de campagne assise sur `t0` (15 juin) serait close depuis des
-- semaines, et la section entière basculerait toute seule un beau matin.
--
-- CE QUE CES ASSERTIONS PROUVENT, ET POURQUOI ELLES ÉTAIENT ROUGES AVANT :
-- jusqu'à 20260926120000, le cron activait toute campagne `auto_schedule` dont
-- la fenêtre s'ouvrait SANS LIRE AUCUN DROIT — et le trigger de publication ne
-- le voyait pas passer, `auth.role()` étant NULL sous le propriétaire de la
-- base. La première assertion rendait donc « activated » là où elle attend
-- « blocked », et les quatre suivantes comptaient zéro.

insert into public.organizations (id, name, slug, subscription_status, trial_ends_at)
values
  -- AUCUN droit : abonnement résilié, essai expiré, aucun octroi.
  ('d5000000-0000-4000-8000-000000000001', 'Planif sans droit', 'tap-ds-planif-nu',
   'canceled', pg_catalog.now() - interval '60 days'),
  -- Une OFFRE vivante : le témoin de non-régression.
  ('d5000000-0000-4000-8000-000000000002', 'Planif abonnee', 'tap-ds-planif-abo',
   'active', pg_catalog.now() - interval '60 days');

insert into public.campaigns
  (id, organization_id, name, status, auto_schedule, starts_at, ends_at)
values
  ('d5000000-0000-4000-8000-0000000000a1', 'd5000000-0000-4000-8000-000000000001',
   'Programmee sans droit', 'draft', true,
   pg_catalog.now() - interval '1 hour', pg_catalog.now() + interval '30 days'),
  ('d5000000-0000-4000-8000-0000000000b1', 'd5000000-0000-4000-8000-000000000002',
   'Programmee avec offre', 'draft', true,
   pg_catalog.now() - interval '1 hour', pg_catalog.now() + interval '30 days');

-- Le résultat est CAPTURÉ : la fonction écrit, donc la rappeler pour relire son
-- retour éprouverait un second passage et non le premier.
create temporary table sd9_run1 as
select * from public.run_campaign_schedule();

select is(
  (select r.action from sd9_run1 r
    where r.campaign_id = 'd5000000-0000-4000-8000-0000000000a1'),
  'blocked',
  'SD-9 sans droit, le planificateur REFUSE au lieu de publier — le cron lit enfin l''accès'
);
select results_eq(
  $$select status, paused_reason from public.campaigns
     where id = 'd5000000-0000-4000-8000-0000000000a1'$$,
  $$values ('paused', 'droit_expire')$$,
  'SD-9 et le refus devient un ÉTAT lisible : paused / droit_expire'
);

-- LE SIGNAL, sans quoi ce correctif serait exactement la garde muette que
-- 20260906120000 avait écartée à raison.
select is(
  (select pg_catalog.count(*)::int from public.jobs j
    where j.type = 'automation.schedule-blocked'
      and j.organization_id = 'd5000000-0000-4000-8000-000000000001'),
  1,
  'SD-9 un job automation.schedule-blocked part : le refus a de quoi se dire'
);
select results_eq(
  $$select payload->>'campaignId', payload->>'organizationId' from public.jobs
     where type = 'automation.schedule-blocked'$$,
  $$values ('d5000000-0000-4000-8000-0000000000a1',
            'd5000000-0000-4000-8000-000000000001')$$,
  -- Les clés sont assertées NOMMÉMENT, en camelCase comme les trois autres jobs
  -- déposés par la base : c'est ce qui empêche un futur lot de les renommer sans
  -- que src/lib/automations.ts, qui lit `payload.campaignId`, ne s'en aperçoive.
  'SD-9 le job porte campaignId et organizationId — mêmes clés que budget-paused'
);
select is(
  (select pg_catalog.count(*)::int from public.audit_logs a
    where a.action = 'campaign.schedule.blocked'
      and a.organization_id = 'd5000000-0000-4000-8000-000000000001'),
  1,
  'SD-9 le refus est audité (actor system), comme la pause budget'
);
select is(
  (select a.metadata->>'campaign_name' from public.audit_logs a
    where a.action = 'campaign.schedule.blocked'
      and a.organization_id = 'd5000000-0000-4000-8000-000000000001'),
  'Programmee sans droit',
  'SD-9 et l''audit nomme la campagne : lisible sans rejouer la requête'
);

-- ── NON-RÉGRESSION : LE CHEMIN NOMINAL EST INTACT ───────────
-- Sans ce témoin, la série ci-dessus passerait pour un succès si le
-- planificateur s'était mis à refuser TOUT LE MONDE.
select is(
  (select r.action from sd9_run1 r
    where r.campaign_id = 'd5000000-0000-4000-8000-0000000000b1'),
  'activated',
  'SD-9 avec une offre, la campagne programmée s''active comme avant'
);
select results_eq(
  $$select status, paused_reason from public.campaigns
     where id = 'd5000000-0000-4000-8000-0000000000b1'$$,
  $$values ('active', null::text)$$,
  'SD-9 activée sans motif de pause — le resserrement refuse, il ne ferme pas'
);

-- ── LE SIGNAL NE PART QU'À LA TRANSITION ────────────────────
-- Le cron repasse toutes les 10 minutes. Sans cette garantie, une campagne
-- bloquée vaudrait 144 notifications par jour, indéfiniment.
create temporary table sd9_run2 as
select * from public.run_campaign_schedule();

select is(
  (select pg_catalog.count(*)::int from sd9_run2 r
    where r.campaign_id in ('d5000000-0000-4000-8000-0000000000a1',
                            'd5000000-0000-4000-8000-0000000000b1')),
  0,
  'SD-9 le passage suivant est un no-op : ni réactivation, ni second refus'
);
select is(
  (select pg_catalog.count(*)::int from public.jobs j
    where j.type = 'automation.schedule-blocked'
      and j.organization_id = 'd5000000-0000-4000-8000-000000000001'),
  1,
  'SD-9 IDEMPOTENCE : aucune seconde notification — le signal suit la transition'
);
select is(
  (select pg_catalog.count(*)::int from public.audit_logs a
    where a.action = 'campaign.schedule.blocked'
      and a.organization_id = 'd5000000-0000-4000-8000-000000000001'),
  1,
  'SD-9 ni seconde ligne d''audit : un journal n''enregistre pas un non-événement'
);

-- ── LE RACHAT RÉPARE TOUT SEUL ──────────────────────────────
-- C'est la raison pour laquelle `activated` n'exclut PAS `'droit_expire'` (elle
-- exclut `'budget_reached'`, et seulement lui) : le commerçant qui repaie n'a
-- aucun geste à faire, et le trigger `campaigns_clear_paused_reason` efface le
-- motif au passage.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values ('d5000000-0000-4000-8000-000000000001', 'wheel', 'pass', 'backoffice',
        pg_catalog.now() - interval '1 minute', pg_catalog.now() + interval '30 days');

create temporary table sd9_run3 as
select * from public.run_campaign_schedule();

select is(
  (select r.action from sd9_run3 r
    where r.campaign_id = 'd5000000-0000-4000-8000-0000000000a1'),
  'activated',
  'SD-9 RACHAT : le droit revenu, le passage suivant active — aucun geste manuel'
);
select results_eq(
  $$select status, paused_reason from public.campaigns
     where id = 'd5000000-0000-4000-8000-0000000000a1'$$,
  $$values ('active', null::text)$$,
  'SD-9 et le motif droit_expire s''efface de lui-même (trigger existant)'
);

-- ── LE TROISIÈME MOTIF EST STOCKABLE, ET LE CHECK MORD ENCORE ──
-- Éprouvé par une écriture RÉELLE et non en relisant le catalogue : si le
-- `drop constraint if exists` de la migration n'avait pas trouvé le nom généré
-- par Postgres, l'ancienne contrainte survivrait à côté de la neuve et cette
-- écriture serait refusée — un défaut qu'aucune lecture de `pg_constraint`
-- n'aurait signalé.
select lives_ok(
  $$update public.campaigns set paused_reason = 'droit_expire'
     where id = 'd5000000-0000-4000-8000-0000000000b1'$$,
  'SD-9 le CHECK de paused_reason accepte le troisième motif'
);
select throws_ok(
  $$update public.campaigns set paused_reason = 'peu_importe'
     where id = 'd5000000-0000-4000-8000-0000000000b1'$$,
  '23514', null,
  'SD-9 et il reste FERMÉ : la liste s''élargit, elle ne s''ouvre pas'
);

-- ════════════════════════════════════════════════════════════
-- LES PORTES RESTENT FERMÉES
--
-- Les fonctions neuves sont SECURITY DEFINER et décident de ce qui est payé. Un
-- `alter default privileges` de Supabase accorde EXECUTE largement (ADR-049) :
-- sans révocation explicite, PostgREST les exposerait. `run_campaign_schedule`
-- est REDÉFINIE par 20260926120000 et non créée : un `create or replace`
-- conserve l'ACL, mais un `drop`/`create` glissé plus tard la rendrait à
-- l'`alter default privileges` — et cette fonction PUBLIE des campagnes.
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
    'public.revoke_grant_for_refund(uuid, text, text)', 'EXECUTE'),
  false, 'ACL revoke_grant_for_refund n''est pas exposée à authenticated');
select is(
  has_function_privilege('anon',
    'public.debit_sms_balance_for_refund(uuid, text)', 'EXECUTE'),
  false, 'ACL debit_sms_balance_for_refund n''est pas exposée à anon');

-- ── L'ANCIENNE SURCHAGE NON PORTÉE A DISPARU (revue wagon 2, MOYEN 1) ──
-- Un `create or replace` de signature différente crée une SECONDE fonction au
-- lieu de remplacer la première : sans le `drop function if exists` de la
-- migration, la version résolvant l'achat par la seule référence survivrait à
-- côté de la neuve, appelable par `service_role`. Le correctif ne vaut que si
-- l'ancienne porte est murée, et cela ne se lit pas dans le texte du fichier.
select is(
  (select pg_catalog.count(*)::int
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('revoke_grant_for_refund', 'debit_sms_balance_for_refund')),
  2,
  'MOYEN 1 DEUX fonctions de reprise et pas quatre : l''ancienne surcharge est droppée');
select is(
  (select pg_catalog.count(*)::int
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('revoke_grant_for_refund', 'debit_sms_balance_for_refund')
      and pg_catalog.format_type(p.proargtypes[0], null) = 'uuid'),
  2,
  'MOYEN 1 et les deux prennent l''organisation en PREMIER argument');

select is(
  has_function_privilege('authenticated',
    'public.org_has_live_resource_grant(uuid, text, uuid, timestamptz)', 'EXECUTE'),
  false, 'ACL org_has_live_resource_grant n''est pas exposée à authenticated');
select is(
  has_function_privilege('anon',
    'public.org_has_live_resource_grant(uuid, text, uuid, timestamptz)', 'EXECUTE'),
  false, 'ACL org_has_live_resource_grant ni à anon — c''est elle qui borne SD-5');
select is(
  has_function_privilege('authenticated',
    'public.event_participant_capacity(uuid)', 'EXECUTE'),
  false, 'ACL event_participant_capacity n''est pas exposée à authenticated');
select is(
  has_function_privilege('anon',
    'public.event_participant_capacity(uuid)', 'EXECUTE'),
  false, 'ACL event_participant_capacity ni à anon — elle rend la jauge VENDUE');
-- Le trigger de clôture est révoqué même à `service_role` : PostgreSQL vérifie
-- EXECUTE à la CRÉATION du trigger, pas à chaque déclenchement, et la clôture
-- éprouvée plus haut le prouve encore vivant. Aucun appel direct ne doit rester
-- possible — invoquée hors trigger, la fonction lirait un `new` inexistant.
select is(
  has_function_privilege('authenticated',
    'public.shrink_contest_grants_on_close()', 'EXECUTE'),
  false, 'ACL shrink_contest_grants_on_close n''est pas exposée à authenticated');
select is(
  has_function_privilege('service_role',
    'public.shrink_contest_grants_on_close()', 'EXECUTE'),
  false, 'ACL shrink_contest_grants_on_close pas même à service_role — c''est un trigger');

select is(
  has_function_privilege('authenticated',
    'public.assert_module_publish_allowed(uuid, text, uuid)', 'EXECUTE'),
  false, 'ACL la surcharge à ressource n''est pas exposée à authenticated');
select is(
  has_function_privilege('authenticated',
    'public.run_campaign_schedule()', 'EXECUTE'),
  false, 'ACL SD-9 le planificateur redéfini n''est pas exposé à authenticated');
select is(
  has_function_privilege('anon',
    'public.run_campaign_schedule()', 'EXECUTE'),
  false, 'ACL SD-9 ni à anon — c''est lui qui publie les campagnes');
select ok(
  has_function_privilege('service_role',
    'public.run_campaign_schedule()', 'EXECUTE'),
  'ACL SD-9 mais le serveur et pg_cron l''appellent toujours');

select * from finish();
rollback;
