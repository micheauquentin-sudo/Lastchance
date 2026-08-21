-- ============================================================
-- SOCLE DE SESSION JOUEUR — LES LOBBIES GRATUITS (L16)
--
-- Fondation commune de Duo Miroir (L17, deux joueurs) et Portrait de la Bande
-- (L18, deux à douze). Ce lot ne livre AUCUN jeu : il livre la salle d'attente
-- où l'on se retrouve avant d'en jouer un, et rien d'autre.
--
-- ── CE QUE ADR-109 §A4 A TRANCHÉ, ET QUI GOUVERNE CE FICHIER ──
--
-- Les lobbies joueurs sont GRATUITS, distincts des paliers événement facturés.
-- La décision est CITÉE ici, pas résumée — une paraphrase dérive du texte
-- qu'elle prétend appliquer, et c'est ce texte-là qui gouverne le fichier
-- (docs/decisions.md, ADR-109 §A4) :
--
--   « **Gardes retenues** : seau IP-seule (protection réelle contre l'abus),
--     quota par organisation, TTL d'expiration des lobbies non verrouillés. Le
--     plafond par cookie joueur est reconnu comme décoratif — il ne protège
--     rien qu'un joueur motivé ne contourne en effaçant son cookie — et n'est
--     donc pas compté comme une garde à part entière. »
--
-- Et son amendement, daté du jour de la revue :
--
--   « §A4 amendé (revue L16) : la garde IP est livrée observatoire — ADR-032
--     interdit le refus sur clé partagée en parcours public — et le quota durci
--     (salles habitées ou récentes) porte le refus effectif. »
--
-- CE QUE CE FICHIER EN FAIT, garde par garde :
--
--   1. Seau IP-seule — côté APPLICATION, et OBSERVATOIRE : il compte, il ne
--      refuse pas (ADR-032, clé partagée en parcours public). Rien ici, et
--      surtout aucune illusion de refus ailleurs dans le lot.
--   2. QUOTA PAR ORGANISATION — **EN SQL**, et c'est `create_player_lobby` qui
--      le tient. Vingt salles HABITÉES OU RÉCENTES par organisation, comptées
--      SOUS VERROU CONSULTATIF : un plafond lu hors verrou n'est pas un
--      plafond, c'est une estimation que deux appels simultanés dépassent
--      ensemble. La garde 1 étant observatoire, ce quota est le SEUL refus
--      effectif du lot — d'où son durcissement à la revue L16 : compter les
--      salles vides en faisait son propre levier de déni, vingt requêtes
--      d'affilée suffisant à fermer un commerce à ses propres clients.
--   3. TTL D'EXPIRATION des lobbies non verrouillés — trente minutes à la
--      création, prolongées à UNE HEURE par le VERROUILLAGE, et un plafond
--      dur de vingt-quatre heures écrit en `check` : aucune prolongation, aucun
--      bogue de calcul, aucune horloge dérivante ne peut faire vivre un lobby
--      plus d'un jour.
--   4. Le plafond par cookie joueur est DÉCORATIF — la citation ci-dessus le
--      dit en toutes lettres, et ce fichier ne la redouble pas. Il n'est donc
--      pas implémenté ici, et surtout il n'est compté nulle part comme une
--      garde.
--
-- ── LE DÉNI INTRA-ORGANISATION : COURT, VISIBLE, RÉVERSIBLE (E-1) ──
--
-- La contre-revue a DÉMONTRÉ que durcir davantage le prédicat du quota ne sert
-- à rien : `create` + entrée avec son PROPRE code de partage + `lock` font
-- trois requêtes, et rendent une salle qui compte comme habitée. C'est MOINS
-- CHER que la rafale de salles vides que le durcissement venait fermer. La
-- raison est structurelle et il faut l'écrire une fois pour toutes : AUCUN
-- prédicat portant sur une appartenance attestée par cookie ne sépare N cookies
-- de N personnes. Un tour de vis de plus ne ferait que déplacer le prix de
-- l'attaque de quinze requêtes à vingt.
--
-- La contrepartie livrée ici ne re-durcit donc RIEN. Elle rend le déni court,
-- visible et réversible :
--
--   · COURT — le TTL du verrouillage passe de quatre heures à UNE HEURE. Une
--     partie de Duo Miroir ou de Portrait de la Bande dure quinze minutes ;
--     quatre heures étaient une marge de confort, elles étaient devenues la
--     durée de vie d'une salle-squat. Le plafond dur de vingt-quatre heures ne
--     bouge pas (`player_lobbies_ttl_borne`, inchangé) : c'est la garde 3, et
--     une garde ne se renégocie pas parce qu'une autre valeur a changé.
--   · VISIBLE — `org_player_lobbies` rend au commerçant la liste de ses salles
--     vivantes. Vingt salles ouvertes en trois minutes se VOIENT, là où le seul
--     signe était jusqu'ici un refus opposé à un vrai client.
--   · RÉVERSIBLE — `close_player_lobby_as_org` ferme une salle en un geste.
--     Vingt salles-squat se ferment en vingt clics au lieu d'attendre le TTL,
--     et chaque fermeture rend IMMÉDIATEMENT sa place au quota.
--
-- Ce triplet ne rend pas l'attaque impossible — rien de ce qui est écrit ici ne
-- le prétend. Il en change le rapport de forces : l'attaquant doit rejouer sans
-- cesse ce que le commerçant défait d'un clic, sous ses yeux.
--
-- ── L'EXPIRATION EST CONSTATÉE À LA LECTURE, JAMAIS ÉCRITE (ADR-111) ──
--
-- Aucun worker ne fait expirer un lobby. `expires_at` est une DATE, et toute
-- lecture la compare à `now()` : un lobby dépassé se lit « expired » sans
-- qu'une ligne ait bougé. Trois conséquences, toutes voulues :
--
--   · une panne de cron ne prolonge la vie d'aucun lobby, puisque rien
--     n'attendait le cron pour que le lobby soit mort ;
--   · `lobby_state` affiche « expired » SANS ÉCRIRE — la statistique ne
--     s'invente pas, et un `update` déclenché par un simple regard daterait
--     l'expiration du moment où quelqu'un a ouvert l'écran ;
--   · `purge_expired_lobbies` DATE SON SEUIL AU DERNIER INSTANT CONNU
--     (`expires_at`), jamais à `now()` du cron. Un cron qui rattrape trois
--     jours de retard efface alors exactement ce qu'il aurait effacé à
--     l'heure, et rien d'autre.
--
-- ── AUCUNE POLICY, ET C'EST LE MOTIF `vitrine_translations` ──
--
-- Les deux tables portent la RLS et ZÉRO policy : `service_role` seul y touche,
-- et il n'y touche que par les RPC de ce fichier. Un lobby n'appartient à aucun
-- compte marchand — il appartient à des joueurs anonymes tenus par un cookie —
-- donc il n'existe aucun prédicat marchand qui aurait un sens ici. La porte
-- reste fermée pour `anon` comme pour `authenticated`, `references` / `trigger`
-- / `truncate` compris (leçon SEC-4, wagon 7).
--
-- LES DEUX RPC COMMERÇANT (§12 et §13) NE CHANGENT RIEN À CELA. Elles sont
-- `security definer`, rendues à `service_role` et à lui seul, et le lien avec le
-- commerçant est un `p_organization_id` COMPARÉ DANS LA FONCTION. Ouvrir une
-- policy à `authenticated` aurait donné aux comptes marchands un accès DIRECT
-- aux deux tables — donc aux pseudos et aux codes de partage, que ces deux RPC
-- refusent précisément de rendre.
--
-- ── L'IDENTITÉ EST RÉUTILISÉE, JAMAIS DUPLIQUÉE ──
--
-- `token_hash` est le SHA-256 d'un cookie PAR LOBBY (motif `event_players`), et
-- jamais l'identité globale `lc-player` en clair. Le joueur reste le même
-- joueur d'un lobby à l'autre du point de vue de l'application ; la base, elle,
-- ne voit qu'une empreinte par lobby, et ne peut donc pas recoudre les lobbies
-- d'une même personne. C'est la session privée éphémère : elle vit le temps du
-- lobby, et la purge l'efface avec lui.
--
-- ── LE REFUS EST INDISTINCT, ET C'EST LA PROPRIÉTÉ CENTRALE ──
--
-- `join_player_lobby` rend EXACTEMENT le même document pour un code inventé,
-- un code expiré, un code clos et un code malformé : `{"state":"unavailable"}`.
-- Distinguer les quatre donnerait à n'importe qui un oracle sur les codes qui
-- ont existé — c'est-à-dire de quoi énumérer, six caractères à la fois, la vie
-- sociale des commerces d'à côté. Le code court n'est PAS REJOUABLE après
-- expiration, et son cadavre ne se distingue pas d'un code jamais né.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. `player_lobbies` — la salle d'attente
-- ────────────────────────────────────────────────────────────

create table public.player_lobbies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- Liste FERMÉE de deux valeurs. « duo » est L17, « bande » est L18 : un
  -- troisième format ne peut pas apparaître sans que ce `check` l'apprenne, et
  -- c'est le seul endroit qui rende ce couplage visible.
  kind text not null check (kind in ('duo', 'bande')),
  -- Quatre états, et le cycle ne revient jamais en arrière :
  --   lobby   → on attend, on peut rejoindre, le code vit ;
  --   locked  → l'hôte a fermé la porte, la partie appartient à L17/L18 ;
  --   closed  → l'hôte est parti avant de fermer : plus personne n'attend ;
  --   expired → réservé aux écritures futures. AUCUNE RPC de ce fichier ne
  --             l'écrit : l'expiration se CONSTATE (ADR-111), elle ne se pose
  --             pas. La valeur est admise pour qu'un lot ultérieur puisse la
  --             poser DÉLIBÉRÉMENT, jamais par effet de bord d'une lecture.
  status text not null default 'lobby'
    check (status in ('lobby', 'locked', 'closed', 'expired')),
  -- Alphabet SANS I, O, 0 ni 1 — le code se dicte à voix haute, à une table de
  -- café, et « zéro » contre « O » est la faute qui coûte le plus. Le motif est
  -- celui de `event_sessions.join_code` (20260727120000), à la lettre.
  join_code text not null unique
    check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  -- Deux à douze. Duo est FIGÉ à deux par la contrainte ci-dessous : c'est la
  -- base qui le tient, pas la bonne volonté de l'appelant.
  capacite integer not null check (capacite between 2 and 12),
  -- SHA-256 du cookie de l'hôte. C'est lui, et lui seul, qui verrouille le
  -- lobby et qui voit le code de partage.
  creator_token_hash text not null
    check (creator_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.now(),
  -- `not null` : un lobby sans date de mort est un lobby immortel, et la garde
  -- 3 de l'en-tête cesserait d'exister pour lui.
  expires_at timestamptz not null,
  -- La composite dont `player_lobby_members` a besoin. Elle porte `id` en tête,
  -- donc elle ne sert PAS d'index d'organisation : celui-là est posé plus bas.
  constraint player_lobbies_org_unique unique (id, organization_id),
  -- DUO NE NÉGOCIE PAS SA CAPACITÉ. Écrit en `check` et non seulement dans la
  -- RPC : un duo à trois places serait un Duo Miroir sans miroir, et L17 le
  -- découvrirait à l'exécution.
  constraint player_lobbies_duo_fige check (kind <> 'duo' or capacite = 2),
  -- LE PLAFOND DUR DE VINGT-QUATRE HEURES (garde 3). Écrit en SOUSTRACTION et
  -- non en `expires_at <= created_at + interval '24 hours'` : l'addition
  -- `timestamptz + interval` est STABLE (elle dépend du fuseau pour les
  -- composantes jour et mois), et Postgres refuse une fonction non IMMUTABLE
  -- dans un `check`. La soustraction `timestamptz - timestamptz`, elle, est
  -- immutable. Même borne, et elle s'installe.
  constraint player_lobbies_ttl_borne check (
    expires_at > created_at
    and expires_at - created_at <= interval '24 hours'
  )
);

comment on table public.player_lobbies is
  'Salle d''attente d''une session joueur gratuite (L16, socle de L17 Duo '
  'Miroir et L18 Portrait de la Bande). Un lobby = un code court non rejouable, '
  'une capacité, une date de mort. Les gardes d''ADR-109 §A4 vivent ici : quota '
  'par organisation dans create_player_lobby — vingt salles HABITÉES OU RÉCENTES, '
  'durci à la revue L16 parce qu''il est le seul refus effectif du lot —, TTL en '
  'colonne, plafond dur de 24 h en check. '
  'Le déni intra-organisation (E-1) ne se ferme PAS par un prédicat de plus — '
  'aucun ne sépare N cookies de N personnes — mais se rend COURT (verrouillage à '
  '1 h), VISIBLE (org_player_lobbies) et RÉVERSIBLE '
  '(close_player_lobby_as_org). '
  'L''expiration se CONSTATE à la lecture (ADR-111), aucun worker ne '
  'l''écrit. RLS active et AUCUNE policy : service_role seul, tout passe par les '
  'RPC de 20261017120000 (motif vitrine_translations).';
comment on column public.player_lobbies.join_code is
  'Code de partage à six caractères, alphabet sans I/O/0/1 parce qu''il se dicte '
  'à voix haute. Unique sur TOUTE la table, donc résolvable sans organisation — '
  'c''est ce qui permet à join_player_lobby de ne rien demander d''autre. Non '
  'rejouable après expiration : le lobby mort garde son code, et le code mort '
  'rend le MÊME refus qu''un code jamais né.';
comment on column public.player_lobbies.expires_at is
  'Date de mort. 30 minutes à la création, portée à 1 HEURE par '
  'lock_player_lobby — quatre heures à l''origine, ramenées à une à la '
  'contre-revue L16 : une partie dure quinze minutes, et la marge était devenue '
  'la durée de vie d''une salle-squat. Jamais au-delà de created_at + 24 h '
  '(check player_lobbies_ttl_borne, inchangé). C''est aussi le DERNIER INSTANT '
  'CONNU du lobby : purge_expired_lobbies date son seuil dessus, jamais sur '
  'now() (ADR-111), et close_player_lobby_as_org le ramène à l''instant de la '
  'fermeture pour la même raison.';
comment on column public.player_lobbies.creator_token_hash is
  'SHA-256 du cookie de l''hôte. Seul ce hash verrouille le lobby et se voit '
  'rendre join_code par lobby_state. Ce n''est PAS l''identité globale du joueur : '
  'le cookie est propre au lobby (motif event_players).';

alter table public.player_lobbies enable row level security;

-- Ceinture et bretelles, motif `vitrine_translations` : depuis 20260930120000
-- les privilèges par défaut ne servent plus `authenticated` (00021 avait fait
-- de même pour `anon`), donc la table naît déjà nue. Le `revoke` explicite
-- reste écrit parce qu'une garde qui dépend d'une migration d'il y a trois
-- semaines est une garde qu'on ne relit pas.
revoke all on table public.player_lobbies from public, anon, authenticated;

-- L'index du QUOTA, et il est aussi l'index de tête de `organization_id` que la
-- FK vers `organizations` n'aurait pas eu (`player_lobbies_org_unique` porte
-- `id` en tête). Les trois colonnes sont le filtre D'ACTIVITÉ de
-- `create_player_lobby` — celui qui coupe le gros du volume.
--
-- LES DEUX AUTRES TERMES DU PRÉDICAT NE SONT PAS DANS L'INDEX, et c'est
-- délibéré : « née depuis moins de dix minutes » (`created_at`) et « au moins
-- deux membres » (un `exists` sur `player_lobby_members`) s'évaluent sur ce
-- que l'index a déjà retenu — au plus quelques dizaines de lignes, puisque le
-- quota lui-même les borne à vingt. Une quatrième colonne coûterait sa
-- maintenance à chaque écriture pour trier un ensemble déjà trié par sa borne.
create index player_lobbies_org_actifs_idx
  on public.player_lobbies (organization_id, status, expires_at);

-- L'index de la PURGE. Elle balaie par date de mort et par elle seule ;
-- l'index ci-dessus, mené par l'organisation, ne l'aiderait pas.
create index player_lobbies_expires_idx
  on public.player_lobbies (expires_at);


-- ────────────────────────────────────────────────────────────
-- 2. `player_lobby_members` — qui attend là
-- ────────────────────────────────────────────────────────────

create table public.player_lobby_members (
  id uuid primary key default gen_random_uuid(),
  -- PAS de `references public.player_lobbies(id)` simple : la seule FK vers le
  -- lobby est la COMPOSITE ci-dessous. C'est le motif du dépôt
  -- (`fk_composites_couverture.test.sql`) : une FK simple entre deux tables
  -- tenant-scopées laisse le locataire à la garde du code applicatif, la
  -- composite le fait tenir par la base.
  lobby_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- SHA-256 du cookie PAR LOBBY (motif event_players). Jamais l'identité
  -- globale `lc-player` en clair : la base ne doit pas pouvoir recoudre les
  -- lobbies d'une même personne.
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Détouré puis borné 1..24, comme `event_players.pseudo`. Il s'affiche à tous
  -- les membres du lobby : c'est la seule donnée personnelle de ce fichier, et
  -- elle est saisie pour être vue.
  pseudo text not null
    check (pg_catalog.char_length(pg_catalog.btrim(pseudo)) between 1 and 24),
  -- `clock_timestamp()` et NON `now()`, seul écart assumé au motif du dépôt.
  -- Raison : `now()` rend l'instant de DÉBUT DE TRANSACTION, donc deux membres
  -- écrits dans la même transaction porteraient le MÊME `joined_at` — et le
  -- rang, qui est l'ordre d'arrivée, retomberait sur l'ordre arbitraire des
  -- uuid. L'hôte cesserait d'être le premier une fois sur deux, et les tests
  -- pgTAP (une seule transaction) ne verraient jamais de rang stable.
  joined_at timestamptz not null default pg_catalog.clock_timestamp(),
  -- UNE identité, UNE place. C'est cette contrainte qui rend `join` idempotent
  -- même si la RPC était contournée.
  unique (lobby_id, token_hash),
  foreign key (lobby_id, organization_id)
    references public.player_lobbies(id, organization_id) on delete cascade
);

comment on table public.player_lobby_members is
  'Les joueurs présents dans un lobby (L16). Une ligne = une empreinte de cookie '
  'PROPRE AU LOBBY et un pseudo affiché. La FK vers le lobby est COMPOSITE '
  '(lobby_id, organization_id) : le locataire tient par la base, pas par le code '
  'appelant. Cascade à la suppression du lobby, donc purge_expired_lobbies '
  'efface la session privée éphémère en même temps que la salle. RLS active et '
  'AUCUNE policy : service_role seul, par RPC.';
comment on column public.player_lobby_members.joined_at is
  'Ordre d''arrivée, et c''est LUI qui fait le rang. clock_timestamp() et non '
  'now() : deux membres écrits dans la même transaction doivent garder un ordre '
  'vrai, sans quoi le rang deviendrait l''ordre des uuid.';

alter table public.player_lobby_members enable row level security;

revoke all on table public.player_lobby_members from public, anon, authenticated;

-- Index de tête de `organization_id` (FK vers `organizations`). Le chemin par
-- `lobby_id` est déjà couvert par `unique (lobby_id, token_hash)`.
create index player_lobby_members_org_idx
  on public.player_lobby_members (organization_id);


-- ────────────────────────────────────────────────────────────
-- 3. Le code de partage — motif `event_sessions_set_join_code`
--
-- BEFORE INSERT SECURITY DEFINER : alphabet sans ambiguïté, douze tentatives
-- pour éviter une collision (la contrainte unique reste le filet). N'écrase pas
-- un code fourni — c'est ce qui rend les fixtures et le seed déterministes.
-- ────────────────────────────────────────────────────────────

create or replace function public.player_lobbies_set_join_code()
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
  if new.join_code is not null then
    return new;
  end if;
  for attempt in 1..12 loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || pg_catalog.substr(
        v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
    end loop;
    if not exists (select 1 from public.player_lobbies l where l.join_code = v_code) then
      new.join_code := v_code;
      return new;
    end if;
  end loop;
  raise exception 'lobby join code generation exhausted';
end;
$$;

revoke all on function public.player_lobbies_set_join_code()
  from public, anon, authenticated;

create trigger player_lobbies_set_join_code
  before insert on public.player_lobbies
  for each row execute function public.player_lobbies_set_join_code();


-- ────────────────────────────────────────────────────────────
-- 4. `player_lobby_rang` — LA formule du rang, écrite UNE FOIS
--
-- Motif `queue_entry_position` (20261005120000) : deux formules de rang
-- montreraient deux rangs différents de la même personne sur deux écrans
-- ouverts en même temps. Celle-ci est appelée par `join_player_lobby`, par
-- `lobby_state` et par `kick_player_lobby` — et par personne d'autre. Le
-- troisième est celui qui rend la propriété visible : l'hôte retire le rang
-- qu'il LIT dans `lobby_state`, donc les deux doivent être le même calcul, pas
-- deux calculs qui s'accordent.
--
-- Accordée à AUCUN rôle applicatif, `service_role` compris : elle n'a de sens
-- qu'à l'intérieur des RPC, qui l'exécutent avec les privilèges de leur
-- propriétaire.
-- ────────────────────────────────────────────────────────────

create or replace function public.player_lobby_rang(
  p_lobby_id uuid,
  p_joined_at timestamptz,
  p_member_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  -- Comparaison de N-uplets : `joined_at` d'abord, `id` en départage. Douze
  -- membres au maximum, donc le coût quadratique est celui d'une boucle de
  -- douze — et il achète une formule unique.
  select pg_catalog.count(*)::integer
    from public.player_lobby_members m
   where m.lobby_id = p_lobby_id
     and (m.joined_at, m.id) <= (p_joined_at, p_member_id);
$$;

revoke all on function public.player_lobby_rang(uuid, timestamptz, uuid)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 5. `create_player_lobby` — ouvrir une salle
--
-- CONTRAT :
--   {"state":"created","lobby_id":uuid,"join_code":text,"expires_at":timestamptz}
--   {"state":"quota"}        — 20 salles HABITÉES OU RÉCENTES déjà ouvertes ici
--   {"state":"unavailable"}  — organisation inconnue, OU sans le module vitrine,
--                              OU dont la vitrine n'est pas publiée
--
-- `unavailable` couvre les trois derniers cas d'un seul mot, et c'est délibéré :
-- distinguer « ce commerce n'existe pas » de « ce commerce n'a pas payé »
-- donnerait à un appelant public un oracle sur le carnet de commandes d'en
-- face. Les trois refus partagent d'ailleurs un seul `return`, plus bas : une
-- indistinction qui tient par la STRUCTURE ne se perd pas au prochain ajout.
--
-- POURQUOI LE MODULE `vitrine` : les lobbies sont les jeux de la Vitrine, et
-- ADR-109 §A1 a tranché un entitlement unique pour toute la Vitrine. Un
-- deuxième droit ne serait pas plus sûr, seulement plus long à vérifier.
--
-- POURQUOI AUSSI `published` : une vitrine non publiée n'a pas d'adresse
-- publique, donc ses jeux n'existent pour personne — ouvrir un lobby chez elle
-- reviendrait à faire fuir par une RPC ce que la page refuse d'afficher. C'est
-- la MÊME paire que `vitrine_public_state` (`published` ET le droit vivant), et
-- elle est tenue ICI, par la base : l'application la garde en doublon côté
-- appelant, tant mieux, mais un doublon applicatif n'est pas une garde — il
-- disparaît au premier appelant qui l'oublie.
-- ────────────────────────────────────────────────────────────

create or replace function public.create_player_lobby(
  p_organization_id uuid,
  p_kind text,
  p_capacite integer,
  p_creator_token_hash text,
  p_pseudo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacite integer;
  v_pseudo text;
  v_actifs integer;
  v_lobby public.player_lobbies%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Organisation ABSENTE = bogue de l'appelant, pas un refus métier : on le dit
  -- fort (motif `enter_reservation_queue`). Organisation PRÉSENTE MAIS SANS
  -- DROIT = refus métier muet, traité plus bas.
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_creator_token_hash is null
     or p_creator_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('duo', 'bande') then
    raise exception 'invalid lobby kind' using errcode = '22023';
  end if;

  -- LE PSEUDO EST REFUSÉ, PAS TRONQUÉ — et c'est l'inverse du choix fait pour
  -- la file d'attente. Raison : la personne en file est DEBOUT DANS LE MAGASIN
  -- et on ne lui fait pas payer un prénom de 41 caractères ; l'hôte d'un lobby
  -- est devant un clavier et peut corriger. Le `check` de la table dit la même
  -- chose, donc un refus ici est un refus lisible plutôt qu'une violation de
  -- contrainte remontée brute.
  v_pseudo := pg_catalog.btrim(coalesce(p_pseudo, ''));
  if pg_catalog.char_length(v_pseudo) < 1
     or pg_catalog.char_length(v_pseudo) > 24 then
    raise exception 'invalid pseudo' using errcode = '22023';
  end if;

  -- DUO NE NÉGOCIE PAS SA CAPACITÉ : le paramètre est ignoré, pas contesté. Le
  -- `check` de la table refuserait de toute façon un duo à trois, mais un refus
  -- de base n'est pas une réponse — et un Duo Miroir n'a jamais eu besoin qu'on
  -- lui demande combien il est.
  v_capacite := case when p_kind = 'duo' then 2 else p_capacite end;
  if v_capacite is null or v_capacite < 2 or v_capacite > 12 then
    raise exception 'invalid capacity' using errcode = '22023';
  end if;

  -- LE DROIT ET LA PUBLICATION DANS LE MÊME `if`, donc dans le MÊME `return` :
  -- « organisation inconnue », « pas le module » et « vitrine non publiée »
  -- rendent le même document parce qu'ils empruntent le même chemin, et non
  -- parce que trois branches se sont mises d'accord. La paire est celle de
  -- `vitrine_public_state` (20261011120000).
  if not public.org_has_module_access(p_organization_id, 'vitrine')
     or not exists (
       select 1
         from public.vitrine_settings s
        where s.organization_id = p_organization_id
          and s.published
     ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE VERROU D'ABORD, LE COMPTAGE ENSUITE — motif `enter_reservation_queue` :
  -- le plafond est lu dans le MÊME instantané que la décision de l'appliquer.
  -- Sans lui, vingt appels simultanés liraient tous « 19 actifs » et ouvriraient
  -- tous leur lobby : le quota d'ADR-109 §A4 n'existerait que sur le papier.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('player_lobby:' || p_organization_id::text, 0)
  );

  -- « Actif » = ni clos, ni mort. L'expiration se CONSTATE ici aussi (ADR-111) :
  -- un lobby dépassé cesse de peser sur le quota sans qu'aucun cron l'ait
  -- touché, donc une panne de purge ne bloque jamais un commerce.
  --
  -- ET « HABITÉ OU RÉCENT » (revue L16) — une salle réelle se remplit en
  -- minutes ; vingt salles vides d'une rafale cessent de peser à la fenêtre
  -- écoulée — le quota reste la seule garde de refus (ADR-109 §A4 amendé ce
  -- jour, garde 1 observatoire) mais il n'est plus son propre levier de déni.
  --
  -- Les trois branches, et ce que chacune rattrape :
  --   · `locked`   — une partie a commencé, elle occupe la place quoi qu'il
  --                  arrive, et son hôte ne repassera plus par ici ;
  --   · `created_at` récent — la salle qu'on vient d'ouvrir n'a pas encore eu
  --                  le temps de se remplir ; la lui compter est le seul moyen
  --                  qu'une rafale simultanée ne passe pas entre les gouttes ;
  --   · deux membres — quelqu'un est entré, donc la salle est vivante, quel que
  --                  soit son âge.
  -- Ce qui tombe, c'est exactement le reste : la salle ouverte il y a plus de
  -- dix minutes où personne n'est jamais venu.
  select pg_catalog.count(*)::integer into v_actifs
    from public.player_lobbies l
   where l.organization_id = p_organization_id
     and l.status in ('lobby', 'locked')
     and l.expires_at > pg_catalog.now()
     and (
       l.status = 'locked'
       or l.created_at > pg_catalog.now() - interval '10 minutes'
       -- `exists … offset 1` : « au moins DEUX membres », et le seuil est dans
       -- l'`exists` lui-même. Une jointure agrégée (`group by … having
       -- count(*) >= 2`) lirait TOUS les membres de TOUTES les salles de
       -- l'organisation pour une question à laquelle deux lignes répondent ;
       -- ici le parcours s'arrête à la seconde. L'hôte étant membre de son
       -- propre lobby dès sa création, « deux » veut bien dire « quelqu'un
       -- d'autre est venu ».
       or exists (
         select 1
           from public.player_lobby_members m
          where m.lobby_id = l.id
          offset 1
       )
     );

  if v_actifs >= 20 then
    return pg_catalog.jsonb_build_object('state', 'quota');
  end if;

  insert into public.player_lobbies
    (organization_id, kind, capacite, creator_token_hash, expires_at)
  values
    (p_organization_id, p_kind, v_capacite, p_creator_token_hash,
     pg_catalog.now() + interval '30 minutes')
  returning * into v_lobby;

  -- L'HÔTE EST MEMBRE DE SON PROPRE LOBBY, et c'est un invariant du modèle : un
  -- lobby sans membre n'a pas de rang 1, `lock_player_lobby` compterait faux, et
  -- l'hôte ne se verrait pas dans sa propre salle.
  insert into public.player_lobby_members
    (lobby_id, organization_id, token_hash, pseudo)
  values (v_lobby.id, p_organization_id, p_creator_token_hash, v_pseudo);

  return pg_catalog.jsonb_build_object(
    'state', 'created',
    'lobby_id', v_lobby.id,
    'join_code', v_lobby.join_code,
    'expires_at', v_lobby.expires_at
  );
end;
$$;

revoke all on function public.create_player_lobby(uuid, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.create_player_lobby(uuid, text, integer, text, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 6. `join_player_lobby` — entrer par le code
--
-- CONTRAT :
--   {"state":"joined","lobby_id":uuid,"kind":text,"capacite":int,"rang":int}
--   {"state":"unavailable"}  — code inventé, MALFORMÉ, expiré ou clos
--   {"state":"full"}         — capacité atteinte
--   {"state":"locked"}       — l'hôte a fermé la porte
--
-- AUCUNE ORGANISATION EN PARAMÈTRE, et ce n'est pas un oubli : `join_code` est
-- unique sur toute la table, donc il désigne son locataire à lui seul. Exiger
-- l'organisation obligerait l'écran public à la connaître avant d'avoir résolu
-- le code — c'est-à-dire à la deviner.
--
-- L'IDEMPOTENCE : rejouer le même (lobby, token_hash) tant que le lobby est
-- ouvert rend LE MÊME document, au caractère près. Le double-clic sur le bouton
-- « rejoindre » ne crée pas deux places.
-- ────────────────────────────────────────────────────────────

create or replace function public.join_player_lobby(
  p_join_code text,
  p_token_hash text,
  p_pseudo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_pseudo text;
  v_id uuid;
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
  v_member public.player_lobby_members%rowtype;
  v_membres integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  v_pseudo := pg_catalog.btrim(coalesce(p_pseudo, ''));
  if pg_catalog.char_length(v_pseudo) < 1
     or pg_catalog.char_length(v_pseudo) > 24 then
    raise exception 'invalid pseudo' using errcode = '22023';
  end if;

  -- UN CODE MALFORMÉ REND LE MÊME DOCUMENT QU'UN CODE INCONNU, il ne LÈVE PAS.
  -- Une exception ici serait un oracle de forme : elle apprendrait à qui sonde
  -- que « ZZZ » n'a jamais pu être un code alors que « ZZZZZZ » aurait pu.
  v_code := pg_catalog.upper(pg_catalog.btrim(coalesce(p_join_code, '')));
  if v_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LOCALISATION, JAMAIS DÉCISION. Cette lecture ne sert qu'à trouver la CLÉ du
  -- verrou : tout ce qui décide (statut, capacité, expiration) est relu après.
  select l.id, l.organization_id into v_id, v_org
    from public.player_lobbies l
   where l.join_code = v_code;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Verrou par ORGANISATION + LOBBY : deux entrées simultanées dans le même
  -- lobby se sérialisent, deux entrées dans des lobbies différents ne
  -- s'attendent pas. C'est ce verrou qui rend le comptage de capacité vrai.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || v_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = v_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- L'EXPIRATION EST CONSTATÉE ICI, À LA LECTURE (ADR-111). Aucune écriture :
  -- ce n'est pas au premier curieux de dater la mort du lobby.
  if v_lobby.status in ('closed', 'expired')
     or v_lobby.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  -- `locked` PASSE AVANT L'IDEMPOTENCE, délibérément : une fois la porte
  -- fermée, elle l'est pour tout le monde, y compris pour qui est déjà dedans.
  -- Un membre d'un lobby verrouillé lit son état par `lobby_state`, pas en
  -- frappant à une porte close.
  if v_lobby.status = 'locked' then
    return pg_catalog.jsonb_build_object('state', 'locked');
  end if;

  -- IDEMPOTENCE, ET ELLE PASSE AVANT LE COMPTAGE. Sous le verrou, donc deux
  -- appels simultanés de la MÊME identité n'insèrent pas deux lignes : le
  -- second attend et voit la première. L'index unique refuserait de toute
  -- façon la seconde, mais un refus de base n'est pas une réponse.
  select m.* into v_member
    from public.player_lobby_members m
   where m.lobby_id = v_lobby.id
     and m.token_hash = p_token_hash;

  if not found then
    select pg_catalog.count(*)::integer into v_membres
      from public.player_lobby_members m
     where m.lobby_id = v_lobby.id;
    if v_membres >= v_lobby.capacite then
      return pg_catalog.jsonb_build_object('state', 'full');
    end if;
    insert into public.player_lobby_members
      (lobby_id, organization_id, token_hash, pseudo)
    values (v_lobby.id, v_lobby.organization_id, p_token_hash, v_pseudo)
    returning * into v_member;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'joined',
    'lobby_id', v_lobby.id,
    'kind', v_lobby.kind,
    'capacite', v_lobby.capacite,
    'rang', public.player_lobby_rang(
              v_member.lobby_id, v_member.joined_at, v_member.id)
  );
end;
$$;

revoke all on function public.join_player_lobby(text, text, text)
  from public, anon, authenticated;
grant execute on function public.join_player_lobby(text, text, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 7. `lobby_state` — ce que voit quelqu'un qui est DEDANS
--
-- CONTRAT :
--   {"state":"ok","status":text,"kind":text,"capacite":int,
--    "expires_at":timestamptz,"join_code":text|null,
--    "membres":[{"pseudo":text,"rang":int,"est_moi":bool}]}
--   {"state":"unavailable"}  — lobby inconnu OU jeton non membre
--
-- L'APPARTENANCE EST EXIGÉE, et son absence rend le refus INDISTINCT de celui
-- d'un lobby inconnu. Sans cela, un identifiant de lobby volé suffirait à
-- lire les pseudos de gens qui n'ont rien demandé.
--
-- `join_code` N'EST RENDU QU'À L'HÔTE. Un membre ordinaire n'a pas à pouvoir
-- rameuter la ville dans un lobby qu'il n'a pas ouvert. La clé reste présente
-- avec la valeur `null` pour les autres : un document de forme stable se type
-- une fois côté application, là où une clé qui apparaît et disparaît se teste
-- à chaque lecture.
--
-- AUCUN HASH NE SORT. Les pseudos sortent — ils sont saisis pour être vus —
-- mais `token_hash` et `creator_token_hash` restent dans la base, sans quoi un
-- membre pourrait rejouer l'identité d'un autre.
-- ────────────────────────────────────────────────────────────

create or replace function public.lobby_state(
  p_lobby_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lobby public.player_lobbies%rowtype;
  v_est_hote boolean;
  v_statut text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  -- Identifiant absent : le même refus muet que tout le reste. Il n'y a rien à
  -- crier ici — contrairement à `create_player_lobby`, un `null` peut venir
  -- d'un cookie effacé plutôt que d'un bogue.
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if not exists (
    select 1 from public.player_lobby_members m
     where m.lobby_id = v_lobby.id
       and m.token_hash = p_token_hash
  ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_est_hote := v_lobby.creator_token_hash = p_token_hash;

  -- L'EXPIRATION EST AFFICHÉE, PAS ÉCRITE (ADR-111). `status` reste `lobby` ou
  -- `locked` en base ; c'est la lecture qui dit « expired ». Écrire ici
  -- daterait l'expiration du moment où quelqu'un a rouvert l'onglet.
  v_statut := case
    when v_lobby.status in ('lobby', 'locked')
         and v_lobby.expires_at <= pg_catalog.now() then 'expired'
    else v_lobby.status
  end;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'status', v_statut,
    'kind', v_lobby.kind,
    'capacite', v_lobby.capacite,
    'expires_at', v_lobby.expires_at,
    'join_code', case when v_est_hote then v_lobby.join_code else null end,
    'membres', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'pseudo', m.pseudo,
                 'rang', public.player_lobby_rang(
                           m.lobby_id, m.joined_at, m.id),
                 'est_moi', m.token_hash = p_token_hash)
               order by public.player_lobby_rang(
                          m.lobby_id, m.joined_at, m.id))
        from public.player_lobby_members m
       where m.lobby_id = v_lobby.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.lobby_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.lobby_state(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 8. `lock_player_lobby` — fermer la porte
--
-- CONTRAT :
--   {"state":"locked","expires_at":timestamptz}
--   {"state":"unavailable"}  — TOUT le reste
--
-- LE REFUS EST UN SEUL MOT, y compris pour « vous êtes encore seul ». C'est le
-- choix d'ADR-109 §A4 tel qu'il est arbitré pour ce lot, et il ne coûte rien à
-- l'écran : `lobby_state` rend déjà la liste des membres à l'hôte, donc
-- l'interface sait AVANT de cliquer qu'elle doit désactiver le bouton. Cette
-- RPC est le filet, pas le message.
--
-- LA PROLONGATION EST D'UNE HEURE, et c'était quatre. Ramenée à la contre-revue
-- L16, contrepartie du finding E-1 : le prédicat du quota ne peut pas être
-- durci utilement (voir l'en-tête), donc c'est la DURÉE du déni qu'on coupe. Une
-- partie de Duo Miroir ou de Portrait de la Bande dure quinze minutes — une
-- heure reste une marge de quatre parties, et une salle-squat verrouillée ne
-- tient plus le quota d'un commerce une demi-journée.
--
-- LA PROLONGATION EST BORNÉE DEUX FOIS : `least` la plafonne à
-- `created_at + 24 h`, et le `check` de la table refuserait le dépassement
-- même si ce `least` disparaissait un jour. La ceinture ET les bretelles,
-- parce que c'est la garde 3 d'ADR-109 §A4. Le `least` mord désormais dans une
-- fenêtre plus étroite — un lobby né il y a plus de VINGT-TROIS HEURES, contre
-- vingt à l'époque des quatre heures — mais il mord de la même façon, et le
-- pgTAP le prouve sur un lobby construit pour ça.
-- ────────────────────────────────────────────────────────────

create or replace function public.lock_player_lobby(
  p_lobby_id uuid,
  p_creator_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
  v_membres integer;
  v_expires timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_creator_token_hash is null
     or p_creator_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Localisation, jamais décision — même motif que `join_player_lobby`.
  select l.organization_id into v_org
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE MÊME VERROU QUE `join_player_lobby`, sur la MÊME clé : sans quoi un
  -- treizième joueur pourrait entrer entre le comptage et le verrouillage, et
  -- la partie démarrerait à une place de plus que ce que l'hôte a vu.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || p_lobby_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found
     or v_lobby.creator_token_hash <> p_creator_token_hash
     or v_lobby.status <> 'lobby'
     or v_lobby.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select pg_catalog.count(*)::integer into v_membres
    from public.player_lobby_members m
   where m.lobby_id = v_lobby.id;
  if v_membres < 2 then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- `least` NON qualifié : ce n'est pas une fonction du catalogue, la qualifier
  -- en `pg_catalog.` casserait à l'exécution (garde `npm run sql:check`).
  v_expires := least(
    pg_catalog.now() + interval '1 hour',
    v_lobby.created_at + interval '24 hours'
  );

  update public.player_lobbies l
     set status = 'locked',
         expires_at = v_expires
   where l.id = v_lobby.id;

  return pg_catalog.jsonb_build_object(
    'state', 'locked',
    'expires_at', v_expires
  );
end;
$$;

revoke all on function public.lock_player_lobby(uuid, text)
  from public, anon, authenticated;
grant execute on function public.lock_player_lobby(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 9. `leave_player_lobby` — partir de soi-même
--
-- CONTRAT :
--   {"state":"left"}    — vous n'êtes plus dedans (que vous y ayez été ou non)
--   {"state":"locked"}  — la partie a commencé, ce lot n'y touche pas
--
-- LE DOCUMENT NE DIT RIEN DE PLUS, et c'est ce qui le rend à la fois idempotent
-- et muet. Rendre « j'ai fermé le lobby » ferait diverger le premier appel du
-- second ; rendre le statut du lobby apprendrait à un non-membre ce qu'il n'a
-- pas le droit de savoir. Les membres RESTÉS voient la fermeture par
-- `lobby_state` — celui qui part, lui, n'a plus rien à voir.
--
-- L'HÔTE QUI PART FERME LA SALLE. Un lobby sans hôte n'attend personne : son
-- code resterait vivant, il pèserait sur le quota de l'organisation, et il
-- accueillerait des gens que plus personne ne peut faire jouer.
--
-- EN `locked`, LE DÉPART N'ÉCRIT RIEN DU TOUT. Retirer un membre d'une partie
-- commencée est une décision de L17 / L18 — eux savent ce qu'un joueur manquant
-- fait à un Duo Miroir ou à un Portrait de la Bande. Ce lot ne la prend pas à
-- leur place, et surtout ne la prend pas par défaut.
-- ────────────────────────────────────────────────────────────

create or replace function public.leave_player_lobby(
  p_lobby_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'left');
  end if;

  select l.organization_id into v_org
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'left');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || p_lobby_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'left');
  end if;

  -- L'APPARTENANCE EST TESTÉE AVANT LE STATUT, sans quoi un inconnu apprendrait
  -- par la différence entre `left` et `locked` qu'une partie est en cours ici.
  if not exists (
    select 1 from public.player_lobby_members m
     where m.lobby_id = v_lobby.id
       and m.token_hash = p_token_hash
  ) then
    return pg_catalog.jsonb_build_object('state', 'left');
  end if;

  if v_lobby.status = 'locked' then
    return pg_catalog.jsonb_build_object('state', 'locked');
  end if;

  delete from public.player_lobby_members m
   where m.lobby_id = v_lobby.id
     and m.token_hash = p_token_hash;

  if v_lobby.status = 'lobby'
     and v_lobby.creator_token_hash = p_token_hash then
    update public.player_lobbies l
       set status = 'closed'
     where l.id = v_lobby.id;
  end if;

  return pg_catalog.jsonb_build_object('state', 'left');
end;
$$;

revoke all on function public.leave_player_lobby(uuid, text)
  from public, anon, authenticated;
grant execute on function public.leave_player_lobby(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 10. `kick_player_lobby` — l'hôte retire une place
--
-- CONTRAT :
--   {"state":"ok","kicked":true}   — la place du rang demandé est libérée
--   {"state":"ok","kicked":false}  — ce rang n'est occupé par personne
--   {"state":"unavailable"}        — TOUT le reste
--
-- PAR RANG, ET NON PAR JETON. L'hôte voit `lobby_state`, qui lui rend des
-- pseudos et des rangs — jamais un `token_hash`, et c'est la propriété STATE-7 /
-- STATE-8 du lot. Lui demander un jeton pour retirer quelqu'un l'obligerait à
-- posséder ce que la base refuse précisément de lui donner. Le rang est ce qu'il
-- a sous les yeux, c'est donc ce que la RPC prend.
--
-- LE RANG SE RÉSOUT PAR `player_lobby_rang`, la formule UNIQUE (motif
-- `queue_entry_position`). Un `order by joined_at, id offset p_rang - 1` aurait
-- donné le même membre aujourd'hui et une SECONDE formule de rang à maintenir
-- demain : le jour où l'une des deux change, l'hôte retire quelqu'un d'autre que
-- celui qu'il a désigné à l'écran. Le coût quadratique est celui d'une boucle de
-- douze, et il achète l'impossibilité de cette divergence.
--
-- L'HÔTE SEUL, ET LE REFUS EST INDISTINCT. Un non-créateur reçoit exactement ce
-- que reçoit qui invente un identifiant de lobby : `unavailable`, sans un mot de
-- plus. Sans cela, un membre ordinaire apprendrait par la différence entre
-- « refusé » et « rang vide » qui est présent dans une salle où il n'a rien à
-- lire.
--
-- L'HÔTE NE SE RETIRE PAS LUI-MÊME. Ce serait un `leave` déguisé, qui laisserait
-- une salle sans hôte au lieu de la fermer — exactement l'état que
-- `leave_player_lobby` existe pour éviter. Le refus est le mot unique, comme
-- pour `lock_player_lobby` : l'interface, qui tient déjà la liste, n'affiche pas
-- le bouton sur la ligne de l'hôte ; cette RPC est le filet, pas le message.
--
-- EN `locked`, RIEN. Une partie commencée ne se re-négocie pas : qui joue est
-- fixé au verrouillage, et ce que devient une partie à qui il manque un joueur
-- est une décision de L17 / L18. Ce lot ne la prend pas à leur place.
--
-- L'IDEMPOTENCE EST UN `kicked:false`, PAS UN REFUS. Un clic sur une ligne dont
-- l'occupant venait de partir de lui-même, ou un rang au-delà de la liste,
-- rendent `{"state":"ok","kicked":false}` : l'état voulu par l'hôte est atteint,
-- il n'y a pas d'erreur à afficher. Distinguer ne coûte ici aucun oracle —
-- l'appelant est déjà prouvé hôte quand il lit cette réponse.
--
-- ── LE RANG SE DÉCALE, ET L'ÉCRAN DOIT LE RELIRE ──
--
-- Conséquence directe d'un rang qui est un ORDRE et non un identifiant : retirer
-- le rang 2 fait REMONTER l'ancien rang 3 à la place 2. Rejouer le même appel
-- ne re-retire donc pas la même personne — il retire CELLE QUI A PRIS SA PLACE.
-- Ce n'est pas un défaut d'idempotence, c'est ce que « retirer une place »
-- signifie ; mais l'appelant doit relire `lobby_state` entre deux retraits
-- plutôt que d'envoyer deux rangs lus sur la même liste. Écrit ici parce que
-- c'est la base qui crée la propriété, et que le code appelant est le seul
-- endroit où elle peut faire un dégât.
--
-- ── L'ARBITRAGE : C'EST UN RETRAIT DE PLACE, PAS UN BANNISSEMENT ──
--
-- La ligne du membre est SUPPRIMÉE, et rien d'autre n'est écrit. Deux
-- conséquences, toutes deux voulues :
--
--   · la personne retirée ne REVIENT PAS TOUTE SEULE : son cookie de lobby ne
--     la désigne plus comme membre, donc `lobby_state` lui rend `unavailable` et
--     rouvrir son onglet ne la remet pas dans la salle ;
--   · mais elle PEUT rejoindre à neuf, en refaisant le geste, tant que la salle
--     est ouverte et qu'il reste une place.
--
-- C'est délibéré. Empêcher le retour demanderait de garder une trace des
-- empreintes exclues — donc une table, donc une durée de vie et une purge pour
-- elle, donc une décision sur ce qu'est un bannissement et sur qui le lève.
-- C'est un autre lot, et il devra être décidé comme tel plutôt que tomber en
-- effet de bord d'un bouton « retirer ». Ce que ce lot livre est l'outil du cas
-- réel : récupérer une place prise par erreur, ou par quelqu'un qui s'est
-- trompé de salle. Contre un importun déterminé, l'hôte a `lock_player_lobby` —
-- porte fermée, et elle l'est pour tout le monde.
-- ────────────────────────────────────────────────────────────

create or replace function public.kick_player_lobby(
  p_lobby_id uuid,
  p_creator_token_hash text,
  p_rang integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
  v_member public.player_lobby_members%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_creator_token_hash is null
     or p_creator_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  -- Un rang INOCCUPÉ est une réponse (`kicked:false`, plus bas) ; un rang NUL ou
  -- absent est un bogue de l'appelant, et celui-là se dit fort — même partage
  -- que `p_organization_id` dans `create_player_lobby`.
  if p_rang is null or p_rang < 1 then
    raise exception 'invalid rank' using errcode = '22023';
  end if;
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Localisation, jamais décision — même motif que `join_player_lobby`.
  select l.organization_id into v_org
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE MÊME VERROU QUE `join_player_lobby` ET `lock_player_lobby`, sur la MÊME
  -- clé : sans lui, un joueur pourrait entrer entre la résolution du rang et la
  -- suppression, et l'hôte retirerait quelqu'un d'autre que celui qu'il a
  -- désigné — le rang est un ORDRE, il bouge quand la liste bouge.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || p_lobby_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  -- Les quatre refus d'un seul `return` : lobby disparu entre-temps, appelant
  -- qui n'est pas l'hôte, salle qui n'est plus en attente (`locked`, `closed`,
  -- `expired`), salle morte. Aucun ne se distingue des autres.
  if not found
     or v_lobby.creator_token_hash <> p_creator_token_hash
     or v_lobby.status <> 'lobby'
     or v_lobby.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select m.* into v_member
    from public.player_lobby_members m
   where m.lobby_id = v_lobby.id
     and public.player_lobby_rang(m.lobby_id, m.joined_at, m.id) = p_rang;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'ok', 'kicked', false);
  end if;

  -- L'HÔTE NE SE RETIRE PAS LUI-MÊME. Comparé sur le JETON et non sur « rang
  -- 1 » : le rang de l'hôte est 1 par construction aujourd'hui, mais s'appuyer
  -- dessus ferait dépendre une garde d'identité d'un ordre d'arrivée.
  if v_member.token_hash = v_lobby.creator_token_hash then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  delete from public.player_lobby_members m
   where m.id = v_member.id;

  return pg_catalog.jsonb_build_object('state', 'ok', 'kicked', true);
end;
$$;

revoke all on function public.kick_player_lobby(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.kick_player_lobby(uuid, text, integer)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 11. `purge_expired_lobbies` — effacer la session privée éphémère
--
-- CONTRAT : `bigint`, le nombre de lobbies effacés. Les membres partent en
-- CASCADE, donc la purge efface la salle ET les gens qui y étaient — c'est le
-- sens de « session privée éphémère » : elle ne survit pas au lobby.
--
-- LE SEUIL EST DATÉ AU DERNIER INSTANT CONNU, JAMAIS À `now()` (ADR-111). Un
-- lobby s'efface vingt-quatre heures après SA date de mort, pas vingt-quatre
-- heures après le passage du cron. Deux conséquences :
--
--   · un cron en retard de trois jours efface exactement ce qu'il aurait
--     effacé à l'heure, ni plus ni moins ;
--   · un lobby CLOS tôt (l'hôte est parti au bout de deux minutes) garde la
--     date de mort qu'il avait — donc il survit jusqu'à `created_at + 30 min
--     + 24 h`. C'est délibéré : `closed` et `expired` se datent du MÊME champ,
--     parce qu'il n'existe pas d'autre « dernier instant connu » d'un lobby.
--     Une colonne `closed_at` serait le seul moyen de faire mieux, et elle
--     ferait dépendre la purge d'une écriture supplémentaire qui peut manquer.
--
-- LE CÂBLAGE CRON EST AU BACKEND. Cette fonction ne se planifie pas elle-même :
-- elle est rendue à `service_role`, et c'est tout ce que la base a à en dire.
-- ────────────────────────────────────────────────────────────

create or replace function public.purge_expired_lobbies()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.player_lobbies l
   where l.expires_at < pg_catalog.now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_lobbies()
  from public, anon, authenticated;
grant execute on function public.purge_expired_lobbies()
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 12. `org_player_lobbies` — ce que le commerçant VOIT
--
-- CONTRAT :
--   {"lobbies":[{"id":uuid,"kind":text,"status":text,"membres":int,
--                "created_at":timestamptz,"expires_at":timestamptz}]}
--
-- Toujours un document, jamais un refus : une organisation inconnue et une
-- organisation sans salle vivante rendent le MÊME `{"lobbies":[]}`. Il n'y a
-- rien à distinguer — l'appelant est le serveur, qui connaît déjà l'organisation
-- dont il tient l'écran.
--
-- ── CE QUI EN SORT, ET SURTOUT CE QUI N'EN SORT PAS ──
--
-- AUCUN PSEUDO, AUCUN CODE DE PARTAGE, AUCUN `token_hash`. Le commerçant
-- SUPERVISE des salles ; il n'espionne pas ses clients. Ce qu'il lui faut pour
-- décider — combien de salles, depuis quand, avec combien de monde dedans, et
-- jusqu'à quand elles vivent — tient dans ces six clés. Un pseudo de plus ne
-- l'aiderait à rien décider, et rendrait l'écran capable de lire des
-- conversations de comptoir auxquelles il n'a pas été invité.
--
-- LE `join_code` EST L'OMISSION LA PLUS IMPORTANTE DES TROIS. Le rendre ferait
-- de cet écran un ANNUAIRE DE CODES : un compte marchand compromis, ou un
-- employé curieux, entrerait dans n'importe quelle salle de la maison sans
-- qu'aucun joueur l'ait invité. Le code n'appartient qu'à l'hôte (`lobby_state`
-- le tient déjà à cette règle, STATE-1 / STATE-2), et cette RPC-ci ne fabrique
-- pas la porte dérobée que l'autre refuse.
--
-- ── « ACTIVES » VEUT DIRE VIVANTES, PAS « COMPTÉES AU QUOTA » ──
--
-- Le prédicat est « ni close, ni morte » — et il est DÉLIBÉRÉMENT PLUS LARGE que
-- celui du quota. Une salle ouverte il y a une heure où personne n'est jamais
-- venu ne pèse pas sur le quota (elle a passé la fenêtre des dix minutes), mais
-- elle est EXACTEMENT ce que le commerçant veut voir et fermer : c'est la forme
-- d'une salle-squat. Un écran qui ne montrerait que ce que le quota compte
-- cacherait précisément ce contre quoi il existe.
--
-- L'expiration est CONSTATÉE ici comme partout (ADR-111) : une salle dépassée
-- disparaît de la liste sans qu'aucune ligne ait bougé, donc `status` n'a jamais
-- besoin de valoir « expired » dans ce document.
--
-- ── LA BORNE, ET SON DÉPARTAGE ──
--
-- Cinquante lignes au plus, les plus RÉCENTES d'abord. Cinquante et non vingt :
-- le quota ne compte que les salles habitées ou récentes, donc le nombre de
-- salles VIVANTES peut le dépasser franchement — et ce dépassement est
-- justement le symptôme qu'on veut rendre lisible.
--
-- Le départage par `id` n'est pas décoratif. `created_at` vaut `now()`, qui est
-- l'instant de DÉBUT DE TRANSACTION : toutes les salles nées d'une même
-- transaction — le seed, un pgTAP, une rafale groupée — portent la MÊME date à
-- la microseconde près. Une borne posée sur un ensemble non totalement ordonné
-- coupe dans un sous-ensemble arbitraire, et deux appels n'y voient pas les
-- mêmes lignes (motif `org_segment_emails`, 20260930120000).
--
-- ── L'APPARTENANCE DU COMMERÇANT EST APPLICATIVE, ET C'EST ASSUMÉ ──
--
-- Cette RPC ne prend PAS d'acteur : elle ne rend rien de personnel et n'écrit
-- rien, donc exiger un `p_actor` ici aurait coûté une vérification par
-- rafraîchissement d'écran pour garder six chiffres. La garde qui compte est
-- celle de l'ÉCRITURE, et elle est en SQL — voir §13. Motif `set_vitrine_slug` :
-- ce qui engage se vérifie dans la base, ce qui affiche se garde au-dessus.
-- ────────────────────────────────────────────────────────────

create or replace function public.org_player_lobbies(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lobbies jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'id', s.id,
               'kind', s.kind,
               'status', s.status,
               'membres', s.membres,
               'created_at', s.created_at,
               'expires_at', s.expires_at)
             order by s.created_at desc, s.id),
           '[]'::jsonb)
    into v_lobbies
    from (
      select l.id,
             l.kind,
             l.status,
             l.created_at,
             l.expires_at,
             (select pg_catalog.count(*)::integer
                from public.player_lobby_members m
               where m.lobby_id = l.id) as membres
        from public.player_lobbies l
       where l.organization_id = p_organization_id
         and l.status in ('lobby', 'locked')
         and l.expires_at > pg_catalog.now()
       order by l.created_at desc, l.id
       limit 50
    ) s;

  return pg_catalog.jsonb_build_object('lobbies', v_lobbies);
end;
$$;

comment on function public.org_player_lobbies(uuid) is
  'Les salles de jeu VIVANTES d''une organisation, pour l''écran de supervision '
  'du commerçant (contrepartie du finding E-1 : rendre le déni VISIBLE). Rend '
  '{"lobbies":[{id, kind, status, membres, created_at, expires_at}]} — SIX clés '
  'et pas une de plus. AUCUN pseudo, AUCUN join_code, AUCUN token_hash : le '
  'commerçant supervise des salles, il n''espionne pas ses clients, et rendre le '
  'code de partage ferait de cet écran un ANNUAIRE DE CODES ouvrant toutes les '
  'salles de la maison. « Vivante » = ni close ni morte, volontairement PLUS '
  'LARGE que le prédicat du quota : la salle vide et vieille ne compte pas au '
  'quota mais c''est justement la forme d''une salle-squat, et c''est elle qu''on '
  'veut voir. Bornée à 50, plus récentes d''abord, départage par id parce que '
  'now() est constant dans une transaction (motif org_segment_emails). '
  'Organisation inconnue et organisation sans salle rendent le même document '
  'vide. Rendue à service_role ; l''appartenance du commerçant est APPLICATIVE '
  '(lecture sans donnée personnelle), celle de l''écriture est en SQL — voir '
  'close_player_lobby_as_org.';

revoke all on function public.org_player_lobbies(uuid)
  from public, anon, authenticated;
grant execute on function public.org_player_lobbies(uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 13. `close_player_lobby_as_org` — le commerçant reprend sa place
--
-- CONTRAT :
--   {"state":"ok","closed":true}   — la salle était vivante, elle ne l'est plus
--   {"state":"ok","closed":false}  — il n'y avait rien à fermer
--   42501                          — TOUT le reste, et d'un seul mot
--
-- C'EST CE GESTE QUI REND LE DÉNI RÉVERSIBLE. Sans lui, vingt salles-squat
-- tiennent le quota d'un commerce jusqu'à l'expiration ; avec lui, elles se
-- ferment en vingt clics, et chaque fermeture rend IMMÉDIATEMENT sa place —
-- `status = 'closed'` sort la salle du prédicat de `create_player_lobby` à
-- l'instant même, sans attendre aucun cron.
--
-- ── LE 42501 EST INDISTINCT, ET IL COUVRE QUATRE CHOSES ──
--
-- Acteur absent, acteur qui n'est pas `owner|editor`, salle inconnue, salle
-- d'une AUTRE organisation : un seul et même refus, sans corps. Distinguer la
-- troisième de la quatrième donnerait à n'importe quel commerçant un oracle
-- d'existence sur les identifiants de salles de ses voisins — c'est-à-dire un
-- compteur d'activité du commerce d'en face, une requête à la fois.
--
-- ── L'ACTEUR EST VÉRIFIÉ EN SQL (motif `set_vitrine_slug`) ──
--
-- `owner|editor`, pas le caissier : fermer une salle interrompt des gens qui
-- jouent, ce n'est pas un geste de comptoir. Et surtout, la vérification est
-- DANS LA BASE parce que le geste est JOURNALISÉ : un `p_actor` accepté sur
-- parole ferait de la ligne d'audit une déclaration sur l'honneur, et « qui a
-- fermé la salle de mes clients » est exactement la question qu'on se pose après
-- coup.
--
-- ── EN `locked` AUSSI, ET C'EST LE CŒUR DU GESTE ──
--
-- Les autres RPC de ce fichier refusent d'écrire sur une salle verrouillée : une
-- partie commencée ne se re-négocie pas entre joueurs. Celle-ci le peut, et il
-- FAUT qu'elle le puisse — l'attaque démontrée à la contre-revue est précisément
-- `create` + entrée avec son propre code + `lock`, donc une salle VERROUILLÉE.
-- Une fermeture qui s'arrêterait à `lobby` raterait exactement le cas pour lequel
-- elle est écrite. Ce n'est pas la même décision que celle refusée à L17/L18 :
-- eux arbitrent entre joueurs d'une même partie, le commerçant arbitre chez lui.
-- Les joueurs le constatent par `lobby_state`, qui rend `closed` sans qu'aucun
-- état nouveau ait eu à exister.
--
-- ── LA DATE DE MORT RECULE, ELLE N'AVANCE JAMAIS (ADR-111) ──
--
-- `expires_at` est ramené à l'instant de la fermeture, pour que la purge date la
-- salle de son DERNIER INSTANT CONNU au lieu de la garder vingt-quatre heures
-- après une date de mort qui n'a plus de sens. Deux précautions, chacune pour un
-- vrai cas :
--
--   · `clock_timestamp()` et non `now()` — `now()` rend l'instant de début de
--     transaction, donc une salle CRÉÉE PUIS FERMÉE dans la même transaction
--     (un seed, un pgTAP) recevrait `expires_at = created_at` et violerait
--     `player_lobbies_ttl_borne` (`expires_at > created_at`). Même écart, même
--     raison que `player_lobby_members.joined_at`.
--   · `least(…, v_lobby.expires_at)` — fermer ne PROLONGE jamais. Sans cette
--     borne, une transaction restée ouverte des heures pourrait repousser la
--     date de mort au-delà de ce qu'elle était, et jusqu'à franchir le plafond
--     des vingt-quatre heures.
--
-- ── L'IDEMPOTENCE N'ÉCRIT RIEN, ET NE JOURNALISE RIEN ──
--
-- Une salle déjà close, déjà `expired`, ou simplement morte, rend
-- `{"state":"ok","closed":false}` SANS TOUCHER À LA LIGNE. Réécrire `expires_at`
-- sur un cadavre REPOUSSERAIT sa purge — l'exact contraire de ce que le champ
-- signifie. Et un journal qui compte les non-gestes devient illisible quand on
-- en a besoin (motif `set_vitrine_slug` : réenregistrer la même adresse ne
-- journalise rien).
--
-- ── LE DROIT `vitrine` N'EST PAS EXIGÉ, DÉLIBÉRÉMENT ──
--
-- Ouvrir une salle demande le module et une vitrine publiée ; en fermer une n'a
-- rien à demander. Un commerçant dont l'offre vient d'expirer doit pouvoir
-- fermer les salles ouvertes la veille — subordonner un geste DÉFENSIF à un
-- abonnement vivant, c'est le retirer exactement quand il sert.
-- ────────────────────────────────────────────────────────────

create or replace function public.close_player_lobby_as_org(
  p_organization_id uuid,
  p_lobby_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
  v_membres integer;
  v_expires timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Paramètre ABSENT = bogue de l'appelant, et il se dit fort (motif
  -- `delete_vitrine_translation`). Un `null` n'est l'identifiant de personne :
  -- le crier n'apprend rien à qui sonde.
  if p_organization_id is null or p_lobby_id is null then
    raise exception 'organization and lobby required' using errcode = '22023';
  end if;

  -- ── L'ACTEUR D'ABORD, LA SALLE ENSUITE ──────────────────────
  --
  -- L'ordre compte : un non-membre ne doit rien apprendre de l'existence de la
  -- salle qu'il désigne, pas même par la forme du chemin parcouru. Les deux
  -- refus rendent de toute façon le même 42501 sans corps.
  if p_actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = p_actor
       and om.role in ('owner', 'editor')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Localisation, jamais décision — même motif que `join_player_lobby`. La
  -- salle d'un AUTRE locataire emprunte le même `raise` que la salle inconnue.
  select l.organization_id into v_org
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found or v_org <> p_organization_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- LE MÊME VERROU QUE `join` / `lock` / `kick`, sur la MÊME clé : une
  -- fermeture qui croiserait une entrée laisserait un membre dans une salle
  -- close, et le comptage journalisé ci-dessous serait faux d'une personne.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || p_lobby_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- RIEN À FERMER : déjà close, déjà `expired`, ou morte. Aucune écriture,
  -- aucune ligne de journal — voir l'en-tête.
  if v_lobby.status not in ('lobby', 'locked')
     or v_lobby.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('state', 'ok', 'closed', false);
  end if;

  select pg_catalog.count(*)::integer into v_membres
    from public.player_lobby_members m
   where m.lobby_id = v_lobby.id;

  -- `least` NON qualifié : ce n'est pas une fonction du catalogue, la qualifier
  -- en `pg_catalog.` casserait à l'exécution (garde `npm run sql:check`).
  v_expires := least(pg_catalog.clock_timestamp(), v_lobby.expires_at);

  update public.player_lobbies l
     set status = 'closed',
         expires_at = v_expires
   where l.id = v_lobby.id;

  -- LE JOURNAL PORTE LE GESTE, PAS LES GENS. `membres` est un NOMBRE : il dit
  -- si la salle fermée était habitée — ce qui distingue le ménage d'une
  -- salle-squat de l'interruption de vrais clients — sans nommer personne. Ni
  -- pseudo, ni code de partage, ni empreinte de jeton : ce que §12 refuse de
  -- montrer à l'écran, le journal ne le grave pas non plus.
  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor::text, 'lobby.closed_by_org',
          pg_catalog.jsonb_build_object(
            'lobby_id', v_lobby.id,
            'statut_avant', v_lobby.status,
            'membres', v_membres));

  return pg_catalog.jsonb_build_object('state', 'ok', 'closed', true);
end;
$$;

comment on function public.close_player_lobby_as_org(uuid, uuid, uuid) is
  'Le commerçant ferme une salle de SON organisation (contrepartie du finding '
  'E-1 : rendre le déni RÉVERSIBLE). status → closed et expires_at ramené à '
  'l''instant de la fermeture, pour que la purge date la salle de son DERNIER '
  'INSTANT CONNU (ADR-111) ; clock_timestamp() borné par least à l''ancienne '
  'date de mort — fermer ne prolonge jamais, et une salle créée puis fermée dans '
  'la même transaction ne viole pas expires_at > created_at. Acteur vérifié EN '
  'SQL membre owner/editor (pas le caissier : fermer interrompt des gens qui '
  'jouent), motif set_vitrine_slug — la vérification est dans la base parce que '
  'le geste est JOURNALISÉ (lobby.closed_by_org). Acteur absent, acteur non '
  'habilité, salle inconnue et salle d''un AUTRE locataire rendent le MÊME 42501 '
  'sans corps : sinon un commerçant compterait l''activité de ses voisins une '
  'requête à la fois. FERME AUSSI UNE SALLE VERROUILLÉE, contrairement à '
  'kick/leave : l''attaque démontrée est create + auto-entrée + lock, donc '
  's''arrêter à « lobby » raterait le seul cas pour lequel cette RPC existe. '
  'Idempotente : salle déjà close ou morte → {"state":"ok","closed":false}, '
  'AUCUNE écriture et AUCUNE ligne de journal. N''exige PAS le droit vitrine — '
  'un geste défensif ne se retire pas au commerçant le jour où son offre '
  'expire. Rendue à service_role.';

revoke all on function public.close_player_lobby_as_org(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.close_player_lobby_as_org(uuid, uuid, uuid)
  to service_role;
