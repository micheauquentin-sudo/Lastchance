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
-- ── UN SEUL COMPTAGE, DEUX LECTEURS QUI N'EN FONT PAS LE MÊME USAGE ──
--
-- Le prédicat « vivant » est écrit UNE FOIS, dans
-- `reservation_activity_live_counts`, et deux gardes le lisent — parce qu'elles
-- ne posent pas la même question :
--
--   * `updateReserverActivity` demande COMBIEN, pour le dire : « 2 réservations
--     et 2 attentes vivantes sur des créneaux à venir. Fermez ou honorez-les
--     d'abord. » C'est le refus NOMMÉ, motif des gardes destructives du dépôt
--     (`deleteWheel`, `deleteCampaign`), et c'est lui qui rend au commerçant le
--     geste qui débloque, au lieu de le laisser chercher ce qui coince.
--   * Le trigger `reservation_activities_freeze_kind` demande seulement S'IL Y
--     EN A, et refuse l'`update` lui-même. Il ne parle à personne : il ferme.
--
-- Les deux dérivent du MÊME prédicat, et c'est tout l'intérêt de l'avoir sorti
-- de la RPC : deux définitions concurrentes de « vivant » auraient fini par
-- diverger, et c'est la plus laxiste qui aurait fait autorité — donc aucune.
--
-- ── POURQUOI UN TRIGGER, PUISQUE L'ACTION REFUSE DÉJÀ ──
--
-- 1. PARCE QUE L'ACTION N'EST PAS LE SEUL CHEMIN. `reservation_activities`
--    porte une policy `for all` pour les éditeurs et un `grant update (kind,
--    …)` (20261007120000) : un PATCH PostgREST direct, avec le jeton du
--    commerçant, bascule le format sans jamais passer par le serveur Next.
--    Rien d'exotique — c'est l'API que Supabase expose par construction, et le
--    panneau s'en sert partout ailleurs dans ce module.
--
-- 2. PARCE QUE L'ACTION LAISSAIT UNE FENÊTRE, ÉCRITE ET ASSUMÉE. Entre son
--    comptage (client admin, une requête) et son `update` (client utilisateur,
--    une AUTRE requête, une AUTRE transaction), un joueur pouvait réserver. Le
--    trigger recompte DANS la transaction de l'écriture : la fenêtre passe de
--    deux allers-retours HTTP à l'intérieur d'un `update`.
--
-- CE QU'IL NE FERME PAS, et il faut le dire aussi : une transaction concurrente
-- qui s'engage APRÈS le snapshot de l'instruction n'est pas vue. Refermer cela
-- aurait demandé de prendre le verrou d'avis de CHAQUE créneau à venir — c'est
-- sa clé, organisation + créneau — donc autant de verrous qu'il y a de créneaux,
-- sur un chemin qui n'en connaît pas le nombre. Ce qui reste est de l'ordre de
-- la microseconde, sur un geste manuel fait une fois par saison.
--
-- L'ACTION GARDE DONC SON REFUS, et ce n'est pas une redondance : sans lui, le
-- commerçant recevrait l'erreur générique du trigger — sans chiffre, sans geste.
-- Le trigger est le plancher ; l'action est ce qui se lit.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- LE COMPTAGE — interne, sans contrôle d'accès, et c'est voulu
--
-- `auth.role()` lit le jeton de la session, pas le rôle effectif : dans un
-- trigger déclenché par un `update` PostgREST, il rend `authenticated` même si
-- la fonction est `security definer`. La RPC publique ne pouvait donc pas être
-- appelée depuis le trigger sans que sa propre garde la refuse — d'où la
-- séparation : ce comptage-ci ne garde rien, la RPC qui le suit garde tout.
--
-- Il n'est GRANTÉ À PERSONNE, `service_role` compris. Ses deux appelants sont
-- `security definer` et appartiennent au propriétaire des migrations, qui a
-- l'EXECUTE de ce qu'il possède : aucun rôle Supabase ne peut l'atteindre
-- directement, et rien n'a besoin qu'il le puisse.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservation_activity_live_counts(
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
  -- ORG-SCOPÉE, comme toute lecture de ce module : l'activité de la voisine est
  -- `unknown`, jamais un compte. Le panneau refuserait de toute façon (`.eq`
  -- sur l'organisation), mais un comptage ne se repose pas sur son appelant.
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

comment on function public.reservation_activity_live_counts(uuid, uuid) is
  'LE prédicat « engagement vivant » du module Réserver (RES-5), écrit une '
  'seule fois : format courant, réservations `confirmed`/`checked_in` et '
  'attentes convertibles (`waiting`, plus les `offered` dont l''échéance TIENT '
  'ENCORE), sur les créneaux À VENIR uniquement. Interne : aucun contrôle '
  'd''accès et AUCUN grant, pas même à `service_role` — `auth.role()` rendrait '
  '`authenticated` dans le trigger qui l''appelle. Ses deux lecteurs sont '
  '`reservation_activity_live_commitments` (qui garde l''accès et rend les '
  'chiffres au commerçant) et `reservation_activities_freeze_kind` (qui refuse '
  'l''écriture). Deux définitions de « vivant » auraient divergé : il n''y en a '
  'qu''une.';

revoke all on function public.reservation_activity_live_counts(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- LA RPC — le comptage rendu au serveur, et à lui seul
--
-- Elle n'ajoute au comptage que ce que le comptage ne peut pas porter : le
-- contrôle d'accès. Elle n'écrit rien et ne décide rien — la décision LISIBLE
-- appartient à `updateReserverActivity`, qui compare le format demandé au
-- format courant et refuse EN NOMMANT ce qu'il a compté ; la décision MUETTE
-- appartient au trigger, plus bas.
-- ────────────────────────────────────────────────────────────

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
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null or p_activity_id is null then
    raise exception 'organization and activity required' using errcode = '22023';
  end if;

  return public.reservation_activity_live_counts(p_organization_id, p_activity_id);
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
  'rendrait 0 et laisserait passer. N''écrit rien et ne décide rien : elle rend '
  'à `updateReserverActivity` de quoi refuser EN NOMMANT ce qui est engagé. La '
  'fenêtre entre ce compte et l''écriture (deux transactions) n''est plus un '
  'trou : `reservation_activities_freeze_kind` recompte dans la transaction de '
  'l''`update` et refuse le changement — y compris sur un PATCH PostgREST qui '
  'n''aurait jamais vu cette RPC. Org-scopée : `unknown` sur l''activité d''une '
  'autre organisation. N''est grantée qu''à `service_role`.';

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
--
-- LE TRIGGER CI-DESSOUS NE CHANGE RIEN À CE RAISONNEMENT : il ne compte que
-- lorsque `kind` change VRAIMENT, c'est-à-dire une poignée de fois par an et
-- par activité. Il n'est sur aucun chemin chaud.
-- ────────────────────────────────────────────────────────────


-- ────────────────────────────────────────────────────────────
-- LE PLANCHER — le format ne bascule pas, même sans passer par l'action
--
-- Motif `reservation_waitlist_freeze_terminal` (20261004120000) : un trigger
-- `before update` du module qui refuse une transition impossible, en `23514`.
--
-- ── IL NE SE DÉCLENCHE QUE SI LE FORMAT CHANGE VRAIMENT ──
--
-- `before update of kind` se déclenche dès que `kind` FIGURE dans l'`update`,
-- même à valeur identique — et `updateReserverActivity` l'écrit à CHAQUE
-- enregistrement des réglages. Sans le `is not distinct from` en tête, le
-- moindre changement de nom sur une activité qui tourne serait refusé : la
-- garde deviendrait un mur, et le commerçant ne pourrait plus rien régler tant
-- qu'une seule personne attend.
--
-- ── IL REFUSE AUSSI QUAND IL N'A PAS SU COMPTER ──
--
-- `state <> 'ok'` ne peut pas arriver sur une ligne qu'on est en train de
-- modifier (elle existe, et son organisation est celle qu'on lui passe). Le
-- refus est là parce qu'un comptage qui ne répond pas ne vaut pas zéro :
-- laisser passer faute d'avoir su compter, c'est exactement le silence que
-- cette garde existe pour rompre — et c'est déjà ce que fait l'action.
--
-- ── LE MESSAGE N'EST PAS CELUI QUE LIT LE COMMERÇANT ──
--
-- Il est technique et anglais, comme les autres refus SQL du module : ce
-- chemin-ci n'est atteint que par un PATCH direct ou par une course. Le refus
-- FRANÇAIS, avec les chiffres et le geste, reste celui de l'action.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservation_activities_freeze_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counts jsonb;
begin
  if new.kind is not distinct from old.kind then
    return new;
  end if;

  v_counts := public.reservation_activity_live_counts(
    old.organization_id, old.id);

  if coalesce(v_counts->>'state', '') <> 'ok' then
    raise exception
      'activity % live commitments could not be counted; kind change refused',
      old.id
      using errcode = '23514';
  end if;

  if (v_counts->>'reservations')::integer
     + (v_counts->>'waitlist')::integer > 0 then
    -- Format sur UNE ligne : PL/pgSQL attend un littéral unique après `raise`,
    -- il ne recolle pas deux littéraux adjacents comme le fait le lexer SQL.
    raise exception
      'activity % kind is locked: % live reservation(s), % live waitlist entries',
      old.id, v_counts->>'reservations', v_counts->>'waitlist'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.reservation_activities_freeze_kind() is
  'Refuse un changement de `reservation_activities.kind` tant que des '
  'engagements vivants portent sur des créneaux à venir (RES-5). Plancher de '
  'la garde nommée de `updateReserverActivity` : il ferme le PATCH PostgREST '
  'direct — la policy éditeur et le `grant update (kind, …)` l''autorisent — et '
  'il resserre la fenêtre entre le comptage de l''action et son écriture, qui '
  'se faisaient dans deux transactions. Ne se déclenche que si le format change '
  'RÉELLEMENT : `kind` figure dans tout enregistrement des réglages.';

revoke all on function public.reservation_activities_freeze_kind()
  from public, anon, authenticated;

drop trigger if exists reservation_activities_freeze_kind
  on public.reservation_activities;
create trigger reservation_activities_freeze_kind
  before update of kind on public.reservation_activities
  for each row execute function public.reservation_activities_freeze_kind();
