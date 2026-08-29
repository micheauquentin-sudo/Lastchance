-- ============================================================
-- LES QUATRE RÉGLAGES DE RENDEZ-VOUS DEVIENNENT ÉCRIVABLES (RDV-12)
--
-- ── LA LACUNE, ET SON ÉTENDUE ──
--
-- 20261106120000 (RDV-1) a ajouté quatre colonnes à `reservation_activities` —
-- `booking_mode`, `slot_capacity`, `booking_horizon_days`, `lead_time_minutes` —
-- et n'a accordé NI `insert` NI `update` dessus. Sur cette table, les droits
-- d'écriture sont accordés COLONNE PAR COLONNE (20261002120000:417, étendu par
-- 20261006120000 et 20261007120000) : une colonne neuve n'hérite de rien.
--
-- Conséquence, et elle est totale : `enregistrerReglagesRendezVous`
-- (`src/actions/reserver.ts`) écrit ces quatre colonnes avec le client de
-- SESSION. Postgres refusait l'`update` — « permission denied for column » —
-- donc **aucune activité n'a jamais pu passer en `booking_mode =
-- 'rendez_vous'`** depuis le tableau de bord. Tout le module Réservation
-- livré par RDV-1 à RDV-11 — horaires récurrents, génération de créneaux, plan
-- de salle, tables, liste d'attente par effectif — reposait sur un mode que
-- personne ne pouvait poser.
--
-- Le défaut a survécu à six lots parce que chaque morceau était juste
-- isolément : la RPC, les écrans, les schémas, tous testés et verts. Ce qui
-- manquait n'était dans aucun d'eux — c'était le droit d'écrire la colonne qui
-- les relie. Aucune garde du dépôt ne compare les colonnes d'une table à ce
-- que les server actions y écrivent.
--
-- ── POURQUOI LES QUATRE, ET PAS SEULEMENT `booking_mode` ──
--
-- `reservation_activities_rendez_vous_complete_check` refuse un `rendez_vous`
-- sans `duration_minutes` ni `slot_capacity`. Accorder le mode sans la
-- capacité ferait échouer chaque écriture sur la contrainte, en remplaçant un
-- refus de droit par un refus d'intégrité — le même mur, repeint.
-- `booking_horizon_days` et `lead_time_minutes` voyagent dans le même
-- formulaire ; les laisser dehors le couperait en deux sans raison.
--
-- ── CE QUE CE FICHIER N'ACCORDE PAS ──
--
--   * `table_turn_minutes` (20261108120000) est traitée plus bas, section 2 :
--     elle a exactement le même défaut, et `enregistrerDureeService` l'écrit.
--   * RIEN sur `reservations` ni sur `reservation_waitlist_entries` : leurs
--     colonnes restent sous grant nominatif, et `email` hors de portée.
--   * Aucune policy. Les policies disent QUELLES LIGNES — `is_org_editor` les
--     borne déjà — et les grants QUELLES COLONNES. Les deux sont nécessaires,
--     et seule la seconde manquait.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Les quatre réglages de RDV-1
--
-- `insert` ET `update` : la création pose le mode (RDV-11, un restaurant naît
-- `rendez_vous`), et le panneau de réglages le change ensuite.
-- ────────────────────────────────────────────────────────────

grant insert (booking_mode, slot_capacity, booking_horizon_days, lead_time_minutes)
  on public.reservation_activities to authenticated;
grant update (booking_mode, slot_capacity, booking_horizon_days, lead_time_minutes)
  on public.reservation_activities to authenticated;


-- ────────────────────────────────────────────────────────────
-- 2. La durée d'occupation d'une table (RDV-6)
--
-- Même omission, même lot suivant : 20261108120000 a ajouté
-- `table_turn_minutes` sans l'accorder, et `enregistrerDureeService` l'écrit
-- avec le client de session. L'étape « durée de service » de l'assistant
-- échouait donc silencieusement — le commerçant enregistrait, le message
-- disait « Enregistrement impossible », et rien n'expliquait pourquoi.
--
-- Elle ne s'INSÈRE pas : une activité naît avec la valeur par défaut de la
-- colonne (90 minutes), et le commerçant l'ajuste ensuite. Accorder l'insertion
-- ouvrirait un champ de formulaire que personne ne rend.
-- ────────────────────────────────────────────────────────────

grant update (table_turn_minutes)
  on public.reservation_activities to authenticated;


-- ────────────────────────────────────────────────────────────
-- 3. GARDE — vérifier ce qu'on vient d'accorder, et ce qui doit rester fermé
--
-- Un `grant` sans effet (mauvais rôle, colonne mal orthographiée) ne lève pas :
-- il passe, et la panne reste intacte pendant que le fichier passe pour
-- appliqué. C'est exactement ce qui s'est produit ici — à ceci près que le
-- grant manquant n'a même pas été écrit.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_colonne text;
begin
  foreach v_colonne in array array[
    'booking_mode', 'slot_capacity', 'booking_horizon_days',
    'lead_time_minutes', 'table_turn_minutes'
  ] loop
    if not pg_catalog.has_column_privilege(
         'authenticated', 'public.reservation_activities', v_colonne, 'UPDATE')
    then
      raise exception
        'reservation_activities.% n est toujours pas modifiable : le panneau de reglages continuerait d echouer en silence', v_colonne;
    end if;
  end loop;

  -- L'INSERTION, elle, ne couvre que les quatre de RDV-1.
  if not pg_catalog.has_column_privilege(
       'authenticated', 'public.reservation_activities', 'booking_mode', 'INSERT')
  then
    raise exception
      'reservation_activities.booking_mode n est pas insérable : une salle creee depuis l ecran Reservation naitrait Moment et disparaitrait de la liste';
  end if;

  -- CONTRÔLE NÉGATIF — ET IL A CORRIGÉ MA PRÉMISSE.
  --
  -- J'avais écrit ici qu'`organization_id` n'est pas insérable. C'est FAUX :
  -- le socle l'accorde (20261002120000:418), et il le devait — la server
  -- action l'écrit depuis la session, donc la colonne doit être écrivable.
  -- Ce qui empêche un formulaire de déclarer l'organisation du voisin n'est
  -- pas le grant, c'est le `with check (is_org_editor(organization_id))` de
  -- la policy. Le grant dit QUELLES COLONNES, la policy QUELLES LIGNES.
  --
  -- Le contrôle utile est donc l'autre : on ne DÉPLACE pas une activité.
  -- Aucun `grant update` n'a jamais couvert `organization_id`, et lui en
  -- ouvrir un laisserait un éditeur transférer son activité — créneaux,
  -- réservations et arrivées compris — chez quelqu'un d'autre.
  if pg_catalog.has_column_privilege(
       'authenticated', 'public.reservation_activities', 'organization_id', 'UPDATE')
  then
    raise exception
      'reservation_activities.organization_id est devenu modifiable : une activite pourrait changer d organisation, avec ses creneaux et ses arrivees';
  end if;
end
$migration$;


comment on column public.reservation_activities.booking_mode is
  'D''OÙ VIENNENT LES CRÉNEAUX : `moment` = posés à la main, un par un ; '
  '`rendez_vous` = engendrés par les règles de reservation_openings sur '
  'booking_horizon_days. À NE PAS CONFONDRE avec `kind`, qui est le FORMAT de '
  'ce qu''on réserve (standard / signature / duo). Écrivable depuis une '
  'session seulement depuis RDV-12 : RDV-1 avait posé la colonne sans son '
  'grant, et aucune activité ne pouvait passer en rendez-vous.';
