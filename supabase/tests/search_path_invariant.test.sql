-- ============================================================
-- INVARIANT — toute fonction du schéma `public` fige son `search_path`
--
-- Ce que cet invariant remplace : une liste de 22 exceptions qu'il fallait
-- connaître. Une règle qu'une requête vérifie vaut mieux qu'une liste dans une
-- tête — c'est le même principe que `pgtap-coverage.test.ts` (fichiers pgTAP ⇄
-- commande CI), `release.test.ts` (constante ⇄ dossier de migrations) et
-- `cron-coverage.test.ts` (workers ⇄ routes ⇄ ordonnanceur).
--
-- ── Pourquoi ça compte, et pourquoi ce n'est PAS une faille ──
--
-- Une fonction `security definer` s'exécute avec les droits de son
-- propriétaire. Si son `search_path` n'est pas figé, un appelant peut lui faire
-- résoudre `ma_table` vers un objet qu'il contrôle. Sur ce projet l'attaque est
-- déjà fermée par ailleurs — `anon`, `authenticated` et `service_role` ont
-- `CREATE = false` sur `public` — mais cette fermeture-là dépend d'un privilège
-- de schéma que personne ne vérifie, alors que celle-ci se vérifie ici.
--
-- ── CE QUI FERAIT ROUGIR CE TEST ──
--
-- Écrire une nouvelle fonction sans `set search_path = ''`, ou en remettre une
-- à `= public`. C'est exactement le geste qu'on veut rendre visible : il est
-- silencieux au déploiement, et personne ne le remarque à la relecture d'une
-- migration de 300 lignes.
--
-- Le contrôle de PORTÉE (assertion 3) existe parce qu'une garde qui compte des
-- exceptions est vraie sur un ensemble vide : si la requête cessait de voir les
-- fonctions, l'invariant verdirait sans rien garder. Ce projet a déjà livré un
-- test vert qui ne testait rien.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ── 1. Aucune fonction sans search_path DU TOUT ──────────────
-- Le pire cas : le chemin de l'appelant s'applique intégralement.
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and (p.proconfig is null
           or not exists (select 1 from unnest(p.proconfig) c
                           where c like 'search_path=%'))),
  '',
  'aucune fonction de public ne laisse son search_path au hasard'
);

-- ── 2. Aucune ne se contente de `= public` ───────────────────
-- `= public` ferme l'attaque tant que personne ne peut créer dans `public`.
-- `= ''` la ferme sans dépendre de ce privilège : rien n'est plus résolu
-- implicitement, donc rien ne peut être masqué.
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and 'search_path=public' = any(p.proconfig)),
  '',
  'aucune fonction de public ne se contente de search_path = public'
);

-- ── 3. CONTRÔLE DE PORTÉE ────────────────────────────────────
-- Sans lui, les deux assertions ci-dessus seraient vraies sur un ensemble
-- vide — un invariant qui ne garde rien.
select cmp_ok(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'),
  '>=', 200,
  'l''invariant porte bien sur les ~200 fonctions du schéma, pas sur un ensemble vide'
);

-- ── 4. Les deux prédicats de la RLS, nommément ───────────────
-- Ils méritent leur propre assertion : ce sont eux qui décident de tout accès
-- marchand, et une régression sur eux ne se verrait nulle part ailleurs.
select is(
  (select coalesce(string_agg(p.proname || '=' || array_to_string(p.proconfig, ','), ' | '
                              order by p.proname), '(absent)')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_org_member', 'is_org_owner', 'is_org_editor')),
  -- Postgres stocke la chaîne vide QUOTÉE : `search_path=""`, et non
  -- `search_path=`. Écrire l'attendu à la main sans le vérifier donne un rouge
  -- de FORME qui ressemble à un rouge de fond — c'est ce qui s'est produit au
  -- premier passage, alors que la migration était parfaitement appliquée.
  'is_org_editor=search_path="" | is_org_member=search_path="" | is_org_owner=search_path=""',
  'les trois prédicats de la RLS figent leur search_path à la chaîne vide'
);

select * from finish();
rollback;
