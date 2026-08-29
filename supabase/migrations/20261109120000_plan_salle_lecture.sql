-- ============================================================
-- LE PLAN DE SALLE SE LIT (RDV-7)
--
-- ── LA LACUNE QUE CE FICHIER RÉPARE ──
--
-- 20261108120000 a ajouté `reservations.table_id` — et n'a PAS accordé sa
-- lecture. Sur cette table, ce n'est pas un détail : les droits y sont
-- accordés COLONNE PAR COLONNE (20261002120000:436), parce que `email` doit
-- rester hors de portée du commerçant. Une colonne neuve n'hérite donc de
-- rien, et `table_id` était invisible pour tout le monde sauf `service_role`.
--
-- Conséquence exacte, avant ce fichier : le commerçant pouvait CRÉER ses
-- tables, la base pouvait Y ASSEOIR ses clients — `reserve_table` écrit en
-- `security definer` —, mais l'écran ne pouvait pas dire QUI ÉTAIT OÙ. Le plan
-- de salle affichait des tables vides et une liste de réservations sans table.
--
-- Pire : PostgREST refuse en ENTIER un `select` qui touche une colonne non
-- accordée. Ajouter `table_id` à la liste de colonnes de
-- `reserver-context.ts` aurait donc cassé l'agenda TOUT ENTIER, et pas
-- seulement la salle — la panne se serait lue « les réservations ont disparu ».
--
-- ── CE QUE CE FICHIER NE FAIT PAS ──
--
--   * Il n'accorde RIEN d'autre. `email` reste hors du grant, et le reste de
--     la liste de 20261002120000 est inchangé — un `grant select (…)` est
--     ADDITIF en Postgres, il ne remplace pas les colonnes déjà accordées.
--   * Il ne touche à aucune policy : `reservations: members read` borne déjà
--     la lecture à l'organisation. Le grant dit QUELLES COLONNES, la policy dit
--     QUELLES LIGNES. Les deux restent nécessaires.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. La colonne de table devient lisible
-- ────────────────────────────────────────────────────────────

grant select (table_id) on public.reservations to authenticated;


-- ────────────────────────────────────────────────────────────
-- 2. GARDE — `email` n'a jamais été accordé, et ne doit pas l'être
--
-- Cette vérification ne défend pas contre ce fichier, qui n'accorde qu'une
-- colonne : elle défend contre le PROCHAIN. Le jour où quelqu'un écrira
-- `grant select on table public.reservations to authenticated` — geste banal
-- sur les quatorze autres tables du schéma — l'adresse email de chaque joueur
-- deviendrait lisible par tout membre de l'organisation, sans qu'aucun test
-- applicatif ne le remarque : la requête actuelle n'énumère pas `email`, elle
-- continuerait donc de passer.
--
-- On échoue ICI, à l'application, plutôt qu'en production.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_accorde boolean;
begin
  select pg_catalog.has_column_privilege(
           'authenticated', 'public.reservations', 'email', 'SELECT')
    into v_accorde;

  if v_accorde then
    raise exception
      'public.reservations.email est devenu lisible par authenticated : le grant de colonnes de 20261002120000 a ete remplace par un grant de table, et l adresse de chaque joueur fuit vers tout membre de l organisation';
  end if;

  -- Et l'inverse : la colonne qu'on vient d'accorder DOIT l'être. Un grant
  -- silencieusement sans effet (mauvais rôle, mauvais schéma) laisserait la
  -- panne intacte et ce fichier passerait pour appliqué.
  select pg_catalog.has_column_privilege(
           'authenticated', 'public.reservations', 'table_id', 'SELECT')
    into v_accorde;

  if not v_accorde then
    raise exception
      'public.reservations.table_id n est toujours pas lisible : le plan de salle resterait vide';
  end if;
end
$migration$;


comment on column public.reservations.table_id is
  'La table où cette réservation est assise. Nulle pour un MOMENT (atelier, '
  'file d''accueil) : seule une activité en `booking_mode = rendez_vous` en '
  'exige une, et le trigger `reservations_require_table` le garde. Lisible par '
  'les membres depuis RDV-7 — sans quoi le plan de salle ne peut pas dire qui '
  'est où.';
