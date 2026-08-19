-- ============================================================
-- « RÉSERVER » — LE COMMERÇANT PEUT ENFIN LIBÉRER UNE PLACE
--
-- Correctif de revue de sécurité du lot L4 (finding M-4a). Le socle
-- 20261002120000 n'a livré qu'UN chemin d'annulation, `cancel_reservation`, et
-- il exige l'empreinte du cookie du joueur. Aucune écriture directe n'est
-- ouverte non plus : `reservations` n'a AUCUN grant `update` à `authenticated`.
-- Conséquence, telle qu'elle se vivait au comptoir : un client qui annule par
-- téléphone — le cas le plus banal d'un restaurant ou d'un atelier — laissait sa
-- place gelée jusqu'à l'heure du créneau, et le commerçant n'avait littéralement
-- aucun geste pour la rendre. Un module de réservation dont on ne peut pas
-- annuler une réservation.
--
-- ── CE QUE CETTE RPC AJOUTE, ET CE QU'ELLE N'AJOUTE PAS ──
--
-- Elle ajoute UN geste, audité, borné à une organisation. Elle n'ouvre AUCUN
-- grant de table, ne touche à AUCUNE colonne, et ne change RIEN aux trois RPC
-- existantes : la migration précédente est en production, elle n'est pas
-- réécrite.
--
-- ── LES CINQ PROPRIÉTÉS QU'ELLE DOIT TENIR ──
--
--   1. LE MÊME VERROU D'AVIS que `reserve_slot` et `cancel_reservation` —
--      organisation ET créneau. Une troisième RPC qui libère une place sous une
--      AUTRE clé cesserait de se sérialiser avec le comptage de capacité : deux
--      transactions verraient le même créneau dans deux états. La clé se recopie
--      donc à l'identique, et le fichier pgTAP la revérifie dans `pg_locks`.
--   2. UNE ARRIVÉE RESTE UNE ARRIVÉE. `already_checked_in`, comme le chemin
--      joueur. Le client est passé ; réécrire l'histoire fausserait le taux de
--      présence — la seule mesure que le commerçant tire de ce module — et la
--      contrainte `reservations_terminal_state` refuserait la ligne de toute
--      façon.
--   3. IDEMPOTENCE. Deux clics sur le même bouton rendent le même état, et
--      surtout ne repoussent pas `cancelled_at`.
--   4. INDISTINGUABILITÉ. Un identifiant inconnu et l'identifiant d'une
--      réservation d'une AUTRE organisation rendent EXACTEMENT `unknown` : le
--      filtre org-scopé est le même dans les deux cas, donc la réponse aussi.
--      Sans quoi ce bouton deviendrait un oracle d'existence sur les
--      réservations du commerce d'en face.
--   5. L'ACTEUR EST VÉRIFIÉ EN SQL. Comme `checkin_reservation` : un `p_actor`
--      libre ferait de la ligne d'audit une déclaration sur l'honneur.
--
-- ── POURQUOI `owner`/`editor` ET PAS LE CAISSIER, ALORS QUE LE CHECK-IN L'ACCEPTE ──
--
-- Les deux gestes ne font pas la même chose au client. Enregistrer une arrivée
-- CONSTATE ce qui vient de se produire au comptoir ; annuler RETIRE à quelqu'un
-- une place qu'il détient, sans qu'il soit là pour le voir. Le premier est un
-- geste de service, le second un geste de gestion — et c'est exactement la
-- ligne que le socle a déjà tracée pour la configuration des créneaux
-- (`reservation_slots: editors`). Un caissier qui doit libérer une place le
-- demande à son responsable ; l'inverse — un poste de caisse ouvert en salle
-- qui peut désinscrire des clients — n'a pas de contrepartie utile.
--
-- ── LA BORNE `too_late` EST REPRISE DU CHEMIN JOUEUR, DÉLIBÉRÉMENT ──
--
-- Elle ne coûte RIEN au cas qui motive cette RPC : sur un créneau déjà commencé,
-- la place libérée ne serait reprise par personne — `reserve_slot` exige
-- `starts_at > now()`. Ce qu'elle empêche, en revanche, est réel : sans elle, un
-- no-show s'efface du taux de présence d'un clic, et c'est le commerçant
-- lui-même qui réécrit sa propre statistique. Le no-show reste `confirmed` et
-- non arrivé — c'est une information, pas un accident à masquer.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- `cancel_reservation_staff` — l'annulation au nom du commerce
--
-- Signature volontairement DISTINCTE de `cancel_reservation(uuid, text)` : deux
-- fonctions homonymes que Postgres départagerait sur les seuls types
-- d'arguments seraient un piège de relecture (`(uuid, text)` contre
-- `(uuid, uuid, text)`), et surtout un `drop` mal visé emporterait la mauvaise.
-- Le nom porte donc l'autorisation qu'il applique.
--
-- L'ORGANISATION EST UN PARAMÈTRE ICI, contrairement au chemin joueur où elle
-- est lue sur la ligne. Ce n'est pas une incohérence : côté joueur, la preuve
-- est l'empreinte du cookie, et demander l'organisation n'ajouterait rien.
-- Côté staff, l'organisation EST l'autorisation — c'est elle qu'on vérifie
-- contre `organization_members`, et c'est elle qui borne la lecture.
-- ────────────────────────────────────────────────────────────

create or replace function public.cancel_reservation_staff(
  p_organization_id uuid,
  p_reservation_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_slot_id uuid;
  v_starts_at timestamptz;
  v_row public.reservations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  -- Même garde de forme que `checkin_reservation` : l'acteur est un UUID de
  -- membre, et il est REVÉRIFIÉ ci-dessous. `btrim` comparé à lui-même refuse
  -- l'espace de tête ou de queue, qui ferait diverger la ligne d'audit de la
  -- valeur réellement utilisée.
  if p_actor is null
     or p_actor <> pg_catalog.btrim(p_actor)
     or p_actor !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_actor_id := p_actor::uuid;

  -- L'APPARTENANCE EST TRANCHÉE AVANT TOUT LE RESTE — avant la lecture, avant
  -- le verrou. Un non-membre ne doit pas pouvoir faire prendre à la base un
  -- verrou d'avis sur le créneau d'un commerce dont il n'est pas.
  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = v_actor_id
       and om.role in ('owner', 'editor')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Lecture SANS verrou, pour connaître le créneau — l'autre moitié de la clé de
  -- verrou. Rien n'est décidé dessus : tout est relu sous verrou ci-dessous.
  -- AUCUN filtre sur le marqueur de purge, contrairement au chemin joueur : une
  -- ligne purgée reste une réservation vivante de CE commerce, qui occupe une
  -- place réelle. Refuser de la libérer condamnerait le siège jusqu'au créneau.
  select r.slot_id into v_slot_id
    from public.reservations r
   where r.id = p_reservation_id
     and r.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- LA MÊME CLÉ QUE `reserve_slot` ET `cancel_reservation`, organisation
  -- comprise. C'est ce qui fait que les trois RPC s'attendent réellement les
  -- unes les autres : la place « revient » sans qu'aucun compteur ne soit
  -- décrémenté — le comptage de `reserve_slot` cesse simplement de voir cette
  -- ligne — et ce raisonnement n'est juste que sous le MÊME verrou.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_slot:' || p_organization_id::text || ':' || v_slot_id::text,
      0)
  );

  select r.* into v_row
    from public.reservations r
   where r.id = p_reservation_id
     and r.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- Le créneau est relu séparément — un `into` PL/pgSQL n'accepte pas un
  -- %rowtype et un scalaire dans la même liste — mais sous le MÊME verrou.
  select s.starts_at into v_starts_at
    from public.reservation_slots s
   where s.id = v_row.slot_id
     and s.organization_id = p_organization_id;

  if v_row.status = 'checked_in' then
    return pg_catalog.jsonb_build_object(
      'state', 'already_checked_in',
      'reservation_id', v_row.id
    );
  end if;

  -- IDEMPOTENCE, et AVANT `too_late` comme dans le chemin joueur : une
  -- réservation déjà annulée le reste, que son créneau soit passé ou non. Un
  -- refus à ce stade laisserait le commerçant croire qu'elle est encore due.
  if v_row.status = 'cancelled' then
    return pg_catalog.jsonb_build_object(
      'state', 'cancelled',
      'reservation_id', v_row.id,
      'cancelled_at', v_row.cancelled_at
    );
  end if;

  if v_starts_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object(
      'state', 'too_late',
      'reservation_id', v_row.id,
      'starts_at', v_starts_at
    );
  end if;

  update public.reservations
     set status = 'cancelled',
         cancelled_at = pg_catalog.now()
   where id = v_row.id
  returning * into v_row;

  -- AUDITÉE, et seulement sur le geste RÉEL — motif `reservation.checkin`
  -- (20261002120000). Un journal qui enregistrerait aussi les refus et les
  -- répétitions dirait « ce responsable a annulé quatre fois » là où il a
  -- cliqué quatre fois sur une ligne déjà annulée. C'est la seule trace de QUI
  -- a retiré sa place à un client : `reservations` ne porte pas de colonne
  -- `cancelled_by`, et lui en ajouter une aurait modifié une table en
  -- production pour redire ce que le journal dit déjà.
  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor, 'reservation.cancel_staff',
          pg_catalog.jsonb_build_object(
            'reservation_id', v_row.id,
            'slot_id', v_row.slot_id));

  return pg_catalog.jsonb_build_object(
    'state', 'cancelled',
    'reservation_id', v_row.id,
    'cancelled_at', v_row.cancelled_at
  );
end;
$$;

comment on function public.cancel_reservation_staff(uuid, uuid, text) is
  'Annule une réservation AU NOM DU COMMERCE. Org-scopée, acteur obligatoire et '
  'vérifié membre owner/editor EN SQL (le caissier en est exclu : annuler '
  'retire une place à un client, c''est un geste de gestion, pas de comptoir), '
  'idempotente, auditée sous `reservation.cancel_staff`. Refuse '
  '`already_checked_in` sur une arrivée enregistrée et `too_late` sur un '
  'créneau déjà commencé. Réponse INDISTINGUABLE — `unknown` — pour un '
  'identifiant inconnu et pour une réservation d''une AUTRE organisation. '
  'Libère la place sous le MÊME verrou d''avis (organisation + créneau) que '
  'reserve_slot et cancel_reservation, sans décrémenter aucun compteur.';

revoke all on function public.cancel_reservation_staff(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_reservation_staff(uuid, uuid, text)
  to service_role;
