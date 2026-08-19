-- ============================================================
-- LE SOCLE « RÉSERVER » — activité, créneau à capacité finie, réservation
--
-- Lot L3 du train « Réserver & Vitrine » (RES-1a). Il pose LE MODÈLE DE
-- DONNÉES et les quatre RPC serveur-autoritaires ; il n'expose AUCUNE page,
-- aucune server action, aucun email. Le câblage applicatif est L4.
--
-- ── LES QUATRE INVARIANTS QUE CE FICHIER REND VRAIS ──
--
--   1. AUCUNE SUR-RÉSERVATION SOUS CONCURRENCE. La capacité n'est pas un
--      compteur dénormalisé : elle se DÉDUIT des lignes VIVANTES — `confirmed`
--      ET `checked_in` — sous un verrou d'avis porté par le créneau. Ne compter
--      que les `confirmed` aurait fait du CHECK-IN UNE LIBÉRATION DE PLACE :
--      quatre arrivées sur un créneau de quatre, et la cinquième réservation
--      passait, sur un créneau physiquement plein. Un compteur dupliqué, lui,
--      aurait exigé d'être maintenu juste à l'annulation, au check-in et à la
--      purge — trois occasions de dériver, contre une seule source de vérité.
--   2. UNE IDENTITÉ NE RÉSERVE PAS DEUX FOIS LE MÊME CRÉNEAU. Un index unique
--      PARTIEL — sur le MÊME ensemble d'états que le comptage, sous peine de
--      rouvrir exactement le trou ci-dessus — le garantit au niveau de la base,
--      et la RPC le rend IDEMPOTENT plutôt que fautif : re-réserver rend la
--      réservation existante et son code, y compris après l'arrivée.
--   3. UNE RÉSERVATION ARRIVÉE NE S'ANNULE PLUS. Deux `check` d'état
--      s'en chargent, sur le patron `redeemed_at` XOR `cancelled_at` de
--      `reward_issuances` (20260805150000:104-115).
--   4. LE STAFF NE VOIT QUE SON ORGANISATION. RLS org-scopée sur les trois
--      tables, FK COMPOSITES tenant entre elles, et la RPC de check-in rend
--      une réponse INDISTINGUABLE pour un code inconnu et pour un code
--      d'une autre organisation.
--
-- ── POURQUOI LE DROIT `vitrine` EST VÉRIFIÉ *AUSSI* EN SQL ──
--
-- L'agenda Réserver est réservé aux organisations portant le droit `vitrine`
-- (20261001120000). Ce droit sera vérifié par la couche applicative en L4 —
-- c'est là qu'il rend un message utile au commerçant. `reserve_slot`
-- l'interroge quand même : c'est le seul point d'entrée par lequel un JOUEUR
-- écrit dans ces tables, et une défense qui ne tient qu'à l'appelant n'est pas
-- une défense. Même geste que la garde fusionnée d'`event_public_state`.
--
-- ── CE QUE CE FICHIER NE FAIT PAS, VOLONTAIREMENT ──
--
--   * AUCUNE entrée au registre `reward_issuances`. Une réservation n'est pas
--     une récompense : elle ne consomme aucun stock de lot, ne s'encaisse pas
--     et n'a pas de valeur économique. Le rapprochement RESA- viendra en L9,
--     s'il est décidé — l'y forcer ici aurait fait passer un créneau pour un
--     gain dans toutes les statistiques du commerçant.
--   * AUCUN trigger `guard_module_publication`. Les neuf de 20260905120000
--     restent neuf : la garde TypeScript qui les compte exempte `vitrine`
--     nommément (20261001120000:69-72), et rien ne se « publie » encore ici —
--     `reservation_slots.status` est un état d'ouverture, pas une publication
--     de module au sens de cette garde.
--   * AUCUNE liste d'attente, AUCUNE file, AUCUNE invitation : RES-2 et RES-3.
--   * AUCUN QR-preuve. Décision produit (ADR-109) : le check-in passe par un
--     CODE COURT présenté au staff, jamais par un QR que le joueur porte —
--     « le QR public est une adresse, jamais une preuve de présence ».
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Les activités réservables
--
-- L'unité que le commerçant nomme (« Dégustation », « Atelier floral »).
-- `active` est un interrupteur, pas une suppression : couper une activité
-- ferme les réservations à venir sans effacer l'historique des arrivées.
-- ────────────────────────────────────────────────────────────

create table public.reservation_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  name text not null
    check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 120),
  description text
    check (description is null or pg_catalog.char_length(description) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  -- Un nom = une activité dans le catalogue du commerçant. Unicité PAR
  -- ORGANISATION et EXACTE (même arbitrage que campaign_templates : la base
  -- n'assimile pas deux libellés que le commerçant a écrits différemment).
  constraint reservation_activities_org_name_unique unique (organization_id, name),
  -- Cible de la FK composite de `reservation_slots`.
  unique (id, organization_id)
);

comment on table public.reservation_activities is
  'Activité réservable d''une organisation (RES-1a). STRICTEMENT org-scopée et '
  'réservée aux ÉDITEURS en lecture comme en écriture — aucune policy anon : '
  'le parcours joueur ne lit ces lignes QUE par une RPC service_role, qui '
  'choisit ce qu''elle expose. `active = false` ferme les réservations sans '
  'rien effacer.';
comment on column public.reservation_activities.active is
  'Interrupteur d''ouverture, jamais une suppression : `false` fait refuser '
  'reserve_slot sur tous ses créneaux, et laisse intactes les réservations '
  'déjà confirmées et les arrivées déjà enregistrées.';

create index reservation_activities_org_created_idx
  on public.reservation_activities (organization_id, created_at desc);


-- ────────────────────────────────────────────────────────────
-- 2. Les créneaux
--
-- ── LES HEURES ET LE FUSEAU DE L'ORGANISATION ──
--
-- `starts_at`/`ends_at` sont des `timestamptz`, donc des INSTANTS ABSOLUS :
-- « 14 h heure du commerce » n'est pas une donnée, c'est un RENDU. Le fuseau
-- (`organizations.timezone`, 00019:11) intervient à la saisie et à
-- l'affichage, jamais dans la comparaison — `starts_at > now()` est juste
-- quelle que soit la zone, et une colonne de fuseau par créneau aurait créé
-- une seconde vérité à tenir d'accord avec la première.
-- C'est `reservation_public_state` qui transporte le fuseau jusqu'au client,
-- pour qu'il n'ait pas à le deviner.
-- ────────────────────────────────────────────────────────────

create table public.reservation_slots (
  id uuid primary key default gen_random_uuid(),
  -- Colonne NUE, sans `references` simple : seule la FK COMPOSITE ci-dessous
  -- relie le créneau à son activité. Une FK simple en plus n'ajouterait rien
  -- (la composite implique l'existence) et ferait rougir
  -- fk_composites_couverture.test.sql, dont c'est précisément le métier de
  -- refuser qu'une FK d'une seule colonne décide seule entre deux locataires.
  activity_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- FINIE et STRICTEMENT POSITIVE. Un créneau à zéro place n'est pas un
  -- créneau fermé — `status` dit cela — c'est une promesse d'attente sans
  -- issue affichée comme une offre.
  capacity integer not null check (capacity > 0),
  status text not null default 'draft'
    check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint reservation_slots_window_check check (ends_at > starts_at),
  -- Un seul créneau d'une activité peut commencer à un instant donné. Sans
  -- cela, un double clic d'éditeur crée deux créneaux jumeaux, la capacité
  -- réelle double en silence et le commerçant accueille deux fois trop de
  -- monde sans avoir rien décidé. Sert aussi d'index de tête à `activity_id`.
  constraint reservation_slots_activity_start_unique unique (activity_id, starts_at),
  -- Cible de la FK composite de `reservations`.
  unique (id, organization_id),
  foreign key (activity_id, organization_id)
    references public.reservation_activities(id, organization_id) on delete cascade
);

comment on table public.reservation_slots is
  'Créneau à capacité FINIE d''une activité réservable. `starts_at`/`ends_at` '
  'sont des instants absolus : le fuseau de l''organisation (organizations.timezone) '
  'est un rendu, jamais une donnée du créneau. La capacité n''est jamais '
  'décomptée ici — elle se déduit des réservations VIVANTES, c''est-à-dire '
  '`confirmed` ET `checked_in` (une arrivée occupe la place qu''elle honore : '
  'le check-in ne libère rien), sous verrou d''avis, dans reserve_slot.';
comment on column public.reservation_slots.status is
  'draft (invisible du joueur) → open (réservable) → closed (le commerçant a '
  'fermé les inscriptions). Fermer ne touche à AUCUNE réservation déjà '
  'confirmée — critère d''acceptation RES-2.';

create index reservation_slots_org_starts_idx
  on public.reservation_slots (organization_id, starts_at);


-- ────────────────────────────────────────────────────────────
-- 3. Les réservations
--
-- ── L'IDENTITÉ DU JOUEUR : UN HASH, JAMAIS UN JETON ──
--
-- `player_key_hash` est l'empreinte SHA-256 du cookie HTTP-only du joueur,
-- exactement comme `event_players.token_hash` et `jackpot_participants.
-- player_token_hash`. La base ne voit JAMAIS le jeton brut : une fuite de
-- cette colonne ne permet de se faire passer pour personne.
--
-- ── L'EMAIL ET SON CONSENTEMENT (ADR-109) ──
--
-- L'email est FACULTATIF et porté PAR RÉSERVATION, pas par une identité
-- durable : le joueur qui veut sa confirmation la demande, celui qui n'en veut
-- pas réserve quand même. `consent_transactional_at` est le consentement au
-- message NÉCESSAIRE AU SERVICE (confirmation, rappel, annulation) — il n'est
-- pas, et ne devient jamais, un consentement marketing : ces deux-là ne se
-- mélangent pas (invariant transverse « consentement explicite pour les
-- messages non nécessaires au service »). L'envoi Resend est câblé en L4.
-- ────────────────────────────────────────────────────────────

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  -- Colonne nue : voir reservation_slots.activity_id ci-dessus.
  slot_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- Sa FORME est portée par `reservations_player_key_shape` ci-dessous, et pas
  -- ici : elle admet une seconde valeur, le marqueur de purge, qui ne peut
  -- s'écrire qu'en fonction de `id` — donc d'une autre colonne.
  player_key_hash text not null,
  -- BORNE DE LONGUEUR avant la forme (précédent hunt_completions,
  -- 20260724120000:152) : `~*` sur une chaîne non bornée est un travail
  -- proportionnel à ce que l'appelant envoie, et 254 est le maximum d'un
  -- chemin d'expéditeur (RFC 5321). reserve_slot refuse au-delà, plutôt que de
  -- laisser la contrainte lever une erreur que le joueur ne comprendrait pas.
  email text
    check (email is null
           or (pg_catalog.char_length(email) <= 254
               and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  consent_transactional_at timestamptz,
  -- Code court de check-in : alphabet sans ambiguïté (ni I/O/0/1), posé par
  -- le trigger SECURITY DEFINER ci-dessous, jamais par le client. 8 caractères
  -- sur 32 symboles = 2^40 possibilités ; il n'est PAS un secret durable mais
  -- un identifiant de comptoir, et il ne vaut que dans SON organisation.
  code text not null check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled', 'checked_in')),
  created_at timestamptz not null default pg_catalog.now(),
  cancelled_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id) on delete set null,

  -- ── ÉTATS COHÉRENTS ──
  -- Les deux premières contraintes sont des ÉQUIVALENCES, pas des
  -- implications : `status` et son horodatage ne peuvent pas se contredire
  -- dans un sens NI dans l'autre. Une implication simple aurait laissé passer
  -- `status = 'confirmed'` avec un `checked_in_at` posé — soit une arrivée
  -- réelle qu'aucun écran ne montre.
  constraint reservations_checkin_state
    check ((status = 'checked_in') = (checked_in_at is not null)),
  constraint reservations_cancel_state
    check ((status = 'cancelled') = (cancelled_at is not null)),
  -- XOR terminal (patron reward_issuances_terminal_state) : les deux nuls =
  -- réservation vivante ; un seul posé = état final. Jamais les deux.
  constraint reservations_terminal_state
    check (cancelled_at is null or checked_in_at is null),
  constraint reservations_checkin_actor_state
    check (checked_in_by is null or checked_in_at is not null),
  -- ÉQUIVALENCE, comme les deux états ci-dessus, et pour la même raison : une
  -- implication simple laissait passer l'autre moitié du problème. Un
  -- consentement sans adresse ne consent à rien ; UNE ADRESSE SANS CONSENTEMENT
  -- EST UNE DONNÉE PERSONNELLE CONSERVÉE SANS BASE — c'est le cas que
  -- l'implication laissait entrer, et il n'était retenu que par la discipline
  -- de `reserve_slot`. Il l'est maintenant par la base. C'est aussi ce qui rend
  -- la purge honnête : effacer l'email sans effacer le consentement laisserait
  -- la trace « cette personne acceptait qu'on lui écrive », sur une personne
  -- qu'on ne sait plus joindre — la purge efface donc les deux d'un geste.
  constraint reservations_consent_state
    check ((email is not null) = (consent_transactional_at is not null)),
  -- L'EMPREINTE, OU LE MARQUEUR DE PURGE, ET RIEN D'AUTRE. Le marqueur est
  -- HORS de l'espace des empreintes (deux-points, absent de l'hexadécimal) et
  -- adossé à l'identifiant de SA ligne : unique par construction — donc
  -- compatible d'office avec l'index partiel — et impossible à confondre avec
  -- une empreinte comme à recalculer depuis une valeur devinée.
  constraint reservations_player_key_shape
    check (player_key_hash ~ '^[0-9a-f]{64}$'
           or player_key_hash = 'purge:' || id::text),
  -- Le code ne vaut que dans son organisation : deux commerçants ont le droit
  -- d'émettre le même. C'est la portée que checkin_reservation applique.
  constraint reservations_org_code_unique unique (organization_id, code),
  foreign key (slot_id, organization_id)
    references public.reservation_slots(id, organization_id) on delete cascade
);

comment on table public.reservations is
  'Réservation d''un joueur sur un créneau (RES-1a). Identité PSEUDONYME '
  '(hash SHA-256 du cookie, jamais le jeton brut). Écriture exclusivement par '
  'les RPC service_role — aucun grant insert/update/delete à `authenticated` : '
  'capacité, annulation et check-in sont serveur-autoritaires. La colonne '
  '`email` est HORS du grant de colonnes du commerçant : elle n''existe que '
  'pour l''envoi transactionnel côté serveur.';
comment on column public.reservations.player_key_hash is
  'Empreinte SHA-256 du cookie joueur HTTP-only (miroir event_players.token_hash '
  '/ jackpot_participants.player_token_hash). Neutralisée par '
  'purge_expired_personal_data passé la rétention de l''organisation, remplacée '
  'par le marqueur `purge:<id>` — HORS de l''espace des empreintes, donc '
  'inutilisable comme clé d''accès par les RPC joueur.';
comment on column public.reservations.consent_transactional_at is
  'Consentement au message NÉCESSAIRE AU SERVICE (confirmation, rappel, '
  'annulation), capturé à la réservation — ADR-109. N''est JAMAIS un '
  'consentement marketing et ne s''y convertit pas.';
comment on column public.reservations.code is
  'Code court présenté au staff à l''arrivée. Unique PAR ORGANISATION, posé '
  'par le trigger reservations_set_code, jamais fourni par le client. Ce n''est '
  'pas un QR-preuve (ADR-109) : le check-in exige une action staff authentifiée.';

-- UNICITÉ MÉTIER #2 : une identité ne détient qu'UNE réservation vivante sur
-- un créneau. PARTIEL — sans quoi annuler puis re-réserver serait refusé par la
-- base, alors que c'est un parcours normal. Sert aussi d'index de tête au
-- comptage de capacité (`slot_id` en tête).
--
-- L'ENSEMBLE D'ÉTATS EST LE MÊME QUE CELUI DU COMPTAGE DE `reserve_slot`, et
-- ce n'est pas une commodité : sur `confirmed` seul, un joueur arrivé n'était
-- plus dans l'index — il pouvait reprendre une seconde place sur le créneau
-- qu'il venait d'honorer, et la place qu'il occupait physiquement était
-- revendue à quelqu'un d'autre. Les deux listes se lisent ensemble ou pas du
-- tout. `cancelled` reste dehors : la place, elle, est réellement rendue.
create unique index reservations_slot_player_active_idx
  on public.reservations (slot_id, player_key_hash)
  where status in ('confirmed', 'checked_in');

create index reservations_org_created_idx
  on public.reservations (organization_id, created_at desc);
-- « Mes réservations chez ce commerçant » : le seul chemin de lecture joueur.
create index reservations_org_player_idx
  on public.reservations (organization_id, player_key_hash);


-- ────────────────────────────────────────────────────────────
-- 4. Génération du code court (service-authoritative)
--
-- Patron event_sessions_set_join_code (20260727120000:409) à deux différences
-- près, toutes deux imposées par le fait que l'unicité est ici PAR
-- ORGANISATION : la sonde de collision est org-scopée, et la longueur passe à
-- 8 (le code se dicte au comptoir, il vit plus longtemps qu'un join_code de
-- soirée).
--
-- LE CODE DE L'APPELANT EST ÉCRASÉ, TOUJOURS. La première version de ce fichier
-- respectait un `code` déjà posé, « pour que les fixtures en choisissent de
-- déterministes » : c'était laisser CHOISIR un identifiant de comptoir à qui
-- sait écrire dans la table, et faire reposer l'imprévisibilité du code sur la
-- discipline de l'appelant plutôt que sur la base. Entre écraser en silence et
-- lever une exception, on écrase : la garantie est la même — aucune ligne ne
-- porte jamais un code choisi — et aucune écriture légitime n'échoue pour
-- autant. Les rares fixtures qui ont besoin d'un code précis le posent par un
-- `update`, geste explicite et hors de portée d'un insert.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservations_set_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  for attempt in 1..12 loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || pg_catalog.substr(
        v_alphabet,
        pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1,
        1
      );
    end loop;
    if not exists (
      select 1 from public.reservations r
       where r.organization_id = new.organization_id
         and r.code = v_code
    ) then
      new.code := v_code;
      return new;
    end if;
  end loop;
  raise exception 'reservation code generation exhausted';
end;
$$;

revoke all on function public.reservations_set_code()
  from public, anon, authenticated;

create trigger reservations_set_code
  before insert on public.reservations
  for each row execute function public.reservations_set_code();


-- ────────────────────────────────────────────────────────────
-- 5. RLS et grants
--
-- Motif « campaign_templates: editors » (20260802120000:161-209) pour les deux
-- tables de configuration ; lecture MEMBRE pour les réservations, parce que le
-- CAISSIER doit voir qui arrive — c'est son écran de comptoir — là où il n'a
-- rien à faire du catalogue d'activités.
-- ────────────────────────────────────────────────────────────

alter table public.reservation_activities enable row level security;
alter table public.reservation_slots enable row level security;
alter table public.reservations enable row level security;

-- Les privilèges par défaut de Supabase servent anon/authenticated sur toute
-- nouvelle table de `public` : on repart de zéro. anon n'est JAMAIS re-servi.
revoke all on table public.reservation_activities from public, anon, authenticated;
revoke all on table public.reservation_slots from public, anon, authenticated;
revoke all on table public.reservations from public, anon, authenticated;

create policy "reservation_activities: editors" on public.reservation_activities
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "reservation_slots: editors" on public.reservation_slots
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- LECTURE SEULE, et pour TOUS les membres (caissier compris). Il n'existe
-- délibérément AUCUNE policy d'écriture : la capacité, l'annulation et le
-- check-in passent par les RPC ci-dessous. Une policy `for all` ici aurait
-- rendu la capacité contournable par un simple PostgREST — un éditeur aurait
-- pu insérer la 21e réservation d'un créneau de 20.
create policy "reservations: members read" on public.reservations
  for select to authenticated
  using (public.is_org_member(organization_id));

-- AUCUN `grant delete`, NI SUR LES ACTIVITÉS NI SUR LES CRÉNEAUX, et c'est un
-- retrait délibéré : la cascade de la FK composite emporte les créneaux d'une
-- activité PUIS les réservations de ces créneaux — donc l'historique des
-- arrivées, sans audit et sans qu'aucun écran n'ait compté ce qui allait
-- disparaître. Cela contredisait le contrat écrit deux sections plus haut
-- (« `active` est un interrupteur, pas une suppression »). Le motif dominant du
-- dépôt pour un geste destructif est de COMPTER D'ABORD ce qui serait perdu —
-- les six gardes existantes le font côté application ; en SQL, le plus simple
-- qui soit sûr est de ne pas ouvrir la porte, et de laisser `active = false`
-- (activité) et `status = 'closed'` (créneau) faire le travail sans rien
-- effacer. Une suppression réelle, si elle est demandée, sera une RPC qui
-- énonce d'abord son bilan.
grant select on table public.reservation_activities to authenticated;
grant insert (organization_id, name, description, active)
  on public.reservation_activities to authenticated;
grant update (name, description, active)
  on public.reservation_activities to authenticated;

grant select on table public.reservation_slots to authenticated;
grant insert (activity_id, organization_id, starts_at, ends_at, capacity, status)
  on public.reservation_slots to authenticated;
grant update (starts_at, ends_at, capacity, status)
  on public.reservation_slots to authenticated;

-- GRANT DE COLONNES, et `email` n'y est PAS. Le commerçant lit l'agenda —
-- qui vient, quand, avec quel code, arrivé ou non ; l'adresse n'existe que
-- pour que le serveur envoie la confirmation. Conséquence à connaître avant
-- d'écrire la requête en L4 : un `select *` PostgREST sera REFUSÉ EN ENTIER
-- sur cette table (le précédent est getUserAndOrg, 20261001120000:110-114) —
-- les colonnes doivent être énumérées.
grant select (
  id, slot_id, organization_id, player_key_hash, consent_transactional_at,
  code, status, created_at, cancelled_at, checked_in_at, checked_in_by
) on public.reservations to authenticated;


-- ────────────────────────────────────────────────────────────
-- 5 bis. LES SIGNATURES D'AVANT — retirées AVANT de recréer
--
-- Ce fichier a été RÉÉCRIT EN PLACE après une première application (le check-in
-- ne libère plus de place ; `reserve_slot` a reçu sa borne de locataire). Sur
-- une base FRAÎCHE ces deux ordres ne trouvent rien et ne coûtent rien ; sur une
-- base qui a vu la version antérieure ils sont INDISPENSABLES, et pour deux
-- raisons différentes :
--
--   * `reserve_slot(uuid, text, text, boolean)` — l'ancienne, SANS
--     `p_organization_id`. Un `create or replace` de la nouvelle l'aurait
--     laissée en place À CÔTÉ : Postgres distingue les fonctions par leurs
--     types d'arguments, et un appel à quatre arguments se serait résolu sur
--     l'ancienne. La borne de locataire aurait alors été contournable par la
--     seule FORME de l'appel — exactement le trou que la réécriture ferme.
--   * `checkin_reservation(uuid, text, text)` — même signature, mais son
--     `returns table` a gagné `window_state`. `create or replace` REFUSE de
--     changer un type de retour : sans ce `drop`, la migration ÉCHOUE.
--
-- Aucun `cascade` : rien ne dépend de ces fonctions, et une dépendance
-- inattendue doit faire échouer la migration, pas disparaître avec elle. Les
-- privilèges partent avec la fonction et sont reposés par les `grant` qui
-- suivent chaque `create`. Le catalogue est vérifié par pgTAP (ACL-22/23) :
-- une seule signature par RPC, sur base fraîche comme sur base réécrite.
-- ────────────────────────────────────────────────────────────

drop function if exists public.reserve_slot(uuid, text, text, boolean);
drop function if exists public.checkin_reservation(uuid, text, text);


-- ────────────────────────────────────────────────────────────
-- 6. `reserve_slot` — le seul chemin par lequel une place se prend
--
-- ── POURQUOI UN VERROU D'AVIS, ET PAS UN `for update` SUR LE CRÉNEAU ──
--
-- Ce qu'il faut sérialiser n'est pas la ligne du créneau — personne ne la
-- modifie — mais le COUPLE « compter, puis insérer ». Un `for update` sur
-- `reservation_slots` le ferait aussi, au prix d'un verrou de ligne tenu par
-- une transaction qui n'écrit pas cette ligne. Le verrou d'avis dit exactement
-- ce qu'on veut dire, et c'est le patron déjà en place pour le plafond de
-- ligues (20260723100000:117).
--
-- ── LA CLÉ DU VERROU PORTE L'ORGANISATION ──
--
-- `'reservation_slot:' || organisation || ':' || créneau`, et non le créneau
-- seul. Ce n'est pas une frontière de sécurité — deux UUID ne se rencontrent
-- pas — c'est une règle d'hygiène : dans ce fichier, TOUT ce qui désigne un
-- objet le fait sous son locataire (FK composites, unicité du code, filtres des
-- RPC). Un espace de noms de verrous qui, seul, l'oublierait serait le premier
-- endroit où une clé bâtie plus tard sur un identifiant NON global — un slug,
-- un numéro de créneau par commerce — sérialiserait en silence deux
-- organisations l'une derrière l'autre. La clé est la MÊME dans
-- `cancel_reservation` : deux clés divergentes ne se verrouilleraient pas
-- mutuellement, et l'annulation cesserait d'être sérialisée avec la réservation.
--
-- ORDRE DES REFUS, ET IL COMPTE : l'idempotence est évaluée AVANT la capacité.
-- Un joueur déjà inscrit sur un créneau devenu complet doit retrouver sa
-- réservation, pas s'entendre dire « complet » sur sa propre place.
--
-- ── L'ORGANISATION EST EXIGÉE, ET LE CRÉNEAU SEUL NE SUFFIT PAS ──
--
-- `p_organization_id` n'est pas une commodité de routage : c'est la borne de
-- locataire. Sans elle, un identifiant de créneau — 128 bits, mais qui circule
-- en clair dans les URL publiques d'un commerce — suffisait à faire écrire la
-- RPC dans les tables d'une AUTRE organisation, et à en rendre les attributs
-- (`starts_at`, `ends_at`, `capacity`) dans la réponse `reserved`. Le contexte
-- de la page appelante dit chez QUI le joueur croit réserver ; la RPC vérifie
-- que le créneau est bien de cette maison, et rend `unavailable` sinon —
-- indistinctement du créneau qui n'existe pas. Patron `checkin_reservation`.
-- ────────────────────────────────────────────────────────────

create or replace function public.reserve_slot(
  p_organization_id uuid,
  p_slot_id uuid,
  p_player_key_hash text,
  p_email text default null,
  p_consent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.reservation_slots%rowtype;
  v_activity_active boolean;
  v_existing public.reservations%rowtype;
  v_email text;
  v_count integer;
  v_row public.reservations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Organisation ABSENTE = bogue de l'appelant, pas un refus métier : on le
  -- dit fort (patron checkin_reservation). Organisation PRÉSENTE MAIS AUTRE =
  -- refus métier muet, traité plus bas avec les cinq autres.
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  -- La forme de l'adresse est jugée AVANT le verrou : une chaîne malformée ne
  -- vaut pas qu'on sérialise le créneau derrière elle.
  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null
     and (pg_catalog.char_length(v_email) > 254
          or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  then
    return pg_catalog.jsonb_build_object('state', 'invalid_email');
  end if;

  -- LE VERROU D'ABORD, LA LECTURE ENSUITE. La version initiale lisait le
  -- créneau — donc sa CAPACITÉ — avant de verrouiller, puis comparait le
  -- comptage à cette valeur lue plus tôt : un éditeur qui abaissait la capacité
  -- entre les deux voyait la place accordée sur l'ancien chiffre. Tout ce qui
  -- décide est désormais lu sous le verrou, dans le même instantané que le
  -- comptage. À partir d'ici, « lire », « compter » et « insérer » sont un seul
  -- geste.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_slot:' || p_organization_id::text || ':' || p_slot_id::text,
      0)
  );

  select s.* into v_slot
    from public.reservation_slots s
   where s.id = p_slot_id
     and s.organization_id = p_organization_id;

  -- UN SEUL ÉTAT POUR SIX REFUS, ET C'EST VOULU : créneau inexistant, créneau
  -- d'une AUTRE organisation, activité coupée, organisation sans le droit
  -- `vitrine`, créneau non ouvert, créneau passé. Les distinguer donnerait à un
  -- appelant public un oracle sur l'existence d'un créneau et sur l'état
  -- commercial d'une organisation qui n'est pas la sienne — même arbitrage que
  -- join_event_session.
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select a.active into v_activity_active
    from public.reservation_activities a
   where a.id = v_slot.activity_id
     and a.organization_id = v_slot.organization_id;

  if not coalesce(v_activity_active, false)
     or v_slot.status <> 'open'
     or v_slot.starts_at <= pg_catalog.now()
     -- DÉFENSE EN PROFONDEUR : L4 vérifiera ce droit pour rendre au commerçant
     -- un message utile ; ici il empêche que la fermeture d'un abonnement
     -- laisse une page de réservation ouverte en écriture.
     or not public.org_has_module_access(v_slot.organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- IDEMPOTENCE. Sous le verrou, donc deux appels simultanés du MÊME joueur
  -- n'insèrent pas deux lignes : le second attend et voit la première.
  -- `checked_in` EST DE LA PARTIE : le joueur déjà arrivé détient toujours sa
  -- place, et lui rendre `reserved` sur une seconde ligne aurait vendu deux
  -- fois le même siège à la même personne. `status` est rendu avec, pour que
  -- L4 sache s'il doit afficher « vous êtes inscrit » ou « vous êtes arrivé ».
  select r.* into v_existing
    from public.reservations r
   where r.slot_id = p_slot_id
     and r.player_key_hash = p_player_key_hash
     and r.status in ('confirmed', 'checked_in');
  if found then
    return pg_catalog.jsonb_build_object(
      'state', 'already_reserved',
      'reservation_id', v_existing.id,
      'code', v_existing.code,
      'status', v_existing.status
    );
  end if;

  -- LES DEUX ÉTATS VIVANTS, PAS `confirmed` SEUL. Une arrivée occupe la place
  -- qu'elle honore : la retirer du comptage aurait fait du passage au comptoir
  -- une libération de siège. Cette liste et celle de
  -- `reservations_slot_player_active_idx` sont la même — les modifier ensemble.
  select pg_catalog.count(*)::integer into v_count
    from public.reservations r
   where r.slot_id = p_slot_id
     and r.status in ('confirmed', 'checked_in');
  if v_count >= v_slot.capacity then
    return pg_catalog.jsonb_build_object(
      'state', 'full',
      'capacity', v_slot.capacity
    );
  end if;

  insert into public.reservations (
    slot_id, organization_id, player_key_hash, email, consent_transactional_at
  ) values (
    v_slot.id,
    v_slot.organization_id,
    p_player_key_hash,
    -- L'ADRESSE N'EST CONSERVÉE QUE SI ELLE EST CONSENTIE. Sans consentement,
    -- elle n'a aucune finalité — rien ne sera envoyé — et une donnée
    -- personnelle sans finalité ne se stocke pas « au cas où ». Elle est donc
    -- jetée ici, pas à l'envoi : la contrainte reservations_consent_state
    -- refuserait de toute façon la ligne qui la garderait seule.
    case when coalesce(p_consent, false) then v_email end,
    case when coalesce(p_consent, false) and v_email is not null
         then pg_catalog.now() end
  )
  returning * into v_row;

  return pg_catalog.jsonb_build_object(
    'state', 'reserved',
    'reservation_id', v_row.id,
    'code', v_row.code,
    'starts_at', v_slot.starts_at,
    'ends_at', v_slot.ends_at,
    'remaining', v_slot.capacity - (v_count + 1)
  );
end;
$$;

comment on function public.reserve_slot(uuid, uuid, text, text, boolean) is
  'Prend une place sur un créneau, DANS UNE ORGANISATION DONNÉE. Atomique '
  '(verrou d''avis sur le créneau, puis lecture du créneau ET comptage des '
  'réservations vivantes — `confirmed` et `checked_in` — sous ce verrou : '
  'aucune sur-réservation sous concurrence, et le check-in ne libère aucune '
  'place) et idempotente (re-réserver rend `already_reserved`, le code existant '
  'et le statut). Refuse `full` à capacité atteinte, `invalid_email` sur une '
  'adresse malformée ou de plus de 254 caractères, et `unavailable` — '
  'indistinctement — pour un créneau inexistant, un créneau d''une AUTRE '
  'organisation, une activité coupée, un créneau non ouvert ou passé, et une '
  'organisation sans le droit `vitrine`. L''adresse n''est stockée QUE si '
  '`p_consent`.';

revoke all on function public.reserve_slot(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.reserve_slot(uuid, uuid, text, text, boolean)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 7. `cancel_reservation` — la place revient au créneau
--
-- AUTORISATION PAR POSSESSION : le couple (identifiant, empreinte du cookie)
-- fait foi. Aucun identifiant d'organisation n'est demandé — le connaître
-- n'ajouterait rien, et l'empreinte seule rend l'énumération sans objet.
--
-- LE VERROU EST LE MÊME QUE CELUI DE `reserve_slot` — la MÊME CLÉ, organisation
-- comprise, sans quoi les deux RPC prendraient deux verrous distincts et
-- cesseraient de se sérialiser l'une l'autre. C'est tout l'intérêt de n'avoir
-- AUCUN compteur dénormalisé : la place « revient » sans qu'aucune ligne ne
-- soit décrémentée, simplement parce que le comptage de `reserve_slot` cesse de
-- voir cette réservation. Rien à maintenir d'accord.
--
-- L'organisation n'est toujours pas un PARAMÈTRE — l'appelant n'a pas à la
-- connaître — elle est LUE sur la réservation, en même temps que son créneau.
-- ────────────────────────────────────────────────────────────

create or replace function public.cancel_reservation(
  p_reservation_id uuid,
  p_player_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_id uuid;
  v_org_id uuid;
  v_starts_at timestamptz;
  v_row public.reservations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Cette garde de forme est aussi ce qui rend une ligne PURGÉE inatteignable :
  -- son `player_key_hash` vaut alors `purge:<id>`, qui ne peut pas franchir ce
  -- filtre. Le `not like` explicite ci-dessous ne fait donc que rendre
  -- l'intention lisible — et survivrait à un assouplissement de cette garde.
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  -- Lecture SANS verrou, pour connaître le créneau ET SON ORGANISATION — les
  -- deux moitiés de la clé de verrou. Rien n'est décidé sur cette lecture : tout
  -- est relu ci-dessous une fois le verrou pris.
  select r.slot_id, r.organization_id into v_slot_id, v_org_id
    from public.reservations r
   where r.id = p_reservation_id
     and r.player_key_hash = p_player_key_hash
     and r.player_key_hash not like 'purge:%';
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- MÊME CLÉ QUE `reserve_slot`, organisation comprise : c'est ce qui fait que
  -- les deux RPC s'attendent réellement l'une l'autre.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_slot:' || v_org_id::text || ':' || v_slot_id::text,
      0)
  );

  select r.* into v_row
    from public.reservations r
   where r.id = p_reservation_id
     and r.player_key_hash = p_player_key_hash
     and r.player_key_hash not like 'purge:%';
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- Le créneau est relu séparément — un `into` PL/pgSQL n'accepte pas un
  -- %rowtype et un scalaire dans la même liste — mais sous le MÊME verrou.
  select s.starts_at into v_starts_at
    from public.reservation_slots s
   where s.id = v_row.slot_id
     and s.organization_id = v_row.organization_id;

  -- UNE ARRIVÉE NE S'ANNULE PAS. Le client est passé ; réécrire l'histoire
  -- fausserait le taux de présence du commerçant, et la contrainte
  -- reservations_terminal_state refuserait la ligne de toute façon.
  if v_row.status = 'checked_in' then
    return pg_catalog.jsonb_build_object(
      'state', 'already_checked_in',
      'reservation_id', v_row.id
    );
  end if;

  -- IDEMPOTENCE : deuxième annulation, même réponse, aucune écriture — et
  -- surtout `cancelled_at` n'est pas repoussé à chaque appel. AVANT `too_late`,
  -- volontairement : une réservation déjà annulée le reste, que son créneau
  -- soit passé ou non, et un refus à ce stade laisserait croire qu'elle est
  -- encore due.
  if v_row.status = 'cancelled' then
    return pg_catalog.jsonb_build_object(
      'state', 'cancelled',
      'reservation_id', v_row.id,
      'cancelled_at', v_row.cancelled_at
    );
  end if;

  -- LE CRÉNEAU COMMENCÉ NE SE DÉSISTE PLUS. Sans cette borne, une place
  -- confirmée sur un créneau en cours — ou d'hier — pouvait être rendue au
  -- comptage à tout moment : le commerçant qui a préparé pour vingt personnes
  -- voyait son remplissage s'effondrer après coup, et un no-show s'effaçait de
  -- ses statistiques d'un simple appel. Le no-show reste `confirmed` et non
  -- arrivé — c'est une information, pas un accident à masquer. Même borne que
  -- l'ouverture des réservations (`starts_at > now()`), lue dans l'autre sens.
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

  return pg_catalog.jsonb_build_object(
    'state', 'cancelled',
    'reservation_id', v_row.id,
    'cancelled_at', v_row.cancelled_at
  );
end;
$$;

comment on function public.cancel_reservation(uuid, text) is
  'Annule une réservation sur preuve de possession (identifiant + empreinte du '
  'cookie joueur). Idempotente ; refuse `already_checked_in` sur une arrivée '
  'déjà enregistrée, `too_late` sur un créneau déjà commencé, et `unknown` sur '
  'une ligne dont les données personnelles ont été purgées. Libère la place '
  'SANS décrémenter quoi que ce soit : la capacité se déduit des lignes '
  'vivantes, et l''annulation se fait sous le MÊME verrou d''avis que '
  'reserve_slot.';

revoke all on function public.cancel_reservation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_reservation(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 8. `checkin_reservation` — l'arrivée, validée par le staff
--
-- Patron redeem_contest_award (20260804120000:185) pour l'indistinguabilité,
-- et redeem_reward_by_code (20260805150000:715-731) pour le contrôle de rôle :
-- l'acteur est un UUID de membre, vérifié EN SQL contre organization_members.
-- Un `p_actor` libre aurait fait de l'audit une déclaration sur l'honneur.
--
-- ── LA FENÊTRE, ET POURQUOI ELLE EXISTE ──
--
-- Sans borne de temps, un code valait pour toujours : le staff pouvait marquer
-- « arrivé » trois semaines avant le créneau — ou trois mois après — et le taux
-- de présence du commerçant, seule mesure qu'il tire de ce module, ne voulait
-- plus rien dire. Pire, un check-in anticipé consommait la réservation d'un
-- joueur qui ne s'était pas encore présenté.
--
-- LA BORNE CHOISIE, la plus simple qui tienne au comptoir :
--   * ouverture  = `starts_at - 1 heure`. Les gens arrivent en avance, jamais
--     la veille ; une heure couvre l'accueil sans ouvrir la porte à un usage
--     détaché de la séance.
--   * fermeture  = LA PLUS TARDIVE de ces deux bornes :
--       (a) FIN DE LA JOURNÉE CIVILE du créneau, DANS LE FUSEAU DE
--           L'ORGANISATION. Pas `ends_at` : un atelier qui déborde, un
--           retardataire accueilli à la fin, un staff qui saisit les arrivées
--           en fermant la caisse, sont des gestes normaux qu'une borne à la
--           minute aurait refusés. La journée civile est ce que le commerçant
--           appelle « aujourd'hui », et c'est pour cela que le fuseau
--           intervient : à 23 h à Paris, un créneau du jour est encore du jour,
--           ce qu'un calcul en UTC aurait déjà nié.
--       (b) `ends_at + 2 heures`.
--
--     POURQUOI (b) EXISTE : (a) SEULE COUPAIT AVANT LA FIN DU CRÉNEAU dès que
--     celui-ci franchissait minuit. Une séance de 23 h à 1 h n'acceptait plus
--     personne passé 0 h — c'est-à-dire pendant la moitié de sa durée, et
--     précisément aux heures où ce genre de séance se remplit. La fermeture ne
--     peut pas être ANTÉRIEURE à la fin de la séance : c'est la seule chose que
--     (b) affirme. Les deux heures de battement rendent au créneau nocturne la
--     même tolérance de comptoir que la journée civile donne au créneau diurne.
--
--     `greatest` des deux, donc : un créneau de jour garde EXACTEMENT la borne
--     d'avant (sa journée civile se termine bien après `ends_at + 2 h`), et
--     seul celui qui déborde sur le lendemain gagne quelque chose.
--     `coalesce(ends_at, starts_at)` est une ceinture — la colonne est `not
--     null` — pour qu'un futur créneau à fin ouverte ne rende pas la borne nulle
--     et, avec elle, toute la fenêtre indécidable.
--
-- Hors fenêtre, la réservation N'EST PAS CONSOMMÉE et la ligne est tout de même
-- rendue : le comptoir doit pouvoir expliquer son refus. `window_state` dit
-- laquelle des deux bornes a mordu.
-- ────────────────────────────────────────────────────────────

create or replace function public.checkin_reservation(
  p_organization_id uuid,
  p_code text,
  p_actor text
)
returns table(
  id uuid, code text, status text, checked_in_at timestamptz,
  starts_at timestamptz, ends_at timestamptz, activity_name text,
  cancelled_at timestamptz, checked_in_now boolean, window_state text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_actor_id uuid;
  v_id uuid;
  v_timezone text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_actor is null
     or p_actor <> pg_catalog.btrim(p_actor)
     or p_actor !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_actor_id := p_actor::uuid;
  -- Les TROIS rôles marchands valident une arrivée : c'est un geste de
  -- comptoir, donc le caissier en fait partie.
  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = v_actor_id
       and om.role in ('owner', 'editor', 'cashier')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_code := pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, '')));

  -- Le fuseau borne la journée civile du créneau. Même repli que
  -- reservation_public_state : une zone que Postgres ne connaît pas ne doit pas
  -- faire échouer un geste de comptoir.
  select o.timezone into v_timezone
    from public.organizations o
   where o.id = p_organization_id;
  if v_timezone is null or not public.is_valid_timezone(v_timezone) then
    v_timezone := 'Europe/Paris';
  end if;

  update public.reservations r
     set status = 'checked_in',
         checked_in_at = pg_catalog.now(),
         checked_in_by = v_actor_id
   where r.organization_id = p_organization_id
     and r.code = v_code
     -- Deny-by-default : SEULE une réservation vivante s'arrive. Couvre
     -- l'annulée, couvre l'arrivée (idempotence), et couvrira tout statut
     -- ajouté plus tard sans qu'on y repense.
     and r.status = 'confirmed'
     -- Le créneau doit LUI AUSSI appartenir à l'organisation qui valide.
     -- `reservations.organization_id` est censé être redondant avec lui — la
     -- FK composite le garantit ici, contrairement au précédent
     -- contest_awards — mais la lecture ci-dessous applique le même filtre, et
     -- deux filtres qui divergent consommeraient la réservation en affichant
     -- « code inconnu ».
     and exists (
       select 1 from public.reservation_slots s
        where s.id = r.slot_id
          and s.organization_id = p_organization_id
          -- LA FENÊTRE, et elle est la MÊME expression que le `case` de la
          -- lecture ci-dessous : deux formules qui divergeraient rendraient
          -- « too_early » sur une réservation pourtant consommée.
          and pg_catalog.now() >= s.starts_at - interval '1 hour'
          and pg_catalog.now() < greatest(
                ((((s.starts_at at time zone v_timezone)::date + 1)
                   ::timestamp) at time zone v_timezone),
                coalesce(s.ends_at, s.starts_at) + interval '2 hours')
     )
  returning r.id into v_id;

  if v_id is not null then
    insert into public.audit_logs (organization_id, actor, action, metadata)
    values (p_organization_id, p_actor, 'reservation.checkin',
            pg_catalog.jsonb_build_object('reservation_id', v_id));
  end if;

  -- AUCUNE LIGNE pour un code inconnu ET pour un code d'une autre
  -- organisation : le filtre org-scopé est le même dans les deux cas, donc la
  -- réponse aussi. Une ligne EST rendue quand le code existe ici, même s'il
  -- n'a pas été consommé — le comptoir doit pouvoir expliquer son refus
  -- (« déjà arrivé », « annulée »), et `checked_in_now` distingue le geste
  -- réel de sa répétition.
  return query
  select r.id, r.code, r.status, r.checked_in_at,
         s.starts_at, s.ends_at, a.name, r.cancelled_at,
         (r.id is not distinct from v_id),
         -- `::text` explicite : un `case` dont toutes les branches sont des
         -- littéraux rend `unknown`, et `return query` compare STRICTEMENT les
         -- types de colonnes à ceux du `returns table`.
         case
           when pg_catalog.now() < s.starts_at - interval '1 hour'
             then 'too_early'::text
           when pg_catalog.now() >= greatest(
                  ((((s.starts_at at time zone v_timezone)::date + 1)
                     ::timestamp) at time zone v_timezone),
                  coalesce(s.ends_at, s.starts_at) + interval '2 hours')
             then 'too_late'
           else 'ok'
         end
    from public.reservations r
    join public.reservation_slots s
      on s.id = r.slot_id
     and s.organization_id = p_organization_id
    join public.reservation_activities a
      on a.id = s.activity_id
     and a.organization_id = p_organization_id
   where r.organization_id = p_organization_id
     and r.code = v_code
   limit 1;
end;
$$;

comment on function public.checkin_reservation(uuid, text, text) is
  'Valide l''arrivée d''une réservation par son code court. Org-scopée, acteur '
  'obligatoire et vérifié membre owner/editor/cashier EN SQL, idempotente '
  '(`checked_in_now` distingue le geste de sa répétition), auditée sous '
  '`reservation.checkin`. BORNÉE DANS LE TEMPS : de `starts_at - 1 h` à la PLUS '
  'TARDIVE des deux bornes « fin de la journée civile du créneau dans le fuseau '
  'de l''organisation » et « `ends_at` + 2 h » — la seconde existe pour que la '
  'fenêtre d''un créneau qui franchit minuit ne se ferme pas AVANT sa fin ; hors '
  'fenêtre la réservation n''est PAS consommée et `window_state` vaut '
  '`too_early` ou `too_late`. Réponse INDISTINGUABLE — aucune ligne — pour un '
  'code inconnu et pour un code d''une autre organisation.';

revoke all on function public.checkin_reservation(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.checkin_reservation(uuid, text, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 9. `reservation_public_state` — le joueur retrouve sa place sans compte
--
-- ── POURQUOI ORG-SCOPÉE, ALORS QUE L'EMPREINTE EST GLOBALE ──
--
-- Le même cookie suit le joueur chez TOUS les commerçants Lastchance. Rendre
-- « ses réservations » sans borne d'organisation ferait apparaître, sur la
-- page publique d'un commerce, ce que cette personne a réservé chez le
-- concurrent d'en face. La borne n'est pas une précaution : c'est la seule
-- lecture correcte.
--
-- Le FUSEAU de l'organisation est rendu avec l'état — c'est lui qui permet au
-- client d'afficher « samedi 14 h » sans le deviner. `is_valid_timezone` le
-- contrôle : une zone que Postgres ne connaît pas ferait échouer le rendu
-- côté client bien plus loin de la cause.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservation_public_state(
  p_organization_id uuid,
  p_player_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_items jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  select o.timezone into v_timezone
    from public.organizations o
   where o.id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  if v_timezone is null or not public.is_valid_timezone(v_timezone) then
    v_timezone := 'Europe/Paris';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'reservation_id', r.id,
        'code', r.code,
        'status', r.status,
        'created_at', r.created_at,
        'cancelled_at', r.cancelled_at,
        'checked_in_at', r.checked_in_at,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'activity_name', a.name
      )
      order by s.starts_at desc
    ),
    '[]'::jsonb
  ) into v_items
    from public.reservations r
    join public.reservation_slots s
      on s.id = r.slot_id
     and s.organization_id = p_organization_id
    join public.reservation_activities a
      on a.id = s.activity_id
     and a.organization_id = p_organization_id
   where r.organization_id = p_organization_id
     and r.player_key_hash = p_player_key_hash
     -- UNE LIGNE PURGÉE NE SE RELIT PAS. Son `player_key_hash` vaut alors
     -- `purge:<id>`, que la garde de forme ci-dessus interdit déjà de passer en
     -- paramètre : ce filtre ne fait qu'écrire l'intention, et tiendrait encore
     -- si cette garde venait à s'assouplir. Le remplacement PAR MARQUEUR, et
     -- non par une empreinte dérivée de l'identifiant, est ce qui rend cela
     -- vrai — une valeur dérivée reste calculable par quiconque connaît l'`id`,
     -- donc reste un authentifiant, donc n'anonymise rien.
     and r.player_key_hash not like 'purge:%';

  -- NI l'email NI l'empreinte ne sortent d'ici. Le premier est une donnée que
  -- l'appelant a déjà fournie s'il la connaît ; la seconde est la clé d'accès
  -- elle-même, et une réponse qui la recopie n'apprend rien à qui la détient
  -- déjà tout en l'exposant à chaque journal traversé.
  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'timezone', v_timezone,
    'reservations', v_items
  );
end;
$$;

comment on function public.reservation_public_state(uuid, text) is
  'Réservations d''une identité pseudonyme CHEZ UNE organisation — le joueur '
  'retrouve son statut, son créneau et son code sans compte. Bornée à '
  'l''organisation : l''empreinte du cookie est globale, et une réponse '
  'non bornée exposerait sur la page d''un commerce ce que la personne a '
  'réservé chez un autre. N''expose ni l''email ni l''empreinte.';

revoke all on function public.reservation_public_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reservation_public_state(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 10. Purge RGPD — corps VERBATIM de 20260924120000, +1 geste
--
-- Même forme que l'ajout du geste `spins` par 20260924120000:314 : la
-- SIGNATURE NE BOUGE PAS. Ajouter une quatrième colonne de retour aurait exigé
-- un `drop function` (on ne change pas le type de retour par `create or
-- replace`) et une modification de src/app/api/cron/purge-data/route.ts, qui
-- lit les colonnes par leur nom — soit deux périmètres pour un compteur que
-- personne ne lit. Le geste `spins` a fait ce même choix.
--
-- LA LIGNE RESTE, LA PERSONNE S'EFFACE. Supprimer la réservation emporterait
-- le taux de remplissage et le compte des arrivées, qui ne sont pas des
-- données personnelles et appartiennent au commerçant. Trois colonnes
-- partent :
--
--   * `email` — l'adresse ;
--   * `consent_transactional_at` — un consentement sans adresse n'est plus
--     qu'une affirmation sur une personne qu'on ne sait plus joindre, et la
--     contrainte reservations_consent_state le refuserait ;
--   * `player_key_hash` — MÊME MOTIF QUE `spins.player_key` : c'est le LIEN
--     entre toutes les réservations d'une même personne. Le laisser rendrait
--     l'anonymisation illusoire — l'email parti, l'historique resterait
--     rattachable à un appareil.
--
-- ── POURQUOI UN MARQUEUR, ET NON UNE EMPREINTE DÉRIVÉE ──
--
-- La première version écrivait `sha256(id::text)` : unique par construction,
-- conforme au `check` hexadécimal de la colonne — et REDÉRIVABLE PAR QUICONQUE
-- CONNAÎT L'IDENTIFIANT DE LA LIGNE. Or cette colonne n'est pas une étiquette :
-- c'est LA CLÉ D'ACCÈS des RPC joueur. Une valeur calculable depuis un `id` qui
-- circule en clair n'anonymise donc rien — elle remplace un authentifiant
-- secret par un authentifiant public, et rend la ligne purgée annulable et
-- lisible par un tiers qui n'a jamais possédé le cookie.
--
-- Le remplacement est donc `'purge:' || id` — PRÉCÉDENT `spins` ci-dessous,
-- même geste, même raison : hors de l'espace des clés (le deux-points n'est pas
-- de l'hexadécimal), donc refusé par la garde de forme des trois RPC avant même
-- d'atteindre une ligne ; unique par construction, donc compatible d'office
-- avec reservations_slot_player_active_idx ; et auto-descriptif, donc le garde
-- `not like` rend le passage idempotent sans rien recalculer. C'est
-- `reservations_player_key_shape` qui l'admet aux côtés de l'empreinte.
-- ────────────────────────────────────────────────────────────

create or replace function public.purge_expired_personal_data()
returns table(organizations_processed bigint, participations_deleted bigint, subscribers_deleted bigint)
language plpgsql security definer set search_path = '' as $$
declare r record; p_count bigint := 0; s_count bigint := 0; n bigint := 0; c bigint;
begin
  perform pg_catalog.set_config('lastchance.purge_maintenance', 'on', true);
  for r in select id, data_retention_months from public.organizations
           where data_retention_months is not null loop
    n := n + 1;
    delete from public.participations
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months);
    get diagnostics c = row_count; p_count := p_count + c;
    delete from public.newsletter_subscribers
      where organization_id = r.id and unsubscribed_at is not null
        and unsubscribed_at < now() - make_interval(months => r.data_retention_months);
    get diagnostics c = row_count; s_count := s_count + c;
    delete from public.email_log
      where organization_id = r.id
        and sent_at < now() - make_interval(months => r.data_retention_months);

    -- (a) Le journal SMS : la ligne reste, la personne s'efface.
    update public.sms_log
       set recipient = '000000',
           last_error = null,
           updated_at = pg_catalog.clock_timestamp()
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and (recipient <> '000000' or last_error is not null);

    -- (b1) Consentement jamais retiré et périmé : supprimé.
    delete from public.sms_consents
      where organization_id = r.id
        and revoked_at is null
        and consented_at < now() - make_interval(months => r.data_retention_months);

    -- (b2) Consentement RETIRÉ : conservé — c'est la preuve d'opposition — et
    -- réduit à ce qui permet d'honorer cette opposition.
    update public.sms_consents
       set phone = phone_key,
           consent_source = null,
           revoked_reason = null
      where organization_id = r.id
        and revoked_at is not null
        and revoked_at < now() - make_interval(months => r.data_retention_months)
        and phone_key ~ '^\+?[0-9 .()\-]{6,20}$'
        and (phone <> phone_key or consent_source is not null
             or revoked_reason is not null);

    -- (c) Les PARTIES : la ligne reste, le LIEN entre les parties d'une même
    -- personne meurt. `player_key` est l'empreinte stable de l'appareil ; neuf
    -- colonnes d'autres tables pointent `spins(id)`, donc supprimer la ligne
    -- emporterait des lots et des preuves qui ne sont pas des données
    -- personnelles — et les statistiques du commerçant avec. La valeur de
    -- remplacement dérive de l'identifiant : unique par construction, donc
    -- compatible d'office avec `spins_one_per_window_idx`, et hors de
    -- l'alphabet hexadécimal d'une vraie empreinte. Le garde `not like` rend
    -- le passage idempotent.
    update public.spins
       set player_key = 'purge:' || id
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and player_key not like 'purge:%';

    -- (d) Les RÉSERVATIONS (20261002120000) : la ligne reste — remplissage et
    -- arrivées appartiennent au commerçant — l'adresse, son consentement et le
    -- lien à l'appareil s'effacent.
    update public.reservations
       set email = null,
           consent_transactional_at = null,
           player_key_hash = 'purge:' || id::text
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and (email is not null
             or consent_transactional_at is not null
             or player_key_hash not like 'purge:%');
  end loop;
  delete from public.webhook_deliveries
    where (delivered_at is not null or attempts >= 12)
      and created_at < pg_catalog.now() - interval '30 days';
  delete from public.admin_sessions
    where expires_at < pg_catalog.now() - interval '30 days';
  -- L'événement d'audit reste probant, mais l'email et l'IP cessent
  -- d'identifier une personne après 24 mois.
  perform pg_catalog.set_config('lastchance.audit_maintenance', 'on', true);
  update public.admin_audit_logs set actor_email = '[anonymisé]', ip = null,
    metadata = metadata - 'email' - 'target_email'
    where created_at < pg_catalog.now() - interval '24 months'
      and (actor_email <> '[anonymisé]' or ip is not null);
  perform pg_catalog.set_config('lastchance.audit_maintenance', 'off', true);
  delete from public.admin_notes where created_at < pg_catalog.now() - interval '24 months';
  return query select n, p_count, s_count;
end
$$;
