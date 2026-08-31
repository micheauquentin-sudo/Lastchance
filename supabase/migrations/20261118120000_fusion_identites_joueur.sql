-- ============================================================
-- LastChance — Fusion de deux identités joueur (ID-4)
-- ============================================================
-- Dernière maille du filet posé avant la bascule vers une identité de joueur
-- COMMUNE au passeport, au jackpot, au calendrier et aux pronostics.
--
-- ── LE TROU QU'ON FERME ──
--
-- Deux `public.players` peuvent naître pour la même personne : deux
-- navigateurs, un cookie effacé, une rotation de jeton mal rattrapée. Rien ne
-- permettait de les rapprocher — pire, la base l'INTERDISAIT :
-- `resolve_player_identity` (20260805140000:517-520) lève
-- « legacy identity is linked to another player » (23505) dès qu'une empreinte
-- historique déjà pontée réapparaît sous un autre joueur. Sans fusion, la
-- bascule était donc irréversible : un client scindé en deux le restait, ses
-- points d'un côté et ses réservations de l'autre.
--
-- Ce fichier livre L'OUTIL, pas la politique. Aucun appel automatique, aucun
-- déclencheur : personne ne décide ici QUAND deux identités n'en font qu'une.
--
-- ── QUI SURVIT : LE PREMIER ARGUMENT, TOUJOURS ──
--
-- `merge_player_identities(A, B)` verse B dans A. Le sens n'est pas commutatif
-- et il n'est pas déduit : ni « le plus ancien », ni « celui qui a le plus de
-- données ». Les paramètres s'appellent `p_surviving_player_id` et
-- `p_absorbed_player_id` pour que la signature elle-même porte la direction —
-- une règle implicite « le plus ancien gagne » contredirait silencieusement un
-- appelant qui, lui, sait laquelle des deux identités est la bonne (celle qui
-- tient la session active, par exemple). La fonction rend l'identifiant du
-- survivant.
--
-- ── L'ADHÉSION EN CONFLIT : ON FOND, ON N'EMPILE PAS ──
--
-- Le cas courant n'est pas l'exception : si deux joueurs ont une adhésion à la
-- MÊME expérience, c'est justement ce qui révèle qu'ils sont une seule
-- personne. `player_experience_memberships` porte un unique
-- (organization_id, experience_kind, experience_id, player_id) : il n'y a donc
-- pas de seconde ligne à insérer, il y a DEUX lignes à n'en faire qu'une.
--   · `first_seen_at` → la plus ANCIENNE des deux (`least`) ;
--   · `last_seen_at`  → la plus RÉCENTE des deux (`greatest`) ;
--   · `acquisition_source` → celle du survivant, SAUF si elle vaut `unknown`.
--     C'est exactement la règle de `resolve_player_identity` : `direct` est
--     COLLANT et n'est remplacé que depuis `unknown` (voir le commentaire de
--     `bridgeOfferedSpinToCampaign`, src/lib/player-identity.ts). Une fusion
--     qui écraserait un `qr` déjà mesuré fausserait l'attribution
--     d'acquisition du commerçant ;
--   · `acquisition_qr_code_id` → `coalesce(survivant, absorbé)`.
-- Le même traitement (`least`/`greatest`) s'applique aux adhésions
-- d'organisation. Toutes les adhésions passent par le MÊME chemin d'upsert :
-- le cas « le survivant en avait déjà une » et le cas « il n'en avait pas » ne
-- sont pas deux branches, ce qui supprime la moitié des états à relire.
--
-- ── L'ORDRE D'ÉCRITURE, ET POURQUOI IL SE PAIE ──
--
-- 20260805230000:17-29 raconte le défaut déjà payé une fois :
-- `resolve_player_identity` insère l'adhésion AVANT le pont legacy parce que
-- la FK composite l'impose, et un trigger qui lisait le pont trop tôt a fait
-- que « le tout premier tour de roue d'un joueur neuf ne faisait progresser
-- aucune mission ». Cette fusion déplace exactement ces lignes-là. L'ordre
-- retenu, et ce qu'il évite :
--
--   1. adhésions d'ORGANISATION d'abord. `track_player_experience_membership`
--      (déclenché à l'étape 2) cherche `player_organization_memberships` du
--      survivant et RETOURNE SANS RIEN FAIRE s'il ne la trouve pas — c'est
--      littéralement la forme du défaut de 20260805230000. Idem pour
--      `apply_meta_progression_event`, qui abandonne sur
--      `v_membership_id is null`. Inverser 1 et 2 rendrait la fusion
--      silencieusement incomplète.
--   2. adhésions d'EXPÉRIENCE ensuite : elles pointent la ligne d'organisation
--      par FK composite (id, player_id, organization_id).
--   3. ponts legacy et alias APRÈS : leur FK composite pointe l'adhésion
--      d'expérience du survivant, qui doit donc déjà exister.
--   4. méta-progression : la saison avant ses enfants (missions, badges,
--      objets, coffres), qui la référencent par
--      (player_season_id, player_id, organization_id, season_id).
--   5. les lignes de l'absorbé ne sont SUPPRIMÉES qu'en dernier, et seulement
--      celles effectivement reprises : tant qu'un enfant n'a pas été déplacé,
--      supprimer le parent le détruirait par cascade.
--
-- ── CE QU'ON NE DÉPLACE PAS, ET POURQUOI ──
--
-- · Les `player_id` qui ne désignent PAS l'identité globale restent en place :
--   `calendar_openings`, `calendar_rewards` (→ calendar_players),
--   `contest_awards`, `contest_final_standings`, `contest_league_members`,
--   `contest_predictions`, `contest_recovery_tokens` (→ contest_players),
--   `event_answers` (→ event_players), `hunt_completions`, `hunt_scans`
--   (→ hunt_players), `quiz_answers`, `quiz_rewards` (→ quiz_players). Ces
--   modules s'identifient par le hash de LEUR cookie — le même que
--   `player_legacy_identities.legacy_identity_hash`. Déplacer le pont legacy
--   suffit donc à réunir leur progression : c'est le mécanisme, pas un oubli.
-- · Le module Bande ne porte aucun `player_id` (vérifié :
--   `bande_votes.voter_token_hash`, `bande_votes.cible_member_id`) et refuse
--   l'identité globale EXPRÈS (src/actions/bande.ts:38-50). Rien à y faire.
-- · Les `experience_events` ORPHELINS (`player_id is null`) ne sont pas
--   rattachés ici. Leur rattrapage passe déjà par le pont legacy, qui vient
--   d'être déplacé : ils reviendront au SURVIVANT à la prochaine résolution.
--   Les rattacher ici déclencherait `apply_meta_progression_event` sur la
--   transition null → non-null, c'est-à-dire une attribution de progression
--   décidée par une fusion. Ce lot ne décide pas de politique.
--
-- ── L'ABSORBÉ N'EST PAS SUPPRIMÉ ──
--
-- Sa ligne `public.players` reste, marquée `status = 'merged'` avec
-- `merged_into_player_id` et `merged_at`. Trois raisons :
--   · une fusion erronée doit rester DIAGNOSTICABLE — sans la ligne, plus rien
--     ne dit que cette identité a existé ni où elle est passée ;
--   · `lookup_player_identity` exige `status = 'active'` : le marquage rend
--     l'absorbé inerte même si une ligne oubliée le désignait encore ;
--   · il n'existe AUCUNE purge de `public.players` sur ce projet
--     (20260903120000:113 le rappelle). On n'en invente pas une ici.
--
-- ── LE CONSENTEMENT NE SE TRANSFÈRE PAS ──
--
-- `players_nominal_link_requires_consent` (20260805140000:32-41) exige une
-- version ET une date de consentement dès que `auth_user_id` est posé. Si les
-- DEUX identités portent un lien nominatif, la fusion est REFUSÉE : `players`
-- porte un unique sur `auth_user_id`, il faudrait donc élire le consentement
-- d'une personne pour représenter l'identité fusionnée. Aucune API ne remplit
-- ce champ aujourd'hui ; le refus est là pour le jour où ce sera le cas. Quand
-- une seule des deux le porte, il ne bouge pas : il reste sur sa ligne
-- d'origine, conservée. Reporter le lien sur l'autre identité est une décision
-- explicite, pas un effet de bord de fusion.
--
-- ── EFFET DE BORD ASSUMÉ ──
--
-- Reprendre une adhésion d'expérience déclenche
-- `player_experience_memberships_analytics` (AFTER INSERT OR UPDATE OF
-- last_seen_at), donc un `experience_viewed` par adhésion déplacée. Il n'est
-- pas supprimable : neutraliser les triggers utilisateurs
-- (`session_replication_role = 'replica'`) neutraliserait AUSSI les triggers
-- d'intégrité référentielle `RI_FKey_*`, c'est-à-dire les FK composites qui
-- tiennent tout ce fichier. Un événement de vue par adhésion reprise, sur une
-- opération d'administration rare, est un prix inférieur à une fusion qui
-- écrirait sans contrôle d'intégrité.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Marquage de l'identité absorbée
-- ────────────────────────────────────────────────────────────

alter table public.players
  add column if not exists merged_into_player_id uuid
    references public.players(id) on delete set null,
  add column if not exists merged_at timestamptz;

comment on column public.players.merged_into_player_id is
  'Identité survivante quand cette ligne a été versée dans une autre par merge_player_identities. Jamais purgée : une fusion erronée doit rester diagnosticable.';
comment on column public.players.merged_at is
  'Horodatage de la fusion qui a absorbé cette identité.';

-- `status` accepte désormais `merged`. La contrainte est reconstruite plutôt
-- qu'ajoutée à côté : deux CHECK concurrents sur la même colonne laisseraient
-- le plus strict décider, et le nouvel état serait rejeté sans que rien ne
-- désigne le coupable.
alter table public.players
  drop constraint if exists players_status_check;
alter table public.players
  add constraint players_status_check
  check (status in ('active', 'blocked', 'merged'));

-- Cohérence du marquage : les trois colonnes bougent ensemble, et une identité
-- ne peut pas être versée dans elle-même.
alter table public.players
  drop constraint if exists players_merge_marking_is_coherent;
alter table public.players
  add constraint players_merge_marking_is_coherent check (
    (merged_into_player_id is null and merged_at is null and status <> 'merged')
    or (
      merged_into_player_id is not null
      and merged_at is not null
      and status = 'merged'
      and merged_into_player_id <> id
    )
  );

-- Partiel : la population fusionnée reste marginale, et c'est la seule que ce
-- prédicat interroge (« où est passée cette identité », « qui a absorbé qui »).
create index if not exists players_merged_into_idx
  on public.players (merged_into_player_id)
  where merged_into_player_id is not null;

-- ────────────────────────────────────────────────────────────
-- 2. La fusion
-- ────────────────────────────────────────────────────────────

create or replace function public.merge_player_identities(
  p_surviving_player_id uuid,
  p_absorbed_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_survivor uuid := p_surviving_player_id;
  v_absorbed uuid := p_absorbed_player_id;
  v_survivor_found boolean := false;
  v_absorbed_found boolean := false;
  v_survivor_status text;
  v_absorbed_status text;
  v_survivor_merged_into uuid;
  v_absorbed_merged_into uuid;
  v_survivor_auth uuid;
  v_absorbed_auth uuid;
  v_absorbed_last_seen_at timestamptz;
begin
  if v_survivor is null or v_absorbed is null then
    raise exception 'player merge requires two identities' using errcode = '22023';
  end if;

  -- Fusionner un joueur avec lui-même est un NON-ÉVÉNEMENT, pas une erreur :
  -- un appelant qui découvre après coup que les deux empreintes désignaient
  -- déjà la même identité ne doit pas avoir à s'en prémunir.
  if v_survivor = v_absorbed then
    perform 1 from public.players p where p.id = v_survivor;
    if not found then
      raise exception 'unknown player identity' using errcode = '22023';
    end if;
    return v_survivor;
  end if;

  -- Verrous pris dans l'ordre des uuid, comme `rotate_player_device` les prend
  -- dans l'ordre lexical des hashes : deux fusions croisées (A←B et B←A)
  -- lancées en même temps s'attendraient au lieu de s'interbloquer.
  if v_survivor < v_absorbed then
    select p.status, p.merged_into_player_id, p.auth_user_id
      into v_survivor_status, v_survivor_merged_into, v_survivor_auth
      from public.players p where p.id = v_survivor for update;
    v_survivor_found := found;
    select p.status, p.merged_into_player_id, p.auth_user_id, p.last_seen_at
      into v_absorbed_status, v_absorbed_merged_into, v_absorbed_auth,
           v_absorbed_last_seen_at
      from public.players p where p.id = v_absorbed for update;
    v_absorbed_found := found;
  else
    select p.status, p.merged_into_player_id, p.auth_user_id, p.last_seen_at
      into v_absorbed_status, v_absorbed_merged_into, v_absorbed_auth,
           v_absorbed_last_seen_at
      from public.players p where p.id = v_absorbed for update;
    v_absorbed_found := found;
    select p.status, p.merged_into_player_id, p.auth_user_id
      into v_survivor_status, v_survivor_merged_into, v_survivor_auth
      from public.players p where p.id = v_survivor for update;
    v_survivor_found := found;
  end if;

  if not v_survivor_found or not v_absorbed_found then
    raise exception 'unknown player identity' using errcode = '22023';
  end if;

  -- IDEMPOTENCE. Rejouer exactement la même fusion ne doit rien casser ni rien
  -- dupliquer : le marquage de l'étape 10 rend le second passage observable, et
  -- on sort avant d'écrire quoi que ce soit.
  if v_absorbed_merged_into = v_survivor then
    return v_survivor;
  end if;
  if v_absorbed_merged_into is not null then
    raise exception 'absorbed player identity is already merged into another player'
      using errcode = '23505';
  end if;
  if v_survivor_merged_into is not null then
    raise exception 'surviving player identity has itself been merged'
      using errcode = '23505';
  end if;

  -- Un consentement ne se transfère pas (voir l'en-tête).
  if v_survivor_auth is not null and v_absorbed_auth is not null then
    raise exception 'cannot merge two nominal player identities'
      using errcode = '42501';
  end if;

  -- Un joueur bloqué ne se blanchit pas en se versant dans un joueur actif.
  if v_survivor_status <> 'active' or v_absorbed_status <> 'active' then
    raise exception 'player identity is not active' using errcode = '42501';
  end if;

  -- ── 1. Adhésions d'organisation ──
  -- D'ABORD, parce que les triggers déclenchés à l'étape 2 la cherchent.
  insert into public.player_organization_memberships (
    player_id, organization_id, first_seen_at, last_seen_at
  )
  select v_survivor, m.organization_id, m.first_seen_at, m.last_seen_at
    from public.player_organization_memberships m
   where m.player_id = v_absorbed
  on conflict (player_id, organization_id) do update set
    first_seen_at = least(
      player_organization_memberships.first_seen_at, excluded.first_seen_at
    ),
    last_seen_at = greatest(
      player_organization_memberships.last_seen_at, excluded.last_seen_at
    );

  -- ── 2. Adhésions d'expérience ──
  -- `player_experience_scope_is_valid` filtre les adhésions dont l'expérience
  -- n'existe plus : `experience_id` est polymorphe et sans FK, une campagne
  -- supprimée laisse donc une adhésion orpheline que le trigger de portée
  -- (`player_experience_memberships_scope_guard`) REFUSERAIT de réinsérer.
  -- Sans ce filtre, une fusion parfaitement légitime échouerait sur une donnée
  -- morte. Ces lignes-là restent sur l'absorbé, qui est conservé.
  insert into public.player_experience_memberships (
    organization_membership_id, player_id, organization_id,
    experience_kind, experience_id,
    acquisition_source, acquisition_qr_code_id,
    first_seen_at, last_seen_at
  )
  select
    som.id, v_survivor, e.organization_id,
    e.experience_kind, e.experience_id,
    e.acquisition_source, e.acquisition_qr_code_id,
    e.first_seen_at, e.last_seen_at
    from public.player_experience_memberships e
    join public.player_organization_memberships som
      on som.player_id = v_survivor
     and som.organization_id = e.organization_id
   where e.player_id = v_absorbed
     and public.player_experience_scope_is_valid(
       e.experience_kind, e.experience_id, e.organization_id
     )
  on conflict (organization_id, experience_kind, experience_id, player_id)
  do update set
    first_seen_at = least(
      player_experience_memberships.first_seen_at, excluded.first_seen_at
    ),
    last_seen_at = greatest(
      player_experience_memberships.last_seen_at, excluded.last_seen_at
    ),
    acquisition_source = case
      when player_experience_memberships.acquisition_source = 'unknown'
        then excluded.acquisition_source
      else player_experience_memberships.acquisition_source
    end,
    acquisition_qr_code_id = coalesce(
      player_experience_memberships.acquisition_qr_code_id,
      excluded.acquisition_qr_code_id
    );

  -- ── 3. Ponts legacy ──
  -- C'EST LA LIGNE QUI FAIT TOUT LE TRAVAIL. Une fois l'empreinte historique
  -- rattachée à l'adhésion du SURVIVANT, `resolve_player_identity` la retrouve
  -- sous lui et ne lève plus « legacy identity is linked to another player ».
  -- `experience_membership_id` et `player_id` changent dans LA MÊME
  -- instruction : la FK composite n'est vérifiée qu'en fin d'instruction, un
  -- déplacement en deux temps serait donc rejeté.
  -- Aucun conflit possible sur l'unique
  -- (organization_id, experience_kind, experience_id, legacy_identity_hash) :
  -- une empreinte n'est pontée qu'une fois par expérience, c'est précisément ce
  -- que cet unique garantit — et ce qui rendait la scission définitive.
  update public.player_legacy_identities l
     set experience_membership_id = e_new.id,
         player_id = v_survivor
    from public.player_experience_memberships e_new
   where l.player_id = v_absorbed
     and e_new.player_id = v_survivor
     and e_new.organization_id = l.organization_id
     and e_new.experience_kind = l.experience_kind
     and e_new.experience_id = l.experience_id;

  -- ── 4. Alias ──
  -- Un seul alias par adhésion (unique sur `experience_membership_id`). Celui
  -- du survivant fait foi ; celui de l'absorbé disparaît avec son adhésion à
  -- l'étape 9. Choisir l'inverse changerait le nom affiché d'un joueur qui ne
  -- l'a pas demandé.
  update public.player_aliases a
     set experience_membership_id = e_new.id,
         player_id = v_survivor
    from public.player_experience_memberships e_new
   where a.player_id = v_absorbed
     and e_new.player_id = v_survivor
     and e_new.organization_id = a.organization_id
     and e_new.experience_kind = a.experience_kind
     and e_new.experience_id = a.experience_id
     and not exists (
       select 1 from public.player_aliases existing
        where existing.experience_membership_id = e_new.id
     );

  -- ── 5. Méta-progression : saisons ──
  -- Les clés s'ADDITIONNENT (`keys_balance`, `keys_earned`, `keys_spent` n'ont
  -- pour seule contrainte que `>= 0`, et la somme préserve
  -- balance = earned - spent si elle tenait des deux côtés). La fenêtre suit la
  -- même règle que les adhésions : plus ancienne ouverture, plus récente
  -- activité.
  insert into public.progression_player_seasons (
    season_id, organization_membership_id, player_id, organization_id,
    keys_balance, keys_earned, keys_spent, first_progress_at, last_progress_at
  )
  select
    s.season_id, som.id, v_survivor, s.organization_id,
    s.keys_balance, s.keys_earned, s.keys_spent,
    s.first_progress_at, s.last_progress_at
    from public.progression_player_seasons s
    join public.player_organization_memberships som
      on som.player_id = v_survivor
     and som.organization_id = s.organization_id
   where s.player_id = v_absorbed
  on conflict (season_id, player_id) do update set
    keys_balance = progression_player_seasons.keys_balance + excluded.keys_balance,
    keys_earned = progression_player_seasons.keys_earned + excluded.keys_earned,
    keys_spent = progression_player_seasons.keys_spent + excluded.keys_spent,
    first_progress_at = least(
      progression_player_seasons.first_progress_at, excluded.first_progress_at
    ),
    last_progress_at = greatest(
      progression_player_seasons.last_progress_at, excluded.last_progress_at
    );

  -- ── 6. Méta-progression : missions ──
  -- (a) les missions que seul l'absorbé avait entamées.
  insert into public.progression_mission_progress (
    player_season_id, mission_id, rule_version, player_id, organization_id,
    season_id, current_value, target_value, completed_at
  )
  select
    ps_new.id, mp.mission_id, mp.rule_version, v_survivor, mp.organization_id,
    mp.season_id, mp.current_value, mp.target_value, mp.completed_at
    from public.progression_mission_progress mp
    join public.progression_player_seasons ps_new
      on ps_new.player_id = v_survivor
     and ps_new.season_id = mp.season_id
   where mp.player_id = v_absorbed
  on conflict (player_season_id, mission_id) do nothing;

  -- (b) les contributions suivent, DÉDUPLIQUÉES sur `contribution_key`. C'est
  -- ce qui rend la fusion honnête sur les missions `distinct_experiences` :
  -- deux identités ayant joué LA MÊME expérience ne comptent qu'une fois, alors
  -- que deux événements distincts comptent deux fois. La règle n'est pas
  -- inventée ici, c'est celle du moteur (20260805220000).
  update public.progression_mission_contributions c
     set progress_id = mp_new.id,
         player_season_id = mp_new.player_season_id
    from public.progression_mission_progress mp_old
    join public.progression_player_seasons ps_old
      on ps_old.id = mp_old.player_season_id
    join public.progression_player_seasons ps_new
      on ps_new.season_id = ps_old.season_id
     and ps_new.player_id = v_survivor
    join public.progression_mission_progress mp_new
      on mp_new.player_season_id = ps_new.id
     and mp_new.mission_id = mp_old.mission_id
   where c.progress_id = mp_old.id
     and mp_old.player_id = v_absorbed
     and not exists (
       select 1 from public.progression_mission_contributions existing
        where existing.progress_id = mp_new.id
          and existing.contribution_key = c.contribution_key
     );

  -- (c) `current_value` est recompté depuis les contributions, parce que c'est
  -- LA définition qu'en donne le moteur : il l'incrémente d'exactement un par
  -- contribution insérée, plafonné à `target_value`. Le garde-fou
  -- `> mp.current_value` interdit à une fusion de faire RECULER une
  -- progression, quoi qu'il advienne du journal des contributions.
  update public.progression_mission_progress mp
     set current_value = least(c.total, mp.target_value),
         completed_at = case
           when least(c.total, mp.target_value) >= mp.target_value
             then coalesce(mp.completed_at, c.last_at)
           else mp.completed_at
         end,
         updated_at = pg_catalog.now()
    from (
      select con.progress_id,
             count(*) as total,
             max(con.contributed_at) as last_at
        from public.progression_mission_contributions con
       where con.progress_id in (
         select mp_s.id
           from public.progression_mission_progress mp_s
          where mp_s.player_id = v_survivor
            and mp_s.season_id in (
              select s.season_id
                from public.progression_player_seasons s
               where s.player_id = v_absorbed
            )
       )
       group by con.progress_id
    ) c
   where c.progress_id = mp.id
     and least(c.total, mp.target_value) > mp.current_value;

  -- ── 7. Méta-progression : badges, objets, coffres ──
  -- Un badge et un objet ne se possèdent qu'une fois : le doublon est écarté,
  -- pas empilé.
  update public.progression_player_badges b
     set player_season_id = ps_new.id,
         player_id = v_survivor
    from public.progression_player_seasons ps_new
   where b.player_id = v_absorbed
     and ps_new.player_id = v_survivor
     and ps_new.season_id = b.season_id
     and ps_new.organization_id = b.organization_id
     and not exists (
       select 1 from public.progression_player_badges existing
        where existing.player_season_id = ps_new.id
          and existing.badge_id = b.badge_id
     );

  update public.progression_player_items i
     set player_season_id = ps_new.id,
         player_id = v_survivor
    from public.progression_player_seasons ps_new
   where i.player_id = v_absorbed
     and ps_new.player_id = v_survivor
     and ps_new.season_id = i.season_id
     and ps_new.organization_id = i.organization_id
     and not exists (
       select 1 from public.progression_player_items existing
        where existing.player_season_id = ps_new.id
          and existing.item_id = i.item_id
     );

  -- `progression_chest_openings_request_idx` porte
  -- (player_season_id, chest_id, request_id) : `request_id` est une clé
  -- d'idempotence fournie par l'appelant, donc deux lignes qui collideraient
  -- après fusion décrivent LA MÊME ouverture vue deux fois. On écarte le
  -- doublon plutôt que de faire échouer la fusion sur un cas qui, s'il
  -- survient, n'a rien perdu.
  update public.progression_chest_openings o
     set player_season_id = ps_new.id,
         player_id = v_survivor
    from public.progression_player_seasons ps_new
   where o.player_id = v_absorbed
     and ps_new.player_id = v_survivor
     and ps_new.season_id = o.season_id
     and ps_new.organization_id = o.organization_id
     and not exists (
       select 1 from public.progression_chest_openings existing
        where existing.player_season_id = ps_new.id
          and existing.chest_id = o.chest_id
          and existing.request_id = o.request_id
     );

  -- ── 8. Ce qui se repointe sans conflit possible ──
  -- `experience_events` : `apply_meta_progression_event` se déclenche sur
  -- UPDATE OF player_id mais REND LA MAIN quand `old.player_id` n'est pas nul
  -- (20260805220000:112-114). Déplacer l'historique de l'absorbé ne rejoue donc
  -- AUCUNE progression — la progression, elle, est déplacée explicitement aux
  -- étapes 5 à 7. Sans cette garde, chaque fusion aurait rejoué tout
  -- l'historique du joueur absorbé sous le survivant.
  update public.experience_events e
     set player_id = v_survivor
   where e.player_id = v_absorbed;

  -- `reward_issuances` : ses triggers ne portent que sur INSERT et sur
  -- (redeemed_at, basket_cents). Le registre universel suit son joueur.
  update public.reward_issuances r
     set player_id = v_survivor
   where r.player_id = v_absorbed;

  -- Journal de diagnostic du moteur de progression : sans FK, mais il porte
  -- bien l'identité globale.
  update public.progression_engine_failures f
     set player_id = v_survivor
   where f.player_id = v_absorbed;

  -- Les appareils, en une seule instruction : la FK composite réflexive
  -- (replaced_by_device_id, player_id) exige que toute la chaîne de rotation
  -- change de joueur d'un bloc.
  update public.player_devices d
     set player_id = v_survivor
   where d.player_id = v_absorbed;

  -- ── 9. Ce que l'absorbé ne porte plus ──
  -- Uniquement ce qui a ÉTÉ REPRIS. Une adhésion laissée de côté à l'étape 2
  -- (expérience disparue) garde donc sa ligne d'organisation : rien n'est
  -- détruit par une cascade qu'on n'a pas voulue.
  delete from public.player_experience_memberships e
   where e.player_id = v_absorbed
     and exists (
       select 1 from public.player_experience_memberships kept
        where kept.player_id = v_survivor
          and kept.organization_id = e.organization_id
          and kept.experience_kind = e.experience_kind
          and kept.experience_id = e.experience_id
     );

  delete from public.progression_player_seasons s
   where s.player_id = v_absorbed
     and exists (
       select 1 from public.progression_player_seasons kept
        where kept.player_id = v_survivor
          and kept.season_id = s.season_id
     );

  delete from public.player_organization_memberships m
   where m.player_id = v_absorbed
     and exists (
       select 1 from public.player_organization_memberships kept
        where kept.player_id = v_survivor
          and kept.organization_id = m.organization_id
     )
     and not exists (
       select 1 from public.player_experience_memberships left_over
        where left_over.player_id = v_absorbed
          and left_over.organization_id = m.organization_id
     )
     and not exists (
       select 1 from public.progression_player_seasons left_over
        where left_over.player_id = v_absorbed
          and left_over.organization_id = m.organization_id
     );

  -- ── 10. Marquage ──
  update public.players p
     set status = 'merged',
         merged_into_player_id = v_survivor,
         merged_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where p.id = v_absorbed;

  update public.players p
     set last_seen_at = greatest(p.last_seen_at, v_absorbed_last_seen_at),
         updated_at = pg_catalog.now()
   where p.id = v_survivor;

  return v_survivor;
end;
$$;

comment on function public.merge_player_identities(uuid, uuid) is
  'Verse la SECONDE identité joueur dans la PREMIÈRE, qui survit et dont l''identifiant est rendu. Déplace appareils, adhésions, ponts legacy, alias, méta-progression, analytique et registre de récompenses ; fond les adhésions en conflit en une seule ligne. N''appelle personne et ne décide pas quand fusionner. Idempotente. Refuse deux identités nominatives : un consentement ne se transfère pas.';

-- `revoke` sur `public` AVANT le `grant`, sinon le `grant execute to public`
-- implicite de Postgres sur toute fonction neuve resterait en place et le
-- `grant` à `service_role` ne serait qu'une décoration (motif de
-- 20261117120000:337-339). Une fusion d'identités accessible à `anon` ou à un
-- commerçant serait une prise de contrôle de compte joueur.
revoke all on function public.merge_player_identities(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.merge_player_identities(uuid, uuid)
  to service_role;
