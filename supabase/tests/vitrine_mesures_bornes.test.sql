-- ============================================================
-- LES DEUX BORNES DES COMPTEURS DE VITRINE (20261211120000)
--
-- `vitrine_mesures` est écrite par une route PUBLIQUE SANS JETON. Deux trous
-- s'y renforçaient :
--
--   · `compter_vues_vitrine` ne contrôlait `ref` que par sa LONGUEUR. La borne
--     applicative (`src/lib/vitrine-mesures.ts`) exige bien un UUID, mais un
--     UUID INVENTÉ est un UUID : chacun créait une ligne neuve, remontée au
--     tableau de bord du commerçant comme une « fiche consultée » ;
--   · rien ne vidait jamais la table — absente des treize purges quotidiennes.
--
-- Ce fichier éprouve les deux, par le COMPORTEMENT (ce qui est écrit, ce qui
-- reste après purge), jamais par lecture du corps des fonctions.
--
-- LA CONTRE-ÉPREUVE EST EN PREMIER : une fiche RÉELLE doit se compter. Sans
-- elle, toutes les assertions de refus ci-dessous seraient vertes sur une
-- fonction qui n'écrit plus rien du tout — l'échec le plus coûteux possible
-- pour un commerçant, et le plus facile à ne pas voir.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
-- DEUX organisations, toutes deux servies. La voisine n'est pas décorative :
-- elle porte des contenus RÉELS, et c'est le seul moyen de distinguer « la
-- référence n'existe pas » de « la référence n'est pas à vous ». Un identifiant
-- de fiche voisine s'obtient en ouvrant sa vitrine publique : c'est l'attaque
-- la moins chère, et celle qu'un contrôle d'existence sans filtre
-- d'organisation laisserait passer.
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('c3000000-0000-4000-8000-00000000000a', 'Mesures A', 'tap-mesures-org-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('c3000000-0000-4000-8000-00000000000b', 'Mesures B', 'tap-mesures-org-b',
   'active', 'starter', 'Europe/Paris', 6);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('c3000000-0000-4000-8000-00000000000a', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('c3000000-0000-4000-8000-00000000000b', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

insert into public.vitrine_settings (organization_id, slug, published)
values
  ('c3000000-0000-4000-8000-00000000000a', 'tap-mesures-a', true),
  ('c3000000-0000-4000-8000-00000000000b', 'tap-mesures-b', true);

-- Le catalogue de A : une carte, une rubrique, une fiche.
insert into public.vitrine_menus (id, organization_id, nom)
values ('c3000000-0000-4000-8000-000000000101',
        'c3000000-0000-4000-8000-00000000000a', 'Carte A');
insert into public.vitrine_categories (id, menu_id, organization_id, nom)
values ('c3000000-0000-4000-8000-000000000102',
        'c3000000-0000-4000-8000-000000000101',
        'c3000000-0000-4000-8000-00000000000a', 'Entrées A');
insert into public.vitrine_items (id, categorie_id, organization_id, nom)
values ('c3000000-0000-4000-8000-000000000103',
        'c3000000-0000-4000-8000-000000000102',
        'c3000000-0000-4000-8000-00000000000a', 'Plat A');

-- Le catalogue de B : une fiche BIEN RÉELLE, dont l'identifiant sera présenté
-- sur le slug de A.
insert into public.vitrine_menus (id, organization_id, nom)
values ('c3000000-0000-4000-8000-000000000201',
        'c3000000-0000-4000-8000-00000000000b', 'Carte B');
insert into public.vitrine_categories (id, menu_id, organization_id, nom)
values ('c3000000-0000-4000-8000-000000000202',
        'c3000000-0000-4000-8000-000000000201',
        'c3000000-0000-4000-8000-00000000000b', 'Entrées B');
insert into public.vitrine_items (id, categorie_id, organization_id, nom)
values ('c3000000-0000-4000-8000-000000000203',
        'c3000000-0000-4000-8000-000000000202',
        'c3000000-0000-4000-8000-00000000000b', 'Plat B');


-- ════════════════════════════════════════════════════════════
-- CONTRE-ÉPREUVE — les trois types de contenu RÉELS se comptent
-- ════════════════════════════════════════════════════════════
select public.compter_vues_vitrine('tap-mesures-a', 'fr', '[
  {"type":"carte","ref":"c3000000-0000-4000-8000-000000000101"},
  {"type":"rubrique","ref":"c3000000-0000-4000-8000-000000000102"},
  {"type":"fiche","ref":"c3000000-0000-4000-8000-000000000103"}
]'::jsonb);

select is(
  (select count(*)::int from public.vitrine_mesures
     where organization_id = 'c3000000-0000-4000-8000-00000000000a'),
  3,
  'carte, rubrique et fiche RÉELLES de l''organisation : les trois se comptent (sans quoi tout ce fichier serait vert sur une fonction muette)'
);


-- ════════════════════════════════════════════════════════════
-- 1. UN IDENTIFIANT INVENTÉ NE CRÉE PLUS DE LIGNE
--
-- C'est le cœur du défaut : bien formé (la borne applicative le laisse
-- passer), et pourtant il ne désigne rien.
-- ════════════════════════════════════════════════════════════
select public.compter_vues_vitrine('tap-mesures-a', 'fr', '[
  {"type":"fiche","ref":"deadbeef-0000-4000-8000-000000000999"}
]'::jsonb);

select is(
  (select count(*)::int from public.vitrine_mesures
     where organization_id = 'c3000000-0000-4000-8000-00000000000a'),
  3,
  'UUID bien formé mais inexistant : AUCUNE ligne neuve (1 800 lignes/min/IP fermées)'
);


-- ════════════════════════════════════════════════════════════
-- 2. L'IDENTIFIANT RÉEL DU VOISIN NON PLUS
--
-- Il existe, il est bien formé, il s'obtient en ouvrant la vitrine publique de
-- B. Sans le filtre par organisation, il se compterait chez A.
-- ════════════════════════════════════════════════════════════
select public.compter_vues_vitrine('tap-mesures-a', 'fr', '[
  {"type":"fiche","ref":"c3000000-0000-4000-8000-000000000203"}
]'::jsonb);

select is(
  (select count(*)::int from public.vitrine_mesures
     where organization_id = 'c3000000-0000-4000-8000-00000000000a'),
  3,
  'fiche RÉELLE mais du VOISIN : refusée — le contrôle d''existence est borné à l''organisation'
);

select is(
  (select count(*)::int from public.vitrine_mesures
     where organization_id = 'c3000000-0000-4000-8000-00000000000b'),
  0,
  'et rien n''a été écrit chez le voisin non plus : un slug ne peut pas compter pour un autre'
);


-- ════════════════════════════════════════════════════════════
-- 3. UNE RÉFÉRENCE ILLISIBLE ÉCARTE SA LIGNE, PAS LE LOT
--
-- `v_ref::uuid` sur une chaîne quelconque LÈVE (22P02). Si l'exception
-- remontait, un seul caractère mal placé ferait perdre les soixante compteurs
-- de la page — un déni de service d'une ligne, et silencieux côté commerçant.
-- Le lot mixte ci-dessous le prouve : le bon passe, le mauvais tombe.
-- ════════════════════════════════════════════════════════════
select lives_ok(
  $$select public.compter_vues_vitrine('tap-mesures-a', 'fr', '[
      {"type":"fiche","ref":"pas-un-uuid-du-tout"},
      {"type":"fiche","ref":"c3000000-0000-4000-8000-000000000103"}
    ]'::jsonb)$$,
  'référence illisible : la fonction ne lève pas — le reste du lot doit survivre'
);

select is(
  (select compteur from public.vitrine_mesures
     where organization_id = 'c3000000-0000-4000-8000-00000000000a'
       and type = 'fiche' and ref = 'c3000000-0000-4000-8000-000000000103'),
  2,
  'la fiche réelle du même lot a bien été comptée (2e vue) malgré la référence illisible'
);

select is(
  (select count(*)::int from public.vitrine_mesures
     where organization_id = 'c3000000-0000-4000-8000-00000000000a'),
  3,
  'et la référence illisible n''a créé aucune ligne'
);


-- ════════════════════════════════════════════════════════════
-- 4. LE TYPE `action` RESTE HORS DU CONTRÔLE, ET C'EST VOULU
--
-- Il ne vise aucune table : il nomme une PORTE, et ce vocabulaire fermé vit
-- dans `VITRINE_ACTIONS` côté application. Le recopier en SQL créerait une
-- seconde liste à tenir. Cette assertion existe pour que le jour où quelqu'un
-- « harmonisera » le contrôle, il voie tout de suite ce qu'il casse.
-- ════════════════════════════════════════════════════════════
select public.compter_vues_vitrine('tap-mesures-a', 'fr', '[
  {"type":"action","ref":"reserver"}
]'::jsonb);

select is(
  (select compteur from public.vitrine_mesures
     where organization_id = 'c3000000-0000-4000-8000-00000000000a'
       and type = 'action' and ref = 'reserver'),
  1,
  'les clics sur une PORTE se comptent toujours : le contrôle de référence ne s''applique pas au type `action`'
);


-- ════════════════════════════════════════════════════════════
-- 5. LA RÉTENTION — 13 MOIS, ET RIEN NE LA TENAIT
-- ════════════════════════════════════════════════════════════
insert into public.vitrine_mesures
  (organization_id, jour, langue, type, ref, compteur)
values
  -- 400 jours : au-delà des 13 mois (395 à 396 jours selon le mois).
  ('c3000000-0000-4000-8000-00000000000a', current_date - 400, 'fr', 'fiche',
   'c3000000-0000-4000-8000-000000000103', 7),
  -- 380 jours : DANS la fenêtre, et c'est la borne qui compte. Une purge qui
  -- effacerait tout passerait sans elle.
  ('c3000000-0000-4000-8000-00000000000a', current_date - 380, 'fr', 'fiche',
   'c3000000-0000-4000-8000-000000000103', 5);

select is(
  (select public.purge_expired_vitrine_mesures())::int,
  1,
  'la purge rend le nombre de lignes effacées : exactement la ligne de 400 jours'
);

select is(
  (select count(*)::int from public.vitrine_mesures
     where organization_id = 'c3000000-0000-4000-8000-00000000000a'
       and jour = current_date - 400),
  0,
  'au-delà de 13 mois : effacé'
);

select is(
  (select compteur from public.vitrine_mesures
     where organization_id = 'c3000000-0000-4000-8000-00000000000a'
       and jour = current_date - 380),
  5,
  'à 380 jours : CONSERVÉ — la purge ne vide pas la table, elle la borne'
);

select is(
  (select count(*)::int from public.vitrine_mesures
     where organization_id = 'c3000000-0000-4000-8000-00000000000a'
       and jour = current_date),
  4,
  'et les compteurs du jour sont intacts (3 contenus + 1 porte)'
);


-- ════════════════════════════════════════════════════════════
-- 6. ACL — la purge est une fonction de serveur
-- ════════════════════════════════════════════════════════════
select ok(
  has_function_privilege('service_role', 'public.purge_expired_vitrine_mesures()', 'EXECUTE'),
  'seul le serveur peut purger les compteurs de vitrine'
);
select ok(
  not has_function_privilege('authenticated', 'public.purge_expired_vitrine_mesures()', 'EXECUTE'),
  'un commerçant connecté ne peut pas effacer ses propres mesures par la RPC'
);
select ok(
  not has_function_privilege('anon', 'public.purge_expired_vitrine_mesures()', 'EXECUTE'),
  'anon ne peut pas purger les compteurs de vitrine'
);

select * from finish();
rollback;
