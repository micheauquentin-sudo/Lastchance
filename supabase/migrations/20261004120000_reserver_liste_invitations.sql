-- ============================================================
-- « RÉSERVER » — LA LISTE PRIORITAIRE ET L'INVITATION PRIVÉE (RES-2, lot L5)
--
-- Le socle (20261002120000) sait remplir un créneau et rendre une place ; il ne
-- sait PAS à qui la rendre. Quand un créneau complet se libère, la place
-- retombait dans la jauge publique et revenait à celui qui rechargeait la page
-- au bon moment. Ce fichier ajoute les deux chemins d'accès que RES-2 demande —
-- la LISTE PRIORITAIRE et l'INVITATION PRIVÉE — et il n'expose AUCUNE page,
-- AUCUNE server action, AUCUN email : le câblage applicatif suit.
--
-- ── LES SIX INVARIANTS QUE CE FICHIER REND VRAIS ──
--
--   1. UNE PLACE LIBÉRÉE EST PROPOSÉE À UNE SEULE PERSONNE. Pas « une offre à
--      la fois sur le créneau » — deux annulations doivent bien produire deux
--      offres — mais l'invariant qui compte réellement :
--          réservations vivantes + offres vivantes <= capacité.
--      Chaque place libre porte AU PLUS UNE offre. C'est la même arithmétique
--      que le comptage du socle, augmentée d'un second terme, et elle se tient
--      sous LE MÊME VERROU D'AVIS. Un index unique « une offre par créneau »
--      aurait été plus simple et FAUX : sur un créneau de vingt places dont
--      cinq se libèrent, il aurait fait attendre quatre personnes derrière une
--      place qui n'était plus rare.
--   2. L'EXPIRATION REND LA PLACE AU SUIVANT, SANS INTERVENTION, ET UNE SEULE
--      FOIS. Deux mécaniques, volontairement redondantes et qui ne peuvent pas
--      diverger : le BALAYAGE `expire_waitlist_offers()` (pg_cron, 5 min) fait
--      avancer la file ; et le COMPTAGE ignore partout une offre dont
--      l'échéance est passée, de sorte qu'une place n'est jamais gelée par un
--      balayage en retard. « Une seule fois » n'est pas une promesse de
--      rédaction : les états terminaux sont gardés par un TRIGGER, et le
--      balayage n'écrit que sous condition — le rejouer ne fait rien.
--   3. L'INVITATION EST UN JETON, PAS UN QR PERMANENT. Stockée HACHÉE (le clair
--      n'entre jamais en base — motif `player_identity`), révocable
--      (`revoked_at`), fermable sans rien annuler (`closed_at`), datée
--      (`expires_at`), et à USAGE COMPTÉ (`used_count` incrémenté sous verrou,
--      jamais au-delà de `max_uses`).
--   4. FERMER N'ANNULE RIEN. Ni `reservation_slots.status = 'closed'`, ni
--      `reservation_invitations.closed_at` ne touchent une seule réservation
--      confirmée. Ils ferment l'ENTRÉE, pas les places déjà données.
--   5. RÉPONSES INDISTINGUABLES. Un jeton inconnu, révoqué, épuisé, expiré ou
--      d'une AUTRE organisation rendent EXACTEMENT le même `unavailable`. Sans
--      quoi le formulaire de rejointe deviendrait un oracle sur les invitations
--      du commerce d'en face — et sur celles qu'on a essayé de deviner.
--   6. LE CONSENTEMENT RESTE SÉPARÉ. `reservation_waitlist_entries` reprend
--      l'ÉQUIVALENCE `email` ⇔ `consent_transactional_at` du socle : une
--      adresse sans consentement est une donnée personnelle conservée sans
--      base, et la base la refuse. Les relances de liste d'attente sont donc
--      transactionnelles par construction, sans qu'aucun code ait à y penser.
--
-- ── POURQUOI `reserve_slot` EST REDÉFINIE ICI ──
--
-- Elle doit compter les OFFRES VIVANTES avec les réservations vivantes. Sans
-- cela, la place tenue pour quelqu'un qu'on vient de prévenir serait revendue
-- au premier visiteur public, et la conversion de l'offre — qui ne repasse
-- PAS par la jauge, puisque la place lui est réservée — aurait sur-réservé le
-- créneau. C'est le seul changement apporté à son corps ; sa signature, son
-- type de retour et ses six refus sont inchangés, donc `create or replace`
-- suffit et L4 n'a rien à modifier.
--
-- `cancel_reservation` et `cancel_reservation_staff` sont redéfinies pour la
-- raison symétrique : elles sont l'endroit EXACT où une place se libère, donc
-- le seul endroit d'où la proposition au suivant peut partir sous le même
-- verrou. Leurs gardes, leur ordre de refus et leurs réponses sont recopiés
-- à l'identique — un seul geste s'ajoute, à la toute fin, après l'écriture.
--
-- ── CE QUE CE FICHIER NE FAIT PAS, VOLONTAIREMENT ──
--
--   * AUCUNE colonne ajoutée à `reservations`. Le lien « cette réservation
--     vient de telle invitation » vit dans `audit_logs`, qui est déjà la trace
--     de qui a fait quoi. Une colonne de plus sur une table de production pour
--     redire ce que le journal dit déjà ne se paie pas.
--   * AUCUNE RPC staff pour retirer quelqu'un de la liste. Une offre en cours
--     meurt d'elle-même en deux heures au plus ; fermer le créneau tarit les
--     offres SUIVANTES. Le geste manque, il est signalé, il n'est pas inventé
--     ici — il demanderait sa propre décision d'autorisation.
--   * AUCUNE route Vercel. Le balayage est planifié par pg_cron, DANS la base :
--     pas d'aller-retour HTTP pour une fonction qui ne lit que du SQL. Il naît
--     avec son battement de cœur `ops_worker_runs` — la leçon du wagon 7, où le
--     pg_cron de `jackpot-draws` travaille depuis des semaines sans qu'aucune
--     sonde ne puisse dire s'il tourne.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. `reservations` devient CIBLE de clé étrangère composite
--
-- Une entrée de liste convertie pointe la réservation qu'elle a produite. Les
-- deux tables portent `organization_id` : une FK d'une seule colonne y aurait
-- laissé coudre une entrée du locataire A à une réservation du locataire B, et
-- `fk_composites_couverture.test.sql` — dont c'est exactement le métier — aurait
-- rougi. La composite exige une contrainte d'unicité sur le couple cible ; le
-- socle en pose déjà une sur `reservation_activities` et `reservation_slots`,
-- pas sur `reservations`, qui n'était encore la cible de rien.
--
-- Posée par un bloc conditionnel plutôt que par `drop constraint if exists` +
-- `add` : le `drop` d'une contrainte dont des FK dépendent échouerait, et
-- l'échec surviendrait ici, dans la migration qui vient précisément de créer
-- ces FK.
-- ────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint con
     where con.conrelid = 'public.reservations'::regclass
       and con.conname = 'reservations_id_org_unique'
  ) then
    alter table public.reservations
      add constraint reservations_id_org_unique unique (id, organization_id);
  end if;
end;
$$;


-- ────────────────────────────────────────────────────────────
-- 2. La fenêtre d'offre, réglable par créneau
--
-- Deux heures par défaut : assez pour qu'une notification soit lue en journée,
-- assez court pour qu'une place ne dorme pas une nuit entière sur un créneau
-- du lendemain. Le commerçant peut la resserrer (une dégustation à guichets
-- fermés) ou l'étendre (un atelier réservé une semaine à l'avance) — BORNÉE
-- des deux côtés : sous cinq minutes l'offre est morte avant d'être lue, et
-- au-delà de vingt-quatre heures elle cesse d'être une offre pour devenir une
-- réservation qui ne dit pas son nom.
--
-- `null` = « le défaut du produit », et non « zéro ». Écrire 120 dans la
-- colonne aurait figé le défaut dans autant de lignes qu'il y a de créneaux :
-- le changer plus tard aurait demandé une migration de données au lieu d'une
-- constante.
--
-- L'ÉCHÉANCE EST DE TOUTE FAÇON PLAFONNÉE AU DÉBUT DU CRÉNEAU (voir
-- `reservation_offer_next`) : une offre qui survivrait à la séance qu'elle
-- propose n'aurait plus rien à donner.
-- ────────────────────────────────────────────────────────────

alter table public.reservation_slots
  add column if not exists waitlist_offer_minutes integer;

alter table public.reservation_slots
  drop constraint if exists reservation_slots_waitlist_window_check;
alter table public.reservation_slots
  add constraint reservation_slots_waitlist_window_check
  check (waitlist_offer_minutes is null
         or waitlist_offer_minutes between 5 and 1440);

comment on column public.reservation_slots.waitlist_offer_minutes is
  'Durée, en minutes, pendant laquelle une place libérée reste tenue pour la '
  'personne à qui elle est proposée. `null` = défaut du produit (120). Bornée '
  'entre 5 min et 24 h, et de toute façon PLAFONNÉE au début du créneau : une '
  'offre ne survit jamais à la séance qu''elle propose.';

-- Le commerçant règle sa fenêtre depuis l'agenda : la colonne rejoint les
-- grants de colonnes du socle. Additif — aucun grant existant n'est repris.
grant insert (waitlist_offer_minutes) on public.reservation_slots to authenticated;
grant update (waitlist_offer_minutes) on public.reservation_slots to authenticated;


-- ────────────────────────────────────────────────────────────
-- 3. La liste prioritaire
--
-- ── LE RANG EST IMPLICITE, ET C'EST UN CHOIX ──
--
-- Aucune colonne `position`. Le rang se DÉDUIT de `created_at` (départagé par
-- `id`, parce que deux inscriptions peuvent partager la milliseconde), exactement
-- comme la capacité se déduit des lignes vivantes dans le socle. Une colonne de
-- rang aurait exigé d'être renumérotée à chaque départ, chaque conversion et
-- chaque expiration — trois occasions de dériver, contre une seule source de
-- vérité. Le critère RES-3 « le rang ne dépend ni d'un jeu, ni d'un appareil,
-- ni de l'heure de rafraîchissement » vaut déjà ici.
--
-- ── LES CINQ ÉTATS ──
--
--   waiting   — inscrit, rien ne lui est dû ;
--   offered   — une place lui est TENUE jusqu'à `offer_expires_at` ;
--   converted — il l'a prise ; `converted_reservation_id` dit laquelle ;
--   expired   — il ne l'a pas prise à temps, la place est repartie ;
--   cancelled — il s'est retiré.
--
-- Les trois derniers sont TERMINAUX, et le trigger de la section 5 interdit
-- d'en sortir. C'est ce qui fait de l'expiration un événement EXACTEMENT UNE
-- FOIS, y compris si deux balayages se chevauchent.
-- ────────────────────────────────────────────────────────────

create table public.reservation_waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  -- Colonnes NUES : seules les FK COMPOSITES ci-dessous relient l'entrée à son
  -- créneau et à sa réservation. Voir `reservation_slots.activity_id` (socle).
  slot_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- Empreinte SHA-256 du cookie joueur, ou marqueur de purge : MÊME forme, MÊME
  -- raison et MÊME marqueur que `reservations.player_key_hash`. Le marqueur est
  -- adossé à l'`id` de sa ligne, donc unique par construction — compatible
  -- d'office avec l'index unique partiel plus bas.
  player_key_hash text not null,
  -- Borne de longueur AVANT la forme, comme dans le socle : `~*` sur une chaîne
  -- non bornée est un travail proportionnel à ce que l'appelant envoie.
  email text
    check (email is null
           or (pg_catalog.char_length(email) <= 254
               and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  consent_transactional_at timestamptz,
  status text not null default 'waiting'
    check (status in ('waiting', 'offered', 'converted', 'expired', 'cancelled')),
  offered_at timestamptz,
  offer_expires_at timestamptz,
  converted_at timestamptz,
  converted_reservation_id uuid,
  expired_at timestamptz,
  cancelled_at timestamptz,
  -- `clock_timestamp()` ET NON `now()`, contrairement à toutes les autres tables
  -- de ce module — parce que cette colonne-ci n'est pas une date d'archive :
  -- C'EST LE RANG. `now()` rend l'instant de DÉBUT DE TRANSACTION, identique
  -- pour deux inscriptions écrites dans la même transaction ; leur ordre
  -- retombait alors sur l'`id`, c'est-à-dire sur un UUID tiré au hasard. Une
  -- file dont la tête se décide au tirage n'est pas une file. Le test pgTAP l'a
  -- montré en trois lignes : trois inscriptions successives, et c'est le
  -- troisième qui recevait la place.
  created_at timestamptz not null default pg_catalog.clock_timestamp(),

  -- ── ÉTATS COHÉRENTS ──
  -- Des ÉQUIVALENCES, pas des implications — même arbitrage que le socle : une
  -- implication simple laisse toujours passer l'autre moitié du problème, ici
  -- « converti sans réservation » et « réservation sans conversion ».
  constraint reservation_waitlist_convert_state
    check ((status = 'converted') = (converted_at is not null)),
  constraint reservation_waitlist_convert_link
    check ((converted_at is not null) = (converted_reservation_id is not null)),
  constraint reservation_waitlist_expire_state
    check ((status = 'expired') = (expired_at is not null)),
  constraint reservation_waitlist_cancel_state
    check ((status = 'cancelled') = (cancelled_at is not null)),
  -- XOR terminal (patron reward_issuances_terminal_state, élargi à trois
  -- issues) : au plus UNE fin. Deux dates de fin diraient deux histoires
  -- différentes de la même place.
  constraint reservation_waitlist_terminal_state
    check (pg_catalog.num_nonnulls(converted_at, expired_at, cancelled_at) <= 1),
  -- L'offre et son échéance vont ensemble, toujours : une échéance sans offre
  -- ne borne rien, une offre sans échéance est une place gelée pour toujours.
  constraint reservation_waitlist_offer_pair
    check ((offered_at is null) = (offer_expires_at is null)),
  -- On ne convertit ni n'expire ce qui n'a jamais été proposé.
  constraint reservation_waitlist_offer_origin
    check (offered_at is not null
           or status not in ('offered', 'converted', 'expired')),
  -- Reprise VERBATIM de `reservations_consent_state`. Une adresse sans
  -- consentement est une donnée personnelle sans finalité ; un consentement
  -- sans adresse est une affirmation sur quelqu'un qu'on ne sait plus joindre.
  -- C'est aussi ce qui rend la purge honnête d'un seul geste.
  constraint reservation_waitlist_consent_state
    check ((email is not null) = (consent_transactional_at is not null)),
  constraint reservation_waitlist_player_key_shape
    check (player_key_hash ~ '^[0-9a-f]{64}$'
           or player_key_hash = 'purge:' || id::text),
  foreign key (slot_id, organization_id)
    references public.reservation_slots(id, organization_id) on delete cascade,
  -- COMPOSITE, et `on delete cascade` : une réservation ne se supprime pas dans
  -- ce module (aucun grant delete), elle ne disparaît qu'avec son créneau ou son
  -- organisation — auquel cas l'entrée de liste doit partir aussi. `on delete
  -- set null` aurait été refusé par le trigger d'état terminal, qui gèle
  -- précisément ce lien.
  foreign key (converted_reservation_id, organization_id)
    references public.reservations(id, organization_id) on delete cascade
);

comment on table public.reservation_waitlist_entries is
  'Liste prioritaire d''un créneau complet (RES-2). Le RANG EST IMPLICITE — '
  'ordre de `created_at`, départagé par `id` — jamais une colonne à '
  'renuméroter. Identité PSEUDONYME (empreinte SHA-256 du cookie joueur, jamais '
  'le jeton brut). Écriture exclusivement par les RPC service_role : aucun '
  'grant insert/update/delete à `authenticated`, parce que l''ordre de la file '
  'et la tenue d''une place sont serveur-autoritaires. La colonne `email` est '
  'HORS du grant de colonnes du commerçant, comme sur `reservations`.';
comment on column public.reservation_waitlist_entries.offer_expires_at is
  'Échéance de l''offre EN COURS. Passée cette date la place n''est plus tenue : '
  'tous les comptages de ce module l''ignorent AVANT même que le balayage ne '
  'soit passé — un balayage en retard ne gèle donc aucune place.';
comment on column public.reservation_waitlist_entries.status is
  'waiting → offered → converted | expired ; waiting|offered → cancelled. Les '
  'trois derniers sont TERMINAUX et gardés par trigger : on n''en sort pas, ce '
  'qui rend l''expiration d''une offre un événement exactement-une-fois.';

-- UNE IDENTITÉ N'A QU'UNE ENTRÉE VIVANTE PAR CRÉNEAU. Partiel, sur les seuls
-- états vivants : sans quoi quitter la file puis y revenir serait refusé par la
-- base, alors que c'est un parcours normal. Le marqueur de purge est unique par
-- construction, donc une ligne purgée n'entre jamais en collision.
create unique index reservation_waitlist_live_idx
  on public.reservation_waitlist_entries (slot_id, player_key_hash)
  where status in ('waiting', 'offered');

-- Le chemin du « suivant » : celui que `reservation_offer_next` emprunte à
-- chaque libération de place, et le seul qui soit dans un chemin verrouillé.
create index reservation_waitlist_next_idx
  on public.reservation_waitlist_entries (slot_id, created_at, id)
  where status = 'waiting';

-- Le chemin du balayage : les offres arrivées à échéance, tous créneaux
-- confondus.
create index reservation_waitlist_expiry_idx
  on public.reservation_waitlist_entries (offer_expires_at)
  where status = 'offered';

-- « Ma place dans les files de ce commerçant » : le chemin de lecture joueur,
-- borné à l'organisation comme celui des réservations.
create index reservation_waitlist_org_player_idx
  on public.reservation_waitlist_entries (organization_id, player_key_hash);

-- Index de tête de la FK composite vers `reservations` : sans lui, la cascade
-- de suppression d'une organisation balaie la table entière par réservation.
create index reservation_waitlist_reservation_idx
  on public.reservation_waitlist_entries (converted_reservation_id)
  where converted_reservation_id is not null;


-- ────────────────────────────────────────────────────────────
-- 4. L'invitation privée
--
-- ── LE JETON N'ENTRE JAMAIS EN CLAIR ──
--
-- `token_hash` est l'empreinte SHA-256 d'un jeton court produit par
-- l'APPLICATION, exactement comme `player_key_hash` l'est du cookie joueur.
-- La base ne voit jamais le clair : une fuite de cette colonne ne permet de
-- rejoindre aucune invitation. Corollaire à assumer et à dire au commerçant :
-- le lien n'est affichable QU'UNE FOIS, à la création. Perdu, il se révoque et
-- se recrée — c'est le même contrat qu'une clé d'API, et c'est ce qui empêche
-- qu'une invitation devienne un QR permanent qu'on retrouve six mois plus tard
-- dans un tableau de bord.
--
-- ── UNE CIBLE, ET UNE SEULE ──
--
-- Une activité (« l'atelier floral, choisissez votre créneau ») OU un créneau
-- précis (« samedi 14 h »). Jamais les deux, jamais aucune : une invitation
-- sans cible n'ouvre rien, une invitation à deux cibles pose la question de
-- laquelle gagne — et la réponse n'appartiendrait alors qu'au code appelant.
--
-- ── TROIS INTERRUPTEURS, TROIS SENS DIFFÉRENTS ──
--
--   `revoked_at` — le lien est MORT. Geste de sécurité : il a fuité.
--   `closed_at`  — les inscriptions sont FERMÉES, le lien reste lisible. C'est
--                  le critère d'acceptation RES-2 « fermer les inscriptions
--                  sans annuler les places déjà confirmées » : il ne touche
--                  AUCUNE réservation.
--   `expires_at` — l'échéance prévue dès la création.
--
-- Les trois rendent le MÊME `unavailable` à la rejointe, indistinctement d'un
-- jeton inconnu. Ce sont des états de gestion, pas des messages au visiteur.
-- ────────────────────────────────────────────────────────────

create table public.reservation_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- Colonnes nues, FK composites plus bas. Exactement une des deux est posée.
  activity_id uuid,
  slot_id uuid,
  label text not null
    check (pg_catalog.char_length(pg_catalog.btrim(label)) between 1 and 120),
  -- LE CONTRAT, ET IL DOIT ÊTRE ÉCRIT QUELQUE PART : `sha256(jeton)` en
  -- hexadécimal minuscule, SANS SEL — contrairement à `player_key_hash`, dont
  -- le sel applicatif existe pour empêcher de rapprocher les empreintes d'un
  -- même appareil entre tables historiques. Ici rien à rapprocher : le jeton est
  -- tiré côté serveur avec assez d'entropie pour qu'aucun dictionnaire ne le
  -- retrouve, il ne sert qu'à cette table, et un sel applicatif rendrait TOUTES
  -- les invitations illisibles le jour où il tournerait — une invitation doit
  -- survivre à une rotation de secret, une session non.
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Bornes d'usage. `max_uses` à 1 par défaut : une invitation est nominative
  -- jusqu'à preuve du contraire. Le plafond de 500 n'est pas une limite
  -- technique — c'est le point au-delà duquel « invitation privée » ne veut
  -- plus rien dire et où le commerçant devrait simplement ouvrir son créneau.
  max_uses integer not null default 1 check (max_uses between 1 and 500),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  closed_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),

  -- LE COMPTEUR NE DÉPASSE JAMAIS SON PLAFOND, et c'est la base qui le dit. La
  -- RPC incrémente déjà sous verrou et sous condition ; cette contrainte est ce
  -- qui rend l'invariant vrai même pour une écriture que personne n'a prévue.
  constraint reservation_invitations_uses_bound
    check (used_count <= max_uses),
  -- UNE cible, et une seule. `<>` sur deux booléens est un OU EXCLUSIF : il
  -- refuse « aucune » comme « les deux ».
  constraint reservation_invitations_target_state
    check ((activity_id is not null) <> (slot_id is not null)),
  -- Unicité GLOBALE du jeton, pas par organisation : c'est un secret, et deux
  -- organisations qui porteraient la même empreinte signeraient soit une
  -- collision SHA-256, soit un jeton recopié d'un commerce à l'autre. Les deux
  -- méritent d'être refusés par la base.
  constraint reservation_invitations_token_unique unique (token_hash),
  foreign key (activity_id, organization_id)
    references public.reservation_activities(id, organization_id) on delete cascade,
  foreign key (slot_id, organization_id)
    references public.reservation_slots(id, organization_id) on delete cascade
);

comment on table public.reservation_invitations is
  'Invitation privée à capacité limitée (RES-2) : une réservation avec une '
  'RÈGLE D''ACCÈS distincte, pas un second moteur de réservation. Le jeton est '
  'stocké HACHÉ (SHA-256 d''un jeton court produit par l''application) — le '
  'clair n''entre jamais en base et n''est affichable qu''une fois, à la '
  'création. Révocable, fermable, datée et à usage compté. Écriture '
  'exclusivement par les RPC service_role.';
comment on column public.reservation_invitations.closed_at is
  'Fermeture des inscriptions. NE TOUCHE AUCUNE RÉSERVATION déjà confirmée — '
  'critère d''acceptation RES-2. Le lien reste lisible par le commerçant, il '
  'n''ouvre simplement plus rien.';
comment on column public.reservation_invitations.revoked_at is
  'Révocation : le lien est mort. Indistinguable, à la rejointe, d''un jeton '
  'inconnu — un visiteur ne doit pas apprendre qu''une invitation a existé.';
comment on column public.reservation_invitations.used_count is
  'Incrémenté SOUS VERROU et sous condition (`used_count < max_uses`) par '
  'redeem_invitation, jamais par l''appelant. Une rejointe idempotente — même '
  'identité, même créneau — ne le consomme PAS : deux clics ne brûlent pas '
  'deux places.';

create index reservation_invitations_org_created_idx
  on public.reservation_invitations (organization_id, created_at desc);
-- Index de tête des deux FK composites : la cascade d'une activité ou d'un
-- créneau supprimé ne doit pas balayer la table.
create index reservation_invitations_activity_idx
  on public.reservation_invitations (activity_id)
  where activity_id is not null;
create index reservation_invitations_slot_idx
  on public.reservation_invitations (slot_id)
  where slot_id is not null;


-- ────────────────────────────────────────────────────────────
-- 5. L'ÉTAT TERMINAL NE SE QUITTE PAS
--
-- La contrainte `reservation_waitlist_terminal_state` interdit DEUX fins ; elle
-- n'interdit pas de revenir de `expired` à `waiting` en effaçant la date. C'est
-- exactement le trou par lequel une expiration cesserait d'être un événement
-- unique : un second balayage, un rejeu de migration, une écriture maladroite,
-- et la même place repart deux fois.
--
-- Le trigger gèle donc l'HISTOIRE d'une entrée terminée : ni son statut, ni
-- aucune de ses dates, ni son lien de réservation ne bougent plus.
--
-- CE QU'IL LAISSE PASSER, ET IL LE DOIT : `email`,
-- `consent_transactional_at` et `player_key_hash`. C'est par là que passe la
-- purge RGPD (section 12), qui efface la PERSONNE sans réécrire l'histoire de
-- la place. Un trigger qui aurait bloqué toute écriture sur une ligne terminale
-- aurait rendu la purge impossible sur les entrées expirées — c'est-à-dire sur
-- la majorité d'entre elles.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservation_waitlist_freeze_terminal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('converted', 'expired', 'cancelled')
     and (new.status is distinct from old.status
          or new.offered_at is distinct from old.offered_at
          or new.offer_expires_at is distinct from old.offer_expires_at
          or new.converted_at is distinct from old.converted_at
          or new.converted_reservation_id is distinct from old.converted_reservation_id
          or new.expired_at is distinct from old.expired_at
          or new.cancelled_at is distinct from old.cancelled_at)
  then
    raise exception
      'waitlist entry % is terminal (%) and cannot be reopened', old.id, old.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.reservation_waitlist_freeze_terminal()
  from public, anon, authenticated;

create trigger reservation_waitlist_freeze_terminal
  before update on public.reservation_waitlist_entries
  for each row execute function public.reservation_waitlist_freeze_terminal();


-- ────────────────────────────────────────────────────────────
-- 6. RLS et grants
--
-- Motif du socle, à l'identique : lecture MEMBRE pour la liste d'attente (le
-- caissier doit pouvoir dire à quelqu'un où il en est), lecture ÉDITEUR pour
-- les invitations (c'est de la configuration, pas du comptoir). AUCUNE policy
-- d'écriture nulle part : l'ordre de la file, la tenue d'une place et le
-- compteur d'usages passent par les RPC, sinon un simple PostgREST déciderait
-- qui passe devant.
-- ────────────────────────────────────────────────────────────

alter table public.reservation_waitlist_entries enable row level security;
alter table public.reservation_invitations enable row level security;

-- Les privilèges par défaut de Supabase servent anon/authenticated sur toute
-- nouvelle table de `public` : on repart de zéro. anon n'est JAMAIS re-servi.
revoke all on table public.reservation_waitlist_entries
  from public, anon, authenticated;
revoke all on table public.reservation_invitations
  from public, anon, authenticated;

create policy "reservation_waitlist_entries: members read"
  on public.reservation_waitlist_entries
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "reservation_invitations: editors read"
  on public.reservation_invitations
  for select to authenticated
  using (public.is_org_editor(organization_id));

-- GRANT DE COLONNES, et `email` n'y est PAS — même arbitrage que le socle :
-- le commerçant voit QUI attend et à quel rang, l'adresse n'existe que pour que
-- le serveur prévienne. Conséquence pour la couche suivante : un `select *`
-- PostgREST sera REFUSÉ EN ENTIER sur cette table, les colonnes doivent être
-- énumérées.
grant select (
  id, slot_id, organization_id, player_key_hash, consent_transactional_at,
  status, offered_at, offer_expires_at, converted_at, converted_reservation_id,
  expired_at, cancelled_at, created_at
) on public.reservation_waitlist_entries to authenticated;

-- `token_hash` N'EST PAS DANS LE GRANT. Il ne sert à rien à un lecteur — le
-- clair ne s'en déduit pas — mais une empreinte qui ne sort jamais est une
-- empreinte qu'aucun journal, aucune capture d'écran et aucun export ne peut
-- recopier. Même geste que `reservations.email`.
grant select (
  id, organization_id, activity_id, slot_id, label, max_uses, used_count,
  expires_at, closed_at, revoked_at, created_by, created_at
) on public.reservation_invitations to authenticated;


-- ────────────────────────────────────────────────────────────
-- 7. `reservation_offer_next` — LE cœur de la libération séquentielle
--
-- ── CE QU'ELLE SUPPOSE, ET QUI N'EST PAS NÉGOCIABLE ──
--
-- L'APPELANT DÉTIENT DÉJÀ LE VERROU D'AVIS du couple (organisation, créneau).
-- Elle ne le prend pas elle-même, et c'est délibéré : ses quatre appelants
-- l'invoquent au milieu d'un geste plus large — annuler, quitter la file,
-- balayer — dont le comptage doit se trouver dans le MÊME instantané que le
-- sien. Le reprendre ici ne coûterait rien (les verrous d'avis sont
-- ré-entrants) mais laisserait croire qu'un appel non verrouillé est correct.
-- Il ne l'est pas : deux libérations concurrentes proposeraient la même place
-- à deux personnes.
--
-- C'est aussi pourquoi elle n'est GRANTÉE À PERSONNE, pas même à
-- `service_role` : seul son propriétaire — donc les quatre RPC `security
-- definer` qui l'appellent — peut l'exécuter. Le contrôle interne tracerait ;
-- c'est l'ACL qui interdit (leçon du wagon 7).
--
-- ── DEUX GESTES, DANS CET ORDRE, ET L'ORDRE COMPTE ──
--
--   1. EXPIRER les offres échues de ce créneau. Toujours, quel que soit l'état
--      du créneau : c'est de la comptabilité, pas une décision commerciale. Un
--      créneau fermé, passé ou sans droit `vitrine` voit quand même ses offres
--      mortes marquées mortes — sinon elles resteraient `offered` pour
--      l'éternité et fausseraient tout comptage ultérieur.
--   2. PROPOSER aux suivants, et là seulement les conditions commerciales
--      s'appliquent : créneau ouvert, à venir, activité active, droit
--      `vitrine`. Fermer un créneau tarit donc les offres SUIVANTES sans
--      toucher à celle qui est en cours — ce qui est exactement ce que
--      « fermer les inscriptions » doit vouloir dire.
--
-- ── POURQUOI UNE BOUCLE, ET POURQUOI ELLE TERMINE ──
--
-- Le nombre d'offres à créer est le nombre de places réellement libres —
-- `capacité - vivantes - offres tenues` — calculé UNE FOIS sous le verrou. La
-- boucle est donc bornée par une valeur finie connue d'avance, et chaque tour
-- consomme une entrée `waiting` distincte (elle passe à `offered`, donc sort du
-- gisement). Elle sort d'elle-même quand la file est vide.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservation_offer_next(
  p_organization_id uuid,
  p_slot_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.reservation_slots%rowtype;
  v_activity_active boolean;
  v_taken integer;
  v_held integer;
  v_free integer;
  v_minutes integer;
  v_deadline timestamptz;
  v_entry_id uuid;
  v_created integer := 0;
  i integer;
begin
  -- (1) LA COMPTABILITÉ D'ABORD, SANS CONDITION.
  update public.reservation_waitlist_entries w
     set status = 'expired',
         expired_at = pg_catalog.now()
   where w.slot_id = p_slot_id
     and w.organization_id = p_organization_id
     and w.status = 'offered'
     and w.offer_expires_at <= pg_catalog.now();

  select s.* into v_slot
    from public.reservation_slots s
   where s.id = p_slot_id
     and s.organization_id = p_organization_id;
  if not found then
    return 0;
  end if;

  -- (2) LES CONDITIONS COMMERCIALES. Mêmes quatre que `reserve_slot`, moins
  -- l'existence du créneau déjà tranchée ci-dessus. Une place ne se propose pas
  -- sur un créneau fermé, commencé, d'une activité coupée, ou d'une
  -- organisation dont l'abonnement au module s'est éteint.
  select a.active into v_activity_active
    from public.reservation_activities a
   where a.id = v_slot.activity_id
     and a.organization_id = v_slot.organization_id;

  if not coalesce(v_activity_active, false)
     or v_slot.status <> 'open'
     or v_slot.starts_at <= pg_catalog.now()
     or not public.org_has_module_access(v_slot.organization_id, 'vitrine')
  then
    return 0;
  end if;

  -- LES DEUX TERMES DU COMPTAGE. `v_taken` est celui du socle, mot pour mot.
  -- `v_held` est le second, et l'échéance y est comparée à `now()` : une offre
  -- périmée ne tient plus rien, MÊME SI le balayage n'est pas encore passé.
  -- C'est ce qui rend la place récupérable sans intervention.
  select pg_catalog.count(*)::integer into v_taken
    from public.reservations r
   where r.slot_id = p_slot_id
     and r.status in ('confirmed', 'checked_in');

  select pg_catalog.count(*)::integer into v_held
    from public.reservation_waitlist_entries w
   where w.slot_id = p_slot_id
     and w.status = 'offered'
     and w.offer_expires_at > pg_catalog.now();

  v_free := v_slot.capacity - v_taken - v_held;
  if v_free <= 0 then
    return 0;
  end if;

  -- LA FENÊTRE, PLAFONNÉE AU DÉBUT DU CRÉNEAU. `least` reste NON qualifié :
  -- ce n'est pas une fonction du catalogue mais un nœud du parseur, et le
  -- préfixer échouerait À L'EXÉCUTION seulement (garde sql:check).
  v_minutes := coalesce(v_slot.waitlist_offer_minutes, 120);
  v_deadline := least(
    pg_catalog.now() + pg_catalog.make_interval(mins => v_minutes),
    v_slot.starts_at
  );

  for i in 1..v_free loop
    select w.id into v_entry_id
      from public.reservation_waitlist_entries w
     where w.slot_id = p_slot_id
       and w.organization_id = p_organization_id
       and w.status = 'waiting'
     order by w.created_at, w.id
     limit 1;
    exit when v_entry_id is null;

    update public.reservation_waitlist_entries
       set status = 'offered',
           offered_at = pg_catalog.now(),
           offer_expires_at = v_deadline
     where id = v_entry_id;

    v_created := v_created + 1;
    v_entry_id := null;
  end loop;

  return v_created;
end;
$$;

comment on function public.reservation_offer_next(uuid, uuid) is
  'Fait avancer la liste prioritaire d''UN créneau : marque expirées les offres '
  'échues (toujours), puis propose la ou les places réellement libres aux '
  'premiers `waiting` (seulement si le créneau est ouvert, à venir, d''une '
  'activité active et d''une organisation portant le droit `vitrine`). '
  'INVARIANT TENU : réservations vivantes + offres vivantes <= capacité — donc '
  'au plus UNE offre par place libre. SUPPOSE QUE L''APPELANT DÉTIENT DÉJÀ le '
  'verrou d''avis (organisation + créneau) : elle ne le prend pas, pour que son '
  'comptage soit dans le même instantané que celui de son appelant. N''est '
  'grantée à personne — pas même service_role : seuls les RPC security definer '
  'de ce module l''exécutent. Rend le nombre d''offres créées.';

-- AUCUN grant, et c'est la protection elle-même. `service_role` EST DANS LA
-- LISTE, contrairement à toutes les autres fonctions de ce fichier : les
-- privilèges par défaut de Supabase servent `execute` à `service_role` sur toute
-- fonction neuve de `public`, et s'arrêter à `public, anon, authenticated` — la
-- formule employée partout ailleurs — l'aurait donc laissée ouverte à
-- l'application. Le retirer ne casse aucun appel : ses quatre appelants sont
-- `security definer`, donc s'exécutent sous le propriétaire, qui la détient par
-- possession.
revoke all on function public.reservation_offer_next(uuid, uuid)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 8. `reserve_slot` — la jauge publique apprend à voir les offres
--
-- CORPS DU SOCLE (20261002120000, section 6) RECOPIÉ, avec UN SEUL changement :
-- le comptage de capacité gagne son second terme, les offres vivantes. Sans
-- lui, la place tenue pour quelqu'un à qui on vient d'écrire « elle est à vous
-- pendant deux heures » serait vendue au premier visiteur qui recharge la page,
-- et `claim_waitlist_offer` — qui ne repasse PAS par la jauge, puisque la place
-- lui est réservée — aurait alors sur-réservé le créneau.
--
-- SIGNATURE ET TYPE DE RETOUR INCHANGÉS : `create or replace` suffit, aucun
-- `drop` n'est nécessaire, et la couche L4 n'a rien à modifier. `remaining`
-- devient honnête — il retranche aussi les places tenues — parce qu'annoncer
-- « il reste 2 places » quand l'une est promise à quelqu'un serait un chiffre
-- qui se dément tout seul à la demande suivante.
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
  v_held integer;
  v_row public.reservations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null
     and (pg_catalog.char_length(v_email) > 254
          or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  then
    return pg_catalog.jsonb_build_object('state', 'invalid_email');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_slot:' || p_organization_id::text || ':' || p_slot_id::text,
      0)
  );

  select s.* into v_slot
    from public.reservation_slots s
   where s.id = p_slot_id
     and s.organization_id = p_organization_id;

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
     or not public.org_has_module_access(v_slot.organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- IDEMPOTENCE AVANT CAPACITÉ, comme dans le socle : un joueur déjà inscrit sur
  -- un créneau devenu complet doit retrouver sa réservation, pas s'entendre dire
  -- « complet » sur sa propre place.
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

  select pg_catalog.count(*)::integer into v_count
    from public.reservations r
   where r.slot_id = p_slot_id
     and r.status in ('confirmed', 'checked_in');

  -- LE SECOND TERME (RES-2). Une offre dont l'échéance est passée ne tient plus
  -- rien : la comparer à `now()` est ce qui rend la place récupérable par le
  -- public dès la seconde qui suit, sans attendre le balayage.
  select pg_catalog.count(*)::integer into v_held
    from public.reservation_waitlist_entries w
   where w.slot_id = p_slot_id
     and w.status = 'offered'
     and w.offer_expires_at > pg_catalog.now();

  if v_count + v_held >= v_slot.capacity then
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
    'remaining', v_slot.capacity - (v_count + 1) - v_held
  );
end;
$$;

comment on function public.reserve_slot(uuid, uuid, text, text, boolean) is
  'Prend une place sur un créneau, DANS UNE ORGANISATION DONNÉE. Atomique '
  '(verrou d''avis sur le créneau, puis lecture du créneau ET comptage sous ce '
  'verrou) et idempotente (`already_reserved` rend le code et le statut '
  'existants). LE COMPTAGE A DEUX TERMES depuis RES-2 : les réservations '
  'vivantes — `confirmed` et `checked_in`, le check-in ne libère rien — ET les '
  'OFFRES DE LISTE PRIORITAIRE ENCORE TENUES ; sans le second, la place promise '
  'à quelqu''un serait revendue au premier visiteur et la conversion de l''offre '
  'sur-réserverait le créneau. Une offre échue ne compte plus, même avant le '
  'balayage. Refuse `full` à capacité atteinte, `invalid_email` sur une adresse '
  'malformée ou de plus de 254 caractères, et `unavailable` — indistinctement — '
  'pour un créneau inexistant, d''une AUTRE organisation, une activité coupée, '
  'un créneau non ouvert ou passé, et une organisation sans le droit `vitrine`. '
  'L''adresse n''est stockée QUE si `p_consent`.';

revoke all on function public.reserve_slot(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.reserve_slot(uuid, uuid, text, text, boolean)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 9. Les deux annulations proposent la place au suivant
--
-- CORPS DU SOCLE ET DE 20261003120000 RECOPIÉS À L'IDENTIQUE — mêmes gardes,
-- même ordre de refus, mêmes réponses, même verrou. UN SEUL geste s'ajoute, et
-- toujours au même endroit : APRÈS l'écriture qui libère réellement la place,
-- et donc sous le verrou déjà détenu.
--
-- L'ORDRE EST LA PROPRIÉTÉ. Proposer avant d'annuler aurait compté la place
-- comme encore prise ; proposer hors du verrou aurait laissé deux annulations
-- concurrentes offrir la MÊME place à deux personnes. Rien de tout cela ne se
-- voit à la relecture d'une ligne isolée : c'est pourquoi le geste est collé à
-- l'`update`, pas rangé dans un trigger. Un trigger `after update` aurait été
-- plus concis et aurait perdu la seule chose qui compte — la certitude que
-- l'appelant détenait le verrou.
--
-- LE RETOUR NE CHANGE PAS. Le nombre d'offres créées n'est PAS ajouté à la
-- réponse : celui qui annule n'a rien à savoir de qui hérite de sa place, et
-- L4 lit ces réponses par leurs clés existantes.
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
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  select r.slot_id, r.organization_id into v_slot_id, v_org_id
    from public.reservations r
   where r.id = p_reservation_id
     and r.player_key_hash = p_player_key_hash
     and r.player_key_hash not like 'purge:%';
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

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

  select s.starts_at into v_starts_at
    from public.reservation_slots s
   where s.id = v_row.slot_id
     and s.organization_id = v_row.organization_id;

  if v_row.status = 'checked_in' then
    return pg_catalog.jsonb_build_object(
      'state', 'already_checked_in',
      'reservation_id', v_row.id
    );
  end if;

  -- IDEMPOTENCE, AVANT `too_late`. Une seconde annulation ne repousse pas
  -- `cancelled_at` — et, propriété RES-2, NE RELANCE AUCUNE OFFRE : le geste
  -- réel a déjà eu lieu, la place a déjà été proposée.
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

  -- LA PLACE VIENT DE REVENIR : elle est proposée au premier de la file, sous
  -- le verrou pris plus haut.
  perform public.reservation_offer_next(v_row.organization_id, v_row.slot_id);

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
  'SANS décrémenter quoi que ce soit, sous le MÊME verrou d''avis que '
  'reserve_slot, PUIS LA PROPOSE au premier de la liste prioritaire (RES-2) — '
  'sous ce même verrou, et uniquement sur le geste réel : une seconde '
  'annulation ne relance aucune offre.';

revoke all on function public.cancel_reservation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_reservation(uuid, text)
  to service_role;


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
  if p_actor is null
     or p_actor <> pg_catalog.btrim(p_actor)
     or p_actor !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_actor_id := p_actor::uuid;

  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = v_actor_id
       and om.role in ('owner', 'editor')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select r.slot_id into v_slot_id
    from public.reservations r
   where r.id = p_reservation_id
     and r.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

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

  perform public.reservation_offer_next(p_organization_id, v_row.slot_id);

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
  'reserve_slot, sans décrémenter aucun compteur, PUIS LA PROPOSE au premier de '
  'la liste prioritaire (RES-2) sous ce même verrou.';

revoke all on function public.cancel_reservation_staff(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_reservation_staff(uuid, uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 10. Les trois RPC de la liste, côté joueur
--
-- Mêmes gardes de forme que `reserve_slot`, même verrou, mêmes refus
-- indistinguables. `waitlist_join` porte EN PLUS la garde qui fait tout le sens
-- de la file : ON NE S'INSCRIT QUE SUR UN CRÉNEAU RÉELLEMENT COMPLET. Sans
-- elle, la liste prioritaire deviendrait une seconde file d'attente parallèle
-- à la réservation ordinaire — deux chemins pour la même place, et un rang qui
-- ne veut plus rien dire.
-- ────────────────────────────────────────────────────────────

create or replace function public.waitlist_join(
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
  v_entry public.reservation_waitlist_entries%rowtype;
  v_email text;
  v_taken integer;
  v_held integer;
  v_position integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null
     and (pg_catalog.char_length(v_email) > 254
          or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  then
    return pg_catalog.jsonb_build_object('state', 'invalid_email');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_slot:' || p_organization_id::text || ':' || p_slot_id::text,
      0)
  );

  select s.* into v_slot
    from public.reservation_slots s
   where s.id = p_slot_id
     and s.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select a.active into v_activity_active
    from public.reservation_activities a
   where a.id = v_slot.activity_id
     and a.organization_id = v_slot.organization_id;

  -- LES SIX MÊMES REFUS QUE `reserve_slot`, sous le même état muet : la liste
  -- d'attente ne doit pas devenir l'oracle que la réservation refuse d'être.
  if not coalesce(v_activity_active, false)
     or v_slot.status <> 'open'
     or v_slot.starts_at <= pg_catalog.now()
     or not public.org_has_module_access(v_slot.organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- IDEMPOTENCE #1 — il détient déjà une place. On ne fait pas la queue pour ce
  -- qu'on a déjà : la réponse est celle de `reserve_slot`, mot pour mot, pour
  -- que L4 n'ait qu'un cas à traiter.
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

  -- IDEMPOTENCE #2 — il est déjà dans la file. Rendre son rang plutôt qu'une
  -- erreur : un double clic ou un rechargement ne doit pas ressembler à un
  -- refus. L'index unique partiel refuserait de toute façon la seconde ligne.
  select w.* into v_entry
    from public.reservation_waitlist_entries w
   where w.slot_id = p_slot_id
     and w.player_key_hash = p_player_key_hash
     and w.status in ('waiting', 'offered');
  if found then
    select pg_catalog.count(*)::integer + 1 into v_position
      from public.reservation_waitlist_entries w2
     where w2.slot_id = p_slot_id
       and w2.status in ('waiting', 'offered')
       and (w2.created_at, w2.id) < (v_entry.created_at, v_entry.id);
    return pg_catalog.jsonb_build_object(
      'state', 'already_waiting',
      'entry_id', v_entry.id,
      'status', v_entry.status,
      'position', v_position,
      'offer_expires_at', v_entry.offer_expires_at
    );
  end if;

  -- LE CRÉNEAU DOIT ÊTRE RÉELLEMENT COMPLET, offres tenues comprises. Sur un
  -- créneau qui a encore de la place, la réponse est `not_full` et le joueur est
  -- renvoyé vers `reserve_slot` : entrer dans une file pour une place libre
  -- serait une attente inventée.
  select pg_catalog.count(*)::integer into v_taken
    from public.reservations r
   where r.slot_id = p_slot_id
     and r.status in ('confirmed', 'checked_in');
  select pg_catalog.count(*)::integer into v_held
    from public.reservation_waitlist_entries w
   where w.slot_id = p_slot_id
     and w.status = 'offered'
     and w.offer_expires_at > pg_catalog.now();

  if v_taken + v_held < v_slot.capacity then
    return pg_catalog.jsonb_build_object(
      'state', 'not_full',
      'remaining', v_slot.capacity - v_taken - v_held
    );
  end if;

  insert into public.reservation_waitlist_entries (
    slot_id, organization_id, player_key_hash, email, consent_transactional_at
  ) values (
    v_slot.id,
    v_slot.organization_id,
    p_player_key_hash,
    -- L'ADRESSE N'EST CONSERVÉE QUE SI ELLE EST CONSENTIE — geste et raison du
    -- socle : sans consentement, rien ne sera envoyé, donc la donnée n'a aucune
    -- finalité, et `reservation_waitlist_consent_state` refuserait la ligne.
    case when coalesce(p_consent, false) then v_email end,
    case when coalesce(p_consent, false) and v_email is not null
         then pg_catalog.now() end
  )
  returning * into v_entry;

  select pg_catalog.count(*)::integer into v_position
    from public.reservation_waitlist_entries w2
   where w2.slot_id = p_slot_id
     and w2.status in ('waiting', 'offered');

  return pg_catalog.jsonb_build_object(
    'state', 'waiting',
    'entry_id', v_entry.id,
    'status', v_entry.status,
    'position', v_position,
    'offer_expires_at', null
  );
end;
$$;

comment on function public.waitlist_join(uuid, uuid, text, text, boolean) is
  'Inscrit une identité pseudonyme sur la liste prioritaire d''un créneau '
  'COMPLET (RES-2). Mêmes gardes SQL que reserve_slot — organisation exigée, '
  'forme de l''empreinte, forme et longueur de l''adresse, droit `vitrine` — et '
  'MÊME état muet `unavailable` pour les six refus, afin que la file ne devienne '
  'pas l''oracle que la réservation refuse d''être. Rend `not_full` (et le '
  'nombre de places restantes) si le créneau a encore de la place : on ne fait '
  'pas la queue pour une place libre. Idempotente deux fois : `already_reserved` '
  'si l''identité détient déjà une place, `already_waiting` avec son RANG si '
  'elle est déjà dans la file. Le rang est déduit de l''ordre d''inscription, '
  'jamais stocké. L''adresse n''est conservée QUE si `p_consent`.';

revoke all on function public.waitlist_join(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.waitlist_join(uuid, uuid, text, text, boolean)
  to service_role;


-- ── `claim_waitlist_offer` — l'offre devient une place ───────
--
-- ELLE NE REPASSE PAS PAR LA JAUGE PUBLIQUE, et c'est tout l'intérêt : la place
-- est DÉJÀ tenue pour cette personne — `reserve_slot` et `waitlist_join` la
-- comptent comme occupée depuis que l'offre existe. Refaire le test de capacité
-- ici l'aurait comptée deux fois, et l'offre n'aurait jamais pu être honorée.
--
-- CE QU'ELLE VÉRIFIE QUAND MÊME, et pourquoi ce n'est pas la même liste que
-- `reserve_slot` :
--   * l'offre est VIVANTE — statut `offered` ET échéance non dépassée. C'est le
--     refus PARESSEUX : il tient même si le balayage n'est jamais passé, ce qui
--     est la seule façon de ne pas faire dépendre une garantie de sécurité de
--     la ponctualité d'un cron.
--   * le créneau n'a pas COMMENCÉ. On ne rejoint pas une séance en cours.
--   * l'activité est active, et l'organisation porte toujours le droit
--     `vitrine`. Deux interrupteurs qui coupent tout le module.
--   * le STATUT DU CRÉNEAU N'EST PAS REVÉRIFIÉ, délibérément. L'offre EST
--     l'autorisation : elle a été émise quand le créneau était ouvert, elle
--     tient au plus deux heures, et le commerçant qui ferme entre-temps tarit
--     les offres SUIVANTES (`reservation_offer_next` exige `open`) sans
--     reprendre celle qu'on vient de promettre à quelqu'un.
-- ────────────────────────────────────────────────────────────

create or replace function public.claim_waitlist_offer(
  p_organization_id uuid,
  p_entry_id uuid,
  p_player_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_id uuid;
  v_entry public.reservation_waitlist_entries%rowtype;
  v_slot public.reservation_slots%rowtype;
  v_activity_active boolean;
  v_existing public.reservations%rowtype;
  v_row public.reservations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  -- Cette garde de forme est aussi ce qui rend une entrée PURGÉE inatteignable :
  -- son empreinte vaut alors `purge:<id>`, qui ne franchit pas ce filtre.
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  -- Lecture SANS verrou, pour connaître le créneau — l'autre moitié de la clé.
  -- Rien n'est décidé dessus : tout est relu sous le verrou.
  select w.slot_id into v_slot_id
    from public.reservation_waitlist_entries w
   where w.id = p_entry_id
     and w.organization_id = p_organization_id
     and w.player_key_hash = p_player_key_hash;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_slot:' || p_organization_id::text || ':' || v_slot_id::text,
      0)
  );

  select w.* into v_entry
    from public.reservation_waitlist_entries w
   where w.id = p_entry_id
     and w.organization_id = p_organization_id
     and w.player_key_hash = p_player_key_hash;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- IDEMPOTENCE : déjà converti, on rend LA MÊME réservation et le MÊME code.
  -- Avant tout autre refus — un joueur qui reclique sur un lien ne doit pas
  -- s'entendre dire que son offre a expiré alors qu'il l'a prise.
  if v_entry.status = 'converted' then
    select r.* into v_existing
      from public.reservations r
     where r.id = v_entry.converted_reservation_id;
    return pg_catalog.jsonb_build_object(
      'state', 'claimed',
      'entry_id', v_entry.id,
      'reservation_id', v_existing.id,
      'code', v_existing.code,
      'status', v_existing.status
    );
  end if;

  if v_entry.status <> 'offered' then
    -- `waiting` (rien ne lui est encore dû), `cancelled` (il est parti). Muet :
    -- l'entrée existe, mais il n'y a pas d'offre à prendre.
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE REFUS PARESSEUX. Il ne dépend d'aucun balayage : une offre dont
  -- l'échéance est passée est morte au moment où on la regarde.
  if v_entry.offer_expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object(
      'state', 'expired',
      'entry_id', v_entry.id,
      'offer_expires_at', v_entry.offer_expires_at
    );
  end if;

  select s.* into v_slot
    from public.reservation_slots s
   where s.id = v_entry.slot_id
     and s.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select a.active into v_activity_active
    from public.reservation_activities a
   where a.id = v_slot.activity_id
     and a.organization_id = v_slot.organization_id;

  if not coalesce(v_activity_active, false)
     or v_slot.starts_at <= pg_catalog.now()
     or not public.org_has_module_access(v_slot.organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- CEINTURE : l'identité détient-elle DÉJÀ une place sur ce créneau ? Ce cas
  -- ne devrait pas exister — `waitlist_join` le refuse — mais l'index unique
  -- `reservations_slot_player_active_idx` lèverait une erreur brute que
  -- personne ne saurait lire. On rend son bien, et l'offre est consommée.
  select r.* into v_existing
    from public.reservations r
   where r.slot_id = v_entry.slot_id
     and r.player_key_hash = p_player_key_hash
     and r.status in ('confirmed', 'checked_in');
  if found then
    update public.reservation_waitlist_entries
       set status = 'converted',
           converted_at = pg_catalog.now(),
           converted_reservation_id = v_existing.id
     where id = v_entry.id;
    return pg_catalog.jsonb_build_object(
      'state', 'claimed',
      'entry_id', v_entry.id,
      'reservation_id', v_existing.id,
      'code', v_existing.code,
      'status', v_existing.status
    );
  end if;

  -- L'ADRESSE ET SON CONSENTEMENT SONT REPRIS DE L'ENTRÉE DE LISTE. Ils ont été
  -- donnés pour ce créneau, à ce commerçant, avec le même consentement
  -- transactionnel : les redemander serait une friction, les jeter priverait le
  -- joueur de sa confirmation. L'équivalence tient des deux côtés — la
  -- contrainte de `reservations` est la même que celle de la liste.
  insert into public.reservations (
    slot_id, organization_id, player_key_hash, email, consent_transactional_at
  ) values (
    v_entry.slot_id,
    v_entry.organization_id,
    p_player_key_hash,
    v_entry.email,
    v_entry.consent_transactional_at
  )
  returning * into v_row;

  update public.reservation_waitlist_entries
     set status = 'converted',
         converted_at = pg_catalog.now(),
         converted_reservation_id = v_row.id
   where id = v_entry.id;

  return pg_catalog.jsonb_build_object(
    'state', 'claimed',
    'entry_id', v_entry.id,
    'reservation_id', v_row.id,
    'code', v_row.code,
    'status', v_row.status,
    'starts_at', v_slot.starts_at,
    'ends_at', v_slot.ends_at
  );
end;
$$;

comment on function public.claim_waitlist_offer(uuid, uuid, text) is
  'Convertit une offre de liste prioritaire VIVANTE en réservation confirmée '
  '(RES-2), sur preuve de possession (identifiant d''entrée + empreinte du '
  'cookie). NE REPASSE PAS PAR LA JAUGE PUBLIQUE : la place est déjà comptée '
  'comme tenue par reserve_slot et waitlist_join depuis l''émission de l''offre '
  '— la retester ici la compterait deux fois et aucune offre ne serait jamais '
  'honorable. Refuse `expired` dès que l''échéance est passée, MÊME SI LE '
  'BALAYAGE N''EST PAS PASSÉ (refus paresseux : la garantie ne dépend pas de la '
  'ponctualité d''un cron), `unavailable` sur une entrée sans offre en cours, '
  'un créneau commencé, une activité coupée ou une organisation sans droit '
  '`vitrine`, et `unknown` — indistinctement — pour une entrée inconnue, d''une '
  'AUTRE organisation ou d''une autre identité. Idempotente : rejouée, elle rend '
  'la même réservation et le même code. Le STATUT du créneau n''est pas '
  'revérifié : l''offre EST l''autorisation, et fermer un créneau tarit les '
  'offres suivantes sans reprendre celle qui est promise.';

revoke all on function public.claim_waitlist_offer(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_waitlist_offer(uuid, uuid, text)
  to service_role;


-- ── `waitlist_leave` — quitter la file, volontairement ───────
--
-- Autorisation PAR POSSESSION, comme `cancel_reservation` : le couple
-- (identifiant d'entrée, empreinte du cookie) fait foi, et l'organisation n'est
-- pas un paramètre — la connaître n'ajouterait rien.
--
-- SI LA PERSONNE QUI PART TENAIT UNE OFFRE, LA PLACE REPART IMMÉDIATEMENT au
-- suivant : c'est le troisième chemin par lequel une place se libère, et il
-- serait absurde de la faire attendre l'échéance d'une offre que son
-- destinataire vient explicitement de refuser.
-- ────────────────────────────────────────────────────────────

create or replace function public.waitlist_leave(
  p_entry_id uuid,
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
  v_entry public.reservation_waitlist_entries%rowtype;
  v_was_offered boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  select w.slot_id, w.organization_id into v_slot_id, v_org_id
    from public.reservation_waitlist_entries w
   where w.id = p_entry_id
     and w.player_key_hash = p_player_key_hash
     and w.player_key_hash not like 'purge:%';
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_slot:' || v_org_id::text || ':' || v_slot_id::text,
      0)
  );

  select w.* into v_entry
    from public.reservation_waitlist_entries w
   where w.id = p_entry_id
     and w.player_key_hash = p_player_key_hash
     and w.player_key_hash not like 'purge:%';
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- LES TROIS ÉTATS TERMINAUX SE RENDENT TELS QUELS, sans écriture. Le trigger
  -- de la section 5 refuserait de toute façon d'en sortir ; les nommer ici rend
  -- la réponse lisible plutôt que brutale, et l'appel idempotent.
  if v_entry.status = 'converted' then
    return pg_catalog.jsonb_build_object(
      'state', 'converted',
      'entry_id', v_entry.id,
      'reservation_id', v_entry.converted_reservation_id
    );
  end if;
  if v_entry.status = 'expired' then
    return pg_catalog.jsonb_build_object(
      'state', 'expired',
      'entry_id', v_entry.id,
      'offer_expires_at', v_entry.offer_expires_at
    );
  end if;
  if v_entry.status = 'cancelled' then
    return pg_catalog.jsonb_build_object(
      'state', 'left',
      'entry_id', v_entry.id,
      'cancelled_at', v_entry.cancelled_at
    );
  end if;

  v_was_offered := v_entry.status = 'offered';

  update public.reservation_waitlist_entries
     set status = 'cancelled',
         cancelled_at = pg_catalog.now()
   where id = v_entry.id
  returning * into v_entry;

  -- Il tenait une place : elle repart tout de suite, sous le verrou déjà pris.
  if v_was_offered then
    perform public.reservation_offer_next(v_org_id, v_slot_id);
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'left',
    'entry_id', v_entry.id,
    'cancelled_at', v_entry.cancelled_at
  );
end;
$$;

comment on function public.waitlist_leave(uuid, text) is
  'Retire volontairement une identité de la liste prioritaire, sur preuve de '
  'possession (identifiant d''entrée + empreinte du cookie). Idempotente : '
  'rejouée elle rend `left` sans réécrire `cancelled_at`. Rend `converted` ou '
  '`expired` — sans écrire — sur une entrée déjà terminée, et `unknown` sur une '
  'entrée inconnue, d''une autre identité ou dont les données personnelles ont '
  'été purgées. Si la personne TENAIT une offre, la place est immédiatement '
  'proposée au suivant, sous le MÊME verrou d''avis : refuser une place ne doit '
  'pas la faire attendre son échéance.';

revoke all on function public.waitlist_leave(uuid, text)
  from public, anon, authenticated;
grant execute on function public.waitlist_leave(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 11. `expire_waitlist_offers` — le balayage, et son battement de cœur
--
-- ── POURQUOI AUCUN CONTRÔLE `auth.role()` ICI, ALORS QUE TOUT LE RESTE EN A UN ──
--
-- Parce que pg_cron l'appelle, et que pg_cron n'a pas de session applicative :
-- `auth.role()` lit un GUC (`request.jwt.claims`) que personne n'a posé, donc
-- rend `null`. Un `raise` sur cette base ferait échouer le travail toutes les
-- cinq minutes, en silence, pour une raison qui n'a rien d'un problème de
-- sécurité. C'est le motif exact de `run_jackpot_date_draws`.
--
-- LA PROTECTION EST L'ACL, et elle est plus forte que le contrôle interne :
-- `revoke all` puis `grant execute to service_role`. Un rôle applicatif ne peut
-- pas exécuter cette fonction ; le propriétaire — sous lequel tourne pg_cron —
-- le peut. Leçon du wagon 7 : « le contrôle interne TRACE, c'est l'ACL qui
-- INTERDIT ».
--
-- ── EXACTEMENT UNE FOIS, ET LE REJEU NE FAIT RIEN ──
--
-- Le balayage ne sélectionne que les créneaux portant une offre ÉCHUE, et
-- `reservation_offer_next` n'écrit que sous condition. Après un passage, les
-- offres échues sont `expired` — état TERMINAL gardé par trigger — et les
-- nouvelles portent une échéance future : la requête de tête ne les voit plus.
-- Rejouer immédiatement rend donc trois zéros. Ce n'est pas une propriété de
-- rédaction : elle est prouvée par pgTAP (bloc LIST-EXP).
--
-- ── LE BUDGET ──
--
-- 200 créneaux par passage, les plus anciennement échus d'abord. Une borne, pas
-- une limite subie : à la cadence de cinq minutes, c'est 2 400 créneaux par
-- heure — largement au-delà de tout ce que la bêta peut produire — et elle
-- garantit qu'un incident de données ne transforme pas ce travail en
-- transaction d'une heure qui tiendrait autant de verrous d'avis.
--
-- ── LE BATTEMENT DE CŒUR, ET POURQUOI IL SURVIT À L'ÉCHEC ──
--
-- La ligne `running` est écrite AVANT le bloc de travail ; le travail est
-- enveloppé dans un `exception` qui l'annule sans annuler la ligne ; la clôture
-- est écrite APRÈS. Une panne laisse donc une trace `failed` au lieu de tout
-- effacer avec elle — c'est-à-dire l'inverse de ce qu'un simple appel aurait
-- fait, où l'échec aurait emporté jusqu'à la preuve qu'on avait essayé.
-- `error_code` ne porte que le SQLSTATE : jamais `sqlerrm`, qui recopierait
-- dans le journal la valeur qui a fâché.
-- ────────────────────────────────────────────────────────────

create or replace function public.expire_waitlist_offers()
returns table(
  slots_processed integer,
  offers_expired integer,
  offers_created integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget constant integer := 200;
  v_run_id uuid;
  v_started timestamptz := pg_catalog.clock_timestamp();
  v_error text;
  v_slots integer := 0;
  v_expired integer := 0;
  v_created integer := 0;
  v_n integer;
  r record;
begin
  insert into public.ops_worker_runs (worker, status, started_at)
  values ('reservation-waitlist', 'running', v_started)
  returning id into v_run_id;

  begin
    for r in
      select w.organization_id, w.slot_id,
             pg_catalog.min(w.offer_expires_at) as due
        from public.reservation_waitlist_entries w
       where w.status = 'offered'
         and w.offer_expires_at <= pg_catalog.now()
       group by w.organization_id, w.slot_id
       order by 3
       limit v_budget
    loop
      -- LE MÊME VERROU QUE LES QUATRE AUTRES RPC, pris ici parce que
      -- `reservation_offer_next` ne le prend pas et compte sur son appelant.
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'reservation_slot:' || r.organization_id::text || ':' || r.slot_id::text,
          0)
      );

      -- Recompté SOUS LE VERROU : entre la sélection et ici, une conversion a
      -- pu emporter l'offre qu'on croyait échue. Le nombre annoncé est celui
      -- des lignes réellement passées à `expired`, pas celui qu'on espérait.
      select pg_catalog.count(*)::integer into v_n
        from public.reservation_waitlist_entries w
       where w.slot_id = r.slot_id
         and w.organization_id = r.organization_id
         and w.status = 'offered'
         and w.offer_expires_at <= pg_catalog.now();

      v_created := v_created
        + public.reservation_offer_next(r.organization_id, r.slot_id);
      v_expired := v_expired + v_n;
      v_slots := v_slots + 1;
    end loop;
  exception when others then
    -- Le travail de ce passage est annulé ; la ligne `running`, écrite avant ce
    -- bloc, survit et va être close en `failed` juste en dessous.
    v_error := pg_catalog.substr(sqlstate, 1, 120);
    v_slots := 0;
    v_expired := 0;
    v_created := 0;
  end;

  update public.ops_worker_runs
     set status = case when v_error is null then 'succeeded' else 'failed' end,
         completed_at = pg_catalog.clock_timestamp(),
         -- `date_part('epoch', …)` et non `extract(epoch from …)` : le second
         -- est une construction de GRAMMAIRE, que le préfixe `pg_catalog.`
         -- rend inanalysable. Le premier est une vraie fonction du catalogue,
         -- donc qualifiable — ce qu'exige `set search_path = ''`.
         duration_ms = greatest(
           0,
           pg_catalog.floor(
             pg_catalog.date_part(
               'epoch', pg_catalog.clock_timestamp() - v_started) * 1000
           )::integer),
         counters = pg_catalog.jsonb_build_object(
           'slots', v_slots, 'expired', v_expired, 'created', v_created),
         error_code = v_error
   where id = v_run_id;

  slots_processed := v_slots;
  offers_expired := v_expired;
  offers_created := v_created;
  return next;
end;
$$;

comment on function public.expire_waitlist_offers() is
  'Balaie les offres de liste prioritaire arrivées à échéance : les marque '
  '`expired` (état TERMINAL gardé par trigger) et propose la place au suivant, '
  'créneau par créneau, sous LE MÊME verrou d''avis que reserve_slot. '
  'EXACTEMENT UNE FOIS : le rejeu immédiat ne trouve plus aucune offre échue et '
  'rend trois zéros. Budgété à 200 créneaux par passage, les plus anciennement '
  'échus d''abord. AUCUN contrôle auth.role() — pg_cron n''a pas de session '
  'applicative et `auth.role()` y vaut null ; la protection est l''ACL '
  '(service_role et propriétaire seuls), comme run_jackpot_date_draws. Écrit '
  'son propre battement de cœur ops_worker_runs (`reservation-waitlist`), y '
  'compris en cas d''échec : le travail est annulé, la trace `failed` reste, et '
  'error_code ne porte que le SQLSTATE.';

revoke all on function public.expire_waitlist_offers()
  from public, anon, authenticated;
grant execute on function public.expire_waitlist_offers() to service_role;

-- ── Le registre, puis la planification ──────────────────────
--
-- ── CE QUE LA LEÇON DU WAGON 7 DEMANDE, ET CE QU'ELLE NE DEMANDE PAS ──
--
-- Elle demande qu'un travail planifié NAISSE AVEC SON BATTEMENT DE CŒUR. Le
-- défaut relevé sur le pg_cron de `jackpot-draws` n'est pas qu'il soit
-- `enabled = false` : c'est qu'il n'écrit AUCUNE ligne dans `ops_worker_runs`,
-- de sorte qu'aucune sonde ne peut dire s'il a tourné — et que l'y brancher
-- demanderait un chantier, pas un réglage. Ici, la fonction écrit sa ligne dès
-- le premier tic. Ce défaut-là ne se répète pas.
--
-- ── ET POURQUOI `enabled = false` MALGRÉ TOUT ──
--
-- Parce que la supervision est un GESTE D'EXPLOITATION, pas une décision de
-- migration : la table le dit elle-même (« Brancher un worker = un UPDATE de
-- enabled, pas une migration »), le précédent `expire-trials` (20260819120000)
-- l'applique, et `ops_monitoring.test.sql` porte une assertion dédiée — « base
-- sans historique : la règle de supervision ne rallume personne » — dont c'est
-- exactement le rôle d'empêcher qu'une migration de fonctionnalité s'octroie
-- une ligne rouge dans l'objectif de service de tout le monde. Le rendre `true`
-- ici aurait fait rougir la santé entre l'application de la migration et le
-- premier tic, pour une cause qui n'est pas un incident — et surtout aurait
-- tranché, dans un lot produit, une question d'exploitation encore ouverte
-- (« `enabled=true` propriétaire », docs/bugs.md).
--
-- LA DIFFÉRENCE AVEC LES SEPT AUTRES INSCRITS-NON-SUPERVISÉS EST RÉELLE ET
-- MÉRITE D'ÊTRE DITE : eux attendent un câblage, celui-ci attend une décision.
-- L'allumer est littéralement `update ops_worker_definitions set enabled = true
-- where worker = 'reservation-waitlist'`, sans migration, sans déploiement, et
-- avec un historique déjà là pour que la sonde soit verte à la seconde d'après.
--
-- Tolérance 1 800 s pour une période de 300 s : six tics manqués avant l'alarme.
-- Même rapport que `sync-contests`, dont la cadence est du même ordre.
insert into public.ops_worker_definitions (
  worker, expected_period_seconds, tolerance_seconds, enabled
) values
  ('reservation-waitlist', 300, 1800, false)
on conflict (worker) do nothing;

-- Planification pg_cron (SQL direct, comme run_jackpot_date_draws) : une offre
-- qui expire est sensible au temps — la place doit repartir dans la minute qui
-- suit, pas au prochain passage nocturne.
create extension if not exists pg_cron;
select cron.schedule(
  'lastchance-reservation-waitlist-expire',
  '*/5 * * * *',
  $job$ select public.expire_waitlist_offers() $job$
);


-- ────────────────────────────────────────────────────────────
-- 12. Les invitations : créer, révoquer, fermer, rejoindre
--
-- Les trois premières sont des gestes de GESTION : acteur obligatoire, vérifié
-- `owner`/`editor` EN SQL contre `organization_members` — un `p_actor` libre
-- ferait de la ligne d'audit une déclaration sur l'honneur (motif
-- `checkin_reservation`). Le caissier en est exclu, comme pour l'annulation
-- staff : ouvrir des places est une décision commerciale, pas un geste de
-- comptoir.
--
-- LE JETON EN CLAIR N'EST JAMAIS PARAMÈTRE ni valeur de retour. L'application
-- le tire, le hache, envoie l'empreinte ; elle seule l'affiche, une fois. C'est
-- le motif `player_identity`, et c'est ce qui fait qu'aucun journal de requêtes
-- Postgres ne peut le contenir.
-- ────────────────────────────────────────────────────────────

create or replace function public.create_reservation_invitation(
  p_organization_id uuid,
  p_actor text,
  p_label text,
  p_token_hash text,
  p_activity_id uuid default null,
  p_slot_id uuid default null,
  p_max_uses integer default 1,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_label text;
  v_max integer;
  v_ok boolean;
  v_row public.reservation_invitations%rowtype;
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

  -- L'APPARTENANCE EST TRANCHÉE AVANT TOUT LE RESTE — motif
  -- `cancel_reservation_staff` : un non-membre ne doit pas pouvoir faire lire à
  -- la base les activités d'un commerce dont il n'est pas.
  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = v_actor_id
       and om.role in ('owner', 'editor')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- L'empreinte est produite par l'application : une valeur malformée est un
  -- bogue d'appelant, pas un refus métier. On le dit fort (patron
  -- `reserve_slot` sur `p_player_key_hash`).
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash' using errcode = '22023';
  end if;

  v_label := nullif(pg_catalog.btrim(coalesce(p_label, '')), '');
  if v_label is null or pg_catalog.char_length(v_label) > 120 then
    return pg_catalog.jsonb_build_object('state', 'invalid_label');
  end if;

  v_max := coalesce(p_max_uses, 1);
  if v_max < 1 or v_max > 500 then
    return pg_catalog.jsonb_build_object('state', 'invalid_max_uses');
  end if;

  -- UNE CIBLE, ET UNE SEULE, ET ELLE DOIT ÊTRE DE CETTE MAISON. La contrainte
  -- de table refuserait déjà « aucune » et « les deux » ; la vérifier ici rend
  -- un état lisible au lieu d'une violation de contrainte, et l'appartenance
  -- est de toute façon revérifiée par les FK composites.
  if (p_activity_id is not null) = (p_slot_id is not null) then
    return pg_catalog.jsonb_build_object('state', 'invalid_target');
  end if;

  if p_activity_id is not null then
    select true into v_ok
      from public.reservation_activities a
     where a.id = p_activity_id
       and a.organization_id = p_organization_id;
  else
    select true into v_ok
      from public.reservation_slots s
     where s.id = p_slot_id
       and s.organization_id = p_organization_id;
  end if;
  if not coalesce(v_ok, false) then
    return pg_catalog.jsonb_build_object('state', 'invalid_target');
  end if;

  -- UNE ÉCHÉANCE DÉJÀ PASSÉE N'OUVRE RIEN. La refuser à la création évite
  -- l'invitation qui naît morte et que le commerçant croit avoir envoyée.
  if p_expires_at is not null and p_expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('state', 'invalid_expiry');
  end if;

  begin
    insert into public.reservation_invitations (
      organization_id, activity_id, slot_id, label, token_hash,
      max_uses, expires_at, created_by
    ) values (
      p_organization_id, p_activity_id, p_slot_id, v_label, p_token_hash,
      v_max, p_expires_at, v_actor_id
    )
    returning * into v_row;
  exception when unique_violation then
    -- Le jeton est unique GLOBALEMENT : une collision signale soit un tirage
    -- rejoué, soit un jeton recopié d'un autre commerce. On refuse sans dire
    -- lequel des deux.
    return pg_catalog.jsonb_build_object('state', 'duplicate');
  end;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor, 'reservation.invitation_create',
          pg_catalog.jsonb_build_object(
            'invitation_id', v_row.id,
            'activity_id', v_row.activity_id,
            'slot_id', v_row.slot_id,
            'max_uses', v_row.max_uses));

  return pg_catalog.jsonb_build_object(
    'state', 'created',
    'invitation_id', v_row.id,
    'max_uses', v_row.max_uses,
    'expires_at', v_row.expires_at
  );
end;
$$;

comment on function public.create_reservation_invitation(uuid, text, text, text, uuid, uuid, integer, timestamptz) is
  'Crée une invitation privée. Org-scopée, acteur obligatoire et vérifié membre '
  'owner/editor EN SQL (le caissier est exclu : ouvrir des places est une '
  'décision commerciale), auditée sous `reservation.invitation_create`. LE '
  'JETON EN CLAIR N''EST NI PARAMÈTRE NI RETOUR : l''application le tire, le '
  'hache et n''envoie que l''empreinte — aucun journal Postgres ne peut donc le '
  'contenir, et le lien n''est affichable qu''UNE FOIS, côté application. Exige '
  'EXACTEMENT une cible (activité OU créneau) appartenant à l''organisation. '
  'Refuse `duplicate` sur une empreinte déjà connue (unicité globale), '
  '`invalid_target`, `invalid_label`, `invalid_max_uses` et `invalid_expiry` '
  'sur une échéance déjà passée.';

revoke all on function public.create_reservation_invitation(uuid, text, text, text, uuid, uuid, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_reservation_invitation(uuid, text, text, text, uuid, uuid, integer, timestamptz)
  to service_role;


-- ── Révoquer : le lien est mort ─────────────────────────────

create or replace function public.revoke_reservation_invitation(
  p_organization_id uuid,
  p_invitation_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_row public.reservation_invitations%rowtype;
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

  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = v_actor_id
       and om.role in ('owner', 'editor')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- IDEMPOTENCE : la condition `revoked_at is null` fait que la seconde
  -- révocation n'écrit rien — et surtout ne repousse pas la date. La lecture
  -- ci-dessous rend l'état dans les deux cas.
  update public.reservation_invitations i
     set revoked_at = pg_catalog.now()
   where i.id = p_invitation_id
     and i.organization_id = p_organization_id
     and i.revoked_at is null;

  select i.* into v_row
    from public.reservation_invitations i
   where i.id = p_invitation_id
     and i.organization_id = p_organization_id;
  -- INDISTINGUABLE : identifiant inconnu et invitation d'une AUTRE organisation
  -- passent par le même filtre org-scopé, donc rendent la même réponse.
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  -- Le journal ne retient que le geste RÉEL. Une seconde révocation ne dit pas
  -- « ce responsable a révoqué deux fois » : il a cliqué deux fois.
  if v_row.revoked_at = pg_catalog.now() then
    insert into public.audit_logs (organization_id, actor, action, metadata)
    values (p_organization_id, p_actor, 'reservation.invitation_revoke',
            pg_catalog.jsonb_build_object('invitation_id', v_row.id));
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'revoked',
    'invitation_id', v_row.id,
    'revoked_at', v_row.revoked_at
  );
end;
$$;

comment on function public.revoke_reservation_invitation(uuid, uuid, text) is
  'Révoque une invitation : le lien est MORT et rendra `unavailable` à la '
  'rejointe, indistinctement d''un jeton inconnu. Org-scopée, acteur vérifié '
  'owner/editor EN SQL, idempotente (la date n''est pas repoussée), auditée sur '
  'le seul geste réel sous `reservation.invitation_revoke`. Réponse '
  'INDISTINGUABLE — `unknown` — pour un identifiant inconnu et pour une '
  'invitation d''une AUTRE organisation. NE TOUCHE AUCUNE RÉSERVATION déjà '
  'confirmée par cette invitation.';

revoke all on function public.revoke_reservation_invitation(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_reservation_invitation(uuid, uuid, text)
  to service_role;


-- ── Fermer : les inscriptions s'arrêtent, les places restent ─
--
-- C'EST LE CRITÈRE D'ACCEPTATION RES-2 « l'organisateur peut fermer les
-- inscriptions sans annuler les places déjà confirmées », et sa preuve tient en
-- une ligne : cette fonction n'écrit QUE dans `reservation_invitations`. Elle ne
-- lit même pas `reservations`.

create or replace function public.close_reservation_invitation(
  p_organization_id uuid,
  p_invitation_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_row public.reservation_invitations%rowtype;
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

  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = v_actor_id
       and om.role in ('owner', 'editor')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.reservation_invitations i
     set closed_at = pg_catalog.now()
   where i.id = p_invitation_id
     and i.organization_id = p_organization_id
     and i.closed_at is null;

  select i.* into v_row
    from public.reservation_invitations i
   where i.id = p_invitation_id
     and i.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unknown');
  end if;

  if v_row.closed_at = pg_catalog.now() then
    insert into public.audit_logs (organization_id, actor, action, metadata)
    values (p_organization_id, p_actor, 'reservation.invitation_close',
            pg_catalog.jsonb_build_object('invitation_id', v_row.id));
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'closed',
    'invitation_id', v_row.id,
    'closed_at', v_row.closed_at
  );
end;
$$;

comment on function public.close_reservation_invitation(uuid, uuid, text) is
  'Ferme les inscriptions d''une invitation SANS ANNULER AUCUNE PLACE DÉJÀ '
  'CONFIRMÉE — critère d''acceptation RES-2, et sa preuve tient à ce que cette '
  'fonction n''écrit que dans `reservation_invitations` et ne lit même pas '
  '`reservations`. Le lien reste lisible par le commerçant, il n''ouvre plus '
  'rien. Org-scopée, acteur vérifié owner/editor EN SQL, idempotente, auditée '
  'sur le seul geste réel sous `reservation.invitation_close`. Réponse '
  'INDISTINGUABLE — `unknown` — pour un identifiant inconnu et pour une '
  'invitation d''une AUTRE organisation.';

revoke all on function public.close_reservation_invitation(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.close_reservation_invitation(uuid, uuid, text)
  to service_role;


-- ── `redeem_invitation` — la rejointe ───────────────────────
--
-- ── UN SEUL ÉTAT POUR NEUF REFUS, ET C'EST TOUT L'ENJEU ──
--
-- Jeton inconnu, révoqué, fermé, expiré, épuisé, d'une AUTRE organisation ;
-- créneau absent, en brouillon, passé ; activité coupée ; organisation sans le
-- droit `vitrine`. Tous rendent `unavailable`. Les distinguer donnerait à
-- quiconque tape des jetons au hasard un oracle sur ce qui a existé : « ce
-- jeton a été révoqué » apprend qu'il a été valide, et « épuisé » apprend
-- combien de personnes sont venues.
--
-- ── LE CRÉNEAU `closed` EST ACCEPTÉ, ET C'EST DÉLIBÉRÉ ──
--
-- Une invitation privée est « une réservation avec une RÈGLE D'ACCÈS distincte »
-- (cahier RES-2). Son cas d'usage principal est justement le créneau fermé au
-- public : « j'ouvre cinq places à mes habitués ». Refuser sur `closed` aurait
-- rendu la fonctionnalité inutile pour ce pour quoi elle existe. Ce qui arrête
-- une invitation, ce sont SES propres interrupteurs — `closed_at`,
-- `revoked_at`, `expires_at`, `max_uses` — pas l'état d'ouverture publique du
-- créneau. `draft` reste refusé : un créneau en brouillon n'est pas configuré.
--
-- ── LA CAPACITÉ RESTE LA CAPACITÉ ──
--
-- Une invitation ne sur-réserve pas : le comptage est celui de `reserve_slot`,
-- ses DEUX termes compris. Une place tenue par une offre de liste prioritaire
-- n'est pas disponible pour un invité — les deux promesses valent autant l'une
-- que l'autre, et c'est la première faite qui tient.
--
-- ── LE COMPTEUR NE SE CONSOMME QUE SUR UNE PLACE RÉELLEMENT DONNÉE ──
--
-- Idempotence AVANT incrément : deux clics du même invité rendent la même
-- réservation et ne brûlent qu'un usage. C'est la différence entre une
-- invitation « 5 places » et une invitation « 5 clics ».

create or replace function public.redeem_invitation(
  p_organization_id uuid,
  p_token_hash text,
  p_player_key_hash text,
  p_slot_id uuid default null,
  p_email text default null,
  p_consent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.reservation_invitations%rowtype;
  v_slot public.reservation_slots%rowtype;
  v_target_slot uuid;
  v_activity_active boolean;
  v_activity_name text;
  v_existing public.reservations%rowtype;
  v_email text;
  v_taken integer;
  v_held integer;
  v_used integer;
  v_row public.reservations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  -- Empreinte produite par l'application : malformée = bogue d'appelant.
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash' using errcode = '22023';
  end if;

  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null
     and (pg_catalog.char_length(v_email) > 254
          or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  then
    return pg_catalog.jsonb_build_object('state', 'invalid_email');
  end if;

  -- Lecture HORS VERROU pour connaître la cible — l'autre moitié de la clé.
  -- ORG-SCOPÉE : c'est ce filtre qui rend « autre organisation » et « inconnu »
  -- indistinguables. Rien n'est décidé ici, tout est relu sous le verrou.
  select i.* into v_inv
    from public.reservation_invitations i
   where i.organization_id = p_organization_id
     and i.token_hash = p_token_hash;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_target_slot := coalesce(v_inv.slot_id, p_slot_id);
  if v_target_slot is null then
    -- Invitation à l'échelle d'une activité : l'appelant doit dire QUEL
    -- créneau. Muet, comme le reste.
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'reservation_slot:' || p_organization_id::text || ':' || v_target_slot::text,
      0)
  );

  -- RELECTURE SOUS VERROU, et `for update` : c'est ce qui rend l'incrément de
  -- `used_count` atomique. Deux invités qui cliquent en même temps sur la
  -- dernière place s'attendent l'un l'autre sur cette ligne.
  select i.* into v_inv
    from public.reservation_invitations i
   where i.organization_id = p_organization_id
     and i.token_hash = p_token_hash
     for update;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LES QUATRE INTERRUPTEURS DE L'INVITATION, muets.
  if v_inv.revoked_at is not null
     or v_inv.closed_at is not null
     or (v_inv.expires_at is not null and v_inv.expires_at <= pg_catalog.now())
     or v_inv.used_count >= v_inv.max_uses
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select s.* into v_slot
    from public.reservation_slots s
   where s.id = v_target_slot
     and s.organization_id = p_organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LA CIBLE DOIT CORRESPONDRE. Une invitation à l'activité A n'ouvre pas un
  -- créneau de l'activité B ; une invitation au créneau S n'ouvre que S (le
  -- `coalesce` ci-dessus a déjà imposé S, ce test couvre la première moitié).
  if v_inv.activity_id is not null
     and v_slot.activity_id is distinct from v_inv.activity_id
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select a.active, a.name into v_activity_active, v_activity_name
    from public.reservation_activities a
   where a.id = v_slot.activity_id
     and a.organization_id = v_slot.organization_id;

  -- `draft` refusé, `closed` ACCEPTÉ — voir l'en-tête : ouvrir des places sur
  -- un créneau fermé au public est le cas d'usage même de l'invitation privée.
  if not coalesce(v_activity_active, false)
     or v_slot.status not in ('open', 'closed')
     or v_slot.starts_at <= pg_catalog.now()
     or not public.org_has_module_access(v_slot.organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- IDEMPOTENCE AVANT INCRÉMENT. Deux clics rendent la même place et ne brûlent
  -- qu'un usage : une invitation « 5 places » n'est pas une invitation
  -- « 5 clics ».
  select r.* into v_existing
    from public.reservations r
   where r.slot_id = v_slot.id
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

  -- LA CAPACITÉ, SES DEUX TERMES COMPRIS. Une invitation ne prend pas la place
  -- tenue pour quelqu'un de la liste prioritaire.
  select pg_catalog.count(*)::integer into v_taken
    from public.reservations r
   where r.slot_id = v_slot.id
     and r.status in ('confirmed', 'checked_in');
  select pg_catalog.count(*)::integer into v_held
    from public.reservation_waitlist_entries w
   where w.slot_id = v_slot.id
     and w.status = 'offered'
     and w.offer_expires_at > pg_catalog.now();

  if v_taken + v_held >= v_slot.capacity then
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
    case when coalesce(p_consent, false) then v_email end,
    case when coalesce(p_consent, false) and v_email is not null
         then pg_catalog.now() end
  )
  returning * into v_row;

  -- L'INCRÉMENT EST CONDITIONNEL, alors même que la ligne est verrouillée et
  -- que le plafond vient d'être testé. Ceinture : si un jour un chemin oubliait
  -- l'un des deux, `reservation_invitations_uses_bound` refuserait la ligne — et
  -- c'est bien la base, pas la discipline de rédaction, qui doit tenir un
  -- compteur de places.
  update public.reservation_invitations i
     set used_count = i.used_count + 1
   where i.id = v_inv.id
     and i.used_count < i.max_uses
  returning i.used_count into v_used;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, 'public', 'reservation.invitation_redeem',
          pg_catalog.jsonb_build_object(
            'invitation_id', v_inv.id,
            'reservation_id', v_row.id,
            'slot_id', v_slot.id,
            'used_count', v_used));

  return pg_catalog.jsonb_build_object(
    'state', 'reserved',
    'reservation_id', v_row.id,
    'code', v_row.code,
    'invitation_id', v_inv.id,
    'starts_at', v_slot.starts_at,
    'ends_at', v_slot.ends_at,
    'activity_name', v_activity_name,
    'remaining', v_slot.capacity - (v_taken + 1) - v_held
  );
end;
$$;

comment on function public.redeem_invitation(uuid, text, text, uuid, text, boolean) is
  'Réserve une place au titre d''une invitation privée (RES-2), par l''EMPREINTE '
  'du jeton — le clair n''entre jamais en base. UN SEUL ÉTAT `unavailable` POUR '
  'NEUF REFUS : jeton inconnu, révoqué, fermé, expiré, épuisé, d''une AUTRE '
  'organisation, créneau absent ou en brouillon ou passé, activité coupée, '
  'organisation sans droit `vitrine` — les distinguer donnerait un oracle à qui '
  'tape des jetons au hasard. Le créneau `closed` est ACCEPTÉ, délibérément : '
  'ouvrir quelques places sur un créneau fermé au public est le cas d''usage '
  'même de l''invitation ; ce qui l''arrête, ce sont SES interrupteurs. Même '
  'mécanique atomique que reserve_slot — MÊME verrou d''avis, comptage à deux '
  'termes (réservations vivantes + offres de liste tenues), aucune '
  'sur-réservation. `used_count` est incrémenté SOUS VERROU et sous condition, '
  'et l''idempotence est évaluée AVANT : deux clics du même invité rendent la '
  'même réservation et ne brûlent qu''un usage. Audité sous '
  '`reservation.invitation_redeem`.';

revoke all on function public.redeem_invitation(uuid, text, text, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.redeem_invitation(uuid, text, text, uuid, text, boolean)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 13. `reservation_public_state` — la file entre dans l'état du joueur
--
-- SIGNATURE ET TYPE DE RETOUR INCHANGÉS (jsonb) : `create or replace` suffit,
-- aucun `drop` n'est nécessaire et L4, qui lit ce document par ses clés, ne
-- casse pas. Une clé s'ajoute : `waitlist`.
--
-- ── `offer_live` EST CALCULÉ PAR LE SERVEUR, ET C'EST LE POINT ──
--
-- Rendre `offer_expires_at` seul aurait obligé le client à le comparer à SA
-- propre horloge pour savoir si l'offre tient encore — c'est-à-dire à faire
-- dépendre d'un téléphone mal réglé la réponse à « cette place est-elle
-- encore à moi ». Le serveur tranche, le client affiche. L'échéance est rendue
-- quand même : elle sert à afficher un compte à rebours, pas à décider.
--
-- SEULES LES ENTRÉES VIVANTES SORTENT (`waiting` et `offered`). Une entrée
-- convertie est devenue une RÉSERVATION, et elle est déjà dans l'autre liste ;
-- une entrée expirée ou quittée n'est plus rien qu'on puisse reprendre.
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
  v_waitlist jsonb;
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
     and r.player_key_hash not like 'purge:%';

  -- LA FILE. Le RANG est recalculé ici, à la lecture, exactement comme la
  -- capacité : il compte les entrées vivantes du même créneau inscrites avant
  -- celle-ci. La comparaison de LIGNES `(created_at, id) < (…)` départage deux
  -- inscriptions de la même milliseconde de façon stable — sans elle, deux
  -- personnes pourraient lire le même rang.
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'entry_id', w.id,
        'slot_id', w.slot_id,
        'status', w.status,
        'created_at', w.created_at,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'activity_name', a.name,
        'offer_expires_at', w.offer_expires_at,
        'offer_live',
          w.status = 'offered' and w.offer_expires_at > pg_catalog.now(),
        'position', (
          select pg_catalog.count(*)::integer + 1
            from public.reservation_waitlist_entries w2
           where w2.slot_id = w.slot_id
             and w2.status in ('waiting', 'offered')
             and (w2.created_at, w2.id) < (w.created_at, w.id)
        )
      )
      order by s.starts_at asc
    ),
    '[]'::jsonb
  ) into v_waitlist
    from public.reservation_waitlist_entries w
    join public.reservation_slots s
      on s.id = w.slot_id
     and s.organization_id = p_organization_id
    join public.reservation_activities a
      on a.id = s.activity_id
     and a.organization_id = p_organization_id
   where w.organization_id = p_organization_id
     and w.player_key_hash = p_player_key_hash
     -- Une entrée PURGÉE ne se relit pas : son empreinte vaut `purge:<id>`, que
     -- la garde de forme ci-dessus interdit déjà de passer en paramètre. Ce
     -- filtre écrit l'intention et survivrait à un assouplissement.
     and w.player_key_hash not like 'purge:%'
     and w.status in ('waiting', 'offered');

  -- NI l'email NI l'empreinte ne sortent d'ici — ni des réservations, ni de la
  -- file. Le premier est une donnée que l'appelant a déjà fournie s'il la
  -- connaît ; la seconde est la clé d'accès elle-même.
  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'timezone', v_timezone,
    'reservations', v_items,
    'waitlist', v_waitlist
  );
end;
$$;

comment on function public.reservation_public_state(uuid, text) is
  'Réservations ET entrées de liste prioritaire VIVANTES d''une identité '
  'pseudonyme CHEZ UNE organisation — le joueur retrouve son statut, son '
  'créneau, son code, son RANG et son offre en cours sans compte. Bornée à '
  'l''organisation : l''empreinte du cookie est globale, et une réponse non '
  'bornée exposerait sur la page d''un commerce ce que la personne a réservé '
  'chez un autre. Le rang est recalculé à la lecture (ordre d''inscription, '
  'départagé par l''identifiant), jamais stocké. `offer_live` est tranché PAR LE '
  'SERVEUR : savoir si une place est encore tenue ne doit pas dépendre de '
  'l''horloge d''un téléphone. N''expose ni l''email ni l''empreinte.';

revoke all on function public.reservation_public_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reservation_public_state(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 14. Purge RGPD — corps VERBATIM de 20261002120000, +1 geste
--
-- Même forme que l'ajout du geste `reservations` par le socle, et pour la même
-- raison : LA SIGNATURE NE BOUGE PAS. Une quatrième colonne de retour aurait
-- exigé un `drop function` et une modification de
-- src/app/api/cron/purge-data/route.ts, qui lit les colonnes par leur nom —
-- deux périmètres pour un compteur que personne ne lit.
--
-- LE GESTE AJOUTÉ (e) : les entrées de liste prioritaire portent une adresse,
-- son consentement et l'empreinte de l'appareil, exactement comme les
-- réservations. Les oublier ici aurait laissé, dans une table neuve, la donnée
-- personnelle que la table d'à côté efface depuis le socle — et la rétention du
-- commerçant aurait été vraie à moitié.
--
-- LA LIGNE RESTE, LA PERSONNE S'EFFACE : le rang tenu, l'offre faite et son
-- issue appartiennent à l'histoire du remplissage du commerçant. Le trigger
-- d'état terminal ne s'y oppose pas — il gèle les statuts et les dates, pas les
-- trois colonnes de la personne (voir section 5).
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
    -- personne meurt.
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

    -- (e) La LISTE PRIORITAIRE (20261004120000) : même geste, même raison. Le
    -- rang tenu et l'issue de l'offre restent — ils racontent le remplissage,
    -- pas la personne — l'adresse, son consentement et le lien à l'appareil
    -- s'effacent d'un seul geste (l'équivalence email/consentement de la table
    -- refuserait d'ailleurs de n'en effacer qu'un). Le garde `not like` rend le
    -- passage idempotent.
    update public.reservation_waitlist_entries
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
