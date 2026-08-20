-- ============================================================
-- RES-5 — ON NE CHANGE PAS LE FORMAT SOUS DES ENGAGEMENTS VIVANTS
--
-- ── LE DÉFAUT (revue du lot L8, sévérité MOYEN) ──
--
-- `reservation_activities.kind` est réglable à tout moment depuis le panneau
-- commerçant, et 20261007120000 en a fait L'UNITÉ DE COMPTAGE de toute la
-- capacité : sur `duo`, une réservation vaut deux personnes, PAR LES TROIS
-- PORTES. Le format est donc lu à CHAQUE appel, jamais figé au moment où un
-- engagement est pris — et c'est là que les deux se décrochent.
--
-- LE SCÉNARIO, EN QUATRE TEMPS ET SANS AUCUNE ERREUR AFFICHÉE :
--   1. Une activité `standard`, un créneau de trois places, deux prises.
--   2. Une place se libère : `reservation_offer_next` émet UNE offre, qui tient
--      UNE place — l'unité du format au moment de l'émission.
--   3. Le commerçant bascule l'activité en « Atelier Duo ».
--   4. Le joueur clique « Prendre ma place ». `claim_waitlist_offer` NE
--      REPASSE PAS PAR LA JAUGE — c'est sa propriété fondatrice, et elle est
--      juste : la place est déjà tenue. Elle lit le format COURANT, écrit
--      `party_size = 2`, et le créneau porte quatre personnes sur trois places.
--
-- Personne ne le voit. Aucune contrainte n'est violée (`party_size` vaut bien
-- 1..2), aucune RPC ne rend d'erreur, aucun journal ne s'écrit. Le commerçant
-- l'apprend le samedi, devant les gens.
--
-- L'INVERSE MORD AUSSI, plus discrètement : une activité `duo` repassée en
-- `standard` laisse ses réservations à `party_size = 2` sur un format où
-- `reserve_slot` exige désormais 1 — la jauge du commerçant compte des
-- personnes qui ne correspondent plus à ce que l'écran raconte, et
-- `already_reserved` rend une taille que le format contredit.
--
-- ── POURQUOI COMPTER, ET NON INTERDIRE OU CONVERTIR ──
--
-- Trois parades ont été pesées :
--   * FIGER `party_size` À L'ÉMISSION de l'offre (le porter sur l'entrée de
--     liste). C'est la correction de fond, mais elle ajoute une colonne, une
--     migration de données et un second endroit où l'unité est écrite — donc
--     un second endroit qui peut diverger, exactement ce que 20261007120000
--     s'est employé à éviter en n'ayant QU'UNE expression d'unité.
--   * CONVERTIR les lignes existantes au changement de format. Doubler ou
--     diviser en silence le nombre de personnes attendues par des gens qui ont
--     déjà réservé : le commerçant découvrirait sa salle pleine ou vide sans
--     avoir rien demandé.
--   * REFUSER LE CHANGEMENT TANT QU'IL Y A DES ENGAGEMENTS VIVANTS — et le
--     refuser EN NOMMANT CE QU'ON A COMPTÉ. C'est le motif des gardes
--     destructives du dépôt (`deleteWheel`, `deleteCampaign` : « N lot(s)
--     gagné(s) attendent encore en caisse »), et c'est celui-ci qu'on retient.
--     Il ne perd aucune donnée, il ne surprend personne, et il rend au
--     commerçant le seul geste qui règle vraiment la question : fermer ou
--     honorer ce qui est engagé, puis changer de format.
--
-- ── CE QUE CETTE FONCTION EST, ET CE QU'ELLE N'EST PAS ──
--
-- Elle COMPTE et rend le format courant. Elle n'écrit rien, ne verrouille rien
-- et ne décide rien : la décision est prise par `updateReserverActivity`, qui
-- compare le format demandé au format courant et refuse s'il change alors que
-- le compte n'est pas nul.
--
-- ── LE TOCTOU MARCHAND EST ASSUMÉ, ET C'EST UN CHOIX ÉCRIT ──
--
-- Entre ce comptage et l'`update` du panneau, un joueur peut réserver : le
-- changement de format passerait alors sur un engagement né dans l'intervalle.
-- Prendre le verrou d'avis du module aurait supposé un verrou PAR CRÉNEAU
-- (c'est sa clé : organisation + créneau), donc en prendre autant qu'il y a de
-- créneaux à venir, et les tenir pendant une écriture PostgREST qui se fait
-- dans une AUTRE transaction — ce que ce verrou ne sait pas faire. La fenêtre
-- est donc volontaire et bornée à quelques millisecondes, sur un geste que le
-- commerçant fait depuis son propre écran ; le pire cas reproduit exactement le
-- défaut d'origine, sur une réservation, et le commerçant vient de lire un
-- compte qui le rendait attentif.
-- ============================================================

create or replace function public.reservation_activity_live_commitments(
  p_organization_id uuid,
  p_activity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_reservations integer;
  v_waitlist integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null or p_activity_id is null then
    raise exception 'organization and activity required' using errcode = '22023';
  end if;

  -- ORG-SCOPÉE, comme toute lecture de ce module : l'activité de la voisine est
  -- `unknown`, jamais un compte. Le panneau refuserait de toute façon (`.eq`
  -- sur l'organisation), mais une RPC ne se repose pas sur son appelant.
  select a.kind into v_kind
    from public.reservation_activities a
   where a.id = p_activity_id
     and a.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- ── « VIVANT » SE DIT SUR DES CRÉNEAUX À VENIR, ET SEULEMENT LÀ ──
  --
  -- Un créneau commencé ne peut plus rien produire : `reserve_slot`,
  -- `claim_waitlist_offer` et `redeem_invitation` le refusent tous les trois
  -- (`starts_at <= now()`). Ses réservations restent vraies, mais elles ne
  -- seront jamais recomptées par personne — les bloquer pour l'éternité aurait
  -- interdit à un commerçant de changer de format APRÈS sa saison, ce qui est
  -- précisément le moment où il le fait.
  --
  -- LE STATUT DU CRÉNEAU N'ENTRE PAS DANS LE FILTRE, délibérément. Un créneau
  -- `closed` accepte encore une conversion d'offre et une invitation (les deux
  -- RPC l'admettent explicitement), et un `draft` se rouvre d'un clic juste
  -- après le changement de format. Filtrer sur `open` aurait donc creusé le
  -- trou exactement là où le commerçant peut le rouvrir lui-même.
  select pg_catalog.count(*)::integer into v_reservations
    from public.reservations r
    join public.reservation_slots s
      on s.id = r.slot_id
     and s.organization_id = p_organization_id
   where r.organization_id = p_organization_id
     and s.activity_id = p_activity_id
     and s.starts_at > pg_catalog.now()
     and r.status in ('confirmed', 'checked_in');

  -- LA FILE : `waiting` TOUJOURS, `offered` TANT QUE L'ÉCHÉANCE TIENT.
  --
  -- Ce n'est PAS l'ensemble « vivant » du plafond de `waitlist_join`, qui
  -- ignore l'échéance pour ne pas dépendre de la ponctualité d'un cron. Ici la
  -- question n'est pas « combien de gens sont inscrits » mais « qu'est-ce qui
  -- peut encore se convertir en réservation » : une offre échue ne le peut plus
  -- — `claim_waitlist_offer` lui rend `expired` par refus PARESSEUX, balayage
  -- ou pas. La compter aurait bloqué le commerçant sur une ligne morte, sur un
  -- geste qui n'a rien de destructeur.
  select pg_catalog.count(*)::integer into v_waitlist
    from public.reservation_waitlist_entries w
    join public.reservation_slots s
      on s.id = w.slot_id
     and s.organization_id = p_organization_id
   where w.organization_id = p_organization_id
     and s.activity_id = p_activity_id
     and s.starts_at > pg_catalog.now()
     and (w.status = 'waiting'
          or (w.status = 'offered'
              and w.offer_expires_at > pg_catalog.now()));

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'kind', v_kind,
    'reservations', v_reservations,
    'waitlist', v_waitlist
  );
end;
$$;

comment on function public.reservation_activity_live_commitments(uuid, uuid) is
  'Ce qui est ENGAGÉ sur une activité et peut encore bouger (RES-5) : son '
  'format courant, le nombre de réservations vivantes (`confirmed` + '
  '`checked_in`) et le nombre d''attentes convertibles (`waiting`, plus les '
  '`offered` dont l''échéance TIENT ENCORE), le tout sur ses créneaux À VENIR '
  'uniquement. Sert au refus NOMMÉ du changement de format : basculer une '
  'activité en `duo` pendant qu''une offre de liste tient UNE place ferait '
  'convertir le claim à DEUX personnes — et `claim_waitlist_offer` ne repasse '
  'pas par la jauge, donc le créneau se sur-réserverait en silence. NE '
  'FILTRE PAS sur le statut du créneau : un `closed` convertit encore, un '
  '`draft` se rouvre. NE FILTRE PAS non plus sur le droit `vitrine` : le '
  'compte doit rester honnête même si l''abonnement a lapsé, sinon la garde '
  'rendrait 0 et laisserait passer. Ne verrouille rien, n''écrit rien : la '
  'décision appartient à `updateReserverActivity`, et la fenêtre entre le '
  'compte et l''écriture est un TOCTOU assumé (voir l''en-tête de '
  '20261009120000). Org-scopée : `unknown` sur l''activité d''une autre '
  'organisation. N''est grantée qu''à `service_role`.';

revoke all on function public.reservation_activity_live_commitments(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reservation_activity_live_commitments(uuid, uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- L'INDEX QUI MANQUAIT — et qui manquait AVANT ce fichier
--
-- Les deux comptages joignent `reservation_slots` par `activity_id` et
-- `starts_at`. `reservation_slots` porte déjà un unique `(activity_id,
-- starts_at)` depuis le socle (20261002120000) : la jointure est servie, rien à
-- ajouter de ce côté.
--
-- Côté `reservation_waitlist_entries`, en revanche, le filtre porte sur
-- `slot_id` — couvert par `…_live_idx` (partiel, `waiting`/`offered`) — et le
-- second comptage passe par `organization_id`, qui n'a d'index que sur
-- `reservations`. Rien n'est ajouté ici : ces deux tables sont lues par
-- créneau, et le volume d'une activité (quelques dizaines de créneaux, quelques
-- centaines de lignes) ne justifie pas un index de plus, qu'il faudrait ensuite
-- maintenir à chaque écriture du chemin chaud — celui de la réservation.
-- Le noter est ce qui évite qu'on se repose la question dans six mois.
-- ────────────────────────────────────────────────────────────
