-- ============================================================
-- LE NONCE DE REJEU EST BORNÉ AU COMMERCE (JOB-9)
--
-- `spins_idempotency_key_idx` était unique sur la SEULE clé : deux commerces
-- dont les serveurs choisissaient le même nonce partageaient une contrainte,
-- et le second tirage échouait en 23505 chez quelqu'un qui n'avait rien fait.
--
-- Trois assertions, et la troisième est celle qui empêche le correctif de
-- devenir une régression :
--
--   1. DEUX COMMERCES, MÊME NONCE : les deux tirages passent.
--   2. UN COMMERCE, MÊME NONCE, AUTRE JOUEUR : 23505, comme avant. La
--      propriété que 20260927120000 défendait explicitement — « un nonce
--      rejoué par quelqu'un d'autre ne peut pas produire un second spin » —
--      survit là où elle a un sens.
--   3. LE REJEU MARCHE ENCORE. C'est le vrai risque de ce lot : l'index sert
--      AUSSI de chemin de lecture (`where idempotency_key = … and wheel_id = …
--      and player_key = …`, SANS organisation). Mené par `organization_id`, il
--      cesserait de servir cette lecture. Cette assertion prouve la fonction ;
--      l'ordre des colonnes, lui, est justifié dans la migration.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Deux commerces, complets et indépendants. `play_limit = 'unlimited'` partout :
-- la garde de fenêtre ne doit jamais masquer ce qu'on mesure ici.
insert into public.organizations (id, name, slug) values
  ('7a000000-0000-4000-8000-00000000000a', 'Nonce A', 'tap-nonce-a'),
  ('7a000000-0000-4000-8000-00000000000b', 'Nonce B', 'tap-nonce-b');

insert into public.campaigns (id, organization_id, name, status) values
  ('7a000000-0000-4000-8000-0000000000a2', '7a000000-0000-4000-8000-00000000000a',
   'Campagne A', 'active'),
  ('7a000000-0000-4000-8000-0000000000b2', '7a000000-0000-4000-8000-00000000000b',
   'Campagne B', 'active');

insert into public.wheels (id, organization_id, campaign_id, name, play_limit) values
  ('7a000000-0000-4000-8000-0000000000a3', '7a000000-0000-4000-8000-00000000000a',
   '7a000000-0000-4000-8000-0000000000a2', 'Roue A', 'unlimited'),
  ('7a000000-0000-4000-8000-0000000000b3', '7a000000-0000-4000-8000-00000000000b',
   '7a000000-0000-4000-8000-0000000000b2', 'Roue B', 'unlimited');

-- ── L'index a la forme annoncée ──────────────────────────────
-- Une assertion de catalogue, parce que l'ORDRE DES COLONNES est le cœur de la
-- migration et qu'aucun test fonctionnel ne le distingue : les deux ordres
-- disent la même unicité, un seul sert encore de chemin de lecture.
select is(
  (select pg_catalog.pg_get_indexdef(c.oid)
     from pg_catalog.pg_class c
    where c.relname = 'spins_idempotency_key_org_idx'),
  'CREATE UNIQUE INDEX spins_idempotency_key_org_idx ON public.spins '
    || 'USING btree (idempotency_key, organization_id) '
    || 'WHERE (idempotency_key IS NOT NULL)',
  'JOB-9-1 l''index est unique, partiel, et MENÉ PAR LA CLÉ — c''est ce qui lui laisse servir la recherche de rejeu, qui ne filtre pas sur l''organisation'
);

select ok(
  not exists(
    select 1 from pg_catalog.pg_class
     where relname = 'spins_idempotency_key_idx'
  ),
  'JOB-9-2 … et l''index globalement unique a bien disparu : deux gardes concurrentes en laisseraient une faire le travail de l''autre sans qu''on sache laquelle'
);

-- ── (a) DEUX COMMERCES, MÊME NONCE ───────────────────────────
-- Le défaut corrigé, en deux instructions. `p_force_losing = true` rend le
-- tirage déterministe : la ligne est écrite avec son nonce, sans lot, sans
-- stock à décrémenter — on mesure l'index, pas le hasard.

select lives_ok(
  $$select * from public.perform_atomic_spin(
      '7a000000-0000-4000-8000-00000000000a',
      '7a000000-0000-4000-8000-0000000000a2',
      '7a000000-0000-4000-8000-0000000000a3',
      repeat('a', 64), null, 'direct', true, 'nonce-partage')$$,
  'JOB-9-3 le commerce A tire avec son nonce'
);

select lives_ok(
  $$select * from public.perform_atomic_spin(
      '7a000000-0000-4000-8000-00000000000b',
      '7a000000-0000-4000-8000-0000000000b2',
      '7a000000-0000-4000-8000-0000000000b3',
      repeat('b', 64), null, 'direct', true, 'nonce-partage')$$,
  'JOB-9-4 LE COMMERCE B TIRE AVEC LE MÊME NONCE : l''indisponibilité croisée a disparu — avant ce lot, ce second appel levait 23505'
);

select is(
  (select count(*)::int from public.spins where idempotency_key = 'nonce-partage'),
  2,
  'JOB-9-5 … et les deux spins existent bel et bien, un par commerce'
);

-- ── (b) UN COMMERCE, MÊME NONCE, AUTRE JOUEUR ────────────────
-- LA CONTRE-ÉPREUVE. Sans elle, les assertions ci-dessus resteraient vertes
-- sur un index qu'on aurait simplement supprimé, ce qui serait une régression
-- de sécurité et non un correctif : le rejeu d'un nonce au sein d'un commerce
-- doit toujours se heurter à l'unicité.
select throws_ok(
  $$select * from public.perform_atomic_spin(
      '7a000000-0000-4000-8000-00000000000a',
      '7a000000-0000-4000-8000-0000000000a2',
      '7a000000-0000-4000-8000-0000000000a3',
      repeat('c', 64), null, 'direct', true, 'nonce-partage')$$,
  '23505',
  null,
  'JOB-9-6 DANS LE MÊME COMMERCE, le nonce d''un autre joueur se heurte toujours à l''index : la propriété défendue par 20260927120000 survit là où elle a un sens'
);

-- ── (c) LE REJEU LIT ENCORE ──────────────────────────────────
-- Même commerce, même roue, MÊME joueur : la recherche bornée au joueur doit
-- retrouver la ligne et rendre son spin_id, sans rien réécrire.
select is(
  (select spin_id from public.perform_atomic_spin(
      '7a000000-0000-4000-8000-00000000000a',
      '7a000000-0000-4000-8000-0000000000a2',
      '7a000000-0000-4000-8000-0000000000a3',
      repeat('a', 64), null, 'direct', true, 'nonce-partage')),
  (select id from public.spins
    where idempotency_key = 'nonce-partage'
      and organization_id = '7a000000-0000-4000-8000-00000000000a'),
  'JOB-9-7 LE REJEU REND LE MÊME SPIN : la lecture (clé, roue, joueur) fonctionne toujours sous le nouvel index'
);

select is(
  (select count(*)::int from public.spins where idempotency_key = 'nonce-partage'),
  2,
  'JOB-9-8 … sans écrire de troisième ligne'
);

select * from finish();
rollback;
