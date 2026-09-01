-- ════════════════════════════════════════════════════════════
-- LE VOCABULAIRE DES DROITS — LES TROIS ÉNUMÉRATIONS DOIVENT S'ACCORDER
--
-- ── LE DÉFAUT QUE CE FICHIER FERME ──
--
-- Un droit de module est nommé à TROIS endroits du schéma, recopiés à la main
-- et incapables de se lire l'un l'autre :
--
--   1. `v_allowed`, constante d'`apply_stripe_subscription_event_v2` — ce que
--      le webhook Stripe accepte de poser ;
--   2. `organization_entitlements_entitlement_check` — ce que le registre
--      accepte d'enregistrer ;
--   3. `organization_module_grants_module_check` — ce que le back-office
--      accepte d'octroyer.
--
-- Un `check` ne peut pas lire une constante de fonction : la répétition est
-- structurelle, pas une négligence. Ce qui manquait, c'est la GARDE.
--
-- Elle a manqué exactement une fois de trop. `rendez_vous`, détaché de
-- `reserver` par RDV-5 (20261107120000), est entré dans (3) — d'où l'octroi
-- manuel qui fonctionnait et rassurait — mais jamais dans (1) ni (2). Le droit
-- était donc vendable côté `src/lib/plans.ts` (offres « Sur Place » et « La
-- Totale ») et refusé côté base : au premier achat, la RPC aurait levé
-- « invalid entitlement », le webhook aurait répondu 500, et Stripe aurait
-- coupé le point d'entrée après trois jours de retentatives — bloquant la
-- synchronisation de TOUS les abonnements. 20261124120000 répare ; ce fichier
-- empêche la récidive.
--
-- ── CE QU'IL VÉRIFIE, ET POURQUOI CHAQUE POINT ──
--
-- Comparer les trois listes ne suffit pas. Un droit peut être ADMIS partout et
-- n'être jamais POSÉ : c'est le second défaut trouvé le même jour — la
-- fonction n'écrivait pas `addon_rendez_vous` alors qu'elle écrivait ses
-- quatre voisines. L'achat aurait réussi, le registre aurait porté la ligne,
-- et le commerçant n'aurait pas eu son agenda. Ce fichier vérifie donc aussi
-- que CHAQUE droit du vocabulaire traverse toute la chaîne : colonne, écriture
-- par le webhook, défense par le garde-fou, lecture par `org_has_module_access`.
--
-- ── CE QU'IL NE VÉRIFIE PAS ──
--
-- La parité avec le TypeScript (`Entitlement` dans
-- `src/platform/experiences/contract.ts`, `MODULE_ADDON_COLUMN` dans
-- `src/lib/subscription.ts`). Elle est gardée côté Vitest
-- (`src/lib/module-access-parity.test.ts`) : pgTAP ne lit pas le dépôt.
-- ════════════════════════════════════════════════════════════

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();


-- ════════════════════════════════════════════════════════════
-- EXTRACTION — les trois vocabulaires, lus dans le CATALOGUE VIVANT
--
-- Jamais dans les fichiers de migration : c'est la définition effectivement
-- installée qui fait foi. Une migration peut être écrite et jamais appliquée,
-- ou annulée par un `create or replace` postérieur — c'est arrivé le
-- 2026-08-23.
-- ════════════════════════════════════════════════════════════

create temporary table vocab_stripe(mot text) on commit drop;
create temporary table vocab_registre(mot text) on commit drop;
create temporary table vocab_octroi(mot text) on commit drop;

-- (1) `v_allowed`. On extrait LE TABLEAU, pas le corps entier : les noms de
-- droits réapparaissent plus bas dans la projection (`addon_vitrine = ... and
-- 'vitrine' = any(...)`), et lire tout le corps rendrait ce test vert alors
-- que la constante n'aurait pas bougé d'un caractère.
insert into vocab_stripe(mot)
select distinct m[1]
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral regexp_matches(
    pg_catalog.substring(
      p.prosrc, 'v_allowed constant text\[\] :=\s*(array\[[^\]]*\])'
    ),
    '''([a-z_]+)''',
    'g'
  ) as m
 where n.nspname = 'public'
   and p.proname = 'apply_stripe_subscription_event_v2';

-- (2) et (3) : les deux `check`. `pg_get_constraintdef` rend
-- « CHECK ((entitlement = ANY (ARRAY['core'::text, ...]))) » — seules les
-- valeurs y sont entre apostrophes, le nom de colonne ne l'est pas.
insert into vocab_registre(mot)
select distinct m[1]
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class t on t.oid = c.conrelid
  join pg_catalog.pg_namespace n on n.oid = t.relnamespace
  cross join lateral regexp_matches(
    pg_catalog.pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g'
  ) as m
 where n.nspname = 'public'
   and t.relname = 'organization_entitlements'
   and c.conname = 'organization_entitlements_entitlement_check';

insert into vocab_octroi(mot)
select distinct m[1]
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class t on t.oid = c.conrelid
  join pg_catalog.pg_namespace n on n.oid = t.relnamespace
  cross join lateral regexp_matches(
    pg_catalog.pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g'
  ) as m
 where n.nspname = 'public'
   and t.relname = 'organization_module_grants'
   and c.conname = 'organization_module_grants_module_check';


-- ════════════════════════════════════════════════════════════
-- 0. LES EXTRACTIONS ONT TROUVÉ QUELQUE CHOSE
--
-- ── LE PIÈGE QUE CE BLOC DÉSAMORCE ──
--
-- Trois listes VIDES sont trois listes ÉGALES. Le jour où quelqu'un renomme
-- `v_allowed`, reformate le tableau sur une seule ligne, ou change le nom
-- d'une contrainte, les expressions rationnelles ci-dessus cesseraient de
-- matcher — et TOUTES les assertions de comparaison passeraient au vert, en
-- ayant cessé de vérifier quoi que ce soit. C'est la façon dont ce fichier
-- pourrait mentir, donc c'est la première chose qu'il prouve.
-- ════════════════════════════════════════════════════════════

select cmp_ok(
  (select pg_catalog.count(*)::bigint from vocab_stripe), '>=', 14::bigint,
  'v_allowed a été lu et porte au moins quatorze droits (sinon la regex ne matche plus et tout ce fichier ment)'
);

select cmp_ok(
  (select pg_catalog.count(*)::bigint from vocab_registre), '>=', 14::bigint,
  'le check du registre a été lu et porte au moins quatorze valeurs'
);

select cmp_ok(
  (select pg_catalog.count(*)::bigint from vocab_octroi), '>=', 14::bigint,
  'le check des octrois a été lu et porte au moins quatorze valeurs'
);


-- ════════════════════════════════════════════════════════════
-- 1. LE CŒUR — (1) ET (2) SONT LE MÊME VOCABULAIRE
--
-- `organization_entitlements_entitlement_check` est le miroir déclaré de
-- `v_allowed` : son propre commentaire de contrainte le dit. Un miroir qui
-- diverge n'est plus un miroir. La divergence est fatale dans les DEUX sens :
--
--   * un mot dans `v_allowed` mais pas dans le `check` → la RPC accepte le
--     droit, puis son propre insert dérivé viole la contrainte : le webhook
--     échoue APRÈS avoir écrit les colonnes `addon_*` ;
--   * un mot dans le `check` mais pas dans `v_allowed` → le droit est
--     inscriptible mais aucun abonnement ne peut le poser : il est mort.
-- ════════════════════════════════════════════════════════════

select set_eq(
  'select mot from vocab_stripe',
  'select mot from vocab_registre',
  'v_allowed et le check du registre portent EXACTEMENT le même vocabulaire'
);


-- ════════════════════════════════════════════════════════════
-- 2. (2) ET (3) S'ACCORDENT, AU SEUL ÉCART CONNU PRÈS
--
-- Les deux listes ne sont pas identiques et ne doivent pas l'être : le produit
-- de base s'appelle `core` côté DROIT (ce qu'une offre contient) et `wheel`
-- côté MODULE (ce qu'on octroie). C'est le même produit sous deux noms, et
-- c'est le SEUL écart légitime — `MODULE_ADDON_COLUMN` côté TypeScript porte
-- la même asymétrie, `wheel` étant la seule clé à colonne nulle.
--
-- On normalise donc `core` → `wheel`, puis on exige l'égalité stricte. Tout
-- autre écart est un droit qui n'existe que d'un côté : soit octroyable et
-- invendable, soit vendable et non octroyable.
-- ════════════════════════════════════════════════════════════

select set_eq(
  $$select case when mot = 'core' then 'wheel' else mot end from vocab_registre$$,
  'select mot from vocab_octroi',
  'le registre et les octrois portent le même vocabulaire, modulo core (droit) = wheel (module)'
);


-- ════════════════════════════════════════════════════════════
-- 3. LE DROIT QUI A COÛTÉ CE FICHIER
--
-- Redondant avec les deux assertions ci-dessus — délibérément. Elles disent
-- « les trois s'accordent » ; celle-ci nomme le cas qui a échoué, pour qu'un
-- rouge futur se lise sans avoir à relire l'histoire.
-- ════════════════════════════════════════════════════════════

select ok(
  (select pg_catalog.bool_or(mot = 'rendez_vous') from vocab_stripe),
  'rendez_vous est admis par v_allowed — le webhook ne lève plus au premier achat de « Sur Place »'
);

select ok(
  (select pg_catalog.bool_or(mot = 'rendez_vous') from vocab_registre),
  'rendez_vous est inscriptible au registre des droits'
);

select ok(
  (select pg_catalog.bool_or(mot = 'rendez_vous') from vocab_octroi),
  'rendez_vous reste octroyable depuis le back-office (acquis de 20261108120000)'
);


-- ════════════════════════════════════════════════════════════
-- 4. ADMIS NE SUFFIT PAS — CHAQUE DROIT DOIT ÊTRE POSÉ
--
-- ── LE SECOND DÉFAUT, ET POURQUOI IL EST PIRE QUE LE PREMIER ──
--
-- Le premier défaut criait : la RPC levait, le webhook rendait 500, Stripe
-- coupait. Le second est muet. `apply_stripe_subscription_event_v2` n'écrivait
-- pas `addon_rendez_vous` : si l'on s'était contenté d'élargir `v_allowed`,
-- l'achat aurait réussi, le registre aurait porté « rendez_vous, active =
-- true », les écrans de facturation auraient affiché le module comme acquis —
-- et `org_has_module_access` aurait répondu NON, parce qu'elle lit la colonne.
-- Un commerçant payant sans son agenda, et rien nulle part pour le dire.
--
-- La règle générale : tout droit SAUF le socle porte une colonne `addon_*`,
-- que le webhook écrit et que le garde-fou défend. `core` en est exempt — il
-- EST l'abonnement, il n'a pas d'interrupteur (`MODULE_ADDON_COLUMN.wheel`
-- vaut `null`, et `module-access-parity.test.ts` épingle ce « un seul »).
--
-- Ces trois assertions sont DÉRIVÉES du vocabulaire : elles couvriront
-- automatiquement le quinzième droit sans qu'une ligne soit ajoutée ici.
-- ════════════════════════════════════════════════════════════

-- 4a. La colonne existe.
select is(
  (select pg_catalog.string_agg(v.mot, ', ' order by v.mot)
     from vocab_stripe v
    where v.mot <> 'core'
      and not exists (
        select 1 from pg_catalog.pg_attribute a
         where a.attrelid = 'public.organizations'::regclass
           and a.attname = 'addon_' || v.mot
           and a.attnum > 0
           and not a.attisdropped
      )),
  null,
  'chaque droit hors socle porte sa colonne organizations.addon_* (aucun droit sans interrupteur)'
);

-- 4b. Le webhook l'écrit. C'est l'assertion qui aurait attrapé le second
-- défaut : `addon_rendez_vous` existait, `org_has_module_access` la lisait,
-- et personne ne l'écrivait.
select is(
  (select pg_catalog.string_agg(v.mot, ', ' order by v.mot)
     from vocab_stripe v
    where v.mot <> 'core'
      and not exists (
        select 1
          from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'apply_stripe_subscription_event_v2'
           and pg_catalog.strpos(
                 p.prosrc, 'addon_' || v.mot || ' = v_access_active'
               ) > 0
      )),
  null,
  'apply_stripe_subscription_event_v2 ÉCRIT la colonne de chaque droit (admis sans être posé = commerçant payant sans son module)'
);

-- 4c. Le garde-fou la défend. Une colonne que Stripe écrit et que le trigger
-- ignore se laisse basculer depuis le back-office, puis se fait écraser au
-- prochain événement Stripe — sans erreur, sans trace, sans cause visible.
select is(
  (select pg_catalog.string_agg(v.mot, ', ' order by v.mot)
     from vocab_stripe v
    where v.mot <> 'core'
      and not exists (
        select 1
          from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'protect_stripe_managed_entitlements'
           and pg_catalog.strpos(p.prosrc, 'new.addon_' || v.mot) > 0
      )),
  null,
  'protect_stripe_managed_entitlements DÉFEND la colonne de chaque droit piloté par Stripe'
);


-- ════════════════════════════════════════════════════════════
-- 5. ET LE MODULE SE LIT — `org_has_module_access` RÉPOND POUR CHAQUE CLÉ
--
-- Dernier maillon : un droit posé que la fonction d'accès ne sait pas lire
-- reste fermé. Le `case` de `org_has_module_access` n'a pas de branche
-- `else` — une clé absente rend `null`, donc `coalesce(..., false)`, donc
-- « fermé », silencieusement.
-- ════════════════════════════════════════════════════════════

select is(
  (select pg_catalog.string_agg(v.mot, ', ' order by v.mot)
     from vocab_octroi v
    where not exists (
        select 1
          from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'org_has_module_access'
           and pg_catalog.strpos(p.prosrc, '''' || v.mot || '''') > 0
      )),
  null,
  'org_has_module_access porte une branche pour chaque module octroyable (une clé absente rend null, donc « fermé », sans bruit)'
);


select * from finish();
rollback;
