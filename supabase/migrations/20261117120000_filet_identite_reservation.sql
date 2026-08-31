-- ============================================================
-- LE FILET, SUITE — RÉSERVATION ET FILES REJOIGNENT LE SOCLE (ID-2)
--
-- Ce fichier ferme les DEUX trous établis par le lot précédent (97da79f2), qui
-- a branché la reprise après rotation d'appareil et documenté ce qu'elle ne
-- couvrait pas. Il PRÉPARE l'identité commune ; il ne bascule rien.
--
-- ── TROU N°1 — RÉSERVATIONS ET FILES N'ÉTAIENT RELIÉES À RIEN ──
--
-- `reservations`, `reservation_waitlist_entries`, `reservation_queue_entries`
-- et `reservation_wait_sessions` ne portent qu'un `player_key_hash` NU : aucune
-- colonne vers `players`, et aucune famille dans le `check` de
-- `player_experience_memberships.experience_kind` (20260805140000:99) ni dans
-- `player_experience_scope_is_valid` (:203) pour en accueillir une.
--
-- Conséquence concrète, et elle est totale : après 90 jours,
-- `resolve_player_identity` fait tourner le cookie `lc-player`,
-- `hashPlayerDeviceToken` produit une empreinte NEUVE, et les lignes déjà
-- écrites gardent l'ANCIENNE. Une lecture par empreinte ne les trouve plus.
-- Le client PERD SA RÉSERVATION, définitivement — et il n'existe aucune
-- fonction de fusion pour réparer après coup (20260805140000:517 lève même une
-- exception si on essaie).
--
-- Ce fichier n'écrit AUCUN pont : il rend le pont POSSIBLE. La pose relève de
-- la couche applicative (voir le relais en fin de fichier).
--
-- ── TROU N°2 — LA REPRISE NE RENDAIT QU'UNE SEULE ANCIENNE EMPREINTE ──
--
-- `lookup_player_identity` (20260805140000:675) rend `limit 1`, la plus
-- récente. L'unicité de `player_legacy_identities` porte pourtant sur
-- `(organization_id, experience_kind, experience_id, legacy_identity_hash)` :
-- plusieurs empreintes par adhésion sont bel et bien possibles, et un joueur
-- qui a tourné DEUX fois d'appareil en a plusieurs. Toutes sauf l'avant-
-- dernière étaient donc inatteignables.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. DEUX familles, et pourquoi DEUX plutôt qu'une
--
-- ── CE QUE CHAQUE FAMILLE DÉSIGNE ──
--
--   `reserver_activity` → `reservation_activities`. Couvre `reservations`
--       (par `slot_id` → `reservation_slots.activity_id`),
--       `reservation_waitlist_entries` (même chaîne) et les
--       `reservation_wait_sessions` dont `reservation_id` est posé.
--
--   `reserver_queue`    → `reservation_queues`. Couvre
--       `reservation_queue_entries` (par `queue_id`) et les
--       `reservation_wait_sessions` dont `queue_entry_id` est posé.
--
-- ── L'ARGUMENT QUI TRANCHE, ET IL EST STRUCTUREL ──
--
-- `reservation_queues.activity_id` est NULLABLE (20261005120000:107), et le
-- commentaire de la colonne l'assume : une file d'accueil peut exister SANS
-- activité — « chacun son tour » au comptoir n'a pas besoin qu'on ait déclaré
-- un service. Replier les files sur `reserver_activity` aurait donc laissé ces
-- files-là SANS AUCUN `experience_id` valide : leurs joueurs seraient restés
-- exactement aussi impossibles à retrouver qu'avant ce fichier — c'est-à-dire
-- qu'on aurait refermé le trou en en laissant ouverte la moitié la plus
-- discrète, celle qui ne se voit qu'au comptoir d'un commerçant qui n'utilise
-- pas les réservations.
--
-- ── LES DEUX AUTRES RAISONS, QUI CONFIRMENT SANS SUFFIRE ──
--
--   · Les DURÉES DE VIE n'ont rien de commun. Une entrée de file se résout
--     dans l'heure (`waiting → called → served|left|no_show`) ; une
--     réservation est un rendez-vous à venir, qui vit des semaines. Sous une
--     famille unique, le `last_seen_at` de l'adhésion aurait mélangé les deux
--     et n'aurait plus rien mesuré.
--   · Le grain suit la doctrine posée par `reserver_stock`
--     (20261010120000:836) : l'expérience est L'OBJET SUR LEQUEL LE JOUEUR
--     REVIENT. Il revient au service du restaurant (l'activité) et il revient
--     à la file du comptoir (la file) — deux objets que le commerçant crée et
--     règle séparément, dans deux écrans différents.
--
-- ── CE QUE CE FICHIER NE TOUCHE PAS, DÉLIBÉRÉMENT ──
--
-- `experience_analytics` (20260805160000:28 et :222) porte sa PROPRE liste de
-- familles, plus étroite. `reserver_stock` ne l'a pas étendue et ce fichier
-- non plus : la mesure d'audience des expériences est un vocabulaire distinct
-- du pont d'identité, et l'élargir ici ouvrirait un chantier qui n'a pas été
-- arbitré. Ce n'est pas un oubli — c'est le précédent, suivi.
-- ────────────────────────────────────────────────────────────

alter table public.player_experience_memberships
  drop constraint player_experience_memberships_experience_kind_check;
alter table public.player_experience_memberships
  add constraint player_experience_memberships_experience_kind_check check (
    experience_kind in (
      'campaign', 'hunt', 'loyalty', 'jackpot', 'event',
      'calendar', 'referral', 'contest', 'quiz', 'reserver_stock',
      'reserver_activity', 'reserver_queue'
    )
  );


-- ────────────────────────────────────────────────────────────
-- 2. Le validateur de portée apprend les deux familles
--
-- CETTE FONCTION EST UNE GARDE D'ISOLATION MULTI-LOCATAIRE, et c'est sa seule
-- raison d'être : le trigger `player_experience_memberships_scope_guard`
-- (20260805140000:294) la consulte avant chaque insertion et refuse la ligne si
-- elle rend faux. Une portée mal validée laisserait rattacher l'adhésion d'un
-- joueur à l'expérience d'un AUTRE commerçant.
--
-- Les deux branches neuves sont donc écrites comme les dix autres, sans
-- exception : `exists` sur la table cible, avec `id = p_experience_id` ET
-- `organization_id = p_organization_id`. Les deux prédicats, toujours — c'est
-- le second qui fait tout le travail d'isolation, et il n'est jamais implicite.
--
-- Le `return false` final reste le deny-by-default : une famille admise par le
-- `check` mais absente d'ici serait refusée par le trigger avec le message
-- « player experience does not belong to organization », qui aurait envoyé
-- chercher la cause très loin de l'omission réelle. C'est la raison pour
-- laquelle les sections 1 et 2 de ce fichier ne peuvent pas être séparées.
--
-- `create or replace` conserve les droits déjà posés sur la fonction ; les
-- `revoke`/`grant` de la section 4 les réaffirment quand même, parce qu'une
-- garde qui dépend d'un effet de bord de `replace` n'est pas une garde.
-- ────────────────────────────────────────────────────────────

create or replace function public.player_experience_scope_is_valid(
  p_experience_kind text,
  p_experience_id uuid,
  p_organization_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_experience_kind = 'campaign' then
    return exists (
      select 1 from public.campaigns c
       where c.id = p_experience_id
         and c.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'hunt' then
    return exists (
      select 1 from public.hunts h
       where h.id = p_experience_id
         and h.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'loyalty' then
    return exists (
      select 1 from public.loyalty_programs l
       where l.id = p_experience_id
         and l.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'jackpot' then
    return exists (
      select 1 from public.jackpot_campaigns j
       where j.id = p_experience_id
         and j.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'event' then
    return exists (
      select 1 from public.event_sessions e
       where e.id = p_experience_id
         and e.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'calendar' then
    return exists (
      select 1 from public.calendars c
       where c.id = p_experience_id
         and c.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'referral' then
    return exists (
      select 1 from public.referral_programs r
       where r.id = p_experience_id
         and r.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'contest' then
    return exists (
      select 1 from public.contests c
       where c.id = p_experience_id
         and c.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'quiz' then
    return exists (
      select 1 from public.quizzes q
       where q.id = p_experience_id
         and q.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'reserver_stock' then
    return exists (
      select 1 from public.reservation_stock_offers o
       where o.id = p_experience_id
         and o.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'reserver_activity' then
    return exists (
      select 1 from public.reservation_activities a
       where a.id = p_experience_id
         and a.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'reserver_queue' then
    return exists (
      select 1 from public.reservation_queues f
       where f.id = p_experience_id
         and f.organization_id = p_organization_id
    );
  end if;
  return false;
end;
$$;


-- ────────────────────────────────────────────────────────────
-- 3. `lookup_player_legacy_identities` — TOUTES les anciennes empreintes
--
-- ── POURQUOI UNE SECONDE FONCTION, ET NON L'ÉLARGISSEMENT DE LA PREMIÈRE ──
--
-- `lookup_player_identity` rend UNE ligne, et ses appelants s'appuient sur
-- cette forme :
--
--   · `player_identity.test.sql:259` l'invoque en SOUS-REQUÊTE SCALAIRE
--     (`select (select player_id from public.lookup_player_identity(…))`).
--     Une fonction qui rend N lignes y déclenche « more than one row returned
--     by a subquery used as an expression » — une erreur d'EXÉCUTION, qui ne
--     se produit que pour les joueurs ayant tourné DEUX fois, c'est-à-dire
--     exactement la population que ce fichier vient servir. Le défaut serait
--     apparu en production, sur le chemin de réparation lui-même.
--   · `lookupLegacyIdentityHash` (src/lib/player-identity.ts:496) lit
--     `firstRow(…)` et rend `string | null`.
--
-- L'élargir aurait donc rendu le vert de `player_identity.test.sql` ACCIDENTEL
-- — il ne tiendrait qu'au fait que sa fixture ne pose qu'une seule empreinte —
-- là où l'exigence est que ce fichier prouve l'extension SANS CASSE. Une
-- seconde fonction rend cette preuve structurelle : l'ancienne n'est pas
-- touchée, donc elle ne peut pas régresser.
--
-- S'y ajoute que son nom est SINGULIER et sa forme 1:1 : `player_id` et
-- `experience_membership_id` ne dépendent que du couple (appareil, expérience).
-- Les répéter N fois dénormaliserait une fonction dont le contrat est « cette
-- identité-ci ». La nouvelle est plurielle dans son nom comme dans sa forme.
--
-- ── L'ISOLATION EST LA MÊME, AU PRÉDICAT PRÈS ──
--
-- La chaîne de jointure est reprise TELLE QUELLE : on part de
-- `player_devices.token_hash`, on exige `players.status = 'active'`, on borne
-- l'adhésion à l'organisation ET à l'expérience demandées, et les empreintes
-- ne sont atteintes QUE par `experience_membership_id`. Une empreinte n'est
-- donc lisible que si elle appartient à une adhésion du MÊME joueur, du MÊME
-- locataire et de la MÊME expérience. C'est cette borne-là qu'il ne faut jamais
-- desserrer, et le test négatif de `filet_identite_reservation.test.sql` la
-- vérifie explicitement plutôt que de la supposer.
--
-- La fenêtre de grâce est reprise elle aussi (`revoked_at is null or
-- grace_expires_at > now()`) : un appareil révoqué depuis longtemps ne doit pas
-- rouvrir l'accès aux empreintes qu'il portait.
--
-- ── L'ORDRE, ET SON DÉPARTAGE ──
--
-- `last_seen_at desc, first_seen_at desc` — les deux clés de l'ancienne
-- fonction, dans le même sens : la PREMIÈRE ligne rendue ici est donc celle que
-- rend `lookup_player_identity`. `id desc` s'y ajoute en dernier ressort. Sur
-- une égalité parfaite des deux premières clés, l'ancienne choisissait
-- arbitrairement ; la nouvelle choisit toujours pareil. C'est une propriété en
-- plus, pas une divergence de contrat.
--
-- ── AUCUN PLAFOND, ET C'EST MESURÉ ──
--
-- Pas de `limit` : le cahier demande TOUTES les empreintes. Le nombre de
-- lignes n'est pas ouvert pour autant — il vaut le nombre de rotations subies
-- par ce joueur sur cette expérience, et une rotation demande 90 jours
-- (20260805140000). Un joueur de trois ans en porte une douzaine. Il n'y a pas
-- de levier par lequel un appelant pourrait faire grossir cet ensemble.
--
-- `stable` et `language sql` comme son aînée : cette fonction n'écrit RIEN, ne
-- fait de `lc-player` l'autorité de rien, et ne fusionne aucun joueur.
-- ────────────────────────────────────────────────────────────

create or replace function public.lookup_player_legacy_identities(
  p_device_token_hash text,
  p_organization_id uuid,
  p_experience_kind text,
  p_experience_id uuid
)
returns table (
  player_id uuid,
  experience_membership_id uuid,
  legacy_identity_hash text,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, e.id, li.legacy_identity_hash, li.last_seen_at
    from public.player_devices d
    join public.players p
      on p.id = d.player_id
     and p.status = 'active'
    join public.player_experience_memberships e
      on e.player_id = p.id
     and e.organization_id = p_organization_id
     and e.experience_kind = p_experience_kind
     and e.experience_id = p_experience_id
    join public.player_legacy_identities li
      on li.experience_membership_id = e.id
   where d.token_hash = p_device_token_hash
     and (
       d.revoked_at is null
       or d.grace_expires_at > pg_catalog.now()
     )
   order by li.last_seen_at desc, li.first_seen_at desc, li.id desc
$$;

comment on function public.lookup_player_legacy_identities(
  text, uuid, text, uuid
) is
  'TOUTES les anciennes empreintes d''une adhésion, de la plus récente à la '
  'plus ancienne, à partir de l''empreinte COURANTE du cookie lc-player. '
  'Pendant que `lookup_player_identity` n''en rend qu''une, celle-ci sert le '
  'joueur qui a tourné PLUSIEURS fois d''appareil. Lecture seule : elle '
  'n''écrit rien, ne fusionne aucun joueur et ne rend jamais l''empreinte d''un '
  'autre joueur — les empreintes ne sont atteintes que par '
  'experience_membership_id, borné au même joueur, au même locataire et à la '
  'même expérience.';


-- ────────────────────────────────────────────────────────────
-- 4. LES DROITS — le motif de tout ce socle, réaffirmé
--
-- Une fonction neuve part fermée puis n'ouvre que `service_role` : c'est le
-- motif de `resolve_player_identity`, `rotate_player_device` et
-- `lookup_player_identity` (20260805140000:713-731), et rien ici ne justifie
-- d'y déroger — cette fonction lit des empreintes pseudonymes, qui ne doivent
-- traverser ni PostgREST anonyme ni une session marchande.
--
-- `revoke` AVANT `grant`, et sur `public` en premier : sans cela, le
-- `grant execute to public` implicite de Postgres sur toute fonction neuve
-- resterait en place, et le `grant` à `service_role` serait une décoration.
-- ────────────────────────────────────────────────────────────

revoke all on function public.lookup_player_legacy_identities(
  text, uuid, text, uuid
) from public, anon, authenticated;

grant execute on function public.lookup_player_legacy_identities(
  text, uuid, text, uuid
) to service_role;

-- Le validateur de portée a été remplacé ci-dessus. `create or replace`
-- conserve en principe les droits existants ; on les réaffirme parce qu'une
-- garde qui repose sur « en principe » ne garde rien.
revoke all on function public.player_experience_scope_is_valid(text, uuid, uuid)
  from public, anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 5. GARDE — ce fichier échoue À L'APPLICATION s'il n'a rien fait
--
-- Ce dépôt a perdu six lots sur des colonnes et des fonctions livrées sans
-- droit d'accès : un `grant` sans effet — mauvais rôle, signature qui ne
-- correspond à aucune fonction, nom mal orthographié — NE LÈVE PAS. Il passe,
-- et la panne reste intacte pendant que le fichier passe pour appliqué. La
-- seule parade est de vérifier l'effet, ici, tant que la transaction peut
-- encore être annulée.
--
-- Quatre contrôles, dont DEUX NÉGATIFS. Les négatifs sont ceux qui comptent :
-- un test qui ne vérifie que l'ouverture verdit aussi bien sur une fonction
-- ouverte à tout le monde.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_signature constant text :=
    'public.lookup_player_legacy_identities(text,uuid,text,uuid)';
  v_role text;
  v_famille text;
  v_definition text;
begin
  -- (a) POSITIF — le serveur peut l'appeler. Sans lui, le chemin de reprise
  -- n'existe que sur le papier.
  if not pg_catalog.has_function_privilege('service_role', v_signature, 'EXECUTE')
  then
    raise exception
      'lookup_player_legacy_identities n est pas executable par service_role : la reprise apres rotation resterait lettre morte, sans une ligne de journal';
  end if;

  -- (b) NÉGATIF — et c'est le contrôle de fuite. Ces deux rôles sont ceux que
  -- PostgREST endosse pour un visiteur anonyme et pour une session marchande :
  -- l'un d'eux pourrait énumérer des empreintes pseudonymes.
  foreach v_role in array array['anon', 'authenticated'] loop
    if pg_catalog.has_function_privilege(v_role, v_signature, 'EXECUTE') then
      raise exception
        'lookup_player_legacy_identities est executable par % : des empreintes pseudonymes deviendraient lisibles hors du serveur', v_role;
    end if;
    if pg_catalog.has_function_privilege(
         v_role, 'public.player_experience_scope_is_valid(text,uuid,uuid)', 'EXECUTE')
    then
      raise exception
        'player_experience_scope_is_valid est executable par % : la garde d isolation deviendrait interrogeable de l exterieur', v_role;
    end if;
  end loop;

  -- (c) POSITIF — les deux familles sont réellement admises par le `check`.
  -- Une valeur absente ferait échouer chaque insertion de pont, et le message
  -- de contrainte ne nommerait pas la cause.
  select pg_catalog.pg_get_constraintdef(c.oid) into v_definition
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'player_experience_memberships'
     and c.conname = 'player_experience_memberships_experience_kind_check';
  if v_definition is null then
    raise exception
      'la contrainte de famille de player_experience_memberships a disparu : toute valeur serait desormais acceptee';
  end if;
  foreach v_famille in array array['reserver_activity', 'reserver_queue'] loop
    if pg_catalog.strpos(v_definition, v_famille) = 0 then
      raise exception
        'la famille % n est pas admise par le check : aucun pont de reservation ne pourrait etre pose', v_famille;
    end if;
    -- (d) NÉGATIF — le validateur de portée connaît la famille ET refuse une
    -- expérience inexistante. Le `check` et le validateur DOIVENT bouger
    -- ensemble : une famille admise par l'un et ignorée par l'autre est
    -- refusée par le trigger avec un message qui accuse l'organisation.
    if public.player_experience_scope_is_valid(
         v_famille,
         '00000000-0000-4000-8000-000000000000'::uuid,
         '00000000-0000-4000-8000-000000000001'::uuid
       )
    then
      raise exception
        'player_experience_scope_is_valid accepte une experience inexistante pour % : la garde d isolation ne garde plus rien', v_famille;
    end if;
  end loop;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 6. RELAIS APPLICATIF — ce que ce fichier NE PEUT PAS faire
--
-- ⚠️ `PLAYER_EXPERIENCE_KINDS` (src/lib/player-identity.ts:15) est le miroir
-- applicatif du `check` étendu en section 1. Tant qu'il ne porte pas les deux
-- familles, la base les accepte mais AUCUNE server action ne peut poser le
-- pont — le schéma Zod du pont les refuserait en entrée.
--
-- ⚠️ ET CE MIROIR NE SE COMPLÈTE PAS SEUL. `player-identity-coverage.test.ts`
-- dérive ses cas de `PLAYER_EXPERIENCE_KINDS` et EXIGE, pour chaque famille,
-- un écrivain applicatif — un `experienceKind: "<famille>"` trouvé dans le
-- code. Ajouter les deux valeurs à la constante SANS poser les appels
-- correspondants fait donc ROUGIR cette garde immédiatement. Les deux gestes
-- appartiennent au même lot : la valeur et son écrivain.
--
-- ⚠️ `lookup_player_legacy_identities` n'a aucun appelant dans le dépôt à
-- l'issue de ce fichier — exactement comme `lookup_player_identity` avant le
-- lot 97da79f2. C'est assumé : le socle précède l'usage.
--
-- CE FICHIER NE BASCULE RIEN. `lc-player` n'est l'autorité de rien, aucune
-- fonction de fusion de joueurs n'est écrite ici (c'est la maille suivante du
-- filet, et elle mérite son propre arbitrage), et le module Bande n'est pas
-- touché — son refus de l'identité globale est une propriété vendue.
-- ────────────────────────────────────────────────────────────
