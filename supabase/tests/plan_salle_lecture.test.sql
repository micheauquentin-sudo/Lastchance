-- ============================================================
-- LE PLAN DE SALLE SE LIT — 20261109120000 (RDV-7)
--
-- Six assertions, et une seule idée : le commerçant doit voir OÙ est assis
-- son client, et ne doit toujours pas voir SON ADRESSE.
-- ============================================================

begin;
select plan(6);


-- ────────────────────────────────────────────────────────────
-- PSL-1..2 · Ce que RDV-6 avait oublié
-- ────────────────────────────────────────────────────────────

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.reservations', 'table_id', 'SELECT'),
  'PSL-1 · table_id est lisible : sans elle le plan de salle affiche des tables vides'
);

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.reservations', 'party_size', 'SELECT'),
  'PSL-2 · party_size reste lisible : la jauge somme des personnes, pas des lignes'
);


-- ────────────────────────────────────────────────────────────
-- PSL-3 · CE QUI NE DOIT JAMAIS DEVENIR LISIBLE
--
-- L'adresse email n'existe que pour l'envoi serveur. Un `grant select` de
-- TABLE — geste banal ailleurs — la ferait fuir vers tout membre de
-- l'organisation sans qu'aucune requête applicative ne change.
-- ────────────────────────────────────────────────────────────

select ok(
  not pg_catalog.has_column_privilege(
    'authenticated', 'public.reservations', 'email', 'SELECT'),
  'PSL-3 · email n''est PAS lisible par authenticated'
);

select ok(
  not pg_catalog.has_column_privilege(
    'anon', 'public.reservations', 'table_id', 'SELECT'),
  'PSL-4 · anon ne lit rien de reservations, table_id comprise'
);


-- ────────────────────────────────────────────────────────────
-- PSL-5..6 · L'ÉCRITURE N'A PAS BOUGÉ
--
-- `table_id` se lit, elle ne s'écrit pas depuis une session : seule
-- `reserve_table`, en `security definer`, choisit une table. Un grant
-- d'écriture ici laisserait un commerçant asseoir un client à une table déjà
-- prise, en contournant le verrou d'avis.
-- ────────────────────────────────────────────────────────────

select ok(
  not pg_catalog.has_column_privilege(
    'authenticated', 'public.reservations', 'table_id', 'UPDATE'),
  'PSL-5 · table_id ne s''écrit pas depuis une session : reserve_table seule affecte'
);

select ok(
  not pg_catalog.has_column_privilege(
    'authenticated', 'public.reservations', 'table_id', 'INSERT'),
  'PSL-6 · table_id ne s''insère pas depuis une session'
);


select * from finish();
rollback;
